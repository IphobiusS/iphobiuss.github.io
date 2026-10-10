#!/usr/bin/env python3
"""Build only from versioned source inputs, discarding stale generated output."""
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'dist'


def main():
    if OUT.is_symlink():
        raise SystemExit('Refusing to replace a dist symlink.')
    if OUT.exists():
        shutil.rmtree(OUT)
    commands = (
        ['scripts/site_assets.py'],
        ['scripts/build-fonts.py'],
        ['scripts/build-images.py'],
        ['scripts/build-social.py'],
        ['scripts/optimize-report-html.py', '--in-place', '--manifest',
         'content/report-gen-html-optimization.json'],
        ['scripts/build.py'],
    )
    for command in commands:
        subprocess.run([sys.executable, *command], cwd=ROOT, check=True)


if __name__ == '__main__':
    main()
