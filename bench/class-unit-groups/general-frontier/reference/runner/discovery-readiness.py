"""Report necessary panel-cost conditions, without selecting or freezing fields."""

import argparse
import hashlib
import importlib.util
import json
import subprocess
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "pairer", Path(__file__).with_name("pair-persistent.py")
)
pairer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pairer)


def readiness(reports, candidates):
    identities = {c["label"]: c for c in candidates}
    if len(identities) != len(candidates):
        raise ValueError("duplicate source identities")
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
            identity = identities.get(label)
            if identity is None:
                unclassified.append(label)
                continue
            for engine in ("pari", "hecke"):
                result = row.get(engine)
                if result is not None:
                    if result["coefficients"] != identity["coefficients"]:
                        raise ValueError("source presentation mismatch")
                    if result["status"] == "ok" and (
                        result["discriminant"] != identity["discriminant"]
                        or result["signature"] != identity["signature"]
                    ):
                        raise ValueError("source field metadata mismatch")
            degree = str(identity["degree"])
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
        "caveat": "Confirmed successful discovery subset only; per-degree cap 40 applied. Censored/missing costs are unknown, so predeclared retries may close shortfalls without new candidates. Exposure, signature and holdout constraints may further reduce feasibility. Only exact presentations bound to the validated source pool count; this is not an independent isomorphism proof.",
        "producer_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "paired_reports": reports,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pair", nargs=2, type=Path, action="append", required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--pool", type=Path, required=True)
    parser.add_argument("--node", default="node")
    args = parser.parse_args()
    reports = [
        pairer.pair(pairer.review.summarize(a), pairer.review.summarize(b))
        for a, b in args.pair
    ]
    validator = Path(__file__).resolve().parents[2] / "exposure" / "reconcile.cjs"
    pool_bytes = args.pool.read_bytes()
    source = subprocess.run(
        [
            args.node,
            "-e",
            "const fs=require('node:fs');const v=require(process.argv[1]);process.stdout.write(JSON.stringify(v.poolRecords(JSON.parse(fs.readFileSync(0)))));",
            str(validator),
        ],
        input=pool_bytes.decode("utf-8"),
        check=True,
        capture_output=True,
        text=True,
        timeout=30,
    )
    result = readiness(reports, json.loads(source.stdout))
    result["source_pool_file_sha256"] = hashlib.sha256(pool_bytes).hexdigest()
    result["source_validator_sha256"] = hashlib.sha256(
        validator.read_bytes()
    ).hexdigest()
    result["source_normalizer_sha256"] = hashlib.sha256(
        validator.with_name("export.cjs").read_bytes()
    ).hexdigest()
    with args.output.open("x") as output:
        json.dump(result, output, indent=2, sort_keys=True)
        output.write("\n")
    print(json.dumps({k: v for k, v in result.items() if k != "paired_reports"}))
