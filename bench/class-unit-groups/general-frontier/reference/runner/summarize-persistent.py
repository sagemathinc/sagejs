"""Revalidate persistent cost screens, without claiming benchmark qualification."""

import argparse
import hashlib
import importlib.util
import json
import math
from pathlib import Path


spec = importlib.util.spec_from_file_location(
    "persistent", Path(__file__).resolve().parents[1] / "persistent/supervisor.py"
)
persistent = importlib.util.module_from_spec(spec)
spec.loader.exec_module(persistent)


def normalize(receipt):
    record = receipt["record"]
    label, coefficients = persistent.shared.validate_case(record)
    engine = receipt["engine"]
    if engine not in ("pari", "hecke"):
        raise ValueError("unknown engine")
    identity_fields = {"iterations", "sample", "declared_samples", "request_id"}
    modern = bool(identity_fields.intersection(receipt))
    if modern and not (identity_fields | {"bits"}).issubset(receipt):
        raise ValueError("incomplete explicit request identity")
    if not modern and receipt.get("bits", 200) != 200:
        raise ValueError("legacy request must use original precision")
    if receipt["status"] not in {
        "ok",
        "error",
        "timeout",
        "output-limit",
        "protocol-error",
        "shape-error",
        "crash",
        "interrupted",
    }:
        raise ValueError("unknown sample status")
    wall = receipt["wall_seconds"]
    if type(wall) not in (int, float) or not math.isfinite(wall) or wall < 0:
        raise ValueError("invalid wall duration")
    bits = receipt.get("bits", 200)
    iterations = receipt.get("iterations", 1)
    sample = receipt.get("sample", 1)
    declared_samples = receipt.get("declared_samples", 1)
    if (
        type(bits) is not int
        or bits not in (100, 200)
        or type(iterations) is not int
        or not 1 <= iterations <= 10000
        or type(sample) is not int
        or not 1 <= sample <= 5
        or type(declared_samples) is not int
        or not sample <= declared_samples <= 5
    ):
        raise ValueError("invalid request parameters")
    request_id = receipt.get("request_id", label)
    if request_id != (
        f"sample-{sample:04}-{label}" if "request_id" in receipt else label
    ):
        raise ValueError("request identity disagrees with sample")
    status = persistent.validate_answer(
        engine, receipt, request_id, len(coefficients) - 1, bits, iterations
    )
    row = {
        "label": label,
        "coefficients": coefficients,
        "status": status,
        "original_status": receipt["status"],
        "engine": engine,
        "wall_seconds": receipt["wall_seconds"],
        "bits": bits,
        "iterations": iterations,
        "sample": sample,
        "request_id": request_id,
        "timing_boundary": "whole-fresh-field-batch",
        "controls": receipt.get("controls"),
        "proof_policy": receipt.get("proof_policy"),
        "producer_boundary": receipt.get("boundary"),
        "cap_seconds": receipt.get("cap_seconds"),
    }
    if status != "ok":
        return row
    if engine == "pari":
        line = next(
            x
            for x in receipt["stdout"].splitlines()
            if x.startswith("FRONTIER_RESULT|")
        )
        f = line.split("|")
        milliseconds, h, invariants, disc, signature, torsion, regulator = f[4:]
        row["worker_nanoseconds"] = str(int(milliseconds) * 1000000)
        invariants, signature = json.loads(invariants), json.loads(signature)
        row["regulator"] = {
            "guarantee": "working-precision-approximation",
            "text": regulator,
        }
    else:
        response = json.loads(receipt["stdout"])
        result = response["result"]
        compact = result["compact"]
        h, invariants, disc, signature, torsion = [
            compact[k]
            for k in (
                "class_number",
                "class_invariants",
                "discriminant",
                "signature",
                "torsion_order",
            )
        ]
        ns = int(result["elapsed_ns"])
        if ns < 0:
            raise ValueError("negative worker duration")
        row["worker_nanoseconds"] = str(ns)
        row["regulator"] = compact["regulator"]
        row["julia_diagnostics"] = response.get("diagnostics")
        # @timed can include compiling frontier_case before its internal timer
        # starts. Never subtract this diagnostic from worker elapsed_ns.
    values = sorted(int(x) for x in invariants)
    if int(h) < 1 or any(x < 1 for x in values) or math.prod(values) != int(h):
        raise ValueError("class invariant product disagrees with reported order")
    if any(b % a for a, b in zip(values, values[1:])):
        raise ValueError("class invariants are not in divisibility order")
    if signature[0] + 2 * signature[1] != len(coefficients) - 1 or int(torsion) < 1:
        raise ValueError("degree/signature/torsion mismatch")
    row.update(
        class_number=str(int(h)),
        class_invariants=[str(x) for x in values if x > 1],
        discriminant=str(int(disc)),
        signature=signature,
        torsion_order=str(int(torsion)),
    )
    return row


def summarize(directory):
    run_bytes = (directory / "run.json").read_bytes()
    run = json.loads(run_bytes)
    if not isinstance(run.get("provenance"), dict) or not run["provenance"]:
        raise ValueError("missing run provenance")
    bits, iterations, samples = (
        run.get(k, default)
        for k, default in (("bits", 200), ("iterations", 1), ("samples", 1))
    )
    if (
        type(bits) is not int
        or bits not in (100, 200)
        or type(iterations) is not int
        or not 1 <= iterations <= 10000
        or type(samples) is not int
        or not 1 <= samples <= 5
    ):
        raise ValueError("invalid registered request parameters")
    expected = dict(persistent.shared.validate_case(r) for r in run["records"])
    if len(expected) != len(run["records"]):
        raise ValueError("duplicate registered labels")
    rows, observed, stages, seen = [], set(), {}, set()
    for path in sorted(directory.glob("*.json")):
        if path.name == "run.json":
            continue
        raw = path.read_bytes()
        receipt = json.loads(raw)
        if (
            receipt.get("schema") != "sagejs.general-frontier-persistent-screen.v1"
            or receipt.get("engine") != run["engine"]
            or receipt.get("qualification_evidence") is not False
            or receipt.get("provenance") != run["provenance"]
        ):
            raise ValueError("unexpected receipt identity")
        stage = receipt["stage"]
        stages[stage] = stages.get(stage, 0) + 1
        if stage != "sample":
            continue
        row = normalize(receipt)
        if (
            (row["label"], row["sample"]) in seen
            or expected.get(row["label"]) != row["coefficients"]
            or row["bits"] != bits
            or row["iterations"] != iterations
            or row["sample"] > samples
            or receipt.get("declared_samples", 1) != samples
        ):
            raise ValueError("unexpected, changed or duplicate sample")
        key = (row["label"], row["sample"])
        seen.add(key)
        if row["status"] == "interrupted":
            row["pending_reservation"] = receipt["pending_reservation"]
        else:
            observed.add(key)
        row["receipt_sha256"] = hashlib.sha256(raw).hexdigest()
        rows.append(row)
    return {
        "schema": "sagejs.general-frontier-persistent-review.v1",
        "qualification_evidence": False,
        "independent_replay": False,
        "engine": run["engine"],
        "provenance": run["provenance"],
        "run_sha256": hashlib.sha256(run_bytes).hexdigest(),
        "reviewer_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "validator_sha256": hashlib.sha256(
            Path(persistent.__file__).read_bytes()
        ).hexdigest(),
        "shared_validator_sha256": hashlib.sha256(
            Path(persistent.shared.__file__).read_bytes()
        ).hexdigest(),
        "stages": stages,
        "bits": bits,
        "iterations": iterations,
        "declared_samples": samples,
        "seed": run.get("seed", 1),
        "missing_labels": sorted(
            label
            for label in expected
            if any((label, s) not in observed for s in range(1, samples + 1))
        ),
        "missing_samples": [
            {"label": label, "sample": s}
            for s in range(1, samples + 1)
            for label in sorted(expected)
            if (label, s) not in observed
        ],
        "rows": rows,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    result = summarize(args.directory)
    with args.output.open("x") as output:
        json.dump(result, output, indent=2, sort_keys=True)
        output.write("\n")
    print(
        json.dumps(
            {
                "engine": result["engine"],
                "samples": len(result["rows"]),
                "missing": len(result["missing_labels"]),
                "stages": result["stages"],
            }
        )
    )
