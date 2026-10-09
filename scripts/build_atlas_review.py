"""Build local review artifacts, preserving all upstream coordinates.

Display candidates are silhouette constrained, not clinically approved.
Run with Codex bundled Python (Pillow, numpy, reportlab).
"""
from pathlib import Path
import base64
import io
import json
import textwrap
from collections import defaultdict
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/verification/atlas-review'
PDF = ROOT / 'output/pdf/atlas_전신_혈자리_검수.pdf'
OUT.mkdir(parents=True, exist_ok=True)
PDF.parent.mkdir(parents=True, exist_ok=True)
FONT = '/System/Library/Fonts/AppleSDGothicNeo.ttc'
font = lambda n: ImageFont.truetype(FONT, n)
def wrap_pixels(text, drawing, face, width):
    lines, line = [], ''
    for char in ' '.join(text.split()):
        if line and drawing.textlength(line + char, font=face) > width:
            lines.append(line)
            line = char
        else:
            line += char
    if line:
        lines.append(line)
    return lines
views = {'anterior': '앞면', 'posterior': '뒷면', 'lateral': '옆면', 'head': '머리·얼굴'}
figures, masks, interiors, plates = {}, {}, {}, {}

def uri(im):
    buf = io.BytesIO()
    im.save(buf, format='PNG')
    return 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()

for view, label in views.items():
    src = Image.open(ROOT / f'data/acupoints/figures/{view}.png').convert('RGBA')
    bg = Image.new('RGBA', src.size, 'white')
    bg.alpha_composite(src)
    im = bg.convert('RGB')
    # Original outline is a barrier. Flood-filled exterior is excluded.
    m = im.convert('L').point(lambda v: 0 if v < 150 else 255)
    ImageDraw.floodfill(m, (0, 0), 128, thresh=0)
    interior = m.point(lambda v: 255 if v == 255 else 0).filter(ImageFilter.MinFilter(13))
    mask = np.array(interior) == 255
    yy, xx = np.where(mask)
    assert len(xx) > 1000, view
    masks[view], interiors[view], plates[view] = mask, (xx, yy), im
    figures[view] = {'label': label, 'image': uri(im), 'mask': uri(interior)}

source = json.loads((ROOT / 'data/acupoints/경혈_361_위치좌표.json').read_text())['points']
ankle = json.loads((ROOT / 'docs/verification/atlas_발목_데모_표시좌표.json').read_text())['points']
ankle = {p['code']: p for p in ankle}
points = []
for p in source:
    original = p['diagram_position']
    view = original['view']
    x, y = round(original['x'] * 900), round(original['y'] * 1600)
    initial = (x, y)
    if p['code'] in ankle:
        a = ankle[p['code']]
        view, x, y = a['view'], a['x'], a['y']
    if not masks[view][min(1599, max(0, y)), min(899, max(0, x))]:
        xx, yy = interiors[view]
        i = np.argmin((xx - x) ** 2 + (yy - y) ** 2)
        x, y = int(xx[i]), int(yy[i])
    assert masks[view][y, x], p['code']
    points.append({'code': p['code'], 'name': p['name_ko'], 'region': p['body_region_hint']['name_ko'],
                   'meridian': p['meridian_name_ko'], 'location': p['location_ko'],
                   'reference': p['location_reference_url'], 'view': view, 'x': x, 'y': y,
                   'adjusted': (x, y) != initial or view != original['view'],
                   'original_coordinate': original, 'clinical_review_status': 'pending'})
assert len(points) == len({p['code'] for p in points}) == 361
meta = {'schema_version': 1, 'dataset': 'atlas361-display-review', 'clinical_approval': False,
        'ankle_sheet_visual_review': 'user_confirmed', 'note': 'Display candidates only. Original coordinates preserved; nearest interior projection does not validate clinical anatomy. No full left/right instances or invisible-surface diagrams.',
        'source': 'https://acupointatlas.com/atlas/', 'license': 'CC BY 4.0', 'figures': figures, 'points': points}
template = (ROOT / 'docs/verification/atlas-review-template.html').read_text()
(OUT / 'index.html').write_text(template.replace('__DATA__', json.dumps(meta, ensure_ascii=False).replace('</', '<\\/')))
(OUT / 'display-candidates.json').write_text(json.dumps({k: v for k, v in meta.items() if k != 'figures'}, ensure_ascii=False, indent=2) + '\n')

overview = Image.new('RGB', (1800, 1140), '#fffdf9')
d = ImageDraw.Draw(overview)
d.text((35, 25), '전신 혈자리 검수 - Atlas 361종', font=font(38), fill='#183b3a')
d.text((35, 80), '부위별 상세 검수 화면과 PDF 제공 · 빨간 점은 화면 표시 후보 · 임상 위치 검수 전', font=font(24), fill='#496560')
for n, (view, label) in enumerate(views.items()):
    x0 = 25 + n * 445
    d.text((x0 + 12, 135), label, font=font(28), fill='#183b3a')
    im = plates[view].copy()
    dd = ImageDraw.Draw(im)
    for p in points:
        if p['view'] == view:
            x, y = p['x'], p['y']
            dd.ellipse((x - 4, y - 4, x + 4, y + 4), fill='#dd293b')
    overview.paste(im.resize((435, 773)), (x0, 185))
    d.text((x0 + 12, 982), str(sum(p['view'] == view for p in points)) + '종', font=font(23), fill='#496560')
d.text((35, 1040), '목록에서 혈명을 선택하면 확대됩니다. 위치 맞음 / 위치 수정 / 판단 보류와 메모를 남겨주세요.', font=font(24), fill='#183b3a')
d.text((35, 1090), 'AcuAtlas (CC BY 4.0) · 도해 확대, 점 표시, 윤곽 밖 좌표의 표시 후보 보정 · 원본 좌표 보존', font=font(20), fill='#496560')
overview.save(OUT / 'overview.png')

groups = defaultdict(list)
for p in points:
    groups[(p['region'], p['view'])].append(p)
pages = []
for (region, view), items in groups.items():
    for start in range(0, len(items), 8):
        pages.append((region, view, items[start:start + 8]))
pdf = canvas.Canvas(str(PDF), pagesize=(900, 650))
pdf.setTitle('Atlas 전신 혈자리 검수 - 정규 경혈 361종')
pdf.drawImage(ImageReader(overview), 0, 40, width=900, height=570)
pdf.showPage()
page_index = []
for page_no, (region, view, items) in enumerate(pages, 2):
    page = Image.new('RGB', (1800, 1300), 'white')
    dd = ImageDraw.Draw(page)
    dd.text((35, 30), f'{region} / {views[view]} - 혈자리 위치 검수', font=font(36), fill='#183b3a')
    dd.text((35, 85), f'{page_no}쪽 · 8개 이하씩 표시 · 점의 위치와 아래 설명을 대조해주세요', font=font(24), fill='#496560')
    xs, ys = [p['x'] for p in items], [p['y'] for p in items]
    box = (max(0, min(xs) - 120), max(0, min(ys) - 100), min(900, max(xs) + 120), min(1600, max(ys) + 100))
    crop = plates[view].crop(box)
    ratio = min(710 / crop.width, 930 / crop.height, 4)
    size = (round(crop.width * ratio), round(crop.height * ratio))
    crop = crop.resize(size, Image.Resampling.LANCZOS)
    ix, iy = 45 + (710 - size[0]) // 2, 165 + (930 - size[1]) // 2
    page.paste(crop, (ix, iy))
    for i, p in enumerate(items):
        px = ix + (p['x'] - box[0]) * ratio
        py = iy + (p['y'] - box[1]) * ratio
        ly = 165 + i * 112
        dd.line((px, py, 825, ly + 17), fill='#bd7373', width=2)
        radius = 4 * ratio
        dd.ellipse((px-radius, py-radius, px+radius, py+radius), fill='#dd293b')
        dd.text((850, ly), f'{i+1}. {p["name"]} {p["code"]}' + (' *' if p['adjusted'] else ''), font=font(27), fill='#a82e36')
        lines = wrap_pixels(p['location'], dd, font(21), 880)
        for j, line in enumerate(lines[:2]):
            dd.text((850, ly + 35 + j * 26), line, font=font(21), fill='#365652')
        if len(lines) > 2:
            dd.text((850, ly + 87), '전체 위치 설명은 검수 화면에서 확인', font=font(17), fill='#496560')
    dd.text((35, 1135), '□ 위치 맞음   □ 위치 수정   □ 판단 보류     메모: ___________________________________', font=font(25), fill='#183b3a')
    dd.text((35, 1195), '* = 원본과 다른 표시 후보(발목 후보 포함). 윤곽 보정은 정확한 취혈 위치 확정을 의미하지 않습니다.', font=font(21), fill='#496560')
    dd.text((35, 1240), 'AcuAtlas CC BY 4.0 · 보이지 않는 면/환자 좌우는 별도 확인 · 시술 시행 기록과 분리', font=font(20), fill='#496560')
    pdf.drawImage(ImageReader(page), 0, 0, width=900, height=650)
    pdf.showPage()
    if page_no in (2, 8, len(pages) + 1):
        page.save(OUT / f'preview-page-{page_no}.png')
    page_index.append({'page': page_no, 'region': region, 'view': view, 'codes': [p['code'] for p in items]})
pdf.save()
assert sorted(c for x in page_index for c in x['codes']) == sorted(p['code'] for p in points)
(OUT / 'page-index.json').write_text(json.dumps(page_index, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'points': len(points), 'regions': len({p['region'] for p in points}), 'pdf_pages': len(pages)+1, 'adjusted_display_candidates': sum(p['adjusted'] for p in points), 'html': str(OUT / 'index.html'), 'pdf': str(PDF)}, ensure_ascii=False))
