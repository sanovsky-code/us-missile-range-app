import ExcelJS from "exceljs";
import path from "path";
import { seedSites, seedRadars, seedActivities, seedSources, seedContacts } from "../src/lib/seed-data";

async function generateExcel() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "US Missile Range App";
  workbook.created = new Date();

  // --- Sites sheet ---
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
    { header: "confidence_level", key: "confidence_level", width: 15 },
    { header: "last_verified_date", key: "last_verified_date", width: 16 },
    { header: "record_status", key: "record_status", width: 14 },
  ];
  seedSites.forEach((site) => sitesSheet.addRow(site));
  styleHeaderRow(sitesSheet);

  // --- Radars sheet ---
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
    { header: "confidence_level", key: "confidence_level", width: 15 },
    { header: "last_verified_date", key: "last_verified_date", width: 16 },
    { header: "source_id", key: "source_id", width: 12 },
    { header: "record_status", key: "record_status", width: 14 },
  ];
  seedRadars.forEach((radar) => radarsSheet.addRow(radar));
  styleHeaderRow(radarsSheet);

  // --- Site_Activities sheet ---
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
  seedActivities.forEach((act) => activitiesSheet.addRow(act));
  styleHeaderRow(activitiesSheet);

  // --- Sources sheet ---
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
  ];
  seedSources.forEach((src) => sourcesSheet.addRow(src));
  styleHeaderRow(sourcesSheet);

  // --- Contacts sheet ---
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
  seedContacts.forEach((con) => contactsSheet.addRow(con));
  styleHeaderRow(contactsSheet);

  // --- Change_Log sheet (empty template) ---
  const changeLogSheet = workbook.addWorksheet("Change_Log");
  changeLogSheet.columns = [
    { header: "timestamp", key: "timestamp", width: 20 },
    { header: "user", key: "user", width: 20 },
    { header: "action", key: "action", width: 15 },
    { header: "sheet", key: "sheet", width: 15 },
    { header: "record_id", key: "record_id", width: 15 },
    { header: "details", key: "details", width: 50 },
  ];
  styleHeaderRow(changeLogSheet);

  // --- Validation_Errors sheet (empty template) ---
  const validationSheet = workbook.addWorksheet("Validation_Errors");
  validationSheet.columns = [
    { header: "sheet", key: "sheet", width: 15 },
    { header: "row", key: "row", width: 8 },
    { header: "field", key: "field", width: 20 },
    { header: "value", key: "value", width: 30 },
    { header: "rule", key: "rule", width: 15 },
    { header: "message", key: "message", width: 50 },
    { header: "severity", key: "severity", width: 10 },
  ];
  styleHeaderRow(validationSheet);

  const outputPath = path.join(__dirname, "..", "data", "us_missile_range_data.xlsx");
  await workbook.xlsx.writeFile(outputPath);
  console.log(`Excel file generated: ${outputPath}`);
  console.log(`  Sites: ${seedSites.length}`);
  console.log(`  Radars: ${seedRadars.length}`);
  console.log(`  Activities: ${seedActivities.length}`);
  console.log(`  Sources: ${seedSources.length}`);
  console.log(`  Contacts: ${seedContacts.length}`);
}

function styleHeaderRow(sheet: ExcelJS.Worksheet) {
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

generateExcel().catch(console.error);
