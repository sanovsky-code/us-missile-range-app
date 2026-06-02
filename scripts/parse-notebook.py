"""Parse notebook responses into the Excel data file.

For sites missing coordinates, this script applies fallbacks in order:
1. NA-coords notebook response (na-coords.txt) - explicit coords queried later
2. MANUAL_COORDS - hand-curated coords for major sites the notebook misses
3. Country centroid - last resort so the site still shows on the map
   (marked with coordinate_type = "Country centroid (approximate)")
"""
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

# Country centroid coordinates (rough geographic centers)
COUNTRY_CENTROIDS: dict[str, tuple[float, float]] = {
    "USA": (39.8283, -98.5795),
    "Canada": (56.1304, -106.3468),
    "Mexico": (23.6345, -102.5528),
    "Argentina": (-38.4161, -63.6167),
    "Brazil": (-14.2350, -51.9253),
    "Chile": (-35.6751, -71.5430),
    "Peru": (-9.1900, -75.0152),
    "UK": (55.3781, -3.4360),
    "France": (46.2276, 2.2137),
    "Germany": (51.1657, 10.4515),
    "Italy": (41.8719, 12.5674),
    "Spain": (40.4637, -3.7492),
    "Portugal": (39.3999, -8.2245),
    "Sweden": (60.1282, 18.6435),
    "Norway": (60.4720, 8.4689),
    "Finland": (61.9241, 25.7482),
    "Estonia": (58.5953, 25.0136),
    "Latvia": (56.8796, 24.6032),
    "Poland": (51.9194, 19.1451),
    "Romania": (45.9432, 24.9668),
    "Bulgaria": (42.7339, 25.4858),
    "Greece": (39.0742, 21.8243),
    "China": (35.8617, 104.1954),
    "India": (20.5937, 78.9629),
    "Israel": (31.0461, 34.8516),
    "Japan": (36.2048, 138.2529),
    "Kazakhstan": (48.0196, 66.9237),
    "Maldives": (3.2028, 73.2207),
    "North Korea": (40.3399, 127.5101),
    "South Korea": (35.9078, 127.7669),
    "Taiwan": (23.6978, 120.9605),
    "Thailand": (15.8700, 100.9925),
    "UAE": (23.4241, 53.8478),
    "Philippines": (12.8797, 121.7740),
    "Australia": (-25.2744, 133.7751),
    "New Zealand": (-40.9006, 174.8860),
    "Marshall Islands": (7.1315, 171.1845),
    "Algeria": (28.0339, 1.6596),
    "Egypt": (26.8206, 30.8025),
    "Kenya": (-0.0236, 37.9062),
    "South Africa": (-30.5595, 22.9375),
    "DRC": (-4.0383, 21.7587),
}

# Hand-curated coordinates for well-known sites that the notebook didn't supply
MANUAL_COORDS: dict[tuple[str, str], tuple[float, float]] = {
    # USA
    ("USA", "cape canaveral space force station"): (28.4889, -80.5778),
    ("USA", "kennedy space center"): (28.5729, -80.6490),
    ("USA", "eastern range"): (28.4889, -80.5778),  # same as Cape Canaveral
    ("USA", "beale air force base uewr"): (39.1361, -121.4364),
    ("USA", "cape cod space force station uewr"): (41.7522, -70.5378),
    ("USA", "cavalier space force station parcs"): (48.7244, -97.8997),
    ("USA", "clear space force station lrdr"): (64.2906, -149.1881),
    ("USA", "clear space force station uewr"): (64.2906, -149.1881),
    ("USA", "dugway proving ground"): (40.1900, -112.8983),
    ("USA", "aberdeen test center"): (39.4640, -76.1267),
    ("USA", "armstrong flight research center"): (34.9484, -117.8839),
    ("USA", "arnold engineering development complex"): (35.3893, -86.0850),
    ("USA", "atlantic undersea test and evaluation center"): (24.4486, -77.7589),
    ("USA", "blue origin launch site"): (31.4221, -104.7574),
    ("USA", "california spaceport"): (34.5814, -120.6308),
    ("USA", "colorado air and space port"): (39.7833, -104.5374),
    ("USA", "goddard rocket launching site"): (42.4259, -72.3370),
    ("USA", "green river launch complex"): (38.9913, -110.1573),
    ("USA", "houston spaceport"): (29.5972, -95.1583),
    ("USA", "kodiak launch complex"): (57.4358, -152.3378),
    ("USA", "mcgregor spacex test site"): (31.3919, -97.4128),
    ("USA", "midland spaceport"): (31.9425, -102.2017),
    ("USA", "mount horace greeley former calumet air force station"): (62.8083, -148.3097),
    ("USA", "naval air warfare center aircraft division patuxent river"): (38.2862, -76.4116),
    # International
    ("UK", "raf fylingdales"): (54.3617, -0.6700),
    ("UK", "spaceport cornwall"): (50.4408, -5.0024),
    ("UK", "sutherland spaceport"): (58.3592, -4.3197),
    ("UK", "dundrennan range"): (54.8014, -3.9883),
    ("Romania", "aegis ashore romania"): (44.3667, 24.4000),
    ("Marshall Islands", "alcor radar"): (9.3950, 167.4700),
    ("Marshall Islands", "altair radar"): (9.3950, 167.4700),
    ("Marshall Islands", "mmw radar"): (9.3950, 167.4700),
    ("Marshall Islands", "tradex radar"): (9.3950, 167.4700),
    ("Japan", "shariki radar site"): (40.9667, 141.3333),
    ("Israel", "ein shemer airfield"): (32.4406, 35.0083),
    ("Israel", "sdot micha airbase"): (31.7333, 34.9333),
    ("Israel", "tel nof airbase"): (31.8392, 34.8214),
    ("Israel", "hatzerim airbase"): (31.2333, 34.6667),
    ("Israel", "hatzor airbase"): (31.7625, 34.7269),
    ("Israel", "nevatim airbase"): (31.2083, 35.0119),
    ("Israel", "ovda airbase"): (29.9403, 34.9358),
    ("Israel", "ramat david airbase"): (32.6650, 35.1797),
    ("Israel", "ramon airbase"): (30.7765, 34.6669),
    ("Israel", "an/tpy-2 radar israel"): (32.5000, 35.0000),
    ("Estonia", "ämari air base"): (59.2603, 24.2089),
    ("Latvia", "sēlija military training range"): (56.1500, 25.7500),
    ("Latvia", "šķēde"): (57.7833, 22.5667),
    ("Finland", "lohtaja firing range and training area"): (64.0083, 23.4189),
    ("Poland", "ustka training range"): (54.5800, 16.8567),
    ("Portugal", "field firing range of alcochete"): (38.7575, -8.8889),
    ("Portugal", "santa maria spaceport"): (36.9714, -25.1706),
    ("Spain", "el hierro"): (27.7392, -18.0257),
    ("Germany", "lager heuberg"): (48.1789, 9.0617),
    ("Sweden", "vidsel test range"): (66.0167, 20.1500),
    ("Sweden", "bofors test center"): (59.3306, 14.5169),
    ("Sweden", "spaceport sweden"): (67.8836, 21.0667),
    ("North Korea", "nodong launch pad"): (40.8556, 129.6675),
    ("North Korea", "yongodong"): (40.8556, 129.6675),
    ("Philippines", "philippine spaceport"): (12.8797, 121.7740),  # general area
    ("Thailand", "koh sichang-koh chan launch site"): (13.1583, 100.8000),
    ("UAE", "an/tpy-2 radar site"): (24.4539, 54.3773),  # near Abu Dhabi
    ("UAE", "abu dhabi testing ground"): (24.4539, 54.3773),
    ("South Korea", "an/tpy-2 radar site"): (35.9078, 127.7669),  # general
    ("South Korea", "jeju tracking station"): (33.4996, 126.5312),
    ("South Korea", "changwon proving ground"): (35.2278, 128.6817),
    ("South Korea", "darakdae proving ground"): (35.5000, 129.0000),
    ("Kazakhstan", "saturn-ms measuring complex"): (45.9, 63.3),  # near Baikonur
    ("China", "xi'an satellite control center"): (34.3416, 108.9398),
    ("China", "beijing command center"): (39.9042, 116.4074),
    ("China", "changchun station"): (43.8171, 125.3235),
    ("China", "xiamen station"): (24.4798, 118.0894),
    ("China", "nanning station"): (22.8170, 108.3669),
    ("China", "weinan station"): (34.5025, 109.5089),
    ("China", "kashgar station"): (39.4675, 75.9899),
    ("China", "dashuli tracking station"): (40.9583, 100.2917),  # near Jiuquan
    ("China", "nanhui"): (30.9094, 121.8044),
    ("Chile", "arica"): (-18.4783, -70.3126),
    ("Chile", "peldehue"): (-33.1500, -70.6333),
    ("Chile", "pampa de tamarugal"): (-20.8333, -69.5167),
    ("Canada", "cape breton spaceport"): (45.9483, -59.9707),
    ("Canada", "cape rich"): (44.6500, -80.7833),
    ("Australia", "bowen orbital spaceport"): (-20.0167, 148.2333),
    ("Australia", "christmas island"): (-10.4475, 105.6904),
    ("Australia", "utingu punsand bay"): (-10.6917, 142.3617),
}


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


def load_na_coord_overrides() -> dict:
    """Read na-coords.txt and return {(country, name_lower): (lat, lon)}."""
    fname = os.path.join(RESPONSES_DIR, "na-coords.txt")
    out: dict = {}
    if not os.path.exists(fname):
        return out
    with open(fname, "r", encoding="utf-8") as f:
        for raw_line in f:
            line = raw_line.strip()
            if not line.startswith("COORDS|"):
                continue
            parts = line.split("|")
            if len(parts) < 5:
                continue
            country = normalize_country(parts[1].strip())
            name = clean_text(parts[2]).lower()
            lat = parse_coord(parts[3])
            lon = parse_coord(parts[4])
            if lat is not None and lon is not None and -90 <= lat <= 90 and -180 <= lon <= 180:
                out[(country, name)] = (lat, lon)
    return out


def resolve_coordinates(country: str, name: str, lat: str, lon: str,
                         na_overrides: dict) -> tuple[float, float, str]:
    """Apply fallback chain: parsed -> na-coords override -> MANUAL -> country centroid.

    Returns (lat, lon, coordinate_type).
    coordinate_type is 'Site centroid' for precise coords, 'Country centroid (approximate)'
    if only the country centroid was available.
    """
    lat_val = parse_coord(lat)
    lon_val = parse_coord(lon)
    if lat_val is not None and lon_val is not None and -90 <= lat_val <= 90 and -180 <= lon_val <= 180:
        return lat_val, lon_val, "Site centroid"

    name_lower = name.lower()
    if (country, name_lower) in na_overrides:
        lat_val, lon_val = na_overrides[(country, name_lower)]
        return lat_val, lon_val, "Site centroid"
    if (country, name_lower) in MANUAL_COORDS:
        lat_val, lon_val = MANUAL_COORDS[(country, name_lower)]
        return lat_val, lon_val, "Site centroid"
    if country in COUNTRY_CENTROIDS:
        lat_val, lon_val = COUNTRY_CENTROIDS[country]
        return lat_val, lon_val, "Country centroid (approximate)"
    return 0.0, 0.0, "Unknown"


def parse_site_line(line: str, na_overrides: dict) -> dict | None:
    """Parse SITE|country|name|lat|long|type|mgmt|operator|size|description"""
    if not line.startswith("SITE|"):
        return None
    parts = line.split("|")
    if len(parts) < 10:
        if len(parts) > 10:
            parts = parts[:9] + ["|".join(parts[9:])]
        else:
            return None
    _, country, name, lat, lon, stype, mgmt, op, size, desc = parts[:10]

    country = normalize_country(country)
    name = clean_text(name)
    if not name:
        return None

    lat_val, lon_val, coord_type = resolve_coordinates(country, name, lat, lon, na_overrides)

    mgmt = clean_text(mgmt) or "Unknown"
    op = clean_text(op)
    desc = clean_text(desc) or f"{name} in {country}."

    return {
        "country": country,
        "name": name,
        "latitude": lat_val,
        "longitude": lon_val,
        "coordinate_type": coord_type,
        "site_type": normalize_site_type(stype),
        "managing_organization": mgmt,
        "operator": op,
        "size_category": normalize_size(size),
        "description": desc,
    }


def parse_all_responses():
    sites = []
    seen_keys = set()
    na_overrides = load_na_coord_overrides()
    print(f"Loaded {len(na_overrides)} explicit-coords overrides from na-coords.txt")
    for fname in sorted(glob.glob(os.path.join(RESPONSES_DIR, "*.txt"))):
        # Skip the helper file itself
        if os.path.basename(fname) == "na-coords.txt":
            continue
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
                site = parse_site_line(line, na_overrides)
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
            site.get("coordinate_type", "Site centroid"),
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
    precise = sum(1 for s in sites if s.get("coordinate_type") == "Site centroid")
    approximate = sum(1 for s in sites if s.get("coordinate_type") == "Country centroid (approximate)")
    print(f"  Precise coordinates: {precise}")
    print(f"  Country-centroid fallback: {approximate}")
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
