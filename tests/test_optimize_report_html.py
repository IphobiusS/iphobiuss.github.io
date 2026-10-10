"""Lossless contracts using tiny generated fixtures (no duplicated report assets)."""
import base64
import importlib.util
import json
from io import BytesIO
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from PIL import Image, PngImagePlugin

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts/optimize-report-html.py'
SPEC = importlib.util.spec_from_file_location('report_assets', SCRIPT)
OPT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(OPT)


def fixture_font():
    font = FontBuilder(1000, isTTF=True)
    font.setupGlyphOrder(['.notdef', 'A'])
    empty = TTGlyphPen(None).glyph()
    pen = TTGlyphPen(None)
    pen.moveTo((100, 0))
    pen.lineTo((300, 700))
    pen.lineTo((500, 0))
    pen.closePath()
    font.setupGlyf({'.notdef': empty, 'A': pen.glyph()})
    font.setupCharacterMap({65: 'A'})
    font.setupHorizontalMetrics({'.notdef': (600, 0), 'A': (600, 100)})
    font.setupHorizontalHeader(ascent=800, descent=-200)
    font.setupOS2(sTypoAscender=800, sTypoDescender=-200, usWinAscent=800, usWinDescent=200)
    font.setupNameTable({'familyName': 'LosslessFixture', 'styleName': 'Regular'})
    font.setupPost()
    font.setupMaxp()
    font.setupHead(created=3000000000, modified=3000000000)
    stream = BytesIO()
    font.save(stream)
    return stream.getvalue()


def fixture_image(metadata=False):
    image = Image.new('RGBA', (3, 2))
    image.putdata([(12, 34, 56, 0), (0, 255, 128, 255), (255, 0, 0, 255)] * 2)
    extra = PngImagePlugin.PngInfo()
    if metadata:
        extra.add_text('provenance', 'must not disappear')
    stream = BytesIO()
    image.save(stream, format='PNG', pnginfo=extra)
    return stream.getvalue()


def fixture_html():
    return (b'<!doctype html><meta charset="utf-8"><title>Fixture</title>'
            b'<style>@font-face{font-family:Report;src:url(data:font/ttf;base64,'
            + base64.b64encode(fixture_font()) + b')}</style><p>Texto A \xc3\xb1</p>'
            b'<img alt="Fixture" src="data:image/png;base64,'
            + base64.b64encode(fixture_image()) + b'"><script>window.fixture=1;</script>')


class LosslessReports(unittest.TestCase):
    def test_pixels_including_transparent_rgb_are_preserved(self):
        original = fixture_image()
        result, proof = OPT.encode_image(original)
        self.assertEqual(OPT.image_signature(original), OPT.image_signature(result))
        self.assertTrue(proof['pixel_identical'])

    def test_metadata_is_rejected_instead_of_silently_dropped(self):
        with self.assertRaisesRegex(OPT.OptimizationError, 'metadata'):
            OPT.encode_image(fixture_image(metadata=True))

    def test_full_font_and_every_non_asset_byte_survive(self):
        raw = fixture_html()
        first, proof = OPT.optimize_bytes(raw)
        second, _ = OPT.optimize_bytes(raw)
        self.assertEqual(first, second)
        self.assertEqual(OPT.strip_assets(raw), OPT.strip_assets(first))
        font_proof = proof['assets'][0]['proof']
        self.assertTrue(font_proof['all_glyphs_retained'])
        self.assertEqual(font_proof['glyphs'], 2)
        self.assertIn('glyf', font_proof['canonical_tables_identical'])

    def test_cli_idempotence_keeps_original_provenance(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in OPT.REPORTS:
                (root / name).write_bytes(fixture_html())
            manifest = root / 'proof.json'
            command = [sys.executable, str(SCRIPT), '--input-dir', str(root),
                       '--in-place', '--manifest', str(manifest)]
            subprocess.run(command, check=True, capture_output=True)
            before = {p.name: p.read_bytes() for p in root.iterdir()}
            subprocess.run(command, check=True, capture_output=True)
            self.assertEqual(before, {p.name: p.read_bytes() for p in root.iterdir()})
            proof = json.loads(manifest.read_text())['reports'][OPT.REPORTS[0]]
            self.assertNotEqual(proof['original_sha256'], proof['optimized_sha256'])

    def test_failed_second_report_never_replaces_first_report(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            first = root / OPT.REPORTS[0]
            first.write_bytes(fixture_html())
            original = first.read_bytes()
            (root / OPT.REPORTS[1]).write_bytes(b'corrupt input without resources')
            manifest = root / 'proof.json'
            result = subprocess.run([sys.executable, str(SCRIPT), '--input-dir', str(root),
                                     '--in-place', '--manifest', str(manifest)], capture_output=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(first.read_bytes(), original)
            self.assertFalse(manifest.exists())


if __name__ == '__main__':
    unittest.main()
