"""Validate one explicitly identified Hecke mislaunch correction; never execute it."""

import argparse
from decimal import Decimal
import importlib.util
import json
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "reconcile", Path(__file__).with_name("reconcile.py")
)
reconcile = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reconcile)
POLICY_SHA256 = "fbbf94e50ca6bed7ae7000711eb553df355992b333836df288339671cf94d025"
FRESH_NAME = "persistent-hecke-cap-rescue-v2-attempt-2"
ABORT_NAME = "persistent-hecke-cap-rescue-v2-attempt-1"
SUFFIXES = ("/reference/persistent/supervisor.py", "/reference/runner/screen-batch.py")


def evidence(policy_directory, aborted_directory, ledger_before, ledger_after):
    """Reconstruct the fixed incident's evidence without promoting aborted data.

    The exact original policy is pinned, not rewritten. Raw aborted successes
    are custody only: no worker answer from this directory can become eligible.
    """
    policy_directory, aborted_directory = (
        Path(policy_directory),
        Path(aborted_directory),
    )
    if aborted_directory.name != ABORT_NAME:
        raise ValueError("wrong designated aborted directory")
    policy_raw = (policy_directory / "policy.json").read_bytes()
    if reconcile.sha(policy_raw) != POLICY_SHA256:
        raise ValueError("not the pinned original cap-rescue-v2 policy")
    policy = json.loads(policy_raw)
    selected = reconcile.rescue.select(policy["paired_report"])
    if selected != policy["selected"] or len(selected["hecke"]) != 5:
        raise ValueError("changed original selection")
    inputs = (policy_directory / "hecke.json").read_bytes()
    if json.loads(inputs) != selected["hecke"]:
        raise ValueError("changed ordered input")
    snapshot = reconcile.snapshot(aborted_directory)
    run = json.loads((aborted_directory / "run.json").read_bytes())
    expected = dict(policy["paired_report"]["hecke_review"]["provenance"])
    expected["input_sha256"] = reconcile.sha(inputs)
    wrong = dict(expected)
    wrong["sha256"] = dict(expected["sha256"])
    pari_hashes = policy["paired_report"]["pari_review"]["provenance"]["sha256"]
    for suffix in SUFFIXES:
        keys = [k for k in wrong["sha256"] if k.endswith(suffix)]
        if len(keys) != 1 or keys[0] not in pari_hashes:
            raise ValueError("missing exact harness identity")
        key = keys[0]
        if wrong["sha256"][key] == pari_hashes[key]:
            raise ValueError("incident requires engine-specific harness mismatch")
        wrong["sha256"][key] = pari_hashes[key]
    if (
        run.get("engine") != "hecke"
        or run.get("bits") != 200
        or run.get("iterations", 1) != 1
        or run.get("samples", 1) != 1
        or run.get("seed", 1) != 1
        or run.get("qualification_evidence") is not False
        or run["records"] != selected["hecke"]
        or run["provenance"] != wrong
    ):
        raise ValueError("aborted run is not the identified wrong-harness incident")
    receipts = {}
    for name in snapshot["files_sha256"]:
        if name == "run.json":
            continue
        r = json.loads((aborted_directory / name).read_bytes())
        if (
            r.get("schema") != "sagejs.general-frontier-persistent-screen.v1"
            or r.get("engine") != "hecke"
            or r.get("provenance") != wrong
            or r.get("qualification_evidence") is not False
        ):
            raise ValueError("changed aborted receipt identity")
        receipts[name] = r
    samples = {n: r for n, r in receipts.items() if r.get("stage") == "sample"}
    first, second = [r["label"] for r in selected["hecke"][:2]]
    if set(samples) != {f"sample-{first}.json", f"sample-{second}.json"}:
        raise ValueError("unexpected, missing or extra aborted sample")
    completed, interrupted = (
        samples[f"sample-{first}.json"],
        samples[f"sample-{second}.json"],
    )
    if (
        completed.get("status") != "ok"
        or completed.get("record") != selected["hecke"][0]
        or completed.get("cap_seconds") != 600
        or interrupted.get("status") != "interrupted"
    ):
        raise ValueError("unexpected incident terminal states")
    before_raw, after_raw = (
        Path(ledger_before).read_bytes(),
        Path(ledger_after).read_bytes(),
    )
    before = json.loads(before_raw, parse_float=Decimal)
    after = json.loads(after_raw, parse_float=Decimal)
    pending = before["pending"]
    if (
        before["schema"] != "sagejs.general-frontier-conservative-cpu-ledger.v1"
        or before.get("limit_seconds") != 432000
        or pending != interrupted.get("pending_reservation")
        or pending["label"] != f"sample-{second}"
        or pending["stage"] != "sample"
        or pending["reserved_seconds"] != 610
        or Path(pending["output"]).name != f"sample-{second}.json"
    ):
        raise ValueError("interruption does not bind the pending reservation")
    history = after.get("interruption_reconciliations", [])
    old_history = before.get("interruption_reconciliations", [])
    if len(history) != len(old_history) + 1 or history[:-1] != old_history:
        raise ValueError("changed ledger correction history")
    entry = history[-1]
    if (
        entry.get("id") != "hecke-cap-rescue-v2-wrong-harness-abort"
        or entry.get("previous_ledger_sha256") != reconcile.sha(before_raw)
        or entry.get("charged_reserved_seconds") != 610
        or entry.get("interrupted_label") != pending["label"]
        or not isinstance(entry.get("reason"), str)
        or not entry["reason"]
    ):
        raise ValueError("missing exact charge evidence")
    wanted = dict(
        before,
        pending=None,
        charged_seconds=before["charged_seconds"] + 610,
        interruption_reconciliations=history,
    )
    if after != wanted or not 0 <= after["charged_seconds"] <= after["limit_seconds"]:
        raise ValueError("reservation not fully charged or unrelated ledger changes")
    result = {
        "schema": "sagejs.general-frontier-hecke-mislaunch-correction.v1",
        "reason": "engine-specific execution harness mismatch; not timing-based selection",
        "original_policy_sha256": POLICY_SHA256,
        "input_sha256": reconcile.sha(inputs),
        "selected": selected["hecke"],
        "aborted_raw_snapshot": snapshot,
        "aborted_execution_provenance": wrong,
        "aborted_rows_eligible": False,
        "ledger_before_sha256": reconcile.sha(before_raw),
        "ledger_after_sha256": reconcile.sha(after_raw),
        "charged_pending_seconds": 610,
        "designated_fresh_attempt": FRESH_NAME,
        "expected_fresh_execution_provenance": expected,
        "fresh_request": {
            "bits": 200,
            "iterations": 1,
            "samples": 1,
            "seed": 1,
            "cap_seconds": 600,
            "proof_policy": "conditional-grh",
            "producer_boundary": "persistent-process-fresh-field-not-proven-warm-JIT",
            "controls": {
                key: next(
                    row["hecke"]["controls"][key]
                    for row in policy["paired_report"]["rows"]
                    if row["label"] == first
                )
                for key in reconcile.CONTROL_KEYS
            },
            "redo_all_selected_in_original_order": True,
        },
        "qualification_evidence": False,
        "independent_replay": False,
        "execution_authorized_by_this_artifact": False,
        "strict_reconciler_accepts_aborted_attempt": False,
        "custody_obligations": "Coordinator must attest process exit and pre-execution approval; these are not proven by offline hashes. Preserve raw files and both ledgers. Prior completed-request accounting remains in the pre-ledger, not independently reconstructed here.",
    }
    if (
        reconcile.snapshot(aborted_directory) != snapshot
        or (policy_directory / "policy.json").read_bytes() != policy_raw
        or (policy_directory / "hecke.json").read_bytes() != inputs
        or Path(ledger_before).read_bytes() != before_raw
        or Path(ledger_after).read_bytes() != after_raw
    ):
        raise ValueError("custody inputs changed during validation")
    return result


def join(
    policy_directory,
    aborted_directory,
    ledger_before,
    ledger_after,
    correction,
    correction_sha256,
    pari_original,
    hecke_original,
    pari_retry,
    hecke_retry,
):
    """Strictly reconcile the fresh attempts and retain the excluded incident.

    The caller supplies the previously approved correction's byte hash. No
    directory search, selection among retries, or aborted-answer promotion occurs.
    """
    correction = Path(correction)
    raw = correction.read_bytes()
    if reconcile.sha(raw) != correction_sha256:
        raise ValueError("changed approved correction bytes")
    expected = evidence(
        policy_directory, aborted_directory, ledger_before, ledger_after
    )
    if json.loads(raw) != expected:
        raise ValueError("correction differs from retained evidence")
    fresh = Path(hecke_retry)
    if fresh.name != FRESH_NAME or fresh.resolve() == Path(aborted_directory).resolve():
        raise ValueError("wrong designated fresh attempt directory")
    fresh_snapshot = reconcile.snapshot(fresh)
    run = json.loads((fresh / "run.json").read_bytes())
    if (
        run.get("provenance") != expected["expected_fresh_execution_provenance"]
        or run.get("records") != expected["selected"]
    ):
        raise ValueError("fresh execution differs from correction")
    result = reconcile.reconcile(
        pari_original,
        hecke_original,
        policy_directory,
        {"pari": pari_retry, "hecke": fresh},
    )
    # Preserve exact text, not just normalized outcomes: interrupted and wrong-
    # harness completed receipts remain inspectable but cannot affect pairing.
    custody = {
        name: (Path(aborted_directory) / name).read_bytes().decode("utf8")
        for name in expected["aborted_raw_snapshot"]["files_sha256"]
    }
    if any(
        reconcile.sha(text.encode("utf8"))
        != expected["aborted_raw_snapshot"]["files_sha256"][name]
        for name, text in custody.items()
    ):
        raise ValueError("aborted raw history changed")
    ledger_text = {
        "before": Path(ledger_before).read_bytes().decode("utf8"),
        "after": Path(ledger_after).read_bytes().decode("utf8"),
    }
    if any(
        reconcile.sha(text.encode("utf8")) != expected[f"ledger_{key}_sha256"]
        for key, text in ledger_text.items()
    ):
        raise ValueError("ledger history changed")
    result["mislaunch_reconciliation"] = {
        "schema": "sagejs.general-frontier-hecke-mislaunch-join.v1",
        "joiner_sha256": reconcile.sha(Path(__file__).read_bytes()),
        "correction_sha256": correction_sha256,
        "correction": expected,
        "correction_raw_json": raw.decode("utf8"),
        "excluded_aborted_raw_json": custody,
        "ledger_raw_json": ledger_text,
        "aborted_rows_eligible": False,
        "qualification_evidence": False,
        "independent_replay": False,
    }
    if (
        correction.read_bytes() != raw
        or reconcile.snapshot(fresh) != fresh_snapshot
        or evidence(policy_directory, aborted_directory, ledger_before, ledger_after)
        != expected
    ):
        raise ValueError("join inputs changed during validation")
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("plan", "check", "join"))
    for name in (
        "policy-directory",
        "aborted-directory",
        "ledger-before",
        "ledger-after",
        "correction",
    ):
        parser.add_argument("--" + name, type=Path, required=True)
    for name in (
        "pari-original",
        "hecke-original",
        "pari-retry",
        "hecke-retry",
        "output",
    ):
        parser.add_argument("--" + name, type=Path)
    parser.add_argument("--correction-sha256")
    args = parser.parse_args()
    if args.command == "join":
        required = (
            "pari_original",
            "hecke_original",
            "pari_retry",
            "hecke_retry",
            "output",
            "correction_sha256",
        )
        if any(getattr(args, name) is None for name in required):
            parser.error(
                "join requires original/retry directories, output and correction SHA256"
            )
        directories = (
            args.policy_directory,
            args.aborted_directory,
            args.pari_original,
            args.hecke_original,
            args.pari_retry,
            args.hecke_retry,
        )
        if any(args.output.resolve().is_relative_to(p.resolve()) for p in directories):
            raise ValueError("output must be outside immutable input directories")
        result = join(
            args.policy_directory,
            args.aborted_directory,
            args.ledger_before,
            args.ledger_after,
            args.correction,
            args.correction_sha256,
            args.pari_original,
            args.hecke_original,
            args.pari_retry,
            args.hecke_retry,
        )
        with args.output.open("x", encoding="utf8") as target:
            json.dump(result, target, indent=2, sort_keys=True)
            target.write("\n")
        return
    result = evidence(
        args.policy_directory,
        args.aborted_directory,
        args.ledger_before,
        args.ledger_after,
    )
    if args.command == "plan":
        if any(
            args.correction.resolve().is_relative_to(p.resolve())
            for p in (args.policy_directory, args.aborted_directory)
        ):
            raise ValueError("correction must be outside immutable source directories")
        with args.correction.open("x", encoding="utf8") as target:
            json.dump(result, target, indent=2, sort_keys=True)
            target.write("\n")
    elif json.loads(args.correction.read_bytes()) != result:
        raise ValueError("correction differs from retained evidence")
    print(
        json.dumps(
            {
                "valid": True,
                "fresh_attempt": FRESH_NAME,
                "requests": 5,
                "qualification_evidence": False,
            }
        )
    )


if __name__ == "__main__":
    main()
