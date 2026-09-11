"""Predeclare a bounded retry of costly pairs censored by the discovery cap."""

import argparse
import hashlib
import importlib.util
import json
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "pairer", Path(__file__).with_name("pair-persistent.py")
)
pairer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pairer)


def select(report):
    if any(
        report[f"{engine}_review"].get("declared_samples") != 1
        for engine in ("pari", "hecke")
    ):
        raise ValueError("rescue policy requires declared single-sample runs")
    selected = {"pari": [], "hecke": []}
    seen = set()
    for row in report["rows"]:
        if row["status"] != "censored-or-missing":
            continue
        for engine, other in (("pari", "hecke"), ("hecke", "pari")):
            failed, completed = row.get(engine), row.get(other)
            if (
                not failed
                or not completed
                or failed["status"] != "timeout"
                or completed["status"] != "ok"
            ):
                continue
            if (
                failed["cap_seconds"] != 60
                or completed["bits"] != 200
                or failed["bits"] != 200
                or failed["iterations"] != 1
                or completed["iterations"] != 1
                or int(completed["worker_nanoseconds"]) < 10**10
            ):
                continue
            if failed["coefficients"] != completed["coefficients"]:
                raise ValueError("different presentations")
            for result in (failed, completed):
                controls = result.get("controls")
                if (
                    result.get("sample") != 1
                    or not isinstance(controls, dict)
                    or not controls.get("hostname")
                    or controls.get("affinity") != [2]
                    or controls.get("memory_max") != 4294967296
                    or controls.get("swap_max") != 0
                    or result.get("proof_policy") != "conditional-grh"
                    or result.get("producer_boundary")
                    != "persistent-process-fresh-field-not-proven-warm-JIT"
                ):
                    raise ValueError("invalid rescue measurement contract")
            if failed["controls"] != completed["controls"]:
                # Per-run cgroup paths differ; host and actual limits must not.
                keys = ("hostname", "affinity", "memory_max", "swap_max")
                if any(
                    failed["controls"].get(k) != completed["controls"].get(k)
                    for k in keys
                ):
                    raise ValueError("different measurement controls")
            key = (engine, row["label"])
            if key in seen:
                raise ValueError(
                    "multiple samples require an explicit selection policy"
                )
            seen.add(key)
            selected[engine].append(
                {"label": row["label"], "coefficients": failed["coefficients"]}
            )
    if sum(map(len, selected.values())) > 32:
        raise ValueError("rescue batch exceeds predeclared 32-request ceiling")
    return selected


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pari", type=Path)
    parser.add_argument("hecke", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    report = pairer.pair(
        pairer.review.summarize(args.pari), pairer.review.summarize(args.hecke)
    )
    selected = select(report)
    args.output.mkdir(exist_ok=False)
    for engine, records in selected.items():
        (args.output / f"{engine}.json").write_text(
            json.dumps(records, indent=2) + "\n"
        )
    policy = {
        "schema": "sagejs.general-frontier-cap-rescue.v1",
        "request_cap_seconds": 600,
        "trigger": "60-second timeout with other engine completed in at least 10 worker seconds",
        "selection_uses_sagejs_results": False,
        "qualification_evidence": False,
        "preserve_original_timeouts": True,
        "maximum_requests": 32,
        "worst_case_request_wall_seconds": 600 * sum(map(len, selected.values())),
        "producer_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "paired_report": report,
        "selected": selected,
    }
    (args.output / "policy.json").write_text(
        json.dumps(policy, indent=2, sort_keys=True) + "\n"
    )
    print(json.dumps({engine: len(records) for engine, records in selected.items()}))
