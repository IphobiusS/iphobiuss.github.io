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


if __name__ == '__main__':
    unittest.main()
