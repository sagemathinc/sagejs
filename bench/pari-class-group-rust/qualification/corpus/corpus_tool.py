#!/usr/bin/env python3
"""Generate and validate the frozen Rust class-group qualification corpus."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from collections import Counter
from pathlib import Path
from typing import Any


HERE = Path(__file__).resolve().parent
REPOSITORY = HERE.parents[3]
SPEC_PATH = HERE / "qualification-corpus-spec-v1.json"
LAYOUT_PATH = HERE / "qualification-layout-v1.json"
INITIAL_PATH = HERE / "initial-open-development-v1.json"
NEUTRAL_POOL_PATH = HERE / "neutral-candidate-inputs-v1.json"
NEUTRAL_ELIGIBILITY_PATH = HERE / "neutral-eligibility-v1.json"
NEUTRAL_POOL_V2_PATH = HERE / "neutral-candidate-inputs-v2.json"
NEUTRAL_ELIGIBILITY_V2_PATH = HERE / "neutral-eligibility-v2.json"
NEUTRAL_PANEL_PATH = HERE / "balanced-neutral-panel-v1.json"
QUALIFIED_PANEL_PATH = HERE / "qualified-neutral-panel-v1.json"
QUALIFICATION_RECEIPT_PATH = HERE / "qualification-selection-receipt-v1.json"
ORACLE_IDENTITY_PATH = HERE / "pari-2.17.4-oracle-identity.json"
TRACE_CONTRACT_PATH = HERE / "pari-buchall-debug-trace-v1.json"
DECIMAL = re.compile(r"(?:0|-[1-9][0-9]*|[1-9][0-9]*)\Z")
SHA256 = re.compile(r"[0-9a-f]{64}\Z")


def neutral_request() -> dict[str, Any]:
    return {
        "proof": "conditional-grh",
        "output": "class-and-unit-group",
        "mapPolicy": "construct-eagerly",
        "unitPolicy": "compact-complete",
        "limits": {
            "wallMilliseconds": "600000",
            "memoryBytes": "4294967296",
            "relationCandidates": "100000000",
            "precisionBits": 4096,
            "continuationPasses": 100,
        },
    }


class CorpusError(ValueError):
    pass


def load(path: Path) -> Any:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def compact(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=True, separators=(",", ":")).encode()


def polynomial_digest(coefficients: list[str]) -> str:
    return hashlib.sha256(compact(coefficients)).hexdigest()


def canonical_output(value: Any) -> str:
    return json.dumps(value, indent=2, sort_keys=False, ensure_ascii=True) + "\n"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise CorpusError(message)


def require_exact_keys(value: Any, keys: set[str], label: str) -> None:
    require(isinstance(value, dict), f"{label}: expected an object")
    require(set(value) == keys, f"{label}: expected exactly {sorted(keys)}")


def legal_signatures(degree: int) -> list[tuple[int, int]]:
    return [(degree - 2 * r2, r2) for r2 in range(degree // 2 + 1)]


def validate_polynomial(case: dict[str, Any], label: str) -> None:
    coefficients = case.get("polynomialAscending")
    require(
        isinstance(coefficients, list) and len(coefficients) >= 3,
        f"{label}: polynomialAscending must be a coefficient list",
    )
    require(
        all(isinstance(c, str) and DECIMAL.fullmatch(c) for c in coefficients),
        f"{label}: coefficients must be canonical decimal strings",
    )
    degree = case.get("degree")
    require(
        isinstance(degree, int) and degree == len(coefficients) - 1,
        f"{label}: degree does not match coefficient count",
    )
    require(coefficients[-1] == "1", f"{label}: polynomial must be monic")
    require(
        case.get("polynomialSha256") == polynomial_digest(coefficients),
        f"{label}: polynomialSha256 mismatch",
    )


def validate_expected(expected: Any, label: str, *, complete: bool) -> None:
    require(isinstance(expected, dict), f"{label}: expected must be an object")
    required = {"classNumber", "invariantFactors"}
    if complete:
        required |= {"pariPublicNanoseconds", "oracleIdentity", "validationStatus"}
    require(required <= expected.keys(), f"{label}: incomplete expected evidence")
    require(
        isinstance(expected["classNumber"], str)
        and DECIMAL.fullmatch(expected["classNumber"])
        and int(expected["classNumber"]) > 0,
        f"{label}: invalid class number",
    )
    invariants = expected["invariantFactors"]
    require(
        isinstance(invariants, list)
        and all(
            isinstance(value, str) and DECIMAL.fullmatch(value) and int(value) > 1
            for value in invariants
        ),
        f"{label}: invalid invariant factors",
    )
    product = 1
    for index, value in enumerate(map(int, invariants)):
        product *= value
        if index:
            require(
                value % int(invariants[index - 1]) == 0,
                f"{label}: invariant factors are not divisibility ordered",
            )
    require(
        product == int(expected["classNumber"]),
        f"{label}: invariant-factor product differs from class number",
    )
    if complete:
        samples = expected["pariPublicNanoseconds"]
        require(
            isinstance(samples, list)
            and len(samples) >= 15
            and all(isinstance(value, int) and value > 0 for value in samples),
            f"{label}: PARI public timing requires at least 15 positive integer samples",
        )
        require(
            isinstance(expected["oracleIdentity"], str) and expected["oracleIdentity"],
            f"{label}: oracleIdentity must be a nonempty string",
        )
        require(
            expected["validationStatus"]
            in {
                "pari-only-provisional",
                "pari-plus-independent-check",
                "independently-certified",
            },
            f"{label}: invalid validationStatus",
        )


def timing_stratum(samples: list[int]) -> str:
    ordered = sorted(samples)
    median = ordered[len(ordered) // 2]
    if median < 5_000_000:
        return "under-5ms"
    if median < 100_000_000:
        return "5ms-to-100ms"
    if median < 2_000_000_000:
        return "100ms-to-2s"
    if median <= 30_000_000_000:
        return "2s-to-30s"
    raise CorpusError("PARI median exceeds the qualification timing strata")


def make_layout(spec: dict[str, Any]) -> dict[str, Any]:
    slots: list[dict[str, Any]] = []
    quota = spec["panel"]["degreeQuotaPerPartition"]
    for partition in spec["selection"]["partitionOrder"]:
        slug = "heldout" if partition == "heldOut" else partition
        for degree in spec["selection"]["degreeOrder"]:
            for ordinal in range(1, quota[str(degree)] + 1):
                slots.append(
                    {
                        "slot": f"{slug}-d{degree}-{ordinal:02d}",
                        "partition": partition,
                        "degree": degree,
                        "status": "unselected",
                    }
                )
    return {
        "schema": "sagejs.rust-class-group/qualification-layout-v1",
        "spec": SPEC_PATH.name,
        "slots": slots,
    }


def validate_spec(spec: dict[str, Any]) -> None:
    require(
        spec.get("schema") == "sagejs.rust-class-group/qualification-corpus-spec-v1",
        "unexpected corpus specification schema",
    )
    partitions = spec["panel"]["partitions"]
    degree_quota = spec["panel"]["degreeQuotaPerPartition"]
    require(
        set(partitions) == {"open", "heldOut"}, "partitions must be open and heldOut"
    )
    require(
        all(partitions[name] == 60 for name in partitions),
        "each partition must contain 60 fields",
    )
    require(
        set(map(int, degree_quota)) == set(range(2, 7)),
        "degree quotas must cover 2 through 6",
    )
    require(sum(degree_quota.values()) == 60, "degree quotas must total 60")
    require(
        all(value == 12 for value in degree_quota.values()),
        "each degree quota must be 12",
    )
    require(
        len(set(spec["selection"]["mandatoryOpenIds"])) == 9,
        "mandatory open IDs must be nine distinct cases",
    )


def validate_layout(layout: dict[str, Any], spec: dict[str, Any]) -> None:
    require(
        layout.get("schema") == "sagejs.rust-class-group/qualification-layout-v1",
        "unexpected layout schema",
    )
    expected = make_layout(spec)
    require(
        layout == expected, "qualification layout is not canonical; run emit-layout"
    )


def validate_initial(panel: dict[str, Any], spec: dict[str, Any]) -> None:
    require(
        panel.get("schema") == "sagejs.rust-class-group/open-development-panel-v1",
        "unexpected initial panel schema",
    )
    cases = panel.get("cases")
    require(
        isinstance(cases, list) and len(cases) == 9,
        "initial open panel must contain nine cases",
    )
    ids: set[str] = set()
    digests: set[str] = set()
    timing = set(spec["panel"]["timingStrata"])
    traits = set(spec["panel"]["traitMinimumPerPartition"])
    for case in cases:
        label = f"initial case {case.get('id', '<missing>')}"
        require(
            isinstance(case.get("id"), str) and case["id"] not in ids,
            f"{label}: duplicate or invalid ID",
        )
        ids.add(case["id"])
        validate_polynomial(case, label)
        require(
            case["polynomialSha256"] not in digests, f"{label}: duplicate polynomial"
        )
        digests.add(case["polynomialSha256"])
        signature = tuple(case.get("signature", []))
        require(
            signature in legal_signatures(case["degree"]), f"{label}: illegal signature"
        )
        require(case.get("timingStratum") in timing, f"{label}: invalid timing stratum")
        require(
            isinstance(case.get("traits"), list) and set(case["traits"]) <= traits,
            f"{label}: invalid traits",
        )
        validate_expected(case.get("expected"), label, complete=False)
    require(
        ids == set(spec["selection"]["mandatoryOpenIds"]),
        "initial cases must equal mandatory open IDs",
    )
    require(
        panel.get("unfilledOpenSlots") == 60 - len(cases), "incorrect unfilledOpenSlots"
    )


def validate_neutral_pool(pool: dict[str, Any]) -> None:
    require(
        pool.get("schema") == "sagejs.rust-class-group/neutral-candidate-input-pool-v1",
        "unexpected neutral candidate pool schema",
    )
    require(
        pool.get("answerVisibility") == "none",
        "neutral candidate pool must declare no answer visibility",
    )
    cases = pool.get("cases")
    require(
        isinstance(cases, list) and len(cases) == 360,
        "neutral candidate pool must contain 360 inputs",
    )
    ids: set[str] = set()
    digests: set[str] = set()
    degree_counts: Counter = Counter()
    allowed = {"id", "polynomialAscending", "polynomialSha256", "degree"}
    for case in cases:
        label = f"neutral case {case.get('id', '<missing>')}"
        require(set(case) == allowed, f"{label}: answer-bearing or unknown fields")
        require(
            isinstance(case.get("id"), str) and case["id"] not in ids,
            f"{label}: duplicate or invalid ID",
        )
        ids.add(case["id"])
        validate_polynomial(case, label)
        require(2 <= case["degree"] <= 6, f"{label}: degree outside admitted range")
        require(
            case["polynomialSha256"] not in digests,
            f"{label}: duplicate polynomial",
        )
        digests.add(case["polynomialSha256"])
        degree_counts[case["degree"]] += 1
    require(
        degree_counts == Counter({degree: 72 for degree in range(2, 7)}),
        f"neutral candidate degree imbalance: {degree_counts}",
    )


def validate_neutral_eligibility(
    evidence: dict[str, Any],
    pool: dict[str, Any],
    pool_path: Path = NEUTRAL_POOL_PATH,
    *,
    require_all_irreducible: bool = True,
) -> None:
    require(
        evidence.get("schema")
        == "sagejs.rust-class-group/neutral-eligibility-evidence-v1",
        "unexpected neutral eligibility schema",
    )
    require(evidence.get("answerVisibility") == "none", "eligibility leaks answers")
    require(
        evidence.get("candidatePoolSha256")
        == hashlib.sha256(pool_path.read_bytes()).hexdigest(),
        "eligibility evidence is for a different candidate pool",
    )
    expected = {(case["id"], case["polynomialSha256"]) for case in pool["cases"]}
    evidence_cases = evidence.get("cases", [])
    actual = {(case["id"], case["polynomialSha256"]) for case in evidence_cases}
    require(
        actual == expected, "eligibility evidence does not cover the candidate pool"
    )
    require(
        all(isinstance(case.get("irreducible"), bool) for case in evidence_cases),
        "eligibility evidence lacks an exact irreducibility result",
    )
    if require_all_irreducible:
        require(
            all(case["irreducible"] for case in evidence_cases),
            "not every neutral candidate is certified irreducible",
        )


def neutral_runtime_input(case: dict[str, Any], partition: str) -> dict[str, Any]:
    seed = hashlib.sha256(
        f"sagejs-rust-class-group-runtime-v1\0{partition}\0{case['id']}".encode()
    ).hexdigest()
    input_digest = hashlib.sha256(
        compact(
            [
                "sagejs.rust-class-group.neutral-input/v1",
                partition,
                case["id"],
                case["polynomialSha256"],
                seed,
            ]
        )
    ).hexdigest()
    return {
        "schema": "sagejs.rust-class-group.neutral-input/v1",
        "inputId": f"sha256:{input_digest}",
        "fieldId": case["id"],
        "field": {
            "variable": "x",
            "coefficientsAscending": case["polynomialAscending"],
            "degree": case["degree"],
            "monic": True,
            "irreducible": True,
        },
        "preparation": {"kind": "public-polynomial"},
        "request": neutral_request(),
        "randomness": {"algorithm": "chacha20-v1", "seed": seed},
        "containsOracleAnswers": False,
    }


def make_balanced_neutral_panel(
    spec: dict[str, Any],
    pool: dict[str, Any],
    initial: dict[str, Any],
    eligibility: dict[str, Any],
) -> dict[str, Any]:
    eligible = {
        case["id"]: case["polynomialSha256"]
        for case in eligibility["cases"]
        if case["irreducible"] is True
    }
    candidates = [
        case
        for case in pool["cases"]
        if eligible.get(case["id"]) == case["polynomialSha256"]
    ]
    mandatory = {
        case["id"]: {
            key: case[key]
            for key in ("id", "polynomialAscending", "polynomialSha256", "degree")
        }
        for case in initial["cases"]
    }
    used_ids = set(mandatory)
    used_digests = {case["polynomialSha256"] for case in mandatory.values()}
    open_cases = list(mandatory.values())
    heldout_cases: list[dict[str, Any]] = []
    quota = spec["panel"]["degreeQuotaPerPartition"]
    for degree in spec["selection"]["degreeOrder"]:
        degree_candidates = [
            case
            for case in candidates
            if case["degree"] == degree
            and case["id"] not in used_ids
            and case["polynomialSha256"] not in used_digests
        ]
        degree_candidates.sort(
            key=lambda case: seeded_key(spec["selection"]["openSeed"], case["id"])
        )
        needed = quota[str(degree)] - sum(
            case["degree"] == degree for case in open_cases
        )
        require(needed >= 0, f"too many mandatory degree-{degree} inputs")
        chosen_open = degree_candidates[:needed]
        require(len(chosen_open) == needed, f"not enough open degree-{degree} inputs")
        open_cases.extend(chosen_open)
        used_ids.update(case["id"] for case in chosen_open)
        used_digests.update(case["polynomialSha256"] for case in chosen_open)

        remaining = [
            case
            for case in candidates
            if case["degree"] == degree
            and case["id"] not in used_ids
            and case["polynomialSha256"] not in used_digests
        ]
        remaining.sort(
            key=lambda case: seeded_key(spec["selection"]["heldOutSeed"], case["id"])
        )
        chosen_heldout = remaining[: quota[str(degree)]]
        require(
            len(chosen_heldout) == quota[str(degree)],
            f"not enough held-out degree-{degree} inputs",
        )
        heldout_cases.extend(chosen_heldout)
        used_ids.update(case["id"] for case in chosen_heldout)
        used_digests.update(case["polynomialSha256"] for case in chosen_heldout)

    return {
        "schema": "sagejs.rust-class-group/balanced-neutral-panel-v1",
        "status": "degree-balanced-awaiting-private-oracle-selection",
        "spec": SPEC_PATH.name,
        "candidatePool": NEUTRAL_POOL_PATH.name,
        "eligibilityEvidence": NEUTRAL_ELIGIBILITY_PATH.name,
        "answerVisibility": "none",
        "qualificationClaims": {
            "degreeQuotasSatisfied": True,
            "signatureQuotasSatisfied": False,
            "timingQuotasSatisfied": False,
            "traitQuotasSatisfied": False,
        },
        "partitions": {
            "open": {
                "cases": [
                    neutral_runtime_input(case, "open")
                    for case in sorted(open_cases, key=lambda case: case["id"])
                ]
            },
            "heldOut": {
                "cases": [
                    neutral_runtime_input(case, "heldOut")
                    for case in sorted(heldout_cases, key=lambda case: case["id"])
                ]
            },
        },
    }


def validate_balanced_neutral_panel(
    panel: dict[str, Any],
    spec: dict[str, Any],
    pool: dict[str, Any],
    initial: dict[str, Any],
    eligibility: dict[str, Any],
) -> None:
    require(
        panel == make_balanced_neutral_panel(spec, pool, initial, eligibility),
        "balanced neutral panel is not canonical; run emit-neutral-panel",
    )
    forbidden = {
        "expected",
        "classNumber",
        "invariantFactors",
        "pariPublicNanoseconds",
        "integralBasis",
        "relations",
        "retrySchedule",
        "oracleTrace",
    }
    serialized = canonical_output(panel)
    for key in forbidden:
        require(f'"{key}"' not in serialized, f"neutral panel leaks {key}")
    all_ids: set[str] = set()
    all_polynomials: set[str] = set()
    quota = Counter(
        {
            int(key): value
            for key, value in spec["panel"]["degreeQuotaPerPartition"].items()
        }
    )
    for partition in ("open", "heldOut"):
        cases = panel["partitions"][partition]["cases"]
        require(len(cases) == 60, f"{partition}: expected 60 neutral inputs")
        require(
            Counter(case["field"]["degree"] for case in cases) == quota,
            f"{partition}: degree quota mismatch",
        )
        for case in cases:
            require(case["containsOracleAnswers"] is False, "answer flag must be false")
            require(case["fieldId"] not in all_ids, "duplicate field ID across panel")
            all_ids.add(case["fieldId"])
            field_digest = polynomial_digest(case["field"]["coefficientsAscending"])
            require(
                field_digest not in all_polynomials, "duplicate polynomial across panel"
            )
            all_polynomials.add(field_digest)
    require(
        set(spec["selection"]["mandatoryOpenIds"])
        <= {case["fieldId"] for case in panel["partitions"]["open"]["cases"]},
        "open partition omits mandatory development inputs",
    )


def validate_neutral_runtime_input(
    case: dict[str, Any], partition: str, label: str
) -> str:
    require_exact_keys(
        case,
        {
            "schema",
            "inputId",
            "fieldId",
            "field",
            "preparation",
            "request",
            "randomness",
            "containsOracleAnswers",
        },
        label,
    )
    require(
        case["schema"] == "sagejs.rust-class-group.neutral-input/v1",
        f"{label}: invalid runtime-input schema",
    )
    field_id = case["fieldId"]
    require(isinstance(field_id, str) and field_id, f"{label}: invalid fieldId")
    field = case["field"]
    require_exact_keys(
        field,
        {
            "variable",
            "coefficientsAscending",
            "degree",
            "monic",
            "irreducible",
        },
        f"{label}.field",
    )
    coefficients = field["coefficientsAscending"]
    degree = field["degree"]
    require(field["variable"] == "x", f"{label}: variable must be x")
    require(
        isinstance(degree, int) and not isinstance(degree, bool) and 2 <= degree <= 6,
        f"{label}: degree outside admitted range",
    )
    require(
        isinstance(coefficients, list)
        and len(coefficients) == degree + 1
        and all(
            isinstance(value, str) and DECIMAL.fullmatch(value)
            for value in coefficients
        ),
        f"{label}: invalid coefficient shape or encoding",
    )
    require(coefficients[-1] == "1", f"{label}: polynomial must be monic")
    require(field["monic"] is True, f"{label}: monic claim must be true")
    require(field["irreducible"] is True, f"{label}: irreducibility claim must be true")
    polynomial_sha = polynomial_digest(coefficients)
    seed = hashlib.sha256(
        f"sagejs-rust-class-group-runtime-v1\0{partition}\0{field_id}".encode()
    ).hexdigest()
    input_sha = hashlib.sha256(
        compact(
            [
                "sagejs.rust-class-group.neutral-input/v1",
                partition,
                field_id,
                polynomial_sha,
                seed,
            ]
        )
    ).hexdigest()
    require(case["inputId"] == f"sha256:{input_sha}", f"{label}: inputId mismatch")
    require(
        case["preparation"] == {"kind": "public-polynomial"},
        f"{label}: invalid preparation contract",
    )
    require(case["request"] == neutral_request(), f"{label}: invalid request contract")
    require(
        case["randomness"] == {"algorithm": "chacha20-v1", "seed": seed},
        f"{label}: invalid deterministic randomness contract",
    )
    require(
        case["containsOracleAnswers"] is False,
        f"{label}: containsOracleAnswers must be false",
    )
    return polynomial_sha


def validate_qualified_neutral_panel(
    panel: dict[str, Any], receipt: dict[str, Any], spec: dict[str, Any]
) -> None:
    require_exact_keys(
        panel,
        {
            "schema",
            "status",
            "spec",
            "answerVisibility",
            "qualificationClaims",
            "partitions",
        },
        "qualified panel",
    )
    require(
        panel.get("schema") == "sagejs.rust-class-group/qualified-neutral-panel-v1",
        "unexpected qualified neutral panel schema",
    )
    require(
        panel.get("status") == "r0-fully-qualified-input-panel",
        "qualified neutral panel is not final",
    )
    require(panel.get("answerVisibility") == "none", "qualified panel leaks answers")
    require(
        panel.get("spec") == SPEC_PATH.name, "qualified panel refers to another spec"
    )
    require(
        panel.get("qualificationClaims")
        == {
            "degreeQuotasSatisfied": True,
            "signatureQuotasSatisfied": True,
            "timingQuotasSatisfied": True,
            "traitQuotasSatisfied": True,
            "minimumPariSamplesPerCase": 15,
        },
        "qualified panel claims are incomplete",
    )
    forbidden = {
        "expected",
        "classNumber",
        "invariantFactors",
        "pariPublicNanoseconds",
        "signature",
        "timingStratum",
        "traits",
        "constructionEvidence",
        "oracleTrace",
    }
    serialized = canonical_output(panel)
    for key in forbidden:
        require(f'"{key}"' not in serialized, f"qualified panel leaks {key}")
    all_ids: set[str] = set()
    all_polynomials: set[str] = set()
    quota = Counter(
        {
            int(key): value
            for key, value in spec["panel"]["degreeQuotaPerPartition"].items()
        }
    )
    require_exact_keys(panel["partitions"], {"open", "heldOut"}, "panel partitions")
    for partition in ("open", "heldOut"):
        require_exact_keys(
            panel["partitions"][partition], {"cases"}, f"{partition} partition"
        )
        cases = panel["partitions"][partition]["cases"]
        require(isinstance(cases, list), f"{partition}: cases must be an array")
        require(len(cases) == 60, f"{partition}: expected 60 qualified inputs")
        require(
            Counter(case["field"]["degree"] for case in cases) == quota,
            f"{partition}: qualified degree quota mismatch",
        )
        for index, case in enumerate(cases):
            label = f"{partition} case {index}"
            digest = validate_neutral_runtime_input(case, partition, label)
            require(case["fieldId"] not in all_ids, "duplicate field ID across panel")
            all_ids.add(case["fieldId"])
            require(digest not in all_polynomials, "duplicate polynomial across panel")
            all_polynomials.add(digest)
    require(
        set(spec["selection"]["mandatoryOpenIds"])
        <= {case["fieldId"] for case in panel["partitions"]["open"]["cases"]},
        "qualified open partition omits mandatory development inputs",
    )
    require_exact_keys(
        receipt,
        {
            "schema",
            "status",
            "spec",
            "specSha256",
            "selectionAlgorithm",
            "selectionSeeds",
            "sourcePoolSha256",
            "oracleIdentity",
            "oracleIdentitySha256",
            "traceContract",
            "traceContractSha256",
            "qualifiedNeutralPanel",
            "qualifiedNeutralPanelSha256",
            "privateEvidenceSha256",
            "answerVisibility",
            "partitions",
        },
        "qualification receipt",
    )
    require(
        receipt.get("schema")
        == "sagejs.rust-class-group/qualification-selection-receipt-v1",
        "unexpected qualification receipt schema",
    )
    require(receipt.get("status") == "passed", "qualification receipt did not pass")
    require(receipt.get("spec") == SPEC_PATH.name, "receipt refers to another spec")
    require(
        receipt.get("specSha256") == hashlib.sha256(SPEC_PATH.read_bytes()).hexdigest(),
        "qualification receipt refers to another spec",
    )
    require(
        receipt.get("oracleIdentity") == ORACLE_IDENTITY_PATH.name
        and receipt.get("oracleIdentitySha256")
        == hashlib.sha256(ORACLE_IDENTITY_PATH.read_bytes()).hexdigest(),
        "qualification receipt refers to another oracle build",
    )
    require(
        receipt.get("traceContract") == TRACE_CONTRACT_PATH.name
        and receipt.get("traceContractSha256")
        == hashlib.sha256(TRACE_CONTRACT_PATH.read_bytes()).hexdigest(),
        "qualification receipt refers to another trace contract",
    )
    require(
        receipt.get("selectionAlgorithm") == spec["selection"]["algorithm"],
        "qualification receipt uses another selection algorithm",
    )
    require(
        receipt.get("selectionSeeds")
        == {
            "open": spec["selection"]["openSeed"],
            "heldOut": spec["selection"]["heldOutSeed"],
        },
        "qualification receipt uses other selection seeds",
    )
    for key in (
        "sourcePoolSha256",
        "privateEvidenceSha256",
        "specSha256",
        "oracleIdentitySha256",
        "traceContractSha256",
        "qualifiedNeutralPanelSha256",
    ):
        require(
            isinstance(receipt.get(key), str) and SHA256.fullmatch(receipt[key]),
            f"qualification receipt has invalid {key}",
        )
    require(
        receipt.get("qualifiedNeutralPanel") == QUALIFIED_PANEL_PATH.name
        and receipt.get("qualifiedNeutralPanelSha256")
        == hashlib.sha256(canonical_output(panel).encode()).hexdigest(),
        "qualification receipt does not bind the passed panel",
    )
    require(
        receipt.get("answerVisibility") == "aggregate-counts-only",
        "qualification receipt answer visibility is invalid",
    )
    require_exact_keys(receipt["partitions"], {"open", "heldOut"}, "receipt partitions")
    for partition in ("open", "heldOut"):
        summary = receipt["partitions"][partition]
        require_exact_keys(
            summary,
            {
                "caseCount",
                "degreeCounts",
                "timingStratumCounts",
                "legalSignaturesCovered",
                "traitCounts",
                "minimumTimingSamplesPerCase",
                "quotaValidation",
            },
            f"{partition} receipt summary",
        )
        require(summary.get("caseCount") == 60, f"{partition}: invalid receipt count")
        require(
            summary.get("degreeCounts") == spec["panel"]["degreeQuotaPerPartition"],
            f"{partition}: receipt degree quotas are invalid",
        )
        timing_counts = summary.get("timingStratumCounts", {})
        bounds = spec["panel"]["timingQuotaBoundsPerPartition"]
        require(
            isinstance(timing_counts, dict)
            and set(timing_counts) == set(spec["panel"]["timingStrata"])
            and all(
                isinstance(count, int) and not isinstance(count, bool)
                for count in timing_counts.values()
            )
            and sum(timing_counts.values()) == 60
            and all(
                bounds["minimumEach"] <= count <= bounds["maximumEach"]
                for count in timing_counts.values()
            ),
            f"{partition}: receipt timing quotas are invalid",
        )
        expected_signatures = {
            (degree, *signature)
            for degree in spec["selection"]["degreeOrder"]
            for signature in legal_signatures(degree)
        }
        signature_entries = summary.get("legalSignaturesCovered", [])
        require(
            isinstance(signature_entries, list)
            and all(
                isinstance(entry, dict)
                and set(entry) == {"degree", "signature"}
                and isinstance(entry["degree"], int)
                and not isinstance(entry["degree"], bool)
                and isinstance(entry["signature"], list)
                and len(entry["signature"]) == 2
                and all(
                    isinstance(value, int) and not isinstance(value, bool)
                    for value in entry["signature"]
                )
                for entry in signature_entries
            ),
            f"{partition}: malformed receipt signature coverage",
        )
        actual_signatures = {
            (entry["degree"], *entry["signature"]) for entry in signature_entries
        }
        require(
            actual_signatures == expected_signatures,
            f"{partition}: receipt signature coverage is invalid",
        )
        trait_counts = summary.get("traitCounts", {})
        require(
            isinstance(trait_counts, dict)
            and set(trait_counts) == set(spec["panel"]["traitMinimumPerPartition"])
            and all(
                isinstance(count, int) and not isinstance(count, bool)
                for count in trait_counts.values()
            )
            and all(
                trait_counts[trait] >= minimum
                for trait, minimum in spec["panel"]["traitMinimumPerPartition"].items()
            ),
            f"{partition}: receipt trait quotas are invalid",
        )
        require(
            summary.get("quotaValidation") == "passed",
            f"{partition}: quota receipt did not pass",
        )
        require(
            isinstance(summary.get("minimumTimingSamplesPerCase"), int)
            and not isinstance(summary["minimumTimingSamplesPerCase"], bool)
            and summary["minimumTimingSamplesPerCase"] >= 15,
            f"{partition}: insufficient timing samples in receipt",
        )


def validate_candidate(
    candidate: dict[str, Any], spec: dict[str, Any], label: str
) -> None:
    validate_polynomial(candidate, label)
    require(2 <= candidate["degree"] <= 6, f"{label}: degree outside admitted range")
    require(
        tuple(candidate.get("signature", [])) in legal_signatures(candidate["degree"]),
        f"{label}: illegal signature",
    )
    require(
        candidate.get("timingStratum") in spec["panel"]["timingStrata"],
        f"{label}: invalid timing stratum",
    )
    known_traits = set(spec["panel"]["traitMinimumPerPartition"])
    require(
        isinstance(candidate.get("traits"), list)
        and set(candidate["traits"]) <= known_traits,
        f"{label}: unknown trait",
    )
    require(
        candidate.get("irreducible") is True, f"{label}: irreducibility not certified"
    )
    validate_expected(candidate.get("expected"), label, complete=True)
    require(
        candidate["timingStratum"]
        == timing_stratum(candidate["expected"]["pariPublicNanoseconds"]),
        f"{label}: timing stratum disagrees with PARI sample median",
    )
    class_number = int(candidate["expected"]["classNumber"])
    candidate_traits = set(candidate["traits"])
    require(
        ("trivial-class-group" in candidate_traits) == (class_number == 1),
        f"{label}: trivial-class-group trait disagrees with expected result",
    )
    require(
        ("nontrivial-class-group" in candidate_traits) == (class_number > 1),
        f"{label}: nontrivial-class-group trait disagrees with expected result",
    )
    require(
        ("noncyclic-class-group" in candidate_traits)
        == (len(candidate["expected"]["invariantFactors"]) > 1),
        f"{label}: noncyclic-class-group trait disagrees with expected result",
    )


def seeded_key(seed: str, candidate_id: str) -> str:
    return hashlib.sha256((seed + "\0" + candidate_id).encode()).hexdigest()


def deficits(
    selected: list[dict[str, Any]], spec: dict[str, Any]
) -> tuple[Counter, Counter, set[tuple[int, int]]]:
    timing = Counter(case["timingStratum"] for case in selected)
    traits = Counter(trait for case in selected for trait in case["traits"])
    signatures = {(case["degree"], *case["signature"]) for case in selected}
    return timing, traits, signatures


def score(
    candidate: dict[str, Any], selected: list[dict[str, Any]], spec: dict[str, Any]
) -> int:
    timing, traits, signatures = deficits(selected, spec)
    weights = spec["selection"]["priorityWeights"]
    signature = (candidate["degree"], *candidate["signature"])
    answer = weights["missingLegalSignature"] if signature not in signatures else 0
    minimum = spec["panel"]["timingQuotaBoundsPerPartition"]["minimumEach"]
    if timing[candidate["timingStratum"]] < minimum:
        answer += weights["timingBelowMinimum"]
    for trait in candidate["traits"]:
        if traits[trait] < spec["panel"]["traitMinimumPerPartition"][trait]:
            answer += weights["traitBelowMinimum"]
    midpoint = sum(spec["panel"]["timingQuotaBoundsPerPartition"].values()) // 2
    if timing[candidate["timingStratum"]] < midpoint:
        answer += weights["timingTowardMidpoint"]
    return answer


def select_partition(
    candidates: list[dict[str, Any]],
    spec: dict[str, Any],
    partition: str,
    mandatory_ids: set[str],
) -> list[dict[str, Any]]:
    seed = spec["selection"]["openSeed" if partition == "open" else "heldOutSeed"]
    quota = spec["panel"]["degreeQuotaPerPartition"]
    chosen = [case for case in candidates if case["id"] in mandatory_ids]
    available = [case for case in candidates if case["id"] not in mandatory_ids]
    for degree in spec["selection"]["degreeOrder"]:
        needed = quota[str(degree)] - sum(case["degree"] == degree for case in chosen)
        require(needed >= 0, f"too many mandatory degree-{degree} cases")
        for _ in range(needed):
            eligible = [case for case in available if case["degree"] == degree]
            require(
                eligible, f"candidate pool lacks degree-{degree} cases for {partition}"
            )
            eligible.sort(
                key=lambda case: (
                    -score(case, chosen, spec),
                    seeded_key(seed, case["id"]),
                )
            )
            winner = eligible[0]
            chosen.append(winner)
            available.remove(winner)
    validate_complete_partition(chosen, spec, partition)
    return sorted(
        chosen, key=lambda case: (case["degree"], seeded_key(seed, case["id"]))
    )


def validate_complete_partition(
    cases: list[dict[str, Any]], spec: dict[str, Any], label: str
) -> None:
    require(len(cases) == 60, f"{label}: partition must contain 60 cases")
    degree_counts = Counter(case["degree"] for case in cases)
    require(
        degree_counts
        == Counter(
            {int(k): v for k, v in spec["panel"]["degreeQuotaPerPartition"].items()}
        ),
        f"{label}: degree quota failure: {degree_counts}",
    )
    timing, traits, signatures = deficits(cases, spec)
    bounds = spec["panel"]["timingQuotaBoundsPerPartition"]
    for stratum in spec["panel"]["timingStrata"]:
        require(
            bounds["minimumEach"] <= timing[stratum] <= bounds["maximumEach"],
            f"{label}: timing quota failure for {stratum}: {timing[stratum]}",
        )
    for degree in range(2, 7):
        for signature in legal_signatures(degree):
            require(
                (degree, *signature) in signatures,
                f"{label}: missing degree-{degree} signature {signature}",
            )
    for trait, minimum in spec["panel"]["traitMinimumPerPartition"].items():
        require(
            traits[trait] >= minimum,
            f"{label}: trait quota failure for {trait}: {traits[trait]} < {minimum}",
        )


def normalized_expected(case: dict[str, Any]) -> dict[str, Any]:
    expected = case["expected"]
    return {
        "classNumber": expected["classNumber"],
        "invariantFactors": expected["invariantFactors"],
        "pariPublicNanoseconds": expected["pariPublicNanoseconds"],
        "oracleIdentity": expected["oracleIdentity"],
        "validationStatus": expected["validationStatus"],
    }


def public_case(case: dict[str, Any], *, reveal_answer: bool) -> dict[str, Any]:
    answer = {
        "id": case["id"],
        "polynomialAscending": case["polynomialAscending"],
        "polynomialSha256": case["polynomialSha256"],
        "degree": case["degree"],
    }
    if reveal_answer:
        answer.update(
            {
                "signature": case["signature"],
                "timingStratum": case["timingStratum"],
                "traits": case["traits"],
                "expected": normalized_expected(case),
            }
        )
    return answer


def qualification_summary(
    cases: list[dict[str, Any]], spec: dict[str, Any]
) -> dict[str, Any]:
    """Return aggregate, answer-free evidence that a partition meets its quotas."""

    validate_complete_partition(cases, spec, "qualification summary")
    timing, traits, signatures = deficits(cases, spec)
    return {
        "caseCount": len(cases),
        "degreeCounts": {
            str(degree): sum(case["degree"] == degree for case in cases)
            for degree in spec["selection"]["degreeOrder"]
        },
        "timingStratumCounts": {
            stratum: timing[stratum] for stratum in spec["panel"]["timingStrata"]
        },
        "legalSignaturesCovered": [
            {"degree": degree, "signature": [r1, r2]}
            for degree, r1, r2 in sorted(signatures)
        ],
        "traitCounts": {
            trait: traits[trait] for trait in spec["panel"]["traitMinimumPerPartition"]
        },
        "minimumTimingSamplesPerCase": min(
            len(case["expected"]["pariPublicNanoseconds"]) for case in cases
        ),
        "quotaValidation": "passed",
    }


def qualified_neutral_panel(
    open_cases: list[dict[str, Any]], heldout_cases: list[dict[str, Any]]
) -> dict[str, Any]:
    """Build the runtime panel without per-field oracle or selection metadata."""

    return {
        "schema": "sagejs.rust-class-group/qualified-neutral-panel-v1",
        "status": "r0-fully-qualified-input-panel",
        "spec": SPEC_PATH.name,
        "answerVisibility": "none",
        "qualificationClaims": {
            "degreeQuotasSatisfied": True,
            "signatureQuotasSatisfied": True,
            "timingQuotasSatisfied": True,
            "traitQuotasSatisfied": True,
            "minimumPariSamplesPerCase": 15,
        },
        "partitions": {
            "open": {
                "cases": [
                    neutral_runtime_input(case, "open")
                    for case in sorted(open_cases, key=lambda case: case["id"])
                ]
            },
            "heldOut": {
                "cases": [
                    neutral_runtime_input(case, "heldOut")
                    for case in sorted(heldout_cases, key=lambda case: case["id"])
                ]
            },
        },
    }


def private_qualification_evidence(
    pool: dict[str, Any],
    open_cases: list[dict[str, Any]],
    heldout_cases: list[dict[str, Any]],
) -> dict[str, Any]:
    """Keep all answer-bearing evidence together, outside the repository."""

    return {
        "schema": "sagejs.rust-class-group/private-qualified-panel-evidence-v1",
        "spec": SPEC_PATH.name,
        "generatorSeed": pool.get("generatorSeed"),
        "oracleBuild": pool.get("oracleBuild"),
        "partitions": {
            "open": {"cases": open_cases},
            "heldOut": {"cases": heldout_cases},
        },
    }


def qualification_receipt(
    pool_path: Path,
    private_path: Path,
    panel_path: Path,
    open_cases: list[dict[str, Any]],
    heldout_cases: list[dict[str, Any]],
    spec: dict[str, Any],
) -> dict[str, Any]:
    """Bind public inputs to private evidence without publishing field answers."""

    return {
        "schema": "sagejs.rust-class-group/qualification-selection-receipt-v1",
        "status": "passed",
        "spec": SPEC_PATH.name,
        "specSha256": hashlib.sha256(SPEC_PATH.read_bytes()).hexdigest(),
        "selectionAlgorithm": spec["selection"]["algorithm"],
        "selectionSeeds": {
            "open": spec["selection"]["openSeed"],
            "heldOut": spec["selection"]["heldOutSeed"],
        },
        "sourcePoolSha256": hashlib.sha256(pool_path.read_bytes()).hexdigest(),
        "oracleIdentity": ORACLE_IDENTITY_PATH.name,
        "oracleIdentitySha256": hashlib.sha256(
            ORACLE_IDENTITY_PATH.read_bytes()
        ).hexdigest(),
        "traceContract": TRACE_CONTRACT_PATH.name,
        "traceContractSha256": hashlib.sha256(
            TRACE_CONTRACT_PATH.read_bytes()
        ).hexdigest(),
        "qualifiedNeutralPanel": panel_path.name,
        "qualifiedNeutralPanelSha256": hashlib.sha256(
            panel_path.read_bytes()
        ).hexdigest(),
        "privateEvidenceSha256": hashlib.sha256(private_path.read_bytes()).hexdigest(),
        "answerVisibility": "aggregate-counts-only",
        "partitions": {
            "open": qualification_summary(open_cases, spec),
            "heldOut": qualification_summary(heldout_cases, spec),
        },
    }


def is_within(path: Path, parent: Path) -> bool:
    try:
        path.resolve().relative_to(parent.resolve())
        return True
    except ValueError:
        return False


def command_validate(_: argparse.Namespace) -> None:
    spec = load(SPEC_PATH)
    pool = load(NEUTRAL_POOL_PATH)
    eligibility = load(NEUTRAL_ELIGIBILITY_PATH)
    initial = load(INITIAL_PATH)
    validate_spec(spec)
    validate_layout(load(LAYOUT_PATH), spec)
    validate_initial(initial, spec)
    validate_neutral_pool(pool)
    validate_neutral_eligibility(eligibility, pool)
    v2_pool_exists = NEUTRAL_POOL_V2_PATH.exists()
    v2_eligibility_exists = NEUTRAL_ELIGIBILITY_V2_PATH.exists()
    require(
        v2_pool_exists == v2_eligibility_exists,
        "v2 neutral pool and eligibility evidence must be committed together",
    )
    if v2_pool_exists:
        v2_pool = load(NEUTRAL_POOL_V2_PATH)
        validate_neutral_pool(v2_pool)
        validate_neutral_eligibility(
            load(NEUTRAL_ELIGIBILITY_V2_PATH),
            v2_pool,
            NEUTRAL_POOL_V2_PATH,
            require_all_irreducible=False,
        )
    validate_balanced_neutral_panel(
        load(NEUTRAL_PANEL_PATH), spec, pool, initial, eligibility
    )
    qualified_exists = QUALIFIED_PANEL_PATH.exists()
    receipt_exists = QUALIFICATION_RECEIPT_PATH.exists()
    require(
        qualified_exists == receipt_exists,
        "qualified panel and its receipt must be committed together",
    )
    if qualified_exists:
        validate_qualified_neutral_panel(
            load(QUALIFIED_PANEL_PATH), load(QUALIFICATION_RECEIPT_PATH), spec
        )
    suffix = ", v2 screened inputs" if v2_pool_exists else ""
    if qualified_exists:
        suffix += ", and the qualified answer-free 60+60 panel"
    print(
        "validated corpus spec, 120-slot layout, 9-case initial open panel, "
        f"360 neutral candidate inputs, balanced 60+60 neutral panel{suffix}"
    )


def command_emit_layout(arguments: argparse.Namespace) -> None:
    spec = load(SPEC_PATH)
    validate_spec(spec)
    rendered = canonical_output(make_layout(spec))
    target = Path(arguments.output).resolve() if arguments.output else LAYOUT_PATH
    if arguments.check:
        require(
            target.exists() and target.read_text(encoding="utf-8") == rendered,
            f"{target}: generated layout differs",
        )
        print(f"layout is canonical: {target}")
    else:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(rendered, encoding="utf-8")
        print(f"wrote {target}")


def command_emit_neutral_panel(arguments: argparse.Namespace) -> None:
    spec = load(SPEC_PATH)
    pool = load(NEUTRAL_POOL_PATH)
    eligibility = load(NEUTRAL_ELIGIBILITY_PATH)
    initial = load(INITIAL_PATH)
    validate_spec(spec)
    validate_initial(initial, spec)
    validate_neutral_pool(pool)
    validate_neutral_eligibility(eligibility, pool)
    rendered = canonical_output(
        make_balanced_neutral_panel(spec, pool, initial, eligibility)
    )
    target = (
        Path(arguments.output).resolve() if arguments.output else NEUTRAL_PANEL_PATH
    )
    if arguments.check:
        require(
            target.exists() and target.read_text(encoding="utf-8") == rendered,
            f"{target}: generated neutral panel differs",
        )
        print(f"balanced neutral panel is canonical: {target}")
    else:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(rendered, encoding="utf-8")
        print(f"wrote {target}")


def command_candidate_template(_: argparse.Namespace) -> None:
    template = {
        "schema": "sagejs.rust-class-group/private-candidate-pool-v1",
        "oracleBuild": {"pariVersion": "2.17.4", "identity": "sha256:..."},
        "candidates": [
            {
                "id": "stable-public-id",
                "polynomialAscending": ["-1", "-1", "0", "1"],
                "polynomialSha256": polynomial_digest(["-1", "-1", "0", "1"]),
                "degree": 3,
                "signature": [1, 1],
                "timingStratum": "under-5ms",
                "traits": ["trivial-class-group", "nontrivial-units"],
                "irreducible": True,
                "expected": {
                    "classNumber": "1",
                    "invariantFactors": [],
                    "pariPublicNanoseconds": [
                        500000,
                        501000,
                        502000,
                        503000,
                        504000,
                        505000,
                        506000,
                        507000,
                        508000,
                        509000,
                        510000,
                        511000,
                        512000,
                        513000,
                        514000,
                    ],
                    "oracleIdentity": "pari-2.17.4-build-sha256:...",
                    "validationStatus": "pari-plus-independent-check",
                },
            }
        ],
    }
    sys.stdout.write(canonical_output(template))


def command_select(arguments: argparse.Namespace) -> None:
    spec = load(SPEC_PATH)
    validate_spec(spec)
    pool_path = Path(arguments.candidate_pool).resolve()
    pool = load(pool_path)
    require(
        pool.get("schema") == "sagejs.rust-class-group/private-candidate-pool-v1",
        "unexpected candidate pool schema",
    )
    candidates = pool.get("candidates")
    require(isinstance(candidates, list), "candidate pool lacks candidates")
    ids: set[str] = set()
    digests: set[str] = set()
    for candidate in candidates:
        label = f"candidate {candidate.get('id', '<missing>')}"
        require(
            isinstance(candidate.get("id"), str) and candidate["id"] not in ids,
            f"{label}: duplicate or invalid ID",
        )
        ids.add(candidate["id"])
        validate_candidate(candidate, spec, label)
        require(
            candidate["polynomialSha256"] not in digests,
            f"{label}: duplicate polynomial",
        )
        digests.add(candidate["polynomialSha256"])
    candidates.sort(key=lambda candidate: candidate["id"])
    mandatory = set(spec["selection"]["mandatoryOpenIds"])
    require(mandatory <= ids, "candidate pool omits mandatory open fields")
    open_cases = select_partition(candidates, spec, "open", mandatory)
    open_ids = {case["id"] for case in open_cases}
    remaining = [case for case in candidates if case["id"] not in open_ids]
    heldout_cases = select_partition(remaining, spec, "heldOut", set())

    private_path = Path(arguments.private_heldout_answers).resolve()
    require(
        not is_within(private_path, REPOSITORY),
        "private held-out answers must be written outside the repository",
    )
    extended_outputs = any(
        (
            arguments.neutral_output,
            arguments.private_all_evidence,
            arguments.receipt_output,
        )
    )
    if extended_outputs:
        require(
            arguments.neutral_output
            and arguments.private_all_evidence
            and arguments.receipt_output,
            "neutral output, private all-evidence, and receipt must be requested together",
        )
        neutral_path = Path(arguments.neutral_output).resolve()
        private_all_path = Path(arguments.private_all_evidence).resolve()
        receipt_path = Path(arguments.receipt_output).resolve()
        require(
            not is_within(private_all_path, REPOSITORY),
            "private all-partition evidence must be written outside the repository",
        )
        require(
            neutral_path != receipt_path,
            "neutral panel and qualification receipt need distinct paths",
        )
    outputs = {
        Path(arguments.open_output): {
            "schema": "sagejs.rust-class-group/open-qualification-panel-v1",
            "spec": SPEC_PATH.name,
            "cases": [public_case(case, reveal_answer=True) for case in open_cases],
        },
        Path(arguments.heldout_output): {
            "schema": "sagejs.rust-class-group/heldout-input-panel-v1",
            "spec": SPEC_PATH.name,
            "answerVisibility": "withheld",
            "cases": [public_case(case, reveal_answer=False) for case in heldout_cases],
        },
        private_path: {
            "schema": "sagejs.rust-class-group/private-heldout-answers-v1",
            "spec": SPEC_PATH.name,
            "cases": [
                {"id": case["id"], "expected": normalized_expected(case)}
                for case in heldout_cases
            ],
        },
    }
    for path, value in outputs.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(canonical_output(value), encoding="utf-8")
        print(f"wrote {path} sha256={hashlib.sha256(path.read_bytes()).hexdigest()}")

    if extended_outputs:
        neutral_path.parent.mkdir(parents=True, exist_ok=True)
        private_all_path.parent.mkdir(parents=True, exist_ok=True)
        receipt_path.parent.mkdir(parents=True, exist_ok=True)
        neutral_path.write_text(
            canonical_output(qualified_neutral_panel(open_cases, heldout_cases)),
            encoding="utf-8",
        )
        private_all_path.write_text(
            canonical_output(
                private_qualification_evidence(pool, open_cases, heldout_cases)
            ),
            encoding="utf-8",
        )
        receipt_path.write_text(
            canonical_output(
                qualification_receipt(
                    pool_path,
                    private_all_path,
                    neutral_path,
                    open_cases,
                    heldout_cases,
                    spec,
                )
            ),
            encoding="utf-8",
        )
        for path in (neutral_path, private_all_path, receipt_path):
            print(
                f"wrote {path} sha256={hashlib.sha256(path.read_bytes()).hexdigest()}"
            )


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description=__doc__)
    commands = result.add_subparsers(dest="command", required=True)
    validate = commands.add_parser("validate", help="validate committed R0 artifacts")
    validate.set_defaults(run=command_validate)
    emit = commands.add_parser(
        "emit-layout", help="generate the canonical 120-slot layout"
    )
    emit.add_argument("--output")
    emit.add_argument("--check", action="store_true")
    emit.set_defaults(run=command_emit_layout)
    emit_neutral = commands.add_parser(
        "emit-neutral-panel", help="generate the balanced 60+60 neutral input panel"
    )
    emit_neutral.add_argument("--output")
    emit_neutral.add_argument("--check", action="store_true")
    emit_neutral.set_defaults(run=command_emit_neutral_panel)
    template = commands.add_parser(
        "candidate-template", help="print a private-pool example"
    )
    template.set_defaults(run=command_candidate_template)
    select = commands.add_parser(
        "select", help="select complete open and held-out panels"
    )
    select.add_argument("--candidate-pool", required=True)
    select.add_argument("--open-output", required=True)
    select.add_argument("--heldout-output", required=True)
    select.add_argument("--private-heldout-answers", required=True)
    select.add_argument(
        "--neutral-output",
        help="write a fully qualified answer-free runtime panel",
    )
    select.add_argument(
        "--private-all-evidence",
        help="write complete answer-bearing evidence outside the repository",
    )
    select.add_argument(
        "--receipt-output",
        help="write an answer-free qualification receipt binding both outputs",
    )
    select.set_defaults(run=command_select)
    return result


def main() -> int:
    try:
        arguments = parser().parse_args()
        arguments.run(arguments)
        return 0
    except (CorpusError, KeyError, OSError, json.JSONDecodeError) as error:
        print(f"corpus error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
