#!/usr/bin/env python3
"""Prepara las fuentes versionadas de content/public y convierte los WOFF nuevos a WOFF2 y reescribe dist/assets/css/fonts.css
para servir woff2 primero con woff como respaldo. Reduce el peso de las fuentes alrededor de un 30 %.

Dependencias (solo para este paso, no del sitio): pip install fonttools brotli
Uso: python scripts/build-fonts.py
Los WOFF2 versionados son entradas verificadas; no se recodifican según fechas de checkout."""
from pathlib import Path
from site_assets import prepare_assets
import re
from fontTools.ttLib import TTFont

root = Path(__file__).resolve().parents[1]
prepare_assets(preserve_generated=True)
fonts = root / 'dist/assets/fonts'
css_path = root / 'dist/assets/css/fonts.css'
converted = 0
for woff in sorted(fonts.glob('*.woff')):
    woff2 = woff.with_suffix('.woff2')
    if woff2.exists():
        continue
    font = TTFont(woff)
    font.flavor = 'woff2'
    font.save(woff2)
    converted += 1
    print(f'{woff.name}: {woff.stat().st_size // 1024} KB -> {woff2.name}: {woff2.stat().st_size // 1024} KB')
css = css_path.read_text(encoding='utf-8')
pattern = re.compile(r"src:\s*url\(\.\./fonts/([a-f0-9]+)\.woff\)\s*format\('woff'\);")
def repl(match):
    stem = match.group(1)
    if not (fonts / f'{stem}.woff2').exists():
        return match.group(0)
    return f"src: url(../fonts/{stem}.woff2) format('woff2'), url(../fonts/{stem}.woff) format('woff');"
new_css = pattern.sub(repl, css)
if new_css != css:
    css_path.write_text(new_css, encoding='utf-8')
    print('fonts.css actualizado: woff2 primero, woff como respaldo.')
print(f'{converted} fuentes convertidas. Si cambias la precarga de la pixel en build.py, usa el .woff2 (1397ed57e1a0.woff2).')
