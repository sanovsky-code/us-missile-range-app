import ExcelJS from "exceljs";
import { Site, Radar, SiteActivity, Source, Contact } from "./types";

/**
 * Build an .xlsx workbook in memory and return its binary contents.
 * Used by the /api/download route to stream a fresh export.
 */
export async function buildWorkbook(
  sites: Site[],
  radars: Radar[],
  activities: SiteActivity[],
  sources: Source[],
  contacts: Contact[],
): Promise<Buffer> {
  const workbook = buildWorkbookInstance(sites, radars, activities, sources, contacts);
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

/** Write the same workbook to a file path. Kept for ad-hoc scripts. */
export async function writeDataToExcel(
  filePath: string,
  sites: Site[],
  radars: Radar[],
  activities: SiteActivity[],
  sources: Source[],
  contacts: Contact[],
): Promise<void> {
  const workbook = buildWorkbookInstance(sites, radars, activities, sources, contacts);
  await workbook.xlsx.writeFile(filePath);
}

function buildWorkbookInstance(
  sites: Site[],
  radars: Radar[],
  activities: SiteActivity[],
  sources: Source[],
  contacts: Contact[],
): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "US Missile Range App";
  workbook.created = new Date();

  const sitesSheet = workbook.addWorksheet("Sites");
  sitesSheet.columns = [
    { header: "site_id", key: "site_id", width: 12 },
    { header: "site_name", key: "site_name", width: 40 },
    { header: "site_type", key: "site_type", width: 15 },
    { header: "size_category", key: "size_category", width: 18 },
    { header: "size_score", key: "size_score", width: 12 },
    { header: "country", key: "country", width: 8 },
    { header: "state", key: "state", width: 18 },
    { header: "latitude", key: "latitude", width: 12 },
    { header: "longitude", key: "longitude", width: 12 },
    { header: "coordinate_type", key: "coordinate_type", width: 16 },
    { header: "managing_organization", key: "managing_organization", width: 40 },
    { header: "operator", key: "operator", width: 30 },
    { header: "missile_relevance", key: "missile_relevance", width: 60 },
    { header: "launch_relevance", key: "launch_relevance", width: 60 },
    { header: "radar_relevance", key: "radar_relevance", width: 60 },
    { header: "public_contact_email", key: "public_contact_email", width: 30 },
    { header: "public_contact_phone", key: "public_contact_phone", width: 20 },
    { header: "website", key: "website", width: 50 },
    { header: "description", key: "description", width: 80 },
    { header: "citations", key: "citations", width: 60 },
    { header: "confidence_level", key: "confidence_level", width: 15 },
    { header: "last_verified_date", key: "last_verified_date", width: 16 },
    { header: "record_status", key: "record_status", width: 14 },
  ];
  sites.forEach((s) => sitesSheet.addRow(s));
  styleHeader(sitesSheet);

  const radarsSheet = workbook.addWorksheet("Radars");
  radarsSheet.columns = [
    { header: "radar_id", key: "radar_id", width: 12 },
    { header: "site_id", key: "site_id", width: 12 },
    { header: "radar_name", key: "radar_name", width: 45 },
    { header: "radar_model", key: "radar_model", width: 20 },
    { header: "radar_type", key: "radar_type", width: 18 },
    { header: "frequency_band", key: "frequency_band", width: 15 },
    { header: "purpose", key: "purpose", width: 60 },
    { header: "owner", key: "owner", width: 30 },
    { header: "operator", key: "operator", width: 30 },
    { header: "manufacturer", key: "manufacturer", width: 30 },
    { header: "installation_date", key: "installation_date", width: 16 },
    { header: "upgrade_date", key: "upgrade_date", width: 16 },
    { header: "fix_date", key: "fix_date", width: 16 },
    { header: "operational_status", key: "operational_status", width: 16 },
    { header: "public_description", key: "public_description", width: 80 },
    { header: "citations", key: "citations", width: 60 },
    { header: "confidence_level", key: "confidence_level", width: 15 },
    { header: "last_verified_date", key: "last_verified_date", width: 16 },
    { header: "source_id", key: "source_id", width: 12 },
    { header: "record_status", key: "record_status", width: 14 },
  ];
  radars.forEach((r) => radarsSheet.addRow(r));
  styleHeader(radarsSheet);

  const activitiesSheet = workbook.addWorksheet("Site_Activities");
  activitiesSheet.columns = [
    { header: "activity_id", key: "activity_id", width: 12 },
    { header: "site_id", key: "site_id", width: 12 },
    { header: "activity_category", key: "activity_category", width: 20 },
    { header: "activity_description", key: "activity_description", width: 80 },
    { header: "missile_or_system_type", key: "missile_or_system_type", width: 40 },
    { header: "start_year", key: "start_year", width: 12 },
    { header: "end_year", key: "end_year", width: 12 },
    { header: "status", key: "status", width: 12 },
    { header: "source_id", key: "source_id", width: 12 },
    { header: "confidence_level", key: "confidence_level", width: 15 },
  ];
  activities.forEach((a) => activitiesSheet.addRow(a));
  styleHeader(activitiesSheet);

  const sourcesSheet = workbook.addWorksheet("Sources");
  sourcesSheet.columns = [
    { header: "source_id", key: "source_id", width: 12 },
    { header: "source_title", key: "source_title", width: 50 },
    { header: "source_url", key: "source_url", width: 70 },
    { header: "source_type", key: "source_type", width: 15 },
    { header: "publisher", key: "publisher", width: 35 },
    { header: "publication_date", key: "publication_date", width: 16 },
    { header: "access_date", key: "access_date", width: 16 },
    { header: "reliability_score", key: "reliability_score", width: 15 },
    { header: "notes", key: "notes", width: 40 },
    { header: "notebook_uuid", key: "notebook_uuid", width: 38 },
  ];
  sources.forEach((s) => sourcesSheet.addRow(s));
  styleHeader(sourcesSheet);

  const contactsSheet = workbook.addWorksheet("Contacts");
  contactsSheet.columns = [
    { header: "contact_id", key: "contact_id", width: 12 },
    { header: "site_id", key: "site_id", width: 12 },
    { header: "organization_name", key: "organization_name", width: 40 },
    { header: "contact_type", key: "contact_type", width: 18 },
    { header: "contact_email", key: "contact_email", width: 35 },
    { header: "contact_phone", key: "contact_phone", width: 20 },
    { header: "contact_url", key: "contact_url", width: 60 },
    { header: "notes", key: "notes", width: 40 },
    { header: "source_id", key: "source_id", width: 12 },
  ];
  contacts.forEach((c) => contactsSheet.addRow(c));
  styleHeader(contactsSheet);

  return workbook;
}

function styleHeader(sheet: ExcelJS.Worksheet) {
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1E3A5F" },
  };
  headerRow.alignment = { horizontal: "center", vertical: "middle" };
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: sheet.columns.length },
  };
}
