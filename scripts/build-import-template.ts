/**
 * Generate `data/import-template.xlsx` — a ready-to-fill Excel template
 * that the operator can use as a starting point for any new bulk import.
 *
 * The schema (sheet names, column order, enum values) MUST stay in sync
 * with `src/lib/excel-parser.ts` and `scripts/import-excel-update.ts`,
 * since those are the readers. If you change a sheet or column there,
 * re-run this script to regenerate the template.
 *
 * Each sheet contains:
 *   - A styled header row (bold, frozen) using the exact column names
 *     the parser reads (case-insensitive lookup, lowercased internally).
 *   - 1-2 realistic example rows so the operator sees the format.
 *   - Data validation (dropdowns) on every enum column. Applied to a
 *     200-row range so the operator can paste lots of rows and still get
 *     the dropdown affordance.
 *
 * Run with:   npx tsx scripts/build-import-template.ts
 * Or:         npm run build:template
 */
import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";

const OUTPUT_PATH = path.join(process.cwd(), "data", "import-template.xlsx");

// ---------------------------------------------------------------------------
// Enum dictionaries — single source of truth for both the dropdowns AND the
// example rows below.
// ---------------------------------------------------------------------------
const SITE_TYPES = ["Range", "Base", "Launch Site", "Radar Site", "Tracking Station", "Test Facility", "Other"];
const SIZE_CATEGORIES = ["Small", "Medium", "Large", "Strategic / Mega"];
const COORDINATE_TYPES = ["Site centroid", "Public entrance", "Admin office", "Public marker", "Unknown"];
const CONFIDENCE_LEVELS = ["High", "Medium", "Low"];
const RECORD_STATUSES = ["Draft", "Verified", "Needs Review", "Published", "Archived"];
const RADAR_TYPES = ["Tracking", "Surveillance", "Fire-control", "Phased-array", "Telemetry", "Weather/range radar", "Unknown"];
const OPERATIONAL_STATUSES = ["Active", "Inactive", "Historical", "Unknown"];
const SYSTEM_CATEGORIES = [
  "Optical Tracking",
  "Telemetry / Range Safety",
  "Electronic Warfare",
  "Communications",
  "Command & Control",
  "Test Instrumentation",
  "Weapons Test",
  "Other",
];
const LIFECYCLE_EVENT_TYPES = [
  "Procurement specification",
  "Procurement award",
  "Contract award",
  "Delivery / modernization",
  "Acceptance",
  "Commissioning",
  "Planned acquisition",
  "Historical reference",
  "Decommissioning",
  "Other",
];
const CURRENCIES = ["USD", "EUR", "SEK", "NOK", "DKK", "GBP", "ILS", "JPY", "Other"];
const ACTIVITY_CATEGORIES = ["Missile Test", "Space Launch", "Radar Tracking", "Telemetry", "Missile Defense", "Range Safety", "Aerospace Test", "Other"];
const ACTIVITY_STATUSES = ["Current", "Historical", "Planned", "Unknown"];
const SOURCE_TYPES = ["Official", "Government", "Contractor", "News", "Academic", "Industry", "Other"];
const CONTACT_TYPES = ["Public Affairs", "Media", "Visitor Office", "Contracting", "General Info", "Other"];

// ---------------------------------------------------------------------------
// Column definitions. `enum` is the dropdown list (if any). Headers map 1:1
// to the parser's expected keys, which it lowercases on read — so the case
// here is purely a display convention.
// ---------------------------------------------------------------------------
interface Col {
  header: string;
  required?: boolean;
  enum?: string[];
  /** Display width hint, in Excel character units. */
  width?: number;
}

const SHEETS: Array<{ name: string; columns: Col[]; examples: Array<Record<string, unknown>> }> = [
  {
    name: "Sites",
    columns: [
      { header: "site_id", required: true, width: 14 },
      { header: "site_name", required: true, width: 32 },
      { header: "site_type", required: true, enum: SITE_TYPES, width: 16 },
      { header: "size_category", required: true, enum: SIZE_CATEGORIES, width: 18 },
      { header: "size_score", width: 11 },
      { header: "country", width: 12 },
      { header: "state", width: 16 },
      { header: "latitude", required: true, width: 11 },
      { header: "longitude", required: true, width: 11 },
      { header: "coordinate_type", enum: COORDINATE_TYPES, width: 18 },
      { header: "managing_organization", required: true, width: 30 },
      { header: "operator", width: 22 },
      { header: "missile_relevance", width: 22 },
      { header: "launch_relevance", width: 22 },
      { header: "radar_relevance", width: 22 },
      { header: "public_contact_email", width: 28 },
      { header: "public_contact_phone", width: 18 },
      { header: "website", width: 36 },
      { header: "description", required: true, width: 48 },
      { header: "confidence_level", required: true, enum: CONFIDENCE_LEVELS, width: 16 },
      { header: "last_verified_date", width: 16 },
      { header: "record_status", required: true, enum: RECORD_STATUSES, width: 16 },
      { header: "citations", width: 24 },
    ],
    examples: [
      {
        site_id: "SITE-0001",
        site_name: "White Sands Missile Range",
        site_type: "Range",
        size_category: "Strategic / Mega",
        size_score: 95,
        country: "USA",
        state: "New Mexico",
        latitude: 32.395,
        longitude: -106.483,
        coordinate_type: "Site centroid",
        managing_organization: "U.S. Army",
        operator: "U.S. Army Test and Evaluation Command",
        missile_relevance: "Primary missile test range",
        launch_relevance: "Suborbital launches",
        radar_relevance: "Multiple long-range tracking radars",
        public_contact_email: "wsmr.pao@army.mil",
        public_contact_phone: "+1-575-678-2716",
        website: "https://www.wsmr.army.mil",
        description: "America's largest overland test range. Hosts missile testing, space launches, and high-altitude balloon operations across ~8,300 km².",
        confidence_level: "High",
        last_verified_date: "2026-01-15",
        record_status: "Published",
        citations: "U.S. Army Public Affairs (2025)",
      },
      {
        site_id: "SITE-0002",
        site_name: "Vandenberg Space Force Base",
        site_type: "Launch Site",
        size_category: "Strategic / Mega",
        size_score: 92,
        country: "USA",
        state: "California",
        latitude: 34.742,
        longitude: -120.572,
        coordinate_type: "Public entrance",
        managing_organization: "U.S. Space Force",
        operator: "Space Launch Delta 30",
        missile_relevance: "ICBM test launches",
        launch_relevance: "Polar-orbit satellite launches",
        radar_relevance: "Range surveillance radars",
        public_contact_email: "30sw.pa@spaceforce.mil",
        public_contact_phone: "+1-805-606-3595",
        website: "https://www.vandenberg.spaceforce.mil",
        description: "West-coast launch facility for polar orbit and high-inclination missions. Hosts SpaceX, Firefly, and ULA launches plus ICBM test programs.",
        confidence_level: "High",
        last_verified_date: "2026-02-20",
        record_status: "Published",
        citations: "DoD Public Affairs (2025)",
      },
    ],
  },
  {
    name: "Radars",
    columns: [
      { header: "radar_id", required: true, width: 14 },
      { header: "site_id", required: true, width: 14 },
      { header: "radar_name", required: true, width: 28 },
      { header: "radar_model", width: 18 },
      { header: "radar_type", required: true, enum: RADAR_TYPES, width: 20 },
      { header: "frequency_band", width: 14 },
      { header: "purpose", required: true, width: 28 },
      { header: "owner", width: 22 },
      { header: "operator", width: 22 },
      { header: "manufacturer", width: 22 },
      { header: "installation_date", width: 16 },
      { header: "upgrade_date", width: 16 },
      { header: "fix_date", width: 14 },
      { header: "operational_status", required: true, enum: OPERATIONAL_STATUSES, width: 16 },
      { header: "public_description", required: true, width: 48 },
      { header: "confidence_level", required: true, enum: CONFIDENCE_LEVELS, width: 16 },
      { header: "last_verified_date", width: 16 },
      { header: "source_id", width: 14 },
      { header: "record_status", required: true, enum: RECORD_STATUSES, width: 16 },
      { header: "citations", width: 24 },
    ],
    examples: [
      {
        radar_id: "RAD-0001",
        site_id: "SITE-0001",
        radar_name: "AN/MPS-39 MOTR",
        radar_model: "AN/MPS-39",
        radar_type: "Tracking",
        frequency_band: "C-band",
        purpose: "Range tracking of missile and aircraft tests",
        owner: "U.S. Army",
        operator: "U.S. Army",
        manufacturer: "Raytheon",
        installation_date: "1986-06-01",
        upgrade_date: "2010-09-15",
        operational_status: "Active",
        public_description: "Multiple Object Tracking Radar used to track multiple targets simultaneously during range operations.",
        confidence_level: "High",
        last_verified_date: "2026-01-15",
        source_id: "SRC-0001",
        record_status: "Published",
        citations: "U.S. Army FOIA release (2024)",
      },
    ],
  },
  {
    name: "Radar_Lifecycle",
    columns: [
      { header: "event_id", required: true, width: 22 },
      { header: "radar_id", required: true, width: 16 },
      { header: "site_id", required: true, width: 14 },
      { header: "event_type", required: true, enum: LIFECYCLE_EVENT_TYPES, width: 26 },
      { header: "event_date", width: 14 },
      { header: "event_year", width: 11 },
      { header: "event_title", width: 36 },
      { header: "event_description", width: 48 },
      { header: "authority_or_owner", width: 26 },
      { header: "supplier_or_contractor", width: 26 },
      { header: "disclosed_value", width: 18 },
      { header: "currency", enum: CURRENCIES, width: 12 },
      { header: "value_scope", width: 36 },
      { header: "evidence_status", width: 28 },
      { header: "source_ids", width: 24 },
      { header: "analyst_note", width: 36 },
    ],
    examples: [
      {
        event_id: "EVT-RAD-0137-001",
        radar_id: "RAD-0137-001",
        site_id: "SITE-0137",
        event_type: "Procurement award",
        event_date: "2018-02-23",
        event_year: 2018,
        event_title: "Reported FMV award for radar with optical tracking",
        event_description: "A procurement mirror reports award UH-2017-39 to Weibel including delivery of optical-precision tracking systems for the Vidsel range.",
        authority_or_owner: "FMV",
        supplier_or_contractor: "Weibel Scientific A/S",
        disclosed_value: "195583823",
        currency: "SEK",
        value_scope: "Mirror-reported total contract value including peripherals.",
        evidence_status: "Reported by procurement mirror; Confirmed by official FMV release.",
        source_ids: "SRC-0006",
        analyst_note: "The award date must not be entered as the installation or commissioning date.",
      },
      {
        event_id: "EVT-RAD-0137-002",
        radar_id: "RAD-0137-001",
        site_id: "SITE-0137",
        event_type: "Delivery / modernization",
        event_date: "",
        event_year: 2021,
        event_title: "First of two combined radar-optical precision systems received",
        event_description: "FMV reported receipt of the first of two mobile systems combining radar and optical precision tracking in 2021.",
        authority_or_owner: "FMV",
        supplier_or_contractor: "Weibel Scientific A/S",
        disclosed_value: ">100000000",
        currency: "SEK",
        value_scope: "FMV's published 2021 investment in Vidsel FMV radar systems and new test capabilities.",
        evidence_status: "Confirmed by official FMV and manufacturer sources.",
        source_ids: "SRC-0014, SRC-0015",
        analyst_note: "Exact model designation, exact commissioning date, and cost allocated to the system not disclosed publicly.",
      },
    ],
  },
  {
    name: "Systems",
    columns: [
      { header: "system_id", required: true, width: 16 },
      { header: "site_id", required: true, width: 14 },
      { header: "system_name", required: true, width: 36 },
      { header: "system_category", required: true, enum: SYSTEM_CATEGORIES, width: 22 },
      { header: "purpose", width: 40 },
      { header: "owner", width: 26 },
      { header: "operator", width: 26 },
      { header: "manufacturer", width: 22 },
      { header: "operational_status", required: true, enum: OPERATIONAL_STATUSES, width: 16 },
      { header: "public_description", width: 48 },
      { header: "confidence_level", required: true, enum: CONFIDENCE_LEVELS, width: 16 },
      { header: "last_verified_date", width: 16 },
      { header: "source_id", width: 14 },
      { header: "citations", width: 24 },
      { header: "record_status", required: true, enum: RECORD_STATUSES, width: 16 },
    ],
    examples: [
      {
        system_id: "SYS-0001-001",
        site_id: "SITE-0001",
        system_name: "Optical tracking systems and kinetheodolites",
        system_category: "Optical Tracking",
        purpose: "Optical trajectory measurement, separation and impact imaging",
        owner: "Swedish Defence Materiel Administration (FMV)",
        operator: "FMV Test & Evaluation, Vidsel",
        manufacturer: "Not publicly disclosed",
        operational_status: "Active",
        public_description: "FMV lists optical tracking systems as current Vidsel instrumentation.",
        confidence_level: "High",
        last_verified_date: "2026-06-13",
        source_id: "SRC-0002",
        citations: "SRC-0002, SRC-0014",
        record_status: "Published",
      },
      {
        system_id: "SYS-0001-002",
        site_id: "SITE-0001",
        system_name: "Telemetry ground systems and Flight Termination",
        system_category: "Telemetry / Range Safety",
        purpose: "Receive onboard test data and support range-safety flight termination",
        owner: "Swedish Defence Materiel Administration (FMV)",
        operator: "FMV Test & Evaluation, Vidsel",
        manufacturer: "Not publicly disclosed",
        operational_status: "Active",
        public_description: "FMV's current capability page lists telemetry and a Flight Termination system.",
        confidence_level: "High",
        last_verified_date: "2026-06-13",
        source_id: "SRC-0002",
        citations: "SRC-0002, SRC-0016",
        record_status: "Published",
      },
    ],
  },
  {
    name: "Site_Activities",
    columns: [
      { header: "activity_id", required: true, width: 14 },
      { header: "site_id", required: true, width: 14 },
      { header: "activity_category", required: true, enum: ACTIVITY_CATEGORIES, width: 20 },
      { header: "activity_description", required: true, width: 48 },
      { header: "missile_or_system_type", width: 24 },
      { header: "start_year", width: 11 },
      { header: "end_year", width: 11 },
      { header: "status", required: true, enum: ACTIVITY_STATUSES, width: 14 },
      { header: "source_id", width: 14 },
      { header: "confidence_level", required: true, enum: CONFIDENCE_LEVELS, width: 16 },
    ],
    examples: [
      {
        activity_id: "ACT-0001",
        site_id: "SITE-0001",
        activity_category: "Missile Test",
        activity_description: "Patriot PAC-3 interceptor flight tests against ballistic targets",
        missile_or_system_type: "Patriot PAC-3",
        start_year: 2003,
        end_year: 2025,
        status: "Current",
        source_id: "SRC-0001",
        confidence_level: "High",
      },
      {
        activity_id: "ACT-0002",
        site_id: "SITE-0002",
        activity_category: "Space Launch",
        activity_description: "Falcon 9 polar-orbit Starlink shell launches",
        missile_or_system_type: "Falcon 9 / Starlink",
        start_year: 2021,
        end_year: 2026,
        status: "Current",
        source_id: "SRC-0001",
        confidence_level: "High",
      },
    ],
  },
  {
    name: "Sources",
    columns: [
      { header: "source_id", required: true, width: 14 },
      { header: "source_title", required: true, width: 40 },
      { header: "source_url", width: 40 },
      { header: "source_type", required: true, enum: SOURCE_TYPES, width: 16 },
      { header: "publisher", width: 24 },
      { header: "publication_date", width: 16 },
      { header: "access_date", required: true, width: 16 },
      { header: "reliability_score", width: 14 },
      { header: "notes", width: 36 },
      { header: "notebook_uuid", width: 24 },
    ],
    examples: [
      {
        source_id: "SRC-0001",
        source_title: "DoD Public Affairs annual range posture statement (2025)",
        source_url: "https://www.defense.gov/News/Releases/Release/Article/...",
        source_type: "Official",
        publisher: "U.S. Department of Defense",
        publication_date: "2025-04-12",
        access_date: "2026-01-15",
        reliability_score: 95,
        notes: "Annual unclassified posture statement covering test ranges and active programs.",
        notebook_uuid: "",
      },
    ],
  },
  {
    name: "Contacts",
    columns: [
      { header: "contact_id", required: true, width: 14 },
      { header: "site_id", required: true, width: 14 },
      { header: "organization_name", required: true, width: 30 },
      { header: "contact_type", enum: CONTACT_TYPES, width: 18 },
      { header: "contact_email", width: 28 },
      { header: "contact_phone", width: 18 },
      { header: "contact_url", width: 36 },
      { header: "notes", width: 36 },
      { header: "source_id", width: 14 },
    ],
    examples: [
      {
        contact_id: "CON-0001",
        site_id: "SITE-0001",
        organization_name: "White Sands Public Affairs Office",
        contact_type: "Public Affairs",
        contact_email: "wsmr.pao@army.mil",
        contact_phone: "+1-575-678-2716",
        contact_url: "https://www.wsmr.army.mil/Contact",
        notes: "Primary point of contact for unclassified inquiries.",
        source_id: "SRC-0001",
      },
    ],
  },
];

/** Quote a value for use in an Excel "list" data-validation formula. */
function listFormula(values: string[]): string {
  // Excel data-validation list formulas use a comma-separated quoted string.
  // Quotes inside values are escaped by doubling per Excel convention. None of
  // our enum values currently contain quotes, but we encode defensively in
  // case future enum values do.
  const safe = values.map((v) => v.replace(/"/g, '""')).join(",");
  return `"${safe}"`;
}


function buildSheet(workbook: ExcelJS.Workbook, def: typeof SHEETS[number]) {
  const ws = workbook.addWorksheet(def.name, {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  // Configure columns: width + key (used by examples that pass in objects
  // keyed by column header).
  ws.columns = def.columns.map((c) => ({
    header: c.header,
    key: c.header,
    width: c.width ?? 18,
  }));

  // Style the header row.
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1F2937" }, // slate-800 — matches the app's navbar
  };
  headerRow.alignment = { vertical: "middle", horizontal: "left" };
  headerRow.height = 22;

  // Tag required columns with a light amber background on the header so the
  // operator can see which ones must be filled.
  def.columns.forEach((c, i) => {
    if (c.required) {
      const cell = headerRow.getCell(i + 1);
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF92400E" }, // amber-800
      };
      cell.note = `${c.header} is REQUIRED.`;
    }
    if (c.enum) {
      const cell = headerRow.getCell(i + 1);
      cell.note = (cell.note ?? "") + `\nAllowed values: ${c.enum.join(", ")}`;
    }
  });

  // Write example rows.
  def.examples.forEach((row) => ws.addRow(row));

  // Apply data validation (dropdowns) on every enum column, covering rows
  // 2..201 so the operator can paste large batches without losing the
  // dropdown affordance.
  def.columns.forEach((c, i) => {
    if (!c.enum) return;
    const colLetter = excelColumnLetter(i + 1);
    for (let r = 2; r <= 201; r++) {
      ws.getCell(`${colLetter}${r}`).dataValidation = {
        type: "list",
        allowBlank: !c.required,
        formulae: [listFormula(c.enum)],
        showErrorMessage: true,
        errorStyle: "stop",
        errorTitle: "Invalid value",
        error: `Must be one of: ${c.enum.join(", ")}`,
      };
    }
  });

  return ws;
}


/** Convert a 1-based column index to Excel letter form (1 -> A, 27 -> AA). */
function excelColumnLetter(idx: number): string {
  let s = "";
  while (idx > 0) {
    const m = (idx - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    idx = Math.floor((idx - 1) / 26);
  }
  return s;
}


async function main() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "LAPAM Ranges App";
  workbook.created = new Date();
  workbook.modified = new Date();

  // Prepend an instructions sheet so the operator opens to a friendly
  // overview rather than the Sites data straight away.
  const intro = workbook.addWorksheet("Instructions", {
    properties: { tabColor: { argb: "FF3B82F6" } },
  });
  intro.columns = [{ width: 110 }];
  const lines: Array<{ text: string; bold?: boolean; size?: number; color?: string }> = [
    { text: "LAPAM Ranges App — Import Template", bold: true, size: 16 },
    { text: "" },
    { text: "This workbook is the canonical template for importing data into the app." },
    { text: "Fill out only the sheets you need — each sheet maps 1:1 to a database table." },
    { text: "" },
    { text: "Sheets", bold: true, size: 12 },
    { text: "  • Sites             — every test range / launch site / radar facility / etc." },
    { text: "  • Radars            — radars installed at a Site (Radars.site_id must exist in Sites)" },
    { text: "  • Radar_Lifecycle   — procurement / contract / delivery / acceptance / decommissioning events per Radar" },
    { text: "  • Systems           — non-radar instrumentation: optical tracking, telemetry, EW, C2, etc." },
    { text: "  • Site_Activities   — operational/historical activities at a Site" },
    { text: "  • Sources           — every citation referenced by the rows above" },
    { text: "  • Contacts          — public-affairs / liaison contacts per Site" },
    { text: "" },
    { text: "Rules", bold: true, size: 12 },
    { text: "  • Header row is FROZEN. Do not edit row 1 column names." },
    { text: "  • Columns with an amber header are REQUIRED." },
    { text: "  • Enum columns have a dropdown — use it. Other values will be rejected on import." },
    { text: "  • Dates: YYYY-MM-DD (e.g. 2026-01-15) or ISO 8601." },
    { text: "  • Coordinates: latitude in -90..90, longitude in -180..180. Decimal degrees." },
    { text: "  • Sample rows are provided as a guide — DELETE THEM before importing your data." },
    { text: "  • Empty rows are skipped by the parser." },
    { text: "" },
    { text: "How to import", bold: true, size: 12 },
    { text: "  1. Save this file (xlsx)." },
    { text: "  2. Open the app → Import tab → \"Choose file\" and select your workbook." },
    { text: "  3. The Import wizard will preview validation errors before applying anything." },
    { text: "  4. Source conflicts (existing source_id with different fields) are surfaced for review." },
    { text: "" },
    { text: "Hover any column header for its allowed values and required/optional status.", color: "FF6B7280" },
  ];
  lines.forEach((l, idx) => {
    const row = intro.getRow(idx + 1);
    const cell = row.getCell(1);
    cell.value = l.text;
    cell.font = {
      bold: l.bold ?? false,
      size: l.size ?? 11,
      color: l.color ? { argb: l.color } : undefined,
    };
    row.alignment = { vertical: "middle" };
  });

  // Build the data sheets.
  for (const def of SHEETS) buildSheet(workbook, def);

  await workbook.xlsx.writeFile(OUTPUT_PATH);
  const size = fs.statSync(OUTPUT_PATH).size;
  console.log(`Wrote ${path.relative(process.cwd(), OUTPUT_PATH)} (${(size / 1024).toFixed(1)} KB)`);
  console.log(`  Sheets: ${["Instructions", ...SHEETS.map((s) => s.name)].join(", ")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
