"""Reconcile exactly one predeclared 60-to-600-second reference rescue offline."""

import argparse
import copy
import hashlib
import importlib.util
import json
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "rescue", Path(__file__).resolve().parents[1] / "runner/prepare-cap-rescue.py"
)
rescue = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rescue)
pairer = rescue.pairer
ENGINES = ("pari", "hecke")
CONTROL_KEYS = ("hostname", "affinity", "memory_max", "swap_max")


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def snapshot(directory):
    """Pin every raw JSON receipt, including startup/warmup/failure history."""
    directory = Path(directory).resolve()
    files = {}
    for path in sorted(directory.iterdir()):
        if path.is_symlink() or not path.is_file() or path.suffix != ".json":
            raise ValueError("unexpected raw-directory member")
        files[path.name] = sha(path.read_bytes())
    if "run.json" not in files:
        raise ValueError("missing run registration")
    return {"directory": str(directory), "files_sha256": files}


def validate_review(report, engine, cap):
    """Enforce the rescue contract also on failures, not only successful pairs."""
    if (
        report["engine"] != engine
        or report["bits"] != 200
        or report["iterations"] != 1
        or report["declared_samples"] != 1
        or report["seed"] != 1
        or report["qualification_evidence"] is not False
        or report["independent_replay"] is not False
        or report["missing_samples"]
        or report["missing_labels"]
    ):
        raise ValueError("incomplete or mismatched rescue run")
    for row in report["rows"]:
        c = row.get("controls")
        if (
            row["engine"] != engine
            or row["sample"] != 1
            or row["bits"] != 200
            or row["iterations"] != 1
            or row.get("cap_seconds") != cap
            or not isinstance(c, dict)
            or not c.get("hostname")
            or c.get("affinity") != [2]
            or c.get("memory_max") != 4294967296
            or c.get("swap_max") != 0
            or row.get("proof_policy") != "conditional-grh"
            or row.get("producer_boundary")
            != "persistent-process-fresh-field-not-proven-warm-JIT"
        ):
            raise ValueError("mismatched sample measurement contract")


def reconcile(pari, hecke, policy_directory, retries):
    """Return an ordinary discovery pair plus an explicit immutable attempt chain.

    `retries` maps engines with nonempty selections to one designated raw directory.
    There is no attempt search, best-of selection, retry execution or CAS access.
    """
    original_dirs = {"pari": Path(pari), "hecke": Path(hecke)}
    policy_directory = Path(policy_directory)
    policy_paths = [
        policy_directory / name for name in ("policy.json", "pari.json", "hecke.json")
    ]
    policy_raw = {p.name: p.read_bytes() for p in policy_paths}
    policy = json.loads(policy_raw["policy.json"])
    snapshots = {f"original-{e}": snapshot(d) for e, d in original_dirs.items()}
    originals = {e: pairer.review.summarize(d) for e, d in original_dirs.items()}
    for e in ENGINES:
        validate_review(originals[e], e, 60)
    report = pairer.pair(originals["pari"], originals["hecke"])
    selected = rescue.select(report)
    expected_policy = {
        "schema": "sagejs.general-frontier-cap-rescue.v1",
        "request_cap_seconds": 600,
        "trigger": "60-second timeout with other engine completed in at least 10 worker seconds",
        "selection_uses_sagejs_results": False,
        "qualification_evidence": False,
        "preserve_original_timeouts": True,
        "maximum_requests": 32,
        "worst_case_request_wall_seconds": 600 * sum(map(len, selected.values())),
        "producer_sha256": sha(Path(rescue.__file__).read_bytes()),
        "paired_report": report,
        "selected": selected,
    }
    if policy != expected_policy:
        raise ValueError("policy differs from exact original replay and selection")
    for e in ENGINES:
        if json.loads(policy_raw[f"{e}.json"]) != selected[e]:
            raise ValueError("changed designated rescue input")
    if set(retries) != {e for e in ENGINES if selected[e]}:
        raise ValueError(
            "exactly one retry directory required per nonempty engine selection"
        )
    all_dirs = list(original_dirs.values()) + [Path(d) for d in retries.values()]
    if len({d.resolve() for d in all_dirs}) != len(all_dirs):
        raise ValueError("attempt directories must be distinct")
    effective = copy.deepcopy(originals)
    retry_reviews = {}
    histories = []
    for e, directory in retries.items():
        directory = Path(directory)
        snapshots[f"retry-{e}"] = snapshot(directory)
        retry = pairer.review.summarize(directory)
        validate_review(retry, e, 600)
        run = json.loads((directory / "run.json").read_bytes())
        if run["records"] != selected[e]:
            raise ValueError("retry run does not match ordered designated inputs")
        if retry["provenance"].get("input_sha256") != sha(policy_raw[f"{e}.json"]):
            raise ValueError("retry run did not bind exact predeclared input bytes")
        runtime = lambda r: {
            k: v for k, v in r["provenance"].items() if k != "input_sha256"
        }
        if runtime(retry) != runtime(originals[e]):
            raise ValueError("retry runtime/source provenance differs")
        for key in ("reviewer_sha256", "validator_sha256", "shared_validator_sha256"):
            if retry[key] != originals[e][key]:
                raise ValueError("different review implementation")
        original_rows = {r["label"]: r for r in originals[e]["rows"]}
        replacement = {r["label"]: r for r in retry["rows"]}
        if set(replacement) != {r["label"] for r in selected[e]}:
            raise ValueError("extra or missing retry outcomes")
        for label, new in replacement.items():
            old = original_rows[label]
            if old["status"] != "timeout" or old["cap_seconds"] != 60:
                raise ValueError("only an original 60-second timeout may be replaced")
            if old["coefficients"] != new["coefficients"] or any(
                old["controls"].get(k) != new["controls"].get(k) for k in CONTROL_KEYS
            ):
                raise ValueError("changed retry polynomial or host/controls")
            histories.append(
                {
                    "engine": e,
                    "label": label,
                    "sample": 1,
                    "selection": "designated-cap-rescue-not-fastest-attempt",
                    "original": old,
                    "retry": new,
                }
            )
        effective[e]["rows"] = [
            replacement.get(r["label"], r) for r in originals[e]["rows"]
        ]
        effective[e]["reconciliation"] = {
            "synthetic_review": True,
            "original_run_sha256": originals[e]["run_sha256"],
            "retry_run_sha256": retry["run_sha256"],
            "note": "Original run/provenance identify the baseline; each replaced row belongs to the explicit retry history, not that original run.",
        }
        retry_reviews[e] = retry
    result = pairer.pair(effective["pari"], effective["hecke"])
    result["attempt_reconciliation"] = {
        "schema": "sagejs.general-frontier-cap-rescue-reconciliation.v1",
        "reconciler_sha256": sha(Path(__file__).read_bytes()),
        "policy_files_sha256": {name: sha(raw) for name, raw in policy_raw.items()},
        "policy_directory": str(policy_directory.resolve()),
        "raw_attempts": snapshots,
        "original_paired_report": report,
        "retry_reviews": retry_reviews,
        "histories": histories,
        "qualification_evidence": False,
        "independent_replay": False,
        "predeclaration_chronology": "Policy content and exact designated input hashes are checked; historical creation time is not authenticated by this offline tool.",
    }
    # Refuse a concurrently changing source rather than publishing a mixed snapshot.
    if any(snapshot(s["directory"]) != s for s in snapshots.values()) or any(
        p.read_bytes() != policy_raw[p.name] for p in policy_paths
    ):
        raise ValueError("inputs changed during reconciliation")
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pari-original", type=Path, required=True)
    parser.add_argument("--hecke-original", type=Path, required=True)
    parser.add_argument("--policy-directory", type=Path, required=True)
    parser.add_argument("--pari-retry", type=Path)
    parser.add_argument("--hecke-retry", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    retries = {
        e: getattr(args, f"{e}_retry")
        for e in ENGINES
        if getattr(args, f"{e}_retry") is not None
    }
    directories = [
        args.pari_original,
        args.hecke_original,
        args.policy_directory,
        *retries.values(),
    ]
    if any(args.output.resolve().is_relative_to(d.resolve()) for d in directories):
        raise ValueError("output must be outside immutable input directories")
    result = reconcile(
        args.pari_original, args.hecke_original, args.policy_directory, retries
    )
    with args.output.open("x", encoding="utf8") as output:
        json.dump(result, output, sort_keys=True, indent=2)
        output.write("\n")


if __name__ == "__main__":
    main()
