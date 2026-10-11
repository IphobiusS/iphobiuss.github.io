"""Check subscriber continuity, real targets and reproducible editorial dates."""
from __future__ import annotations

from copy import deepcopy
from email.utils import parsedate_to_datetime
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from urllib.parse import urlsplit, unquote, urljoin
from lxml import etree, html

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('site_feed', ROOT / 'scripts/site_feed.py')
FEED = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(FEED)
BASE = 'https://iphobiuss.github.io/'


class PublishedFeedTests(unittest.TestCase):
    def test_every_item_is_unique_resolvable_and_dated_without_inventing_history(self):
        tree = etree.parse(str(ROOT / 'dist/feed.xml'))
        items = tree.findall('channel/item')
        self.assertGreaterEqual(len(items), 15)
        guids = [item.findtext('guid') for item in items]
        self.assertEqual(len(guids), len(set(guids)))
        categories = {category.text for item in items for category in item.findall('category')}
        self.assertTrue({'Caso propio', 'report-gen', 'Bitácora', 'Guía de laboratorio'} <= categories)
        for name in ('setup', 'cap', 'knife', 'forest', 'vaccine', 'sauna', 'cascade'):
            guide = next(item for item in items if item.findtext('guid') == BASE + name + '.html')
            self.assertEqual(guide.find('guid').get('isPermaLink'), 'true')
            self.assertIsNone(guide.find('pubDate'), 'An old guide has no verified original publication date')
        for item in items:
            self.assertTrue(item.findtext('description').strip())
            link = urlsplit(item.findtext('link'))
            if link.netloc == 'iphobiuss.github.io':
                target = ROOT / 'dist' / unquote(link.path.lstrip('/'))
                self.assertTrue(target.is_file(), str(target))
                if link.fragment:
                    self.assertTrue(html.parse(str(target)).xpath('//*[@id=$id]', id=unquote(link.fragment)), item.findtext('link'))
            else:
                self.assertEqual(link.netloc, 'github.com')
                self.assertTrue(link.path.startswith('/IphobiusS/report-gen/releases/tag/v'))
            modified = item.findtext('{' + FEED.DCTERMS + '}modified')
            self.assertIsNotNone(modified)
            if item.findtext('pubDate'):
                self.assertLessEqual(parsedate_to_datetime(item.findtext('pubDate')).date(), FEED._day(modified))

    def test_visible_editions_and_structured_dates_match_sitemap(self):
        sitemap = etree.parse(str(ROOT / 'dist/sitemap.xml'))
        ns = {'s': 'http://www.sitemaps.org/schemas/sitemap/0.9'}
        for entry in sitemap.xpath('//s:url', namespaces=ns):
            url = entry.findtext('s:loc', namespaces=ns)
            modified = entry.findtext('s:lastmod', namespaces=ns)
            filename = urlsplit(url).path.lstrip('/') or 'index.html'
            tree = html.parse(str(ROOT / 'dist' / filename))
            for source in tree.xpath('//script[@type="application/ld+json"]/text()'):
                schema = json.loads(source)
                if 'dateModified' in schema:
                    self.assertEqual(schema['dateModified'], modified, filename)
            for visible in tree.xpath('//*[contains(concat(" ",normalize-space(@class)," ")," edition-line ") or contains(concat(" ",normalize-space(@class)," ")," article-meta ")]//time[not(starts-with(normalize-space(.), "Informe original:"))]/@datetime'):
                self.assertEqual(visible, modified, filename)

    def test_pages_expose_one_consistent_feed_and_social_metadata(self):
        for path in sorted((ROOT / 'dist').glob('*.html')):
            tree = html.parse(str(path))
            feeds = tree.xpath('//link[@rel="alternate" and @type="application/rss+xml"]')
            self.assertEqual(len(feeds), 1, path.name)
            self.assertEqual(urljoin(BASE + path.name, feeds[0].get('href')), BASE + 'feed.xml')
            description = tree.xpath('//meta[@name="description"]/@content')[0]
            self.assertEqual(tree.xpath('//meta[@property="og:description"]/@content'), [description])
            self.assertEqual(tree.xpath('//meta[@name="twitter:description"]/@content'), [description])
            hrefs = tree.xpath('//link[@rel="stylesheet"]/@href')
            self.assertEqual(len(hrefs), len(set(hrefs)), path.name)
        home = html.parse(str(ROOT / 'dist/index.html'))
        description = home.xpath('//meta[@name="description"]/@content')[0]
        self.assertIn('Pentester Junior en Santiago', description)
        self.assertIn('proyectos propios', description)
        self.assertIn('report-gen', description)
        for page in ('api-acceso', 'sesiones-seguras', 'ia-limites', 'cap-caso', 'forest-caso'):
            tree = html.parse(str(ROOT / 'dist' / (page + '.html')))
            self.assertEqual(tree.xpath('//meta[@property="og:image"]/@content'), [BASE + 'assets/img/' + page + '-og.png'])
            self.assertTrue((ROOT / 'dist/assets/img' / (page + '-og.png')).is_file())


class EditorialContractTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / 'content').mkdir()
        self.output = self.root / 'dist'
        self.output.mkdir()
        (self.output / 'case.html').write_text('<html><h1>Case</h1><section id="fix"></section></html>')
        self.entries = [
            {'id': BASE + 'case.html', 'path': 'case.html#fix', 'title': 'Case & correction', 'summary': '<not markup> & observation', 'category': 'Caso propio', 'published_on': '2026-10-01', 'modified_on': '2026-10-10'},
            {'id': BASE + 'case.html#note', 'path': 'case.html', 'title': 'Note', 'summary': 'A dated decision', 'category': 'Bitácora', 'published_on': '2026-10-09', 'modified_on': '2026-10-10'},
        ]

    def tearDown(self):
        self.temp.cleanup()

    def build(self, entries):
        (self.root / 'content/feed-entries.json').write_text(json.dumps({'schema': 1, 'entries': entries}))
        FEED.build_feed(self.root, self.output, BASE, [], {}, {})
        return (self.output / 'feed.xml').read_bytes()

    def test_rebuild_and_reordered_registry_keep_subscriber_ids_and_bytes(self):
        first = self.build(self.entries)
        self.assertEqual(first, self.build(list(reversed(self.entries))))
        tree = etree.fromstring(first)
        self.assertEqual(tree.findtext('channel/lastBuildDate'), 'Sat, 10 Oct 2026 00:00:00 GMT')
        case = next(item for item in tree.findall('channel/item') if item.findtext('guid') == BASE + 'case.html')
        self.assertEqual(case.find('guid').get('isPermaLink'), 'false')
        self.assertEqual(case.findtext('description'), '<not markup> & observation')
        updated = deepcopy(self.entries)
        updated[0]['modified_on'] = '2026-10-12'
        later = etree.fromstring(self.build(updated))
        later_case = next(item for item in later.findall('channel/item') if item.findtext('guid') == BASE + 'case.html')
        self.assertEqual(case.findtext('pubDate'), later_case.findtext('pubDate'))
        self.assertEqual(case.findtext('guid'), later_case.findtext('guid'))

    def test_broken_editorial_records_stop_the_build(self):
        for change in (
            {'path': 'missing.html'}, {'path': 'case.html#missing'},
            {'path': '../secret.html'}, {'published_on': '2026-10-11'},
            {'modified_on': '20261010'}, {'id': self.entries[1]['id']},
        ):
            with self.subTest(change=change):
                entries = deepcopy(self.entries)
                entries[0].update(change)
                with self.assertRaises(ValueError):
                    self.build(entries)


if __name__ == '__main__':
    unittest.main()
