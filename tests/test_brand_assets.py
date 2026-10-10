"""Check preserved artwork and responsive delivery, rather than encoder internals."""
from hashlib import sha256
from html.parser import HTMLParser
import json
from pathlib import Path
import unittest

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / 'dist'


class Images(HTMLParser):
    def __init__(self):
        super().__init__()
        self.images = []

    def handle_starttag(self, tag, attrs):
        if tag == 'img':
            self.images.append(dict(attrs))


class BrandAssets(unittest.TestCase):
    def test_original_and_transparent_derivatives_preserve_composition(self):
        provenance = json.loads((ROOT / 'content/report-gen-brand-provenance.json').read_text())
        original = DIST / provenance['asset']
        self.assertEqual(sha256(original.read_bytes()).hexdigest(), provenance['sha256'])
        self.assertEqual(original.read_bytes(), (ROOT / 'content/assets/img/report-gen-brand-mark.webp').read_bytes())
        self.assertEqual([item['width'] for item in provenance['variants']], [108, 216, 432, 648])
        with Image.open(original) as source_image:
            source = source_image.convert('RGBA')
            for variant in provenance['variants']:
                with self.subTest(width=variant['width']):
                    data = (DIST / variant['file']).read_bytes()
                    self.assertEqual(len(data), variant['bytes'])
                    self.assertEqual(sha256(data).hexdigest(), variant['sha256'])
                    self.assertLess(len(data), len(original.read_bytes()))
                    with Image.open(DIST / variant['file']) as image:
                        self.assertEqual(image.format, 'WEBP')
                        self.assertEqual(image.size, (variant['width'], variant['height']))
                        self.assertEqual(image.mode, 'RGBA')
                        actual = image.convert('RGBA')
                        expected = source.resize(image.size, Image.Resampling.LANCZOS)
                        self.assertEqual(actual.tobytes(), expected.tobytes(), 'No crop, missing alpha, lossy encoding or replacement artwork')
                        self.assertLess(actual.getchannel('A').getextrema()[0], 255, 'Transparency must remain')

    def test_card_declares_browser_selection_and_native_fallback(self):
        provenance = json.loads((ROOT / 'content/report-gen-brand-provenance.json').read_text())
        parser = Images()
        parser.feed((DIST / 'index.html').read_text())
        images = [image for image in parser.images if image.get('src') == provenance['asset']]
        self.assertEqual(len(images), 1)
        image = images[0]
        self.assertEqual(image['loading'], 'lazy')
        self.assertEqual(image['sizes'], 'auto, 6rem')
        self.assertEqual(image['srcset'].split(', '), [f"{item['file']} {item['width']}w" for item in provenance['variants']])
        self.assertEqual((image['width'], image['height']), ('900', '600'))
        self.assertIn('Prometeo y Evaristo', image['alt'])


if __name__ == '__main__':
    unittest.main()
