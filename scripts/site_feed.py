"""A stable editorial RSS feed; rebuilding never republishes old entries."""
from __future__ import annotations

from datetime import date, datetime, time, timezone
from email.utils import format_datetime
import json
from urllib.parse import urlsplit, unquote
from lxml import etree, html

ATOM = 'http://www.w3.org/2005/Atom'
DCTERMS = 'http://purl.org/dc/terms/'


def _day(value):
    parsed = date.fromisoformat(value)
    if parsed.isoformat() != value:
        raise ValueError(f'Editorial date must use YYYY-MM-DD: {value}')
    return parsed


def _rss_date(value):
    # Editorial dates deliberately have day precision, not invented publication times.
    return format_datetime(datetime.combine(_day(value), time(), timezone.utc), usegmt=True)


def build_feed(root, output, base, series, guides, page_dates):
    registry = json.loads((root / 'content/feed-entries.json').read_text(encoding='utf-8'))
    if registry.get('schema') != 1:
        raise ValueError('Unknown editorial feed schema')
    entries = list(registry['entries'])
    for index, name in enumerate(series):
        guide = guides[name]
        entries.append({
            # Existing subscribers keep the exact GUIDs published in the old guide feed.
            'id': base + name + '.html', 'path': name + '.html',
            'title': f'Guía {index:02d}: {guide["title"]}', 'summary': guide['brief'],
            'category': 'Guía de laboratorio', 'subject': guide['os'],
            'modified_on': page_dates[name + '.html'],
        })
    seen = set()
    for entry in entries:
        if entry['id'] in seen:
            raise ValueError(f'Duplicate feed identifier: {entry["id"]}')
        seen.add(entry['id'])
        modified = _day(entry['modified_on'])
        if entry.get('published_on') and _day(entry['published_on']) > modified:
            raise ValueError('An entry cannot be modified before it is published')
        if 'path' in entry:
            parsed = urlsplit(entry['path'])
            if parsed.scheme or parsed.netloc or parsed.query or parsed.path.startswith('/'):
                raise ValueError(f'Feed entry needs a relative local path: {entry["path"]}')
            target = (output / unquote(parsed.path)).resolve()
            if not target.is_relative_to(output.resolve()) or not target.is_file():
                raise ValueError(f'Missing local feed destination: {entry["path"]}')
            if parsed.fragment and not html.parse(str(target)).xpath('//*[@id=$fragment]', fragment=unquote(parsed.fragment)):
                raise ValueError(f'Missing feed fragment: {entry["path"]}')
            entry['url'] = base + entry['path']
        elif not entry.get('url', '').startswith('https://github.com/IphobiusS/report-gen/releases/tag/v'):
            raise ValueError('External feed entries must identify an official report-gen release')
    # A stable tiebreaker keeps byte-identical output even if the source list is reordered.
    entries.sort(key=lambda entry: (entry.get('published_on', entry['modified_on']), entry['id']), reverse=True)
    rss = etree.Element('rss', version='2.0', nsmap={'atom': ATOM, 'dcterms': DCTERMS})
    channel = etree.SubElement(rss, 'channel')
    for name, value in (
        ('title', 'Proyectos, bitácora y guías de iphobiuss'),
        ('link', base),
        ('description', 'Casos reproducibles, decisiones técnicas, novedades de report-gen y guías de laboratorio de Sebastián Latorre Muñoz.'),
        ('language', 'es'),
        ('lastBuildDate', _rss_date(max(entry['modified_on'] for entry in entries))),
    ):
        etree.SubElement(channel, name).text = value
    etree.SubElement(channel, '{' + ATOM + '}link', href=base + 'feed.xml', rel='self', type='application/rss+xml')
    for entry in entries:
        item = etree.SubElement(channel, 'item')
        etree.SubElement(item, 'title').text = entry['title']
        etree.SubElement(item, 'link').text = entry['url']
        etree.SubElement(item, 'guid', isPermaLink='true' if entry['id'] == entry['url'] else 'false').text = entry['id']
        etree.SubElement(item, 'description').text = entry['summary']
        etree.SubElement(item, 'category').text = entry['category']
        if entry.get('subject'):
            etree.SubElement(item, 'category').text = entry['subject']
        if entry.get('published_on'):
            etree.SubElement(item, 'pubDate').text = _rss_date(entry['published_on'])
        etree.SubElement(item, '{' + DCTERMS + '}modified').text = entry['modified_on']
    (output / 'feed.xml').write_bytes(etree.tostring(rss, encoding='UTF-8', xml_declaration=True, pretty_print=True))
