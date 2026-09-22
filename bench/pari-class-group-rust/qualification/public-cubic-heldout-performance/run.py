#!/usr/bin/env python3
"""Run a redacted alternating Rust/PARI campaign on held-out cubics."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import math
import os
import platform
import statistics
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Any


HERE = Path(__file__).resolve().parent
QUALIFICATION = HERE.parent
ROOT_CRATE = QUALIFICATION.parent
PUBLIC_CRATE = QUALIFICATION / "public-cubic-e2e"
HELDOUT = QUALIFICATION / "public-cubic-heldout-corpus"
HELDOUT_CONFIG = HELDOUT / "config.json"
HELDOUT_RUNNER = HELDOUT / "run.py"
RESOURCE_PROFILE = PUBLIC_CRATE / "resource-profiles" / "conditional-grh-cubic-v2.json"
PARI_RUN = QUALIFICATION / "pari-control" / "run.py"
PARI_BUILD_IDENTITY = QUALIFICATION / "pari-control" / "build" / "build-identity.json"
PARI_PIN = QUALIFICATION / "pari-control" / "pinned-identity.json"
RECEIPT_PATH = HERE / "receipt.json"
BINARY_NAME = "sagejs-public-cubic-class-group-e2e-qualification"
SAMPLES = 15
WARMUPS = 1
SCHEMA = "sagejs.rust-class-group/heldout-cubic-alternating-benchmark-v1"
FORBIDDEN_KEYS = {
    "polynomialAscending",
    "coefficientsAscending",
    "classNumber",
    "invariantFactors",
    "discriminant",
    "signature",
    "unitRank",
    "expected",
    "exactResultSha256",
    "exactResultCanonicalJson",
    "stdout",
    "stderr",
}


def load_support() -> Any:
    spec = importlib.util.spec_from_file_location("heldout_support", HELDOUT_RUNNER)
    if spec is None or spec.loader is None:
        raise RuntimeError("cannot load held-out support")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


SUPPORT = load_support()


def command(
    arguments: list[object],
    *,
    cwd: Path,
    input_text: str | None = None,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [str(value) for value in arguments],
        cwd=cwd,
        input=input_text,
        check=True,
        text=True,
        capture_output=True,
    )


def canonical(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def percentile(values: list[float], fraction: float) -> float:
    ordered = sorted(values)
    index = math.ceil(fraction * len(ordered)) - 1
    return ordered[max(0, min(index, len(ordered) - 1))]


def assert_redacted(value: Any) -> None:
    if isinstance(value, dict):
        forbidden = FORBIDDEN_KEYS.intersection(value)
        if forbidden:
            raise RuntimeError(f"receipt contains forbidden keys: {sorted(forbidden)}")
        for child in value.values():
            assert_redacted(child)
    elif isinstance(value, list):
        for child in value:
            assert_redacted(child)


def source_closure(repository: Path) -> dict[str, Any]:
    paths = [
        ROOT_CRATE / "Cargo.toml",
        ROOT_CRATE / "Cargo.lock",
        ROOT_CRATE / "build.rs",
        PUBLIC_CRATE / "Cargo.toml",
        PUBLIC_CRATE / "Cargo.lock",
        HELDOUT_CONFIG,
        HELDOUT_RUNNER,
        RESOURCE_PROFILE,
        PARI_RUN,
        PARI_BUILD_IDENTITY,
        PARI_PIN,
        HERE / "README.md",
        HERE / "run.py",
    ]
    paths.extend(sorted((ROOT_CRATE / "src").glob("*.rs")))
    paths.extend(sorted((ROOT_CRATE / "src").glob("*.c")))
    paths.extend(sorted((PUBLIC_CRATE / "src").glob("*.rs")))
    entries = [
        {
            "path": path.relative_to(repository).as_posix(),
            "bytes": path.stat().st_size,
            "sha256": digest(path),
        }
        for path in sorted(set(paths))
    ]
    status = command(
        [
            "git",
            "status",
            "--porcelain=v1",
            "--untracked-files=all",
            "--",
            *[entry["path"] for entry in entries],
        ],
        cwd=repository,
    ).stdout
    return {
        "algorithm": "sha256-canonical-json-file-list-v1",
        "rootSha256": hashlib.sha256(canonical(entries).encode()).hexdigest(),
        "files": entries,
        "statusPorcelain": status,
        "clean": not status,
    }


def selected_cases() -> tuple[list[dict[str, Any]], Path, Path]:
    config = SUPPORT.load_json(HELDOUT_CONFIG)
    SUPPORT.validate_config(config)
    selected, _, panel_path, selection_path = SUPPORT.validate_selection(config)
    return (
        sorted(selected, key=lambda case: case["fieldId"]),
        panel_path,
        selection_path,
    )


def validate_profile() -> dict[str, Any]:
    profile = SUPPORT.load_json(RESOURCE_PROFILE)
    if (
        profile.get("schema")
        != "sagejs.rust-class-group/public-cubic-resource-profile-v2"
    ):
        raise RuntimeError("unexpected resource-profile schema")
    if profile.get("profileId") != "conditional-grh-cubic-compact-64-v2":
        raise RuntimeError("unexpected resource profile")
    resources = profile.get("publicResources")
    if (
        not isinstance(resources, dict)
        or resources.get("maximumCompactSurplusRows") != 64
    ):
        raise RuntimeError("resource profile does not admit compact-64")
    return resources


def build_binary(repository: Path) -> tuple[Path, dict[str, Any]]:
    started = time.monotonic_ns()
    completed = command(
        [
            "cargo",
            "build",
            "--locked",
            "--release",
            "--manifest-path",
            PUBLIC_CRATE / "Cargo.toml",
        ],
        cwd=repository,
    )
    elapsed = time.monotonic_ns() - started
    binary = PUBLIC_CRATE / "target" / "release" / BINARY_NAME
    linkage = command(["ldd", binary], cwd=repository).stdout
    if "pari" in linkage.lower():
        raise RuntimeError("Rust product executable links PARI")
    return binary, {
        "kind": "cargo-build-locked-release",
        "nanoseconds": elapsed,
        "binaryBytes": binary.stat().st_size,
        "binarySha256": digest(binary),
        "linkageSha256": hashlib.sha256(linkage.encode()).hexdigest(),
        "linksPari": False,
        "compilerMessagesSha256": hashlib.sha256(completed.stderr.encode()).hexdigest(),
    }


def rust_sample(
    binary: Path, request: str
) -> tuple[int, dict[str, int], dict[str, Any]]:
    sample = json.loads(command([binary], cwd=PUBLIC_CRATE, input_text=request).stdout)
    if (
        sample.get("schema") != "sagejs.rust-class-group/public-cubic-e2e-receipt-v2"
        or sample.get("outcome") != "complete-conditional-grh"
        or sample.get("publicComplete") is not True
        or sample.get("usesPariInput") is not False
        or sample.get("usesPreparedFixture") is not False
        or sample.get("usesFieldAnswersAsInput") is not False
        or sample.get("completion", {}).get("sealedEvidenceVerified") is not True
    ):
        raise RuntimeError("Rust sample did not reach the sealed public boundary")
    timings = sample["stageTimingsNanoseconds"]
    return int(timings["totalToSealedResult"]), timings, sample


def pari_sample(
    repository: Path, field_path: Path, field_id: str, seed: str
) -> tuple[int, dict[str, int], dict[str, Any]]:
    sample = json.loads(
        command(
            [
                PARI_RUN,
                "--input",
                field_path,
                "--field-id",
                field_id,
                "--boundary",
                "public-call",
                "--seed",
                seed,
            ],
            cwd=repository,
        ).stdout
    )
    if (
        sample.get("schema") != "sagejs.rust-class-group/pari-control-sample-v1"
        or sample.get("boundaryKind") != "public-call"
        or sample.get("boundaryLabel")
        != "public-call/pari-nfinit0-plus-bnfinit0-flag-zero-v1"
        or sample.get("call", {}).get("pariVersion") != ["2", "17", "4"]
        or sample.get("call", {}).get("noPariInProductPath") is not True
    ):
        raise RuntimeError("PARI sample has another control identity or boundary")
    return int(sample["kernelNanoseconds"]), sample["stageTimingsNanoseconds"], sample


def exact_match(rust: dict[str, Any], pari: dict[str, Any]) -> bool:
    result = pari.get("result", {})
    detail = pari.get("detail", {})
    preparation = rust.get("preparation", {})
    candidate = rust.get("candidate", {})
    completion = rust.get("completion", {})
    return all(
        (
            candidate.get("classNumber") == result.get("classNumber"),
            candidate.get("invariantFactors") == result.get("invariantFactors"),
            completion.get("classNumber") == result.get("classNumber"),
            completion.get("invariantFactors") == result.get("invariantFactors"),
            preparation.get("discriminant") == detail.get("discriminant"),
            [str(value) for value in preparation.get("signature", [])]
            == detail.get("signature"),
            str(completion.get("unitRank")) == detail.get("unitRank"),
        )
    )


def stage_medians(samples: list[dict[str, int]]) -> dict[str, float]:
    keys = set(samples[0])
    if any(set(sample) != keys for sample in samples):
        raise RuntimeError("stage-timing shape changed during campaign")
    return {
        key: statistics.median(sample[key] for sample in samples)
        for key in sorted(keys)
    }


def main() -> int:
    repository = SUPPORT.repository_root()
    cases, panel_path, selection_path = selected_cases()
    resources = validate_profile()
    if len(cases) != 12:
        raise RuntimeError("held-out performance panel is not twelve fields")
    affinity = (
        sorted(os.sched_getaffinity(0)) if hasattr(os, "sched_getaffinity") else []
    )
    if affinity:
        os.sched_setaffinity(0, {affinity[0]})
    source = source_closure(repository)
    if not source["clean"]:
        raise RuntimeError("performance source closure is dirty")
    binary, build = build_binary(repository)
    pari_identity: dict[str, Any] | None = None
    fields = []
    raw_samples = []
    with tempfile.TemporaryDirectory(
        prefix="sagejs-heldout-cubic-performance-"
    ) as temp:
        temporary = Path(temp)
        for field_index, case in enumerate(cases):
            field_id = case["fieldId"]
            coefficients = case["field"]["coefficientsAscending"]
            field_path = temporary / f"field-{field_index}.json"
            field_path.write_text(
                canonical({"fieldId": field_id, "polynomialAscending": coefficients})
                + "\n"
            )
            request = canonical(
                {
                    "schema": "sagejs.rust-class-group/public-cubic-e2e-request-v2",
                    "polynomialAscending": coefficients,
                    "proofMode": "conditional-grh",
                    "resources": resources,
                }
            )
            for warmup in range(WARMUPS):
                _, _, rust = rust_sample(binary, request)
                _, _, pari = pari_sample(
                    repository, field_path, field_id, f"warmup-{field_index}-{warmup}"
                )
                if not exact_match(rust, pari):
                    raise RuntimeError("warmup exact results differ")
                pari_identity = pari["controlIdentity"]
            totals: dict[str, list[int]] = {"rust": [], "pari": []}
            stages: dict[str, list[dict[str, int]]] = {"rust": [], "pari": []}
            pending: dict[int, dict[str, Any]] = {}
            for pair in range(SAMPLES):
                order = ("rust", "pari") if pair % 2 == 0 else ("pari", "rust")
                for position, arm in enumerate(order):
                    external_started = time.monotonic_ns()
                    if arm == "rust":
                        total, stage, sample = rust_sample(binary, request)
                    else:
                        total, stage, sample = pari_sample(
                            repository,
                            field_path,
                            field_id,
                            f"heldout-performance-{field_index}-{pair}",
                        )
                        if (
                            pari_identity is not None
                            and sample["controlIdentity"] != pari_identity
                        ):
                            raise RuntimeError(
                                "PARI control identity changed during campaign"
                            )
                        pari_identity = sample["controlIdentity"]
                    external = time.monotonic_ns() - external_started
                    totals[arm].append(total)
                    stages[arm].append(
                        {key: int(value) for key, value in stage.items()}
                    )
                    pending.setdefault(pair, {})[arm] = sample
                    raw_samples.append(
                        {
                            "fieldId": field_id,
                            "pairOneBased": pair + 1,
                            "positionInPairOneBased": position + 1,
                            "arm": arm,
                            "kernelNanoseconds": total,
                            "stageTimingsNanoseconds": stage,
                            "externalProcessNanosecondsExcluded": external,
                        }
                    )
                if not exact_match(pending[pair]["rust"], pending[pair]["pari"]):
                    raise RuntimeError("measured exact results differ")
            rust_median = statistics.median(totals["rust"])
            pari_median = statistics.median(totals["pari"])
            fields.append(
                {
                    "fieldId": field_id,
                    "exactMatchEverySample": True,
                    "rustKernelNanoseconds": totals["rust"],
                    "pariKernelNanoseconds": totals["pari"],
                    "rustMedianNanoseconds": rust_median,
                    "pariMedianNanoseconds": pari_median,
                    "rustOverPariMedianRatio": rust_median / pari_median,
                    "rustStageMediansNanoseconds": stage_medians(stages["rust"]),
                    "pariStageMediansNanoseconds": stage_medians(stages["pari"]),
                }
            )
    final_source = source_closure(repository)
    if final_source["rootSha256"] != source["rootSha256"] or not final_source["clean"]:
        raise RuntimeError("source closure changed during campaign")
    ratios = [field["rustOverPariMedianRatio"] for field in fields]
    rust_sum = sum(field["rustMedianNanoseconds"] for field in fields)
    pari_sum = sum(field["pariMedianNanoseconds"] for field in fields)
    context = {
        "capturedAtUnixNanoseconds": time.time_ns(),
        "platform": platform.platform(),
        "python": platform.python_version(),
        "cpuModel": next(
            (
                line.split(":", 1)[1].strip()
                for line in Path("/proc/cpuinfo").read_text().splitlines()
                if line.startswith("model name")
            ),
            None,
        ),
        "logicalCpuCount": os.cpu_count(),
        "inheritedAffinityLogicalCpus": affinity,
        "measurementLogicalCpu": affinity[0] if affinity else None,
        "loadAverage1m5m15m": list(os.getloadavg()),
    }
    receipt = {
        "schema": SCHEMA,
        "status": "passed",
        "answerDisclosure": "none",
        "boundary": {
            "rust": "public-coefficients-to-sealed-conditional-class-group-v2",
            "pari": "public-call/pari-nfinit0-plus-bnfinit0-flag-zero-v1",
            "processStartupAndSerialization": "excluded-by-in-process-kernel-clocks",
        },
        "gitCommit": command(
            ["git", "rev-parse", "HEAD"], cwd=repository
        ).stdout.strip(),
        "sourceClosure": source,
        "panelSha256": digest(panel_path),
        "selectionReceiptSha256": digest(selection_path),
        "historicalHeldoutConfigSha256": digest(HELDOUT_CONFIG),
        "resourceProfileSha256": digest(RESOURCE_PROFILE),
        "build": build,
        "pariControlIdentity": pari_identity,
        "samplesPerArmPerField": SAMPLES,
        "warmupsPerArmPerFieldExcluded": WARMUPS,
        "alternation": "even pairs Rust then PARI; odd pairs PARI then Rust",
        "executionContext": context,
        "caseCount": len(fields),
        "allExactResultsMatched": True,
        "aggregate": {
            "rustMedianSumNanoseconds": rust_sum,
            "pariMedianSumNanoseconds": pari_sum,
            "weightedRustOverPariRatio": rust_sum / pari_sum,
            "geometricMeanRustOverPariRatio": math.exp(
                statistics.mean(math.log(ratio) for ratio in ratios)
            ),
            "medianRustOverPariRatio": statistics.median(ratios),
            "p90RustOverPariRatio": percentile(ratios, 0.9),
            "maximumRustOverPariRatio": max(ratios),
        },
        "fields": fields,
        "rawSamples": raw_samples,
    }
    assert_redacted(receipt)
    SUPPORT.atomic_json(RECEIPT_PATH, receipt, private=False)
    print(
        canonical(
            {
                "status": receipt["status"],
                "caseCount": receipt["caseCount"],
                "allExactResultsMatched": receipt["allExactResultsMatched"],
                "aggregate": receipt["aggregate"],
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
