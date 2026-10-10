#!/usr/bin/env python3
"""Prepare one source-pinned website update from actual GitHub run receipts."""
import argparse
import ast
from datetime import datetime, timezone
import hashlib
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


def released_package(version, commit, release, package, reviewed_on):
    """Match an uploaded release asset to the locally reproduced source package."""
    base = f'https://github.com/{REPO}'
    stem = f'report-gen-{version}-{commit[:12]}'
    if (release.get('draft') is not False or release.get('prerelease') is not False
            or release.get('tag_name') != f'v{version}' or release.get('target_commitish') != commit
            or release.get('html_url') != f'{base}/releases/tag/v{version}'
            or type(release.get('id')) is not int or release['id'] <= 0):
        raise ValueError('The release must be published for this exact version and commit')
    published = release.get('published_at')
    if not published or datetime.fromisoformat(published.replace('Z', '+00:00')).date() > datetime.fromisoformat(reviewed_on).date():
        raise ValueError('The release publication must precede the recorded review')
    if (package.get('version') != version or package.get('commit') != commit
            or package.get('archive') != stem + '.zip'
            or not re.fullmatch(r'[0-9a-f]{64}', package.get('sha256', ''))
            or type(package.get('archive_bytes')) is not int or package['archive_bytes'] <= 0):
        raise ValueError('Reproduce the selected source package before linking its release')
    names = {stem + suffix for suffix in ('.zip', '.sha256', '.json')}
    if (len(release.get('assets', [])) != 3
            or set(package.get('assets', {})) != names):
        raise ValueError('Reproduce and verify exactly the three release assets')
    matches = []
    for suffix in ('.zip', '.sha256', '.json'):
        assets = [asset for asset in release.get('assets', []) if asset.get('name') == stem + suffix]
        if len(assets) != 1 or assets[0].get('state') != 'uploaded':
            raise ValueError('The published release lacks a unique, complete package asset')
        asset = assets[0]
        local = package['assets'][stem + suffix]
        if (type(asset.get('id')) is not int or asset['id'] <= 0
                or asset.get('browser_download_url') != f'{base}/releases/download/v{version}/{stem}{suffix}'
                or type(local.get('bytes')) is not int or local['bytes'] <= 0
                or not re.fullmatch(r'[0-9a-f]{64}', local.get('sha256', ''))
                or asset.get('size') != local['bytes']
                or asset.get('digest') != 'sha256:' + local['sha256']):
            raise ValueError('A release asset differs from its reproduced file')
        matches.append(assets[0])
    archive = matches[0]
    url = f'{base}/releases/download/v{version}/{stem}.zip'
    if (archive.get('browser_download_url') != url or archive.get('size') != package['archive_bytes']
            or archive.get('digest') != 'sha256:' + package['sha256']
            or type(archive.get('id')) is not int or archive['id'] <= 0):
        raise ValueError('The release archive differs from the reproduced source package')
    return {'id': release['id'], 'tag': f'v{version}', 'html_url': release['html_url'],
            'published_at': published, 'source_commit': commit, 'asset_id': archive['id'],
            'asset_name': archive['name'], 'download': url,
            'sha256': package['sha256'], 'bytes': package['archive_bytes']}


def prepare(report, version, commit, runs, reviewed_on, *, release=None, package=None):
    if not re.fullmatch(r'[0-9a-f]{40}', commit) or not re.fullmatch(r'\d+\.\d+\.\d+', version):
        raise ValueError('Use a complete source commit and a release version')
    selected = []
    for key, (filename, environment) in WORKFLOWS.items():
        candidates = [run for run in runs if run.get('path') == '.github/workflows/' + filename
                      and run.get('head_sha') == commit and run.get('head_branch') == 'main'
                      and run.get('repository', {}).get('full_name') == REPO
                      and run.get('event') == 'push'
                      and run.get('head_repository', {}).get('full_name') == REPO]
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
                  distribution='github-immutable-commit',
                  guide=f'{base}/blob/{commit}/docs/guide.es.md')
    for field in ('release', 'download_sha256', 'download_bytes'):
        report.pop(field, None)
    status = {'schema_version': 1, 'version': version, 'source_commit': commit,
              'reviewed_on': reviewed_on, 'repository': base, 'checks': selected,
              'pending': ['native_microsoft_word', 'five_human_usability_sessions'],
              'limits_source': 'docs/guide.es.md#materiales-para-las-comprobaciones-externas',
              'verification_method': 'GitHub workflow run receipts for this immutable commit; native Word and human usability remain pending. Not a live monitor.'}
    if release is not None or package is not None:
        if release is None or package is None:
            raise ValueError('Supply both the published release and the reproduced package')
        receipt = released_package(version, commit, release, package, reviewed_on)
        report.update(distribution='github-release', download=receipt['download'],
                      download_name=receipt['asset_name'], download_sha256=receipt['sha256'],
                      download_bytes=receipt['bytes'], release=receipt)
        status['release'] = receipt
    validate_snapshot(status, report)
    return report, status


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=Path, required=True, help='Local report-gen checkout')
    parser.add_argument('--commit', required=True, help='Full published report-gen commit')
    parser.add_argument('--runs', type=Path, required=True, help='GitHub workflow_runs JSON response')
    parser.add_argument('--release', type=Path, help='Published GitHub release JSON response')
    parser.add_argument('--package-manifest', type=Path, help='Locally reproduced source package manifest beside its ZIP')
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
    release = json.loads(args.release.read_text()) if args.release else None
    package = None
    if args.package_manifest:
        package = json.loads(args.package_manifest.read_text())
        archive_name = package.get('archive', '')
        if not archive_name or Path(archive_name).name != archive_name:
            raise ValueError('Invalid source archive name')
        archive = args.package_manifest.parent / archive_name
        payload = archive.read_bytes()
        if hashlib.sha256(payload).hexdigest() != package.get('sha256'):
            raise ValueError('Local source archive hash differs from its manifest')
        package['archive_bytes'] = len(payload)
        package['assets'] = {}
        for file in (archive, archive.with_suffix('.sha256'), args.package_manifest):
            data = file.read_bytes()
            package['assets'][file.name] = {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
    report, status = prepare(old, version, args.commit, receipts['workflow_runs'],
                             datetime.now(timezone.utc).date().isoformat(),
                             release=release, package=package)
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
