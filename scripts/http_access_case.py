"""Execute the loopback HTTP lab and package its verified, reproducible evidence."""
from __future__ import annotations

import hashlib
import ast
import difflib
import json
from pathlib import Path
import subprocess
import sys
import zipfile

FILES = ("lab.py", "fixtures.json", "resultados.json", "INSTRUCCIONES.txt", "Dockerfile", ".dockerignore")


def access_control_diff(root: Path) -> str:
    """Compare the two actual policies executed by the downloadable lab."""
    source = (root / "content/labs/http-access/lab.py").read_text(encoding="utf-8")
    functions = {node.name: node for node in ast.parse(source).body if isinstance(node, ast.FunctionDef)}
    snippets = [ast.get_source_segment(source, functions[name]) + "\n"
                for name in ("can_access_vulnerable", "can_access_fixed")]
    return "".join(difflib.unified_diff(
        snippets[0].splitlines(keepends=True), snippets[1].splitlines(keepends=True),
        fromfile="lab.py: política vulnerable", tofile="lab.py: política corregida",
    ))


def prepare_evidence(root: Path) -> dict:
    source = root / "content/labs/http-access"
    result = subprocess.run([sys.executable, str(source / "lab.py"), "--verify", str(source / "resultados.json")],
                            check=True, capture_output=True, text=True, timeout=30)
    if not result.stdout.startswith("PASS:"):
        raise ValueError("HTTP lab did not verify its recorded evidence")
    evidence = json.loads((source / "resultados.json").read_text(encoding="utf-8"))
    if evidence["summary"]["failed"] or evidence["transport"] != "observed_http_over_ipv4_loopback":
        raise ValueError("HTTP case differs from the executed lab")
    output = root / "dist/downloads"
    output.mkdir(parents=True, exist_ok=True)
    files = {name: (source / name).read_bytes() for name in FILES}
    files["MANIFEST.sha256"] = "".join(f"{hashlib.sha256(data).hexdigest()}  {name}\n" for name, data in sorted(files.items())).encode("utf-8")
    with zipfile.ZipFile(output / "http-access-lab.zip", "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, data in sorted(files.items()):
            info = zipfile.ZipInfo(name, date_time=(2026, 10, 10, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            archive.writestr(info, data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
    (output / "http-access-resultados.json").write_bytes(files["resultados.json"])
    return evidence
