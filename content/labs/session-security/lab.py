#!/usr/bin/env python3
"""Synthetic session lifecycle lab; real HTTP is restricted to IPv4 loopback.

Default: execute recorded fixtures with a controlled clock. --serve: interactive
API with elapsed monotonic time. Public fixture tokens/passwords are deliberately
predictable; this teaching server is not a production authentication library.
"""
from __future__ import annotations

import argparse
from contextlib import contextmanager
import hashlib
from http.client import HTTPConnection
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import re
import sys
from threading import RLock, Thread
import time
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent
HEADERS = ("Content-Type", "Content-Length", "Cache-Control", "X-Content-Type-Options", "Allow")
TTL = 60


def json_bytes(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


class Clock:
    def __init__(self, realtime=False):
        self.realtime, self.start, self.elapsed = realtime, time.monotonic(), 0

    def now(self):
        return time.monotonic() - self.start if self.realtime else self.elapsed

    def advance(self, seconds):
        if self.realtime or type(seconds) is not int or seconds < 0:
            raise ValueError("Only the local fixture runner can advance its controlled clock")
        self.elapsed += seconds


def valid_vulnerable(session, user, now):
    return session is not None


def valid_fixed(session, user, now):
    return (session is not None and not session["revoked"]
            and session["generation"] == user["generation"]
            and now < session["expires_at"])


class State:
    def __init__(self, fixed, realtime=False):
        self.fixed, self.clock, self.lock = fixed, Clock(realtime), RLock()
        self.users = {name: {"password": f"demo-{name}-initial", "generation": 0}
                      for name in ("alice", "bruno")}
        self.sessions = {}
        self.serial = 0
        for owner in self.users:
            for device in ("laptop", "phone"):
                self.sessions[f"lab-{owner}-{device}"] = {
                    "id": f"{owner}-{device}", "owner": owner, "generation": 0,
                    "expires_at": TTL, "revoked": False,
                }

    def authenticate(self, token):
        session = self.sessions.get(token)
        user = self.users[session["owner"]] if session else None
        policy = valid_fixed if self.fixed else valid_vulnerable
        return session if policy(session, user, self.clock.now()) else None


def make_handler(state):
    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.0"

        def log_message(self, *_args):
            pass

        def respond(self, status, body, allow=None):
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

        def body(self, keys):
            lengths = self.headers.get_all("Content-Length", [])
            if self.headers.get("Transfer-Encoding") or len(lengths) != 1 or not lengths[0].isdigit():
                raise ValueError("body")
            length = int(lengths[0])
            if not 0 < length <= 1024:
                raise ValueError("body")
            parsed = json.loads(self.rfile.read(length).decode("utf-8"))
            if not isinstance(parsed, dict) or set(parsed) != set(keys):
                raise ValueError("body")
            if any(not isinstance(value, str) or not 1 <= len(value) <= 100 for value in parsed.values()):
                raise ValueError("body")
            return parsed

        def handle_request(self):
            # Authentication and mutation share one lock: another request cannot
            # revoke/change a generation between this check and its protected action.
            with state.lock:
                try:
                    return self.dispatch()
                except (ValueError, UnicodeDecodeError):
                    return self.respond(400, {"error": "invalid_body"})

        def dispatch(self):
            parsed = urlsplit(self.path)
            if parsed.query:
                return self.respond(400, {"error": "query_not_supported"})
            path = parsed.path
            if path == "/login":
                if self.command != "POST":
                    return self.respond(405, {"error": "method_not_allowed"}, "POST")
                body = self.body(("user", "password"))
                user = state.users.get(body["user"])
                if user is None or body["password"] != user["password"]:
                    return self.respond(401, {"error": "unauthorized"})
                state.serial += 1
                token = f'lab-{body["user"]}-issued-{state.serial}'
                session_id = f'{body["user"]}-new-{state.serial}'
                state.sessions[token] = {"id": session_id, "owner": body["user"],
                    "generation": user["generation"], "expires_at": state.clock.now() + TTL, "revoked": False}
                return self.respond(200, {"token": token, "session_id": session_id, "ttl_seconds": TTL})
            authorization = self.headers.get_all("Authorization", [])
            if len(authorization) != 1 or not authorization[0].startswith("Bearer "):
                return self.respond(401, {"error": "unauthorized"})
            session = state.authenticate(authorization[0][7:])
            if session is None:
                return self.respond(401, {"error": "unauthorized"})
            owner = session["owner"]
            if path == "/me":
                if self.command != "GET":
                    return self.respond(405, {"error": "method_not_allowed"}, "GET")
                return self.respond(200, {"identity": owner, "marker": f"SYNTHETIC_{owner.upper()}"})
            revocation = re.fullmatch(r"/sessions/([a-z0-9-]{1,40})/revoke", path)
            if path not in ("/logout", "/password") and not revocation:
                return self.respond(404, {"error": "not_found"})
            if self.command != "POST":
                return self.respond(405, {"error": "method_not_allowed"}, "POST")
            if path == "/password":
                body = self.body(("current_password", "new_password"))
                user = state.users[owner]
                if user["password"] != body["current_password"]:
                    return self.respond(403, {"error": "current_password_mismatch"})
                if body["current_password"] == body["new_password"]:
                    return self.respond(400, {"error": "password_unchanged"})
                user["password"] = body["new_password"]
                user["generation"] += 1
                return self.respond(200, {"changed": True, "scope": "all_sessions_of_current_identity"})
            self.body(())
            if path == "/logout":
                session["revoked"] = True
                return self.respond(200, {"signed_out": True})
            target = next((item for item in state.sessions.values() if item["id"] == revocation[1]), None)
            if target is None or target["owner"] != owner:
                return self.respond(404, {"error": "not_found"})
            target["revoked"] = True
            return self.respond(200, {"revoked_session": target["id"]})

        do_GET = handle_request
        do_POST = handle_request
        do_PATCH = handle_request
        do_DELETE = handle_request

    return Handler


@contextmanager
def running_server(fixed=True, port=0, realtime=False):
    state = State(fixed, realtime)
    server = ThreadingHTTPServer(("127.0.0.1", port), make_handler(state))
    server.daemon_threads = True
    thread = Thread(target=server.serve_forever, kwargs={"poll_interval": 0.01}, daemon=True)
    thread.start()
    try:
        yield server, state
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


def request(port, step):
    headers = list(step.get("headers", []))
    if step.get("token"):
        headers.insert(0, ["Authorization", "Bearer " + step["token"]])
    body = step.get("body", "").encode("utf-8")
    if "body" in step:
        headers += [["Content-Type", "application/json"], ["Content-Length", str(len(body))]]
    connection = HTTPConnection("127.0.0.1", port, timeout=3)
    try:
        connection.putrequest(step["method"], step["path"])
        for name, value in headers:
            connection.putheader(name, value)
        connection.endheaders(body)
        response = connection.getresponse()
        payload = response.read(4097)
        if len(payload) > 4096:
            raise ValueError("Unexpected laboratory response size")
        return {"request": {"method": step["method"], "path": step["path"], "headers": headers, "body": body.decode("utf-8")},
                "response": {"status": response.status, "headers": {name: response.getheader(name) for name in HEADERS if response.getheader(name) is not None},
                             "body": payload.decode("utf-8"), "body_sha256": hashlib.sha256(payload).hexdigest()}}
    finally:
        connection.close()


def run():
    fixtures = json.loads((ROOT / "fixtures.json").read_text(encoding="utf-8"))
    results = []
    for scenario in fixtures["scenarios"]:
        modes = {}
        for mode in ("vulnerable", "fixed"):
            trace = []
            with running_server(fixed=mode == "fixed") as (server, state):
                for step in scenario["steps"]:
                    state.clock.advance(step.get("advance_seconds", 0))
                    observed = request(server.server_address[1], step)
                    expected = step["expected"][mode]
                    observed.update({"clock_seconds": state.clock.now(), "expected": expected})
                    response = observed["response"]
                    observed["passed"] = (response["status"] == expected["status"]
                        and response["body"] == json_bytes(expected["body"]).decode("utf-8")
                        and response["headers"].get("Cache-Control") == "no-store")
                    trace.append(observed)
            modes[mode] = {"passed": all(item["passed"] for item in trace), "trace": trace}
        results.append({"id": scenario["id"], "label_es": scenario["label_es"], **modes})
    checks = [step["passed"] for row in results for mode in ("vulnerable", "fixed") for step in row[mode]["trace"]]
    return {"schema_version": 1, "lab_version": "1.0.0", "transport": "observed_http_over_ipv4_loopback",
            "data": "synthetic", "external_targets": False, "identities": ["alice", "bruno"],
            "clock": "Controlled elapsed seconds advanced in-process only; expiry checks send real HTTP but do not measure wall-clock delay.",
            "normalization": "Ephemeral port, Host, Date and Server omitted; complete response bodies and application headers captured from HTTP.",
            "source_sha256": {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in ("lab.py", "fixtures.json")},
            "summary": {"scenarios": len(results), "modes": 2, "http_exchanges": len(checks), "passed": sum(checks), "failed": len(checks) - sum(checks)},
            "results": results}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    action = parser.add_mutually_exclusive_group()
    action.add_argument("--verify", type=Path, metavar="JSON")
    action.add_argument("--write", type=Path, metavar="JSON")
    action.add_argument("--serve", choices=("fixed", "vulnerable"))
    parser.add_argument("--port", type=int, default=8766)
    args = parser.parse_args()
    if args.serve:
        if not 1024 <= args.port <= 65535:
            parser.error("Choose an unprivileged loopback port from 1024 to 65535")
        with running_server(args.serve == "fixed", args.port, realtime=True):
            print(f"Synthetic {args.serve} API: http://127.0.0.1:{args.port}; TTL 60s; Ctrl+C to stop", flush=True)
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
