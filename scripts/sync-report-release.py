#!/usr/bin/env python3
"""Prepare one source-pinned website update from actual GitHub run receipts."""
import argparse
import ast
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import subprocess

from pypdf import PdfReader
from site_report_status_144 import validate_snapshot

ROOT = Path(__file__).resolve().parents[1]
REPO = 'IphobiusS/report-gen'
WORKFLOWS = {
    'tests': ('tests.yml', 'Ubuntu 24.04; Python 3.12; Chromium'),
    'browsers': ('browser-acceptance.yml', 'Ubuntu 24.04; Python 3.12; Chromium and Firefox'),
    'windows': ('windows.yml', 'Windows Server 2025; Python 3.12; Chromium'),
    'source': ('source-package.yml', 'Ubuntu 24.04; Python 3.12'),
}


def prepare(report, version, commit, runs, reviewed_on):
    if not re.fullmatch(r'[0-9a-f]{40}', commit) or not re.fullmatch(r'\d+\.\d+\.\d+', version):
        raise ValueError('Use a complete source commit and a release version')
    selected = []
    for key, (filename, environment) in WORKFLOWS.items():
        candidates = [run for run in runs if run.get('path') == '.github/workflows/' + filename
                      and run.get('head_sha') == commit and run.get('head_branch') == 'main'
                      and run.get('repository', {}).get('full_name') == REPO]
        if not candidates:
            raise ValueError(f'Missing workflow receipt: {filename}')
        run = max(candidates, key=lambda item: (item.get('run_number', 0), item.get('run_attempt', 1)))
        if run.get('status') != 'completed' or run.get('conclusion') != 'success':
            raise ValueError(f'The latest workflow did not pass: {filename}')
        if run.get('html_url') != f'https://github.com/{REPO}/actions/runs/{run["id"]}':
            raise ValueError('Unexpected workflow origin')
        selected.append({'key': key, 'run_id': run['id'], 'workflow': run['path'],
                         'head_sha': commit, 'conclusion': 'success',
                         'completed_at': run['updated_at'], 'environment': environment})
    report = dict(report)
    base = f'https://github.com/{REPO}'
    report.update(version=version, source_commit=commit,
                  download=f'{base}/archive/{commit}.zip',
                  download_name=f'report-gen-{version}.zip',
                  guide=f'{base}/blob/{commit}/docs/guide.es.md')
    status = {'schema_version': 1, 'version': version, 'source_commit': commit,
              'reviewed_on': reviewed_on, 'repository': base, 'checks': selected,
              'pending': ['native_microsoft_word', 'five_human_usability_sessions'],
              'limits_source': 'docs/guide.es.md#materiales-para-las-comprobaciones-externas',
              'verification_method': 'GitHub workflow run receipts for this immutable commit; native Word and human usability remain pending. Not a live monitor.'}
    validate_snapshot(status, report)
    return report, status


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=Path, required=True, help='Local report-gen checkout')
    parser.add_argument('--commit', required=True, help='Full published report-gen commit')
    parser.add_argument('--runs', type=Path, required=True, help='GitHub workflow_runs JSON response')
    parser.add_argument('--apply', action='store_true', help='Write the validated pair; default only previews')
    args = parser.parse_args()
    if not re.fullmatch(r'[0-9a-f]{40}', args.commit):
        parser.error('A complete immutable commit is required')
    raw = subprocess.check_output(['git', '-C', str(args.repo), 'show', f'{args.commit}:version.py'], text=True)
    values = [ast.literal_eval(n.value) for n in ast.parse(raw).body if isinstance(n, ast.Assign)
              and any(isinstance(t, ast.Name) and t.id == '__version__' for t in n.targets)]
    if len(values) != 1:
        raise ValueError('version.py must declare exactly one literal version')
    version = values[0]
    cv = PdfReader(ROOT / 'content/public/downloads/cv-sebastian-latorre.pdf')
    cv_text = '\n'.join(page.extract_text() or '' for page in cv.pages)
    if re.findall(r'\bv(\d+\.\d+\.\d+)\b', cv_text) != [version]:
        raise ValueError('Update and visually review the public CV to the same release first')
    old = json.loads((ROOT / 'content/report-gen.json').read_text())
    receipts = json.loads(args.runs.read_text())
    report, status = prepare(old, version, args.commit, receipts['workflow_runs'],
                             datetime.now(timezone.utc).date().isoformat())
    if args.apply:
        for name, data in [('report-gen.json', report), ('report-gen-status.json', status)]:
            path = ROOT / 'content' / name
            temporary = path.with_suffix('.json.tmp')
            temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
            temporary.replace(path)
    print(json.dumps({'applied': args.apply, 'version': version, 'commit': args.commit,
                      'verified_workflows': len(status['checks']), 'cv_version': version}))


if __name__ == '__main__':
    main()
