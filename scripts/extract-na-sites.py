"""Extract all sites from notebook responses that have N/A coordinates."""
import glob
import os
import re
from collections import defaultdict

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RESPONSES_DIR = os.path.join(BASE, "data", "notebook-responses")


def parse_lines(prefix: str, file_pattern: str):
    files = sorted(glob.glob(os.path.join(RESPONSES_DIR, file_pattern)))
    out = []
    for fname in files:
        with open(fname, "r", encoding="utf-8") as f:
            raw = f.read()
        chunks = []
        current = None
        for line in raw.split("\n"):
            if line.startswith(prefix + "|"):
                if current:
                    chunks.append(current)
                current = line
            elif current and not line.startswith(("Answer:", "New conversation:")):
                current += " " + line.strip()
        if current:
            chunks.append(current)
        for c in chunks:
            c = re.sub(r"\s+", " ", c).strip()
            out.append(c.split("|"))
    return out


def main():
    records = parse_lines("SITE", "*.txt")
    print(f"Total SITE records in responses: {len(records)}")

    na_by_country = defaultdict(list)
    for parts in records:
        if len(parts) < 10:
            continue
        country = parts[1].strip()
        name = parts[2].strip()
        lat = parts[3].strip().upper()
        lon = parts[4].strip().upper()
        if lat in ("N/A", "NA", "-", "") or lon in ("N/A", "NA", "-", ""):
            na_by_country[country].append(name)

    total = sum(len(v) for v in na_by_country.values())
    print(f"\nSites with N/A coordinates: {total}\n")
    for country in sorted(na_by_country.keys()):
        names = sorted(set(na_by_country[country]))
        print(f"=== {country}: {len(names)} ===")
        for n in names:
            print(f"  - {n}")


if __name__ == "__main__":
    main()
