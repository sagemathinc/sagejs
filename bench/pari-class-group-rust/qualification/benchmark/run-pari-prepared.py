#!/usr/bin/env python3
"""Relabel and resource-measure the authenticated PARI prepared control."""

from __future__ import annotations

import argparse
import json
import pathlib
import resource
import subprocess

HERE = pathlib.Path(__file__).resolve().parent
PARI_RUNNER = HERE.parent / "pari-control/run.py"
BOUNDARY = "prepared-field/complete-grh-class-unit-v1"


def canonical_json(value: object) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=pathlib.Path)
    parser.add_argument("--field-id", required=True)
    parser.add_argument("--seed", required=True)
    arguments = parser.parse_args()
    completed = subprocess.run(
        [
            str(PARI_RUNNER),
            "--input",
            str(arguments.input.resolve()),
            "--field-id",
            arguments.field_id,
            "--boundary",
            "prepared-field",
            "--seed",
            arguments.seed,
        ],
        text=True,
        capture_output=True,
        check=True,
    )
    usage = resource.getrusage(resource.RUSAGE_CHILDREN)
    lines = [line for line in completed.stdout.splitlines() if line.strip()]
    if len(lines) != 1:
        raise SystemExit(f"PARI control emitted {len(lines)} nonempty stdout lines")
    sample = json.loads(lines[0])
    if sample.get("boundaryLabel") != "prepared-field/pari-bnfinit0-flag-zero-v1":
        raise SystemExit("PARI control returned the wrong source boundary")
    sample["sourceBoundaryLabel"] = sample["boundaryLabel"]
    sample["boundaryLabel"] = BOUNDARY
    sample["proofMode"] = "conditional-grh"
    sample["processPeakRssKiB"] = str(usage.ru_maxrss)
    print(canonical_json(sample))


if __name__ == "__main__":
    main()
