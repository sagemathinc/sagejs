#!/usr/bin/env python3
"""Run all frozen open cubics through the coefficient-only Rust boundary."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import resource
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Any


HERE = Path(__file__).resolve().parent
QUALIFICATION = HERE.parent
ROOT_CRATE = QUALIFICATION.parent
PUBLIC_CRATE = QUALIFICATION / "public-cubic-e2e"
CONFIG_PATH = HERE / "config.json"
DEFAULT_RECEIPT = HERE / "receipt.json"
BINARY_NAME = "sagejs-public-cubic-class-group-e2e-qualification"
REQUEST_SCHEMA = "sagejs.rust-class-group/public-cubic-e2e-request-v2"
RESULT_SCHEMA = "sagejs.rust-class-group/public-cubic-e2e-receipt-v2"
RECEIPT_SCHEMA = "sagejs.rust-class-group/public-cubic-open-corpus-receipt-v1"


def run(
    arguments: list[object],
    *,
    cwd: Path,
    input_text: str | None = None,
    timeout_seconds: float | None = None,
    memory_bytes: int | None = None,
) -> subprocess.CompletedProcess[str]:
    def set_limits() -> None:
        if memory_bytes is not None:
            resource.setrlimit(resource.RLIMIT_AS, (memory_bytes, memory_bytes))

    return subprocess.run(
        [str(value) for value in arguments],
        cwd=cwd,
        input=input_text,
        check=False,
        text=True,
        capture_output=True,
        timeout=timeout_seconds,
        preexec_fn=set_limits if memory_bytes is not None else None,
    )


def load_json(path: Path) -> Any:
    with path.open(encoding="utf-8") as source:
        return json.load(source)


def canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def repository_root() -> Path:
    completed = run(["git", "rev-parse", "--show-toplevel"], cwd=HERE)
    if completed.returncode != 0:
        raise RuntimeError(completed.stderr.strip() or "cannot locate repository root")
    return Path(completed.stdout.strip()).resolve()


def relative(path: Path, repository: Path) -> str:
    return path.resolve().relative_to(repository).as_posix()


def validate_selection(
    config: dict[str, Any],
) -> tuple[dict[str, Any], list[dict[str, Any]], dict[str, Any]]:
    panel_path = (HERE / config["panel"]).resolve()
    selection_path = (HERE / config["selectionReceipt"]).resolve()
    panel = load_json(panel_path)
    selection = load_json(selection_path)
    if panel.get("schema") != "sagejs.rust-class-group/qualified-neutral-panel-v1":
        raise RuntimeError("unexpected qualified panel schema")
    if panel.get("status") != "r0-fully-qualified-input-panel":
        raise RuntimeError("qualified panel is not frozen and complete")
    if selection.get("status") != "passed":
        raise RuntimeError("qualification selection receipt did not pass")
    panel_hash = sha256_file(panel_path)
    if selection.get("qualifiedNeutralPanelSha256") != panel_hash:
        raise RuntimeError("selection receipt does not bind the qualified panel")
    partitions = panel.get("partitions")
    if not isinstance(partitions, dict) or set(partitions) != {"open", "heldOut"}:
        raise RuntimeError("qualified panel partitions changed")
    for partition in ("open", "heldOut"):
        cases = partitions[partition].get("cases")
        if not isinstance(cases, list) or len(cases) != 60:
            raise RuntimeError(f"{partition} partition does not contain 60 cases")
        degree_counts: dict[int, int] = {}
        for case in cases:
            degree = case.get("field", {}).get("degree")
            degree_counts[degree] = degree_counts.get(degree, 0) + 1
            if case.get("containsOracleAnswers") is not False:
                raise RuntimeError(f"{partition} input contains oracle answers")
        if degree_counts != {2: 12, 3: 12, 4: 12, 5: 12, 6: 12}:
            raise RuntimeError(f"{partition} degree quotas changed: {degree_counts}")
    selected = [
        case
        for case in partitions[config["partition"]]["cases"]
        if case["field"]["degree"] == config["degree"]
    ]
    if len(selected) != config["expectedCaseCount"]:
        raise RuntimeError(
            "selected cubic count does not match the frozen configuration"
        )
    ids = [case["fieldId"] for case in selected]
    if len(ids) != len(set(ids)):
        raise RuntimeError("selected field IDs are not unique")
    return panel, selected, selection


def source_closure(repository: Path) -> dict[str, Any]:
    paths = [
        HERE / "README.md",
        HERE / "config.json",
        HERE / "run.py",
        QUALIFICATION / "corpus" / "qualified-neutral-panel-v1.json",
        QUALIFICATION / "corpus" / "qualification-selection-receipt-v1.json",
        PUBLIC_CRATE / "Cargo.toml",
        PUBLIC_CRATE / "Cargo.lock",
        ROOT_CRATE / "Cargo.toml",
        ROOT_CRATE / "Cargo.lock",
        ROOT_CRATE / "build.rs",
    ]
    paths.extend(sorted((PUBLIC_CRATE / "src").rglob("*.rs")))
    paths.extend(sorted((ROOT_CRATE / "src").rglob("*.rs")))
    paths.extend(sorted((ROOT_CRATE / "src").rglob("*.c")))
    entries = [
        {
            "path": relative(path, repository),
            "bytes": path.stat().st_size,
            "sha256": sha256_file(path),
        }
        for path in sorted(set(paths))
    ]
    completed = run(
        [
            "git",
            "status",
            "--porcelain=v1",
            "--",
            *[entry["path"] for entry in entries],
        ],
        cwd=repository,
    )
    if completed.returncode != 0:
        raise RuntimeError(completed.stderr.strip() or "cannot inspect source closure")
    return {
        "algorithm": "sha256-canonical-json-file-list-v1",
        "rootSha256": sha256_bytes(canonical_json(entries).encode()),
        "files": entries,
        "reachableSourceStatusPorcelain": completed.stdout,
        "containsDirtyReachableSources": bool(completed.stdout),
    }


def verify_result(result: dict[str, Any]) -> None:
    if result.get("schema") != RESULT_SCHEMA:
        raise RuntimeError("unexpected public cubic result schema")
    if (
        result.get("outcome") != "complete-conditional-grh"
        or result.get("publicComplete") is not True
    ):
        raise RuntimeError("public cubic computation did not complete")
    if result.get("requestedProof") != "conditional-grh":
        raise RuntimeError("public cubic computation changed proof mode")
    for forbidden in (
        "usesPariInput",
        "usesPreparedFixture",
        "usesFieldAnswersAsInput",
    ):
        if result.get(forbidden) is not False:
            raise RuntimeError(
                f"public cubic result reports forbidden input: {forbidden}"
            )
    if "firstUnavailableBoundary" in result:
        raise RuntimeError("complete result names an unavailable boundary")
    preparation = result.get("preparation", {})
    relations = result.get("relations", {})
    candidate = result.get("candidate", {})
    completion = result.get("completion", {})
    if preparation.get("certificateVerified") is not True:
        raise RuntimeError("maximal-order certificate was not verified")
    if (
        relations.get("completeRankAndSurplus") is not True
        or relations.get("missingRank") != 0
    ):
        raise RuntimeError(
            "relation collection did not reach complete rank and surplus"
        )
    if candidate.get("authenticatedPrincipalRelations") != relations.get(
        "relationCount"
    ):
        raise RuntimeError("candidate relation count is not authenticated")
    if candidate.get("classNumber") != completion.get("classNumber"):
        raise RuntimeError("candidate and completion class numbers differ")
    if candidate.get("invariantFactors") != completion.get("invariantFactors"):
        raise RuntimeError("candidate and completion invariants differ")
    if completion.get("proof") != "conditional-grh":
        raise RuntimeError("completion does not carry the requested proof status")
    if completion.get("sealedEvidenceVerified") is not True:
        raise RuntimeError("sealed completion evidence did not replay")
    if completion.get("arbitraryIdealClassMapRetained") is not True:
        raise RuntimeError("completed class group did not retain its class map")
    signature = preparation.get("signature")
    if not isinstance(signature, list) or len(signature) != 2:
        raise RuntimeError("invalid cubic signature")
    if completion.get("unitRank") != signature[0] + signature[1] - 1:
        raise RuntimeError("unit rank does not match the signature")
    timings = result.get("stageTimingsNanoseconds", {})
    expected_timings = {
        "publicInputAndPreparation",
        "relationCollection",
        "candidateAuthentication",
        "unitAndAnalyticCompletion",
        "totalToSealedResult",
    }
    if set(timings) != expected_timings or any(
        not isinstance(value, int) or value < 0 for value in timings.values()
    ):
        raise RuntimeError("invalid stage timings")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--receipt", type=Path, default=DEFAULT_RECEIPT)
    parser.add_argument(
        "--binary", type=Path, help="use a prebuilt public cubic executable"
    )
    arguments = parser.parse_args()
    repository = repository_root()
    config = load_json(CONFIG_PATH)
    if (
        config.get("schema")
        != "sagejs.rust-class-group/public-cubic-open-corpus-config-v1"
    ):
        raise RuntimeError("unexpected corpus-run configuration schema")
    _, selected, selection = validate_selection(config)

    corpus_validation = run(
        ["python3", QUALIFICATION / "corpus" / "corpus_tool.py", "validate"],
        cwd=repository,
    )
    if corpus_validation.returncode != 0:
        raise RuntimeError(
            corpus_validation.stderr.strip() or "frozen corpus validation failed"
        )

    closure = source_closure(repository)
    build_start = time.monotonic_ns()
    if arguments.binary is None:
        build = run(
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
        if build.returncode != 0:
            raise RuntimeError(
                build.stderr.strip() or "public cubic release build failed"
            )
        binary = PUBLIC_CRATE / "target" / "release" / BINARY_NAME
        build_command = "cargo build --locked --release"
    else:
        build = subprocess.CompletedProcess([], 0, "", "")
        binary = arguments.binary.resolve()
        build_command = "prebuilt binary supplied by --binary"
    build_nanoseconds = time.monotonic_ns() - build_start
    if not binary.is_file():
        raise RuntimeError(f"public cubic executable is missing: {binary}")

    linkage = run(["ldd", binary], cwd=repository)
    linkage_text = linkage.stdout + linkage.stderr
    if linkage.returncode != 0:
        raise RuntimeError(linkage_text.strip() or "cannot inspect binary linkage")
    if "pari" in linkage_text.lower():
        raise RuntimeError("public cubic executable links to PARI")

    external = config["externalLimits"]
    timeout_seconds = int(external["wallMillisecondsPerCase"]) / 1000
    memory_bytes = int(external["memoryBytesPerCase"])
    cases = []
    campaign_start = time.monotonic_ns()
    for case in selected:
        request = {
            "schema": REQUEST_SCHEMA,
            "polynomialAscending": case["field"]["coefficientsAscending"],
            "proofMode": config["proofMode"],
            "resources": config["publicResources"],
        }
        request_text = canonical_json(request)
        case_start = time.monotonic_ns()
        try:
            completed = run(
                [binary],
                cwd=repository,
                input_text=request_text,
                timeout_seconds=timeout_seconds,
                memory_bytes=memory_bytes,
            )
        except subprocess.TimeoutExpired as error:
            raise RuntimeError(
                f"{case['fieldId']}: exceeded {timeout_seconds:g}s"
            ) from error
        external_nanoseconds = time.monotonic_ns() - case_start
        if completed.returncode != 0:
            detail = completed.stdout.strip() or completed.stderr.strip()
            raise RuntimeError(f"{case['fieldId']}: public executable failed: {detail}")
        try:
            result = json.loads(completed.stdout)
        except json.JSONDecodeError as error:
            raise RuntimeError(f"{case['fieldId']}: invalid result JSON") from error
        verify_result(result)
        cases.append(
            {
                "fieldId": case["fieldId"],
                "inputId": case["inputId"],
                "polynomialAscending": case["field"]["coefficientsAscending"],
                "requestSha256": sha256_bytes(request_text.encode()),
                "externalNanoseconds": external_nanoseconds,
                "result": result,
            }
        )
    campaign_nanoseconds = time.monotonic_ns() - campaign_start

    revision = run(["git", "rev-parse", "HEAD"], cwd=repository)
    rustc = run(["rustc", "--version", "--verbose"], cwd=repository)
    cpu_model = None
    cpuinfo = Path("/proc/cpuinfo")
    if cpuinfo.is_file():
        cpu_model = next(
            (
                line.split(":", 1)[1].strip()
                for line in cpuinfo.read_text(encoding="utf-8").splitlines()
                if line.startswith("model name")
            ),
            None,
        )
    receipt = {
        "schema": RECEIPT_SCHEMA,
        "status": "passed",
        "claim": "all frozen open degree-three inputs reached sealed conditional-GRH public results without PARI at runtime",
        "independentAnswerComparison": "not-performed-private-evidence-is-outside-repository",
        "heldOutExecuted": False,
        "caseCount": len(cases),
        "panel": {
            "path": relative((HERE / config["panel"]).resolve(), repository),
            "sha256": sha256_file((HERE / config["panel"]).resolve()),
            "selectionReceiptSha256": sha256_file(
                (HERE / config["selectionReceipt"]).resolve()
            ),
            "privateEvidenceSha256": selection["privateEvidenceSha256"],
            "partition": config["partition"],
            "degree": config["degree"],
        },
        "resources": {
            "external": external,
            "public": config["publicResources"],
        },
        "build": {
            "command": build_command,
            "nanoseconds": build_nanoseconds,
            "stdoutSha256": sha256_bytes(build.stdout.encode()),
            "stderrSha256": sha256_bytes(build.stderr.encode()),
            "binaryPath": relative(binary, repository)
            if binary.is_relative_to(repository)
            else str(binary),
            "binaryBytes": binary.stat().st_size,
            "binarySha256": sha256_file(binary),
            "linkageSha256": sha256_bytes(linkage_text.encode()),
            "linksPari": False,
        },
        "sourceClosure": closure,
        "execution": {
            "gitCommit": revision.stdout.strip(),
            "platform": platform.platform(),
            "python": platform.python_version(),
            "rustcVerboseSha256": sha256_bytes(rustc.stdout.encode()),
            "cpuModel": cpu_model,
            "campaignNanoseconds": campaign_nanoseconds,
            "processBoundary": "fresh-process-per-field",
            "threadEnvironment": {
                name: os.environ.get(name)
                for name in (
                    "OMP_NUM_THREADS",
                    "OPENBLAS_NUM_THREADS",
                    "MKL_NUM_THREADS",
                    "RAYON_NUM_THREADS",
                )
            },
        },
        "corpusValidation": {
            "command": "python3 corpus_tool.py validate",
            "stdoutSha256": sha256_bytes(corpus_validation.stdout.encode()),
            "stderrSha256": sha256_bytes(corpus_validation.stderr.encode()),
        },
        "cases": cases,
    }
    rendered = json.dumps(receipt, indent=2, sort_keys=True) + "\n"
    output = arguments.receipt.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        mode="w", encoding="utf-8", dir=output.parent, delete=False
    ) as temporary:
        temporary.write(rendered)
        temporary_path = Path(temporary.name)
    temporary_path.replace(output)
    print(
        canonical_json(
            {
                "status": "passed",
                "caseCount": len(cases),
                "campaignNanoseconds": campaign_nanoseconds,
                "receipt": str(output),
                "receiptSha256": sha256_file(output),
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
