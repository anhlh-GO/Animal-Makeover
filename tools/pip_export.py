"""Pip (Hedgehog) level art: cut the generated images in `anh animal/` into game sprites.

Character images are full 1024x1536 renders of the same pose. Each overlay image (OV_*) is the base render edited
with something added (burrs, gum, foam...). The added part is found by comparing it with its source render, then
cut out (whole layer or one sprite per connected piece). Output: assets/tex/pip/*.webp and data/level11_pack.json
(sprite table + layout: every sprite's centre in the 1024x1536 canvas).

python tools/pip_export.py [--src "../anh animal"] [--debug out_dir]
"""
import argparse, json, os, sys
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as ndi

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CW, CH = 1024, 1536
CHAR_PPU = 153.6  # character canvas 1536 px -> 10 world units
BG_PPU = 1536 / 17.6  # backgrounds 17.6 units tall: cover the tallest phones

ap = argparse.ArgumentParser()
ap.add_argument('--src', default=os.path.join(os.path.dirname(ROOT), 'anh animal'))
ap.add_argument('--debug', default=None)
args = ap.parse_args()
SRC = args.src
OUT_TEX = os.path.join(ROOT, 'assets', 'tex', 'pip')
os.makedirs(OUT_TEX, exist_ok=True)

spr = {}
layout = {}


def load(name, size=(CW, CH)):
    im = Image.open(os.path.join(SRC, name)).convert('RGBA')
    if size and im.size != size:
        im = im.resize(size, Image.LANCZOS)
    a = np.asarray(im).astype(np.float32)
    return a


def strip_bg(a):
    """Renders that came back without transparency: remove the flat background (black, white or a baked checker)
    connected to the top / left / right edges."""
    if (a[..., 3] < 250).mean() > 0.05:
        return a
    rgb = a[..., :3]
    chroma = rgb.max(-1) - rgb.min(-1)
    lum = rgb.mean(-1)
    bgl = (chroma < 16) & ((lum < 40) | (lum > 196))
    lab, n = ndi.label(bgl)
    edge = set(np.unique(lab[0, :])) | set(np.unique(lab[:, 0])) | set(np.unique(lab[:, -1]))
    edge.discard(0)
    bg = np.isin(lab, list(edge))
    # soften the cut edge
    keep = ndi.gaussian_filter((~bg).astype(np.float32), 0.8)
    out = a.copy()
    out[..., 3] = np.minimum(out[..., 3], keep * 255)
    return out


def save_sprite(key, rgba, box, ppu=CHAR_PPU, maxside=None, name=None):
    """rgba: float HxWx4 full canvas; box (x0,y0,x1,y1). Saves a cropped webp and registers the sprite (pivot centre)."""
    x0, y0, x1, y1 = [int(v) for v in box]
    crop = np.clip(rgba[y0:y1, x0:x1], 0, 255).astype(np.uint8)
    im = Image.fromarray(crop, 'RGBA')
    w, h = im.size
    k = 1.0
    if maxside and max(w, h) > maxside:
        k = maxside / max(w, h)
        im = im.resize((max(1, round(w * k)), max(1, round(h * k))), Image.LANCZOS)
    fn = key + '.webp'
    im.save(os.path.join(OUT_TEX, fn), 'WEBP', quality=88, method=6)
    W, H = im.size
    spr['pip:' + key] = ['pip/' + fn, 0, 0, W, H, 0.5, 0.5, ppu * k, [0, 0, 0, 0], name or key, W, H, 0, 0]
    layout[key] = {'cx': (x0 + x1) / 2, 'cy': (y0 + y1) / 2, 'w': x1 - x0, 'h': y1 - y0}
    return 'pip:' + key


def bbox(alpha, thr=8, pad=4):
    ys, xs = np.where(alpha > thr)
    if not len(xs):
        return None
    return (max(0, xs.min() - pad), max(0, ys.min() - pad), min(alpha.shape[1], xs.max() + 1 + pad), min(alpha.shape[0], ys.max() + 1 + pad))


def added(ov, src, thr=42, min_area=120, grow=3, feather=1.6, region=None, open_=1):
    """Mask (0..1) of what the overlay adds on top of its source render."""
    b1 = ndi.gaussian_filter(ov[..., :3], (1.5, 1.5, 0))
    b0 = ndi.gaussian_filter(src[..., :3], (1.5, 1.5, 0))
    d = np.abs(b1 - b0).max(-1)
    # where the overlay has art but the source has none
    d = np.where((src[..., 3] < 60) & (ov[..., 3] > 160), 255, d)
    m = (d > thr) & (ov[..., 3] > 100)
    if region is not None:
        m &= region
    if open_:
        m = ndi.binary_opening(m, iterations=open_)
    lab, n = ndi.label(m)
    if n:
        sizes = ndi.sum(m, lab, range(1, n + 1))
        m = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s >= min_area])
    m = ndi.binary_closing(m, iterations=3)
    m = ndi.binary_fill_holes(m)
    if grow:
        m = ndi.binary_dilation(m, iterations=grow)
    f = ndi.gaussian_filter(m.astype(np.float32), feather)
    return np.clip(f * 1.15, 0, 1)


def layer(ov, mask):
    out = ov.copy()
    out[..., 3] = ov[..., 3] * mask
    return out


def pieces(key, ov, mask, min_area=300, expect=None):
    """One sprite per connected piece of the mask. Returns [(key, cx, cy)] sorted top to bottom."""
    lab, n = ndi.label(mask > 0.35)
    objs = ndi.find_objects(lab)
    sizes = ndi.sum(mask > 0.35, lab, range(1, n + 1))
    res = []
    for i, sl in enumerate(objs):
        if sizes[i] < min_area:
            continue
        pm = ndi.binary_dilation(lab == i + 1, iterations=3)
        pm = ndi.gaussian_filter(pm.astype(np.float32), 1.0) * (mask > 0.02)
        pm = np.maximum(pm, np.where(lab == i + 1, mask, 0))
        L = layer(ov, np.clip(pm, 0, 1))
        bb = bbox(L[..., 3], thr=6, pad=3)
        res.append((sizes[i], bb, L))
    res.sort(key=lambda r: -r[0])
    if expect:
        res = res[:expect]
    res.sort(key=lambda r: (r[1][1] + r[1][3]) / 2)
    out = []
    for j, (_, bb, L) in enumerate(res):
        k = save_sprite('%s_%d' % (key, j), L, bb)
        out.append(k)
    print('  %s: %d pieces (areas %s)' % (key, len(out), [int(r[0]) for r in res]))
    return out


dbg = {}


def keep_dbg(name, mask):
    if args.debug:
        dbg[name] = mask


# ------------------------------------------------------------------ character renders
print('character')
base = load('CH_Pip_base.png')
tub = load('CH_Pip_tub.png')
save_sprite('base', base, (0, 0, CW, CH))
save_sprite('tub', tub, (0, 0, CW, CH))

# faces: the changed area of each expression render, inside the face oval
yy, xx = np.mgrid[0:CH, 0:CW]
face_oval = ((xx - 512) / 330.0) ** 2 + ((yy - 680) / 250.0) ** 2 <= 1
faces = {}
for nm in ['happy', 'sad', 'closed', 'surprised']:
    ex = load('CH_Pip_%s.png' % nm)
    m = added(ex, base, thr=26, min_area=60, grow=10, feather=6, region=face_oval, open_=1)
    faces[nm] = (ex, m)
union = np.zeros((CH, CW), np.float32)
for nm, (ex, m) in faces.items():
    union = np.maximum(union, m)
fb = bbox(union * 255, thr=4, pad=6)
# neutral face = the base itself over the same area (so swapping back to normal clears the last face)
for nm, (ex, m) in list(faces.items()) + [('normal', (base, union))]:
    mm = np.maximum(m, union * 0.999) if nm != 'normal' else union
    L = layer(ex, mm)
    save_sprite('face_' + nm, L, fb)
    keep_dbg('face_' + nm, mm)

# ------------------------------------------------------------------ salon overlays (sources: base)
print('overlays')
def ell(cx, cy, rx, ry):
    return ((xx - cx) / float(rx)) ** 2 + ((yy - cy) / float(ry)) ** 2 <= 1
def box(x0, y0, x1, y1):
    return (xx >= x0) & (xx < x1) & (yy >= y0) & (yy < y1)
head = yy < 1000
inner_face = ell(512, 650, 285, 225)
hair = head & ~inner_face
ov = load('OV_Pip_burrs.png'); m = added(ov, base, thr=48, region=hair); keep_dbg('burrs', m)
layout['burrs'] = pieces('burr', ov, m, min_area=250, expect=10)
ov = load('OV_Pip_leaves.png'); m = added(ov, base, thr=48, region=hair); keep_dbg('leaves', m)
layout['leaves'] = pieces('leaf', ov, m, min_area=400, expect=6)
gum = load('OV_Pip_gum.png'); gm = added(gum, base, thr=48, region=hair); keep_dbg('gum', gm)
layout['gums'] = pieces('gum', gum, gm, min_area=300, expect=3)
near_gum = ndi.binary_dilation(gm > 0.3, iterations=28)
fz = strip_bg(load('OV_Pip_gum_frozen.png')); m = added(fz, base, thr=40, region=near_gum, open_=2); keep_dbg('gum_frozen', m)
layout['frozen'] = pieces('frozen', fz, m, min_area=300, expect=3)
ov = strip_bg(load('OV_Pip_cottoncandy.png')); m = added(ov, base, thr=44, min_area=600, region=hair, open_=3); keep_dbg('cottoncandy', m)
save_sprite('cottoncandy', layer(ov, m), bbox(m * 255))
ov = strip_bg(load('OV_Pip_quills_messy.png')); m = added(ov, base, thr=34, min_area=600, grow=6, feather=3, region=hair, open_=2); keep_dbg('messy', m)
save_sprite('messy', layer(ov, m), bbox(m * 255))
ov = strip_bg(load('OV_Pip_quills_gloss.png')); m = added(ov, base, thr=20, min_area=400, grow=6, feather=4, region=hair, open_=2); keep_dbg('gloss', m)
save_sprite('gloss', layer(ov, m), bbox(m * 255))
for c in ['mint', 'peach', 'lilac']:
    ov = load('OV_Pip_tips_%s.png' % c); m = added(ov, base, thr=30, min_area=300, grow=3, feather=2, region=hair, open_=2); keep_dbg('tips_' + c, m)
    save_sprite('tips_' + c, layer(ov, m), bbox(m * 255))
for c in ['star', 'berry', 'mushroom']:
    ov = load('OV_Pip_charms_%s.png' % c); m = added(ov, base, thr=48, min_area=150, region=hair); keep_dbg('charms_' + c, m)
    save_sprite('charms_' + c, layer(ov, m), bbox(m * 255))
ov = load('OV_Pip_scratches.png'); m = added(ov, base, thr=36, min_area=40, grow=2, feather=1.2, region=ell(788, 688, 62, 72), open_=0); keep_dbg('scratches', m)
save_sprite('scratches', layer(ov, m), bbox(m * 255))
layout['scratch_parts'] = pieces('scratch', ov, m, min_area=40, expect=3)
ov = strip_bg(load('OV_Pip_nose_dry.png'))
m = added(ov, base, thr=18, min_area=30, grow=5, feather=3, region=ell(530, 642, 70, 56), open_=0); keep_dbg('nose', m)
save_sprite('nose_dry', layer(ov, m), bbox(m * 255))

# ------------------------------------------------------------------ bath overlays (source: tub)
for nm, thr, reg in [('dust', 34, hair & (yy < 950)), ('mud', 40, box(200, 800, 830, 1130)), ('foam', 40, box(160, 790, 870, 1170)), ('towel', 40, box(60, 780, 970, 1180))]:
    ov = strip_bg(load('OV_Pip_%s.png' % nm))
    m = added(ov, tub, thr=thr, min_area=800, grow=4, feather=2.5, region=reg, open_=3)
    keep_dbg(nm, m)
    save_sprite(nm, layer(ov, m), bbox(m * 255))

# ------------------------------------------------------------------ outfits (whole renders, same frame as the base)
print('outfits')
for nm in ['hoodie', 'explorer', 'suit']:
    of = load('OF_Pip_%s.png' % nm)
    save_sprite('of_' + nm, of, (0, 0, CW, CH))
    # card picture: the outfit from the chin down
    a = of.copy(); bb = (130, 820, 894, CH)
    save_sprite('card_' + nm, a, bb, ppu=1, maxside=360)
    sw = max(bb[2] - bb[0], bb[3] - bb[1]) * (360 / max(bb[2] - bb[0], bb[3] - bb[1]))
    spr['pip:card_' + nm][7] = sw / 1.75

# dressing room: his head stays, the body part (robe or outfit) flies in from the card
neck = np.clip((yy - 830) / 60.0, 0, 1).astype(np.float32)
save_sprite('dress_head', layer(base, 1 - np.clip((yy - 880) / 50.0, 0, 1)), (0, 0, CW, 935))
save_sprite('body_robe', layer(base, neck), (0, 830, CW, CH))
for nm in ['hoodie', 'explorer', 'suit']:
    of = load('OF_Pip_%s.png' % nm)
    save_sprite('body_' + nm, layer(of, neck), (0, 830, CW, CH))

# ------------------------------------------------------------------ backgrounds
print('backgrounds')
for i in (1, 2, 3):
    bg = load('BG_Pip_S%d.png' % i)
    save_sprite('bg%d' % i, bg, (0, 0, CW, CH), ppu=BG_PPU)
bg1 = load('BG_Pip_S1.png')
# the table top in front of him (the counter the tools rest on)
save_sprite('counter', bg1, (0, 1010, CW, CH), ppu=BG_PPU)
# a glow behind the counter edge is not needed; keep the stage simple

# ------------------------------------------------------------------ tools and card icons (square renders)
print('tools')
for fn in sorted(os.listdir(SRC)):
    if not (fn.startswith('TL_') or fn.startswith('CD_')):
        continue
    a = np.asarray(Image.open(os.path.join(SRC, fn)).convert('RGBA')).astype(np.float32)
    bb = bbox(a[..., 3], thr=10, pad=6)
    key = ('tl_' if fn.startswith('TL_') else 'cd_') + fn[7:-4].lower()
    save_sprite(key, a, bb, ppu=1, maxside=420)
    W, H = spr['pip:' + key][3], spr['pip:' + key][4]
    spr['pip:' + key][7] = max(W, H) / (2.0 if fn.startswith('TL_') else 1.6)  # tools ~2 units, card icons ~1.6

# ------------------------------------------------------------------ posts (finale) and menu icon
print('posts')
bg3 = Image.open(os.path.join(SRC, 'BG_Pip_S3.png')).convert('RGBA').resize((CW, CH), Image.LANCZOS)
for nm in ['hoodie', 'explorer', 'suit']:
    of = Image.open(os.path.join(SRC, 'OF_Pip_%s.png' % nm)).convert('RGBA').resize((CW, CH), Image.LANCZOS)
    canvas = bg3.copy()
    ch = of.resize((int(CW * 0.92), int(CH * 0.92)), Image.LANCZOS)
    canvas.alpha_composite(ch, ((CW - ch.width) // 2, CH - ch.height + 60))
    crop = canvas.crop((40, 260, 984, 260 + int(944 * 844 / 556)))
    crop = crop.resize((556, 844), Image.LANCZOS)
    arr = np.asarray(crop).astype(np.float32)
    save_sprite('post_' + nm, arr, (0, 0, 556, 844), ppu=100)
    spr['pip:post_' + nm][6] = 0.0  # pivot at the bottom edge like the game's insta posts
bf = load('CH_Pip_before.png')
save_sprite('icon', bf, (112, 40, 912, 1040), ppu=100, maxside=320)
spr['pip:icon'][7] = 100 * 320 / 800 * 1.0

# level-select cards (432x571) in the frame of the game's own cards: clean look, and the dirty look shown while locked
print('menu cards')
tpl_s = json.load(open(os.path.join(ROOT, 'data', 'sprites.json'), encoding='utf-8'))['spr']['sharedassets1.assets:364']
tpl = Image.open(os.path.join(ROOT, 'assets', 'tex', tpl_s[0])).convert('RGBA').crop((0, 0, 432, 571))
T = np.asarray(tpl).astype(np.float32)
cy_, cx_ = np.mgrid[0:571, 0:432]
def rrect(x0, y0, x1, y1, r):
    qx = np.clip(cx_, x0 + r, x1 - r); qy = np.clip(cy_, y0 + r, y1 - r)
    return ((cx_ - qx) ** 2 + (cy_ - qy) ** 2) <= r * r
inner = ndi.gaussian_filter(rrect(13, 13, 419, 541, 30).astype(np.float32), 0.8)
fillc = np.array([222, 205, 246, 255], np.float32)
def card(src_rgba, key):
    im = Image.fromarray(np.clip(src_rgba, 0, 255).astype(np.uint8), 'RGBA').crop((62, 20, 962, 1210)).resize((432, 571), Image.LANCZOS)
    P = np.asarray(im).astype(np.float32)
    inside = np.broadcast_to(fillc, P.shape).copy()
    a = P[..., 3:4] / 255
    inside[..., :3] = P[..., :3] * a + inside[..., :3] * (1 - a)
    k = inner[..., None]
    out = T * (1 - k) + inside * k
    out[..., 3] = np.maximum(T[..., 3], 255 * inner)
    save_sprite(key, out, (0, 0, 432, 571), ppu=100)
clean = load('OF_Pip_hoodie.png')
for k in ['tips_mint', 'charms_star', 'face_happy']:
    s_ = spr['pip:' + k]; l_ = layout[k]
    im_ = Image.open(os.path.join(OUT_TEX, s_[0][4:])).convert('RGBA').resize((int(l_['w']), int(l_['h'])))
    c_ = Image.fromarray(np.clip(clean, 0, 255).astype(np.uint8), 'RGBA')
    c_.alpha_composite(im_, (int(l_['cx'] - l_['w'] / 2), int(l_['cy'] - l_['h'] / 2)))
    clean = np.asarray(c_).astype(np.float32)
card(clean, 'menu_card')
card(bf, 'menu_card_dirty')

json.dump({'spr': spr, 'pip': layout}, open(os.path.join(ROOT, 'data', 'level11_pack.json'), 'w'), separators=(',', ':'))
print('sprites', len(spr))

if args.debug:
    os.makedirs(args.debug, exist_ok=True)
    tiles = []
    for nm, m in dbg.items():
        im = Image.fromarray((np.clip(m, 0, 1) * 255).astype(np.uint8)).resize((256, 384))
        tiles.append((nm, im))
    from PIL import ImageDraw
    cols = 8
    sheet = Image.new('L', (256 * cols, 400 * ((len(tiles) + cols - 1) // cols)), 40)
    d = ImageDraw.Draw(sheet)
    for i, (nm, im) in enumerate(tiles):
        x, y = (i % cols) * 256, (i // cols) * 400
        sheet.paste(im, (x, y + 16)); d.text((x + 4, y + 2), nm, fill=255)
    sheet.save(os.path.join(args.debug, 'masks.png'))
