"""Check local destinations and basic document contracts on every generated page."""
from pathlib import Path
from urllib.parse import unquote, urlsplit
import json
from lxml import html

ROOT = Path(__file__).resolve().parents[1] / 'dist'


def check():
    documents = {path: html.parse(str(path)) for path in ROOT.rglob('*.html')}
    ids = {path: set(tree.xpath('//@id')) for path, tree in documents.items()}
    failures, links = [], 0
    for path, tree in documents.items():
        name = str(path.relative_to(ROOT))
        if len(tree.xpath('//h1')) != 1:
            failures.append(f'{name}: expected one h1')
        if tree.xpath('string(/html/@lang)') not in ('es', 'en'):
            failures.append(f'{name}: missing supported language')
        for node in tree.xpath('//*[@href or @src or @poster]'):
            for attribute in ('href', 'src', 'poster'):
                value = node.get(attribute)
                if not value:
                    continue
                parsed = urlsplit(value)
                if parsed.scheme or parsed.netloc:
                    continue
                links += 1
                if parsed.path.startswith('/'):
                    target = ROOT / unquote(parsed.path.lstrip('/'))
                elif parsed.path:
                    target = path.parent / unquote(parsed.path)
                else:
                    target = path
                target = target.resolve()
                if not target.is_relative_to(ROOT.resolve()):
                    failures.append(f'{name}: path outside public root: {value}')
                    continue
                if target.is_dir():
                    target /= 'index.html'
                if not target.is_file():
                    failures.append(f'{name}: missing destination: {value}')
                elif parsed.fragment and target in ids and unquote(parsed.fragment) not in ids[target]:
                    failures.append(f'{name}: missing anchor: {value}')
    print(json.dumps({'html': len(documents), 'local_links': links,
                      'failures': failures}, ensure_ascii=False, indent=2))
    if failures:
        raise SystemExit(1)


if __name__ == '__main__':
    check()
