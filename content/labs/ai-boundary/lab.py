#!/usr/bin/env python3
"""Deterministic tool-authorization lab. Standard library, no network or LLM.

The adapter deliberately converts <tool-call> blocks from an untrusted retrieved
document into proposed calls. This models an already-compromised planning step;
it does NOT measure a real model's prompt-injection susceptibility.

Only the optional --write flag writes a file (the JSON evidence report). Tools
read and mutate a fresh, synthetic in-memory store for each scenario and mode.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parent
STORE = {
    ("lab", "public-guide"): {"text": "PUBLIC: approved laboratory guide", "sensitive": False},
    ("lab", "admin-note"): {"text": "SYNTHETIC_PRIVATE_LAB_73", "sensitive": True},
    ("branch", "payroll"): {"text": "SYNTHETIC_PRIVATE_BRANCH_91", "sensitive": True},
}


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def adapter(document: str) -> list[object]:
    """Scripted model substitute: explicit markup, not language understanding."""
    proposals = []
    for payload in re.findall(r"<tool-call>(.*?)</tool-call>", document, re.DOTALL):
        try:
            proposals.append(json.loads(payload))
        except (ValueError, TypeError):
            proposals.append(None)
    return proposals


def validate(proposal: object, session: dict, used: int) -> str | None:
    """Trusted gateway: authorization is checked for every call, before dispatch."""
    if not session["active"]:
        return "session_revoked"
    if not isinstance(proposal, dict) or set(proposal) != {"tool", "arguments"}:
        return "invalid_schema"
    if proposal["tool"] != "read_document":
        return "tool_not_allowed"
    args = proposal["arguments"]
    if not isinstance(args, dict) or set(args) != {"tenant", "document_id"}:
        return "invalid_schema"
    if any(not isinstance(value, str) or not 1 <= len(value) <= 80 for value in args.values()):
        return "invalid_schema"
    if args["tenant"] != session["tenant"]:
        return "tenant_mismatch"
    if args["document_id"] not in session["read_grants"]:
        return "document_not_granted"
    if used >= session["max_calls"]:
        return "budget_exceeded"
    return None


def dispatch(proposal: object, store: dict) -> dict:
    """Same memory-only tool implementation in vulnerable and fixed modes."""
    if not isinstance(proposal, dict):
        return {"status": "denied", "reason": "invalid_schema"}
    tool, args = proposal.get("tool"), proposal.get("arguments")
    if not isinstance(args, dict):
        return {"status": "denied", "reason": "invalid_schema"}
    if tool not in ("read_document", "write_document"):
        return {"status": "denied", "reason": "unknown_tool"}
    if not all(isinstance(args.get(field), str) for field in ("tenant", "document_id")):
        return {"status": "denied", "reason": "invalid_schema"}
    key = (args["tenant"], args["document_id"])
    if key not in store:
        return {"status": "denied", "reason": "not_found"}
    if tool == "read_document":
        return {"status": "executed", "operation": "read", "data": store[key]["text"],
                "sensitive": store[key]["sensitive"]}
    if not isinstance(args.get("text"), str):
        return {"status": "denied", "reason": "invalid_schema"}
    store[key]["text"] = args["text"]
    return {"status": "executed", "operation": "write"}


def run_scenario(scenario: dict, fixed: bool) -> dict:
    store = copy.deepcopy(STORE)
    # Session and grants originate outside the retrieved document / model output.
    session = {"tenant": "lab", "read_grants": ["public-guide"], "max_calls": 2, "active": True}
    session.update(scenario.get("trusted_session", {}))
    trace, used = [], 0
    for index, proposal in enumerate(adapter(scenario["retrieved_document"])):
        if scenario.get("revoke_before_call") == index:
            session["active"] = False
        reason = validate(proposal, session, used) if fixed else None
        if reason:
            outcome = {"status": "denied", "reason": reason}
        else:
            # The budget counts admitted dispatches, even if the tool fails.
            used += 1
            outcome = dispatch(proposal, store)
        trace.append({"call": index + 1, "proposal": proposal, "outcome": outcome})
    actual = {
        "reads": sum(t["outcome"].get("operation") == "read" for t in trace),
        "writes": sum(t["outcome"].get("operation") == "write" for t in trace),
        "sensitive_data_returned": any(t["outcome"].get("sensitive", False) for t in trace),
        "denied_reasons": [t["outcome"]["reason"] for t in trace if t["outcome"]["status"] == "denied"],
        "store_changed": store != STORE,
    }
    expected = scenario["expected"]["fixed" if fixed else "vulnerable"]
    return {"actual": actual, "expected": expected, "passed": actual == expected, "trace": trace}


def run() -> dict:
    fixture_path = ROOT / "fixtures.json"
    fixture = json.loads(fixture_path.read_text(encoding="utf-8"))
    results = [{"id": scenario["id"], "label_es": scenario["label_es"], "category": scenario["category"],
                "vulnerable": run_scenario(scenario, False), "fixed": run_scenario(scenario, True)}
               for scenario in fixture["scenarios"]]
    checks = [result[mode]["passed"] for result in results for mode in ("vulnerable", "fixed")]
    return {
        "schema_version": 1, "lab_version": "1.0.0",
        "method": "deterministic_tool_boundary_simulator",
        "actual_language_model_used": False, "external_targets": False,
        "evidence_kind": "observed_local_execution_against_synthetic_in_memory_data",
        "source_sha256": {"lab.py": digest(Path(__file__)), "fixtures.json": digest(fixture_path)},
        "summary": {"scenarios": len(results), "checks": len(checks), "passed": sum(checks),
                    "failed": len(checks) - sum(checks)},
        "results": results,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    output = parser.add_mutually_exclusive_group()
    output.add_argument("--write", type=Path, metavar="JSON", help="write reproducible evidence JSON")
    output.add_argument("--verify", type=Path, metavar="JSON", help="rerun and compare complete recorded evidence")
    args = parser.parse_args()
    report = run()
    if args.verify:
        try:
            recorded = json.loads(args.verify.read_text(encoding="utf-8"))
        except (OSError, ValueError) as error:
            print(f"Cannot read recorded evidence: {error}", file=sys.stderr)
            return 2
        if recorded != report:
            print("FAIL: execution differs from recorded evidence", file=sys.stderr)
            return 1
        print(f"PASS: {report['summary']['passed']}/{report['summary']['checks']} checks; complete evidence identical")
    elif args.write:
        args.write.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Wrote {args.write}: {report['summary']}")
    else:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    return int(report["summary"]["failed"] != 0)


if __name__ == "__main__":
    raise SystemExit(main())
