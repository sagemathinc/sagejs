#!/usr/bin/env python3
"""Execute frozen held-out cubics without ever opening oracle evidence."""

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
PRIVATE_SCHEMA = "sagejs.rust-class-group/private-heldout-cubic-rust-results-v1"
RECEIPT_SCHEMA = "sagejs.rust-class-group/heldout-cubic-execution-receipt-v1"

FORBIDDEN_REDACTED_KEYS = {
    "polynomialAscending",
    "coefficientsAscending",
    "result",
    "stdout",
    "stderr",
    "classNumber",
    "invariantFactors",
    "discriminant",
    "signature",
    "equationOrderIndex",
    "unitRank",
    "expected",
    "privateEvidenceSha256",
}


def command(
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
    completed = command(["git", "rev-parse", "--show-toplevel"], cwd=HERE)
    if completed.returncode != 0:
        raise RuntimeError("cannot locate repository root")
    return Path(completed.stdout.strip()).resolve()


def relative(path: Path, repository: Path) -> str:
    return path.resolve().relative_to(repository).as_posix()


def refuse_repository_path(path: Path, repository: Path) -> Path:
    resolved = path.resolve()
    try:
        resolved.relative_to(repository)
    except ValueError:
        return resolved
    raise RuntimeError("private results path must be outside the repository")


def validate_config(config: dict[str, Any]) -> None:
    if config.get("schema") != (
        "sagejs.rust-class-group/public-cubic-heldout-corpus-config-v1"
    ):
        raise RuntimeError("unexpected held-out configuration schema")
    if config.get("partition") != "heldOut" or config.get("degree") != 3:
        raise RuntimeError("configuration must select held-out cubics")
    if config.get("expectedCaseCount") != 12:
        raise RuntimeError("configuration must select exactly twelve cases")
    if config.get("proofMode") != "conditional-grh":
        raise RuntimeError("unsupported held-out proof policy")
    policy = config.get("confirmationPolicy")
    required = {
        "schema": "sagejs.rust-class-group/heldout-cubic-confirmation-policy-v1",
        "selectionAlgorithm": "qualified-unused-candidates-seeded-sha256-v1",
        "excludeOriginalQualificationPanel": True,
        "freezeBeforeInitialHeldoutExecution": True,
        "failureCasesRemainPermanentRegressions": True,
        "fixRequiresUntouchedConfirmationSet": True,
        "confirmationFailureRequiresNewSeedAndVersion": True,
        "neverRemoveOrReplaceFailure": True,
    }
    if not isinstance(policy, dict) or any(
        policy.get(k) != v for k, v in required.items()
    ):
        raise RuntimeError("confirmation policy is incomplete")
    if not isinstance(policy.get("seed"), str) or len(policy["seed"]) < 32:
        raise RuntimeError("confirmation seed is not frozen")


def validate_selection(
    config: dict[str, Any],
) -> tuple[list[dict[str, Any]], dict[str, Any], Path, Path]:
    panel_path = (HERE / config["panel"]).resolve()
    selection_path = (HERE / config["selectionReceipt"]).resolve()
    panel = load_json(panel_path)
    selection = load_json(selection_path)
    if panel.get("schema") != "sagejs.rust-class-group/qualified-neutral-panel-v1":
        raise RuntimeError("unexpected qualified panel schema")
    if panel.get("status") != "r0-fully-qualified-input-panel":
        raise RuntimeError("qualified panel is not final")
    if selection.get("status") != "passed":
        raise RuntimeError("selection receipt did not pass")
    if selection.get("qualifiedNeutralPanelSha256") != sha256_file(panel_path):
        raise RuntimeError("selection receipt does not bind the panel")
    partitions = panel.get("partitions")
    if not isinstance(partitions, dict) or set(partitions) != {"open", "heldOut"}:
        raise RuntimeError("qualified panel partitions changed")
    selected = [
        case
        for case in partitions["heldOut"]["cases"]
        if case.get("field", {}).get("degree") == 3
    ]
    if len(selected) != 12:
        raise RuntimeError("held-out cubic count changed")
    ids = [case.get("fieldId") for case in selected]
    if None in ids or len(ids) != len(set(ids)):
        raise RuntimeError("held-out cubic identities are invalid")
    for case in selected:
        if case.get("containsOracleAnswers") is not False:
            raise RuntimeError("held-out runtime input contains oracle answers")
        if case.get("preparation") != {"kind": "public-polynomial"}:
            raise RuntimeError("held-out case is not a public polynomial")
        if case.get("request", {}).get("proof") != "conditional-grh":
            raise RuntimeError("held-out case changed proof mode")
    return (
        sorted(selected, key=lambda case: case["fieldId"]),
        selection,
        panel_path,
        selection_path,
    )


def source_closure(repository: Path) -> dict[str, Any]:
    algorithm_paths = [
        QUALIFICATION / "corpus" / "qualified-neutral-panel-v1.json",
        QUALIFICATION / "corpus" / "qualification-selection-receipt-v1.json",
        PUBLIC_CRATE / "Cargo.toml",
        PUBLIC_CRATE / "Cargo.lock",
        ROOT_CRATE / "Cargo.toml",
        ROOT_CRATE / "Cargo.lock",
        ROOT_CRATE / "build.rs",
    ]
    algorithm_paths.extend(sorted((PUBLIC_CRATE / "src").rglob("*.rs")))
    algorithm_paths.extend(sorted((ROOT_CRATE / "src").rglob("*.rs")))
    algorithm_paths.extend(sorted((ROOT_CRATE / "src").rglob("*.c")))
    harness_paths = [HERE / "README.md", HERE / "config.json", HERE / "run.py"]

    def entries(paths: list[Path]) -> list[dict[str, Any]]:
        return [
            {
                "path": relative(path, repository),
                "bytes": path.stat().st_size,
                "sha256": sha256_file(path),
            }
            for path in sorted(set(paths))
        ]

    algorithm = entries(algorithm_paths)
    harness = entries(harness_paths)
    status = command(
        ["git", "status", "--porcelain=v1", "--", *[e["path"] for e in algorithm]],
        cwd=repository,
    )
    if status.returncode != 0:
        raise RuntimeError("cannot inspect algorithm source closure")
    return {
        "algorithm": "sha256-canonical-json-file-list-v1",
        "algorithmRootSha256": sha256_bytes(canonical_json(algorithm).encode()),
        "algorithmFiles": algorithm,
        "algorithmStatusPorcelain": status.stdout,
        "containsDirtyAlgorithmSources": bool(status.stdout),
        "harnessRootSha256": sha256_bytes(canonical_json(harness).encode()),
        "harnessFiles": harness,
    }


def classify_process(
    completed: subprocess.CompletedProcess[str] | None, *, timed_out: bool
) -> tuple[str, str | None, dict[str, Any] | None]:
    if timed_out:
        return "failed", "timeout", None
    assert completed is not None
    try:
        parsed = json.loads(completed.stdout)
    except (json.JSONDecodeError, TypeError):
        return "failed", "process-output", None
    if completed.returncode == 0:
        if (
            isinstance(parsed, dict)
            and parsed.get("schema") == RESULT_SCHEMA
            and parsed.get("outcome") == "complete-conditional-grh"
            and parsed.get("publicComplete") is True
            and parsed.get("usesPariInput") is False
            and parsed.get("usesPreparedFixture") is False
            and parsed.get("usesFieldAnswersAsInput") is False
        ):
            return "completed-self-sealed", None, parsed
        return (
            "failed",
            "result-validation",
            parsed if isinstance(parsed, dict) else None,
        )
    error = parsed.get("error", "") if isinstance(parsed, dict) else ""
    mapping = {
        "Preparation": "preparation",
        "RelationCollection": "relation-collection",
        "CandidateAuthentication": "candidate-authentication",
        "Completion": "unit-and-analytic-completion",
        "UnsupportedSchema": "request-rejection",
        "InvalidCoefficient": "request-rejection",
    }
    stage = next(
        (value for key, value in mapping.items() if str(error).startswith(key)), None
    )
    return (
        "failed",
        stage or "process-failure",
        parsed if isinstance(parsed, dict) else None,
    )


def assert_redacted(value: Any) -> None:
    def visit(item: Any) -> None:
        if isinstance(item, dict):
            forbidden = FORBIDDEN_REDACTED_KEYS.intersection(item)
            if forbidden:
                raise RuntimeError(
                    f"redacted receipt contains forbidden keys: {sorted(forbidden)}"
                )
            for child in item.values():
                visit(child)
        elif isinstance(item, list):
            for child in item:
                visit(child)

    visit(value)
    if value.get("answerDisclosure") != "none":
        raise RuntimeError("redacted receipt does not deny answer disclosure")


def atomic_json(path: Path, value: Any, *, private: bool) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    rendered = json.dumps(value, indent=2, sort_keys=True) + "\n"
    with tempfile.NamedTemporaryFile(
        mode="w", encoding="utf-8", dir=path.parent, delete=False
    ) as temporary:
        temporary.write(rendered)
        temporary_path = Path(temporary.name)
    if private:
        temporary_path.chmod(0o600)
    temporary_path.replace(path)
    if private:
        path.chmod(0o600)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--private-results", type=Path, required=True)
    parser.add_argument("--receipt", type=Path, default=DEFAULT_RECEIPT)
    parser.add_argument("--binary", type=Path)
    arguments = parser.parse_args()

    repository = repository_root()
    private_path = refuse_repository_path(arguments.private_results, repository)
    config = load_json(CONFIG_PATH)
    validate_config(config)
    selected, _, panel_path, selection_path = validate_selection(config)
    closure = source_closure(repository)
    if closure["containsDirtyAlgorithmSources"]:
        raise RuntimeError("algorithm source closure is dirty")

    corpus_validation = command(
        ["python3", QUALIFICATION / "corpus" / "corpus_tool.py", "validate"],
        cwd=repository,
    )
    if corpus_validation.returncode != 0:
        raise RuntimeError("frozen corpus validation failed")

    build_start = time.monotonic_ns()
    if arguments.binary is None:
        build = command(
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
            raise RuntimeError("public cubic release build failed")
        binary = PUBLIC_CRATE / "target" / "release" / BINARY_NAME
        build_kind = "cargo-build-locked-release"
    else:
        build = subprocess.CompletedProcess([], 0, "", "")
        binary = arguments.binary.resolve()
        build_kind = "prebuilt-explicit"
    build_ns = time.monotonic_ns() - build_start
    if not binary.is_file():
        raise RuntimeError("public cubic executable is missing")
    linkage = command(["ldd", binary], cwd=repository)
    linkage_text = linkage.stdout + linkage.stderr
    if linkage.returncode != 0 or "pari" in linkage_text.lower():
        raise RuntimeError("public executable linkage is invalid")

    external = config["externalLimits"]
    timeout = int(external["wallMillisecondsPerCase"]) / 1000
    memory = int(external["memoryBytesPerCase"])
    private_cases: list[dict[str, Any]] = []
    redacted_cases: list[dict[str, Any]] = []
    campaign_start = time.monotonic_ns()
    for case in selected:
        request = {
            "schema": REQUEST_SCHEMA,
            "polynomialAscending": case["field"]["coefficientsAscending"],
            "proofMode": config["proofMode"],
            "resources": config["publicResources"],
        }
        request_text = canonical_json(request)
        started = time.monotonic_ns()
        completed: subprocess.CompletedProcess[str] | None = None
        timed_out = False
        try:
            completed = command(
                [binary],
                cwd=repository,
                input_text=request_text,
                timeout_seconds=timeout,
                memory_bytes=memory,
            )
        except subprocess.TimeoutExpired as error:
            timed_out = True
            completed = subprocess.CompletedProcess(
                [str(binary)],
                124,
                error.stdout if isinstance(error.stdout, str) else "",
                error.stderr if isinstance(error.stderr, str) else "",
            )
        elapsed = time.monotonic_ns() - started
        status, stage, parsed = classify_process(completed, timed_out=timed_out)
        assert completed is not None
        private_cases.append(
            {
                "fieldId": case["fieldId"],
                "inputId": case["inputId"],
                "polynomialAscending": case["field"]["coefficientsAscending"],
                "request": request,
                "requestSha256": sha256_bytes(request_text.encode()),
                "externalNanoseconds": elapsed,
                "returnCode": completed.returncode,
                "timedOut": timed_out,
                "stdout": completed.stdout,
                "stderr": completed.stderr,
                "parsedResult": parsed,
                "redactedStatus": status,
                "redactedStage": stage,
            }
        )
        redacted_cases.append(
            {
                "fieldId": case["fieldId"],
                "status": status,
                "redactedStage": stage,
                "externalNanoseconds": elapsed,
                "requestSha256": sha256_bytes(request_text.encode()),
            }
        )
    campaign_ns = time.monotonic_ns() - campaign_start
    ended_ns = time.time_ns()
    revision = command(["git", "rev-parse", "HEAD"], cwd=repository).stdout.strip()

    private_bundle = {
        "schema": PRIVATE_SCHEMA,
        "executionComplete": True,
        "executionEndedUnixNanoseconds": ended_ns,
        "gitCommit": revision,
        "panelSha256": sha256_file(panel_path),
        "selectionReceiptSha256": sha256_file(selection_path),
        "configSha256": sha256_file(CONFIG_PATH),
        "sourceClosure": closure,
        "build": {
            "kind": build_kind,
            "nanoseconds": build_ns,
            "binaryBytes": binary.stat().st_size,
            "binarySha256": sha256_file(binary),
            "linkageSha256": sha256_bytes(linkage_text.encode()),
            "linksPari": False,
            "stdout": build.stdout,
            "stderr": build.stderr,
        },
        "campaignNanoseconds": campaign_ns,
        "cases": private_cases,
    }
    atomic_json(private_path, private_bundle, private=True)
    private_bundle_sha = sha256_file(private_path)

    all_complete = all(
        case["status"] == "completed-self-sealed" for case in redacted_cases
    )
    receipt = {
        "schema": RECEIPT_SCHEMA,
        "status": "execution-complete"
        if all_complete
        else "execution-complete-with-failures",
        "answerDisclosure": "none",
        "oracleComparison": "not-yet-performed",
        "partition": "heldOut",
        "degree": 3,
        "caseCount": len(redacted_cases),
        "confirmationPolicy": config["confirmationPolicy"],
        "inputs": {
            "panelSha256": sha256_file(panel_path),
            "selectionReceiptSha256": sha256_file(selection_path),
            "configSha256": sha256_file(CONFIG_PATH),
        },
        "sourceClosure": closure,
        "execution": {
            "gitCommit": revision,
            "platform": platform.platform(),
            "python": platform.python_version(),
            "campaignNanoseconds": campaign_ns,
            "executionEndedUnixNanoseconds": ended_ns,
            "processBoundary": "fresh-process-per-field",
            "continuedThroughFailures": True,
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
        "build": {
            "kind": build_kind,
            "nanoseconds": build_ns,
            "binaryBytes": binary.stat().st_size,
            "binarySha256": sha256_file(binary),
            "linkageSha256": sha256_bytes(linkage_text.encode()),
            "linksPari": False,
        },
        "privateResults": {"sha256": private_bundle_sha, "mode": "0600"},
        "cases": redacted_cases,
    }
    assert_redacted(receipt)
    atomic_json(arguments.receipt.resolve(), receipt, private=False)
    print(
        canonical_json(
            {
                "status": receipt["status"],
                "caseCount": len(redacted_cases),
                "completedCount": sum(
                    c["status"] == "completed-self-sealed" for c in redacted_cases
                ),
                "failedCount": sum(c["status"] == "failed" for c in redacted_cases),
                "campaignNanoseconds": campaign_ns,
                "receiptSha256": sha256_file(arguments.receipt.resolve()),
            }
        )
    )
    return 0 if all_complete else 2


if __name__ == "__main__":
    raise SystemExit(main())
