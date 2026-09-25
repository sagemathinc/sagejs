#!/usr/bin/env python3
"""Run the frozen public-quadratic Rust/PARI alternating campaign."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import platform
import shutil
import statistics
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
CRATE = HERE.parent
ROOT_CRATE = CRATE.parent.parent
PRODUCT_IMAGINARY_SOURCE = (
    ROOT_CRATE.parent.parent / "packages" / "class-groups" / "src" / "imaginary.rs"
)
PARI_CONTROL = CRATE.parent / "pari-control" / "build" / "pari-control"
PARI_IDENTITY = CRATE.parent / "pari-control" / "build" / "build-identity.json"
PANEL_PATH = HERE / "panel.json"
RECEIPT_PATH = HERE / "receipt.json"
REPRO_A = CRATE / "target" / "benchmark-repro-a" / "release" / "benchmark_public"
REPRO_B = CRATE / "target" / "benchmark-repro-b" / "release" / "benchmark_public"


def command(
    *args: object,
    cwd: Path = CRATE,
    env: dict[str, str] | None = None,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [str(value) for value in args],
        cwd=cwd,
        check=True,
        text=True,
        capture_output=True,
        env=env,
    )


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def median(values: list[int]) -> float:
    return statistics.median(values)


def percentile_nearest_rank(values: list[float], proportion: float) -> float:
    ordered = sorted(values)
    return ordered[max(0, math.ceil(proportion * len(ordered)) - 1)]


def read_optional(path: Path) -> str | None:
    try:
        return path.read_text().strip()
    except OSError:
        return None


def execution_context() -> dict:
    governors = sorted(
        {
            value
            for path in Path("/sys/devices/system/cpu").glob(
                "cpu*/cpufreq/scaling_governor"
            )
            if (value := read_optional(path))
        }
    )
    cpufreq_drivers = sorted(
        {
            value
            for path in Path("/sys/devices/system/cpu").glob(
                "cpu*/cpufreq/scaling_driver"
            )
            if (value := read_optional(path))
        }
    )
    energy_preferences = sorted(
        {
            value
            for path in Path("/sys/devices/system/cpu").glob(
                "cpu*/cpufreq/energy_performance_preference"
            )
            if (value := read_optional(path))
        }
    )
    cpu_model = None
    cpuinfo = read_optional(Path("/proc/cpuinfo"))
    if cpuinfo:
        cpu_model = next(
            (
                line.split(":", 1)[1].strip()
                for line in cpuinfo.splitlines()
                if line.startswith("model name")
            ),
            None,
        )
    thread_names = [
        "OMP_NUM_THREADS",
        "OPENBLAS_NUM_THREADS",
        "MKL_NUM_THREADS",
        "RAYON_NUM_THREADS",
        "VECLIB_MAXIMUM_THREADS",
        "NUMEXPR_NUM_THREADS",
    ]
    return {
        "capturedAtUnixNanoseconds": time.time_ns(),
        "cpuModel": cpu_model,
        "logicalCpuCount": os.cpu_count(),
        "processAffinityLogicalCpus": sorted(os.sched_getaffinity(0))
        if hasattr(os, "sched_getaffinity")
        else None,
        "scalingGovernors": governors,
        "scalingDrivers": cpufreq_drivers,
        "energyPerformancePreferences": energy_preferences,
        "intelPstateStatus": read_optional(
            Path("/sys/devices/system/cpu/intel_pstate/status")
        ),
        "amdPstateStatus": read_optional(
            Path("/sys/devices/system/cpu/amd_pstate/status")
        ),
        "acpiPlatformProfile": read_optional(
            Path("/sys/firmware/acpi/platform_profile")
        ),
        "threadEnvironment": {name: os.environ.get(name) for name in thread_names},
        "loadAverage1m5m15m": list(os.getloadavg()),
        "quietIsolation": "not externally isolated; observed load is recorded",
    }


def source_closure(repository: Path, panel_path: Path) -> dict:
    paths = [
        CRATE / "Cargo.toml",
        CRATE / "Cargo.lock",
        HERE / "run.py",
        panel_path,
        ROOT_CRATE / "Cargo.toml",
        ROOT_CRATE / "Cargo.lock",
        ROOT_CRATE / "build.rs",
        PRODUCT_IMAGINARY_SOURCE,
    ]
    paths.extend(sorted((CRATE / "src").rglob("*.rs")))
    paths.extend(sorted((ROOT_CRATE / "src").rglob("*.rs")))
    paths.extend(sorted((ROOT_CRATE / "src").rglob("*.c")))
    entries = [
        {
            "path": path.relative_to(repository).as_posix(),
            "sha256": sha256(path),
            "bytes": path.stat().st_size,
        }
        for path in sorted(set(paths))
    ]
    encoded = json.dumps(entries, separators=(",", ":"), sort_keys=True).encode()
    status = command(
        "git",
        "status",
        "--porcelain=v1",
        "--",
        *(entry["path"] for entry in entries),
        cwd=repository,
    ).stdout
    return {
        "algorithm": "sha256-canonical-json-file-list-v1",
        "rootSha256": hashlib.sha256(encoded).hexdigest(),
        "files": entries,
        "reachableSourceStatusPorcelain": status,
        "containsDirtyReachableSources": bool(status),
    }


def verify_rust(
    sample: dict, field: dict, boundary_label: str, computations: int = 1
) -> None:
    expected = field["expected"]
    assert sample["schema"] == "sagejs.public-quadratic/benchmark-sample-v1"
    assert sample["boundaryLabel"] == boundary_label
    assert sample["polynomialAscending"] == field["polynomialAscending"]
    assert sample["computations"] == computations
    assert sample["result"] == expected
    assert sample["proofStatus"] == "unconditional-complete"
    assert sample["runtimeUsesPariOrFixtureAnswers"] is False


def verify_pari(sample: dict, field: dict, boundary_label: str) -> None:
    expected = field["expected"]
    projected = sample["result"]
    assert sample["fieldId"] == field["id"]
    assert sample["boundaryKind"] == "public-call"
    assert sample["boundaryLabel"] == boundary_label
    assert sample["detail"]["discriminant"] == str(expected["discriminant"])
    assert projected["classNumber"] == str(expected["classNumber"])
    assert projected["invariantFactors"] == [
        str(value) for value in expected["invariantFactors"]
    ]
    assert sample["call"]["pariVersion"] == ["2", "17", "4"]
    assert sample["call"]["noPariInProductPath"] is True


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--panel", default=PANEL_PATH.name)
    parser.add_argument("--receipt", default=RECEIPT_PATH.name)
    arguments = parser.parse_args()
    panel_path = (HERE / arguments.panel).resolve()
    receipt_path = (HERE / arguments.receipt).resolve()
    if panel_path.parent != HERE or receipt_path.parent != HERE:
        parser.error("panel and receipt must be files in the benchmark directory")
    panel_bytes = panel_path.read_bytes()
    panel = json.loads(panel_bytes)
    assert panel["frozenBeforeTiming"] is True
    count = panel["samplesPerArmPerField"]
    assert count >= 15
    if not PARI_CONTROL.is_file() or not PARI_IDENTITY.is_file():
        raise SystemExit(
            "authenticated PARI control is missing; run ../pari-control/build.py"
        )

    repository = Path(command("git", "rev-parse", "--show-toplevel").stdout.strip())
    source = source_closure(repository, panel_path)
    build_environment = dict(os.environ)
    build_environment.update({"CARGO_INCREMENTAL": "0", "SOURCE_DATE_EPOCH": "1"})
    builds = []
    for target, binary in [
        (CRATE / "target" / "benchmark-repro-a", REPRO_A),
        (CRATE / "target" / "benchmark-repro-b", REPRO_B),
    ]:
        # These exact benchmark-owned directories are removed so both identity
        # builds start from empty target trees, never from incremental residue.
        shutil.rmtree(target, ignore_errors=True)
        environment = dict(build_environment, CARGO_TARGET_DIR=str(target))
        completed = command(
            "cargo",
            "build",
            "--locked",
            "--release",
            "--bin",
            "benchmark_public",
            env=environment,
        )
        builds.append(
            {
                "command": "cargo build --locked --release --bin benchmark_public",
                "cargoTargetDir": str(target.relative_to(CRATE)),
                "stderr": completed.stderr,
                "binarySha256": sha256(binary),
            }
        )
    reproducible_binary = builds[0]["binarySha256"] == builds[1]["binarySha256"]
    if not reproducible_binary:
        raise RuntimeError(
            "two clean-target release builds produced different binaries"
        )

    context_before = execution_context()
    raw_samples: list[dict] = []
    summaries: list[dict] = []
    for field_index, field in enumerate(panel["fields"]):
        arm_values: dict[str, list[int]] = {"rust": [], "pari": []}
        for pair in range(count):
            order = ["rust", "pari"] if pair % 2 == 0 else ["pari", "rust"]
            for position, arm in enumerate(order):
                before = time.monotonic_ns()
                if arm == "rust":
                    completed = command(REPRO_A, *field["polynomialAscending"])
                    sample = json.loads(completed.stdout)
                    verify_rust(sample, field, panel["boundary"]["rust"])
                    kernel_ns = int(sample["kernelNanoseconds"])
                else:
                    seed = 2_026_092_000 + field_index * 100 + pair
                    completed = command(
                        PARI_CONTROL,
                        "public-call",
                        field["pariPolynomial"],
                        field["id"],
                        seed,
                    )
                    sample = json.loads(completed.stdout)
                    verify_pari(sample, field, panel["boundary"]["pari"])
                    kernel_ns = int(sample["kernelNanoseconds"])
                external_ns = time.monotonic_ns() - before
                arm_values[arm].append(kernel_ns)
                raw_samples.append(
                    {
                        "fieldId": field["id"],
                        "pairOneBased": pair + 1,
                        "positionInPairOneBased": position + 1,
                        "arm": arm,
                        "kernelNanoseconds": kernel_ns,
                        "externalProcessNanosecondsExcluded": external_ns,
                        "exactOutputChecked": True,
                        "boundaryLabelAsserted": sample["boundaryLabel"],
                    }
                )
        rust_median = median(arm_values["rust"])
        pari_median = median(arm_values["pari"])
        ratio = rust_median / pari_median
        summaries.append(
            {
                "fieldId": field["id"],
                "traits": field["traits"],
                "rustKernelNanoseconds": arm_values["rust"],
                "pariKernelNanoseconds": arm_values["pari"],
                "rustMedianNanoseconds": rust_median,
                "pariMedianNanoseconds": pari_median,
                "rustOverPariMedianRatio": ratio,
                "observedPariBand": "under-5ms"
                if pari_median < 5_000_000
                else ("5-to-100ms" if pari_median <= 100_000_000 else "over-100ms"),
                "tinyFieldTargetPass": (
                    rust_median <= max(2 * pari_median, pari_median + 2_000_000)
                    if pari_median < 5_000_000
                    else None
                ),
                "nativeIndividualRatioAtMost3Pass": ratio <= 3
                if pari_median >= 5_000_000
                else None,
            }
        )

    batch = panel["tinyBatchThroughput"]
    batch_fields = {field["id"]: field for field in panel["fields"]}
    batch_summaries = []
    for field_id in batch["fieldIds"]:
        field = batch_fields[field_id]
        samples = []
        for sample_index in range(batch["samplesPerField"]):
            completed = command(
                REPRO_A,
                "--batch",
                batch["computationsPerSample"],
                *field["polynomialAscending"],
            )
            result = json.loads(completed.stdout)
            verify_rust(
                result,
                field,
                panel["boundary"]["rust"],
                batch["computationsPerSample"],
            )
            samples.append(int(result["kernelNanoseconds"]))
        batch_median = median(samples)
        batch_summaries.append(
            {
                "fieldId": field_id,
                "computationsPerSample": batch["computationsPerSample"],
                "kernelNanoseconds": samples,
                "medianBatchNanoseconds": batch_median,
                "medianNanosecondsPerComputation": batch_median
                / batch["computationsPerSample"],
                "medianComputationsPerSecond": batch["computationsPerSample"]
                * 1_000_000_000
                / batch_median,
                "everyComputationReconstructedAndVerified": True,
                "boundaryLabelAsserted": panel["boundary"]["rust"],
            }
        )

    context_after = execution_context()

    ratios = [entry["rustOverPariMedianRatio"] for entry in summaries]
    medium = [entry for entry in summaries if entry["observedPariBand"] == "5-to-100ms"]
    tiny = [entry for entry in summaries if entry["observedPariBand"] == "under-5ms"]
    rustc = command("rustc", "--version", "--verbose").stdout.strip()
    cargo = command("cargo", "--version", "--verbose").stdout.strip()
    git_commit = command("git", "rev-parse", "HEAD", cwd=CRATE).stdout.strip()
    git_status = command("git", "status", "--porcelain=v1", cwd=CRATE).stdout
    evidence_status = (
        "pre-promotion-dirty-source-bound-by-content-not-commit"
        if source["containsDirtyReachableSources"] or git_status
        else "promotion-candidate-clean-frozen-source"
    )
    receipt = {
        "schema": "sagejs.public-quadratic/native-pari-benchmark-receipt-v1",
        "qualificationOnly": True,
        "evidenceStatus": evidence_status,
        "promotionEligible": evidence_status
        == "promotion-candidate-clean-frozen-source",
        "panelSha256": hashlib.sha256(panel_bytes).hexdigest(),
        "panel": panel,
        "method": {
            "pairsPerField": count,
            "alternation": "Rust,PARI on odd one-based pairs; PARI,Rust on even pairs",
            "freshComputation": "Every sample launches a fresh process and reconstructs from public coefficients; neither executable has a result cache.",
            "nativeThreading": "Rust cyclic and C2 x C(h/2) map construction for h>=10000 uses up to eight OS workers, capped by available parallelism. Native reduced-form enumeration and scalar class-number counting use up to eight workers when the candidate range has at least 20000 entries. Large eligible cyclic groups may use a proved full-order prime-form orbit collected with up to eight native workers in place of separate enumeration and map traversal. Smaller Rust cases and Wasm use one worker. PARI has no matched worker pool, so ratios compare wall time, not equal CPU work.",
            "timing": "Reported kernel clocks exclude process startup and JSON projection. Rust includes coefficient validation, maximal-order preparation, enumeration, group construction, certificate construction, and internal verification. PARI includes nfinit0 plus bnfinit0 flag zero.",
            "correctness": "Every sample is checked for its exact arm-specific boundaryLabel and against the frozen discriminant, class number, and normalized invariant factors before its time is retained.",
            "warmups": 0,
        },
        "samples": raw_samples,
        "fields": summaries,
        "tinyBatchThroughput": {
            "comparisonStatus": "rust-only-throughput; not a Rust/PARI ratio",
            "method": "Each sample is one fresh process; inside it every coefficient-only computation independently reconstructs and verifies the complete result without a result cache.",
            "fields": batch_summaries,
        },
        "aggregate": {
            "geometricMeanRustOverPariMedianRatio": statistics.geometric_mean(ratios),
            "p90RustOverPariMedianRatioNearestRank": percentile_nearest_rank(
                ratios, 0.9
            ),
            "tinyFieldCount": len(tiny),
            "tinyFieldTarget": "rust median <= max(2*PARI median, PARI median + 2ms)",
            "tinyFieldTargetPass": bool(tiny)
            and all(entry["tinyFieldTargetPass"] for entry in tiny),
            "pari5To100msFieldCount": len(medium),
            "pari5To100msCoveragePass": bool(medium),
            "nativeTarget": "on PARI>=5ms fields: geometric mean ratio <=1.5, p90 ratio <=2, and each ratio <=3",
            "nativeTargetPass": bool(medium)
            and (
                statistics.geometric_mean(
                    [entry["rustOverPariMedianRatio"] for entry in medium]
                )
                <= 1.5
                and percentile_nearest_rank(
                    [entry["rustOverPariMedianRatio"] for entry in medium], 0.9
                )
                <= 2
                and all(entry["rustOverPariMedianRatio"] <= 3 for entry in medium)
            ),
        },
        "identity": {
            "host": {
                "platform": platform.platform(),
                "machine": platform.machine(),
                "processor": platform.processor(),
                "node": platform.node(),
            },
            "executionContextBefore": context_before,
            "executionContextAfter": context_after,
            "python": sys.version,
            "rustcVersionVerbose": rustc,
            "cargoVersionVerbose": cargo,
            "releaseBuilds": builds,
            "releaseBuildEnvironment": {
                name: build_environment.get(name)
                for name in [
                    "CARGO_INCREMENTAL",
                    "SOURCE_DATE_EPOCH",
                    "RUSTFLAGS",
                    "CARGO_ENCODED_RUSTFLAGS",
                    "RUSTC_WRAPPER",
                    "CARGO_BUILD_TARGET",
                ]
            },
            "retainedRustBinary": str(REPRO_A.relative_to(CRATE)),
            "retainedRustBinarySha256": sha256(REPRO_A),
            "independentCleanTargetBinaryHashesMatch": reproducible_binary,
            "pariControlBinarySha256": sha256(PARI_CONTROL),
            "pariBuildIdentity": json.loads(PARI_IDENTITY.read_text()),
            "sourceClosure": source,
            "gitCommit": git_commit,
            "gitDirty": bool(git_status),
            "gitStatusPorcelainSha256": hashlib.sha256(git_status.encode()).hexdigest(),
            "gitCommitBinding": "informational-only when evidenceStatus is pre-promotion; sourceClosure is authoritative",
        },
        "promotion": {
            "step1": "Integration owner commits/freezes engine, benchmark adapter, runner, panel, manifests, and lockfiles without this pre-promotion receipt.",
            "step2": "From a clean checkout of that frozen commit, rerun benchmark/run.py; require promotionEligible=true, matching clean source-closure status, reproducible binary hashes, and all exact checks before separately committing the generated receipt.",
        },
    }
    temporary = receipt_path.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n")
    os.replace(temporary, receipt_path)
    print(json.dumps(receipt["aggregate"], indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
