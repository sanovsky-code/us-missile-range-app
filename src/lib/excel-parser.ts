import ExcelJS from "exceljs";
import { Site, Radar, SiteActivity, Source, Contact, ImportResult, ValidationError } from "./types";
import { validateSites, validateRadars, validateActivities, validateSources, validateContacts } from "./validators";

function sanitize(value: unknown): string {
  if (value == null) return "";
  // Numbers are safe by definition - no formula injection possible
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return String(value);
  let str = String(value).trim();
  // Apply formula injection prevention only to non-numeric string values (SEC-008)
  if (/^[=+@]/.test(str)) {
    str = "'" + str;
  } else if (/^-/.test(str) && isNaN(Number(str))) {
    // Only treat leading-minus as suspicious if the string is NOT a number
    str = "'" + str;
  }
  return str;
}

function numOrNull(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  const n = Number(value);
  return isNaN(n) ? undefined : n;
}

function readSheet<T>(worksheet: ExcelJS.Worksheet, mapper: (row: Record<string, string>, index: number) => T): T[] {
  const headers: string[] = [];
  const headerRow = worksheet.getRow(1);
  headerRow.eachCell((cell, colNumber) => {
    headers[colNumber] = sanitize(cell.value).toLowerCase().trim();
  });

  const results: T[] = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const record: Record<string, string> = {};
    row.eachCell((cell, colNumber) => {
      const key = headers[colNumber];
      if (key) {
        record[key] = sanitize(cell.value);
      }
    });
    // Skip completely empty rows
    if (Object.values(record).some((v) => v !== "" && v !== "'")) {
      results.push(mapper(record, rowNumber));
    }
  });

  return results;
}

function parseSite(r: Record<string, string>): Site {
  return {
    site_id: r.site_id || "",
    site_name: r.site_name || "",
    site_type: r.site_type || "",
    size_category: r.size_category || "",
    size_score: numOrNull(r.size_score),
    country: r.country || "USA",
    state: r.state || "",
    latitude: Number(r.latitude) || 0,
    longitude: Number(r.longitude) || 0,
    coordinate_type: r.coordinate_type || "Unknown",
    managing_organization: r.managing_organization || "",
    operator: r.operator || undefined,
    missile_relevance: r.missile_relevance || undefined,
    launch_relevance: r.launch_relevance || undefined,
    radar_relevance: r.radar_relevance || undefined,
    public_contact_email: r.public_contact_email || undefined,
    public_contact_phone: r.public_contact_phone || undefined,
    website: r.website || undefined,
    description: r.description || "",
    citations: r.citations || undefined,
    confidence_level: r.confidence_level || "",
    last_verified_date: r.last_verified_date || "",
    record_status: r.record_status || "Draft",
  };
}

function parseRadar(r: Record<string, string>): Radar {
  return {
    radar_id: r.radar_id || "",
    site_id: r.site_id || "",
    radar_name: r.radar_name || "",
    radar_model: r.radar_model || undefined,
    radar_type: r.radar_type || "",
    frequency_band: r.frequency_band || undefined,
    purpose: r.purpose || "",
    owner: r.owner || undefined,
    operator: r.operator || undefined,
    manufacturer: r.manufacturer || undefined,
    installation_date: r.installation_date || undefined,
    upgrade_date: r.upgrade_date || undefined,
    fix_date: r.fix_date || undefined,
    operational_status: r.operational_status || "",
    public_description: r.public_description || "",
    citations: r.citations || undefined,
    confidence_level: r.confidence_level || "",
    last_verified_date: r.last_verified_date || "",
    source_id: r.source_id || "",
    record_status: r.record_status || "Draft",
  };
}

function parseActivity(r: Record<string, string>): SiteActivity {
  return {
    activity_id: r.activity_id || "",
    site_id: r.site_id || "",
    activity_category: r.activity_category || "",
    activity_description: r.activity_description || "",
    missile_or_system_type: r.missile_or_system_type || undefined,
    start_year: numOrNull(r.start_year),
    end_year: numOrNull(r.end_year),
    status: r.status || "",
    source_id: r.source_id || "",
    confidence_level: r.confidence_level || "",
  };
}

function parseSource(r: Record<string, string>): Source {
  return {
    source_id: r.source_id || "",
    source_title: r.source_title || "",
    source_url: r.source_url || "",
    source_type: r.source_type || "",
    publisher: r.publisher || undefined,
    publication_date: r.publication_date || undefined,
    access_date: r.access_date || "",
    reliability_score: numOrNull(r.reliability_score),
    notes: r.notes || undefined,
  };
}

function parseContact(r: Record<string, string>): Contact {
  return {
    contact_id: r.contact_id || "",
    site_id: r.site_id || "",
    organization_name: r.organization_name || "",
    contact_type: r.contact_type || "",
    contact_email: r.contact_email || undefined,
    contact_phone: r.contact_phone || undefined,
    contact_url: r.contact_url || undefined,
    notes: r.notes || undefined,
    source_id: r.source_id || "",
  };
}

const REQUIRED_SHEETS = ["Sites", "Radars", "Site_Activities", "Sources", "Contacts"];

export async function parseAndValidateExcel(buffer: ArrayBuffer | Buffer): Promise<ImportResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as ArrayBuffer);

  const sheetErrors: ValidationError[] = [];

  // Check required sheets exist
  const sheetNames = workbook.worksheets.map((ws) => ws.name);
  for (const required of REQUIRED_SHEETS) {
    if (!sheetNames.includes(required)) {
      sheetErrors.push({
        sheet: required,
        row: 0,
        field: "",
        value: "",
        rule: "missing_sheet",
        message: `Required sheet "${required}" not found in Excel file`,
        severity: "error",
      });
    }
  }

  if (sheetErrors.length > 0) {
    return {
      success: false,
      sites: [],
      radars: [],
      activities: [],
      contacts: [],
      sources: [],
      errors: sheetErrors,
      warnings: [],
    };
  }

  const sites = readSheet(workbook.getWorksheet("Sites")!, parseSite);
  const radars = readSheet(workbook.getWorksheet("Radars")!, parseRadar);
  const activities = readSheet(workbook.getWorksheet("Site_Activities")!, parseActivity);
  const sources = readSheet(workbook.getWorksheet("Sources")!, parseSource);
  const contacts = readSheet(workbook.getWorksheet("Contacts")!, parseContact);

  const siteIds = new Set(sites.map((s) => s.site_id));
  const sourceIds = new Set(sources.map((s) => s.source_id));

  const allErrors = [
    ...validateSources(sources),
    ...validateSites(sites),
    ...validateRadars(radars, siteIds, sourceIds),
    ...validateActivities(activities, siteIds, sourceIds),
    ...validateContacts(contacts, siteIds, sourceIds),
  ];

  const errors = allErrors.filter((e) => e.severity === "error");
  const warnings = allErrors.filter((e) => e.severity === "warning");

  return {
    success: errors.length === 0,
    sites,
    radars,
    activities,
    contacts,
    sources,
    errors,
    warnings,
  };
}
