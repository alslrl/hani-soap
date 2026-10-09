"""Extract the browser selection catalog without clinical prose or coordinates."""
import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data/acupoints/경혈_361_위치좌표.json"
OUTPUT = ROOT / "data/acupoints/tablet-catalog.json"


def catalog_text():
    original = SOURCE.read_bytes()
    points = []
    for point in json.loads(original)["points"]:
        points.append({
            "code": point["code"], "label_ko": point["name_ko"], "hanja": point["name_hanja"],
            "meridian": point["meridian_code"], "meridian_label": point["meridian_name_ko"],
            "source_region": point["body_region_hint"]["id"],
            "source_region_label": point["body_region_hint"]["name_ko"],
            "source_view": point["diagram_position"]["view"], "laterality": point["laterality_hint"],
            "review_status": point["clinical_review_status"], "reference_url": point["location_reference_url"],
        })
    if len(points) != 361 or len({point["code"] for point in points}) != 361:
        raise ValueError("Expected exactly 361 unique source codes")
    result = {
        "schema_version": 1,
        "purpose": "manual_acupoint_catalog_selection; no point coordinates or treatment recommendation",
        "source_file": SOURCE.name, "source_sha256": hashlib.sha256(original).hexdigest(),
        "source_url": "https://acupointatlas.com/atlas/", "source_license": "CC BY 4.0",
        "names_reference": "KMCRIC 14-meridian list, linked in source records", "points": points,
    }
    return json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n"


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="Read-only source/catalog consistency check")
    args = parser.parse_args()
    expected = catalog_text()
    if args.check:
        if not OUTPUT.exists() or OUTPUT.read_text() != expected:
            raise SystemExit("Catalog is stale. Run scripts/build_tablet_acupoint_catalog.py")
        print("361-point tablet catalog matches the source")
    else:
        OUTPUT.write_text(expected)
        print("Wrote the 361-point tablet selection catalog")
