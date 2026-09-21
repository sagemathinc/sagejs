#!/usr/bin/env python3
"""Normalize one exact prepared-cubic Rust run for the qualification harness."""

from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import resource
import subprocess

HERE = pathlib.Path(__file__).resolve().parent
ENGINE = (
    HERE.parent / "row6-candidate/target/release/sagejs-row6-rust-candidate-diagnostic"
)
BOUNDARY = "prepared-field/complete-grh-class-unit-v1"


def canonical_json(value: object) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def sha256(path: pathlib.Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=pathlib.Path)
    parser.add_argument("--field-id", required=True)
    parser.add_argument("--seed", required=True)
    parser.add_argument("--maximum-ideals", type=int, default=2000)
    parser.add_argument("--maximum-candidates", type=int, default=600000)
    arguments = parser.parse_args()
    if not ENGINE.is_file():
        raise SystemExit(f"Rust engine is not built: {ENGINE}")
    source = json.loads(arguments.input.read_text())
    source_id = source.get("fieldId")
    accepted_source_ids = {
        "row6-continuation-cubic": {"row6-x3-minus-2000000000010x-plus-2000000000018"}
    }.get(arguments.field_id, {arguments.field_id})
    if source_id not in accepted_source_ids:
        raise SystemExit("neutral input fieldId does not match --field-id")
    completed = subprocess.run(
        [
            str(ENGINE),
            "small-norm-unit-kernel-prepared",
            str(arguments.input.resolve()),
            str(arguments.maximum_ideals),
            str(arguments.maximum_candidates),
        ],
        text=True,
        capture_output=True,
        check=True,
    )
    usage = resource.getrusage(resource.RUSAGE_CHILDREN)
    lines = [line for line in completed.stdout.splitlines() if line.strip()]
    if len(lines) != 1:
        raise SystemExit(f"Rust engine emitted {len(lines)} nonempty stdout lines")
    answer = json.loads(lines[0])
    if answer.get("schema") != "sagejs.rust-class-group/prepared-cubic-class-unit-v1":
        raise SystemExit("Rust engine returned the wrong schema")
    if answer.get("qualificationStatus") != "grh-conditional-class-unit-index-one":
        raise SystemExit(
            "Rust engine did not establish the conditional completion contract"
        )
    if answer.get("mathematicalBoundary") != (
        "replay-validated-prepared-cubic-to-complete-class-and-unit-result"
    ):
        raise SystemExit("Rust engine returned the wrong mathematical boundary")
    completion = answer["analyticCompletion"]
    if completion["classUnitIndexEnclosure"]["uniquePositiveInteger"] != 1:
        raise SystemExit("Rust completion enclosure did not isolate index one")
    invariants = [str(value) for value in completion["candidateInvariantFactors"]]
    class_number = str(completion["candidateClassNumber"])
    timing_keys = [
        "collection",
        "presentationClassOrder",
        "presentationSquareDeterminant",
        "presentationSurplusCoordinateSolve",
        "presentationSurplusKernel",
        "generatorOrderRelations",
        "kernelReorderAndMetadata",
        "logarithmicEmbedding",
        "unitLatticeReconstructionAndReplay",
        "analyticCompletion",
        "totalExternal",
    ]
    stages = {key: str(answer["timingsNanoseconds"][key]) for key in timing_keys}
    result = {"classNumber": class_number, "invariantFactors": invariants}
    result_json = canonical_json(result)
    print(
        canonical_json(
            {
                "schema": "sagejs.rust-class-group/rust-prepared-benchmark-sample-v1",
                "fieldId": arguments.field_id,
                "boundaryKind": "prepared-field",
                "boundaryLabel": BOUNDARY,
                "proofMode": "conditional-grh",
                "kernelNanoseconds": stages["totalExternal"],
                "stageTimingsNanoseconds": stages,
                "processPeakRssKiB": str(usage.ru_maxrss),
                "result": result,
                "exactResultCanonicalJson": result_json,
                "exactResultSha256": hashlib.sha256(result_json.encode()).hexdigest(),
                "engine": {
                    "schema": answer["schema"],
                    "qualificationStatus": answer["qualificationStatus"],
                    "inputId": answer["inputId"],
                    "inputSha256": sha256(arguments.input),
                    "executableSha256": sha256(ENGINE),
                    "seed": arguments.seed,
                    "randomness": "engine-declares-no-randomness",
                    "stderrSha256": hashlib.sha256(
                        completed.stderr.encode()
                    ).hexdigest(),
                },
            }
        )
    )


if __name__ == "__main__":
    main()
