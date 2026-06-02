"""Parse notebook responses into the Excel data file."""
import os
import re
import glob
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RESPONSES_DIR = os.path.join(BASE, "data", "notebook-responses")
OUTPUT_FILE = os.path.join(BASE, "data", "us_missile_range_data.xlsx")

VALID_SITE_TYPES = {"Range", "Base", "Launch Site", "Radar Site",
                    "Tracking Station", "Test Facility", "Other"}
VALID_SIZES = {"Small", "Medium", "Large", "Strategic / Mega"}


def clean_text(s: str) -> str:
    """Remove citation markers [1], [2,3] etc and trim."""
    if not s or s == "N/A":
        return ""
    s = re.sub(r"\[\d+(?:,\s*\d+)*\]", "", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def parse_coord(s: str) -> float | None:
    """Parse latitude/longitude. Handles formats like '31.89778', '-31.5833', '31.89778°N', '34.69056°E'."""
    if not s or s.strip() in ("N/A", "n/a", "", "-"):
        return None
    s = s.strip()
    m = re.match(r"^(-?\d+(?:\.\d+)?)\s*°?\s*([NSEW]?)$", s)
    if not m:
        return None
    val = float(m.group(1))
    direction = m.group(2).upper()
    if direction in ("S", "W"):
        val = -abs(val)
    elif direction in ("N", "E"):
        val = abs(val)
    return val


def normalize_size(s: str) -> str:
    s = clean_text(s)
    if s in VALID_SIZES:
        return s
    # Handle variations
    low = s.lower()
    if "strategic" in low or "mega" in low:
        return "Strategic / Mega"
    if low == "large":
        return "Large"
    if low == "medium":
        return "Medium"
    if low == "small":
        return "Small"
    return "Medium"  # default


def normalize_site_type(s: str) -> str:
    s = clean_text(s)
    if s in VALID_SITE_TYPES:
        return s
    low = s.lower()
    if "range" in low:
        return "Range"
    if "launch" in low:
        return "Launch Site"
    if "radar" in low:
        return "Radar Site"
    if "tracking" in low:
        return "Tracking Station"
    if "test" in low or "proving" in low:
        return "Test Facility"
    if "base" in low or "airfield" in low or "airbase" in low or "airport" in low:
        return "Base"
    return "Other"


def normalize_country(s: str) -> str:
    """Normalize country names for consistency."""
    s = clean_text(s)
    mapping = {
        "United States": "USA",
        "United States of America": "USA",
        "U.S.A.": "USA",
        "U.S.": "USA",
        "US": "USA",
        "United Kingdom": "UK",
        "U.K.": "UK",
        "Great Britain": "UK",
        "United Arab Emirates": "UAE",
        "U.A.E.": "UAE",
        "Democratic Republic of the Congo": "DRC",
        "Zaire": "DRC",
        "Republic of Korea": "South Korea",
        "Korea, Republic of": "South Korea",
        "Korea, North": "North Korea",
        "Democratic People's Republic of Korea": "North Korea",
        "DPRK": "North Korea",
        "ROK": "South Korea",
    }
    return mapping.get(s, s)


def parse_site_line(line: str) -> dict | None:
    """Parse SITE|country|name|lat|long|type|mgmt|operator|size|description"""
    if not line.startswith("SITE|"):
        return None
    parts = line.split("|")
    if len(parts) < 10:
        # Some descriptions may contain "|" - rejoin extras
        if len(parts) > 10:
            parts = parts[:9] + ["|".join(parts[9:])]
        else:
            return None
    _, country, name, lat, lon, stype, mgmt, op, size, desc = parts[:10]

    country = normalize_country(country)
    name = clean_text(name)
    if not name:
        return None

    lat_val = parse_coord(lat)
    lon_val = parse_coord(lon)
    if lat_val is None or lon_val is None:
        # Skip sites with no coordinates - can't map them
        return None
    if not (-90 <= lat_val <= 90 and -180 <= lon_val <= 180):
        return None

    mgmt = clean_text(mgmt) or "Unknown"
    op = clean_text(op)
    desc = clean_text(desc) or f"{name} in {country}."

    return {
        "country": country,
        "name": name,
        "latitude": lat_val,
        "longitude": lon_val,
        "site_type": normalize_site_type(stype),
        "managing_organization": mgmt,
        "operator": op,
        "size_category": normalize_size(size),
        "description": desc,
    }


def parse_all_responses():
    sites = []
    seen_keys = set()
    for fname in sorted(glob.glob(os.path.join(RESPONSES_DIR, "*.txt"))):
        with open(fname, "r", encoding="utf-8") as f:
            # Join lines: each SITE| starts a new entry. Wrapped continuation
            # lines (those not starting with SITE| and not "Answer:" etc) are
            # appended to the previous SITE| entry.
            raw = f.read()
            # Build a list of "logical" lines by joining wraps
            chunks = []
            current = None
            for line in raw.split("\n"):
                if line.startswith("SITE|"):
                    if current is not None:
                        chunks.append(current)
                    current = line
                elif current is not None and not line.startswith(("Answer:", "New conversation:", "Notebook")):
                    # Append wrapped continuation
                    current += " " + line.strip()
                # else: header line we ignore
            if current is not None:
                chunks.append(current)

            for line in chunks:
                line = re.sub(r"\s+", " ", line).strip()
                site = parse_site_line(line)
                if not site:
                    continue
                key = (site["country"].lower(), site["name"].lower())
                if key in seen_keys:
                    continue
                seen_keys.add(key)
                sites.append(site)
    return sites


def write_excel(sites: list[dict]):
    wb = openpyxl.Workbook()

    # Remove default sheet
    wb.remove(wb.active)

    # === Sites sheet ===
    sheet = wb.create_sheet("Sites")
    headers = ["site_id", "site_name", "site_type", "size_category", "size_score",
               "country", "state", "latitude", "longitude", "coordinate_type",
               "managing_organization", "operator", "missile_relevance",
               "launch_relevance", "radar_relevance", "public_contact_email",
               "public_contact_phone", "website", "description",
               "confidence_level", "last_verified_date", "record_status"]
    sheet.append(headers)
    widths = [12, 50, 18, 18, 12, 18, 18, 12, 12, 18, 35, 30, 50, 50, 50, 28, 18, 40, 80, 14, 16, 14]
    for i, w in enumerate(widths, start=1):
        sheet.column_dimensions[openpyxl.utils.get_column_letter(i)].width = w

    for idx, site in enumerate(sites, start=1):
        size_score = {"Small": 20, "Medium": 45, "Large": 70, "Strategic / Mega": 90}.get(site["size_category"], 45)
        sheet.append([
            f"SITE-{idx:04d}",
            site["name"],
            site["site_type"],
            site["size_category"],
            size_score,
            site["country"],
            "",  # state - not extracted
            site["latitude"],
            site["longitude"],
            "Site centroid",
            site["managing_organization"],
            site["operator"] or "",
            "",  # missile_relevance
            "",  # launch_relevance
            "",  # radar_relevance
            "",  # email
            "",  # phone
            "",  # website
            site["description"],
            "Medium",  # confidence - data from notebook is generally reliable
            "2026-06-01",
            "Published",
        ])

    style_header(sheet)

    # === Empty template sheets ===
    radars_sheet = wb.create_sheet("Radars")
    radars_sheet.append(["radar_id", "site_id", "radar_name", "radar_model", "radar_type",
                         "frequency_band", "purpose", "owner", "operator", "manufacturer",
                         "installation_date", "upgrade_date", "fix_date", "operational_status",
                         "public_description", "confidence_level", "last_verified_date",
                         "source_id", "record_status"])
    style_header(radars_sheet)

    acts_sheet = wb.create_sheet("Site_Activities")
    acts_sheet.append(["activity_id", "site_id", "activity_category", "activity_description",
                       "missile_or_system_type", "start_year", "end_year", "status",
                       "source_id", "confidence_level"])
    style_header(acts_sheet)

    sources_sheet = wb.create_sheet("Sources")
    sources_sheet.append(["source_id", "source_title", "source_url", "source_type",
                          "publisher", "publication_date", "access_date",
                          "reliability_score", "notes"])
    # Add one source for NotebookLM
    sources_sheet.append([
        "SRC-001",
        "NotebookLM compiled sources",
        "https://notebooklm.google.com/",
        "Other",
        "Compiled from public sources via NotebookLM",
        "",
        "2026-06-01",
        70,
        "Source materials curated in a NotebookLM notebook covering global missile/launch/test/radar sites."
    ])
    style_header(sources_sheet)

    contacts_sheet = wb.create_sheet("Contacts")
    contacts_sheet.append(["contact_id", "site_id", "organization_name", "contact_type",
                           "contact_email", "contact_phone", "contact_url", "notes", "source_id"])
    style_header(contacts_sheet)

    cl = wb.create_sheet("Change_Log")
    cl.append(["timestamp", "user", "action", "sheet", "record_id", "details"])
    style_header(cl)

    ve = wb.create_sheet("Validation_Errors")
    ve.append(["sheet", "row", "field", "value", "rule", "message", "severity"])
    style_header(ve)

    wb.save(OUTPUT_FILE)


def style_header(sheet):
    for cell in sheet[1]:
        cell.font = Font(bold=True, color="FFFFFFFF")
        cell.fill = PatternFill(start_color="FF1E3A5F", end_color="FF1E3A5F", fill_type="solid")
        cell.alignment = Alignment(horizontal="center", vertical="center")
    sheet.auto_filter.ref = sheet.dimensions


def main():
    sites = parse_all_responses()
    print(f"Parsed {len(sites)} unique sites")
    by_country = {}
    for s in sites:
        by_country[s["country"]] = by_country.get(s["country"], 0) + 1
    print("\nSites per country:")
    for c, n in sorted(by_country.items(), key=lambda x: -x[1]):
        print(f"  {c}: {n}")
    write_excel(sites)
    print(f"\nWrote: {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
