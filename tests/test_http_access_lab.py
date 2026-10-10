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
from lxml import html

ROOT = Path(__file__).resolve().parents[1]
LAB = ROOT / "content/labs/http-access"
sys.path.insert(0, str(ROOT / "scripts"))
from http_access_case import access_control_diff, prepare_evidence
from site_http_access import build_case

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
        self.assertEqual(self.evidence["summary"], {"scenarios": 18, "modes": 2, "http_exchanges": 48, "passed": 48, "failed": 0})

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

    def test_same_policy_guards_both_operations_and_keeps_ownership_server_side(self):
        for mode in (False, True):
            with lab.running_server(fixed=mode) as server:
                # A client-supplied identity never overrides the token. The
                # protected policy must deny this write before processing JSON.
                observed = lab.request(server.server_address[1], {
                    "method": "PATCH", "path": "/reports/202", "token": "lab-alice-only",
                    "headers": [["X-Lab-User", "bruno"]], "body": '{"title":"Untrusted header"}',
                })
                self.assertEqual(observed["response"]["status"], 404 if mode else 200)
                followup = lab.request(server.server_address[1], {
                    "method": "GET", "path": "/reports/202", "token": "lab-bruno-only",
                })
                self.assertEqual(json.loads(followup["response"]["body"])["title"],
                                 "Informe sintético B" if mode else "Untrusted header")

    def test_published_policy_comparison_is_extracted_from_executed_source(self):
        comparison = access_control_diff(ROOT)
        for name in ("can_access_vulnerable", "can_access_fixed"):
            self.assertIn("def " + name + "(item, identity):", comparison)
        self.assertIn('-    return item is not None\n', comparison)
        self.assertIn('+    return item is not None and item["owner"] == identity\n', comparison)

    def test_case_publishes_every_real_exchange_in_native_disclosures(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            shutil.copytree(LAB, root / "content/labs/http-access", ignore=shutil.ignore_patterns("__pycache__"))
            rendered = []
            build_case(lambda *args, **kwargs: rendered.append(args[3]),
                       lambda *args, **kwargs: '<h1>HTTP lab</h1>',
                       lambda *args, **kwargs: None, root)
            tree = html.fromstring(rendered[0])
            entries = tree.xpath('//details[@data-http-scenario]')
            self.assertEqual(len(entries), len(self.evidence["results"]))
            ids = tree.xpath('//@id')
            self.assertEqual(len(ids), len(set(ids)))
            for link in tree.xpath('//a[starts-with(@href,"#")]/@href'):
                self.assertIn(link[1:], ids)
            total = 0
            for entry, row in zip(entries, self.evidence["results"]):
                self.assertEqual(entry.get("data-http-scenario"), row["id"])
                self.assertTrue(entry.xpath('./summary'))
                for mode, block in zip(("vulnerable", "fixed"), entry.xpath('.//pre/code')):
                    text = block.text_content()
                    for step in row[mode]["trace"]:
                        self.assertIn(f'{step["request"]["method"]} {step["request"]["path"]}', text)
                        self.assertIn(f'Estado HTTP observado: {step["response"]["status"]}', text)
                        self.assertIn(step["response"]["body"], text)
                        total += 1
            self.assertEqual(total, self.evidence["summary"]["http_exchanges"])

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
