/**
 * Controlled Excel import pipeline.
 *
 * Reads an .xlsx update file, diffs it against the current SQLite state,
 * and either prints a preview or applies the changes inside a single
 * transaction (with a fresh data/app.db backup taken first).
 *
 * Used both from the CLI (scripts/import-excel-update.ts) and, optionally,
 * from a future admin route.
 *
 * Distinct from the legacy `scripts/import-excel-to-sqlite.ts`, which
 * bulk-loads the original Excel as the *initial* source of truth. This
 * pipeline treats SQLite as the truth and Excel as an update overlay.
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import ExcelJS from "exceljs";
import Database from "better-sqlite3";
import { getDb, getDbPath, transaction } from "./db";
import { ACTIVITY_STATUSES, OPERATIONAL_STATUSES, CONFIDENCE_LEVELS, RECORD_STATUSES } from "./constants";


// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Sentinel cell value that explicitly clears a SQLite field to NULL. */
export const CLEAR_MARKER = "__CLEAR__";

/** Safe Site fields the Excel update may freely change. */
const ALLOWED_SITE_FIELDS = [
  "description",
  "managing_organization",
  "operator",
  "missile_relevance",
  "launch_relevance",
  "radar_relevance",
  "confidence_level",
  "last_verified_date",
  "record_status",
  "citations",
] as const;

/**
 * Site fields that affect identity / map location / dedup. They appear in
 * the diff so the operator sees the intent, but are only WRITTEN if the
 * caller passes `allowIdentityFields=true`. Without that flag the diff
 * is recorded as a warning and the value is left untouched.
 */
const PROTECTED_SITE_FIELDS = [
  "site_name",
  "latitude",
  "longitude",
  "country",
  "state",
] as const;

const SUPPORTED_SHEETS = [
  "Sites",
  "Radars",
  "Site_Activities",
  "Sources",
  "Contacts",
  // Wholesale-apply sheets (bypass the per-row diff/wizard UI — too much
  // scope for the wizard's SiteChangeTree right now). The parser reads
  // them so they appear in ParseResult; runMultiTypeSelectiveImport
  // bulk-upserts them inside the same transaction as the diffed sheets.
  "Radar_Lifecycle",
  "Systems",
] as const;

const REQUIRED_SHEETS = ["Sites", "Radars", "Site_Activities"] as const;


// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ImportMode = "preview" | "apply";
export type EntityType = "Site" | "Radar" | "SiteRangeActivity" | "Source" | "Contact";
export type RowAction = "Create" | "Update" | "Skip" | "NoChange" | "Clear";
export type Severity = "error" | "warning";

export interface FieldDiff {
  field: string;
  oldValue: string | null;
  newValue: string | null;
  isClear: boolean;
  isProtected: boolean;
}

export interface RowDecision {
  sheetName: string;
  rowNumber: number;
  entityType: EntityType;
  entityId: string;         // for Create rows this is the generated ID
  action: RowAction;
  fields: FieldDiff[];
  errors: ValidationIssue[];
}

export interface ValidationIssue {
  sheet: string;
  row: number;
  field: string;
  value: string;
  rule: string;
  message: string;
  severity: Severity;
}

export interface ImportOptions {
  file: string;
  mode: ImportMode;
  changedBy?: string;
  /** Allow updates to site_name, latitude, longitude, country, state. */
  allowIdentityFields?: boolean;
}

export interface ImportReport {
  batchId: string;
  fileName: string;
  mode: ImportMode;
  startedAt: string;
  completedAt?: string;
  status: "Pending" | "Completed" | "Failed";
  backupPath?: string;
  errorMessage?: string;
  perSheet: Record<string, {
    create: number;
    update: number;
    skip: number;
    noChange: number;
    errors: number;
  }>;
  totals: {
    totalRows: number;
    createdCount: number;
    updatedCount: number;
    skippedCount: number;
    errorCount: number;
  };
  decisions: RowDecision[];
  issues: ValidationIssue[];
}


// ---------------------------------------------------------------------------
// Excel reader
// ---------------------------------------------------------------------------

interface RawRow {
  rowNumber: number;
  cells: Record<string, string>;     // key = lowercased header, value = raw cell text
}

function cellToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object" && value !== null) {
    const obj = value as Record<string, unknown>;
    if ("result" in obj && obj.result !== undefined && obj.result !== null) {
      return cellToString(obj.result);
    }
    if ("text" in obj && typeof obj.text === "string") return obj.text.trim();
    if ("richText" in obj && Array.isArray(obj.richText)) {
      return (obj.richText as Array<{ text?: string }>).map((p) => p.text ?? "").join("").trim();
    }
    if ("hyperlink" in obj && typeof obj.hyperlink === "string") return String(obj.hyperlink);
  }
  return String(value);
}

function readSheet(workbook: ExcelJS.Workbook, sheetName: string): {
  headers: string[];                  // lowercased trimmed
  rows: RawRow[];
} | null {
  const sheet = workbook.getWorksheet(sheetName);
  if (!sheet) return null;

  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell((cell, col) => {
    headers[col] = cellToString(cell.value).toLowerCase();
  });

  const rows: RawRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const cells: Record<string, string> = {};
    let hasValue = false;
    row.eachCell((cell, col) => {
      const key = headers[col];
      if (!key) return;
      const v = cellToString(cell.value);
      cells[key] = v;
      if (v !== "") hasValue = true;
    });
    if (hasValue) rows.push({ rowNumber, cells });
  });

  return { headers, rows };
}


// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function newBatchId(): string {
  const ts = new Date().toISOString().replace(/[-:T.]/g, "").slice(0, 14);
  return `BATCH-${ts}-${crypto.randomBytes(3).toString("hex")}`;
}

function normalizeForCompare(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

/** Validate an ISO-ish date or YYYY-MM-DD. Empty string passes. */
function isValidDateString(v: string): boolean {
  if (!v) return true;
  if (v === CLEAR_MARKER) return true;
  // accept YYYY-MM-DD or YYYY/MM/DD or ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return true;
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(v)) return true;
  const d = new Date(v);
  return !isNaN(d.getTime());
}

function nextSequentialId(db: Database.Database, prefix: string, table: string, column: string): string {
  // RAD-0001, ACT-0001, CON-0001. Find max numeric suffix and increment.
  const like = `${prefix}-%`;
  const rows = db.prepare(
    `SELECT ${column} AS id FROM ${table} WHERE ${column} LIKE ?`
  ).all(like) as Array<{ id: string }>;
  let max = 0;
  for (const r of rows) {
    const m = /-(\d+)$/.exec(r.id);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  return `${prefix}-${String(max + 1).padStart(4, "0")}`;
}


// ---------------------------------------------------------------------------
// Sheet handlers — each returns RowDecision[] for the sheet
// ---------------------------------------------------------------------------

interface SheetContext {
  db: Database.Database;
  existingSiteIds: Set<string>;
  existingRadarIds: Set<string>;
  existingActivityIds: Set<string>;
  existingSourceIds: Set<string>;
  existingContactIds: Set<string>;
  newRadarIdGen: () => string;
  newActivityIdGen: () => string;
  newContactIdGen: () => string;
  allowIdentityFields: boolean;
  /**
   * Wizard-only: when true, Sites-sheet rows with a site_id that's not in the
   * DB are classified as Create instead of Skip. The CLI flow keeps the old
   * "update-only" behaviour by leaving this false.
   */
  allowCreateSites?: boolean;
}

function diffFields(
  current: Record<string, unknown> | null,
  excel: Record<string, string>,
  allowedFields: readonly string[],
  protectedFields: readonly string[] = [],
): { diffs: FieldDiff[]; isCreate: boolean } {
  const isCreate = current === null;
  const diffs: FieldDiff[] = [];

  const considerField = (field: string, isProtected: boolean) => {
    const excelVal = excel[field];
    // Excel didn't provide the column at all — skip
    if (excelVal === undefined) return;
    const oldVal = current ? normalizeForCompare(current[field]) : "";
    const isClear = excelVal === CLEAR_MARKER;
    // Empty cell on existing row: preserve, do not overwrite (except CLEAR)
    if (!isCreate && excelVal === "" && !isClear) return;
    const newVal = isClear ? null : (excelVal === "" ? null : excelVal);
    const newCompare = newVal === null ? "" : String(newVal);
    if (newCompare === oldVal && !isClear) return;
    diffs.push({
      field,
      oldValue: current ? (oldVal === "" ? null : oldVal) : null,
      newValue: newVal,
      isClear,
      isProtected,
    });
  };

  for (const f of allowedFields) considerField(f, false);
  for (const f of protectedFields) considerField(f, true);

  return { diffs, isCreate };
}


function handleSitesSheet(rows: RawRow[], ctx: SheetContext): RowDecision[] {
  const out: RowDecision[] = [];
  for (const row of rows) {
    const decision: RowDecision = {
      sheetName: "Sites",
      rowNumber: row.rowNumber,
      entityType: "Site",
      entityId: "",
      action: "NoChange",
      fields: [],
      errors: [],
    };
    const siteId = row.cells["site_id"];
    if (!siteId) {
      decision.action = "Skip";
      decision.errors.push({
        sheet: "Sites", row: row.rowNumber, field: "site_id", value: "",
        rule: "required", message: "site_id is required to update a Site row.", severity: "error",
      });
      out.push(decision);
      continue;
    }
    decision.entityId = siteId;

    // When the wizard's allowCreateSites flag is OFF, the Sites sheet is
    // update-only and unknown site_ids are skipped with an error. When the
    // flag is ON, an unknown site_id is treated as a Create — the site row
    // is inserted, and downstream radar/activity/contact rows that reference
    // it can land in the same batch.
    const existingRow = ctx.db.prepare("SELECT * FROM sites WHERE site_id = ?").get(siteId) as Record<string, unknown> | undefined;
    if (!existingRow && !ctx.allowCreateSites) {
      decision.action = "Skip";
      decision.errors.push({
        sheet: "Sites", row: row.rowNumber, field: "site_id", value: siteId,
        rule: "not_found",
        message: `site_id "${siteId}" does not exist. Use the bulk db:import flow to create new sites.`,
        severity: "error",
      });
      out.push(decision);
      continue;
    }
    const isCreate = !existingRow;

    if (isCreate) {
      // Minimum viable new-site row: site_name required, the rest may be blank.
      if (!row.cells["site_name"]) {
        decision.action = "Skip";
        decision.errors.push({
          sheet: "Sites", row: row.rowNumber, field: "site_name", value: "",
          rule: "required",
          message: "site_name is required when creating a new site.",
          severity: "error",
        });
        out.push(decision);
        continue;
      }
    }

    const { diffs } = diffFields(existingRow ?? null, row.cells, ALLOWED_SITE_FIELDS, PROTECTED_SITE_FIELDS);

    // Validate enum-bounded fields where present
    if (row.cells["confidence_level"] && row.cells["confidence_level"] !== CLEAR_MARKER
        && !CONFIDENCE_LEVELS.includes(row.cells["confidence_level"] as typeof CONFIDENCE_LEVELS[number])) {
      decision.errors.push({
        sheet: "Sites", row: row.rowNumber, field: "confidence_level",
        value: row.cells["confidence_level"], rule: "invalid_enum",
        message: `confidence_level must be one of ${CONFIDENCE_LEVELS.join(", ")}.`,
        severity: "error",
      });
    }
    if (row.cells["record_status"] && row.cells["record_status"] !== CLEAR_MARKER
        && !RECORD_STATUSES.includes(row.cells["record_status"] as typeof RECORD_STATUSES[number])) {
      decision.errors.push({
        sheet: "Sites", row: row.rowNumber, field: "record_status",
        value: row.cells["record_status"], rule: "invalid_enum",
        message: `record_status must be one of ${RECORD_STATUSES.join(", ")}.`,
        severity: "error",
      });
    }
    if (row.cells["last_verified_date"] && !isValidDateString(row.cells["last_verified_date"])) {
      decision.errors.push({
        sheet: "Sites", row: row.rowNumber, field: "last_verified_date",
        value: row.cells["last_verified_date"], rule: "invalid_date",
        message: "last_verified_date is not a valid date.",
        severity: "error",
      });
    }

    // Surface protected-field diffs as warnings if not allowed
    if (!ctx.allowIdentityFields) {
      for (const d of diffs.filter((d) => d.isProtected)) {
        decision.errors.push({
          sheet: "Sites", row: row.rowNumber, field: d.field,
          value: d.newValue ?? "(clear)", rule: "protected_field",
          message: `Field "${d.field}" affects identity/location and is not changed without --allow-identity-fields. Existing value preserved.`,
          severity: "warning",
        });
      }
    }

    // For a new site, identity fields ARE writeable regardless of the
    // allowIdentityFields flag — the flag only protects identity edits on
    // existing rows, not the initial insert.
    const applicableDiffs = (ctx.allowIdentityFields || isCreate)
      ? diffs
      : diffs.filter((d) => !d.isProtected);

    decision.fields = applicableDiffs;
    if (decision.errors.some((e) => e.severity === "error")) {
      decision.action = "Skip";
    } else if (isCreate) {
      decision.action = "Create";
      // Make sure site_name is in the diff set even if the field comparator
      // didn't surface it (it always will, but belt-and-suspenders).
    } else if (applicableDiffs.length === 0) {
      decision.action = "NoChange";
    } else {
      decision.action = "Update";
    }
    out.push(decision);
  }
  return out;
}


function handleRadarsSheet(rows: RawRow[], ctx: SheetContext): RowDecision[] {
  const out: RowDecision[] = [];
  const seenIds = new Set<string>();

  // All radar columns the schema knows about; we accept any of them from Excel
  const RADAR_FIELDS = [
    "site_id", "radar_name", "radar_model", "radar_type", "frequency_band",
    "purpose", "owner", "operator", "manufacturer",
    "installation_date", "upgrade_date", "fix_date",
    "operational_status", "public_description", "confidence_level",
    "last_verified_date", "source_id", "record_status", "citations",
  ] as const;

  for (const row of rows) {
    const decision: RowDecision = {
      sheetName: "Radars",
      rowNumber: row.rowNumber,
      entityType: "Radar",
      entityId: "",
      action: "NoChange",
      fields: [],
      errors: [],
    };
    let radarId = row.cells["radar_id"] ?? "";
    const siteId = row.cells["site_id"] ?? "";

    if (radarId && seenIds.has(radarId)) {
      decision.action = "Skip";
      decision.entityId = radarId;
      decision.errors.push({
        sheet: "Radars", row: row.rowNumber, field: "radar_id", value: radarId,
        rule: "duplicate", message: `Duplicate radar_id "${radarId}" inside the Excel file.`,
        severity: "error",
      });
      out.push(decision);
      continue;
    }
    if (radarId) seenIds.add(radarId);

    const existingRow = radarId
      ? (ctx.db.prepare("SELECT * FROM radars WHERE radar_id = ?").get(radarId) as Record<string, unknown> | undefined)
      : undefined;

    const isCreate = !existingRow;

    if (isCreate) {
      // For new radars, site_id must exist
      if (!siteId) {
        decision.action = "Skip";
        decision.errors.push({
          sheet: "Radars", row: row.rowNumber, field: "site_id", value: "",
          rule: "required", message: "site_id is required to insert a new Radar.", severity: "error",
        });
        out.push(decision);
        continue;
      }
      if (!ctx.existingSiteIds.has(siteId)) {
        decision.action = "Skip";
        decision.errors.push({
          sheet: "Radars", row: row.rowNumber, field: "site_id", value: siteId,
          rule: "fk_violation", message: `site_id "${siteId}" does not exist in SQLite.`,
          severity: "error",
        });
        out.push(decision);
        continue;
      }
      const radarName = row.cells["radar_name"] ?? "";
      const radarType = row.cells["radar_type"] ?? "";
      if (!radarName && !radarType) {
        decision.action = "Skip";
        decision.errors.push({
          sheet: "Radars", row: row.rowNumber, field: "radar_name", value: "",
          rule: "required",
          message: "New Radar row needs at least radar_name or radar_type.",
          severity: "error",
        });
        out.push(decision);
        continue;
      }
      if (!radarId) {
        radarId = ctx.newRadarIdGen();
      }
    }

    decision.entityId = radarId;

    // operational_status validation when provided
    const opStatus = row.cells["operational_status"];
    if (opStatus && opStatus !== CLEAR_MARKER
        && !OPERATIONAL_STATUSES.includes(opStatus as typeof OPERATIONAL_STATUSES[number])) {
      decision.errors.push({
        sheet: "Radars", row: row.rowNumber, field: "operational_status",
        value: opStatus, rule: "invalid_enum",
        message: `operational_status must be one of ${OPERATIONAL_STATUSES.join(", ")}.`,
        severity: "error",
      });
    }
    for (const df of ["installation_date", "upgrade_date", "fix_date", "last_verified_date"]) {
      if (row.cells[df] && !isValidDateString(row.cells[df])) {
        decision.errors.push({
          sheet: "Radars", row: row.rowNumber, field: df, value: row.cells[df],
          rule: "invalid_date", message: `${df} is not a valid date.`,
          severity: "error",
        });
      }
    }

    if (isCreate) {
      // Compose the create row with every non-empty/CLEAR Excel field
      const diffs: FieldDiff[] = [];
      for (const f of RADAR_FIELDS) {
        const v = row.cells[f];
        if (v === undefined || v === "") continue;
        const isClear = v === CLEAR_MARKER;
        diffs.push({ field: f, oldValue: null, newValue: isClear ? null : v, isClear, isProtected: false });
      }
      decision.fields = diffs;
      decision.action = decision.errors.some((e) => e.severity === "error") ? "Skip" : "Create";
    } else {
      const { diffs } = diffFields(existingRow!, row.cells, RADAR_FIELDS, []);
      decision.fields = diffs;
      if (decision.errors.some((e) => e.severity === "error")) {
        decision.action = "Skip";
      } else if (diffs.length === 0) {
        decision.action = "NoChange";
      } else {
        decision.action = "Update";
      }
    }
    out.push(decision);
  }
  return out;
}


function handleSiteActivitiesSheet(rows: RawRow[], ctx: SheetContext): RowDecision[] {
  const out: RowDecision[] = [];
  const seenIds = new Set<string>();

  const ACTIVITY_FIELDS = [
    "site_id", "activity_category", "activity_description",
    "missile_or_system_type", "start_year", "end_year",
    "status", "source_id", "confidence_level",
  ] as const;

  for (const row of rows) {
    const decision: RowDecision = {
      sheetName: "Site_Activities",
      rowNumber: row.rowNumber,
      entityType: "SiteRangeActivity",
      entityId: "",
      action: "NoChange",
      fields: [],
      errors: [],
    };
    let activityId = row.cells["activity_id"] ?? "";
    const siteId = row.cells["site_id"] ?? "";

    if (activityId && seenIds.has(activityId)) {
      decision.action = "Skip";
      decision.entityId = activityId;
      decision.errors.push({
        sheet: "Site_Activities", row: row.rowNumber, field: "activity_id",
        value: activityId, rule: "duplicate",
        message: `Duplicate activity_id "${activityId}" inside the Excel file.`,
        severity: "error",
      });
      out.push(decision);
      continue;
    }
    if (activityId) seenIds.add(activityId);

    const existingRow = activityId
      ? (ctx.db.prepare("SELECT * FROM site_range_activities WHERE activity_id = ?").get(activityId) as Record<string, unknown> | undefined)
      : undefined;
    const isCreate = !existingRow;

    if (isCreate) {
      if (!siteId) {
        decision.action = "Skip";
        decision.errors.push({
          sheet: "Site_Activities", row: row.rowNumber, field: "site_id", value: "",
          rule: "required", message: "site_id is required to insert a new operational activity.",
          severity: "error",
        });
        out.push(decision);
        continue;
      }
      if (!ctx.existingSiteIds.has(siteId)) {
        decision.action = "Skip";
        decision.errors.push({
          sheet: "Site_Activities", row: row.rowNumber, field: "site_id", value: siteId,
          rule: "fk_violation", message: `site_id "${siteId}" does not exist in SQLite.`,
          severity: "error",
        });
        out.push(decision);
        continue;
      }
      const cat = row.cells["activity_category"] ?? "";
      const desc = row.cells["activity_description"] ?? "";
      if (!cat && !desc) {
        decision.action = "Skip";
        decision.errors.push({
          sheet: "Site_Activities", row: row.rowNumber, field: "activity_category",
          value: "", rule: "required",
          message: "New activity row needs activity_category or activity_description.",
          severity: "error",
        });
        out.push(decision);
        continue;
      }
      if (!activityId) activityId = ctx.newActivityIdGen();
    }

    decision.entityId = activityId;

    const status = row.cells["status"];
    if (status && status !== CLEAR_MARKER
        && !ACTIVITY_STATUSES.includes(status as typeof ACTIVITY_STATUSES[number])) {
      decision.errors.push({
        sheet: "Site_Activities", row: row.rowNumber, field: "status",
        value: status, rule: "invalid_enum",
        message: `status must be one of ${ACTIVITY_STATUSES.join(", ")}.`,
        severity: "error",
      });
    }
    for (const yf of ["start_year", "end_year"]) {
      const v = row.cells[yf];
      if (v && v !== CLEAR_MARKER) {
        const n = Number(v);
        if (!Number.isInteger(n) || n < 1900 || n > 2100) {
          decision.errors.push({
            sheet: "Site_Activities", row: row.rowNumber, field: yf,
            value: v, rule: "invalid_year",
            message: `${yf} must be an integer between 1900 and 2100.`,
            severity: "error",
          });
        }
      }
    }

    if (isCreate) {
      const diffs: FieldDiff[] = [];
      for (const f of ACTIVITY_FIELDS) {
        const v = row.cells[f];
        if (v === undefined || v === "") continue;
        const isClear = v === CLEAR_MARKER;
        diffs.push({ field: f, oldValue: null, newValue: isClear ? null : v, isClear, isProtected: false });
      }
      decision.fields = diffs;
      decision.action = decision.errors.some((e) => e.severity === "error") ? "Skip" : "Create";
    } else {
      const { diffs } = diffFields(existingRow!, row.cells, ACTIVITY_FIELDS, []);
      decision.fields = diffs;
      if (decision.errors.some((e) => e.severity === "error")) {
        decision.action = "Skip";
      } else if (diffs.length === 0) {
        decision.action = "NoChange";
      } else {
        decision.action = "Update";
      }
    }
    out.push(decision);
  }
  return out;
}


function handleSourcesSheet(rows: RawRow[], ctx: SheetContext): RowDecision[] {
  const out: RowDecision[] = [];
  const SOURCE_FIELDS = [
    "source_title", "source_url", "source_type", "publisher",
    "publication_date", "access_date", "reliability_score", "notes", "notebook_uuid",
  ] as const;

  for (const row of rows) {
    const decision: RowDecision = {
      sheetName: "Sources",
      rowNumber: row.rowNumber,
      entityType: "Source",
      entityId: "",
      action: "NoChange",
      fields: [],
      errors: [],
    };
    const sourceId = row.cells["source_id"] ?? "";
    if (!sourceId) {
      decision.action = "Skip";
      decision.errors.push({
        sheet: "Sources", row: row.rowNumber, field: "source_id", value: "",
        rule: "required", message: "source_id is required.", severity: "error",
      });
      out.push(decision);
      continue;
    }
    decision.entityId = sourceId;

    const existing = ctx.db.prepare("SELECT * FROM sources WHERE source_id = ?").get(sourceId) as Record<string, unknown> | undefined;
    if (!existing) {
      // Create
      const diffs: FieldDiff[] = [];
      for (const f of SOURCE_FIELDS) {
        const v = row.cells[f];
        if (v === undefined || v === "") continue;
        const isClear = v === CLEAR_MARKER;
        diffs.push({ field: f, oldValue: null, newValue: isClear ? null : v, isClear, isProtected: false });
      }
      decision.fields = diffs;
      decision.action = "Create";
    } else {
      const { diffs } = diffFields(existing, row.cells, SOURCE_FIELDS, []);
      decision.fields = diffs;
      decision.action = diffs.length === 0 ? "NoChange" : "Update";
    }
    out.push(decision);
  }
  return out;
}


function handleContactsSheet(rows: RawRow[], ctx: SheetContext): RowDecision[] {
  const out: RowDecision[] = [];
  const CONTACT_FIELDS = [
    "site_id", "organization_name", "contact_type",
    "contact_email", "contact_phone", "contact_url", "notes", "source_id",
  ] as const;

  for (const row of rows) {
    const decision: RowDecision = {
      sheetName: "Contacts",
      rowNumber: row.rowNumber,
      entityType: "Contact",
      entityId: "",
      action: "NoChange",
      fields: [],
      errors: [],
    };
    let contactId = row.cells["contact_id"] ?? "";
    const siteId = row.cells["site_id"] ?? "";

    const existing = contactId
      ? (ctx.db.prepare("SELECT * FROM contacts WHERE contact_id = ?").get(contactId) as Record<string, unknown> | undefined)
      : undefined;
    const isCreate = !existing;

    if (isCreate) {
      if (!siteId) {
        decision.action = "Skip";
        decision.errors.push({
          sheet: "Contacts", row: row.rowNumber, field: "site_id", value: "",
          rule: "required", message: "site_id is required to insert a new contact.",
          severity: "error",
        });
        out.push(decision);
        continue;
      }
      if (!ctx.existingSiteIds.has(siteId)) {
        decision.action = "Skip";
        decision.errors.push({
          sheet: "Contacts", row: row.rowNumber, field: "site_id", value: siteId,
          rule: "fk_violation", message: `site_id "${siteId}" does not exist in SQLite.`,
          severity: "error",
        });
        out.push(decision);
        continue;
      }
      if (!contactId) contactId = ctx.newContactIdGen();
    }

    decision.entityId = contactId;

    if (isCreate) {
      const diffs: FieldDiff[] = [];
      for (const f of CONTACT_FIELDS) {
        const v = row.cells[f];
        if (v === undefined || v === "") continue;
        const isClear = v === CLEAR_MARKER;
        diffs.push({ field: f, oldValue: null, newValue: isClear ? null : v, isClear, isProtected: false });
      }
      decision.fields = diffs;
      decision.action = "Create";
    } else {
      const { diffs } = diffFields(existing, row.cells, CONTACT_FIELDS, []);
      decision.fields = diffs;
      decision.action = diffs.length === 0 ? "NoChange" : "Update";
    }
    out.push(decision);
  }
  return out;
}


// ---------------------------------------------------------------------------
// Apply writer — runs inside a SQLite transaction
// ---------------------------------------------------------------------------

function applyDecisions(
  db: Database.Database,
  decisions: RowDecision[],
  batchId: string,
  changedBy: string,
): { updated: number; created: number; cleared: number } {
  let updated = 0;
  let created = 0;
  let cleared = 0;

  const insAudit = db.prepare(`
    INSERT INTO audit_log
      (entity_type, entity_id, action, field_name, old_value, new_value, changed_by, import_batch_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const d of decisions) {
    if (d.action !== "Create" && d.action !== "Update") continue;

    // Build SQL by entity type
    if (d.entityType === "Site") {
      if (d.action === "Create") {
        // Wizard "create new site" branch. Insert with the site_id given
        // in Excel and whatever fields the operator provided.
        const cols = ["site_id"];
        const vals: unknown[] = [d.entityId];
        for (const f of d.fields) {
          cols.push(f.field);
          vals.push(coerceForSqlite(f.field, f.newValue));
        }
        const placeholders = cols.map(() => "?").join(",");
        db.prepare(`INSERT INTO sites (${cols.join(",")}) VALUES (${placeholders})`).run(...vals);
        created++;
        insAudit.run(
          "Site", d.entityId, "Create", null, null,
          JSON.stringify(Object.fromEntries(d.fields.map((f) => [f.field, f.newValue]))),
          changedBy, batchId,
        );
        continue;
      }
      const updates: string[] = [];
      const params: unknown[] = [];
      for (const f of d.fields) {
        updates.push(`${f.field} = ?`);
        params.push(f.newValue);
        insAudit.run(
          "Site", d.entityId, f.isClear ? "Clear" : "Update", f.field,
          f.oldValue, f.newValue, changedBy, batchId,
        );
        if (f.isClear) cleared++;
      }
      if (updates.length > 0) {
        updates.push("updated_at = CURRENT_TIMESTAMP");
        params.push(d.entityId);
        db.prepare(`UPDATE sites SET ${updates.join(", ")} WHERE site_id = ?`).run(...params);
        updated++;
      }
    }

    else if (d.entityType === "Radar") {
      if (d.action === "Create") {
        const cols = ["radar_id"];
        const vals: unknown[] = [d.entityId];
        for (const f of d.fields) {
          cols.push(f.field);
          vals.push(f.newValue);
        }
        const placeholders = cols.map(() => "?").join(",");
        db.prepare(`INSERT INTO radars (${cols.join(",")}) VALUES (${placeholders})`).run(...vals);
        created++;
        insAudit.run("Radar", d.entityId, "Create", null, null,
          JSON.stringify(Object.fromEntries(d.fields.map((f) => [f.field, f.newValue]))),
          changedBy, batchId);
      } else {
        const updates: string[] = [];
        const params: unknown[] = [];
        for (const f of d.fields) {
          updates.push(`${f.field} = ?`);
          params.push(f.newValue);
          insAudit.run("Radar", d.entityId, f.isClear ? "Clear" : "Update", f.field,
            f.oldValue, f.newValue, changedBy, batchId);
          if (f.isClear) cleared++;
        }
        if (updates.length > 0) {
          params.push(d.entityId);
          db.prepare(`UPDATE radars SET ${updates.join(", ")} WHERE radar_id = ?`).run(...params);
          updated++;
        }
      }
    }

    else if (d.entityType === "SiteRangeActivity") {
      if (d.action === "Create") {
        const cols = ["activity_id"];
        const vals: unknown[] = [d.entityId];
        for (const f of d.fields) {
          cols.push(f.field);
          vals.push(coerceForSqlite(f.field, f.newValue));
        }
        const placeholders = cols.map(() => "?").join(",");
        db.prepare(`INSERT INTO site_range_activities (${cols.join(",")}) VALUES (${placeholders})`).run(...vals);
        created++;
        insAudit.run("SiteRangeActivity", d.entityId, "Create", null, null,
          JSON.stringify(Object.fromEntries(d.fields.map((f) => [f.field, f.newValue]))),
          changedBy, batchId);
      } else {
        const updates: string[] = [];
        const params: unknown[] = [];
        for (const f of d.fields) {
          updates.push(`${f.field} = ?`);
          params.push(coerceForSqlite(f.field, f.newValue));
          insAudit.run("SiteRangeActivity", d.entityId, f.isClear ? "Clear" : "Update", f.field,
            f.oldValue, f.newValue, changedBy, batchId);
          if (f.isClear) cleared++;
        }
        if (updates.length > 0) {
          updates.push("updated_at = CURRENT_TIMESTAMP");
          params.push(d.entityId);
          db.prepare(`UPDATE site_range_activities SET ${updates.join(", ")} WHERE activity_id = ?`).run(...params);
          updated++;
        }
      }
    }

    else if (d.entityType === "Source") {
      if (d.action === "Create") {
        const cols = ["source_id"];
        const vals: unknown[] = [d.entityId];
        for (const f of d.fields) {
          cols.push(f.field);
          vals.push(coerceForSqlite(f.field, f.newValue));
        }
        const placeholders = cols.map(() => "?").join(",");
        db.prepare(`INSERT INTO sources (${cols.join(",")}) VALUES (${placeholders})`).run(...vals);
        created++;
        insAudit.run("Source", d.entityId, "Create", null, null,
          JSON.stringify(Object.fromEntries(d.fields.map((f) => [f.field, f.newValue]))),
          changedBy, batchId);
      } else {
        const updates: string[] = [];
        const params: unknown[] = [];
        for (const f of d.fields) {
          updates.push(`${f.field} = ?`);
          params.push(coerceForSqlite(f.field, f.newValue));
          insAudit.run("Source", d.entityId, f.isClear ? "Clear" : "Update", f.field,
            f.oldValue, f.newValue, changedBy, batchId);
          if (f.isClear) cleared++;
        }
        if (updates.length > 0) {
          params.push(d.entityId);
          db.prepare(`UPDATE sources SET ${updates.join(", ")} WHERE source_id = ?`).run(...params);
          updated++;
        }
      }
    }

    else if (d.entityType === "Contact") {
      if (d.action === "Create") {
        const cols = ["contact_id"];
        const vals: unknown[] = [d.entityId];
        for (const f of d.fields) {
          cols.push(f.field);
          vals.push(f.newValue);
        }
        const placeholders = cols.map(() => "?").join(",");
        db.prepare(`INSERT INTO contacts (${cols.join(",")}) VALUES (${placeholders})`).run(...vals);
        created++;
        insAudit.run("Contact", d.entityId, "Create", null, null,
          JSON.stringify(Object.fromEntries(d.fields.map((f) => [f.field, f.newValue]))),
          changedBy, batchId);
      } else {
        const updates: string[] = [];
        const params: unknown[] = [];
        for (const f of d.fields) {
          updates.push(`${f.field} = ?`);
          params.push(f.newValue);
          insAudit.run("Contact", d.entityId, f.isClear ? "Clear" : "Update", f.field,
            f.oldValue, f.newValue, changedBy, batchId);
          if (f.isClear) cleared++;
        }
        if (updates.length > 0) {
          params.push(d.entityId);
          db.prepare(`UPDATE contacts SET ${updates.join(", ")} WHERE contact_id = ?`).run(...params);
          updated++;
        }
      }
    }
  }

  return { created, updated, cleared };
}


/** Cast numeric Excel strings to numbers for known numeric columns. */
function coerceForSqlite(field: string, value: string | null): unknown {
  if (value === null) return null;
  if (field === "start_year" || field === "end_year" || field === "reliability_score") {
    const n = Number(value);
    return Number.isFinite(n) ? Math.trunc(n) : null;
  }
  if (field === "latitude" || field === "longitude") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return value;
}


// ---------------------------------------------------------------------------
// Backup
// ---------------------------------------------------------------------------

export function backupDatabase(): string {
  const dbPath = getDbPath();
  if (!fs.existsSync(dbPath)) {
    throw new Error(`Cannot back up: SQLite database does not exist at ${dbPath}`);
  }
  const backupDir = path.join(process.cwd(), "backups");
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:T]/g, "").replace(/\..+/, "");
  const dest = path.join(backupDir, `app_${stamp}.db`);
  fs.copyFileSync(dbPath, dest);
  return path.relative(process.cwd(), dest);
}


// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export async function runImport(opts: ImportOptions): Promise<ImportReport> {
  if (!fs.existsSync(opts.file)) {
    throw new Error(`Excel file not found: ${opts.file}`);
  }

  const batchId = newBatchId();
  const fileName = path.basename(opts.file);
  const startedAt = new Date().toISOString();

  const report: ImportReport = {
    batchId,
    fileName,
    mode: opts.mode,
    startedAt,
    status: "Pending",
    perSheet: {},
    totals: { totalRows: 0, createdCount: 0, updatedCount: 0, skippedCount: 0, errorCount: 0 },
    decisions: [],
    issues: [],
  };

  // Load workbook
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(opts.file);

  // Validate required sheets
  const sheetNames = wb.worksheets.map((w) => w.name);
  for (const required of REQUIRED_SHEETS) {
    if (!sheetNames.includes(required)) {
      report.issues.push({
        sheet: required, row: 0, field: "", value: "",
        rule: "missing_sheet", message: `Required sheet "${required}" not found in Excel file.`,
        severity: "error",
      });
    }
  }
  if (report.issues.some((i) => i.severity === "error")) {
    report.status = "Failed";
    report.errorMessage = "Required sheet(s) missing.";
    report.completedAt = new Date().toISOString();
    persistBatch(report);
    return report;
  }

  // Required columns
  const required: Record<string, string[]> = {
    Sites: ["site_id", "description"],
    Radars: ["radar_id", "site_id", "radar_name", "radar_type"],
    Site_Activities: ["activity_id", "site_id", "activity_category", "activity_description"],
  };
  const sheetData: Partial<Record<string, { headers: string[]; rows: RawRow[] }>> = {};
  for (const sheet of SUPPORTED_SHEETS) {
    const d = readSheet(wb, sheet);
    if (d) sheetData[sheet] = d;
  }
  for (const [sheet, cols] of Object.entries(required)) {
    const sd = sheetData[sheet];
    if (!sd) continue;
    for (const col of cols) {
      if (!sd.headers.includes(col)) {
        report.issues.push({
          sheet, row: 1, field: col, value: "",
          rule: "missing_column",
          message: `Sheet "${sheet}" is missing required column "${col}".`,
          severity: "error",
        });
      }
    }
  }
  if (report.issues.some((i) => i.severity === "error" && i.rule === "missing_column")) {
    report.status = "Failed";
    report.errorMessage = "Required column(s) missing.";
    report.completedAt = new Date().toISOString();
    persistBatch(report);
    return report;
  }

  const db = getDb();
  const ctx: SheetContext = {
    db,
    existingSiteIds: new Set((db.prepare("SELECT site_id FROM sites").all() as { site_id: string }[]).map((r) => r.site_id)),
    existingRadarIds: new Set((db.prepare("SELECT radar_id FROM radars").all() as { radar_id: string }[]).map((r) => r.radar_id)),
    existingActivityIds: new Set((db.prepare("SELECT activity_id FROM site_range_activities WHERE activity_id IS NOT NULL").all() as { activity_id: string }[]).map((r) => r.activity_id)),
    existingSourceIds: new Set((db.prepare("SELECT source_id FROM sources").all() as { source_id: string }[]).map((r) => r.source_id)),
    existingContactIds: new Set((db.prepare("SELECT contact_id FROM contacts").all() as { contact_id: string }[]).map((r) => r.contact_id)),
    newRadarIdGen: () => nextSequentialId(db, "RAD", "radars", "radar_id"),
    newActivityIdGen: () => nextSequentialId(db, "ACT", "site_range_activities", "activity_id"),
    newContactIdGen: () => nextSequentialId(db, "CON", "contacts", "contact_id"),
    allowIdentityFields: !!opts.allowIdentityFields,
  };

  // Counters need to track id generation across rows so we don't issue the
  // same generated ID twice in one batch.
  let radarSeq = ctx.newRadarIdGen;
  let activitySeq = ctx.newActivityIdGen;
  let contactSeq = ctx.newContactIdGen;
  const dispensedRadars = new Set<string>();
  const dispensedActivities = new Set<string>();
  const dispensedContacts = new Set<string>();
  ctx.newRadarIdGen = () => {
    let id = radarSeq();
    while (dispensedRadars.has(id)) id = nextAfter(id);
    dispensedRadars.add(id);
    return id;
  };
  ctx.newActivityIdGen = () => {
    let id = activitySeq();
    while (dispensedActivities.has(id)) id = nextAfter(id);
    dispensedActivities.add(id);
    return id;
  };
  ctx.newContactIdGen = () => {
    let id = contactSeq();
    while (dispensedContacts.has(id)) id = nextAfter(id);
    dispensedContacts.add(id);
    return id;
  };

  // Process each sheet (Sites first → its existing IDs are already cached)
  const processOrder: Array<{ sheet: string; handler: (rows: RawRow[], c: SheetContext) => RowDecision[] }> = [
    { sheet: "Sites", handler: handleSitesSheet },
    { sheet: "Sources", handler: handleSourcesSheet },
    { sheet: "Radars", handler: handleRadarsSheet },
    { sheet: "Site_Activities", handler: handleSiteActivitiesSheet },
    { sheet: "Contacts", handler: handleContactsSheet },
  ];

  for (const { sheet, handler } of processOrder) {
    const sd = sheetData[sheet];
    if (!sd) {
      report.perSheet[sheet] = { create: 0, update: 0, skip: 0, noChange: 0, errors: 0 };
      continue;
    }
    const decisions = handler(sd.rows, ctx);
    report.decisions.push(...decisions);
    for (const d of decisions) report.issues.push(...d.errors);

    const sum = { create: 0, update: 0, skip: 0, noChange: 0, errors: 0 };
    for (const d of decisions) {
      if (d.action === "Create") sum.create++;
      else if (d.action === "Update") sum.update++;
      else if (d.action === "Skip") sum.skip++;
      else if (d.action === "NoChange") sum.noChange++;
      sum.errors += d.errors.filter((e) => e.severity === "error").length;
    }
    report.perSheet[sheet] = sum;
    report.totals.totalRows += decisions.length;
    report.totals.createdCount += sum.create;
    report.totals.updatedCount += sum.update;
    report.totals.skippedCount += sum.skip;
    report.totals.errorCount += sum.errors;
  }

  if (opts.mode === "preview") {
    report.status = "Completed";
    report.completedAt = new Date().toISOString();
    persistBatch(report);
    return report;
  }

  // APPLY mode: backup, then transactional write
  try {
    report.backupPath = backupDatabase();
  } catch (err) {
    report.status = "Failed";
    report.errorMessage = `Backup failed: ${(err as Error).message}`;
    report.completedAt = new Date().toISOString();
    persistBatch(report);
    return report;
  }

  try {
    transaction((txDb) => {
      applyDecisions(txDb, report.decisions, batchId, opts.changedBy || "import");
    });
    report.status = "Completed";
  } catch (err) {
    report.status = "Failed";
    report.errorMessage = `Apply failed (transaction rolled back): ${(err as Error).message}`;
  }
  report.completedAt = new Date().toISOString();
  persistBatch(report);
  return report;
}


function nextAfter(id: string): string {
  const m = /^(.*-)(\d+)$/.exec(id);
  if (!m) return id;
  const n = parseInt(m[2], 10) + 1;
  return `${m[1]}${String(n).padStart(m[2].length, "0")}`;
}


function persistBatch(report: ImportReport): void {
  try {
    const db = getDb();
    db.prepare(`
      INSERT INTO import_batches
        (id, file_name, mode, status, started_at, completed_at,
         total_rows, created_count, updated_count, skipped_count, error_count,
         backup_path, summary)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      report.batchId,
      report.fileName,
      report.mode,
      report.status,
      report.startedAt,
      report.completedAt ?? null,
      report.totals.totalRows,
      report.totals.createdCount,
      report.totals.updatedCount,
      report.totals.skippedCount,
      report.totals.errorCount,
      report.backupPath ?? null,
      report.errorMessage ?? null,
    );
    const insIssue = db.prepare(`
      INSERT INTO import_validation_errors
        (import_batch_id, sheet_name, row_number, field_name, value, rule, message, severity)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const i of report.issues) {
      insIssue.run(report.batchId, i.sheet, i.row, i.field, i.value, i.rule, i.message, i.severity);
    }
  } catch (err) {
    console.warn("Failed to persist import batch metadata:", (err as Error).message);
  }
}


/** Write the report as JSON to imports/previews/preview_<batchId>.json. */
export function writePreviewFile(report: ImportReport): string {
  const dir = path.join(process.cwd(), "imports", "previews");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, `preview_${report.batchId}.json`);
  fs.writeFileSync(dest, JSON.stringify(report, null, 2), "utf8");
  return path.relative(process.cwd(), dest);
}


// ===========================================================================
//
//  Selective import (the "ייבוא נתונים" wizard)
//
//  The CLI flow above applies *every* row of every supported sheet. The
//  wizard, by contrast, lets the operator import only specific Sites,
//  Radars, or Site Range Activities they tick in the UI. The Sources sheet
//  is filtered to only the source_ids referenced by the selected entity
//  rows; conflicts on those Sources are surfaced for the operator to
//  resolve (default: create a brand new source_id rather than overwrite).
//
// ===========================================================================

export type ImportType = "sites" | "radars" | "site_range_activities" | "contacts";

export type SourceResolutionDecision =
  | "REUSE_EXISTING"
  | "CREATE_NEW"
  | "CONFLICT_REQUIRES_USER_DECISION";

export interface ParsedRow {
  rowNumber: number;
  key: string;
  cells: Record<string, string>;
}

export interface ParsedSheet {
  headers: string[];
  rows: ParsedRow[];
}

export interface ParseResult {
  fileName: string;
  sheets: Partial<Record<typeof SUPPORTED_SHEETS[number], ParsedSheet>>;
  issues: ValidationIssue[];
}

/**
 * Parse the workbook and return rows suitable for displaying in the
 * selection table. Does not touch SQLite. Validates required sheets and
 * required columns; non-fatal column issues become warnings.
 */
export async function parseExcelForSelection(
  buffer: ArrayBuffer | Buffer,
  fileName: string,
): Promise<ParseResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as ArrayBuffer);
  const result: ParseResult = { fileName, sheets: {}, issues: [] };

  const sheetNames = wb.worksheets.map((w) => w.name);
  for (const req of REQUIRED_SHEETS) {
    if (!sheetNames.includes(req)) {
      result.issues.push({
        sheet: req, row: 0, field: "", value: "",
        rule: "missing_sheet",
        message: `Required sheet "${req}" is missing from the workbook.`,
        severity: "error",
      });
    }
  }
  if (result.issues.some((i) => i.severity === "error" && i.rule === "missing_sheet")) {
    return result;
  }

  const requiredColumns: Record<string, string[]> = {
    Sites: ["site_id", "site_name", "description"],
    Radars: ["radar_id", "site_id", "radar_name", "radar_type"],
    Site_Activities: ["activity_id", "site_id", "activity_category", "activity_description"],
    Sources: ["source_id", "source_title", "source_url"],
    Contacts: ["contact_id", "site_id", "organization_name"],
  };
  const keyField: Record<string, string> = {
    Sites: "site_id",
    Radars: "radar_id",
    Site_Activities: "activity_id",
    Sources: "source_id",
    Contacts: "contact_id",
  };

  for (const sheet of SUPPORTED_SHEETS) {
    const data = readSheet(wb, sheet);
    if (!data) continue;
    // Validate required columns for this sheet (downgrade missing optional
    // columns to warnings so the wizard can still show what's available).
    const required = requiredColumns[sheet] ?? [];
    for (const col of required) {
      if (!data.headers.includes(col)) {
        const isHardRequired = REQUIRED_SHEETS.includes(sheet as typeof REQUIRED_SHEETS[number])
          && (col === keyField[sheet] || col === "site_id" || col === "site_name"
              || col === "description" || col === "radar_name" || col === "radar_type"
              || col === "activity_category" || col === "activity_description");
        result.issues.push({
          sheet, row: 1, field: col, value: "",
          rule: "missing_column",
          message: `Sheet "${sheet}" is missing column "${col}".`,
          severity: isHardRequired ? "error" : "warning",
        });
      }
    }

    const parsedRows: ParsedRow[] = data.rows.map((r) => ({
      rowNumber: r.rowNumber,
      key: r.cells[keyField[sheet]] ?? "",
      cells: r.cells,
    }));
    result.sheets[sheet] = { headers: data.headers, rows: parsedRows };
  }

  return result;
}


/**
 * Pure decision function for Sources during a selective import.
 *
 *   - No existing row in SQLite for this source_id → CREATE_NEW
 *   - Existing row, same trimmed title AND same trimmed url   → REUSE_EXISTING
 *   - Existing row, different title OR different url          → CONFLICT_REQUIRES_USER_DECISION
 *
 * Empty/undefined title/url are treated as the empty string for comparison.
 * Never overwrites silently; conflicts must be resolved by the operator.
 */
export interface ExcelSourceLike {
  source_id: string;
  source_title?: string | null;
  source_url?: string | null;
}

export function resolveSourceForImport(
  excel: ExcelSourceLike,
  existing: ExcelSourceLike | null,
): SourceResolutionDecision {
  if (!existing) return "CREATE_NEW";
  const t1 = (excel.source_title ?? "").trim();
  const t2 = (existing.source_title ?? "").trim();
  const u1 = (excel.source_url ?? "").trim();
  const u2 = (existing.source_url ?? "").trim();
  if (t1 === t2 && u1 === u2) return "REUSE_EXISTING";
  return "CONFLICT_REQUIRES_USER_DECISION";
}


/**
 * Inspect a parsed workbook + a user selection, and report which source_ids
 * the selected entity rows reference and whether each one auto-resolves or
 * needs the operator to pick a resolution.
 */
export interface SourceConflict {
  original_source_id: string;
  existing: { source_title: string | null; source_url: string | null } | null;
  excel:    { source_title: string | null; source_url: string | null } | null;
  decision: SourceResolutionDecision;
}

export interface SourceConflictResult {
  /** Every source_id referenced by the selected rows, in stable order. */
  referencedSourceIds: string[];
  /** source_ids that will be inserted as new rows (no existing row). */
  willCreate: string[];
  /** source_ids that match an existing row exactly (no action needed). */
  willReuse: string[];
  /** source_ids where the operator must decide between create/reuse/update. */
  conflicts: SourceConflict[];
}

export function detectSourceConflicts(
  parsed: ParseResult,
  importType: ImportType,
  selectedKeys: string[],
): SourceConflictResult {
  const db = getDb();
  const referenced = new Set<string>();

  const sheetFromType = sheetForImportType(importType);
  const sheet = parsed.sheets[sheetFromType];
  if (sheet) {
    const keySet = new Set(selectedKeys);
    for (const r of sheet.rows) {
      if (!keySet.has(r.key)) continue;
      const sid = (r.cells["source_id"] ?? "").trim();
      if (sid) referenced.add(sid);
      // Citations may also reference SRC- ids comma-separated
      const cit = r.cells["citations"];
      if (cit) {
        for (const tok of cit.split(/[,\s]+/)) {
          if (/^SRC-/.test(tok)) referenced.add(tok);
        }
      }
    }
  }

  const result: SourceConflictResult = {
    referencedSourceIds: Array.from(referenced).sort(),
    willCreate: [],
    willReuse: [],
    conflicts: [],
  };

  const excelSourcesById = new Map<string, ParsedRow>();
  const excelSources = parsed.sheets["Sources"];
  if (excelSources) {
    for (const r of excelSources.rows) {
      if (r.key) excelSourcesById.set(r.key, r);
    }
  }

  const stmt = db.prepare("SELECT source_id, source_title, source_url FROM sources WHERE source_id = ?");

  for (const sid of result.referencedSourceIds) {
    const excelRow = excelSourcesById.get(sid);
    const existingRow = stmt.get(sid) as { source_id: string; source_title: string | null; source_url: string | null } | undefined;
    const excelObj: ExcelSourceLike | null = excelRow
      ? {
          source_id: sid,
          source_title: excelRow.cells["source_title"] ?? null,
          source_url: excelRow.cells["source_url"] ?? null,
        }
      : null;
    const existingObj = existingRow
      ? { source_id: existingRow.source_id, source_title: existingRow.source_title, source_url: existingRow.source_url }
      : null;

    if (!excelObj) {
      // Selected row references a SRC-id that has no row in the Excel Sources
      // sheet. If it also doesn't exist in SQLite, we can't materialise it.
      // We don't auto-create from thin air; we surface a conflict so the
      // operator can either pick an existing SRC or reuse the row's text.
      if (!existingObj) {
        result.conflicts.push({
          original_source_id: sid,
          existing: null,
          excel: null,
          decision: "CONFLICT_REQUIRES_USER_DECISION",
        });
      } else {
        result.willReuse.push(sid);
      }
      continue;
    }

    const decision = resolveSourceForImport(excelObj, existingObj);
    if (decision === "CREATE_NEW") {
      result.willCreate.push(sid);
    } else if (decision === "REUSE_EXISTING") {
      result.willReuse.push(sid);
    } else {
      result.conflicts.push({
        original_source_id: sid,
        existing: existingObj
          ? { source_title: existingObj.source_title, source_url: existingObj.source_url }
          : null,
        excel: { source_title: excelObj.source_title ?? null, source_url: excelObj.source_url ?? null },
        decision,
      });
    }
  }

  return result;
}


function sheetForImportType(t: ImportType): typeof SUPPORTED_SHEETS[number] {
  switch (t) {
    case "sites": return "Sites";
    case "radars": return "Radars";
    case "site_range_activities": return "Site_Activities";
    case "contacts": return "Contacts";
  }
}


/**
 * Operator decision on a single source_id.
 *
 * - REUSE_EXISTING: keep the SQLite row as-is; the selected entity rows
 *   will continue to reference the original source_id.
 * - CREATE_NEW: insert the Excel Source under a freshly generated SRC-XXXX
 *   id; rewrite every selected entity row's `source_id` (and citations) to
 *   point at the new id.
 * - UPDATE_EXISTING: overwrite the SQLite source's title/url with the
 *   Excel values. Reserved for the "advanced" path; the UI must surface a
 *   second confirmation before sending this.
 */
export interface UserSourceResolution {
  resolution: "REUSE_EXISTING" | "CREATE_NEW" | "UPDATE_EXISTING";
  /** Optional preset new_source_id when resolution=CREATE_NEW. Otherwise
   * the server picks the next available SRC-XXXX. */
  new_source_id?: string;
}

export interface SelectiveImportOptions {
  parsed: ParseResult;
  importType: ImportType;
  selectedKeys: string[];
  /**
   * Operator decisions, keyed by ORIGINAL source_id from the Excel rows.
   * If a referenced source_id is missing from this map, the server defaults
   * to CREATE_NEW (the safest option).
   */
  sourceResolutions: Record<string, UserSourceResolution>;
  mode: ImportMode;
  changedBy?: string;
  allowIdentityFields?: boolean;
}

export interface AppliedSourceConflict extends SourceConflict {
  resolution: "REUSE_EXISTING" | "CREATE_NEW" | "UPDATE_EXISTING";
  new_source_id?: string;
}

export interface SelectiveImportReport {
  batchId: string;
  fileName: string;
  importType: ImportType;
  mode: ImportMode;
  startedAt: string;
  completedAt?: string;
  status: "Pending" | "Completed" | "Failed";
  backupPath?: string;
  errorMessage?: string;
  selectedCount: number;
  totals: {
    createdCount: number;
    updatedCount: number;
    skippedCount: number;
    noChangeCount: number;
    errorCount: number;
    sourceCreatedCount: number;
    sourceReusedCount: number;
    sourceConflictCount: number;
  };
  decisions: RowDecision[];
  sourceActions: AppliedSourceConflict[];
  issues: ValidationIssue[];
}


/** Generate the next sequential SRC-NNNN id, ignoring any IDs already picked
 * in this batch. */
function makeSourceIdGenerator(db: Database.Database) {
  const dispensed = new Set<string>();
  return (suggested?: string) => {
    if (suggested && !dispensed.has(suggested)) {
      dispensed.add(suggested);
      return suggested;
    }
    let id = nextSequentialId(db, "SRC", "sources", "source_id");
    while (dispensed.has(id)) id = nextAfter(id);
    dispensed.add(id);
    return id;
  };
}


/**
 * The selective-import orchestrator. Mirrors runImport() but ONLY touches
 * the keys in `selectedKeys` and only the Sources referenced by them.
 */
export async function runSelectiveImport(
  opts: SelectiveImportOptions,
): Promise<SelectiveImportReport> {
  const batchId = newBatchId();
  const startedAt = new Date().toISOString();
  const report: SelectiveImportReport = {
    batchId,
    fileName: opts.parsed.fileName,
    importType: opts.importType,
    mode: opts.mode,
    startedAt,
    status: "Pending",
    selectedCount: opts.selectedKeys.length,
    totals: {
      createdCount: 0, updatedCount: 0, skippedCount: 0, noChangeCount: 0, errorCount: 0,
      sourceCreatedCount: 0, sourceReusedCount: 0, sourceConflictCount: 0,
    },
    decisions: [],
    sourceActions: [],
    issues: [],
  };

  const sheetName = sheetForImportType(opts.importType);
  const sheet = opts.parsed.sheets[sheetName];
  if (!sheet) {
    report.status = "Failed";
    report.errorMessage = `Required sheet "${sheetName}" missing.`;
    report.completedAt = new Date().toISOString();
    persistSelectiveBatch(report);
    return report;
  }

  const selectedKeySet = new Set(opts.selectedKeys);
  const selectedRows = sheet.rows.filter((r) => selectedKeySet.has(r.key) && r.key !== "");

  // Step 1: figure out source resolutions for every referenced source_id.
  const db = getDb();
  const conflicts = detectSourceConflicts(opts.parsed, opts.importType, opts.selectedKeys);
  const newSourceId = makeSourceIdGenerator(db);

  // Map: originalSourceId -> { resolution, finalSourceId, excelRow, existingRow }
  type SrcPlan = {
    original: string;
    resolution: "REUSE_EXISTING" | "CREATE_NEW" | "UPDATE_EXISTING";
    finalId: string;
    excelRow?: ParsedRow;
    existingTitle?: string | null;
    existingUrl?: string | null;
    excelTitle?: string | null;
    excelUrl?: string | null;
  };
  const srcPlans = new Map<string, SrcPlan>();

  const excelSrcById = new Map<string, ParsedRow>();
  for (const r of opts.parsed.sheets["Sources"]?.rows ?? []) {
    if (r.key) excelSrcById.set(r.key, r);
  }
  const existingSrcStmt = db.prepare("SELECT source_id, source_title, source_url FROM sources WHERE source_id = ?");

  for (const original of conflicts.referencedSourceIds) {
    const userRes = opts.sourceResolutions[original];
    const excelRow = excelSrcById.get(original);
    const existingRow = existingSrcStmt.get(original) as { source_id: string; source_title: string | null; source_url: string | null } | undefined;

    // Decide the effective resolution
    let resolution: "REUSE_EXISTING" | "CREATE_NEW" | "UPDATE_EXISTING";
    if (conflicts.willReuse.includes(original)) {
      resolution = "REUSE_EXISTING";
    } else if (conflicts.willCreate.includes(original)) {
      resolution = "CREATE_NEW";
    } else {
      // It was a conflict. Honor the user's choice, default to CREATE_NEW.
      resolution = userRes?.resolution ?? "CREATE_NEW";
    }

    let finalId = original;
    if (resolution === "CREATE_NEW") {
      finalId = newSourceId(userRes?.new_source_id);
    }

    srcPlans.set(original, {
      original,
      resolution,
      finalId,
      excelRow,
      existingTitle: existingRow?.source_title ?? null,
      existingUrl: existingRow?.source_url ?? null,
      excelTitle: excelRow?.cells["source_title"] ?? null,
      excelUrl: excelRow?.cells["source_url"] ?? null,
    });

    if (resolution === "CREATE_NEW") report.totals.sourceCreatedCount++;
    else if (resolution === "REUSE_EXISTING") report.totals.sourceReusedCount++;
    if (conflicts.conflicts.find((c) => c.original_source_id === original)) {
      report.totals.sourceConflictCount++;
    }
  }

  report.sourceActions = Array.from(srcPlans.values()).map((p) => ({
    original_source_id: p.original,
    existing: p.existingTitle !== undefined ? { source_title: p.existingTitle, source_url: p.existingUrl ?? null } : null,
    excel:    p.excelTitle    !== undefined ? { source_title: p.excelTitle,    source_url: p.excelUrl ?? null }    : null,
    decision: conflicts.willReuse.includes(p.original) ? "REUSE_EXISTING"
            : conflicts.willCreate.includes(p.original) ? "CREATE_NEW"
            : "CONFLICT_REQUIRES_USER_DECISION",
    resolution: p.resolution,
    new_source_id: p.resolution === "CREATE_NEW" ? p.finalId : undefined,
  }));

  // Step 2: compute per-row diffs for the selected entity rows. Reuse the
  // same sheet handlers as the CLI flow, with overrides:
  //   - source_id rewriting based on srcPlans
  //   - skip rows that aren't selected

  const ctx: SheetContext = {
    db,
    existingSiteIds: new Set((db.prepare("SELECT site_id FROM sites").all() as { site_id: string }[]).map((r) => r.site_id)),
    existingRadarIds: new Set((db.prepare("SELECT radar_id FROM radars").all() as { radar_id: string }[]).map((r) => r.radar_id)),
    existingActivityIds: new Set((db.prepare("SELECT activity_id FROM site_range_activities WHERE activity_id IS NOT NULL").all() as { activity_id: string }[]).map((r) => r.activity_id)),
    existingSourceIds: new Set((db.prepare("SELECT source_id FROM sources").all() as { source_id: string }[]).map((r) => r.source_id)),
    existingContactIds: new Set((db.prepare("SELECT contact_id FROM contacts").all() as { contact_id: string }[]).map((r) => r.contact_id)),
    newRadarIdGen: () => nextSequentialId(db, "RAD", "radars", "radar_id"),
    newActivityIdGen: () => nextSequentialId(db, "ACT", "site_range_activities", "activity_id"),
    newContactIdGen: () => nextSequentialId(db, "CON", "contacts", "contact_id"),
    allowIdentityFields: !!opts.allowIdentityFields,
  };

  // Convert ParsedRow -> RawRow for the existing handlers, while rewriting
  // source_id according to srcPlans.
  const toRaw = (r: ParsedRow): RawRow => {
    const cells: Record<string, string> = { ...r.cells };
    const original = (cells["source_id"] ?? "").trim();
    if (original && srcPlans.has(original)) {
      const plan = srcPlans.get(original)!;
      if (plan.resolution === "CREATE_NEW") cells["source_id"] = plan.finalId;
    }
    // Rewrite SRC- ids inside the citations column too
    if (cells["citations"]) {
      cells["citations"] = cells["citations"].split(/([,\s]+)/).map((tok) => {
        const stripped = tok.trim();
        if (/^SRC-/.test(stripped) && srcPlans.has(stripped)) {
          const p = srcPlans.get(stripped)!;
          return p.resolution === "CREATE_NEW" ? p.finalId : stripped;
        }
        return tok;
      }).join("");
    }
    return { rowNumber: r.rowNumber, cells };
  };

  const rawSelected: RawRow[] = selectedRows.map(toRaw);
  let decisions: RowDecision[] = [];
  if (opts.importType === "sites") decisions = handleSitesSheet(rawSelected, ctx);
  else if (opts.importType === "radars") decisions = handleRadarsSheet(rawSelected, ctx);
  else if (opts.importType === "site_range_activities") decisions = handleSiteActivitiesSheet(rawSelected, ctx);
  else if (opts.importType === "contacts") decisions = handleContactsSheet(rawSelected, ctx);

  report.decisions = decisions;
  for (const d of decisions) {
    report.issues.push(...d.errors);
    if (d.action === "Create") report.totals.createdCount++;
    else if (d.action === "Update") report.totals.updatedCount++;
    else if (d.action === "Skip") report.totals.skippedCount++;
    else if (d.action === "NoChange") report.totals.noChangeCount++;
    report.totals.errorCount += d.errors.filter((e) => e.severity === "error").length;
  }

  if (opts.mode === "preview") {
    report.status = report.totals.errorCount > 0 ? "Pending" : "Completed";
    report.completedAt = new Date().toISOString();
    persistSelectiveBatch(report);
    return report;
  }

  // APPLY: backup + transaction
  try {
    report.backupPath = backupDatabase();
  } catch (err) {
    report.status = "Failed";
    report.errorMessage = `Backup failed: ${(err as Error).message}`;
    report.completedAt = new Date().toISOString();
    persistSelectiveBatch(report);
    return report;
  }

  try {
    transaction((txDb) => {
      const insAudit = txDb.prepare(`
        INSERT INTO audit_log
          (entity_type, entity_id, action, field_name, old_value, new_value, changed_by, import_batch_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      // 1) Apply source actions FIRST so entity rows can reference them.
      for (const plan of srcPlans.values()) {
        if (plan.resolution === "CREATE_NEW") {
          const row = plan.excelRow;
          if (!row) continue;
          txDb.prepare(`
            INSERT INTO sources (source_id, source_title, source_url, source_type, publisher, publication_date, access_date, reliability_score, notes, notebook_uuid)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            plan.finalId,
            row.cells["source_title"] ?? null,
            row.cells["source_url"] ?? null,
            row.cells["source_type"] ?? null,
            row.cells["publisher"] ?? null,
            row.cells["publication_date"] ?? null,
            row.cells["access_date"] ?? null,
            row.cells["reliability_score"] ? Number(row.cells["reliability_score"]) : null,
            row.cells["notes"] ?? null,
            row.cells["notebook_uuid"] ?? null,
          );
          insAudit.run(
            "Source", plan.finalId, "Create", null, null,
            JSON.stringify({ original_source_id: plan.original, source_title: row.cells["source_title"], source_url: row.cells["source_url"] }),
            opts.changedBy ?? "import", batchId,
          );
        } else if (plan.resolution === "UPDATE_EXISTING") {
          const row = plan.excelRow;
          if (!row) continue;
          txDb.prepare(`
            UPDATE sources SET source_title = ?, source_url = ?, source_type = COALESCE(?, source_type), publisher = COALESCE(?, publisher)
            WHERE source_id = ?
          `).run(
            row.cells["source_title"] ?? null,
            row.cells["source_url"] ?? null,
            row.cells["source_type"] ?? null,
            row.cells["publisher"] ?? null,
            plan.original,
          );
          insAudit.run(
            "Source", plan.original, "Update", "source_title/source_url",
            JSON.stringify({ source_title: plan.existingTitle, source_url: plan.existingUrl }),
            JSON.stringify({ source_title: row.cells["source_title"], source_url: row.cells["source_url"] }),
            opts.changedBy ?? "import", batchId,
          );
        }
        // REUSE_EXISTING: nothing to do.
      }

      // 2) Persist the per-source-conflict resolutions in their own table.
      const insConflict = txDb.prepare(`
        INSERT INTO import_source_conflicts
          (import_batch_id, original_source_id, existing_source_title, existing_source_url,
           excel_source_title, excel_source_url, resolution, new_source_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const plan of srcPlans.values()) {
        insConflict.run(
          batchId,
          plan.original,
          plan.existingTitle ?? null,
          plan.existingUrl ?? null,
          plan.excelTitle ?? null,
          plan.excelUrl ?? null,
          plan.resolution,
          plan.resolution === "CREATE_NEW" ? plan.finalId : null,
        );
      }

      // 3) Apply entity rows. Re-use applyDecisions.
      applyDecisions(txDb, decisions, batchId, opts.changedBy ?? "import");
    });
    report.status = "Completed";
  } catch (err) {
    report.status = "Failed";
    report.errorMessage = `Apply failed (transaction rolled back): ${(err as Error).message}`;
  }

  report.completedAt = new Date().toISOString();
  persistSelectiveBatch(report);
  return report;
}


function persistSelectiveBatch(report: SelectiveImportReport): void {
  try {
    const db = getDb();
    db.prepare(`
      INSERT INTO import_batches
        (id, file_name, mode, import_type, status, started_at, completed_at,
         total_rows, selected_records_count,
         created_count, updated_count, skipped_count, error_count,
         source_created_count, source_reused_count, source_conflict_count,
         backup_path, summary)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      report.batchId,
      report.fileName,
      report.mode,
      report.importType,
      report.status,
      report.startedAt,
      report.completedAt ?? null,
      report.selectedCount,
      report.selectedCount,
      report.totals.createdCount,
      report.totals.updatedCount,
      report.totals.skippedCount,
      report.totals.errorCount,
      report.totals.sourceCreatedCount,
      report.totals.sourceReusedCount,
      report.totals.sourceConflictCount,
      report.backupPath ?? null,
      report.errorMessage ?? null,
    );
    const insIssue = db.prepare(`
      INSERT INTO import_validation_errors
        (import_batch_id, sheet_name, row_number, field_name, value, rule, message, severity)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const i of report.issues) {
      insIssue.run(report.batchId, i.sheet, i.row, i.field, i.value, i.rule, i.message, i.severity);
    }
  } catch (err) {
    console.warn("Failed to persist selective import batch metadata:", (err as Error).message);
  }
}


// ===========================================================================
//
//  Scan-and-tree (the "ייבוא נתונים" wizard, redesigned)
//
//  The original wizard asked the operator to pick a type, then ticked rows
//  out of a flat list of the entire sheet. That meant scrolling past 180
//  unchanged rows to find the 5 actual changes.
//
//  This new flow does the diff up front: it walks ALL four sheets, runs each
//  row through the existing handlers, throws away every NoChange row, and
//  returns the survivors grouped by site_id — so the wizard can render a
//  Salesforce-style tree of "site → its modified radars / activities /
//  contacts" with the operator ticking what they actually want imported.
//
// ===========================================================================

/** One leaf in the change tree. Represents one row that would Create or Update
 * a single entity if the operator ticked it. */
export interface EntityChange {
  /** Stable identifier the wizard uses for selection. Either the natural key
   * (e.g. "RAD-0186") or a row-number fallback for keyless rows (e.g.
   * "Radars:row:7"). */
  selectionKey: string;
  entityType: EntityType;        // "Site" | "Radar" | "SiteRangeActivity" | "Contact"
  action: "Create" | "Update";
  entityId: string;              // natural id (may be "" for keyless rows that will get a generated id)
  displayName: string;           // human-friendly label for the row
  sheetName: string;
  rowNumber: number;
  fields: FieldDiff[];
  errors: ValidationIssue[];     // validation issues, if any
}

export interface SiteChangeNode {
  siteId: string;                // either the existing site_id, the new site_id, or "(unknown)" for orphans
  siteName: string;              // from DB, or from Excel for new sites
  country?: string;
  state?: string;
  /** "existing" = site already in DB; "new" = creating; "orphan" = entity rows
   * reference a site_id we cannot find anywhere. */
  status: "existing" | "new" | "orphan";
  /** Set when the Sites sheet itself has a change for this site. */
  siteChange?: EntityChange;
  radars: EntityChange[];
  activities: EntityChange[];
  contacts: EntityChange[];
}

export interface ScanResult {
  fileName: string;
  totals: { sites: number; radars: number; activities: number; contacts: number };
  sites: SiteChangeNode[];
  issues: ValidationIssue[];
}


/**
 * Walk every supported sheet, run each row through the existing handlers,
 * drop NoChange rows, and group everything into a per-site tree. Read-only
 * by design — DOES NOT touch SQLite data, only reads it for the diff.
 */
export function scanForChanges(
  parsed: ParseResult,
  options: { allowIdentityFields?: boolean; allowCreateSites?: boolean } = {},
): ScanResult {
  const db = getDb();
  const allowCreateSites = options.allowCreateSites ?? true;
  const ctx: SheetContext = {
    db,
    existingSiteIds: new Set((db.prepare("SELECT site_id FROM sites").all() as { site_id: string }[]).map((r) => r.site_id)),
    existingRadarIds: new Set((db.prepare("SELECT radar_id FROM radars").all() as { radar_id: string }[]).map((r) => r.radar_id)),
    existingActivityIds: new Set((db.prepare("SELECT activity_id FROM site_range_activities WHERE activity_id IS NOT NULL").all() as { activity_id: string }[]).map((r) => r.activity_id)),
    existingSourceIds: new Set((db.prepare("SELECT source_id FROM sources").all() as { source_id: string }[]).map((r) => r.source_id)),
    existingContactIds: new Set((db.prepare("SELECT contact_id FROM contacts").all() as { contact_id: string }[]).map((r) => r.contact_id)),
    newRadarIdGen: () => nextSequentialId(db, "RAD", "radars", "radar_id"),
    newActivityIdGen: () => nextSequentialId(db, "ACT", "site_range_activities", "activity_id"),
    newContactIdGen: () => nextSequentialId(db, "CON", "contacts", "contact_id"),
    allowIdentityFields: !!options.allowIdentityFields,
    allowCreateSites,
  };

  // Convert parsed rows into the RawRow shape the handlers expect.
  const toRaw = (r: ParsedRow): RawRow => ({ rowNumber: r.rowNumber, cells: r.cells });

  // Sites first, so any sites the wizard is about to create can be
  // referenced by Radars/Activities/Contacts in the SAME batch (otherwise
  // those handlers would reject them as fk_violations).
  const siteDecisions = parsed.sheets["Sites"]
    ? handleSitesSheet(parsed.sheets["Sites"].rows.map(toRaw), ctx)
    : [];
  for (const d of siteDecisions) {
    if (d.action === "Create" && d.entityId) ctx.existingSiteIds.add(d.entityId);
  }
  const radarDecisions = parsed.sheets["Radars"]
    ? handleRadarsSheet(parsed.sheets["Radars"].rows.map(toRaw), ctx)
    : [];
  const activityDecisions = parsed.sheets["Site_Activities"]
    ? handleSiteActivitiesSheet(parsed.sheets["Site_Activities"].rows.map(toRaw), ctx)
    : [];
  const contactDecisions = parsed.sheets["Contacts"]
    ? handleContactsSheet(parsed.sheets["Contacts"].rows.map(toRaw), ctx)
    : [];

  // Look up display info (site_name etc.) for every existing site we touch.
  const allSiteIds = new Set<string>();
  for (const d of siteDecisions) if (d.entityId) allSiteIds.add(d.entityId);
  for (const d of radarDecisions)
    for (const f of d.fields) if (f.field === "site_id" && f.newValue) allSiteIds.add(f.newValue);
  for (const d of activityDecisions)
    for (const f of d.fields) if (f.field === "site_id" && f.newValue) allSiteIds.add(f.newValue);
  for (const d of contactDecisions)
    for (const f of d.fields) if (f.field === "site_id" && f.newValue) allSiteIds.add(f.newValue);
  // For Update decisions on radars/activities/contacts, the row already
  // points at an existing site via its DB row; look those up too.
  const dbRowSiteIds = (table: string, key: string, decisions: RowDecision[]) =>
    decisions
      .filter((d) => d.action === "Update" && d.entityId)
      .map((d) => {
        const row = db.prepare(`SELECT site_id FROM ${table} WHERE ${key} = ?`).get(d.entityId) as { site_id?: string } | undefined;
        return row?.site_id ?? "";
      });
  dbRowSiteIds("radars", "radar_id", radarDecisions).forEach((id) => id && allSiteIds.add(id));
  dbRowSiteIds("site_range_activities", "activity_id", activityDecisions).forEach((id) => id && allSiteIds.add(id));
  dbRowSiteIds("contacts", "contact_id", contactDecisions).forEach((id) => id && allSiteIds.add(id));

  const siteInfo = new Map<string, { name: string; country?: string; state?: string }>();
  if (allSiteIds.size > 0) {
    const placeholders = Array.from(allSiteIds).map(() => "?").join(",");
    const rows = db.prepare(`SELECT site_id, site_name, country, state FROM sites WHERE site_id IN (${placeholders})`)
      .all(...Array.from(allSiteIds)) as { site_id: string; site_name: string; country: string | null; state: string | null }[];
    for (const r of rows) {
      siteInfo.set(r.site_id, { name: r.site_name, country: r.country ?? undefined, state: r.state ?? undefined });
    }
  }
  // New sites pick their name from the Excel row, not the DB.
  for (const d of siteDecisions) {
    if (d.action === "Create" && d.entityId) {
      const nameField = d.fields.find((f) => f.field === "site_name");
      const countryField = d.fields.find((f) => f.field === "country");
      const stateField = d.fields.find((f) => f.field === "state");
      siteInfo.set(d.entityId, {
        name: nameField?.newValue ?? d.entityId,
        country: countryField?.newValue ?? undefined,
        state: stateField?.newValue ?? undefined,
      });
    }
  }

  // Build the nodes map keyed by site_id.
  const nodeFor = (siteId: string, status: "existing" | "new" | "orphan"): SiteChangeNode => {
    let node = nodes.get(siteId);
    if (!node) {
      const info = siteInfo.get(siteId);
      node = {
        siteId,
        siteName: info?.name ?? siteId,
        country: info?.country,
        state: info?.state,
        status,
        radars: [], activities: [], contacts: [],
      };
      nodes.set(siteId, node);
    }
    // Promote status if a stronger one comes in (new > existing > orphan).
    if (status === "new") node.status = "new";
    else if (status === "existing" && node.status === "orphan") node.status = "existing";
    return node;
  };
  const nodes = new Map<string, SiteChangeNode>();

  const issues: ValidationIssue[] = [];

  // Sites sheet → either populates node.siteChange or surfaces the row as
  // a Create node (the latter forces an "אתר חדש" header).
  for (const d of siteDecisions) {
    issues.push(...d.errors);
    if (d.action !== "Create" && d.action !== "Update") continue;
    const status = d.action === "Create" ? "new" : "existing";
    const node = nodeFor(d.entityId, status);
    node.siteChange = decisionToEntityChange(d);
  }

  // Helper for child sheets (radars/activities/contacts).
  const attachChild = (decisions: RowDecision[], targetField: "radars" | "activities" | "contacts", sheetTable: string, sheetKey: string) => {
    for (const d of decisions) {
      issues.push(...d.errors);
      if (d.action !== "Create" && d.action !== "Update") continue;
      // Find which site this child belongs to:
      // - if there's a site_id field in the diff, use that
      // - else (it's an Update), look up the existing DB row
      let siteId = "";
      const sidField = d.fields.find((f) => f.field === "site_id");
      if (sidField?.newValue) siteId = sidField.newValue;
      else if (d.entityId) {
        const row = ctx.db.prepare(`SELECT site_id FROM ${sheetTable} WHERE ${sheetKey} = ?`).get(d.entityId) as { site_id?: string } | undefined;
        siteId = row?.site_id ?? "";
      }
      // Orphan handling: if the site_id isn't anywhere we know, group under
      // a synthetic "orphan" node so the operator can see what's broken.
      const status: "existing" | "new" | "orphan" =
        ctx.existingSiteIds.has(siteId) ? "existing"
        : siteDecisions.some((sd) => sd.action === "Create" && sd.entityId === siteId) ? "new"
        : "orphan";
      const node = nodeFor(siteId || "(unknown)", status);
      node[targetField].push(decisionToEntityChange(d));
    }
  };

  attachChild(radarDecisions, "radars", "radars", "radar_id");
  attachChild(activityDecisions, "activities", "site_range_activities", "activity_id");
  attachChild(contactDecisions, "contacts", "contacts", "contact_id");

  // Sort: new sites first, then existing alphabetical by name, then orphans.
  const sorted = Array.from(nodes.values()).sort((a, b) => {
    const orderRank = (s: SiteChangeNode["status"]) => s === "new" ? 0 : s === "existing" ? 1 : 2;
    const ra = orderRank(a.status), rb = orderRank(b.status);
    if (ra !== rb) return ra - rb;
    return a.siteName.localeCompare(b.siteName);
  });
  // Inside each node, sort children by entityId/displayName for stability.
  for (const n of sorted) {
    n.radars.sort((a, b) => a.entityId.localeCompare(b.entityId));
    n.activities.sort((a, b) => a.entityId.localeCompare(b.entityId));
    n.contacts.sort((a, b) => a.entityId.localeCompare(b.entityId));
  }

  // Carry over parse-time issues from the original ParseResult so the UI
  // can render the union.
  return {
    fileName: parsed.fileName,
    totals: {
      sites: sorted.reduce((s, n) => s + (n.siteChange ? 1 : 0), 0),
      radars: sorted.reduce((s, n) => s + n.radars.length, 0),
      activities: sorted.reduce((s, n) => s + n.activities.length, 0),
      contacts: sorted.reduce((s, n) => s + n.contacts.length, 0),
    },
    sites: sorted,
    issues: [...parsed.issues, ...issues],
  };
}


/**
 * Multi-type version of detectSourceConflicts: takes the scan result plus a
 * flat list of selectionKeys (mixed types) and returns the union of source
 * conflicts the wizard needs to resolve in Step 3.
 */
export function detectMultiSourceConflicts(
  parsed: ParseResult,
  selectedKeys: string[],
  options: { allowIdentityFields?: boolean; allowCreateSites?: boolean } = {},
): SourceConflictResult {
  const db = getDb();
  const scan = scanForChanges(parsed, {
    allowIdentityFields: options.allowIdentityFields,
    allowCreateSites: options.allowCreateSites ?? true,
  });
  const selected = new Set(selectedKeys);
  const referenced = new Set<string>();

  // For Update decisions on radars/activities, the row may keep its existing
  // source_id (it won't appear in fields[] because it didn't change). Pull
  // those from the DB so they are part of the conflict scan.
  const lookupSid = (table: string, key: string, id: string): string | undefined => {
    if (!id) return undefined;
    const row = db.prepare(`SELECT source_id FROM ${table} WHERE ${key} = ?`).get(id) as { source_id?: string } | undefined;
    return row?.source_id ?? undefined;
  };

  const collect = (changes: EntityChange[], table?: string, key?: string) => {
    for (const ch of changes) {
      if (!selected.has(ch.selectionKey)) continue;
      const sidField = ch.fields.find((f) => f.field === "source_id");
      if (sidField?.newValue && /^SRC-/.test(sidField.newValue)) referenced.add(sidField.newValue);
      if (ch.action === "Update" && table && key && ch.entityId) {
        const sid = lookupSid(table, key, ch.entityId);
        if (sid && /^SRC-/.test(sid)) referenced.add(sid);
      }
      const cit = ch.fields.find((f) => f.field === "citations")?.newValue;
      if (cit) for (const tok of cit.split(/[,\s]+/)) if (/^SRC-/.test(tok)) referenced.add(tok);
    }
  };
  for (const node of scan.sites) {
    if (node.siteChange) collect([node.siteChange]);
    collect(node.radars, "radars", "radar_id");
    collect(node.activities, "site_range_activities", "activity_id");
    collect(node.contacts, "contacts", "contact_id");
  }

  const result: SourceConflictResult = {
    referencedSourceIds: Array.from(referenced).sort(),
    willCreate: [],
    willReuse: [],
    conflicts: [],
  };

  const excelSrcById = new Map<string, ParsedRow>();
  for (const r of parsed.sheets["Sources"]?.rows ?? []) {
    if (r.key) excelSrcById.set(r.key, r);
  }
  const existingStmt = db.prepare("SELECT source_id, source_title, source_url FROM sources WHERE source_id = ?");

  for (const sid of result.referencedSourceIds) {
    const excelRow = excelSrcById.get(sid);
    const existingRow = existingStmt.get(sid) as { source_id: string; source_title: string | null; source_url: string | null } | undefined;
    const excelObj: ExcelSourceLike | null = excelRow
      ? { source_id: sid, source_title: excelRow.cells["source_title"] ?? null, source_url: excelRow.cells["source_url"] ?? null }
      : null;
    const existingObj = existingRow
      ? { source_id: existingRow.source_id, source_title: existingRow.source_title, source_url: existingRow.source_url }
      : null;

    if (!excelObj) {
      if (!existingObj) {
        result.conflicts.push({ original_source_id: sid, existing: null, excel: null, decision: "CONFLICT_REQUIRES_USER_DECISION" });
      } else {
        result.willReuse.push(sid);
      }
      continue;
    }
    const decision = resolveSourceForImport(excelObj, existingObj);
    if (decision === "CREATE_NEW") result.willCreate.push(sid);
    else if (decision === "REUSE_EXISTING") result.willReuse.push(sid);
    else result.conflicts.push({
      original_source_id: sid,
      existing: existingObj ? { source_title: existingObj.source_title, source_url: existingObj.source_url } : null,
      excel: { source_title: excelObj.source_title ?? null, source_url: excelObj.source_url ?? null },
      decision,
    });
  }
  return result;
}


function decisionToEntityChange(d: RowDecision): EntityChange {
  const key = d.entityId
    ? `${d.entityType}:${d.entityId}`
    : `${d.entityType}:${d.sheetName}:row:${d.rowNumber}`;
  const displayName = d.entityType === "Site"
    ? (d.fields.find((f) => f.field === "site_name")?.newValue ?? d.entityId)
    : d.entityType === "Radar"
    ? ((d.fields.find((f) => f.field === "radar_name")?.newValue ?? d.entityId) || "—")
    : d.entityType === "SiteRangeActivity"
    ? ((d.fields.find((f) => f.field === "activity_description")?.newValue
       ?? d.fields.find((f) => f.field === "activity_category")?.newValue
       ?? d.entityId) || "—")
    : d.entityType === "Contact"
    ? ((d.fields.find((f) => f.field === "organization_name")?.newValue ?? d.entityId) || "—")
    : (d.entityId || "—");
  return {
    selectionKey: key,
    entityType: d.entityType,
    action: d.action === "Create" ? "Create" : "Update",
    entityId: d.entityId,
    displayName,
    sheetName: d.sheetName,
    rowNumber: d.rowNumber,
    fields: d.fields,
    errors: d.errors,
  };
}


// ===========================================================================
//
//  Multi-type selective import — used by the redesigned wizard
//
// ===========================================================================

export interface MultiSelectiveImportOptions {
  parsed: ParseResult;
  /** Flat list of selectionKey strings, exactly as returned by scanForChanges. */
  selectedKeys: string[];
  /** Source-conflict resolutions, keyed by original source_id (same as the
   * single-type flow). */
  sourceResolutions: Record<string, UserSourceResolution>;
  mode: ImportMode;
  changedBy?: string;
  allowIdentityFields?: boolean;
  /** Wizard always allows creating new sites; CLI does not. */
  allowCreateSites?: boolean;
}


/** Selected report variant: an extended SelectiveImportReport that captures
 * counts per type. */
export interface MultiSelectiveImportReport extends Omit<SelectiveImportReport, "importType"> {
  importType: "multi";
  perType: Record<"sites" | "radars" | "activities" | "contacts", { create: number; update: number; skip: number }>;
  /** Counts for the wholesale sheets (Radar_Lifecycle, Systems) that are
   * upserted bulk during the apply transaction, without per-row diff in
   * the wizard tree. inserted = INSERT path; updated = existing row
   * replaced; skipped = row couldn't be applied (bad FK, missing required
   * field, invalid enum). */
  perWholesale: {
    radar_lifecycle: { inserted: number; updated: number; skipped: number };
    systems:         { inserted: number; updated: number; skipped: number };
  };
}


// ---------------------------------------------------------------------------
// Wholesale-apply helpers: Radar_Lifecycle and Systems sheets bypass the
// per-row wizard diff (their UI would balloon SiteChangeTree) and instead
// get bulk INSERT-OR-REPLACEd inside the same transaction as the diffed
// sheets. Errors per row are reported as wizard issues; counts feed
// perWholesale on the report.
// ---------------------------------------------------------------------------

const RADAR_LIFECYCLE_EVENT_TYPES_IMPORT = [
  "Procurement specification", "Procurement award", "Contract award",
  "Delivery / modernization", "Acceptance", "Commissioning",
  "Planned acquisition", "Historical reference", "Decommissioning", "Other",
] as const;

const SYSTEM_CATEGORIES_IMPORT = [
  "Optical Tracking", "Telemetry / Range Safety", "Electronic Warfare",
  "Communications", "Command & Control", "Test Instrumentation",
  "Weapons Test", "Other",
] as const;

interface WholesaleResult {
  inserted: number;
  updated: number;
  skipped: number;
  issues: ValidationIssue[];
}

function bulkUpsertLifecycleSheet(
  txDb: ReturnType<typeof getDb>,
  parsed: ParseResult,
  changedBy: string,
  mode: "apply" | "dryRun" = "apply",
  /** Radar_ids that aren't in the DB yet but WILL be created in the same
   * import. The dry-run path is called BEFORE the radars are inserted,
   * so without this hint it would reject every lifecycle row whose
   * radar lives in the same workbook. The apply path runs INSIDE the
   * transaction after applyDecisions, so this is only needed for
   * preview. Keyed radar_id → site_id so we can resolve the parent
   * site_id when the sheet row leaves it blank. */
  pendingRadars: Map<string, string> = new Map(),
): WholesaleResult {
  const sheet = parsed.sheets["Radar_Lifecycle"];
  const out: WholesaleResult = { inserted: 0, updated: 0, skipped: 0, issues: [] };
  if (!sheet) return out;

  const existingRadarIds = new Set(
    (txDb.prepare("SELECT radar_id, site_id FROM radars").all() as Array<{ radar_id: string; site_id: string }>)
      .map((r) => r.radar_id),
  );
  const radarToSite = new Map<string, string>();
  for (const r of txDb.prepare("SELECT radar_id, site_id FROM radars").all() as Array<{ radar_id: string; site_id: string }>) {
    radarToSite.set(r.radar_id, r.site_id);
  }
  // Merge in pending creates so the dry-run sees the full universe.
  for (const [rId, sId] of pendingRadars) {
    existingRadarIds.add(rId);
    if (!radarToSite.has(rId)) radarToSite.set(rId, sId);
  }
  const existsStmt = txDb.prepare("SELECT 1 AS v FROM radar_lifecycle_events WHERE event_id = ?");
  const upsertStmt = txDb.prepare(`
    INSERT OR REPLACE INTO radar_lifecycle_events (
      event_id, radar_id, site_id, event_type, event_date, event_year,
      event_title, event_description, authority_or_owner, supplier_or_contractor,
      disclosed_value, currency, value_scope, evidence_status, source_ids,
      analyst_note, created_by
    ) VALUES (
      @event_id, @radar_id, @site_id, @event_type, @event_date, @event_year,
      @event_title, @event_description, @authority_or_owner, @supplier_or_contractor,
      @disclosed_value, @currency, @value_scope, @evidence_status, @source_ids,
      @analyst_note, @created_by
    )
  `);

  for (const row of sheet.rows) {
    const cells = row.cells;
    const radarId = (cells["radar_id"] ?? "").trim();
    const eventType = (cells["event_type"] ?? "").trim();
    const eventId = (cells["event_id"] ?? "").trim();

    if (!radarId) {
      out.skipped++;
      out.issues.push({ sheet: "Radar_Lifecycle", row: row.rowNumber, field: "radar_id", value: "", rule: "required", message: "radar_id is required.", severity: "error" });
      continue;
    }
    if (!existingRadarIds.has(radarId)) {
      out.skipped++;
      // Hint: was this radar in the workbook but not selected for
      // create in the wizard's per-site tree?
      const inWorkbook = (parsed.sheets["Radars"]?.rows ?? []).some((r) => (r.cells["radar_id"] ?? "").trim() === radarId);
      const hint = inWorkbook
        ? " The radar IS in the workbook's Radars sheet — go back to step 1 and tick it for creation, then re-run."
        : "";
      out.issues.push({
        sheet: "Radar_Lifecycle", row: row.rowNumber, field: "radar_id", value: radarId, rule: "fk_violation",
        message: `radar_id "${radarId}" does not exist in radars table.${hint}`,
        severity: "error",
      });
      continue;
    }
    if (!eventType) {
      out.skipped++;
      out.issues.push({ sheet: "Radar_Lifecycle", row: row.rowNumber, field: "event_type", value: "", rule: "required", message: "event_type is required.", severity: "error" });
      continue;
    }
    if (!(RADAR_LIFECYCLE_EVENT_TYPES_IMPORT as readonly string[]).includes(eventType)) {
      out.skipped++;
      out.issues.push({ sheet: "Radar_Lifecycle", row: row.rowNumber, field: "event_type", value: eventType, rule: "invalid_enum", message: `event_type must be one of: ${RADAR_LIFECYCLE_EVENT_TYPES_IMPORT.join(", ")}.`, severity: "error" });
      continue;
    }

    // Resolve site_id from the sheet (preferred) or fall back to the parent radar.
    const siteIdFromSheet = (cells["site_id"] ?? "").trim();
    const siteId = siteIdFromSheet || radarToSite.get(radarId) || "";

    // Auto-generate event_id if missing. Pattern matches data-store.nextLifecycleEventId.
    let finalEventId = eventId;
    if (!finalEventId) {
      const m = siteId.match(/SITE-(\d+)/i);
      const sitePart = m ? m[1] : siteId.replace(/[^a-zA-Z0-9]/g, "");
      const prefix = `EVT-RAD-${sitePart}-`;
      const last = txDb.prepare("SELECT event_id FROM radar_lifecycle_events WHERE event_id LIKE ? ORDER BY event_id DESC LIMIT 1")
        .get(`${prefix}%`) as { event_id?: string } | undefined;
      const n = last?.event_id ? (Number(last.event_id.slice(prefix.length)) + 1) : 1;
      finalEventId = `${prefix}${String(Number.isFinite(n) ? n : 1).padStart(3, "0")}`;
    }

    const isUpdate = !!existsStmt.get(finalEventId);

    if (mode === "apply") {
      upsertStmt.run({
        event_id: finalEventId,
        radar_id: radarId,
        site_id: siteId,
        event_type: eventType,
        event_date: (cells["event_date"] ?? "").trim() || null,
        event_year: cells["event_year"] ? Number(cells["event_year"]) || null : null,
        event_title: (cells["event_title"] ?? "").trim() || null,
        event_description: (cells["event_description"] ?? "").trim() || null,
        authority_or_owner: (cells["authority_or_owner"] ?? "").trim() || null,
        supplier_or_contractor: (cells["supplier_or_contractor"] ?? "").trim() || null,
        disclosed_value: (cells["disclosed_value"] ?? "").trim() || null,
        currency: (cells["currency"] ?? "").trim() || null,
        value_scope: (cells["value_scope"] ?? "").trim() || null,
        evidence_status: (cells["evidence_status"] ?? "").trim() || null,
        source_ids: (cells["source_ids"] ?? "").trim() || null,
        analyst_note: (cells["analyst_note"] ?? "").trim() || null,
        created_by: changedBy,
      });
    }
    if (isUpdate) out.updated++; else out.inserted++;
  }
  return out;
}

function bulkUpsertSystemsSheet(
  txDb: ReturnType<typeof getDb>,
  parsed: ParseResult,
  changedBy: string,
  mode: "apply" | "dryRun" = "apply",
  /** Site_ids that aren't in the DB yet but WILL be created in the
   * same import. Mirrors pendingRadars in bulkUpsertLifecycleSheet —
   * only needed for the preview dry-run. */
  pendingSites: Set<string> = new Set(),
): WholesaleResult {
  const sheet = parsed.sheets["Systems"];
  const out: WholesaleResult = { inserted: 0, updated: 0, skipped: 0, issues: [] };
  if (!sheet) return out;

  const existingSiteIds = new Set(
    (txDb.prepare("SELECT site_id FROM sites").all() as Array<{ site_id: string }>).map((r) => r.site_id),
  );
  for (const sId of pendingSites) existingSiteIds.add(sId);
  const existsStmt = txDb.prepare("SELECT 1 AS v FROM systems WHERE system_id = ?");
  const upsertStmt = txDb.prepare(`
    INSERT OR REPLACE INTO systems (
      system_id, site_id, system_name, system_category, purpose,
      owner, operator, manufacturer, operational_status, public_description,
      citations, confidence_level, last_verified_date, source_id, record_status,
      created_by
    ) VALUES (
      @system_id, @site_id, @system_name, @system_category, @purpose,
      @owner, @operator, @manufacturer, @operational_status, @public_description,
      @citations, @confidence_level, @last_verified_date, @source_id, @record_status,
      @created_by
    )
  `);

  for (const row of sheet.rows) {
    const cells = row.cells;
    const siteId = (cells["site_id"] ?? "").trim();
    const systemName = (cells["system_name"] ?? "").trim();
    const systemCategory = (cells["system_category"] ?? "").trim();
    const systemId = (cells["system_id"] ?? "").trim();

    if (!siteId) {
      out.skipped++;
      out.issues.push({ sheet: "Systems", row: row.rowNumber, field: "site_id", value: "", rule: "required", message: "site_id is required.", severity: "error" });
      continue;
    }
    if (!existingSiteIds.has(siteId)) {
      out.skipped++;
      const inWorkbook = (parsed.sheets["Sites"]?.rows ?? []).some((r) => (r.cells["site_id"] ?? "").trim() === siteId);
      const hint = inWorkbook
        ? " The site IS in the workbook's Sites sheet — go back to step 1 and tick it for creation, then re-run."
        : "";
      out.issues.push({
        sheet: "Systems", row: row.rowNumber, field: "site_id", value: siteId, rule: "fk_violation",
        message: `site_id "${siteId}" does not exist in sites table.${hint}`,
        severity: "error",
      });
      continue;
    }
    if (!systemName) {
      out.skipped++;
      out.issues.push({ sheet: "Systems", row: row.rowNumber, field: "system_name", value: "", rule: "required", message: "system_name is required.", severity: "error" });
      continue;
    }
    if (!(SYSTEM_CATEGORIES_IMPORT as readonly string[]).includes(systemCategory)) {
      out.skipped++;
      out.issues.push({ sheet: "Systems", row: row.rowNumber, field: "system_category", value: systemCategory, rule: "invalid_enum", message: `system_category must be one of: ${SYSTEM_CATEGORIES_IMPORT.join(", ")}.`, severity: "error" });
      continue;
    }

    // Auto-generate system_id if missing. Pattern matches data-store.nextSystemId.
    let finalSystemId = systemId;
    if (!finalSystemId) {
      const m = siteId.match(/SITE-(\d+)/i);
      const sitePart = m ? m[1] : siteId.replace(/[^a-zA-Z0-9]/g, "");
      const prefix = `SYS-${sitePart}-`;
      const last = txDb.prepare("SELECT system_id FROM systems WHERE system_id LIKE ? ORDER BY system_id DESC LIMIT 1")
        .get(`${prefix}%`) as { system_id?: string } | undefined;
      const n = last?.system_id ? (Number(last.system_id.slice(prefix.length)) + 1) : 1;
      finalSystemId = `${prefix}${String(Number.isFinite(n) ? n : 1).padStart(3, "0")}`;
    }

    const isUpdate = !!existsStmt.get(finalSystemId);

    if (mode === "apply") {
      upsertStmt.run({
        system_id: finalSystemId,
        site_id: siteId,
        system_name: systemName,
        system_category: systemCategory,
        purpose: (cells["purpose"] ?? "").trim() || null,
        owner: (cells["owner"] ?? "").trim() || null,
        operator: (cells["operator"] ?? "").trim() || null,
        manufacturer: (cells["manufacturer"] ?? "").trim() || null,
        operational_status: (cells["operational_status"] ?? "").trim() || "Unknown",
        public_description: (cells["public_description"] ?? "").trim() || null,
        citations: (cells["citations"] ?? "").trim() || null,
        confidence_level: (cells["confidence_level"] ?? "").trim() || "Low",
        last_verified_date: (cells["last_verified_date"] ?? "").trim() || null,
        source_id: (cells["source_id"] ?? "").trim() || null,
        record_status: (cells["record_status"] ?? "").trim() || "Draft",
        created_by: changedBy,
      });
    }
    if (isUpdate) out.updated++; else out.inserted++;
  }
  return out;
}


/**
 * Orchestrator for the redesigned wizard. Accepts a flat list of
 * selectionKey strings (from scanForChanges) covering any mix of types,
 * resolves the source conflicts across all of them, and applies in one
 * transaction with new Sites inserted before their children.
 */
export async function runMultiTypeSelectiveImport(
  opts: MultiSelectiveImportOptions,
): Promise<MultiSelectiveImportReport> {
  const batchId = newBatchId();
  const startedAt = new Date().toISOString();
  const report: MultiSelectiveImportReport = {
    batchId,
    fileName: opts.parsed.fileName,
    importType: "multi",
    mode: opts.mode,
    startedAt,
    status: "Pending",
    selectedCount: opts.selectedKeys.length,
    totals: {
      createdCount: 0, updatedCount: 0, skippedCount: 0, noChangeCount: 0, errorCount: 0,
      sourceCreatedCount: 0, sourceReusedCount: 0, sourceConflictCount: 0,
    },
    perType: {
      sites: { create: 0, update: 0, skip: 0 },
      radars: { create: 0, update: 0, skip: 0 },
      activities: { create: 0, update: 0, skip: 0 },
      contacts: { create: 0, update: 0, skip: 0 },
    },
    perWholesale: {
      radar_lifecycle: { inserted: 0, updated: 0, skipped: 0 },
      systems:         { inserted: 0, updated: 0, skipped: 0 },
    },
    decisions: [],
    sourceActions: [],
    issues: [],
  };

  // 1. Re-scan to get the authoritative set of decisions (server is the truth).
  const scan = scanForChanges(opts.parsed, {
    allowIdentityFields: opts.allowIdentityFields,
    allowCreateSites: opts.allowCreateSites ?? true,
  });

  const selectedKeys = new Set(opts.selectedKeys);
  type Bucket = { sites: RowDecision[]; radars: RowDecision[]; activities: RowDecision[]; contacts: RowDecision[] };
  const buckets: Bucket = { sites: [], radars: [], activities: [], contacts: [] };

  // Pull the original RowDecision behind each selected EntityChange. We
  // re-run the handlers (cheap) and pick the rows whose selectionKey is
  // in the user's selected set. The decisions we produce below are exactly
  // what applyDecisions will write.
  const allChanges: { node: SiteChangeNode; ch: EntityChange; bucket: keyof Bucket }[] = [];
  for (const node of scan.sites) {
    if (node.siteChange) allChanges.push({ node, ch: node.siteChange, bucket: "sites" });
    for (const ch of node.radars) allChanges.push({ node, ch, bucket: "radars" });
    for (const ch of node.activities) allChanges.push({ node, ch, bucket: "activities" });
    for (const ch of node.contacts) allChanges.push({ node, ch, bucket: "contacts" });
  }

  // For each selected EntityChange, look up the underlying parsed cell row
  // and rebuild a RowDecision from scratch (so source_id rewriting can run
  // before insert). The scan output already has fields[] which is what
  // applyDecisions consumes — copy it over.
  for (const { ch, bucket } of allChanges) {
    if (!selectedKeys.has(ch.selectionKey)) continue;
    if (ch.errors.some((e) => e.severity === "error")) {
      report.totals.skippedCount++;
      report.perType[bucket].skip++;
      report.issues.push(...ch.errors);
      continue;
    }
    buckets[bucket].push({
      sheetName: ch.sheetName,
      rowNumber: ch.rowNumber,
      entityType: ch.entityType,
      entityId: ch.entityId,
      action: ch.action,
      fields: [...ch.fields],
      errors: ch.errors,
    });
  }

  // 2. Compute source-conflict resolutions for the union of source_ids
  // referenced by the selected children. Same approach as the single-type
  // flow but extended across types.
  const referenced = new Set<string>();
  const collectSrc = (decision: RowDecision) => {
    const sid = decision.fields.find((f) => f.field === "source_id")?.newValue;
    if (sid && /^SRC-/.test(sid)) referenced.add(sid);
    const cit = decision.fields.find((f) => f.field === "citations")?.newValue;
    if (cit) for (const tok of cit.split(/[,\s]+/)) if (/^SRC-/.test(tok)) referenced.add(tok);
  };
  // For Update decisions, the field set only contains fields that CHANGED.
  // If a row references the same source_id it already references, that's
  // not in fields. So also look up the DB row for the source_id.
  const lookupDbSource = (table: string, key: string, id: string): string | undefined => {
    if (!id) return undefined;
    const row = getDb().prepare(`SELECT source_id FROM ${table} WHERE ${key} = ?`).get(id) as { source_id?: string } | undefined;
    return row?.source_id ?? undefined;
  };
  for (const d of buckets.radars) {
    collectSrc(d);
    if (d.action === "Update") {
      const sid = lookupDbSource("radars", "radar_id", d.entityId);
      if (sid && /^SRC-/.test(sid)) referenced.add(sid);
    }
  }
  for (const d of buckets.activities) {
    collectSrc(d);
    if (d.action === "Update") {
      const sid = lookupDbSource("site_range_activities", "activity_id", d.entityId);
      if (sid && /^SRC-/.test(sid)) referenced.add(sid);
    }
  }
  for (const d of buckets.contacts) collectSrc(d);
  // Sites: pick up citations too (radars cite via source_id, sites via citations).
  for (const d of buckets.sites) collectSrc(d);

  const db = getDb();
  const excelSrcById = new Map<string, ParsedRow>();
  for (const r of opts.parsed.sheets["Sources"]?.rows ?? []) {
    if (r.key) excelSrcById.set(r.key, r);
  }
  const existingSrcStmt = db.prepare("SELECT source_id, source_title, source_url FROM sources WHERE source_id = ?");
  const newSourceId = makeSourceIdGenerator(db);

  type SrcPlan = {
    original: string;
    resolution: "REUSE_EXISTING" | "CREATE_NEW" | "UPDATE_EXISTING";
    finalId: string;
    excelRow?: ParsedRow;
    existingTitle?: string | null;
    existingUrl?: string | null;
    excelTitle?: string | null;
    excelUrl?: string | null;
    wasConflict: boolean;
  };
  const srcPlans = new Map<string, SrcPlan>();

  for (const sid of Array.from(referenced).sort()) {
    const excelRow = excelSrcById.get(sid);
    const existingRow = existingSrcStmt.get(sid) as { source_id: string; source_title: string | null; source_url: string | null } | undefined;
    const excelObj: ExcelSourceLike | null = excelRow
      ? { source_id: sid, source_title: excelRow.cells["source_title"] ?? null, source_url: excelRow.cells["source_url"] ?? null }
      : null;
    const existingObj = existingRow
      ? { source_id: existingRow.source_id, source_title: existingRow.source_title, source_url: existingRow.source_url }
      : null;
    const auto = excelObj ? resolveSourceForImport(excelObj, existingObj) : (existingObj ? "REUSE_EXISTING" : "CONFLICT_REQUIRES_USER_DECISION");
    const userRes = opts.sourceResolutions[sid];
    let resolution: "REUSE_EXISTING" | "CREATE_NEW" | "UPDATE_EXISTING";
    if (auto === "REUSE_EXISTING") resolution = "REUSE_EXISTING";
    else if (auto === "CREATE_NEW") resolution = "CREATE_NEW";
    else resolution = userRes?.resolution ?? "CREATE_NEW";

    let finalId = sid;
    if (resolution === "CREATE_NEW") finalId = newSourceId(userRes?.new_source_id);

    srcPlans.set(sid, {
      original: sid, resolution, finalId, excelRow,
      existingTitle: existingRow?.source_title ?? null,
      existingUrl: existingRow?.source_url ?? null,
      excelTitle: excelRow?.cells["source_title"] ?? null,
      excelUrl: excelRow?.cells["source_url"] ?? null,
      wasConflict: auto === "CONFLICT_REQUIRES_USER_DECISION",
    });

    if (resolution === "CREATE_NEW") report.totals.sourceCreatedCount++;
    else if (resolution === "REUSE_EXISTING") report.totals.sourceReusedCount++;
    if (auto === "CONFLICT_REQUIRES_USER_DECISION") report.totals.sourceConflictCount++;
  }

  report.sourceActions = Array.from(srcPlans.values()).map((p) => ({
    original_source_id: p.original,
    existing: p.existingTitle !== undefined ? { source_title: p.existingTitle, source_url: p.existingUrl ?? null } : null,
    excel:    p.excelTitle    !== undefined ? { source_title: p.excelTitle,    source_url: p.excelUrl ?? null }    : null,
    decision: p.wasConflict ? "CONFLICT_REQUIRES_USER_DECISION" : (p.resolution === "REUSE_EXISTING" ? "REUSE_EXISTING" : "CREATE_NEW"),
    resolution: p.resolution,
    new_source_id: p.resolution === "CREATE_NEW" ? p.finalId : undefined,
  }));

  // 3. Rewrite source_id (and citations SRC-ids) on every decision's field set
  // so the post-apply rows reference the resolved finalId, not the original.
  const rewriteSrcId = (decisions: RowDecision[]) => {
    for (const d of decisions) {
      for (const f of d.fields) {
        if (f.field === "source_id" && f.newValue && srcPlans.has(f.newValue)) {
          const p = srcPlans.get(f.newValue)!;
          if (p.resolution === "CREATE_NEW") f.newValue = p.finalId;
        }
        if (f.field === "citations" && f.newValue) {
          f.newValue = f.newValue.split(/([,\s]+)/).map((tok) => {
            const stripped = tok.trim();
            if (/^SRC-/.test(stripped) && srcPlans.has(stripped)) {
              const p = srcPlans.get(stripped)!;
              return p.resolution === "CREATE_NEW" ? p.finalId : stripped;
            }
            return tok;
          }).join("");
        }
      }
    }
  };
  rewriteSrcId(buckets.sites);
  rewriteSrcId(buckets.radars);
  rewriteSrcId(buckets.activities);
  rewriteSrcId(buckets.contacts);

  // Tally totals before any DB write so preview mode also reports them.
  for (const [k, ds] of Object.entries(buckets) as [keyof Bucket, RowDecision[]][]) {
    for (const d of ds) {
      if (d.action === "Create") { report.totals.createdCount++; report.perType[k].create++; }
      else if (d.action === "Update") { report.totals.updatedCount++; report.perType[k].update++; }
    }
  }
  report.decisions = [...buckets.sites, ...buckets.radars, ...buckets.activities, ...buckets.contacts];

  // Dry-run validate the wholesale sheets so preview shows accurate
  // would-insert / would-update / would-skip counts BEFORE apply.
  //
  // Wholesale sheets (Radar_Lifecycle / Systems) frequently reference
  // radars and sites defined in the SAME workbook. Without telling the
  // dry-run about those pending creates, every lifecycle row whose
  // radar is being introduced by this very import would be marked as
  // "radar_id does not exist" — even though the apply transaction
  // would have created the radar BEFORE the wholesale upsert ran.
  //
  // We trust selection here: only count radars/sites the operator has
  // actually ticked for create. A radar that's in the workbook but
  // wasn't selected will (correctly) fail validation, matching what
  // the apply transaction would do.
  const pendingRadars = new Map<string, string>();
  const pendingSites = new Set<string>();
  for (const d of buckets.sites) {
    if (d.action === "Create" && d.entityId) pendingSites.add(d.entityId);
  }
  for (const d of buckets.radars) {
    if (d.action === "Create" && d.entityId) {
      const siteField = d.fields.find((f) => f.field === "site_id");
      pendingRadars.set(d.entityId, siteField?.newValue ?? "");
    }
  }
  {
    const lifecyclePreview = bulkUpsertLifecycleSheet(getDb(), opts.parsed, opts.changedBy ?? "import", "dryRun", pendingRadars);
    report.perWholesale.radar_lifecycle.inserted = lifecyclePreview.inserted;
    report.perWholesale.radar_lifecycle.updated  = lifecyclePreview.updated;
    report.perWholesale.radar_lifecycle.skipped  = lifecyclePreview.skipped;
    report.totals.errorCount += lifecyclePreview.issues.filter((i) => i.severity === "error").length;
    if (opts.mode === "preview") report.issues.push(...lifecyclePreview.issues);

    const systemsPreview = bulkUpsertSystemsSheet(getDb(), opts.parsed, opts.changedBy ?? "import", "dryRun", pendingSites);
    report.perWholesale.systems.inserted = systemsPreview.inserted;
    report.perWholesale.systems.updated  = systemsPreview.updated;
    report.perWholesale.systems.skipped  = systemsPreview.skipped;
    report.totals.errorCount += systemsPreview.issues.filter((i) => i.severity === "error").length;
    if (opts.mode === "preview") report.issues.push(...systemsPreview.issues);
  }

  if (opts.mode === "preview") {
    report.status = report.totals.errorCount > 0 ? "Pending" : "Completed";
    report.completedAt = new Date().toISOString();
    persistSelectiveBatch({ ...report, importType: "multi" } as unknown as SelectiveImportReport);
    return report;
  }

  // 4. Apply: backup + transaction.
  try {
    report.backupPath = backupDatabase();
  } catch (err) {
    report.status = "Failed";
    report.errorMessage = `Backup failed: ${(err as Error).message}`;
    report.completedAt = new Date().toISOString();
    persistSelectiveBatch({ ...report, importType: "multi" } as unknown as SelectiveImportReport);
    return report;
  }

  try {
    transaction((txDb) => {
      const insAudit = txDb.prepare(`
        INSERT INTO audit_log
          (entity_type, entity_id, action, field_name, old_value, new_value, changed_by, import_batch_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      // Sources first.
      for (const plan of srcPlans.values()) {
        if (plan.resolution === "CREATE_NEW") {
          const row = plan.excelRow;
          if (!row) continue;
          txDb.prepare(`
            INSERT INTO sources (source_id, source_title, source_url, source_type, publisher, publication_date, access_date, reliability_score, notes, notebook_uuid)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            plan.finalId,
            row.cells["source_title"] ?? null,
            row.cells["source_url"] ?? null,
            row.cells["source_type"] ?? null,
            row.cells["publisher"] ?? null,
            row.cells["publication_date"] ?? null,
            row.cells["access_date"] ?? null,
            row.cells["reliability_score"] ? Number(row.cells["reliability_score"]) : null,
            row.cells["notes"] ?? null,
            row.cells["notebook_uuid"] ?? null,
          );
          insAudit.run(
            "Source", plan.finalId, "Create", null, null,
            JSON.stringify({ original_source_id: plan.original, source_title: row.cells["source_title"], source_url: row.cells["source_url"] }),
            opts.changedBy ?? "import", batchId,
          );
        } else if (plan.resolution === "UPDATE_EXISTING") {
          const row = plan.excelRow;
          if (!row) continue;
          txDb.prepare(`
            UPDATE sources SET source_title = ?, source_url = ?, source_type = COALESCE(?, source_type), publisher = COALESCE(?, publisher)
            WHERE source_id = ?
          `).run(
            row.cells["source_title"] ?? null,
            row.cells["source_url"] ?? null,
            row.cells["source_type"] ?? null,
            row.cells["publisher"] ?? null,
            plan.original,
          );
          insAudit.run(
            "Source", plan.original, "Update", "source_title/source_url",
            JSON.stringify({ source_title: plan.existingTitle, source_url: plan.existingUrl }),
            JSON.stringify({ source_title: row.cells["source_title"], source_url: row.cells["source_url"] }),
            opts.changedBy ?? "import", batchId,
          );
        }
      }
      // Conflict log rows.
      const insConflict = txDb.prepare(`
        INSERT INTO import_source_conflicts
          (import_batch_id, original_source_id, existing_source_title, existing_source_url,
           excel_source_title, excel_source_url, resolution, new_source_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const plan of srcPlans.values()) {
        insConflict.run(
          batchId, plan.original, plan.existingTitle ?? null, plan.existingUrl ?? null,
          plan.excelTitle ?? null, plan.excelUrl ?? null, plan.resolution,
          plan.resolution === "CREATE_NEW" ? plan.finalId : null,
        );
      }
      // CRITICAL ORDER: Sites first (so new sites exist for FKs from children),
      // then radars / activities / contacts.
      applyDecisions(txDb, buckets.sites, batchId, opts.changedBy ?? "import");
      applyDecisions(txDb, buckets.radars, batchId, opts.changedBy ?? "import");
      applyDecisions(txDb, buckets.activities, batchId, opts.changedBy ?? "import");
      applyDecisions(txDb, buckets.contacts, batchId, opts.changedBy ?? "import");

      // Wholesale sheets last (they need Sites+Radars to be in place for
      // FK validation). No wizard diff — bulk INSERT-OR-REPLACE, errors
      // collected per row.
      const lifecycleResult = bulkUpsertLifecycleSheet(txDb, opts.parsed, opts.changedBy ?? "import");
      report.perWholesale.radar_lifecycle.inserted = lifecycleResult.inserted;
      report.perWholesale.radar_lifecycle.updated  = lifecycleResult.updated;
      report.perWholesale.radar_lifecycle.skipped  = lifecycleResult.skipped;
      report.issues.push(...lifecycleResult.issues);

      const systemsResult = bulkUpsertSystemsSheet(txDb, opts.parsed, opts.changedBy ?? "import");
      report.perWholesale.systems.inserted = systemsResult.inserted;
      report.perWholesale.systems.updated  = systemsResult.updated;
      report.perWholesale.systems.skipped  = systemsResult.skipped;
      report.issues.push(...systemsResult.issues);
    });
    report.status = "Completed";
  } catch (err) {
    report.status = "Failed";
    report.errorMessage = `Apply failed (transaction rolled back): ${(err as Error).message}`;
  }
  report.completedAt = new Date().toISOString();
  persistSelectiveBatch({ ...report, importType: "multi" } as unknown as SelectiveImportReport);
  return report;
}
