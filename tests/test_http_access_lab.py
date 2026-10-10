"""Regress the actual HTTP boundary, evidence and downloadable source bundle."""
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
LAB = ROOT / "content/labs/http-access"
sys.path.insert(0, str(ROOT / "scripts"))
from http_access_case import prepare_evidence

spec = importlib.util.spec_from_file_location("http_lab", LAB / "lab.py")
lab = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lab)


class HTTPAuthorizationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.evidence = lab.run()
        cls.cases = {row["id"]: row for row in cls.evidence["results"]}

    def test_complete_recorded_evidence_reproduces(self):
        self.assertEqual(self.evidence, json.loads((LAB / "resultados.json").read_text()))
        self.assertEqual(self.evidence["summary"], {"scenarios": 17, "modes": 2, "http_exchanges": 44, "passed": 44, "failed": 0})

    def test_read_denials_have_no_foreign_content(self):
        for name in ("alice_cross_read", "bruno_cross_read", "client_owner_header"):
            response = self.cases[name]["fixed"]["trace"][0]["response"]
            self.assertEqual(response["status"], 404)
            self.assertEqual(json.loads(response["body"]), {"error": "not_found"})
            self.assertNotIn("SYNTHETIC_", response["body"])

    def test_rejected_write_does_not_change_stored_object(self):
        for name, item in (("alice_cross_write", lab.REPORTS["202"]), ("bruno_cross_write", lab.REPORTS["101"])):
            steps = self.cases[name]["fixed"]["trace"]
            self.assertEqual(steps[0]["response"]["status"], 404)
            self.assertEqual(json.loads(steps[1]["response"]["body"]), item)
            self.assertEqual(steps[1]["response"]["status"], 200)

    def test_vulnerable_mode_reproduces_actual_read_and_write(self):
        response = self.cases["alice_cross_read"]["vulnerable"]["trace"][0]["response"]
        self.assertEqual(json.loads(response["body"]), lab.REPORTS["202"])
        followup = self.cases["alice_cross_write"]["vulnerable"]["trace"][1]["response"]
        self.assertEqual(json.loads(followup["body"])["title"], "Cambio no autorizado")

    def test_server_binds_loopback_and_closes(self):
        with lab.running_server() as server:
            self.assertEqual(server.server_address[0], "127.0.0.1")
            address = server.server_address
        import socket
        with socket.socket() as client:
            self.assertNotEqual(client.connect_ex(address), 0)

    def test_tampered_evidence_fails(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "tampered.json"
            altered = json.loads(json.dumps(self.evidence))
            altered["results"][0]["fixed"]["trace"][0]["response"]["body"] = "{}"
            path.write_text(json.dumps(altered))
            result = subprocess.run([sys.executable, str(LAB / "lab.py"), "--verify", str(path)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 1)
            self.assertIn("differs", result.stderr)

    def test_download_is_reproducible_and_manifest_covers_every_source(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            shutil.copytree(LAB, root / "content/labs/http-access", ignore=shutil.ignore_patterns("__pycache__"))
            prepare_evidence(root)
            archive = root / "dist/downloads/http-access-lab.zip"
            first = archive.read_bytes()
            prepare_evidence(root)
            self.assertEqual(first, archive.read_bytes())
            with zipfile.ZipFile(archive) as package:
                entries = package.namelist()
                manifest = package.read("MANIFEST.sha256").decode()
                covered = []
                for line in manifest.splitlines():
                    digest, name = line.split("  ", 1)
                    covered.append(name)
                    self.assertEqual(hashlib.sha256(package.read(name)).hexdigest(), digest)
                self.assertEqual(set(covered), set(entries) - {"MANIFEST.sha256"})
                self.assertIn("Dockerfile", covered)
                self.assertIn(".dockerignore", covered)


if __name__ == "__main__":
    unittest.main()
