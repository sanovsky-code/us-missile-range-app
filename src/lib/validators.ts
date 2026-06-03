import { Site, Radar, SiteActivity, Source, Contact, ValidationError } from "./types";
import { SITE_TYPES, SIZE_CATEGORIES, CONFIDENCE_LEVELS, RECORD_STATUSES, RADAR_TYPES, OPERATIONAL_STATUSES, ACTIVITY_CATEGORIES } from "./constants";

function err(sheet: string, row: number, field: string, value: string, rule: string, message: string, severity: "error" | "warning" = "error"): ValidationError {
  return { sheet, row, field, value: String(value ?? ""), rule, message, severity };
}

export function validateSites(sites: Site[]): ValidationError[] {
  const errors: ValidationError[] = [];

  sites.forEach((site, i) => {
    const row = i + 2;
    if (!site.site_id) errors.push(err("Sites", row, "site_id", "", "required", "Site ID is required"));
    if (!site.site_name) errors.push(err("Sites", row, "site_name", "", "required", "Site name is required"));
    if (!site.site_type) errors.push(err("Sites", row, "site_type", "", "required", "Site type is required"));
    else if (!SITE_TYPES.includes(site.site_type as typeof SITE_TYPES[number]))
      errors.push(err("Sites", row, "site_type", site.site_type, "picklist", `Invalid site type: ${site.site_type}`));

    if (!site.size_category) errors.push(err("Sites", row, "size_category", "", "required", "Size category is required"));
    else if (!SIZE_CATEGORIES.includes(site.size_category as typeof SIZE_CATEGORIES[number]))
      errors.push(err("Sites", row, "size_category", site.size_category, "picklist", `Invalid size category: ${site.size_category}`));

    // state is an optional supplementary field (USA sub-national designator).
    // Not validated - country + lat/lon already identify the location.
    if (!site.managing_organization) errors.push(err("Sites", row, "managing_organization", "", "required", "Managing organization is required"));
    if (!site.description) errors.push(err("Sites", row, "description", "", "required", "Description is required"));

    if (site.latitude == null || isNaN(site.latitude) || site.latitude < -90 || site.latitude > 90)
      errors.push(err("Sites", row, "latitude", String(site.latitude), "coordinates", "Latitude must be between -90 and 90"));
    if (site.longitude == null || isNaN(site.longitude) || site.longitude < -180 || site.longitude > 180)
      errors.push(err("Sites", row, "longitude", String(site.longitude), "coordinates", "Longitude must be between -180 and 180"));

    if (!site.confidence_level) errors.push(err("Sites", row, "confidence_level", "", "required", "Confidence level is required"));
    else if (!CONFIDENCE_LEVELS.includes(site.confidence_level as typeof CONFIDENCE_LEVELS[number]))
      errors.push(err("Sites", row, "confidence_level", site.confidence_level, "picklist", `Invalid confidence level: ${site.confidence_level}`));

    if (!site.record_status) errors.push(err("Sites", row, "record_status", "", "required", "Record status is required"));
    else if (!RECORD_STATUSES.includes(site.record_status as typeof RECORD_STATUSES[number]))
      errors.push(err("Sites", row, "record_status", site.record_status, "picklist", `Invalid record status: ${site.record_status}`));

    if (site.record_status === "Published") {
      if (!site.latitude || !site.longitude)
        errors.push(err("Sites", row, "record_status", "Published", "publish_ready", "Published sites must have valid coordinates"));
    }

    if (site.public_contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(site.public_contact_email))
      errors.push(err("Sites", row, "public_contact_email", site.public_contact_email, "format", "Invalid email format", "warning"));

    if (site.website && !/^https?:\/\/.+/.test(site.website))
      errors.push(err("Sites", row, "website", site.website, "format", "Invalid URL format", "warning"));
  });

  // Duplicate detection - only flag exact name duplicates within the same country.
  // Coordinate-similarity alone is noisy (radars co-located with their host base
  // legitimately share coords) so it's no longer flagged.
  for (let i = 0; i < sites.length; i++) {
    for (let j = i + 1; j < sites.length; j++) {
      if (
        sites[i].site_name.toLowerCase() === sites[j].site_name.toLowerCase() &&
        (sites[i].country || "").toLowerCase() === (sites[j].country || "").toLowerCase()
      ) {
        errors.push(err("Sites", j + 2, "site_name", sites[j].site_name, "duplicate", `Duplicate site name: "${sites[j].site_name}" (same as row ${i + 2})`, "warning"));
      }
    }
  }

  return errors;
}

export function validateRadars(radars: Radar[], siteIds: Set<string>, sourceIds: Set<string>): ValidationError[] {
  const errors: ValidationError[] = [];

  radars.forEach((radar, i) => {
    const row = i + 2;
    if (!radar.radar_id) errors.push(err("Radars", row, "radar_id", "", "required", "Radar ID is required"));
    if (!radar.site_id) errors.push(err("Radars", row, "site_id", "", "required", "Site ID is required"));
    else if (!siteIds.has(radar.site_id))
      errors.push(err("Radars", row, "site_id", radar.site_id, "reference", `Site ID "${radar.site_id}" not found in Sites sheet`));

    if (!radar.radar_name) errors.push(err("Radars", row, "radar_name", "", "required", "Radar name is required"));
    if (!radar.radar_type) errors.push(err("Radars", row, "radar_type", "", "required", "Radar type is required"));
    else if (!RADAR_TYPES.includes(radar.radar_type as typeof RADAR_TYPES[number]))
      errors.push(err("Radars", row, "radar_type", radar.radar_type, "picklist", `Invalid radar type: ${radar.radar_type}`));

    if (!radar.purpose) errors.push(err("Radars", row, "purpose", "", "required", "Purpose is required"));
    if (!radar.operational_status) errors.push(err("Radars", row, "operational_status", "", "required", "Operational status is required"));
    else if (!OPERATIONAL_STATUSES.includes(radar.operational_status as typeof OPERATIONAL_STATUSES[number]))
      errors.push(err("Radars", row, "operational_status", radar.operational_status, "picklist", `Invalid operational status: ${radar.operational_status}`));

    if (!radar.confidence_level) errors.push(err("Radars", row, "confidence_level", "", "required", "Confidence level is required"));
    // source_id is optional now - canonical sources are in the `citations` field.
    // Only validate if a value is present and it isn't a known legacy placeholder.
    if (radar.source_id && !sourceIds.has(radar.source_id) && radar.source_id !== "SRC-001") {
      errors.push(err("Radars", row, "source_id", radar.source_id, "reference", `Source ID "${radar.source_id}" not found in Sources sheet`, "warning"));
    }
  });

  return errors;
}

export function validateActivities(activities: SiteActivity[], siteIds: Set<string>, sourceIds: Set<string>): ValidationError[] {
  const errors: ValidationError[] = [];

  activities.forEach((act, i) => {
    const row = i + 2;
    if (!act.activity_id) errors.push(err("Site_Activities", row, "activity_id", "", "required", "Activity ID is required"));
    if (!act.site_id) errors.push(err("Site_Activities", row, "site_id", "", "required", "Site ID is required"));
    else if (!siteIds.has(act.site_id))
      errors.push(err("Site_Activities", row, "site_id", act.site_id, "reference", `Site ID "${act.site_id}" not found in Sites sheet`));

    if (!act.activity_category) errors.push(err("Site_Activities", row, "activity_category", "", "required", "Activity category is required"));
    else if (!ACTIVITY_CATEGORIES.includes(act.activity_category as typeof ACTIVITY_CATEGORIES[number]))
      errors.push(err("Site_Activities", row, "activity_category", act.activity_category, "picklist", `Invalid activity category: ${act.activity_category}`));

    if (!act.activity_description) errors.push(err("Site_Activities", row, "activity_description", "", "required", "Activity description is required"));
    // source_id is optional - canonical sources are in `citations` on the parent site
    if (act.source_id && !sourceIds.has(act.source_id) && act.source_id !== "SRC-001") {
      errors.push(err("Site_Activities", row, "source_id", act.source_id, "reference", `Source ID "${act.source_id}" not found in Sources sheet`, "warning"));
    }
  });

  return errors;
}

export function validateSources(sources: Source[]): ValidationError[] {
  const errors: ValidationError[] = [];

  sources.forEach((src, i) => {
    const row = i + 2;
    if (!src.source_id) errors.push(err("Sources", row, "source_id", "", "required", "Source ID is required"));
    if (!src.source_title) errors.push(err("Sources", row, "source_title", "", "required", "Source title is required"));
    // source_url is optional - some sources are uploaded documents (PDFs) with no public URL.
    // Only validate format if present.
    if (src.source_url && !/^https?:\/\/.+/.test(src.source_url)) {
      errors.push(err("Sources", row, "source_url", src.source_url, "format", "Invalid URL format", "warning"));
    }
    if (!src.source_type) errors.push(err("Sources", row, "source_type", "", "required", "Source type is required"));
    if (!src.access_date) errors.push(err("Sources", row, "access_date", "", "required", "Access date is required"));
  });

  return errors;
}

export function validateContacts(contacts: Contact[], siteIds: Set<string>, sourceIds: Set<string>): ValidationError[] {
  const errors: ValidationError[] = [];

  contacts.forEach((con, i) => {
    const row = i + 2;
    if (!con.contact_id) errors.push(err("Contacts", row, "contact_id", "", "required", "Contact ID is required"));
    if (!con.site_id) errors.push(err("Contacts", row, "site_id", "", "required", "Site ID is required"));
    else if (!siteIds.has(con.site_id))
      errors.push(err("Contacts", row, "site_id", con.site_id, "reference", `Site ID "${con.site_id}" not found in Sites sheet`));
    if (!con.organization_name) errors.push(err("Contacts", row, "organization_name", "", "required", "Organization name is required"));
    // source_id optional - canonical sources are in `citations` on the parent site
    if (con.source_id && !sourceIds.has(con.source_id) && con.source_id !== "SRC-001") {
      errors.push(err("Contacts", row, "source_id", con.source_id, "reference", `Source ID "${con.source_id}" not found in Sources sheet`, "warning"));
    }

    if (con.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(con.contact_email))
      errors.push(err("Contacts", row, "contact_email", con.contact_email, "format", "Invalid email format", "warning"));
  });

  return errors;
}
