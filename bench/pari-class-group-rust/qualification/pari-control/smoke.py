#!/usr/bin/env python3
"""Run each open cubic once and verify the exact PARI result fingerprint."""

from __future__ import annotations

import argparse
import json
import pathlib
import subprocess

HERE = pathlib.Path(__file__).resolve().parent
DEFAULT_CORPUS = HERE.parent / "corpus" / "initial-open-development-v1.json"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--boundary", default="prepared-field")
    parser.add_argument("--include-row6", action="store_true")
    arguments = parser.parse_args()
    corpus = json.loads(DEFAULT_CORPUS.read_text())
    results = []
    control_identity = None
    for case in corpus["cases"]:
        if case["id"] == "row6-continuation-cubic" and not arguments.include_row6:
            continue
        completed = subprocess.run(
            [
                str(HERE / "run.py"),
                "--input",
                str(DEFAULT_CORPUS),
                "--field-id",
                case["id"],
                "--boundary",
                arguments.boundary,
            ],
            text=True,
            capture_output=True,
            check=True,
        )
        sample = json.loads(completed.stdout)
        if control_identity is None:
            control_identity = sample["controlIdentity"]
        elif sample["controlIdentity"] != control_identity:
            raise SystemExit("control identity changed during smoke run")
        if sample["result"] != case["expected"]:
            raise SystemExit(
                f"{case['id']}: {sample['result']!r} != {case['expected']!r}"
            )
        results.append(
            {
                "fieldId": case["id"],
                "kernelNanoseconds": sample["kernelNanoseconds"],
                "stageTimingsNanoseconds": sample["stageTimingsNanoseconds"],
                "exactResultSha256": sample["exactResultSha256"],
            }
        )
    print(
        json.dumps(
            {
                "schema": "sagejs.rust-class-group/pari-control-smoke-v1",
                "boundary": arguments.boundary,
                "boundaryLabel": sample["boundaryLabel"],
                "status": "passed",
                "controlIdentity": control_identity,
                "samples": results,
            },
            separators=(",", ":"),
        )
    )


if __name__ == "__main__":
    main()
