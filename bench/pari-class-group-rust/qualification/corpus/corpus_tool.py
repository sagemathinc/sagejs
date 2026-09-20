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
DECIMAL = re.compile(r"(?:0|-[1-9][0-9]*|[1-9][0-9]*)\Z")


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


def is_within(path: Path, parent: Path) -> bool:
    try:
        path.resolve().relative_to(parent.resolve())
        return True
    except ValueError:
        return False


def command_validate(_: argparse.Namespace) -> None:
    spec = load(SPEC_PATH)
    validate_spec(spec)
    validate_layout(load(LAYOUT_PATH), spec)
    validate_initial(load(INITIAL_PATH), spec)
    validate_neutral_pool(load(NEUTRAL_POOL_PATH))
    print(
        "validated corpus spec, 120-slot layout, 9-case initial open panel, "
        "and 360 neutral candidate inputs"
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
    pool = load(Path(arguments.candidate_pool))
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
