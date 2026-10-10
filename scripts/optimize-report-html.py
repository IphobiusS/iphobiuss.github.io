#!/usr/bin/env python3
"""Re-encode embedded report assets losslessly while preserving all other HTML bytes.

Explicit output destination required. Reads only the two standalone Banco Lumbre
reports; never opens or modifies the report-gen ZIP, PDF documents or guide.
Dependencies: Pillow, fonttools, Brotli (declared in requirements-build.txt).
"""
from __future__ import annotations
import argparse
import base64
import hashlib
import json
import os
import re
import tempfile
from io import BytesIO
from pathlib import Path

from PIL import Image
from fontTools.pens.recordingPen import RecordingPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1]
REPORTS = ('report-gen-banco-lumbre-0.25.0.html', 'report-gen-informe-banco-lumbre.html')
DATA_URI = re.compile(rb'data:(font/ttf|font/woff2|image/png|image/webp);base64,([A-Za-z0-9+/=]+)')
SCHEME = 'report-html-lossless-v1'

class OptimizationError(ValueError):
    """Input or an encoder result cannot meet the lossless contract."""

def digest(data):
    return hashlib.sha256(data).hexdigest()

def require(condition, message):
    if not condition:
        raise OptimizationError(message)

def strip_assets(data):
    return DATA_URI.sub(b'EMBEDDED_ASSET', data)

def cmap_records(font):
    return [(t.platformID, t.platEncID, t.language, t.format, dict(t.cmap), getattr(t, 'uvsDict', None)) for t in font['cmap'].tables]

def font_signature(data):
    font = TTFont(BytesIO(data), recalcTimestamp=False)
    pen_hash = hashlib.sha256()
    glyphs = font.getGlyphSet()
    for name in font.getGlyphOrder():
        pen = RecordingPen()
        glyphs[name].draw(pen)
        pen_hash.update(json.dumps([name, pen.value], separators=(',', ':'), ensure_ascii=True).encode())
    return {
        'glyphs': len(font.getGlyphOrder()),
        'cmap_subtables': len(font['cmap'].tables),
        'glyph_order_sha256': digest(json.dumps(font.getGlyphOrder(), separators=(',', ':')).encode()),
        'cmap_sha256': digest(json.dumps(cmap_records(font), sort_keys=True, separators=(',', ':')).encode()),
        'hmtx_sha256': digest(json.dumps(font['hmtx'].metrics, sort_keys=True, separators=(',', ':')).encode()),
        'outline_sha256': pen_hash.hexdigest(),
    }

def verify_font(before, after):
    a, b = TTFont(BytesIO(before), recalcTimestamp=False), TTFont(BytesIO(after), recalcTimestamp=False)
    original_head = a.reader['head']
    resulting_head = b.reader['head']
    # WOFF2 changes its transport checksum/flag. fontTools also standardizes
    # legacy Unix timestamps stored in the embedded Carlito font's head table.
    # Record that metadata normalization; all remaining head bytes must match.
    normalized_head = bytearray(original_head)
    metadata_normalizations = []
    for field, start in [('created', 20), ('modified', 28)]:
        old_time = int.from_bytes(original_head[start:start + 8], 'big')
        new_time = int.from_bytes(resulting_head[start:start + 8], 'big')
        if old_time != new_time:
            require(old_time < 0x7C259DC0 and new_time == old_time + 0x7C259DC0, 'Unexpected font timestamp change')
            normalized_head[start:start + 8] = resulting_head[start:start + 8]
            metadata_normalizations.append({'field': field, 'before': old_time, 'after': new_time, 'reason': 'legacy Unix timestamp normalized to OpenType epoch'})
    keep = lambda raw: raw[:8] + raw[12:16] + raw[18:]
    require(keep(normalized_head) == keep(resulting_head), 'Font head data changed beyond documented transport fields')
    before_flags, after_flags = int.from_bytes(original_head[16:18], 'big'), int.from_bytes(resulting_head[16:18], 'big')
    require((before_flags ^ after_flags) in (0, 1 << 11), 'Unexpected font flags change')
    require(a.getGlyphOrder() == b.getGlyphOrder(), 'Glyph order changed')
    require(cmap_records(a) == cmap_records(b), 'A cmap subtable changed')
    require(a['hmtx'].metrics == b['hmtx'].metrics, 'Horizontal metrics changed')
    # The complete font is retained, including layout and hinting tables.
    require(set(a.keys()) == set(b.keys()), 'Font table set changed')
    # Normalize equivalent glyph padding/loca offsets before comparing tables.
    # WOFF2 transport reconstructs these offsets; glyph bytes and hinting remain.
    a.ensureDecompiled()
    b.ensureDecompiled()
    a.getTableData('glyf')
    b.getTableData('glyf')
    compared = []
    for tag in a.keys():
        if tag not in ('GlyphOrder', 'head', 'cmap'):
            require(a.getTableData(tag) == b.getTableData(tag), 'Font table changed: ' + tag)
            compared.append(tag)
    left, right = font_signature(before), font_signature(after)
    require(left == right, 'Font semantic signature changed')
    return {**left, 'canonical_tables_identical': compared, 'all_glyphs_retained': True, 'metadata_normalizations': metadata_normalizations}

def encode_font(data):
    font = TTFont(BytesIO(data), recalcTimestamp=False)
    font.flavor = 'woff2'
    stream = BytesIO()
    font.save(stream)
    encoded = stream.getvalue()
    proof = verify_font(data, encoded)
    return encoded, proof

def image_signature(data):
    with Image.open(BytesIO(data)) as image:
        image.load()
        return {'width': image.width, 'height': image.height, 'rgba_sha256': digest(image.convert('RGBA').tobytes())}

def encode_image(data):
    with Image.open(BytesIO(data)) as image:
        image.load()
        require(image.format == 'PNG', 'Only PNG inputs can be converted')
        require(not image.info, 'PNG metadata requires an explicit preservation policy: ' + ', '.join(image.info))
        require(getattr(image, 'n_frames', 1) == 1, 'Animated PNG is not supported')
        require(image.mode in ('RGB', 'RGBA'), 'Unsupported PNG color mode: ' + image.mode)
        stream = BytesIO()
        image.save(stream, 'WEBP', lossless=True, quality=100, method=6, exact=True)
        encoded = stream.getvalue()
    before, after = image_signature(data), image_signature(encoded)
    require(before == after, 'Image dimensions or decoded RGBA pixels changed')
    return encoded, {**before, 'pixel_identical': True}

def optimize_bytes(raw):
    assets = []
    def substitute(match):
        mime = match.group(1).decode()
        decoded = base64.b64decode(match.group(2), validate=True)
        if mime == 'font/ttf':
            encoded, proof = encode_font(decoded)
            new_mime = 'font/woff2'
        elif mime == 'image/png':
            encoded, proof = encode_image(decoded)
            new_mime = 'image/webp'
        else:
            encoded, new_mime = decoded, mime
            proof = font_signature(decoded) if mime.startswith('font/') else image_signature(decoded)
        assets.append({'index': len(assets), 'before_mime': mime, 'after_mime': new_mime,
                       'before_bytes': len(decoded), 'after_bytes': len(encoded),
                       'before_sha256': digest(decoded), 'after_sha256': digest(encoded), 'proof': proof})
        # Already optimized resources retain their original byte representation.
        if mime == new_mime:
            return match.group()
        return b'data:' + new_mime.encode() + b';base64,' + base64.b64encode(encoded)
    optimized = DATA_URI.sub(substitute, raw)
    require(assets, 'No supported embedded resources found')
    require(sum(a['after_mime'].startswith('font/') for a in assets) == 1, 'Expected one embedded font')
    require(strip_assets(raw) == strip_assets(optimized), 'A byte outside embedded data URIs changed')
    return optimized, {'schema': SCHEME, 'original_bytes': len(raw), 'optimized_bytes': len(optimized),
                       'original_sha256': digest(raw), 'optimized_sha256': digest(optimized),
                       'non_asset_sha256': digest(strip_assets(raw)), 'non_asset_bytes_identical': True,
                       'asset_count': len(assets), 'assets': assets}

def atomic_write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as stream:
        temporary = Path(stream.name)
        stream.write(data)
    try:
        os.chmod(temporary, 0o644)
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input-dir', type=Path, default=ROOT / 'dist/downloads')
    target = parser.add_mutually_exclusive_group(required=True)
    target.add_argument('--output-dir', type=Path)
    target.add_argument('--in-place', action='store_true')
    parser.add_argument('--manifest', type=Path, required=True)
    args = parser.parse_args()
    output_dir = args.input_dir if args.in_place else args.output_dir
    prior = json.loads(args.manifest.read_text()) if args.manifest.is_file() else None
    if prior is not None:
        require(prior.get('schema') == SCHEME, 'Unsupported existing optimization manifest')
    prepared = []
    for name in REPORTS:
        original = (args.input_dir / name).read_bytes()
        optimized, proof = optimize_bytes(original)
        previous = prior.get('reports', {}).get(name) if prior else None
        if previous and digest(original) == previous.get('optimized_sha256'):
            require(digest(optimized) == previous['optimized_sha256'], 'Previously optimized bytes changed')
            require(proof['non_asset_sha256'] == previous['non_asset_sha256'], 'Existing manifest text digest mismatch')
            require(len(proof['assets']) == len(previous['assets']), 'Existing manifest asset count mismatch')
            for current_asset, old_asset in zip(proof['assets'], previous['assets']):
                require(current_asset['after_sha256'] == old_asset['after_sha256'], 'Existing manifest asset digest mismatch')
                require(current_asset['after_mime'] == old_asset['after_mime'], 'Existing manifest asset type mismatch')
                for key, value in current_asset['proof'].items():
                    require(old_asset['proof'].get(key) == value, 'Existing manifest asset proof mismatch: ' + key)
            proof = previous
        prepared.append((name, optimized, proof))
    # All fonts and images from both inputs must pass before any report is written.
    for name, optimized, proof in prepared:
        destination = output_dir / name
        if not destination.is_file() or destination.read_bytes() != optimized:
            atomic_write(destination, optimized)
    manifest = {'schema': SCHEME, 'self_contained': True, 'font_subsetting': False,
                'report_gen_application_modified': False, 'reports': {name: proof for name, _, proof in prepared}}
    atomic_write(args.manifest, (json.dumps(manifest, indent=2, ensure_ascii=False) + '\n').encode())
    print(json.dumps({name: {'before': p['original_bytes'], 'after': p['optimized_bytes'], 'sha256': p['optimized_sha256']} for name, _, p in prepared}, indent=2))

if __name__ == '__main__':
    main()
