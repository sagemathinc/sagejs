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
        if receipt.get("schema") != "sagejs.general-frontier-pari-cost-screen.v1":
            raise ValueError("unexpected receipt schema")
        status = screen.validate_terminal(
            receipt["stdout"],
            receipt["stderr"],
            receipt["label"],
            receipt["exit_code"],
            receipt["status"] == "timeout",
            receipt["status"] == "output-limit",
        )
        row = {
            "label": receipt["label"],
            "receipt_sha256": hashlib.sha256(raw).hexdigest(),
            "original_status": receipt["status"],
            "reviewed_status": status,
            "wall_seconds": receipt["wall_seconds"],
        }
        if status == "ok":
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
            for status in ("ok", "error", "timeout", "output-limit")
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
