"""Run the real HTTP lab and validate its downloadable/public evidence contract."""
from __future__ import annotations

import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "content/labs/session-security"
sys.path.insert(0, str(ROOT / "scripts"))
import session_security_case as bundle
import site_session_security as page

spec = importlib.util.spec_from_file_location("session_lab", SOURCE / "lab.py")
lab = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lab)


class SessionSecurityCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.recorded = json.loads((SOURCE / "resultados.json").read_text())
        cls.executed = lab.run()

    def test_recorded_http_evidence_matches_fresh_execution(self):
        self.assertEqual(self.executed, self.recorded)
        self.assertEqual(self.executed["summary"], {"scenarios": 24, "modes": 2, "http_exchanges": 154, "passed": 154, "failed": 0})
        self.assertFalse(self.executed["external_targets"])

    def test_capture_hashes_and_framing_are_consistent(self):
        for row in self.executed["results"]:
            for mode in ("vulnerable", "fixed"):
                for step in row[mode]["trace"]:
                    response = step["response"]
                    body = response["body"].encode("utf-8")
                    self.assertEqual(hashlib.sha256(body).hexdigest(), response["body_sha256"])
                    self.assertEqual(str(len(body)), response["headers"]["Content-Length"])
                    self.assertEqual("no-store", response["headers"]["Cache-Control"])
                    self.assertNotIn("Date", response["headers"])

    def test_fixture_controls_keep_both_identities_and_positive_access(self):
        rows = {row["id"]: row for row in self.executed["results"]}
        for identity in ("alice", "bruno"):
            for operation in ("logout", "device"):
                row = rows[f"{identity}_{operation}"]
                expected = [200, 200, 401, 200, 200] if operation == "logout" else [200, 401, 200, 200]
                self.assertEqual(expected, [s["response"]["status"] for s in row["fixed"]["trace"]])
            expiry = rows[f"{identity}_expiry"]["fixed"]["trace"]
            self.assertEqual([59, 60, 60, 60], [s["clock_seconds"] for s in expiry])
            self.assertEqual([200, 401, 200, 200], [s["response"]["status"] for s in expiry])

    def test_clock_cannot_go_backwards(self):
        clock = lab.Clock()
        for invalid in (-1, 0.5, True, "60"):
            with self.assertRaises(ValueError):
                clock.advance(invalid)
        clock.advance(60)
        self.assertEqual(clock.now(), 60)

    def test_artifact_reproduces_exactly_and_manifest_covers_every_file(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            shutil.copytree(SOURCE, root / "content/labs/session-security", ignore=shutil.ignore_patterns("__pycache__"))
            self.assertEqual(bundle.prepare_evidence(root), self.recorded)
            archive_path = root / "dist/downloads/session-security-lab.zip"
            first = archive_path.read_bytes()
            bundle.prepare_evidence(root)
            self.assertEqual(first, archive_path.read_bytes())
            with zipfile.ZipFile(archive_path) as archive:
                names = set(archive.namelist())
                self.assertEqual(names, set(bundle.FILES) | {"MANIFEST.sha256"})
                covered = set()
                for line in archive.read("MANIFEST.sha256").decode().splitlines():
                    digest, name = line.split("  ", 1)
                    self.assertEqual(digest, hashlib.sha256(archive.read(name)).hexdigest())
                    covered.add(name)
                self.assertEqual(covered, names - {"MANIFEST.sha256"})
                extracted = root / "extracted"
                archive.extractall(extracted)
            result = subprocess.run([sys.executable, str(extracted / "lab.py"), "--verify", str(extracted / "resultados.json")], capture_output=True, text=True, timeout=30)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("154/154", result.stdout)

    def test_tampered_evidence_fails_build(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            shutil.copytree(SOURCE, root / "content/labs/session-security", ignore=shutil.ignore_patterns("__pycache__"))
            evidence_path = root / "content/labs/session-security/resultados.json"
            value = json.loads(evidence_path.read_text())
            value["results"][0]["fixed"]["trace"][2]["response"]["status"] = 200
            evidence_path.write_text(json.dumps(value))
            with self.assertRaises(subprocess.CalledProcessError):
                bundle.prepare_evidence(root)
            self.assertFalse((root / "dist/downloads/session-security-lab.zip").exists())

    def test_page_preserves_complete_http_bodies_and_clock(self):
        from lxml import html
        for row in self.recorded["results"]:
            markup = html.fromstring(page.results({"results": [row]}))
            blocks = markup.xpath('.//pre/code/text()')
            self.assertEqual(len(blocks), 2)
            for index, mode in enumerate(("vulnerable", "fixed")):
                for step in row[mode]["trace"]:
                    self.assertIn(step["response"]["body"], blocks[index])
                    self.assertIn(f'reloj controlado: {step["clock_seconds"]} s', blocks[index])


if __name__ == "__main__":
    unittest.main()
