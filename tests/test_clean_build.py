"""Prove that versioned inputs alone reproduce a complete, stale-free dist."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]


def hashes(directory):
    return {str(path.relative_to(directory)): hashlib.sha256(path.read_bytes()).hexdigest()
            for path in sorted(directory.rglob('*')) if path.is_file()}


def run():
    with tempfile.TemporaryDirectory(prefix='iphobiuss-clean-build-') as temp:
        clone = Path(temp)
        for name in ('content', 'scripts'):
            shutil.copytree(ROOT / name, clone / name,
                            ignore=shutil.ignore_patterns('__pycache__', '*.pyc'))
        before = hashes(clone / 'content')
        subprocess.run([sys.executable, 'scripts/build-site.py'], cwd=clone, check=True)
        first = hashes(clone / 'dist')
        assert 'index.html' in first and 'assets/css/fonts.css' in first
        assert any(path.startswith('downloads/') for path in first)
        # A second full build must discard stale files, not silently republish them.
        (clone / 'dist/obsolete-page.html').write_text('must disappear')
        subprocess.run([sys.executable, 'scripts/build-site.py'], cwd=clone, check=True)
        second = hashes(clone / 'dist')
        assert first == second, 'Two clean builds differ or retain stale output'
        assert before == hashes(clone / 'content'), 'Build changed versioned inputs'
        print(json.dumps({'clean_build': 'passed', 'repeated_build': 'identical',
                          'stale_output_removed': True, 'source_inputs_unchanged': True,
                          'public_files': len(first)}))


if __name__ == '__main__':
    run()
