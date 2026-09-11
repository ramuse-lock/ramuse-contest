# -*- coding: utf-8 -*-
"""アプリアイコンを作り直す。 python3 scripts/make-icons.py
元画像＝../../ramuse-kid/RAMUSE_logo.png（手書きロゴ・黒・透過）
作り＝白地に黒ロゴ（幅0.92）、左上から光の艶、下にごく薄い影。子供用は下に紫のKIDS札。
出力＝public/ と public/kid/ の icon-512 / icon-192 / apple-touch-icon"""
from PIL import Image, ImageDraw, ImageFilter, ImageChops, ImageFont
import os

N = 1024
WIDTH_RATIO = 0.92          # ロゴの幅（キャンバス比）。角丸で切られるので0.96以上は窮屈
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', '..', '..', 'ramuse-kid', 'RAMUSE_logo.png')
OUT_ADULT = os.path.join(HERE, '..', 'public')
OUT_KID = os.path.join(HERE, '..', 'public', 'kid')
FONT = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'

src = Image.open(SRC).convert('RGBA')

def mask(wr, dy=0):
    w = int(N * wr); h = int(src.height * w / src.width)
    a = src.split()[3].resize((w, h), Image.LANCZOS)
    m = Image.new('L', (N, N), 0)
    m.paste(a, ((N - w) // 2, (N - h) // 2 + dy))
    return m

def layer(m, color, alpha=255, blur=0, off=(0, 0)):
    x = m
    if blur: x = x.filter(ImageFilter.GaussianBlur(blur))
    if alpha < 255: x = x.point(lambda v: v * alpha // 255)
    if off != (0, 0): x = ImageChops.offset(x, off[0], off[1])
    im = Image.new('RGBA', (N, N), color + (255,)); im.putalpha(x)
    return im

def sheen():
    g = Image.linear_gradient('L').rotate(-32, expand=True, resample=Image.BICUBIC)
    s = min(g.size)
    g = g.crop(((g.width - s) // 2, (g.height - s) // 2, (g.width + s) // 2, (g.height + s) // 2))
    return ImageChops.invert(g.resize((N, N), Image.BICUBIC))

def build(kids=False):
    im = Image.new('RGBA', (N, N), (255, 255, 255, 255))
    m = mask(WIDTH_RATIO, -72 if kids else 0)
    im.alpha_composite(layer(m, (120, 130, 155), alpha=70, blur=20, off=(0, 14)))   # 影
    im.alpha_composite(layer(m, (22, 22, 26)))                                       # 本体
    gl = ImageChops.multiply(sheen().point(lambda v: int(v * 0.46)), m)              # 艶
    sh = Image.new('RGBA', (N, N), (255, 255, 255, 255)); sh.putalpha(gl)
    im.alpha_composite(sh)
    if kids:
        d = ImageDraw.Draw(im)
        f = ImageFont.truetype(FONT, 72)
        t = 'KIDS'; bb = d.textbbox((0, 0), t, font=f)
        w, h = bb[2] - bb[0], bb[3] - bb[1]
        pw, ph = w + 110, h + 60; px = (N - pw) // 2; py = 706
        d.rounded_rectangle((px, py, px + pw, py + ph), radius=ph // 2, fill=(94, 92, 230, 255))
        d.text((px + (pw - w) // 2 - bb[0], py + (ph - h) // 2 - bb[1]), t, font=f, fill=(255, 255, 255, 255))
    return im.convert('RGB')

for kids, outdir in ((False, OUT_ADULT), (True, OUT_KID)):
    os.makedirs(outdir, exist_ok=True)
    img = build(kids)
    for size, name in ((512, 'icon-512.png'), (192, 'icon-192.png'), (180, 'apple-touch-icon.png')):
        img.resize((size, size), Image.LANCZOS).save(os.path.join(outdir, name), optimize=True)
    print('wrote', outdir)
