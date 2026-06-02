"""Merge radar/activity/contact data from notebook responses into the existing Excel file.

Reads:
  data/us_missile_range_data.xlsx  (existing Sites sheet - already populated with 235 sites)
  data/notebook-responses/radars-*.txt
  data/notebook-responses/activities-*.txt
  data/notebook-responses/contacts-*.txt

Writes:
  data/us_missile_range_data.xlsx  (with Radars, Site_Activities, Contacts sheets populated)
"""
import os
import re
import glob
import difflib
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment

# Well-known sites mentioned in notebook responses but missing from Sites sheet.
# (country, normalized_name_pattern) -> (canonical_name, lat, lon, size, type, mgmt, operator, description)
MISSING_SITES = [
    ("USA", "eareckson air station", "Eareckson Air Station (Shemya)", 52.7126, 174.1138, "Large", "Base",
     "U.S. Air Force", "Alaska ANG / Space Force", "Aleutian island station hosting the Cobra Dane (AN/FPS-108) phased-array radar for ballistic missile early warning and space surveillance."),
    ("USA", "clear space force station", "Clear Space Force Station", 64.2906, -149.1881, "Strategic / Mega", "Radar Site",
     "U.S. Space Force", "U.S. Space Force", "Alaskan installation hosting the Long Range Discrimination Radar (LRDR/AN/FPS-138) for homeland missile defense and space domain awareness."),
    ("USA", "cavalier space force station", "Cavalier Space Force Station", 48.7244, -97.8997, "Large", "Radar Site",
     "U.S. Space Force", "U.S. Space Force", "North Dakota installation hosting the PARCS phased-array radar (AN/FPQ-16) for early warning of ICBM and SLBM threats and space surveillance."),
    ("USA", "beale air force base", "Beale Air Force Base", 39.1361, -121.4364, "Large", "Base",
     "U.S. Air Force", "U.S. Space Force / 7th Space Warning Squadron", "California base hosting the AN/FPS-132 PAVE PAWS phased-array radar for sea-launched ballistic missile early warning and space surveillance."),
    ("USA", "cape cod space force station", "Cape Cod Space Force Station", 41.7522, -70.5378, "Large", "Radar Site",
     "U.S. Space Force", "6th Space Warning Squadron", "Massachusetts installation with the AN/FPS-132 PAVE PAWS radar covering the Atlantic for SLBM early warning."),
    ("USA", "thule air base", "Thule Air Base (Pituffik Space Base)", 76.5311, -68.7032, "Strategic / Mega", "Base",
     "U.S. Space Force", "U.S. Space Force / 12th Space Warning Squadron", "Greenland installation hosting the AN/FPS-132 BMEWS upgraded early warning radar covering polar approaches to North America."),
    ("UK", "raf fylingdales", "RAF Fylingdales", 54.3617, -0.6700, "Strategic / Mega", "Radar Site",
     "Royal Air Force", "RAF / U.S. Space Force", "UK BMEWS radar station with the AN/FPS-132 SSPARS providing ballistic missile early warning and space surveillance."),
    ("Norway", "vardo", "Vardo Globus Radar", 70.3667, 31.1267, "Large", "Radar Site",
     "Norwegian Intelligence Service", "Norwegian Intelligence Service", "Northern Norway radar complex (Globus II/III) for space surveillance and intelligence collection."),
    ("Israel", "ein shemer", "Ein Shemer Airfield", 32.4406, 35.0083, "Small", "Base",
     "Israel Defense Forces", "Israeli Air Defense Command", "Air base hosting Arrow 2 missiles and a Super Green Pine radar for target detection and tracking."),
    ("Israel", "sdot micha", "Sdot Micha Airbase", 31.7333, 34.9333, "Small", "Base",
     "Israel Defense Forces", "Israeli Air Defense Command", "Air base hosting Arrow 2 missile defense systems."),
    ("Israel", "13th missile", "13th Missile Defence Battery", 32.5000, 35.0000, "Small", "Radar Site",
     "U.S. Army / 1st Space Brigade", "U.S. Army / 1st Space Brigade", "U.S. Army site in Israel operating an AN/TPY-2 transportable radar to support ballistic missile defense."),
    ("Poland", "redzikowo", "Aegis Ashore Poland (Redzikowo)", 54.5333, 17.0167, "Large", "Radar Site",
     "U.S. Navy / Missile Defense Agency", "U.S. Navy", "Aegis Ashore missile defense site in northern Poland with SPY-1D radar and SM-3 interceptors."),
    ("Romania", "deveselu", "Aegis Ashore Romania (Deveselu)", 44.3667, 24.4000, "Large", "Radar Site",
     "U.S. Navy / Missile Defense Agency", "U.S. Navy", "Aegis Ashore missile defense site in Romania with SPY-1D radar and SM-3 interceptors."),
    ("USA", "adak", "Adak Island Station", 51.8800, -176.6580, "Medium", "Radar Site",
     "U.S. Navy", "U.S. Navy / Missile Defense Agency", "Aleutian Island station historically supporting Cobra Judy and now Sea-Based X-band Radar (SBX-1) home port."),
    ("USA", "pearl harbor", "Pearl Harbor Naval Base", 21.3500, -157.9667, "Strategic / Mega", "Base",
     "U.S. Navy", "U.S. Pacific Fleet", "Major Hawaiian naval base; home port for Aegis BMD-capable ships and Sea-Based X-band Radar (SBX-1)."),
    ("Brazil", "natal", "Barreira do Inferno Launch Center (Natal)", -5.9214, -35.1656, "Medium", "Launch Site",
     "Brazilian Air Force", "FAB / Aeronautics and Space Institute", "First Brazilian sounding-rocket launch site, near Natal, operational since 1965."),
    ("Finland", "kaamanen", "Kaamanen Radar Site", 69.1167, 27.2167, "Small", "Radar Site",
     "Finnish Defence Forces", "Finnish Defence Forces", "Northern Finland air surveillance radar near Inari."),
    ("Finland", "rovaniemi", "Rovaniemi Air Base", 66.5642, 25.8306, "Medium", "Base",
     "Finnish Air Force", "Finnish Air Force", "Finnish Air Force base in Lapland with regional surveillance radars."),
    ("India", "integrated test range", "Integrated Test Range (ITR Chandipur)", 21.0167, 86.7167, "Strategic / Mega", "Range",
     "Defence Research and Development Organisation", "DRDO", "Principal Indian missile test range at Chandipur, Odisha, with two launch complexes and a tracking radar network."),
    ("Marshall Islands", "kwajalein", "Kwajalein Atoll", 8.7181, 167.7328, "Strategic / Mega", "Range",
     "U.S. Army Space and Missile Defense Command", "U.S. Army", "Reagan Test Site complex spanning multiple Kwajalein Atoll islands including Kwajalein, Roi-Namur, Meck, and Illeginni."),
    ("Marshall Islands", "meck", "Meck Island", 9.0444, 167.6128, "Medium", "Test Facility",
     "U.S. Army Space and Missile Defense Command", "U.S. Army", "Kwajalein Atoll island used as a launch and intercept site for missile defense testing."),
    ("Marshall Islands", "roi-namur", "Roi-Namur Island", 9.3950, 167.4700, "Large", "Radar Site",
     "U.S. Army Space and Missile Defense Command", "U.S. Army", "Northern Kwajalein Atoll island hosting major Reagan Test Site radars including ALTAIR, TRADEX, and ALCOR."),
    ("USA", "shariki", "Shariki Communications Site", 40.9667, 141.3333, "Medium", "Radar Site",
     "Japan Air Self-Defense Force / U.S. Army", "U.S. Army Forward-Based X-Band Transportable Radar", "Forward-based AN/TPY-2 X-band radar in Aomori, Japan for missile defense."),
    ("USA", "kyogamisaki", "Kyogamisaki Communications Site", 35.6500, 135.2167, "Medium", "Radar Site",
     "Japan Air Self-Defense Force / U.S. Army", "U.S. Army Forward-Based X-Band Transportable Radar", "Forward-based AN/TPY-2 X-band radar in Kyoto, Japan for missile defense."),
    ("USA", "kurecik", "Kurecik Radar Station", 38.7167, 37.4833, "Medium", "Radar Site",
     "Turkish Air Force / U.S. Army", "U.S. Army Forward-Based X-Band Transportable Radar", "Forward-based AN/TPY-2 X-band missile defense radar in Malatya, Turkey, part of NATO's BMD architecture."),
    ("USA", "diego garcia", "Diego Garcia GEODSS", -7.4117, 72.4525, "Large", "Tracking Station",
     "U.S. Space Force", "Detachment 2, 21st Operations Group", "British Indian Ocean Territory site with a Ground-Based Electro-Optical Deep Space Surveillance (GEODSS) facility and Space Surveillance Telescope."),
    ("USA", "socorro", "Socorro GEODSS (White Sands)", 33.8175, -106.6597, "Medium", "Tracking Station",
     "U.S. Space Force", "Detachment 1, 21st Operations Group", "New Mexico GEODSS site at White Sands Missile Range for deep-space surveillance."),
    ("USA", "maui", "Maui Space Surveillance Complex", 20.7088, -156.2570, "Large", "Tracking Station",
     "U.S. Space Force / AFRL", "MIT Lincoln Laboratory", "Haleakala-summit complex hosting AEOS, GEODSS, and other optical and EO sensors for space domain awareness."),
    ("USA", "kaena point", "Kaena Point Space Force Station", 21.5722, -158.2742, "Medium", "Tracking Station",
     "U.S. Space Force", "Detachment 3, 21st Space Operations Squadron", "Oahu, Hawaii satellite tracking station with multiple parabolic dish antennas."),
]


def add_missing_sites_to_index(wb, index: dict):
    """Add the hardcoded missing sites to the Sites sheet and update the index."""
    sheet = wb["Sites"]
    headers = [c.value for c in sheet[1]]
    # Find the highest existing site_id number
    id_col = headers.index("site_id") + 1
    max_n = 0
    for row in range(2, sheet.max_row + 1):
        v = sheet.cell(row=row, column=id_col).value
        if v and v.startswith("SITE-"):
            try:
                n = int(v[5:])
                if n > max_n:
                    max_n = n
            except ValueError:
                pass

    added = 0
    for country, key, name, lat, lon, size, stype, mgmt, op, desc in MISSING_SITES:
        norm_country = country.lower()
        norm_key = key.lower()
        # Check if already in index
        if (norm_country, norm_key) in index:
            continue
        # Also check by name
        norm_name_full = re.sub(r"[^\w\s]", "", name.lower()).strip()
        if (norm_country, norm_name_full) in index:
            continue

        max_n += 1
        sid = f"SITE-{max_n:04d}"
        size_score = {"Small": 20, "Medium": 45, "Large": 70, "Strategic / Mega": 90}.get(size, 45)
        sheet.append([
            sid, name, stype, size, size_score, country, "",
            lat, lon, "Site centroid", mgmt, op,
            "", "", "", "", "", "", desc,
            "Medium", "2026-06-02", "Published",
        ])
        # Index by all reasonable keys
        index[(norm_country, norm_key)] = sid
        index[(norm_country, norm_name_full)] = sid
        added += 1

    print(f"  Added {added} missing well-known sites")

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RESPONSES_DIR = os.path.join(BASE, "data", "notebook-responses")
EXCEL_FILE = os.path.join(BASE, "data", "us_missile_range_data.xlsx")

VALID_RADAR_TYPES = {"Tracking", "Surveillance", "Fire-control", "Phased-array",
                     "Telemetry", "Weather/range radar", "Unknown"}
VALID_OP_STATUS = {"Active", "Inactive", "Historical", "Unknown"}
VALID_ACT_CATEGORIES = {"Missile Test", "Space Launch", "Radar Tracking",
                        "Telemetry", "Missile Defense", "Range Safety",
                        "Aerospace Test", "Other"}
VALID_ACT_STATUS = {"Current", "Historical", "Planned", "Unknown"}
VALID_CONTACT_TYPES = {"Public Affairs", "Media", "Visitor Office",
                       "Contracting", "General Info", "Other"}


def clean_text(s: str) -> str:
    if not s or s.strip().upper() in ("N/A", "NA", "-", ""):
        return ""
    s = re.sub(r"\[\d+(?:,\s*\d+)*\]", "", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def normalize_country(s: str) -> str:
    s = clean_text(s)
    mapping = {
        "United States": "USA", "United States of America": "USA",
        "U.S.A.": "USA", "U.S.": "USA", "US": "USA",
        "United Kingdom": "UK", "U.K.": "UK", "Great Britain": "UK",
        "United Arab Emirates": "UAE", "U.A.E.": "UAE",
        "Democratic Republic of the Congo": "DRC", "Zaire": "DRC",
        "Republic of Korea": "South Korea",
        "Korea, Republic of": "South Korea",
        "Korea, North": "North Korea",
        "Democratic People's Republic of Korea": "North Korea",
        "DPRK": "North Korea", "ROK": "South Korea",
    }
    return mapping.get(s, s)


def normalize_radar_type(s: str) -> str:
    s = clean_text(s)
    if s in VALID_RADAR_TYPES:
        return s
    low = s.lower()
    if "phased" in low or "array" in low:
        return "Phased-array"
    if "fire" in low or "control" in low:
        return "Fire-control"
    if "track" in low:
        return "Tracking"
    if "surveill" in low:
        return "Surveillance"
    if "telem" in low:
        return "Telemetry"
    if "weather" in low or "range" in low:
        return "Weather/range radar"
    return "Unknown"


def normalize_op_status(s: str) -> str:
    s = clean_text(s)
    if s in VALID_OP_STATUS:
        return s
    low = s.lower()
    if "active" in low or "operational" in low or "current" in low:
        return "Active"
    if "inactive" in low or "retired" in low or "decommissioned" in low:
        return "Inactive"
    if "historical" in low or "former" in low:
        return "Historical"
    return "Unknown"


def normalize_activity_category(s: str) -> str:
    s = clean_text(s)
    if s in VALID_ACT_CATEGORIES:
        return s
    low = s.lower()
    if "missile defense" in low or "interceptor" in low:
        return "Missile Defense"
    if "missile" in low and "test" in low:
        return "Missile Test"
    if "space" in low and ("launch" in low or "orbital" in low):
        return "Space Launch"
    if "launch" in low:
        return "Space Launch"
    if "radar" in low and "track" in low:
        return "Radar Tracking"
    if "telem" in low:
        return "Telemetry"
    if "range" in low and "safety" in low:
        return "Range Safety"
    if "aerospace" in low or "atmospheric" in low or "sounding" in low:
        return "Aerospace Test"
    if "test" in low:
        return "Missile Test"
    return "Other"


def normalize_activity_status(s: str) -> str:
    s = clean_text(s)
    if s in VALID_ACT_STATUS:
        return s
    low = s.lower()
    if "current" in low or "active" in low or "ongoing" in low:
        return "Current"
    if "historical" in low or "former" in low or "discontinued" in low:
        return "Historical"
    if "planned" in low or "future" in low:
        return "Planned"
    return "Unknown"


def normalize_contact_type(s: str) -> str:
    s = clean_text(s)
    if s in VALID_CONTACT_TYPES:
        return s
    low = s.lower()
    if "public affairs" in low or "pao" in low:
        return "Public Affairs"
    if "media" in low or "press" in low:
        return "Media"
    if "visitor" in low or "tour" in low:
        return "Visitor Office"
    if "contract" in low:
        return "Contracting"
    if "general" in low or "info" in low:
        return "General Info"
    return "Other"


def parse_year(s: str) -> int | None:
    s = clean_text(s)
    if not s:
        return None
    m = re.search(r"\b(19|20|21)\d{2}\b", s)
    return int(m.group()) if m else None


def parse_record_lines(prefix: str, filenames: list[str]) -> list[list[str]]:
    """Parse pipe-delimited lines starting with prefix, handling wrapped continuations."""
    records = []
    for fname in filenames:
        if not os.path.exists(fname):
            continue
        with open(fname, "r", encoding="utf-8") as f:
            raw = f.read()
        chunks = []
        current = None
        for line in raw.split("\n"):
            if line.startswith(prefix + "|"):
                if current is not None:
                    chunks.append(current)
                current = line
            elif current is not None and not line.startswith(("Answer:", "New conversation:", "Notebook")):
                current += " " + line.strip()
        if current is not None:
            chunks.append(current)
        for line in chunks:
            line = re.sub(r"\s+", " ", line).strip()
            parts = line.split("|")
            records.append([p.strip() for p in parts])
    return records


def build_site_index(wb) -> dict:
    """Build a mapping from (country, normalized_site_name) -> site_id."""
    sheet = wb["Sites"]
    headers = [c.value for c in sheet[1]]
    name_col = headers.index("site_name") + 1
    country_col = headers.index("country") + 1
    id_col = headers.index("site_id") + 1

    index = {}
    for row in range(2, sheet.max_row + 1):
        name = sheet.cell(row=row, column=name_col).value
        country = sheet.cell(row=row, column=country_col).value
        sid = sheet.cell(row=row, column=id_col).value
        if name and country and sid:
            norm_name = re.sub(r"[^\w\s]", "", name.lower()).strip()
            norm_country = country.lower().strip()
            index[(norm_country, norm_name)] = sid
            # Also index variations - drop common suffixes
            for suffix in [" space force station", " missile range", " air force base",
                          " test range", " launch complex", " research range",
                          " spaceport", " air base", " air station"]:
                if norm_name.endswith(suffix):
                    short = norm_name[:-len(suffix)].strip()
                    index.setdefault((norm_country, short), sid)
    return index


def _strip_common_suffixes(name: str) -> str:
    """Remove state suffixes and common designator suffixes for matching."""
    # Strip state abbreviation suffix like ", AK" or ", FL"
    name = re.sub(r",\s*[a-z]{2}\s*$", "", name)
    # Strip site/complex suffixes
    name = re.sub(r"\s+site\s+[a-z0-9-]+$", "", name)
    name = re.sub(r"\s+(launch\s+)?complex\s+[a-z0-9-]+$", "", name)
    return name.strip()


def _normalize_keywords(name: str) -> set:
    """Extract significant keywords from a site name."""
    name = name.lower()
    name = re.sub(r"[^\w\s]", " ", name)
    # Drop tiny / common words
    stopwords = {"the", "of", "and", "at", "in", "on", "to", "a", "an", "for", "afb",
                 "air", "force", "base", "station", "site", "test", "range", "facility",
                 "complex", "launch", "missile", "radar", "tracking", "center", "centre",
                 "space", "fb", "sfs", "afs", "afstn", "us", "u.s.", "ng"}
    words = [w for w in name.split() if len(w) >= 3 and w not in stopwords]
    return set(words)


def match_site(index: dict, country: str, site_name: str) -> str | None:
    """Find site_id from (country, site_name). Multi-stage matching."""
    norm_country = normalize_country(country).lower().strip()
    raw_name = clean_text(site_name).lower()
    norm_name = re.sub(r"[^\w\s]", "", raw_name).strip()
    if not norm_name:
        return None

    same_country = [(name, s) for (c, name), s in index.items() if c == norm_country]

    # 0. "City, State" pattern detection — done on raw name BEFORE comma strip
    m = re.match(r"^([a-z][a-z\s\-']+?)\s*,\s*([a-z]{2,})\s*$", raw_name)
    if m:
        city = re.sub(r"[^\w\s]", "", m.group(1).strip())
        if len(city) >= 3:
            # Match anything starting with city + space, or just city
            for idx_name, idx_sid in same_country:
                if idx_name == city or idx_name.startswith(city + " ") or idx_name.startswith(city + "-"):
                    return idx_sid

    # 1. Exact match
    sid = index.get((norm_country, norm_name))
    if sid:
        return sid

    # 2. Try after stripping common suffixes
    stripped = _strip_common_suffixes(norm_name)
    if stripped != norm_name:
        sid = index.get((norm_country, stripped))
        if sid:
            return sid

    # 3. Substring match (longer side)
    for idx_name, idx_sid in same_country:
        if len(norm_name) >= 5 and len(idx_name) >= 5:
            if norm_name in idx_name or idx_name in norm_name:
                return idx_sid

    # 4. Keyword overlap (Jaccard-like)
    query_kw = _normalize_keywords(norm_name)
    if query_kw:
        best_sid = None
        best_score = 0.0
        for idx_name, idx_sid in same_country:
            idx_kw = _normalize_keywords(idx_name)
            if not idx_kw:
                continue
            inter = len(query_kw & idx_kw)
            if inter == 0:
                continue
            score = inter / max(len(query_kw), len(idx_kw))
            if score > best_score:
                best_score = score
                best_sid = idx_sid
        if best_score >= 0.5:
            return best_sid

    # 5. "City, State" pattern - extract the city and match anything that starts with it
    m = re.match(r"^([a-z][a-z\s]+?)\s*,\s*[a-z]{2,}\s*$", norm_name)
    if m:
        city = m.group(1).strip()
        if len(city) >= 4:
            # Find names that start with the city or contain it as a prefix word
            for idx_name, idx_sid in same_country:
                if idx_name.startswith(city + " ") or idx_name == city:
                    return idx_sid

    # 6. difflib fuzzy match on full name
    names = [name for name, _ in same_country]
    matches = difflib.get_close_matches(norm_name, names, n=1, cutoff=0.7)
    if matches:
        for idx_name, idx_sid in same_country:
            if idx_name == matches[0]:
                return idx_sid

    return None


def style_header(sheet):
    for cell in sheet[1]:
        cell.font = Font(bold=True, color="FFFFFFFF")
        cell.fill = PatternFill(start_color="FF1E3A5F", end_color="FF1E3A5F", fill_type="solid")
        cell.alignment = Alignment(horizontal="center", vertical="center")
    sheet.auto_filter.ref = sheet.dimensions


def write_radars(wb, index):
    radar_files = sorted(glob.glob(os.path.join(RESPONSES_DIR, "radars-*.txt")))
    records = parse_record_lines("RADAR", radar_files)

    sheet = wb["Radars"]
    sheet.delete_rows(1, sheet.max_row)
    sheet.append(["radar_id", "site_id", "radar_name", "radar_model", "radar_type",
                  "frequency_band", "purpose", "owner", "operator", "manufacturer",
                  "installation_date", "upgrade_date", "fix_date", "operational_status",
                  "public_description", "confidence_level", "last_verified_date",
                  "source_id", "record_status"])

    seen = set()
    radar_idx = 0
    matched = 0
    unmatched_examples = []
    for parts in records:
        # RADAR|country|site_name|radar_name|radar_model|radar_type|frequency_band|purpose|operator|manufacturer|installation_date|operational_status|description
        if len(parts) < 13:
            continue
        country = parts[1].strip()
        site_name = parts[2].strip()
        radar_name = clean_text(parts[3])
        radar_model = clean_text(parts[4])
        radar_type = normalize_radar_type(parts[5])
        freq = clean_text(parts[6])
        purpose = clean_text(parts[7]) or "Not specified"
        operator = clean_text(parts[8])
        manufacturer = clean_text(parts[9])
        install = clean_text(parts[10])
        op_status = normalize_op_status(parts[11])
        desc = clean_text("|".join(parts[12:])) or purpose

        # Fallback: derive radar_name from model/type if missing
        if not radar_name:
            if radar_model:
                radar_name = radar_model
            elif radar_type and radar_type != "Unknown":
                radar_name = f"{radar_type} radar"
            else:
                # Last resort - skip records with no identifying info at all
                if not purpose or purpose == "Not specified":
                    continue
                radar_name = "Radar system"

        sid = match_site(index, country, site_name)
        if not sid:
            if len(unmatched_examples) < 5:
                unmatched_examples.append(f"{country}::{site_name}")
            continue
        matched += 1

        key = (sid, radar_name.lower())
        if key in seen:
            continue
        seen.add(key)

        radar_idx += 1
        sheet.append([
            f"RAD-{radar_idx:04d}",
            sid,
            radar_name,
            radar_model,
            radar_type,
            freq,
            purpose,
            "",  # owner
            operator,
            manufacturer,
            install,
            "",  # upgrade_date
            "",  # fix_date
            op_status,
            desc,
            "Medium",
            "2026-06-02",
            "SRC-001",
            "Published",
        ])

    style_header(sheet)
    widths = [10, 10, 35, 18, 18, 14, 50, 25, 25, 25, 14, 14, 14, 16, 70, 14, 16, 10, 14]
    for i, w in enumerate(widths, start=1):
        sheet.column_dimensions[openpyxl.utils.get_column_letter(i)].width = w

    print(f"  Radars: {radar_idx} written ({matched} matched to sites, {len(records) - matched} unmatched)")
    if unmatched_examples:
        print(f"    Sample unmatched: {unmatched_examples}")


def write_activities(wb, index):
    files = sorted(glob.glob(os.path.join(RESPONSES_DIR, "activities-*.txt")))
    records = parse_record_lines("ACTIVITY", files)

    sheet = wb["Site_Activities"]
    sheet.delete_rows(1, sheet.max_row)
    sheet.append(["activity_id", "site_id", "activity_category", "activity_description",
                  "missile_or_system_type", "start_year", "end_year", "status",
                  "source_id", "confidence_level"])

    seen = set()
    idx = 0
    matched = 0
    for parts in records:
        # ACTIVITY|country|site_name|activity_category|description|systems|start_year|end_year|status
        if len(parts) < 9:
            continue
        country = parts[1]
        site_name = parts[2]
        cat = normalize_activity_category(parts[3])
        desc = clean_text(parts[4])
        systems = clean_text(parts[5])
        start_year = parse_year(parts[6])
        end_year = parse_year(parts[7])
        status = normalize_activity_status(parts[8])

        if not desc:
            continue

        sid = match_site(index, country, site_name)
        if not sid:
            continue
        matched += 1

        key = (sid, desc[:100].lower())
        if key in seen:
            continue
        seen.add(key)

        idx += 1
        sheet.append([
            f"ACT-{idx:04d}",
            sid,
            cat,
            desc,
            systems,
            start_year,
            end_year,
            status,
            "SRC-001",
            "Medium",
        ])

    style_header(sheet)
    widths = [10, 10, 20, 70, 35, 12, 12, 12, 10, 14]
    for i, w in enumerate(widths, start=1):
        sheet.column_dimensions[openpyxl.utils.get_column_letter(i)].width = w

    print(f"  Activities: {idx} written ({matched} matched)")


def write_contacts(wb, index):
    files = sorted(glob.glob(os.path.join(RESPONSES_DIR, "contacts-*.txt")))
    records = parse_record_lines("CONTACT", files)

    sheet = wb["Contacts"]
    sheet.delete_rows(1, sheet.max_row)
    sheet.append(["contact_id", "site_id", "organization_name", "contact_type",
                  "contact_email", "contact_phone", "contact_url", "notes", "source_id"])

    seen = set()
    idx = 0
    matched = 0
    for parts in records:
        # CONTACT|country|site_name|organization_name|contact_type|email|phone|url
        if len(parts) < 8:
            continue
        country = parts[1]
        site_name = parts[2]
        org = clean_text(parts[3])
        ctype = normalize_contact_type(parts[4])
        email = clean_text(parts[5])
        phone = clean_text(parts[6])
        url = clean_text(parts[7])

        if not org:
            continue

        sid = match_site(index, country, site_name)
        if not sid:
            continue
        matched += 1

        key = (sid, org.lower())
        if key in seen:
            continue
        seen.add(key)

        idx += 1
        sheet.append([
            f"CON-{idx:04d}",
            sid,
            org,
            ctype,
            email,
            phone,
            url,
            "",
            "SRC-001",
        ])

    style_header(sheet)
    widths = [10, 10, 35, 16, 30, 16, 50, 30, 10]
    for i, w in enumerate(widths, start=1):
        sheet.column_dimensions[openpyxl.utils.get_column_letter(i)].width = w

    print(f"  Contacts: {idx} written ({matched} matched)")


def main():
    print(f"Loading {EXCEL_FILE}")
    wb = openpyxl.load_workbook(EXCEL_FILE)
    print(f"Building site index from existing Sites sheet...")
    index = build_site_index(wb)
    print(f"  Indexed {len(index)} (country, name) keys for matching")

    add_missing_sites_to_index(wb, index)
    print(f"  Index now has {len(index)} keys")

    write_radars(wb, index)
    write_activities(wb, index)
    write_contacts(wb, index)

    wb.save(EXCEL_FILE)
    print(f"\nSaved: {EXCEL_FILE}")


if __name__ == "__main__":
    main()
