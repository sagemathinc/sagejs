"""Report necessary panel-cost conditions, without selecting or freezing fields."""

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


def readiness(reports):
    degrees = {
        str(d): {"observed": 0, "paired": 0, "one_second": 0, "ten_seconds": 0}
        for d in range(2, 11)
    }
    seen = set()
    unclassified = []
    for report in reports:
        for row in report["rows"]:
            label = row["label"]
            if label in seen:
                raise ValueError(
                    "overlapping runs require explicit attempt reconciliation"
                )
            seen.add(label)
            parts = label.split(".")
            if len(parts) != 4 or not all(p.isdecimal() for p in parts):
                unclassified.append(label)
                continue
            degree = parts[0]
            if degree not in degrees:
                raise ValueError("field degree outside panel")
            counts = degrees[degree]
            counts["observed"] += 1
            if row["status"] != "paired-discovery":
                continue
            counts["paired"] += 1
            ns = int(row["faster_worker_nanoseconds"])
            counts["one_second"] += ns >= 10**9
            counts["ten_seconds"] += ns >= 10**10
    one = sum(min(40, c["one_second"]) for c in degrees.values())
    ten = sum(min(40, c["ten_seconds"]) for c in degrees.values())
    return {
        "schema": "sagejs.general-frontier-discovery-readiness.v1",
        "qualification_evidence": False,
        "corpus_frozen": False,
        "degrees": degrees,
        "unclassified_field_identities": unclassified,
        "one_second_panel_upper_bound": one,
        "ten_second_panel_upper_bound": ten,
        "necessary_one_second_shortfall": max(0, 120 - one),
        "necessary_ten_second_shortfall": max(0, 40 - ten),
        "caveat": "Discovery only; per-degree cap 40 applied. Exposure, signature, holdout and field-distinctness constraints may further reduce feasibility. Non-LMFDB identities are not counted without reconciliation.",
        "producer_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "paired_reports": reports,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pair", nargs=2, type=Path, action="append", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    reports = [
        pairer.pair(pairer.review.summarize(a), pairer.review.summarize(b))
        for a, b in args.pair
    ]
    result = readiness(reports)
    with args.output.open("x") as output:
        json.dump(result, output, indent=2, sort_keys=True)
        output.write("\n")
    print(json.dumps({k: v for k, v in result.items() if k != "paired_reports"}))
