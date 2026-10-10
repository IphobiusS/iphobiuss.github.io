"""Bound published page/code weight without fragile machine-speed thresholds."""
from __future__ import annotations

import argparse
import gzip
import json
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
BUDGET_PATH = ROOT / "tests/performance_budget.json"


class PageResources(HTMLParser):
    def __init__(self):
        super().__init__()
        self.code = set()

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        if tag == "script" and attrs.get("src"):
            self.code.add(attrs["src"])
        if tag == "link" and "stylesheet" in attrs.get("rel", "").split() and attrs.get("href"):
            self.code.add(attrs["href"])


def measure(dist: Path, budget: dict) -> dict:
    failures = []

    def bounded(label, actual, key):
        if actual > budget[key]:
            failures.append(f"{label}: {actual} exceeds {key}={budget[key]}")

    pages = sorted(dist.glob("*.html"))
    assert pages, "Build the site before checking budgets"
    assets = {}
    for suffix, name in (("js", "javascript"), ("css", "stylesheet")):
        files = sorted((dist / "assets").rglob(f"*.{suffix}"))
        assert files, f"No {suffix} resources in distribution"
        total = 0
        for file in files:
            size = file.stat().st_size
            bounded(str(file.relative_to(dist)), size, f"{name}_file_bytes")
            total += size
        bounded(f"All {name}", total, f"{name}_total_bytes")
        assets[name] = {"files": len(files), "bytes": total}

    results = []
    for page in pages:
        parser = PageResources()
        content = page.read_bytes()
        parser.feed(content.decode("utf-8"))
        bounded(page.name, len(content), "html_bytes")
        files = {page.resolve()}
        for source in sorted(parser.code):
            url = urlsplit(source)
            assert not url.scheme and not url.netloc, f"External code resource on {page.name}: {source}"
            file = (dist / unquote(url.path.lstrip("/"))).resolve()
            assert file.is_relative_to(dist.resolve()) and file.is_file(), f"Missing or escaped resource: {source}"
            files.add(file)
        code_bytes = sum(file.stat().st_size for file in files)
        bounded(page.name + " HTML/CSS/JS", code_bytes, "page_code_bytes")
        results.append({"page": page.name, "html_bytes": len(content), "code_bytes": code_bytes,
                        "code_requests": len(files), "gzip_estimate_bytes": sum(len(gzip.compress(file.read_bytes(), mtime=0)) for file in files)})
    cv = dist / "downloads/cv-sebastian-latorre.pdf"
    bounded("Public CV", cv.stat().st_size, "public_cv_bytes")
    return {"passed": not failures, "scope": "All top-level published pages; linked HTML/CSS/JS and complete CSS/JS asset inventory. Explicit report downloads are not page-load assets.",
            "budgets": budget, "assets": assets, "public_cv_bytes": cv.stat().st_size, "pages": results, "failures": failures}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dist", type=Path, default=ROOT / "dist")
    parser.add_argument("--output", type=Path, default=ROOT / "audit-v14.6/performance/results.json")
    args = parser.parse_args()
    result = measure(args.dist.resolve(), json.loads(BUDGET_PATH.read_text()))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n")
    if result["failures"]:
        raise SystemExit("Performance budget failed:\n" + "\n".join(result["failures"]))
    heaviest = max(result["pages"], key=lambda page: page["code_bytes"])
    print(f"Performance budgets: {len(result['pages'])} pages passed; maximum page code {heaviest['code_bytes']} bytes ({heaviest['page']}); CV {result['public_cv_bytes']} bytes.")
    print("Gzip sizes are local estimates, not measured CDN transfer or real-user Web Vitals.")


if __name__ == "__main__":
    main()
