#!/usr/bin/env python3
"""Synthetic object-authorization API and real loopback HTTP regression lab.

No remote target is accepted. The default action starts fresh ephemeral local
servers, executes all fixtures over HTTP, closes them and prints the evidence.
--serve exposes the selected demonstration API on 127.0.0.1 only.
"""
from __future__ import annotations

import argparse
import copy
from contextlib import contextmanager
import hashlib
from http.client import HTTPConnection
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import re
import sys
from threading import Thread
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent
TOKENS = {"lab-alice-only": "alice", "lab-bruno-only": "bruno"}
REPORTS = {
    "101": {"id": "101", "owner": "alice", "title": "Informe sintético A", "marker": "SYNTHETIC_ALICE_101"},
    "202": {"id": "202", "owner": "bruno", "title": "Informe sintético B", "marker": "SYNTHETIC_BRUNO_202"},
}
STABLE_HEADERS = ("Content-Type", "Content-Length", "Cache-Control", "X-Content-Type-Options", "Allow")


def json_bytes(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def make_handler(reports, fixed):
    class Handler(BaseHTTPRequestHandler):
        # Python's HTTP server is suitable for a local demonstration, not production.
        protocol_version = "HTTP/1.0"

        def log_message(self, *_args):
            pass

        def respond(self, status, body, *, allow=None):
            payload = json_bytes(body)
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            if allow:
                self.send_header("Allow", allow)
            self.end_headers()
            self.wfile.write(payload)

        def handle_request(self):
            authorization = self.headers.get_all("Authorization", [])
            if len(authorization) != 1 or not authorization[0].startswith("Bearer "):
                return self.respond(401, {"error": "unauthorized"})
            identity = TOKENS.get(authorization[0][7:])
            if not identity:
                return self.respond(401, {"error": "unauthorized"})
            parsed = urlsplit(self.path)
            match = re.fullmatch(r"/reports/([0-9]{3})", parsed.path)
            if parsed.query:
                return self.respond(400, {"error": "query_not_supported"})
            item = reports.get(match.group(1)) if match else None
            # PATCH: ownership comes from the authenticated session and stored
            # object. Never accept an owner/identity asserted by a client header.
            if item is None or (fixed and item["owner"] != identity):
                return self.respond(404, {"error": "not_found"})
            if self.command == "GET":
                return self.respond(200, item)
            if self.command != "PATCH":
                return self.respond(405, {"error": "method_not_allowed"}, allow="GET, PATCH")
            lengths = self.headers.get_all("Content-Length", [])
            if self.headers.get("Transfer-Encoding") or len(lengths) != 1 or not lengths[0].isdigit():
                return self.respond(400, {"error": "invalid_body"})
            length = int(lengths[0])
            if not 0 < length <= 1024:
                return self.respond(400, {"error": "invalid_body"})
            try:
                body = json.loads(self.rfile.read(length).decode("utf-8"))
            except (UnicodeDecodeError, ValueError):
                return self.respond(400, {"error": "invalid_body"})
            if not isinstance(body, dict) or set(body) != {"title"} or not isinstance(body["title"], str) or not 1 <= len(body["title"]) <= 100:
                return self.respond(400, {"error": "invalid_body"})
            item["title"] = body["title"]
            return self.respond(200, item)

        do_GET = handle_request
        do_PATCH = handle_request
        do_POST = handle_request
        do_DELETE = handle_request

    return Handler


@contextmanager
def running_server(fixed=True, port=0):
    reports = copy.deepcopy(REPORTS)
    server = ThreadingHTTPServer(("127.0.0.1", port), make_handler(reports, fixed))
    server.daemon_threads = True
    thread = Thread(target=server.serve_forever, kwargs={"poll_interval": 0.01}, daemon=True)
    thread.start()
    try:
        yield server
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


def request(port, step):
    headers = list(step.get("headers", []))
    token = step.get("token")
    if token:
        headers.insert(0, ["Authorization", "Bearer " + token])
    body = step.get("body", "").encode("utf-8")
    if "body" in step:
        headers += [["Content-Type", "application/json"], ["Content-Length", str(len(body))]]
    connection = HTTPConnection("127.0.0.1", port, timeout=3)
    try:
        # putheader preserves duplicate Authorization fields for its regression.
        connection.putrequest(step["method"], step["path"])
        for name, value in headers:
            connection.putheader(name, value)
        connection.endheaders(body)
        response = connection.getresponse()
        payload = response.read(4097)
        if len(payload) > 4096:
            raise ValueError("Unexpectedly large laboratory response")
        captured_headers = {name: response.getheader(name) for name in STABLE_HEADERS if response.getheader(name) is not None}
        return {
            "request": {"method": step["method"], "path": step["path"], "headers": headers, "body": body.decode("utf-8")},
            "response": {"status": response.status, "headers": captured_headers, "body": payload.decode("utf-8"),
                         "body_sha256": hashlib.sha256(payload).hexdigest()},
        }
    finally:
        connection.close()


def run():
    fixtures = json.loads((ROOT / "fixtures.json").read_text(encoding="utf-8"))
    results = []
    for scenario in fixtures["scenarios"]:
        modes = {}
        for mode in ("vulnerable", "fixed"):
            trace = []
            with running_server(fixed=mode == "fixed") as server:
                for step in scenario["steps"]:
                    observed = request(server.server_address[1], step)
                    expected = step["expected"][mode]
                    observed["expected"] = expected
                    observed["passed"] = (observed["response"]["status"] == expected["status"]
                                          and observed["response"]["body"] == json_bytes(expected["body"]).decode("utf-8")
                                          and observed["response"]["headers"].get("Cache-Control") == "no-store")
                    trace.append(observed)
            modes[mode] = {"passed": all(row["passed"] for row in trace), "trace": trace}
        results.append({"id": scenario["id"], "label_es": scenario["label_es"], **modes})
    checks = [step["passed"] for row in results for mode in ("vulnerable", "fixed") for step in row[mode]["trace"]]
    return {
        "schema_version": 1, "lab_version": "1.0.0", "transport": "observed_http_over_ipv4_loopback",
        "external_targets": False, "data": "synthetic", "identities": ["alice", "bruno"],
        "normalization": "Ephemeral port, Host, Date and Server are omitted. Request paths, application headers, statuses and complete response bodies are captured from actual HTTP exchanges.",
        "source_sha256": {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in ("lab.py", "fixtures.json")},
        "summary": {"scenarios": len(results), "modes": 2, "http_exchanges": len(checks), "passed": sum(checks), "failed": len(checks) - sum(checks)},
        "results": results,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    action = parser.add_mutually_exclusive_group()
    action.add_argument("--verify", type=Path, metavar="JSON")
    action.add_argument("--write", type=Path, metavar="JSON")
    action.add_argument("--serve", choices=("fixed", "vulnerable"))
    parser.add_argument("--port", type=int, default=8765, help="interactive --serve only; binds IPv4 loopback")
    args = parser.parse_args()
    if args.serve:
        if not 1024 <= args.port <= 65535:
            parser.error("Choose an unprivileged port from 1024 to 65535")
        with running_server(fixed=args.serve == "fixed", port=args.port):
            print(f"Synthetic {args.serve} API on http://127.0.0.1:{args.port}; Ctrl+C to stop", flush=True)
            try:
                from threading import Event
                Event().wait()
            except KeyboardInterrupt:
                pass
        return 0
    report = run()
    if args.verify:
        try:
            recorded = json.loads(args.verify.read_text(encoding="utf-8"))
        except (OSError, ValueError) as error:
            print(f"Cannot read evidence: {error}", file=sys.stderr)
            return 2
        if report != recorded:
            print("FAIL: execution differs from recorded evidence", file=sys.stderr)
            return 1
        print(f"PASS: {report['summary']['passed']}/{report['summary']['http_exchanges']} HTTP checks; complete evidence identical")
    elif args.write:
        args.write.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(report["summary"]))
    else:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    return int(report["summary"]["failed"] != 0)


if __name__ == "__main__":
    raise SystemExit(main())
