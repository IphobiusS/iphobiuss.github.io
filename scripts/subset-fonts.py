#!/usr/bin/env python3
"""Recorta las fuentes IBM Plex al repertorio que usa el sitio y publica los recortes.

Entradas (no se publican): content/fonts-source/<origen>.woff2 y content/fonts-source/unicodes.txt.
Salidas versionadas: content/public/assets/fonts/<sha12>.woff2 y .woff, el bloque @font-face de
content/public/assets/css/fonts.css y content/fonts-subset-provenance.json.

El recorte conserva latín básico, latín-1, latín extendido A, puntuación, flechas, operadores,
caracteres de caja y bloques, y cualquier carácter presente en el sitio cuando se generó la lista.
Mantiene el hinting y todas las funciones OpenType. Con la misma versión de fontTools (fijada en
requirements-build.txt) el resultado es idéntico byte a byte.

Uso: python scripts/subset-fonts.py            (regenera)
     python scripts/subset-fonts.py --check    (sólo comprueba que dist/ no usa caracteres ausentes)
"""
from pathlib import Path
import hashlib
import html
import io
import json
import re
import sys

from fontTools import subset, version as fonttools_version
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'content/fonts-source'
FONTS = ROOT / 'content/public/assets/fonts'
CSS = ROOT / 'content/public/assets/css/fonts.css'
PROVENANCE = ROOT / 'content/fonts-subset-provenance.json'
# Origen (Google Fonts, sin recortar) -> familia y peso en fonts.css.
ORIGINS = {
    '1a9cad03d35e': ('IBM Plex Sans', 400),
    '8da5dfcdccfb': ('IBM Plex Sans', 600),
    'b0c618f6d8ea': ('IBM Plex Mono', 400),
    'feead6344d56': ('IBM Plex Mono', 600),
}


def unicodes():
    text = (SOURCE / 'unicodes.txt').read_text(encoding='utf-8')
    return sorted({int(item[2:], 16) for item in text.replace('\n', ',').split(',') if item.strip()})


def build(origin, codepoints, flavor):
    options = subset.Options()
    options.layout_features = ['*']
    options.name_IDs = ['*']
    options.name_languages = ['*']
    options.notdef_outline = True
    options.glyph_names = True
    options.flavor = flavor
    # Sin recalcular la fecha de la tabla head: la misma entrada produce los mismos bytes.
    font = TTFont(SOURCE / f'{origin}.woff2', recalcTimestamp=False)
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=codepoints)
    subsetter.subset(font)
    buffer = io.BytesIO()
    font.flavor = flavor
    font.save(buffer)
    return buffer.getvalue()


def used_characters():
    chars = set()
    dist = ROOT / 'dist'
    if not dist.is_dir():
        return chars
    for path in dist.rglob('*'):
        if path.suffix in ('.html', '.js', '.css', '.xml') and 'downloads' not in path.parts:
            chars |= set(html.unescape(path.read_text(encoding='utf-8', errors='ignore')))
    return {c for c in chars if ord(c) >= 0x20}


def check(codepoints):
    covered, missing = set(codepoints), set()
    for origin in ORIGINS:
        full = TTFont(SOURCE / f'{origin}.woff2').getBestCmap()
        for char in used_characters():
            if ord(char) in full and ord(char) not in covered:
                missing.add(char)
    if missing:
        print('Caracteres del sitio fuera del recorte: ' + ''.join(sorted(missing)))
        print('Añádelos a content/fonts-source/unicodes.txt y vuelve a ejecutar este script.')
        return 1
    print('El recorte cubre todos los caracteres que usa dist/.')
    return 0


def main():
    codepoints = unicodes()
    if '--check' in sys.argv:
        return check(codepoints)
    records, mapping = [], {}
    for origin, (family, weight) in ORIGINS.items():
        woff2 = build(origin, codepoints, 'woff2')
        woff = build(origin, codepoints, 'woff')
        stem = hashlib.sha256(woff2).hexdigest()[:12]
        (FONTS / f'{stem}.woff2').write_bytes(woff2)
        (FONTS / f'{stem}.woff').write_bytes(woff)
        mapping[origin] = stem
        source_bytes = (SOURCE / f'{origin}.woff2').read_bytes()
        records.append({
            'family': family, 'weight': weight,
            'source': f'content/fonts-source/{origin}.woff2',
            'source_sha256': hashlib.sha256(source_bytes).hexdigest(), 'source_bytes': len(source_bytes),
            'woff2': f'assets/fonts/{stem}.woff2', 'woff2_sha256': hashlib.sha256(woff2).hexdigest(), 'woff2_bytes': len(woff2),
            'woff': f'assets/fonts/{stem}.woff', 'woff_sha256': hashlib.sha256(woff).hexdigest(), 'woff_bytes': len(woff),
        })
    # Retira los recortes de una ejecución anterior; la fuente pixel (sin recortar) se conserva.
    keep = set(mapping.values()) | {'1397ed57e1a0'}
    for stale in FONTS.glob('*.woff*'):
        if stale.name.split('.')[0] not in keep:
            stale.unlink()
    css = CSS.read_text(encoding='utf-8')
    for origin, (family, weight) in ORIGINS.items():
        pattern = re.compile(r"(font-family: '" + re.escape(family) + r"';\s*font-style: normal;\s*font-weight: " + str(weight) + r";[^}]*?src: )url\(\.\./fonts/[a-f0-9]{12}\.woff2\) format\('woff2'\), url\(\.\./fonts/[a-f0-9]{12}\.woff\) format\('woff'\);")
        css, count = pattern.subn(lambda m: m.group(1) + f"url(../fonts/{mapping[origin]}.woff2) format('woff2'), url(../fonts/{mapping[origin]}.woff) format('woff');", css)
        if count != 1:
            raise SystemExit(f'fonts.css: no se encontró una única regla para {family} {weight}')
    CSS.write_text(css, encoding='utf-8')
    PROVENANCE.write_text(json.dumps({
        'tool': f'fontTools {fonttools_version}', 'unicodes': 'content/fonts-source/unicodes.txt',
        'codepoints': len(codepoints), 'options': 'layout_features=*, hinting conservado, name_IDs=*, notdef_outline',
        'license': 'SIL Open Font License 1.1 (assets/fonts/ibmplexsans-OFL.txt, ibmplexmono-OFL.txt)',
        'fonts': records,
    }, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    for origin, stem in mapping.items():
        print(f'{ORIGINS[origin][0]} {ORIGINS[origin][1]}: {origin} -> {stem}')
    print('Actualiza las precargas de scripts/build.py y las rutas de scripts/build-social.py si cambió algún nombre.')
    return check(codepoints)


if __name__ == '__main__':
    sys.exit(main())
