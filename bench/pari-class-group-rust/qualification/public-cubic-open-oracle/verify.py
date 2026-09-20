#!/usr/bin/env python3
"""Compare the frozen public cubic receipt with hash-bound private evidence."""

from __future__ import annotations

import argparse
import hashlib
import json
import tempfile
from pathlib import Path
from typing import Any


HERE = Path(__file__).resolve().parent
CONFIG_PATH = HERE / "config.json"
DEFAULT_RECEIPT = HERE / "receipt.json"
CONFIG_SCHEMA = "sagejs.rust-class-group/public-cubic-open-oracle-config-v1"
PUBLIC_SCHEMA = "sagejs.rust-class-group/public-cubic-open-corpus-receipt-v1"
PRIVATE_SCHEMA = "sagejs.rust-class-group/private-qualified-panel-evidence-v1"
RECEIPT_SCHEMA = "sagejs.rust-class-group/public-cubic-open-oracle-receipt-v1"


class VerificationError(RuntimeError):
    """A structural or cryptographic input check failed."""


def load_json(path: Path) -> Any:
    with path.open(encoding="utf-8") as source:
        return json.load(source)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def require(condition: bool, message: str) -> None:
    if not condition:
        raise VerificationError(message)


def bound_json(path: Path, expected_sha256: str, label: str) -> Any:
    require(path.is_file(), f"{label} is missing: {path}")
    actual_sha256 = sha256_file(path)
    require(
        actual_sha256 == expected_sha256,
        f"{label} SHA-256 mismatch: expected {expected_sha256}, got {actual_sha256}",
    )
    return load_json(path)


def public_cases(public: dict[str, Any], config: dict[str, Any]) -> dict[str, Any]:
    require(public.get("schema") == PUBLIC_SCHEMA, "unexpected public receipt schema")
    require(public.get("status") == "passed", "public corpus run did not pass")
    require(
        public.get("caseCount") == config["expectedCaseCount"],
        "public receipt case count changed",
    )
    require(
        public.get("execution", {}).get("gitCommit") == config["publicExecutionCommit"],
        "public receipt was executed at another commit",
    )
    closure = public.get("sourceClosure", {})
    require(
        closure.get("rootSha256") == config["publicSourceClosureSha256"],
        "public receipt source closure changed",
    )
    require(
        closure.get("containsDirtyReachableSources") is False,
        "public receipt used dirty reachable sources",
    )
    require(
        public.get("panel", {}).get("privateEvidenceSha256")
        == config["privateEvidenceSha256"],
        "public receipt refers to another private evidence blob",
    )
    require(
        public.get("heldOutExecuted") is False, "public run executed held-out cases"
    )
    cases = public.get("cases")
    require(isinstance(cases, list), "public receipt cases are not an array")
    indexed = {case.get("fieldId"): case for case in cases}
    require(None not in indexed, "public receipt has a case without a field ID")
    require(len(indexed) == len(cases), "public receipt has duplicate field IDs")
    return indexed


def private_cases(private: dict[str, Any], config: dict[str, Any]) -> dict[str, Any]:
    require(
        private.get("schema") == PRIVATE_SCHEMA, "unexpected private evidence schema"
    )
    partitions = private.get("partitions")
    require(
        isinstance(partitions, dict) and set(partitions) == {"open", "heldOut"},
        "private evidence partitions changed",
    )
    for name in ("open", "heldOut"):
        cases = partitions[name].get("cases")
        require(isinstance(cases, list) and len(cases) == 60, f"invalid {name} cases")
    selected = [
        case
        for case in partitions[config["partition"]]["cases"]
        if case.get("degree") == config["degree"]
    ]
    require(
        len(selected) == config["expectedCaseCount"],
        "private evidence does not contain exactly 12 open cubics",
    )
    indexed = {case.get("id"): case for case in selected}
    require(None not in indexed, "private evidence has a case without an ID")
    require(len(indexed) == len(selected), "private evidence has duplicate field IDs")
    return indexed


def validate_private_provenance(
    private: dict[str, Any],
    selected_cases: dict[str, Any],
    oracle: dict[str, Any],
    trace: dict[str, Any],
) -> None:
    private_oracle = private.get("oracleBuild", {})
    require(
        private_oracle.get("pariVersion") == oracle.get("pariVersion")
        and private_oracle.get("gpSha256") == oracle.get("gpSha256"),
        "private evidence was produced by another oracle build",
    )
    require(
        private_oracle.get("buchallSourceSha256")
        == trace.get("source", {}).get("sha256"),
        "private evidence used another PARI trace source",
    )
    expected_identity = (
        f"pari-{private_oracle['pariVersion']}-gp-sha256:{private_oracle['gpSha256']}"
    )
    for case in selected_cases.values():
        expected = case.get("expected", {})
        independent = case.get("constructionEvidence", {}).get("independent", {})
        require(case.get("irreducible") is True, "private case is not irreducible")
        require(
            expected.get("validationStatus") == "pari-plus-independent-check",
            "private case lacks independent validation status",
        )
        require(
            expected.get("oracleIdentity") == expected_identity,
            "private case refers to another oracle identity",
        )
        require(
            independent.get("irreducible") is True
            and independent.get("signature") == case.get("signature"),
            "private case lacks its independent irreducibility/signature check",
        )
        require(
            independent.get("polynomialDiscriminant")
            == independent.get("fieldDiscriminantTimesIndexSquared"),
            "private case fails its independent discriminant/index identity",
        )


def checked(label: str, actual: Any, expected: Any) -> dict[str, Any]:
    return {"field": label, "status": "passed" if actual == expected else "failed"}


def compare_case(public: dict[str, Any], private: dict[str, Any]) -> dict[str, Any]:
    result = public.get("result")
    if not isinstance(result, dict):
        return {
            "fieldId": public.get("fieldId"),
            "status": "public-failure-or-timeout",
            "checks": [],
        }
    preparation = result.get("preparation", {})
    candidate = result.get("candidate", {})
    completion = result.get("completion", {})
    expected = private.get("expected", {})
    construction = private.get("constructionEvidence", {})
    signature = private.get("signature")
    unit_rank = signature[0] + signature[1] - 1 if isinstance(signature, list) else None
    checks = [
        checked(
            "polynomialAscending",
            public.get("polynomialAscending"),
            private.get("polynomialAscending"),
        ),
        checked("signature", preparation.get("signature"), signature),
        checked(
            "equationOrderIndex",
            preparation.get("equationOrderIndex"),
            construction.get("equationOrderIndex"),
        ),
        checked(
            "fieldDiscriminant",
            preparation.get("discriminant"),
            construction.get("fieldDiscriminant"),
        ),
        checked(
            "candidate.classNumber",
            candidate.get("classNumber"),
            expected.get("classNumber"),
        ),
        checked(
            "candidate.invariantFactors",
            candidate.get("invariantFactors"),
            expected.get("invariantFactors"),
        ),
        checked(
            "completion.classNumber",
            completion.get("classNumber"),
            expected.get("classNumber"),
        ),
        checked(
            "completion.invariantFactors",
            completion.get("invariantFactors"),
            expected.get("invariantFactors"),
        ),
        checked("unitRank", completion.get("unitRank"), unit_rank),
    ]
    public_complete = (
        result.get("publicComplete") is True
        and result.get("outcome") == "complete-conditional-grh"
        and result.get("usesPariInput") is False
        and result.get("usesPreparedFixture") is False
        and result.get("usesFieldAnswersAsInput") is False
    )
    status = (
        "passed"
        if public_complete and all(check["status"] == "passed" for check in checks)
        else "failed"
    )
    return {"fieldId": public.get("fieldId"), "status": status, "checks": checks}


def compare_case_sets(
    public_by_id: dict[str, Any], private_by_id: dict[str, Any]
) -> list[dict[str, Any]]:
    require(
        set(public_by_id) == set(private_by_id),
        "public and private open-cubic field IDs differ",
    )
    return [
        compare_case(public_by_id[field_id], private_by_id[field_id])
        for field_id in sorted(public_by_id)
    ]


def comparison_status(cases: list[dict[str, Any]]) -> tuple[str, int]:
    status = "passed" if all(case["status"] == "passed" for case in cases) else "failed"
    return status, 0 if status == "passed" else 1


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--private-evidence", type=Path, required=True)
    parser.add_argument("--receipt", type=Path, default=DEFAULT_RECEIPT)
    arguments = parser.parse_args()

    config = load_json(CONFIG_PATH)
    require(config.get("schema") == CONFIG_SCHEMA, "unexpected verifier config schema")
    public_path = (HERE / config["publicReceipt"]).resolve()
    oracle_path = (HERE / config["oracleIdentity"]).resolve()
    trace_path = (HERE / config["traceContract"]).resolve()
    public = bound_json(public_path, config["publicReceiptSha256"], "public receipt")
    private = bound_json(
        arguments.private_evidence.resolve(),
        config["privateEvidenceSha256"],
        "private evidence",
    )
    oracle = bound_json(oracle_path, config["oracleIdentitySha256"], "oracle identity")
    trace = bound_json(trace_path, config["traceContractSha256"], "trace contract")

    public_by_id = public_cases(public, config)
    private_by_id = private_cases(private, config)
    validate_private_provenance(private, private_by_id, oracle, trace)
    cases = compare_case_sets(public_by_id, private_by_id)
    status, exit_code = comparison_status(cases)
    receipt = {
        "schema": RECEIPT_SCHEMA,
        "status": status,
        "answerDisclosure": "none",
        "publicReceipt": {
            "sha256": config["publicReceiptSha256"],
            "executionCommit": config["publicExecutionCommit"],
            "sourceClosureSha256": config["publicSourceClosureSha256"],
        },
        "privateEvidenceSha256": config["privateEvidenceSha256"],
        "oracleIdentitySha256": config["oracleIdentitySha256"],
        "traceContractSha256": config["traceContractSha256"],
        "partition": config["partition"],
        "degree": config["degree"],
        "caseCount": len(cases),
        "heldOutCompared": False,
        "rustExecution": "not-launched-private-evidence-opened-only-after-public-run",
        "failurePolicy": "preserve-every-public-case-and-every-failed-check",
        "comparisonFields": config["comparisonFields"],
        "cases": cases,
        "verifierSources": {
            "configSha256": sha256_file(CONFIG_PATH),
            "runnerSha256": sha256_file(Path(__file__).resolve()),
        },
    }
    output = arguments.receipt.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    rendered = json.dumps(receipt, indent=2, sort_keys=True) + "\n"
    with tempfile.NamedTemporaryFile(
        mode="w", encoding="utf-8", dir=output.parent, delete=False
    ) as temporary:
        temporary.write(rendered)
        temporary_path = Path(temporary.name)
    temporary_path.replace(output)
    print(
        json.dumps(
            {
                "status": status,
                "caseCount": len(cases),
                "receipt": str(output),
                "receiptSha256": sha256_file(output),
            },
            sort_keys=True,
            separators=(",", ":"),
        )
    )
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
