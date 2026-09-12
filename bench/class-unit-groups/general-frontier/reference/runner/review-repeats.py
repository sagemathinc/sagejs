"""Review predeclared fresh batches; never certify mathematics or warm JIT."""

import argparse
from collections import Counter
import hashlib
import importlib.util
import json
from pathlib import Path
import re
from statistics import median

spec = importlib.util.spec_from_file_location(
    "repeat_normalizer", Path(__file__).with_name("summarize-persistent.py")
)
normalizer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(normalizer)

REQUEST_KEYS = (
    "engine",
    "bits",
    "iterations",
    "samples",
    "seed",
    "requested_proof_policy",
    "records",
    "provenance",
)
SUMMARY_KEYS = (
    "class_number",
    "class_invariants",
    "discriminant",
    "signature",
    "torsion_order",
)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def strict_json(data):
    value = normalizer.persistent.shared.strict_json(data)
    # Also reject finite-syntax exponent overflow such as 1e999.
    json.dumps(value, allow_nan=False)
    return value


def summary(compact):
    return {
        key: sorted(int(v) for v in compact[key] if int(v) > 1)
        if key == "class_invariants"
        else compact[key]
        for key in SUMMARY_KEYS
    }


def validate_request_hash(receipt, request):
    """Bind the actual transport bytes, including PARI's retained nonce."""
    label, coefficients = normalizer.persistent.shared.validate_case(receipt["record"])
    payload, generated_marker = normalizer.persistent.encode_request(
        request["engine"],
        receipt["request_id"],
        coefficients,
        request["bits"],
        request["seed"],
        request["iterations"],
        request["requested_proof_policy"],
    )
    pending = (
        receipt.get("pending_reservation", {})
        if receipt.get("status") == "interrupted"
        else receipt
    )
    if request["engine"] == "pari":
        marker = pending.get("request_marker")
        if (
            not isinstance(marker, str)
            or re.fullmatch(r"FRONTIER_DONE\|[0-9a-f]{32}", marker) is None
        ):
            raise ValueError(
                "PARI exact request binding requires retained completion marker"
            )
        # The canonical encoder includes a fresh nonce. Replace only its exact
        # trailing transport frame with the historically retained nonce.
        trailer = ("print(" + json.dumps(generated_marker.decode()) + ");\n").encode()
        if not payload.endswith(trailer):
            raise ValueError("unexpected canonical PARI transport framing")
        payload = (
            payload[: -len(trailer)] + ("print(" + json.dumps(marker) + ");\n").encode()
        )
    if pending.get("request_sha256") != digest(payload):
        raise ValueError("sample request hash differs from canonical transport")


def review(plan_bytes, custody, base=Path(".")):
    plan = strict_json(plan_bytes)
    json.dumps(custody, allow_nan=False)
    if plan.get("schema") != "sagejs.reference-repeat-plan.v1":
        raise ValueError("unknown repeat plan")
    if custody.get("schema") != "sagejs.reference-repeat-custody.v1" or custody.get(
        "plan_sha256"
    ) != digest(plan_bytes):
        raise ValueError("custody does not bind predeclared plan")
    controls = plan["controls"]
    if (
        set(controls) != {"hostname", "affinity", "memory_max", "swap_max"}
        or not controls.get("hostname")
        or controls.get("affinity") != [2]
        or controls.get("memory_max") != 4294967296
        or controls.get("swap_max") != 0
    ):
        raise ValueError("missing declared measurement controls")
    declarations, expected_cells, polynomials = {}, set(), {}
    if not plan["runs"]:
        raise ValueError("empty repeat plan")
    for entry in plan["runs"]:
        key, request = entry["id"], entry["request"]
        if not isinstance(key, str) or not key or key in declarations:
            raise ValueError("duplicate or invalid run id")
        if set(request) != set(REQUEST_KEYS):
            raise ValueError("incomplete declared request")
        normalizer.persistent.validate_measurement(
            request["bits"], request["iterations"], request["samples"]
        )
        normalizer.persistent.shared.validate_proof_policy(
            request["requested_proof_policy"]
        )
        if (
            request["engine"] not in ("pari", "hecke")
            or type(request["seed"]) is not int
            or request["seed"] != 1
        ):
            raise ValueError("unsupported engine or seed")
        if entry["timing_class"] not in ("tiny", "seconds"):
            raise ValueError("timing class must be predeclared")
        run_controls = entry["controls"]
        if (
            not isinstance(run_controls.get("cgroup"), str)
            or not run_controls["cgroup"]
            or any(run_controls.get(k) != v for k, v in controls.items())
        ):
            raise ValueError("run controls must bind cgroup and common controls")
        minimum = entry["min_worker_nanoseconds"]
        if (
            type(minimum) is not int
            or minimum < 0
            or (entry["timing_class"] == "tiny" and minimum < 10**9)
        ):
            raise ValueError("invalid declared worker duration threshold")
        if (
            type(entry["cap_seconds"]) is not int
            or not 1 <= entry["cap_seconds"] <= 600
        ):
            raise ValueError("invalid declared sample cap")
        provenance = request["provenance"]
        if provenance.get("threads") != 1 or not provenance.get("sha256"):
            raise ValueError("missing pinned single-thread runtime")
        for value in provenance["sha256"].values():
            if (
                not isinstance(value, str)
                or len(value) != 64
                or any(c not in "0123456789abcdef" for c in value)
            ):
                raise ValueError("invalid runtime hash")
        cases = [
            normalizer.persistent.shared.validate_case(r) for r in request["records"]
        ]
        if not cases:
            raise ValueError("empty declared run")
        for label, coefficients in cases:
            if label in polynomials and polynomials[label] != coefficients:
                raise ValueError("different defining polynomials for one label")
            polynomials[label] = coefficients
            cell = (
                label,
                request["engine"],
                request["bits"],
                request["requested_proof_policy"],
            )
            if cell in expected_cells:
                raise ValueError("duplicate declared field/engine/precision/policy")
            expected_cells.add(cell)
        declarations[key] = entry
    if set(custody["runs"]) - set(declarations):
        raise ValueError("undeclared custody run")
    for label, _, _, policy in expected_cells:
        if any(
            (label, engine, bits, policy) not in expected_cells
            for engine in ("pari", "hecke")
            for bits in (100, 200)
        ):
            raise ValueError("plan must declare both engines at 100 and 200 bits")

    runs, cells = [], []
    for key, entry in declarations.items():
        request = entry["request"]
        result = {"id": key, "status": "missing-run", "review": None, "files": []}
        normalized = {}
        if key in custody["runs"]:
            location = custody["runs"][key]
            directory = base / location["directory"]
            try:
                for path in sorted(directory.glob("*.json")):
                    result["files"].append(
                        {"path": str(path), "sha256": digest(path.read_bytes())}
                    )
                for item in result["files"]:
                    receipt = strict_json(Path(item["path"]).read_bytes())
                    if receipt.get("stage") == "sample":
                        validate_request_hash(receipt, request)
                        if receipt.get("status") == "interrupted":
                            if (
                                receipt.get("pending_reservation", {}).get(
                                    "reserved_seconds"
                                )
                                != entry["cap_seconds"] + 10
                            ):
                                raise ValueError(
                                    "interrupted sample cap differs from declaration"
                                )
                        elif (
                            type(receipt.get("cap_seconds")) is not int
                            or receipt["cap_seconds"] != entry["cap_seconds"]
                        ):
                            raise ValueError("sample cap differs from declaration")
                raw = (directory / "run.json").read_bytes()
                if digest(raw) != location["run_sha256"]:
                    raise ValueError("run custody hash mismatch")
                actual = strict_json(raw)
                if any(actual.get(k) != request[k] for k in REQUEST_KEYS):
                    raise ValueError("run differs from predeclared request")
                report = normalizer.summarize(directory)
                # A singleton v3 request already retains its complete output;
                # v4 is necessary only for batches. Recover its validated compact
                # payload rather than rejecting seconds-scale singleton samples.
                for row in report["rows"]:
                    if (
                        row["status"] != "ok"
                        or row["iterations"] != 1
                        or "iteration_outputs" in row
                    ):
                        continue
                    if (
                        row["worker_schema"]
                        != f"sagejs-{request['engine']}-frontier-screen-v3"
                    ):
                        continue
                    source = next(
                        f
                        for f in result["files"]
                        if f["sha256"] == row["receipt_sha256"]
                    )
                    receipt = strict_json(Path(source["path"]).read_bytes())
                    if request["engine"] == "pari":
                        value = normalizer.persistent.shared.parse_pari_compact(
                            receipt["stdout"],
                            row["request_id"],
                            row["bits"],
                            1,
                            len(row["coefficients"]) - 1,
                            proof_policy=row["proof_policy"],
                        )
                    else:
                        value = strict_json(receipt["stdout"])["result"]
                    row["iteration_outputs"] = [
                        {
                            "iteration": 1,
                            "compact": value["compact"],
                            "proof_execution": value.get("proof_execution"),
                        }
                    ]
                    row["repeat_report_singleton_expansion"] = True
                if any(
                    digest(Path(f["path"]).read_bytes()) != f["sha256"]
                    for f in result["files"]
                ):
                    raise ValueError("receipt changed during review")
                result.update(
                    status="reviewed",
                    review={k: v for k, v in report.items() if k != "rows"},
                )
                normalized = {(r["label"], r["sample"]): r for r in report["rows"]}
            except (ValueError, KeyError, TypeError, OSError, StopIteration) as error:
                result.update(status="rejected-run", error=str(error))
        runs.append(result)
        for record in request["records"]:
            label, _ = normalizer.persistent.shared.validate_case(record)
            for sample in range(1, request["samples"] + 1):
                row = normalized.get((label, sample))
                reasons = []
                if row is None:
                    reasons.append(
                        result["status"]
                        if result["status"] != "reviewed"
                        else "missing-sample"
                    )
                elif row["status"] != "ok":
                    reasons.append(row["status"])
                else:
                    if row["controls"] != entry["controls"]:
                        reasons.append("unmatched-controls")
                    if (
                        row["producer_boundary"]
                        != "persistent-process-fresh-field-not-proven-warm-JIT"
                    ):
                        reasons.append("unmatched-fresh-request-boundary")
                    if (
                        not row.get("batch_outputs_complete")
                        or "iteration_outputs" not in row
                    ):
                        reasons.append("missing-retained-batch")
                    if int(row["worker_nanoseconds"]) < entry["min_worker_nanoseconds"]:
                        reasons.append("inadequate-worker-duration")
                    if entry["timing_class"] == "seconds" and request["samples"] < 3:
                        reasons.append("insufficient-declared-samples")
                cells.append(
                    {
                        "run_id": key,
                        "label": label,
                        "sample": sample,
                        "engine": request["engine"],
                        "bits": request["bits"],
                        "policy": request["requested_proof_policy"],
                        "sampling_eligible": not reasons,
                        "reasons": reasons,
                        "row": row,
                    }
                )
    pairs = []
    for label, bits, policy in sorted(
        {(c["label"], c["bits"], c["policy"]) for c in cells}
    ):
        group = [
            c
            for c in cells
            if (c["label"], c["bits"], c["policy"]) == (label, bits, policy)
        ]
        complete = all(c["sampling_eligible"] for c in group)
        summaries = [
            summary(member["compact"])
            for c in group
            if c["row"] is not None
            for member in c["row"].get("iteration_outputs", [])
        ]
        timings = {}
        for engine in ("pari", "hecke"):
            engine_cells = [c for c in group if c["engine"] == engine]
            eligible = all(c["sampling_eligible"] for c in engine_cells)
            values = [
                int(c["row"]["worker_nanoseconds"]) / c["row"]["iterations"] / 10**9
                for c in engine_cells
                if c["sampling_eligible"]
            ]
            timings[engine] = {
                "declared_samples": len(engine_cells),
                "eligible_samples": len(values),
                "worker_seconds_per_fresh_field_samples": values,
                "median_worker_seconds_per_fresh_field": median(values)
                if eligible and values
                else None,
                "all_declared_samples_eligible": eligible,
            }
        pairs.append(
            {
                "label": label,
                "bits": bits,
                "policy": policy,
                "engine_timings": timings,
                "all_declared_samples_eligible": complete,
                "all_retained_exact_summaries_agree": bool(summaries)
                and all(s == summaries[0] for s in summaries),
                "complete_eligible_exact_summary_pair": complete
                and bool(summaries)
                and all(s == summaries[0] for s in summaries),
            }
        )
    fields = []
    for label, policy in sorted({(c["label"], c["policy"]) for c in cells}):
        group = [c for c in cells if (c["label"], c["policy"]) == (label, policy)]
        summaries = [
            summary(m["compact"])
            for c in group
            if c["row"] is not None
            for m in c["row"].get("iteration_outputs", [])
        ]
        agree = bool(summaries) and all(s == summaries[0] for s in summaries)
        fields.append(
            {
                "label": label,
                "policy": policy,
                "all_retained_cross_precision_exact_summaries_agree": agree,
                "complete_eligible_cross_precision_exact_summary_pair": agree
                and all(c["sampling_eligible"] for c in group),
            }
        )
    return {
        "schema": "sagejs.reference-repeat-review.v1",
        "plan_sha256": digest(plan_bytes),
        "adjudicator_sha256": digest(Path(__file__).read_bytes()),
        "qualification_evidence": False,
        "independent_replay": False,
        "warm_jit_qualification": False,
        "regulator_requests_mathematically_equivalent": False,
        "predeclaration_chronology_authenticated": False,
        "caveat": "PARI regulator is a working-precision approximation; Hecke provides an enclosure. Exact-summary agreement is not independent proof. Fresh-sample identity is checked, not absence of hidden engine caches. No matched certified-regulator minimum is computed.",
        "declared_sample_denominator": len(cells),
        "eligible_samples": sum(c["sampling_eligible"] for c in cells),
        "rejection_counts": dict(Counter(r for c in cells for r in c["reasons"])),
        "runs": runs,
        "samples": cells,
        "pairs": pairs,
        "fields": fields,
        "complete_eligible_exact_summary_panel": all(
            f["complete_eligible_cross_precision_exact_summary_pair"] for f in fields
        ),
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("plan", type=Path)
    parser.add_argument("custody", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    report = review(
        args.plan.read_bytes(),
        strict_json(args.custody.read_bytes()),
        args.custody.parent,
    )
    with args.output.open("x") as output:
        json.dump(report, output, indent=2, sort_keys=True)
        output.write("\n")
