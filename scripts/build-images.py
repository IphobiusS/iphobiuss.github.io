#!/usr/bin/env python3
"""Genera variantes WebP responsivas y mantiene su procedencia. Requiere Pillow.

Las capturas PNG históricas se verifican y no se modifican. Un derivado ya
verificado se conserva aunque se haya creado con otra versión del codificador.
"""
from pathlib import Path
from site_assets import prepare_assets
from io import BytesIO
import hashlib
import json
import os
import tempfile
from PIL import Image

root = Path(__file__).resolve().parents[1]
prepare_assets(preserve_generated=True)
dist = root / 'dist'
provenance_paths = [root / 'content/report-gen-capturas-procedencia.json']
demo_provenance = root / 'content/report-gen-demo-procedencia.json'
if demo_provenance.is_file():
    provenance_paths.append(demo_provenance)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def atomic_write(path, data):
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as temporary:
        temporary_path = Path(temporary.name)
        temporary.write(data)
    try:
        os.chmod(temporary_path, 0o644)
        os.replace(temporary_path, path)
    finally:
        temporary_path.unlink(missing_ok=True)


def current_variant(variant):
    path = dist / variant['file']
    if not path.is_file():
        return False
    data = path.read_bytes()
    if len(data) != variant['bytes'] or digest(data) != variant['sha256']:
        return False
    with Image.open(BytesIO(data)) as image:
        return image.format == 'WEBP' and image.size == (variant['width'], variant['height'])


updates = []
provenance_updates = []
for provenance_path in provenance_paths:
    provenance = json.loads(provenance_path.read_text(encoding='utf-8'))
    update_count = len(updates)
    for capture in provenance['images']:
        stem = capture['stem']
        source_path = dist / capture['original']
        if digest(source_path.read_bytes()) != capture['source_sha256']:
            raise SystemExit(f'{source_path}: la captura no coincide con su procedencia; no se generaron nuevas variantes.')
        with Image.open(source_path) as original:
            if original.size != (capture['width'], capture['height']):
                raise SystemExit(f'{source_path}: las dimensiones no coinciden con su procedencia.')
            source = original.convert('RGB')
            widths = sorted({min(960, source.width), source.width})
            variants = capture['variants']
            geometry = [(f'assets/img/{stem}-{width}.webp', width, round(width * source.height / source.width)) for width in widths]
            declared = [(item['file'], item['width'], item['height']) for item in variants]
            if declared == geometry and all(current_variant(item) for item in variants) and capture['fallback_bytes'] == variants[-1]['bytes']:
                print(f'{stem}: variantes y procedencia verificadas; sin cambios.')
                continue
            refreshed = []
            for width in widths:
                height = round(width * source.height / source.width)
                buffer = BytesIO()
                source.resize((width, height), Image.Resampling.LANCZOS).save(buffer, 'WEBP', quality=82, method=6)
                data = buffer.getvalue()
                filename = f'assets/img/{stem}-{width}.webp'
                updates.append((dist / filename, data))
                refreshed.append({'file': filename, 'width': width, 'height': height, 'bytes': len(data), 'sha256': digest(data)})
            capture['variants'] = refreshed
            capture['fallback_bytes'] = refreshed[-1]['bytes']
        print(f'{stem}: variantes preparadas {widths}; pendiente de completar la verificación de capturas.')
    if len(updates) != update_count:
        provenance_updates.append((provenance_path, (json.dumps(provenance, ensure_ascii=False, indent=2) + '\n').encode('utf-8')))

# Verificar primero todas las capturas; un error de fuente no deja derivados parciales.
if updates:
    for path, data in updates:
        atomic_write(path, data)
    for provenance_path, data in provenance_updates:
        atomic_write(provenance_path, data)
    print(f'{len(updates)} variantes WebP y su procedencia actualizadas.')
