#!/usr/bin/env python3
"""Publish dist to main without rewriting history, then request a Pages build.

Run by the source branch workflow after validation. A GITHUB_TOKEN push alone
does not trigger Pages, so completion is checked through the Pages build API.
"""
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import time
from urllib.parse import quote
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]


def git(*args, cwd=ROOT):
    return subprocess.check_output(['git', *args], cwd=cwd, text=True).strip()


def publish_tree(source_sha):
    """Return main's new commit, or None when this source run was superseded."""
    git('fetch', '--no-tags', 'origin', '+refs/heads/main:refs/remotes/origin/main',
        '+refs/heads/source:refs/remotes/origin/source')
    if git('rev-parse', 'refs/remotes/origin/source') != source_sha:
        print('A newer source commit exists; skipping this publication.')
        return None
    baseline = git('rev-parse', 'refs/remotes/origin/main')
    with tempfile.TemporaryDirectory(prefix='iphobiuss-publish-') as temp:
        checkout = Path(temp) / 'main'
        git('worktree', 'add', '--detach', str(checkout), baseline)
        try:
            for path in checkout.iterdir():
                if path.name == '.git':
                    continue
                if path.is_dir() and not path.is_symlink():
                    shutil.rmtree(path)
                else:
                    path.unlink()
            shutil.copytree(ROOT / 'dist', checkout, dirs_exist_ok=True)
            git('add', '--all', cwd=checkout)
            if not git('diff', '--cached', '--name-only', cwd=checkout):
                return baseline
            git('-c', 'user.name=github-actions[bot]', '-c',
                'user.email=41898282+github-actions[bot]@users.noreply.github.com',
                'commit', '-m', f'Publish website from source {source_sha}', cwd=checkout)
            commit = git('rev-parse', 'HEAD', cwd=checkout)
            # Preparing the worktree can overlap a new source push. Recheck
            # after preparation so a superseded build does not become public.
            git('fetch', '--no-tags', 'origin',
                '+refs/heads/source:refs/remotes/origin/source')
            if git('rev-parse', 'refs/remotes/origin/source') != source_sha:
                print('A newer source commit arrived during preparation; skipping this publication.')
                return None
            # A regular fast-forward push rejects concurrent changes to main.
            git('push', 'origin', 'HEAD:refs/heads/main', cwd=checkout)
            return commit
        finally:
            git('worktree', 'remove', '--force', str(checkout))


def api(repository, path, token, method='GET'):
    request = Request('https://api.github.com/repos/' + repository + path,
                      data=b'{}' if method == 'POST' else None,
                      headers={'Accept': 'application/vnd.github+json',
                               'Authorization': 'Bearer ' + token,
                               'X-GitHub-Api-Version': '2022-11-28'}, method=method)
    with urlopen(request, timeout=30) as response:
        return json.load(response)


def verify_public(site_url, commit):
    paths = sorted(path for path in (ROOT / 'dist').rglob('*') if path.is_file())

    def verify(path):
        relative = path.relative_to(ROOT / 'dist').as_posix()
        url = site_url.rstrip('/') + '/' + quote(relative) + '?build=' + commit
        expected = hashlib.sha256(path.read_bytes()).hexdigest()
        for attempt in range(3):
            try:
                with urlopen(Request(url, headers={'Accept-Encoding': 'identity'}), timeout=30) as response:
                    if hashlib.sha256(response.read()).hexdigest() == expected:
                        return None
            except OSError:
                pass
            if attempt < 2:
                time.sleep(5)
        return relative

    with ThreadPoolExecutor(max_workers=6) as pool:
        failures = [path for path in pool.map(verify, paths) if path]
    if failures:
        raise RuntimeError('Live files differ from the tested build: ' + ', '.join(failures))
    print(f'Pages serves {len(paths)} files identical to dist; commit {commit}.')


def main():
    repository = os.environ.get('GITHUB_REPOSITORY', '')
    source_sha = os.environ.get('GITHUB_SHA', '')
    token = os.environ.get('GH_TOKEN', '')
    if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', repository):
        raise SystemExit('GITHUB_REPOSITORY is required.')
    if not re.fullmatch(r'[a-f0-9]{40}', source_sha) or not token:
        raise SystemExit('GITHUB_SHA and GH_TOKEN are required.')
    if not (ROOT / 'dist/index.html').is_file() or not (ROOT / 'dist/.nojekyll').is_file():
        raise SystemExit('Build dist before publication.')
    if any(path.is_symlink() for path in (ROOT / 'dist').rglob('*')):
        raise SystemExit('Public output must not contain symlinks.')
    settings = api(repository, '/pages', token)
    metadata = api(repository, '', token)
    if (settings.get('build_type') != 'legacy' or metadata.get('default_branch') != 'main'
            or settings.get('source') != {'branch': 'main', 'path': '/'}):
        raise SystemExit('Expected Pages publishing from main at /. Review configuration before publishing.')
    commit = publish_tree(source_sha)
    if commit is None:
        return
    api(repository, '/pages/builds', token, 'POST')
    for _ in range(120):
        latest = api(repository, '/pages/builds/latest', token)
        if latest.get('commit') == commit:
            if latest.get('status') == 'errored':
                raise SystemExit('GitHub Pages build failed: ' + str(latest.get('error')))
            if latest.get('status') == 'built':
                verify_public(settings['html_url'], commit)
                return
        time.sleep(5)
    raise SystemExit('Timed out waiting for the Pages build of ' + commit)


if __name__ == '__main__':
    main()
