#!/usr/bin/env python3
"""Execute the frozen untouched cubic confirmation set without oracle data."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import subprocess
import time
from pathlib import Path
from typing import Any


HERE = Path(__file__).resolve().parent
QUALIFICATION = HERE.parent
PUBLIC_CRATE = QUALIFICATION / "public-cubic-e2e"
INPUTS_PATH = HERE / "inputs.json"
POLICY_PATH = HERE / "policy.json"
SELECTION_PATH = HERE / "selection-receipt.json"
RESOURCE_PROFILE_PATH = (
    QUALIFICATION
    / "public-cubic-e2e"
    / "resource-profiles"
    / "conditional-grh-cubic-v2.json"
)
HELDOUT_RUNNER = QUALIFICATION / "public-cubic-heldout-corpus" / "run.py"
BINARY_NAME = "sagejs-public-cubic-class-group-e2e-qualification"
REQUEST_SCHEMA = "sagejs.rust-class-group/public-cubic-e2e-request-v2"
PRIVATE_SCHEMA = "sagejs.rust-class-group/private-cubic-confirmation-results-v1"
RECEIPT_SCHEMA = "sagejs.rust-class-group/cubic-confirmation-execution-v1"


def load_runner() -> Any:
    spec = importlib.util.spec_from_file_location(
        "heldout_executor_support", HELDOUT_RUNNER
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("cannot load held-out executor support")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


SUPPORT = load_runner()


def validate_inputs() -> tuple[list[dict[str, Any]], dict[str, Any]]:
    inputs = SUPPORT.load_json(INPUTS_PATH)
    policy = SUPPORT.load_json(POLICY_PATH)
    selection = SUPPORT.load_json(SELECTION_PATH)
    profile = SUPPORT.load_json(RESOURCE_PROFILE_PATH)
    if inputs.get("schema") != (
        "sagejs.rust-class-group/heldout-cubic-confirmation-inputs-v1"
    ):
        raise RuntimeError("unexpected confirmation-input schema")
    if inputs.get("executed") is not False or inputs.get("caseCount") != 12:
        raise RuntimeError("confirmation inputs are not the untouched twelve-case set")
    if policy.get("schema") != (
        "sagejs.rust-class-group/heldout-cubic-confirmation-policy-v2"
    ):
        raise RuntimeError("unexpected confirmation policy")
    if (
        selection.get("status") != "passed"
        or selection.get("inputsExecuted") is not False
    ):
        raise RuntimeError("confirmation selection receipt is not pristine")
    if selection.get("inputsSha256") != SUPPORT.sha256_file(INPUTS_PATH):
        raise RuntimeError("selection receipt does not bind confirmation inputs")
    if selection.get("policySha256") != SUPPORT.sha256_file(POLICY_PATH):
        raise RuntimeError("selection receipt does not bind confirmation policy")
    if profile.get("schema") != (
        "sagejs.rust-class-group/public-cubic-resource-profile-v2"
    ):
        raise RuntimeError("unexpected confirmation resource-profile schema")
    if profile.get("profileId") != "conditional-grh-cubic-compact-64-v2":
        raise RuntimeError("unexpected confirmation resource profile")
    if profile.get("proofMode") != "conditional-grh":
        raise RuntimeError("resource profile has another proof mode")
    resources = profile.get("publicResources")
    if not isinstance(resources, dict):
        raise RuntimeError("resource profile has no public resources")
    if resources.get("maximumCompactSurplusRows") != 64:
        raise RuntimeError("resource profile does not admit the measured compact shape")
    cases = inputs.get("cases")
    if not isinstance(cases, list) or len(cases) != 12:
        raise RuntimeError("confirmation case count changed")
    ids: set[str] = set()
    for case in cases:
        field_id = case.get("fieldId")
        if not isinstance(field_id, str) or field_id in ids:
            raise RuntimeError("invalid confirmation identity")
        ids.add(field_id)
        if case.get("containsOracleAnswers") is not False:
            raise RuntimeError("confirmation input contains oracle answers")
        if case.get("preparation") != {"kind": "public-polynomial"}:
            raise RuntimeError("confirmation input is not a public polynomial")
        if case.get("request", {}).get("proof") != "conditional-grh":
            raise RuntimeError("confirmation proof mode changed")
    return sorted(cases, key=lambda case: case["fieldId"]), resources


def reject_dirty_algorithm_sources(repository: Path) -> str:
    paths = [
        "bench/pari-class-group-rust/src",
        "bench/pari-class-group-rust/Cargo.toml",
        "bench/pari-class-group-rust/Cargo.lock",
        "bench/pari-class-group-rust/qualification/public-cubic-e2e/src",
        "bench/pari-class-group-rust/qualification/public-cubic-e2e/Cargo.toml",
        "bench/pari-class-group-rust/qualification/public-cubic-e2e/Cargo.lock",
    ]
    status = SUPPORT.command(
        ["git", "status", "--porcelain", "--untracked-files=no", "--", *paths],
        cwd=repository,
    )
    if status.returncode != 0 or status.stdout:
        raise RuntimeError("algorithm source closure is dirty")
    head = SUPPORT.command(["git", "rev-parse", "HEAD"], cwd=repository)
    if head.returncode != 0:
        raise RuntimeError("cannot identify source commit")
    return head.stdout.strip()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--private-results", required=True, type=Path)
    parser.add_argument("--receipt", default=HERE / "execution-receipt.json", type=Path)
    parser.add_argument("--binary", type=Path)
    arguments = parser.parse_args()

    repository = SUPPORT.repository_root()
    private_path = SUPPORT.refuse_repository_path(arguments.private_results, repository)
    cases, public_resources = validate_inputs()
    commit = reject_dirty_algorithm_sources(repository)

    build_start = time.monotonic_ns()
    if arguments.binary is None:
        built = SUPPORT.command(
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
        if built.returncode != 0:
            raise RuntimeError("confirmation executable build failed")
        binary = PUBLIC_CRATE / "target" / "release" / BINARY_NAME
        build_kind = "cargo-build-locked-release"
    else:
        binary = arguments.binary.resolve()
        build_kind = "explicit-prebuilt"
    build_ns = time.monotonic_ns() - build_start
    if not binary.is_file():
        raise RuntimeError("confirmation executable is missing")
    linkage = SUPPORT.command(["ldd", binary], cwd=repository)
    linkage_text = linkage.stdout + linkage.stderr
    if linkage.returncode != 0 or "pari" in linkage_text.lower():
        raise RuntimeError("confirmation executable linkage is invalid")

    private_cases: list[dict[str, Any]] = []
    public_cases: list[dict[str, Any]] = []
    campaign_start = time.monotonic_ns()
    for case in cases:
        limits = case["request"]["limits"]
        request = {
            "schema": REQUEST_SCHEMA,
            "polynomialAscending": case["field"]["coefficientsAscending"],
            "proofMode": "conditional-grh",
            "resources": public_resources,
        }
        request_text = SUPPORT.canonical_json(request) + "\n"
        started = time.monotonic_ns()
        timed_out = False
        try:
            completed = SUPPORT.command(
                [binary],
                cwd=repository,
                input_text=request_text,
                timeout_seconds=int(limits["wallMilliseconds"]) / 1000,
                memory_bytes=int(limits["memoryBytes"]),
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
        parsed: dict[str, Any] | None = None
        if completed.returncode == 0:
            try:
                value = json.loads(completed.stdout)
                parsed = value if isinstance(value, dict) else None
            except json.JSONDecodeError:
                pass
        sealed = (
            parsed is not None
            and parsed.get("outcome") == "complete-conditional-grh"
            and parsed.get("publicComplete") is True
            and parsed.get("completion", {}).get("sealedEvidenceVerified") is True
        )
        status = "completed-self-sealed" if sealed else "failed"
        request_sha = hashlib.sha256(request_text.encode()).hexdigest()
        private_cases.append(
            {
                "fieldId": case["fieldId"],
                "inputId": case["inputId"],
                "polynomialAscending": case["field"]["coefficientsAscending"],
                "requestSha256": request_sha,
                "externalNanoseconds": elapsed,
                "returnCode": completed.returncode,
                "timedOut": timed_out,
                "stdout": completed.stdout,
                "stderr": completed.stderr,
                "parsedResult": parsed,
                "status": status,
            }
        )
        public_cases.append(
            {
                "fieldId": case["fieldId"],
                "requestSha256": request_sha,
                "status": status,
                "externalNanoseconds": elapsed,
                "timedOut": timed_out,
            }
        )
    campaign_ns = time.monotonic_ns() - campaign_start
    private = {
        "schema": PRIVATE_SCHEMA,
        "gitCommit": commit,
        "executorSha256": SUPPORT.sha256_file(Path(__file__)),
        "executorSupportSha256": SUPPORT.sha256_file(HELDOUT_RUNNER),
        "inputsSha256": SUPPORT.sha256_file(INPUTS_PATH),
        "policySha256": SUPPORT.sha256_file(POLICY_PATH),
        "selectionReceiptSha256": SUPPORT.sha256_file(SELECTION_PATH),
        "resourceProfileSha256": SUPPORT.sha256_file(RESOURCE_PROFILE_PATH),
        "binarySha256": SUPPORT.sha256_file(binary),
        "campaignNanoseconds": campaign_ns,
        "cases": private_cases,
    }
    private_text = SUPPORT.canonical_json(private) + "\n"
    passed = all(case["status"] == "completed-self-sealed" for case in public_cases)
    receipt = {
        "schema": RECEIPT_SCHEMA,
        "status": "passed" if passed else "failed",
        "answerDisclosure": "none",
        "executionRole": "answer-free-confirmation-executor",
        "gitCommit": commit,
        "executorSha256": SUPPORT.sha256_file(Path(__file__)),
        "executorSupportSha256": SUPPORT.sha256_file(HELDOUT_RUNNER),
        "inputsSha256": SUPPORT.sha256_file(INPUTS_PATH),
        "policySha256": SUPPORT.sha256_file(POLICY_PATH),
        "selectionReceiptSha256": SUPPORT.sha256_file(SELECTION_PATH),
        "resourceProfileSha256": SUPPORT.sha256_file(RESOURCE_PROFILE_PATH),
        "build": {
            "kind": build_kind,
            "nanoseconds": build_ns,
            "binaryBytes": binary.stat().st_size,
            "binarySha256": SUPPORT.sha256_file(binary),
            "pariLinked": False,
        },
        "campaignNanoseconds": campaign_ns,
        "caseCount": len(public_cases),
        "completedCount": sum(
            case["status"] == "completed-self-sealed" for case in public_cases
        ),
        "cases": public_cases,
        "privateResults": {
            "pathPublished": False,
            "sha256": hashlib.sha256(private_text.encode()).hexdigest(),
        },
    }
    SUPPORT.assert_redacted(receipt)
    SUPPORT.atomic_json(private_path, private, private=True)
    SUPPORT.atomic_json(arguments.receipt.resolve(), receipt, private=False)
    print(
        SUPPORT.canonical_json(
            {
                "status": receipt["status"],
                "caseCount": receipt["caseCount"],
                "completedCount": receipt["completedCount"],
                "campaignNanoseconds": receipt["campaignNanoseconds"],
            }
        )
    )
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
