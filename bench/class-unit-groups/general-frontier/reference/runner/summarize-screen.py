"""Revalidate retained PARI cost-screen receipts without modifying originals."""

import argparse
import hashlib
import importlib.util
import json
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "frontier_screen", Path(__file__).with_name("screen-batch.py")
)
screen = importlib.util.module_from_spec(spec)
spec.loader.exec_module(screen)


def summarize(directory):
    rows = []
    for path in sorted(directory.glob("*.json")):
        raw = path.read_bytes()
        receipt = json.loads(raw)
        if receipt.get("schema") not in (
            "sagejs.general-frontier-pari-cost-screen.v1",
            "sagejs.general-frontier-pari-cost-screen.v2",
        ):
            raise ValueError("unexpected receipt schema")
        policy = screen.receipt_policy(receipt)
        label, coefficients = screen.validate_case(receipt)
        if receipt["schema"].endswith(".v2") and (
            receipt.get("request_id") != label
            or type(receipt.get("bits")) is not int
            or receipt["bits"] != 200
            or type(receipt.get("iterations")) is not int
            or receipt["iterations"] != 1
            or receipt.get("seed") != "1"
        ):
            raise ValueError("fresh request identity mismatch")
        if receipt["status"] not in (
            "ok",
            "error",
            "timeout",
            "output-limit",
            "interrupted",
        ):
            raise ValueError("unknown retained fresh status")
        status = (
            receipt["status"]
            if receipt["status"] != "ok"
            else screen.validate_terminal(
                receipt["stdout"],
                receipt["stderr"],
                receipt["label"],
                receipt["exit_code"],
                receipt["status"] == "timeout",
                receipt["status"] == "output-limit",
                expected_degree=len(coefficients) - 1,
                expected_proof_policy=policy,
                require_current=receipt["schema"].endswith(".v2"),
            )
        )
        row = {
            "label": receipt["label"],
            "receipt_sha256": hashlib.sha256(raw).hexdigest(),
            "original_status": receipt["status"],
            "reviewed_status": status,
            "wall_seconds": receipt["wall_seconds"],
            "requested_proof_policy": policy,
        }
        if status == "ok":
            row["proof_policy"] = policy
            row["proof_execution"] = None
            if "FRONTIER_COMPACT_JSON|" in receipt["stdout"]:
                result = screen.parse_pari_compact(
                    receipt["stdout"],
                    label,
                    degree=len(coefficients) - 1,
                    proof_policy=policy,
                )
                row["proof_execution"] = result.get("proof_execution")
                row["regulator"] = result["compact"]["regulator"]
            line = next(
                line
                for line in receipt["stdout"].splitlines()
                if line.startswith("FRONTIER_RESULT|")
            )
            fields = line.split("|")
            row.update(
                elapsed_milliseconds=int(fields[4]),
                class_number=fields[5],
                invariants=json.loads(fields[6]),
                discriminant=fields[7],
                signature=json.loads(fields[8]),
            )
        rows.append(row)
    return {
        "schema": "sagejs.general-frontier-cost-screen-review.v1",
        "qualification_evidence": False,
        "independent_replay": False,
        "validator_sha256": hashlib.sha256(
            Path(screen.__file__).read_bytes()
        ).hexdigest(),
        "rows": rows,
        "counts": {
            status: sum(r["reviewed_status"] == status for r in rows)
            for status in ("ok", "error", "timeout", "output-limit", "interrupted")
        },
        "pari_only_at_least_one_second": sum(
            r.get("elapsed_milliseconds", 0) >= 1000 for r in rows
        ),
        "pari_only_at_least_ten_seconds": sum(
            r.get("elapsed_milliseconds", 0) >= 10000 for r in rows
        ),
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    report = summarize(args.directory)
    with args.output.open("x") as out:
        json.dump(report, out, sort_keys=True, indent=2)
        out.write("\n")
    print(json.dumps({key: value for key, value in report.items() if key != "rows"}))
