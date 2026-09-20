#!/usr/bin/env python3
"""Run the frozen alternating public cubic Rust/PARI campaign."""

from __future__ import annotations

import hashlib
import json
import os
import platform
import shutil
import statistics
import subprocess
import time
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
CRATE = HERE.parent
ROOT_CRATE = CRATE.parent.parent
QUALIFICATION = CRATE.parent
REPOSITORY = Path(
    subprocess.run(
        ["git", "rev-parse", "--show-toplevel"],
        cwd=HERE,
        check=True,
        text=True,
        capture_output=True,
    ).stdout.strip()
)
PANEL_PATH = HERE / "panel.json"
RECEIPT_PATH = HERE / "receipt.json"
PARI_RUN = QUALIFICATION / "pari-control" / "run.py"
PARI_BUILD_IDENTITY = QUALIFICATION / "pari-control" / "build" / "build-identity.json"
CORPUS = QUALIFICATION / "corpus" / "initial-open-development-v1.json"
TARGET_A = CRATE / "target" / "public-cubic-benchmark-repro-a"
TARGET_B = CRATE / "target" / "public-cubic-benchmark-repro-b"
BINARY_NAME = "sagejs-public-cubic-class-group-e2e-qualification"


def run(
    args: list[object],
    *,
    cwd: Path = CRATE,
    input_text: str | None = None,
    env: dict[str, str] | None = None,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [str(value) for value in args],
        cwd=cwd,
        input=input_text,
        env=env,
        check=True,
        text=True,
        capture_output=True,
    )


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def source_closure() -> dict[str, Any]:
    paths = [
        CRATE / "Cargo.toml",
        CRATE / "Cargo.lock",
        ROOT_CRATE / "Cargo.toml",
        ROOT_CRATE / "Cargo.lock",
        ROOT_CRATE / "build.rs",
        HERE / ".gitignore",
        HERE / "README.md",
        HERE / "panel.json",
        HERE / "run.py",
    ]
    paths.extend(sorted((CRATE / "src").rglob("*.rs")))
    paths.extend(sorted((ROOT_CRATE / "src").rglob("*.rs")))
    paths.extend(sorted((ROOT_CRATE / "src").rglob("*.c")))
    entries = [
        {
            "path": path.relative_to(REPOSITORY).as_posix(),
            "bytes": path.stat().st_size,
            "sha256": sha256(path),
        }
        for path in sorted(set(paths))
    ]
    status = run(
        [
            "git",
            "status",
            "--porcelain=v1",
            "--",
            *[entry["path"] for entry in entries],
        ],
        cwd=REPOSITORY,
    ).stdout
    encoded = canonical_json(entries).encode()
    return {
        "algorithm": "sha256-canonical-json-file-list-v1",
        "rootSha256": hashlib.sha256(encoded).hexdigest(),
        "files": entries,
        "reachableSourceStatusPorcelain": status,
        "containsDirtyReachableSources": bool(status),
    }


def build_twice() -> tuple[Path, list[dict[str, Any]]]:
    environment = dict(os.environ)
    environment.update({"CARGO_INCREMENTAL": "0", "SOURCE_DATE_EPOCH": "1"})
    builds = []
    binaries = []
    for target in (TARGET_A, TARGET_B):
        shutil.rmtree(target, ignore_errors=True)
        target_environment = dict(environment, CARGO_TARGET_DIR=str(target))
        completed = run(
            [
                "cargo",
                "build",
                "--locked",
                "--release",
                "--manifest-path",
                CRATE / "Cargo.toml",
            ],
            cwd=REPOSITORY,
            env=target_environment,
        )
        binary = target / "release" / BINARY_NAME
        binaries.append(binary)
        builds.append(
            {
                "cargoTargetDir": target.relative_to(CRATE).as_posix(),
                "command": "cargo build --locked --release",
                "binaryBytes": binary.stat().st_size,
                "binarySha256": sha256(binary),
                "compilerMessages": completed.stderr,
            }
        )
    if builds[0]["binarySha256"] != builds[1]["binarySha256"]:
        raise RuntimeError(
            "two empty-target release builds produced different binaries"
        )
    # Measure the second identity build. It is the most recently completed
    # artifact and therefore cannot have been invalidated by the second clean
    # target setup itself.
    return binaries[1], builds


def rust_request(panel: dict[str, Any], field: dict[str, Any]) -> str:
    return canonical_json(
        {
            "schema": "sagejs.rust-class-group/public-cubic-e2e-request-v2",
            "polynomialAscending": field["polynomialAscending"],
            "proofMode": "conditional-grh",
            "resources": panel["resources"],
        }
    )


def verify_rust(sample: dict[str, Any], field: dict[str, Any]) -> None:
    expected = field["expected"]
    assert sample["schema"] == "sagejs.rust-class-group/public-cubic-e2e-receipt-v2"
    assert sample["outcome"] == "complete-conditional-grh"
    assert sample["publicComplete"] is True
    assert sample["requestedProof"] == "conditional-grh"
    assert sample["usesPariInput"] is False
    assert sample["usesPreparedFixture"] is False
    assert sample["usesFieldAnswersAsInput"] is False
    assert "firstUnavailableBoundary" not in sample
    preparation = sample["preparation"]
    assert preparation == {
        "discriminant": expected["discriminant"],
        "signature": expected["signature"],
        "equationOrderIndex": expected["equationOrderIndex"],
        "discriminantPrimeFactors": expected["discriminantPrimeFactors"],
        "certificateVerified": True,
    }
    assert sample["relations"] == {
        "factorBaseSize": expected["factorBaseSize"],
        "relationCount": expected["relationCount"],
        "completeRankAndSurplus": True,
        "missingRank": 0,
    }
    candidate = sample["candidate"]
    assert candidate == {
        "invariantFactors": expected["invariantFactors"],
        "classNumber": expected["classNumber"],
        "authenticatedPrincipalRelations": expected["relationCount"],
        "generatorOrderWitnesses": len(expected["invariantFactors"]),
        "authority": expected["candidateAuthority"],
    }
    completion = sample["completion"]
    assert completion == {
        "proof": "conditional-grh",
        "classNumber": expected["classNumber"],
        "invariantFactors": expected["invariantFactors"],
        "unitRank": expected["unitRank"],
        "bfThreshold": expected["bfThreshold"],
        "classUnitHypothesis": "GRH for the Dedekind-zeta residue bound",
        "factorBaseHypothesis": "GRH for all unramified Hecke L-functions of class-group characters",
        "sealedEvidenceVerified": True,
        "arbitraryIdealClassMapRetained": True,
    }
    timings = sample["stageTimingsNanoseconds"]
    assert set(timings) == {
        "publicInputAndPreparation",
        "relationCollection",
        "candidateAuthentication",
        "unitAndAnalyticCompletion",
        "totalToSealedResult",
    }
    assert all(isinstance(value, int) and value >= 0 for value in timings.values())


def verify_pari(sample: dict[str, Any], field: dict[str, Any], boundary: str) -> None:
    expected = field["expected"]
    assert sample["schema"] == "sagejs.rust-class-group/pari-control-sample-v1"
    assert sample["fieldId"] == field["id"]
    assert sample["boundaryKind"] == "public-call"
    assert sample["boundaryLabel"] == boundary
    assert sample["input"]["polynomialAscending"] == field["polynomialAscending"]
    assert sample["result"] == {
        "classNumber": expected["classNumber"],
        "invariantFactors": expected["invariantFactors"],
    }
    assert sample["detail"] == {
        "degree": "3",
        "discriminant": expected["discriminant"],
        "factorBaseSize": str(expected["factorBaseSize"]),
        "regulatorPresent": True,
        "signature": [str(value) for value in expected["signature"]],
        "unitRank": str(expected["unitRank"]),
    }
    assert sample["call"]["pariVersion"] == ["2", "17", "4"]
    assert sample["call"]["noPariInProductPath"] is True


def sample_rust(
    binary: Path, request: str, field: dict[str, Any]
) -> tuple[int, dict[str, int], dict[str, Any]]:
    completed = run([binary], input_text=request)
    sample = json.loads(completed.stdout)
    verify_rust(sample, field)
    timings = sample["stageTimingsNanoseconds"]
    return (
        int(timings["totalToSealedResult"]),
        {key: int(value) for key, value in timings.items()},
        sample,
    )


def sample_pari(
    field: dict[str, Any], seed: str, boundary: str
) -> tuple[int, dict[str, int], dict[str, Any]]:
    completed = run(
        [
            PARI_RUN,
            "--input",
            CORPUS,
            "--field-id",
            field["id"],
            "--boundary",
            "public-call",
            "--seed",
            seed,
        ],
        cwd=REPOSITORY,
    )
    sample = json.loads(completed.stdout)
    verify_pari(sample, field, boundary)
    return (
        int(sample["kernelNanoseconds"]),
        {key: int(value) for key, value in sample["stageTimingsNanoseconds"].items()},
        sample,
    )


def medians(samples: list[dict[str, int]]) -> dict[str, float]:
    names = samples[0].keys()
    assert all(sample.keys() == names for sample in samples)
    return {
        name: statistics.median(sample[name] for sample in samples) for name in names
    }


def execution_context() -> dict[str, Any]:
    cpu_model = None
    cpuinfo = Path("/proc/cpuinfo")
    if cpuinfo.is_file():
        cpu_model = next(
            (
                line.split(":", 1)[1].strip()
                for line in cpuinfo.read_text().splitlines()
                if line.startswith("model name")
            ),
            None,
        )
    return {
        "capturedAtUnixNanoseconds": time.time_ns(),
        "platform": platform.platform(),
        "python": platform.python_version(),
        "cpuModel": cpu_model,
        "logicalCpuCount": os.cpu_count(),
        "affinityLogicalCpus": sorted(os.sched_getaffinity(0))
        if hasattr(os, "sched_getaffinity")
        else None,
        "loadAverage1m5m15m": list(os.getloadavg()),
        "threadEnvironment": {
            name: os.environ.get(name)
            for name in (
                "OMP_NUM_THREADS",
                "OPENBLAS_NUM_THREADS",
                "MKL_NUM_THREADS",
                "RAYON_NUM_THREADS",
            )
        },
        "isolation": "not externally isolated; load and affinity are recorded",
    }


def main() -> int:
    panel_bytes = PANEL_PATH.read_bytes()
    panel = json.loads(panel_bytes)
    assert panel["frozenBeforeTiming"] is True
    count = panel["samplesPerArmPerField"]
    assert count >= 15
    assert panel["warmupsPerArmPerField"] >= 1
    assert [field["id"] for field in panel["fields"]] == [
        "small-x3-x-1",
        "small-class-number-2",
        "row6-continuation-cubic",
    ]
    if not PARI_BUILD_IDENTITY.is_file():
        raise SystemExit(
            "authenticated PARI control missing; run ../../pari-control/build.py"
        )

    source = source_closure()
    binary, builds = build_twice()
    raw_samples: list[dict[str, Any]] = []
    fields_summary: list[dict[str, Any]] = []
    pari_identity: dict[str, Any] | None = None
    for field_index, field in enumerate(panel["fields"]):
        request = rust_request(panel, field)
        # Excluded warm calls validate both products before the campaign.
        for warmup in range(panel["warmupsPerArmPerField"]):
            sample_rust(binary, request, field)
            _, _, warm_pari = sample_pari(
                field,
                f"warm-public-cubic-{field_index}-{warmup}",
                panel["boundary"]["pari"],
            )
            pari_identity = warm_pari["controlIdentity"]

        totals: dict[str, list[int]] = {"rust": [], "pari": []}
        stages: dict[str, list[dict[str, int]]] = {"rust": [], "pari": []}
        for pair in range(count):
            order = ("rust", "pari") if pair % 2 == 0 else ("pari", "rust")
            for position, arm in enumerate(order):
                external_start = time.monotonic_ns()
                if arm == "rust":
                    total, stage, _ = sample_rust(binary, request, field)
                else:
                    total, stage, pari = sample_pari(
                        field,
                        f"public-cubic-{field_index}-{pair}",
                        panel["boundary"]["pari"],
                    )
                    if (
                        pari_identity is not None
                        and pari["controlIdentity"] != pari_identity
                    ):
                        raise RuntimeError(
                            "PARI control identity changed during campaign"
                        )
                    pari_identity = pari["controlIdentity"]
                external = time.monotonic_ns() - external_start
                totals[arm].append(total)
                stages[arm].append(stage)
                raw_samples.append(
                    {
                        "fieldId": field["id"],
                        "pairOneBased": pair + 1,
                        "positionInPairOneBased": position + 1,
                        "arm": arm,
                        "kernelNanoseconds": total,
                        "stageTimingsNanoseconds": stage,
                        "externalProcessNanosecondsExcluded": external,
                        "exactOutputChecked": True,
                    }
                )
        rust_median = statistics.median(totals["rust"])
        pari_median = statistics.median(totals["pari"])
        fields_summary.append(
            {
                "fieldId": field["id"],
                "rustKernelNanoseconds": totals["rust"],
                "pariKernelNanoseconds": totals["pari"],
                "rustMedianNanoseconds": rust_median,
                "pariMedianNanoseconds": pari_median,
                "rustOverPariMedianRatio": rust_median / pari_median,
                "rustStageMediansNanoseconds": medians(stages["rust"]),
                "pariStageMediansNanoseconds": medians(stages["pari"]),
                "expected": field["expected"],
            }
        )

    final_source = source_closure()
    if final_source["rootSha256"] != source["rootSha256"]:
        raise RuntimeError("reachable source changed during build or measurement")
    git_commit = run(["git", "rev-parse", "HEAD"], cwd=REPOSITORY).stdout.strip()
    receipt = {
        "schema": "sagejs.rust-class-group/public-cubic-e2e-benchmark-receipt-v1",
        "status": "passed",
        "evidenceStatus": (
            "diagnostic-dirty-reachable-source"
            if source["containsDirtyReachableSources"]
            else "promotion-candidate-clean-frozen-source"
        ),
        "promotionEligible": not source["containsDirtyReachableSources"],
        "panelSha256": hashlib.sha256(panel_bytes).hexdigest(),
        "samplesPerArmPerField": count,
        "warmupsPerArmPerFieldExcluded": panel["warmupsPerArmPerField"],
        "alternation": "even pairs Rust then PARI; odd pairs PARI then Rust",
        "boundary": panel["boundary"],
        "gitCommit": git_commit,
        "sourceClosure": source,
        "builds": builds,
        "reproducibleReleaseBinary": True,
        "pariControlIdentity": pari_identity,
        "executionContext": execution_context(),
        "fields": fields_summary,
        "rawSamples": raw_samples,
    }
    RECEIPT_PATH.write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n")
    print(
        json.dumps({"receipt": str(RECEIPT_PATH), "fields": fields_summary}, indent=2)
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
