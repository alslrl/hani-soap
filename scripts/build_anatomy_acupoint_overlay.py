"""Register non-interactive display candidates to each existing anatomy drawing.

This is regional drawing registration, not clinical point-location approval.
No invisible lateral/plantar/perineal surface is invented. Upstream stays intact.
Python standard library only; --check does not write files.
"""
from collections import defaultdict
from hashlib import sha256
import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'docs/verification/atlas-review/display-candidates.json'
CATALOG = ROOT / 'data/acupoints/tablet-catalog.json'
OUTPUT = ROOT / 'data/anatomy/acupoint-reference-overlay.json'
VERSIONS = ('body-map-v2', 'body-map-v3-female')

# Canvas landmarks follow the rendered PNGs, not the source plate's pose.
BANDS = {
    'head': (48, 92), 'face': (96, 141), 'neck': (153, 186),
    'shoulder': (205, 237), 'axilla': (252, 282),
    'chest': (247, 361), 'upper_back': (247, 371),
    'upper_abdomen': (382, 429), 'lower_abdomen': (441, 489),
    'lower_back': (384, 485), 'sacrum': (500, 547),
    'buttock': (550, 588), 'groin': (504, 545),
    'thigh': (606, 688), 'knee': (704, 750),
    'lower_leg': (766, 856), 'ankle': (879, 916), 'foot': (929, 952),
}
ARM_REGIONS = {'upper_arm', 'elbow', 'forearm', 'wrist', 'hand'}
LEG_REGIONS = {'buttock', 'groin', 'thigh', 'knee', 'lower_leg', 'ankle', 'foot'}

def build():
    source = json.loads(SOURCE.read_text())
    catalog = {p['code']: p for p in json.loads(CATALOG.read_text())['points']}
    usable, omitted = [], []
    for p in source['points']:
        if p['view'] == 'lateral' or p['region'] == '회음' or p['code'] == 'KI1':
            omitted.append(p['code'])
            continue
        region = catalog[p['code']]['source_region']
        # The separate head plate contains anterior and posterior scalp points.
        posterior_head = p['view'] == 'head' and (
            p['code'] in {'GV17', 'GV18', 'GV19', 'BL6', 'BL7', 'BL8', 'BL9'}
            or '뒷머리' in p['location'][:30] or '뒤머리' in p['location'][:30]
        )
        usable.append({**p, 'region_id': region,
                       'target_view': 'back' if p['view'] == 'posterior' or posterior_head else 'front'})
    groups = defaultdict(list)
    for p in usable:
        groups[(p['meridian'], p['region_id'], p['target_view'])].append(p)
    radial = defaultdict(list)
    for p in usable:
        radial[(p['region_id'], p['target_view'])].append(abs(p['x'] - 450))
    profiles, registrations = {}, {}
    for version in VERSIONS:
        mask_path = ROOT / f'data/anatomy/{version}-silhouette.json'
        masks = json.loads(mask_path.read_text())
        female = version == 'body-map-v3-female'
        bands = {**BANDS, 'upper_arm': (257, 371), 'elbow': (381, 395),
                 'forearm': (406, 468 if female else 503),
                 'wrist': (476, 488) if female else (513, 524),
                 'hand': (498, 545) if female else (533, 582)}
        views = {'front': [], 'back': []}
        for p in usable:
            region, view = p['region_id'], p['target_view']
            siblings = groups[(p['meridian'], region, view)]
            low, high = min(q['y'] for q in siblings), max(q['y'] for q in siblings)
            # Preserve order along each region/channel while accommodating pose.
            fraction = (p['y'] - low) / (high - low) if high > low else .5
            top, bottom = bands[region]
            y = round(top + (bottom - top) * (.08 + .84 * fraction))
            if p['code'] == 'GV20':
                y = 49  # Crown is not the middle of the head plate.
            sides = ('midline',) if catalog[p['code']]['laterality'] == 'midline' else ('left', 'right')
            for side in sides:
                sign = 0 if side == 'midline' else (1 if (side == 'left') == (view == 'front') else -1)
                spans = [s for s in masks[view][y] if s[1] - s[0] >= 9]
                if region in ARM_REGIONS:
                    candidates = [s for s in spans if (s[0] >= 504 if sign > 0 else s[1] <= 496)]
                    span = max(candidates, key=lambda s: abs((s[0] + s[1]) / 2 - 500), default=None)
                    if span is None:
                        # The proximal arm still joins the torso silhouette.
                        joined = next((s for s in spans if s[0] <= 500 <= s[1]), None)
                        if joined:
                            span = (joined[1] - 38, joined[1]) if sign > 0 else (joined[0], joined[0] + 38)
                elif region in LEG_REGIONS:
                    candidates = [(max(s[0], 504), s[1]) if sign > 0 else (s[0], min(s[1], 496)) for s in spans]
                    candidates = [s for s in candidates if s[1] - s[0] >= 9]
                    span = min(candidates, key=lambda s: abs((s[0] + s[1]) / 2 - 500), default=None)
                    if span is None:
                        joined = next((s for s in spans if s[0] <= 500 <= s[1]), None)
                        if joined:
                            span = (504, joined[1]) if sign > 0 else (joined[0], 496)
                else:
                    span = next((s for s in spans if s[0] <= 500 <= s[1]), None)
                if span is None:
                    raise ValueError(f'No registered surface: {version} {view} {p["code"]} {side}')
                left, right = span[0] + 4, span[1] - 4
                if side == 'midline':
                    x = 500
                else:
                    radius = max(radial[(region, view)]) or 1
                    ratio = max(.08, min(.88, abs(p['x'] - 450) / radius * .88))
                    if region in ARM_REGIONS or region in LEG_REGIONS:
                        x = left + (right - left) * (.18 + .64 * ratio)
                        if sign < 0:
                            x = right - (x - left)
                    else:
                        x = 500 + sign * ((right if sign > 0 else 1000 - left) - 500) * ratio
                x = round(x, 1)
                assert span[0] + 3 <= x <= span[1] - 3, (p['code'], version, view, x, y)
                views[view].append({'code': p['code'], 'side': side, 'region': region,
                                    'x': x, 'y': y, 'source_view': p['view']})
        profiles[version] = views
        registrations[version] = {'silhouette_sha256': sha256(mask_path.read_bytes()).hexdigest(),
                                  'source_license': 'CC-BY-4.0',
                                  'registration_license': 'CC-BY-4.0' if female else 'CC-BY-SA-4.0'}
    return {'schema_version': 1, 'purpose': 'visual_reference_only', 'clinical_approval': False,
            'clinical_review_status': 'pending', 'coordinate_plane': [1000, 1000],
            'method': 'region_channel_order_registration_to_rendered_silhouettes',
            'source': 'https://acupointatlas.com/atlas/', 'source_file': str(SOURCE.relative_to(ROOT)),
            'source_sha256': sha256(SOURCE.read_bytes()).hexdigest(),
            'omitted_codes': sorted(omitted), 'omitted_reason': 'lateral_or_hidden_surface',
            'registrations': registrations, 'profiles': profiles}

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    text = json.dumps(build(), ensure_ascii=False, separators=(',', ':')) + '\n'
    if args.check:
        if not OUTPUT.exists() or OUTPUT.read_text() != text:
            raise SystemExit('Overlay registration is stale. Run the generator.')
        print('Anatomy reference dots match the source and both registered silhouettes')
    else:
        OUTPUT.write_text(text)
        print(OUTPUT.relative_to(ROOT))
