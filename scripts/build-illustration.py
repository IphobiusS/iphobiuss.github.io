#!/usr/bin/env python3
"""Variantes WebP de la ilustración de report-gen para la portada.

Entrada (no se publica): content/illustrations/report-gen-ilustracion.png.
Salidas versionadas: content/public/assets/img/report-gen-ilustracion-<ancho>.webp y
content/report-gen-illustration-provenance.json. Sin metadatos; con la misma versión de
Pillow (fijada en requirements-build.txt) el resultado es idéntico byte a byte.

Uso: python scripts/build-illustration.py
"""
from io import BytesIO
from pathlib import Path
import hashlib
import json

from PIL import Image, __version__ as pillow_version

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'content/illustrations/report-gen-ilustracion.png'
OUT = ROOT / 'content/public/assets/img'
PROVENANCE = ROOT / 'content/report-gen-illustration-provenance.json'
WIDTHS = (480, 720, 960, 1440)


def main():
    raw = SOURCE.read_bytes()
    with Image.open(BytesIO(raw)) as image:
        source = image.convert('RGB')
    widths = [w for w in WIDTHS if w < source.width] + [source.width]
    variants = []
    for width in widths:
        height = round(width * source.height / source.width)
        frame = source if width == source.width else source.resize((width, height), Image.Resampling.LANCZOS)
        buffer = BytesIO()
        frame.save(buffer, 'WEBP', quality=86, method=6)
        data = buffer.getvalue()
        name = f'report-gen-ilustracion-{width}.webp'
        (OUT / name).write_bytes(data)
        variants.append({'file': f'assets/img/{name}', 'width': width, 'height': height,
                         'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
        print(f'{name}: {len(data) // 1024} KB')
    PROVENANCE.write_text(json.dumps({
        'source': 'content/illustrations/report-gen-ilustracion.png',
        'source_sha256': hashlib.sha256(raw).hexdigest(), 'source_bytes': len(raw),
        'width': source.width, 'height': source.height,
        'author': 'Ilustración entregada por el autor del sitio el 19 de octubre de 2026.',
        'derivation': f'Pillow {pillow_version}: LANCZOS, WebP calidad 86, método 6, sin metadatos.',
        'alt': 'Prometeo y Evaristo, las mascotas de report-gen, junto a una ventana con el nombre del programa y los formatos PDF, DOCX, MD y HTML.',
        'variants': variants,
    }, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
