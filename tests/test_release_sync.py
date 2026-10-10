"""A release may only combine matching successful workflow receipts."""
from copy import deepcopy
import importlib.util
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
spec = importlib.util.spec_from_file_location('release_sync', ROOT / 'scripts/sync-report-release.py')
sync = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync)


class ReleaseSyncTests(unittest.TestCase):
    def setUp(self):
        self.sha = 'a' * 40
        self.runs = []
        for number, (_, (filename, _)) in enumerate(sync.WORKFLOWS.items(), 1):
            self.runs.append({'id': number, 'run_number': 1, 'run_attempt': 1,
                              'path': '.github/workflows/' + filename,
                              'head_sha': self.sha, 'head_branch': 'main',
                              'repository': {'full_name': sync.REPO},
                              'head_repository': {'full_name': sync.REPO}, 'event': 'push',
                              'html_url': f'https://github.com/{sync.REPO}/actions/runs/{number}',
                              'status': 'completed', 'conclusion': 'success',
                              'updated_at': '2026-10-10T14:00:00Z'})

    def prepare(self, runs):
        return sync.prepare({'sample_banca_html_export_version': '0.25.0'}, '0.28.0',
                            self.sha, runs, '2026-10-10')

    def test_pins_download_guide_and_evidence_without_rewriting_sample_provenance(self):
        report, status = self.prepare(self.runs)
        self.assertIn(self.sha, report['download'])
        self.assertIn(self.sha, report['guide'])
        self.assertEqual(report['sample_banca_html_export_version'], '0.25.0')
        self.assertEqual(status['pending'], ['native_microsoft_word', 'five_human_usability_sessions'])

    def test_rejects_missing_failed_foreign_wrong_commit_or_incomplete_receipts(self):
        invalid = [self.runs[:-1]]
        for field, value in [('head_sha', 'b' * 40), ('conclusion', 'failure'),
                             ('status', 'in_progress'), ('head_branch', 'other'),
                             ('repository', {'full_name': 'someone/another'}),
                             ('head_repository', {'full_name': 'someone/fork'}),
                             ('event', 'pull_request'),
                             ('html_url', 'https://example.org/runs/1'),
                             ('updated_at', '2026-10-11T01:00:00Z')]:
            runs = deepcopy(self.runs)
            runs[0][field] = value
            invalid.append(runs)
        for runs in invalid:
            with self.subTest(runs=runs), self.assertRaises(ValueError):
                self.prepare(runs)

    def test_failed_latest_attempt_cannot_be_hidden_by_previous_success(self):
        retry = {**self.runs[0], 'run_attempt': 2, 'conclusion': 'failure'}
        with self.assertRaises(ValueError):
            self.prepare(self.runs + [retry])

    def released(self):
        version = '0.29.0'
        stem = f'report-gen-{version}-{self.sha[:12]}'
        base = f'https://github.com/{sync.REPO}'
        package = {'version': version, 'commit': self.sha, 'archive': stem + '.zip',
                   'sha256': 'b' * 64, 'archive_bytes': 1234}
        package['assets'] = {stem + suffix: {'bytes': 1234, 'sha256': 'b' * 64}
                             for suffix in ('.zip', '.sha256', '.json')}
        release = {'id': 10, 'tag_name': 'v' + version, 'target_commitish': self.sha,
                   'draft': False, 'prerelease': False, 'published_at': '2026-10-10T14:01:00Z',
                   'html_url': f'{base}/releases/tag/v{version}', 'assets': [
                       {'id': i, 'name': stem + suffix, 'state': 'uploaded',
                        'size': 1234, 'digest': 'sha256:' + package['sha256'],
                        'browser_download_url': f'{base}/releases/download/v{version}/{stem}{suffix}'}
                       for i, suffix in enumerate(('.zip', '.sha256', '.json'), 11)]}
        return release, package

    def test_published_release_matches_reproduced_package_and_keeps_commit_receipts(self):
        release, package = self.released()
        report, status = sync.prepare({}, '0.29.0', self.sha, self.runs, '2026-10-10',
                                      release=release, package=package)
        self.assertEqual(report['distribution'], 'github-release')
        self.assertEqual(report['download'], release['assets'][0]['browser_download_url'])
        self.assertEqual(report['download_sha256'], package['sha256'])
        self.assertEqual(report['release'], status['release'])
        self.assertEqual(len(status['checks']), 4)

    def test_rejects_wrong_draft_tag_commit_asset_origin_hash_size_or_missing_assets(self):
        release, package = self.released()
        invalid = []
        for field, value in [('draft', True), ('prerelease', True), ('target_commitish', 'main'),
                             ('tag_name', 'v0.28.0'), ('published_at', None),
                             ('published_at', '2026-10-11T00:00:00Z')]:
            copy = deepcopy(release); copy[field] = value; invalid.append(copy)
        for field, value in [('state', 'new'), ('size', 1235), ('digest', 'sha256:' + 'c' * 64),
                             ('browser_download_url', 'https://example.org/archive.zip')]:
            copy = deepcopy(release); copy['assets'][0][field] = value; invalid.append(copy)
        copy = deepcopy(release); copy['assets'].pop(); invalid.append(copy)
        copy = deepcopy(release); copy['assets'].append(copy['assets'][0]); invalid.append(copy)
        copy = deepcopy(release); copy['assets'].append({**copy['assets'][0], 'name': 'unreviewed.zip'}); invalid.append(copy)
        for index in (1, 2):
            for field, value in [('digest', 'sha256:' + 'c' * 64), ('size', 1235),
                                 ('browser_download_url', 'https://example.org/unreviewed'), ('id', 0)]:
                copy = deepcopy(release); copy['assets'][index][field] = value; invalid.append(copy)
        for item in invalid:
            with self.subTest(release=item), self.assertRaises(ValueError):
                sync.prepare({}, '0.29.0', self.sha, self.runs, '2026-10-10',
                             release=item, package=package)

    def test_existing_release_cannot_mask_a_failed_workflow(self):
        release, package = self.released()
        runs = deepcopy(self.runs); runs[0]['conclusion'] = 'failure'
        with self.assertRaises(ValueError):
            sync.prepare({}, '0.29.0', self.sha, runs, '2026-10-10', release=release, package=package)


if __name__ == '__main__':
    unittest.main()
