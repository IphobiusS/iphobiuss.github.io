#!/usr/bin/env python3
"""Generate 1200 x 630 social cards using local Plex fonts, in the current palette (operator console).

The report-gen card uses an included real screenshot. The network illustration
is editorial artwork, not a simulated product screen. Requires Pillow/fonttools.
No network or website build is performed.
"""
from pathlib import Path
from site_assets import prepare_assets
from io import BytesIO
from html import escape
import importlib.util
import json
from functools import lru_cache

from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
prepare_assets(preserve_generated=True)
REPORT = json.loads((ROOT / 'content/report-gen.json').read_text(encoding='utf-8'))
BANK = json.loads((ROOT / 'content/banco-lumbre.json').read_text(encoding='utf-8'))
OUT = ROOT / 'dist'
FONTS = OUT / 'assets/fonts'
WIDTH, HEIGHT = 1200, 630
BG = '#0a0d0b'
SURFACE = '#101512'
INK = '#f4f9f5'
MUTED = '#a7b9ad'
LINE = '#243029'
LINE_STRONG = '#5a7262'
MINT = '#6ee283'
LAVENDER = '#82cfe0'
SANS = '1a9cad03d35e.woff'
BOLD = '8da5dfcdccfb.woff'
MONO = 'b0c618f6d8ea.woff'


@lru_cache(maxsize=None)
def font_source(filename):
    font = TTFont(FONTS / filename)
    font.flavor = None
    buffer = BytesIO()
    font.save(buffer)
    return font, buffer.getvalue()


@lru_cache(maxsize=None)
def font_at(filename, size):
    return ImageFont.truetype(BytesIO(font_source(filename)[1]), size)


class Card:
    """Paint PNG and optional matching SVG with outlined bundled fonts."""
    def __init__(self, title, svg=False):
        self.image = Image.new('RGB', (WIDTH, HEIGHT), BG)
        self.draw = ImageDraw.Draw(self.image)
        self.svg = ([f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {WIDTH} {HEIGHT}" role="img" aria-label="{escape(title, quote=True)}">',
                     f'<title>{escape(title)}</title>'] if svg else None)
        self.rect(0, 0, WIDTH, HEIGHT, BG)

    def rect(self, x, y, width, height, color, radius=0, stroke=None, line_width=1):
        self.draw.rounded_rectangle((x, y, x + width - 1, y + height - 1), radius=radius, fill=color, outline=stroke, width=line_width)
        if self.svg is not None:
            outline = f' stroke="{stroke}" stroke-width="{line_width}"' if stroke else ''
            self.svg.append(f'<rect x="{x}" y="{y}" width="{width}" height="{height}" rx="{radius}" fill="{color}"{outline}/>')

    def line(self, points, color, width=1):
        self.draw.line(points, fill=color, width=width, joint='curve')
        if self.svg is not None:
            pts = ' '.join(f'{x},{y}' for x, y in points)
            self.svg.append(f'<polyline points="{pts}" fill="none" stroke="{color}" stroke-width="{width}" stroke-linecap="round" stroke-linejoin="round"/>')

    def circle(self, x, y, radius, color, stroke=None, width=1):
        self.draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=color, outline=stroke, width=width)
        if self.svg is not None:
            outline = f' stroke="{stroke}" stroke-width="{width}"' if stroke else ''
            self.svg.append(f'<circle cx="{x}" cy="{y}" r="{radius}" fill="{color}"{outline}/>')

    def text(self, value, x, baseline, size, filename=SANS, color=INK):
        self.draw.text((x, baseline), value, font=font_at(filename, size), fill=color, anchor='ls')
        if self.svg is not None:
            font = font_source(filename)[0]
            glyphs, cmap = font.getGlyphSet(), font.getBestCmap()
            scale, cursor = size / font['head'].unitsPerEm, x
            self.svg.append(f'<g fill="{color}" aria-label="{escape(value, quote=True)}">')
            for char in value:
                glyph = glyphs[cmap[ord(char)]]
                pen = SVGPathPen(glyphs)
                glyph.draw(pen)
                self.svg.append(f'<path transform="translate({cursor:.3f} {baseline}) scale({scale:.6f} {-scale:.6f})" d="{pen.getCommands()}"/>')
                cursor += glyph.width * scale
            self.svg.append('</g>')

    def save(self, png, svg=None):
        png.parent.mkdir(parents=True, exist_ok=True)
        self.image.save(png, optimize=True)
        if svg:
            svg.write_text('\n'.join(self.svg + ['</svg>']), encoding='utf-8')


def wrap(value, filename, size, max_width):
    font = font_at(filename, size)
    lines, current = [], ''
    for word in value.split():
        probe = (current + ' ' + word).strip()
        if font.getlength(probe) <= max_width or not current:
            current = probe
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def brand(card, right='SEGURIDAD APLICADA'):
    card.circle(74, 70, 10, MINT)
    card.circle(74, 70, 3, BG)
    card.text('iphobiuss', 98, 80, 30, BOLD)
    width = font_at(MONO, 15).getlength(right)
    card.text(right, WIDTH - 64 - width, 77, 15, MONO, MUTED)


def footer(card, url, right='OBSERVAR / CONECTAR / EXPLICAR'):
    card.line([(64, 548), (1136, 548)], LINE)
    card.text(url, 64, 593, 17, MONO, MUTED)
    width = font_at(MONO, 13).getlength(right)
    card.text(right, WIDTH - 64 - width, 590, 13, MONO, MINT)


def network(card, x, y, size=1.0, variant=0):
    """A graph of evidence becoming a story, composed with generous strokes."""
    positions = [(0, 65), (102, 0), (214, 100), (110, 186), (283, 235), (20, 278)]
    vertices = [(int(x + a * size), int(y + b * size)) for a, b in positions]
    edges = [(0, 1), (1, 2), (0, 3), (2, 3), (3, 4), (3, 5), (2, 4), (1, 3)]
    for a, b in edges:
        card.line([vertices[a], vertices[b]], LINE_STRONG, max(2, round(3 * size)))
    a, b = edges[variant % len(edges)]
    card.line([vertices[a], vertices[b]], LAVENDER, max(3, round(4 * size)))
    for i, (xx, yy) in enumerate(vertices):
        active = i == (variant + 3) % len(vertices)
        radius = round((24 if active else 14) * size)
        card.circle(xx, yy, radius + round(8 * size), SURFACE)
        card.circle(xx, yy, radius, MINT if active else BG, MINT if active else LAVENDER, max(2, round(3 * size)))
        if active:
            card.line([(xx - round(8 * size), yy), (xx - round(2 * size), yy + round(6 * size)),
                       (xx + round(10 * size), yy - round(8 * size))], BG, max(2, round(3 * size)))
    card.circle(x + round(300 * size), y - round(18 * size), round(3 * size), MINT)
    card.circle(x + round(60 * size), y + round(330 * size), round(3 * size), LAVENDER)


def main_card():
    card = Card('Encuentra el fallo. Cuenta la historia. Sebastián Latorre Muñoz, Pentester Junior', svg=True)
    brand(card)
    card.text('EVIDENCIA QUE SE ENTIENDE', 64, 166, 17, MONO, MINT)
    card.text('Encuentra el fallo.', 64, 267, 68, BOLD)
    card.text('Cuenta la historia.', 64, 351, 68, BOLD, LAVENDER)
    card.text('Sebastián Latorre Muñoz', 64, 424, 29, BOLD)
    card.text('Pentester Junior', 64, 463, 21, MONO, MUTED)
    network(card, 821, 194, 0.97)
    footer(card, 'iphobiuss.github.io')
    card.save(OUT / 'og-image.png', OUT / 'assets/img/og-image.svg')


def guide_cards():
    # Import canonical titles; do not execute the website generator.
    spec = importlib.util.spec_from_file_location('sitebuild', ROOT / 'scripts/build.py')
    sitebuild = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(sitebuild)
    for i, name in enumerate(sitebuild.SERIES):
        guide = sitebuild.GUIDES[name]
        card = Card(guide['title'] + ': guía de laboratorio de iphobiuss')
        brand(card, 'GUÍAS DE LABORATORIO')
        kicker = f'GUÍA {i:02d} / {guide["os"].upper()}'
        card.text(kicker, 64, 170, 17, MONO, MINT)
        title_size = 70
        while len(wrap(guide['title'], BOLD, title_size, 720)) > 2:
            title_size -= 2
        title_lines = wrap(guide['title'], BOLD, title_size, 720)
        baseline = 267
        for value in title_lines:
            card.text(value, 64, baseline, title_size, BOLD)
            baseline += title_size + 8
        text_y = max(335, baseline + 20)
        for value in wrap(guide['brief'], SANS, 27, 690):
            card.text(value, 64, text_y, 27, SANS, MUTED)
            text_y += 38
        if text_y < 470 and not guide['level'].startswith('Guía'):
            card.text(sitebuild.ui_text(guide['level']), 64, 477, 17, MONO, LAVENDER)
        network(card, 857, 202, 0.73, i)
        footer(card, f'iphobiuss.github.io/{name}.html', 'HIPÓTESIS / PRUEBAS / CONCEPTOS')
        card.save(OUT / f'assets/img/og/{name}.png')


def report_card():
    card = Card(f'report-gen {REPORT["version"]}. Una revisión. Cuatro formatos.')
    brand(card, 'PROYECTO PROPIO')
    card.text(f'report-gen {REPORT["version"]}', 64, 184, 40, BOLD, MINT)
    card.text('Una revisión.', 64, 264, 54, BOLD)
    card.text('Cuatro formatos.', 64, 333, 54, BOLD, LAVENDER)
    for value, baseline in [('PDF · Word · Markdown', 405), ('HTML portátil', 443)]:
        card.text(value, 64, baseline, 24, SANS, MUTED)
    card.text('Del hallazgo a la entrega.', 64, 499, 21, SANS, INK)
    # Complete real screen, retaining its original aspect ratio. The mat is
    # editorial framing, not an invented UI or fabricated product output.
    provenance = json.loads((ROOT / 'content/report-gen-capturas-procedencia.json').read_text(encoding='utf-8'))
    editor = next(capture for capture in provenance['images'] if capture['stem'].endswith('-editor'))
    screenshot = Image.open(OUT / editor['original']).convert('RGB')
    screenshot.thumbnail((546, 399), Image.Resampling.LANCZOS)
    card.rect(594, 124, 552, 410, SURFACE, radius=12, stroke=LINE)
    card.image.paste(screenshot, (597 + (546 - screenshot.width) // 2, 130 + (399 - screenshot.height) // 2))
    card.text(f'Captura del editor {provenance["tool_version"]}', 597, 557, 14, MONO, MUTED)
    footer(card, 'iphobiuss.github.io/proyectos.html', 'LOCAL / SIN SERVICIOS EXTERNOS')
    card.save(OUT / 'assets/img/report-gen-og.png')


def bank_card():
    """An editorial summary of the fictional case, never a product screenshot."""
    card = Card('Banco Lumbre: simulación de banca digital y riesgo empresarial')
    brand(card, 'SIMULACIÓN / BANCO FICTICIO')
    card.text('Banco Lumbre', 64, 210, 54, BOLD, MINT)
    card.text('Banca digital.', 64, 293, 38, BOLD)
    card.text('Riesgo empresarial.', 64, 350, 38, BOLD, LAVENDER)
    card.text('Del hallazgo a la decisión.', 64, 424, 23, SANS, MUTED)
    card.text('Evidencia sintética. Sin retest.', 64, 462, 20, SANS, MUTED)
    card.rect(668, 148, 468, 355, SURFACE, stroke=LINE_STRONG)
    card.text(f'{BANK["max_business_index"]}/{BANK["index_scale_max"]}', 695, 248, 64, BOLD, MINT)
    card.text('IRN máximo del modelo; no es CVSS', 695, 284, 16, MONO, MUTED)
    card.line([(695, 305), (1108, 305)], LINE_STRONG)
    card.text(f'{BANK["findings"]} condiciones / {BANK["assets"]} activos ficticios', 695, 346, 19, SANS)
    card.text(f'{BANK["priorities"]["P0"]} tratamientos P0 propuestos', 695, 395, 19, SANS)
    card.text(f'{BANK["retests"]} retests realizados', 695, 444, 19, SANS)
    footer(card, 'iphobiuss.github.io/banco-lumbre.html', 'CASO DOCUMENTAL FICTICIO')
    card.save(OUT / 'assets/img/banco-lumbre-og.png')


if __name__ == '__main__':
    main_card()
    guide_cards()
    report_card()
    bank_card()
    print(f'Created 10 social cards at 1200 x 630: homepage (PNG/SVG), 7 guides, report-gen {REPORT["version"]}, Banco Lumbre.')
