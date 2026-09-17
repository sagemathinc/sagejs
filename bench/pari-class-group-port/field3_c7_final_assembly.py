"""Authenticated field-3 C7 class/unit correspondence preparation.

This module joins independently published owners.  It deliberately does not
claim that the public class/unit API is complete: C5/C6 still own the final
fundamental-unit representation, while this C7 boundary proves that the
terminal class columns, exact relations, Smith data, ideals, and analytic
owners describe one correspondence.
"""

from __future__ import annotations

from collections.abc import Mapping
import re
from typing import Any

from sagejs.native import IntegerBuffer, Int64Buffer, native

from .field3_full_terminal_ancestry import (
    CLASS_COLUMNS,
    RELATION_ROWS,
    RAW_COLUMNS,
)
from .field3_packed_class_cleanarch import pari_field3_packed_class_cleanarch
from .pi_constant import pari_pi_workspace_capacity
from .quartic_class_group_assembly import pari_mixed_quartic_class_group_assembly


OUTPUT_SCHEMA = "sagejs.pari-class-group/field3-c7-correspondence-v1"
FULL15_SCHEMA = "sagejs.pari-class-group/field3-full-terminal-ancestry-v1"
REGULATOR_SCHEMA = "sagejs.pari-class-group/field3-analytic-accepted-owner-v1"
UNIT_SCHEMA = "sagejs.pari-class-group/field3-c5-c6-unit-owner-v1"
LIVE_SCHEMA = "sagejs.pari-class-group/field3-live-final-owner-v1"
FIELD = "x^4-2000022*x-2000042"
LOG_CELLS = 7
PLACES = 3
_SHA256 = re.compile(r"[0-9a-f]{64}\Z")


class Field3C7Failure(ValueError):
    """One of the independently authenticated C7 owners failed closed."""


def _integer(value: Any, label: str) -> int:
    if isinstance(value, bool) or not isinstance(value, (int, str)):
        raise Field3C7Failure(f"{label} is not integral")
    try:
        answer = int(value)
    except ValueError as error:
        raise Field3C7Failure(f"{label} is not integral") from error
    if str(answer) != str(value):
        raise Field3C7Failure(f"{label} is not canonical")
    return answer


def _integers(value: Any, length: int, label: str) -> list[int]:
    if not isinstance(value, list) or len(value) != length:
        raise Field3C7Failure(f"{label} shape changed")
    return [_integer(cell, f"{label}[{index}]") for index, cell in enumerate(value)]


def _mapping(value: Any, label: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise Field3C7Failure(f"{label} is not an object")
    return value


def _digest(value: Any, label: str) -> str:
    if not isinstance(value, str) or _SHA256.fullmatch(value) is None:
        raise Field3C7Failure(f"{label} is not a SHA-256 digest")
    return value


def _digest_words(value: str) -> list[int]:
    result: list[int] = []
    for index in range(4):
        word = int(value[16 * index : 16 * index + 16], 16)
        if word >= 1 << 63:
            word -= 1 << 64
        result.append(word)
    return result


def _field(owner: Mapping[str, Any], schema: str, label: str) -> None:
    if owner.get("schema") != schema or owner.get("field") != FIELD:
        raise Field3C7Failure(f"{label} identity changed")


@native
def pari_field3_retain_generator_square_witnesses(
    relation_records: Int64Buffer,
    transform: IntegerBuffer,
    terminal_h: IntegerBuffer,
    terminal_permutation: Int64Buffer,
    candidate_exponents: IntegerBuffer,
    candidate_images: IntegerBuffer,
    exponents: IntegerBuffer,
    images: IntegerBuffer,
    state: Int64Buffer,
) -> int:
    """Publish the two exact terminal principal-witness columns atomically."""
    raw_columns = 301
    relation_rows = 288
    unit_columns = 13
    class_columns = 2
    terminal_columns = 15
    if (
        len(candidate_exponents) < raw_columns * class_columns
        or len(candidate_images) < relation_rows * class_columns
        or len(exponents) < raw_columns * class_columns
        or len(images) < relation_rows * class_columns
        or len(state) < 8
    ):
        return 2
    for logical in range(relation_rows):
        physical = terminal_permutation[logical]
        if physical < 1 or physical > relation_rows:
            return 1
        for earlier in range(logical):
            if terminal_permutation[earlier] == physical:
                return 1
    for target in range(terminal_columns):
        for row in range(relation_rows):
            value = 0
            for relation in range(raw_columns):
                value += (
                    relation_records[relation * relation_rows + row]
                    * transform[target * raw_columns + relation]
                )
            expected = 0
            if target >= unit_columns:
                for logical in range(class_columns):
                    if terminal_permutation[logical] - 1 == row:
                        expected = terminal_h[
                            (target - unit_columns) * class_columns + logical
                        ]
            if value != expected:
                return 1
    for generator in range(class_columns):
        for relation in range(raw_columns):
            candidate_exponents[generator * raw_columns + relation] = transform[
                (unit_columns + generator) * raw_columns + relation
            ]
        for row in range(relation_rows):
            value = 0
            for relation in range(raw_columns):
                value += (
                    relation_records[relation * relation_rows + row]
                    * candidate_exponents[generator * raw_columns + relation]
                )
            candidate_images[generator * relation_rows + row] = value
    for index in range(raw_columns * class_columns):
        exponents[index] = candidate_exponents[index]
    for index in range(relation_rows * class_columns):
        images[index] = candidate_images[index]
    state[0] = 0
    state[1] = raw_columns
    state[2] = relation_rows
    state[3] = unit_columns
    state[4] = class_columns
    state[5] = raw_columns * class_columns
    state[6] = relation_rows * class_columns
    state[7] = terminal_columns
    return 0


def _clean_class_logs(source: list[int], precision: int) -> tuple[list[int], list[int]]:
    size = PLACES * CLASS_COLUMNS * LOG_CELLS
    coefficient_cells, stack_cells = pari_pi_workspace_capacity(precision)
    output = [0] * size
    state = [0] * 7
    status = pari_field3_packed_class_cleanarch(
        source,
        CLASS_COLUMNS,
        precision,
        [0] * 3,
        [0] * coefficient_cells,
        [0] * coefficient_cells,
        [0] * coefficient_cells,
        [0] * coefficient_cells,
        [0] * stack_cells,
        [0] * size,
        output,
        state,
    )
    if status != 0:
        raise Field3C7Failure("class cleanarch requested a precision retry")
    return output, state


def _class_assembly(
    w: list[int], cleaned: list[int], primes: list[int], tau: list[int]
) -> dict[str, Any]:
    n = 2
    active = 2

    def zero(length: int) -> list[int]:
        return [0] * length

    matrices = [[0] * 4 for _ in range(10)]
    generator_ideals = zero(32)
    generated_ideals = zero(32)
    relation_exponents = zero(4)
    offsets = zero(3)
    kinds = zero(2)
    numerators = zero(2)
    denominators = zero(2)
    factor_exponents = zero(2)
    invariants = zero(2)
    class_number = zero(1)
    ga = zero(42)
    gd = zero(42)
    generator_arch = zero(42)
    division_states = [[0] * 7 for _ in range(4)]
    smith_state = zero(9)
    cx_state = zero(3)
    state = zero(8)
    status = pari_mixed_quartic_class_group_assembly(
        w,
        cleaned,
        primes,
        tau,
        n,
        active,
        generator_ideals,
        generated_ideals,
        relation_exponents,
        offsets,
        kinds,
        numerators,
        denominators,
        factor_exponents,
        zero(16),
        zero(16),
        zero(52),
        zero(20),
        zero(4),
        *matrices,
        invariants,
        class_number,
        ga,
        gd,
        generator_arch,
        zero(2),
        zero(4),
        zero(8),
        *division_states,
        smith_state,
        cx_state,
        zero(42),
        zero(42),
        zero(42),
        zero(42),
        zero(42),
        zero(42),
        state,
    )
    if status != 0:
        raise Field3C7Failure("mixed-quartic class assembly failed")
    names = ["D", "U", "Ui", "V", "Ur", "Y", "Uir", "X", "M1", "M2"]
    return {
        "matrices": {
            name: matrix for name, matrix in zip(names, matrices, strict=True)
        },
        "invariants": invariants,
        "classNumber": class_number[0],
        "idealGenerators": generator_ideals,
        "relationExponents": relation_exponents,
        "principalFactors": {
            "offsets": offsets,
            "kinds": kinds,
            "numerators": numerators,
            "denominators": denominators,
            "exponents": factor_exponents,
        },
        "Ga": ga,
        "GD": gd,
        "generatorArch": generator_arch,
        "smithState": smith_state,
        "assemblyState": state,
    }


def assemble_authenticated_owners(
    full15_owner: Mapping[str, Any],
    regulator_owner: Mapping[str, Any],
    unit_owner: Mapping[str, Any],
    live_owner: Mapping[str, Any],
) -> dict[str, Any]:
    """Create the non-public C7 correspondence envelope."""
    _field(full15_owner, FULL15_SCHEMA, "full15 owner")
    _field(regulator_owner, REGULATOR_SCHEMA, "regulator owner")
    _field(unit_owner, UNIT_SCHEMA, "unit owner")
    _field(live_owner, LIVE_SCHEMA, "live owner")

    transform = _integers(full15_owner.get("transform"), 301 * 15, "full15 transform")
    terminal_h = _integers(full15_owner.get("terminalH"), 4, "terminal H")
    permutation = _integers(
        full15_owner.get("terminalPermutation"), 288, "terminal permutation"
    )
    packed_a = _integers(full15_owner.get("packedA"), 273, "packed A")
    packed_ce = _integers(full15_owner.get("packedCe"), 42, "packed Ce")
    packed_terminal = _integers(
        full15_owner.get("packedTerminal"), 315, "packed terminal"
    )
    if packed_terminal != packed_a + packed_ce:
        raise Field3C7Failure("full15 A/Ce split changed")
    if _integers(full15_owner.get("terminalState"), 9, "terminal state") != [
        2,
        15,
        286,
        0,
        13,
        3,
        0,
        301,
        0,
    ]:
        raise Field3C7Failure("terminal HNF state changed")

    if regulator_owner.get("accepted") is not True:
        raise Field3C7Failure("analytic regulator owner is not accepted")
    regulator = _integers(regulator_owner.get("regulator"), 3, "regulator")
    regulator_precision = _integer(
        regulator_owner.get("precision"), "regulator precision"
    )
    regulator_generation = _integer(
        regulator_owner.get("generation"), "regulator generation"
    )
    accepted_c4_sha256 = _digest(
        regulator_owner.get("acceptedC4OwnerSha256"), "accepted C4 owner"
    )
    regulator_full15_sha256 = _digest(
        regulator_owner.get("fullTerminalOwnerSha256"),
        "regulator full terminal owner",
    )
    regulator_c3_sha256 = _digest(
        regulator_owner.get("c3OwnerSha256"), "regulator C3 owner"
    )
    _digest(regulator_owner.get("fieldOwnerSha256"), "regulator field owner")
    _digest(regulator_owner.get("catalogOwnerSha256"), "regulator catalog owner")
    regulator_c3_hash = _integers(regulator_owner.get("c3Hash"), 4, "regulator C3 hash")
    regulator_c3_latches = _integers(
        regulator_owner.get("c3Latches"), 2, "regulator C3 latches"
    )
    if regulator_c3_hash != _digest_words(regulator_c3_sha256):
        raise Field3C7Failure("regulator C3 digest latch changed")
    _integers(regulator_owner.get("analyticOwnerState"), 6, "analytic owner state")
    _integers(regulator_owner.get("multipleState"), 4, "regulator multiple state")
    regulator_acceptance = _integers(
        regulator_owner.get("acceptanceState"), 4, "regulator acceptance state"
    )
    regulator_compute = _integers(
        regulator_owner.get("computeRState"), 6, "regulator compute_R state"
    )
    if regulator_acceptance != [0, regulator_generation, regulator_precision, 1]:
        raise Field3C7Failure("regulator acceptance state is not terminal")
    if regulator_compute != [0, 0, 0, 0, 1, regulator_precision]:
        raise Field3C7Failure("regulator compute_R state is not terminal")
    _integers(regulator_owner.get("relations"), 26, "regulator relations")
    analytic_assumptions = _mapping(
        regulator_owner.get("assumptions"), "analytic assumptions"
    )
    if unit_owner.get("accepted") is not True:
        raise Field3C7Failure("unit owner is not accepted")
    if unit_owner.get("status") != "success" or unit_owner.get("reason") is not None:
        raise Field3C7Failure("unit owner is not a successful C6 publication")
    if _integers(unit_owner.get("packedA"), 273, "unit packed A") != packed_a:
        raise Field3C7Failure("unit/full15 A owners diverged")
    unit_assumptions = _mapping(unit_owner.get("assumptions"), "unit assumptions")
    if (
        unit_assumptions.get("exactFactorbackVerified") is not True
        or unit_assumptions.get("signInverseMaterializationVerified") is not True
        or unit_assumptions.get("publicCompletion") is not False
    ):
        raise Field3C7Failure("unit assumptions overstate or omit verification")
    unit_precision = _integer(unit_owner.get("precision"), "unit precision")
    unit_generation = _integer(unit_owner.get("generation"), "unit generation")
    if unit_precision < 64 or unit_precision % 64 != 0 or unit_generation < 1:
        raise Field3C7Failure("unit precision generation changed")
    if (
        regulator_precision != unit_precision
        or regulator_generation != unit_generation
        or _integers(unit_owner.get("c3Hash"), 4, "unit C3 hash") != regulator_c3_hash
        or _integers(unit_owner.get("c3Latches"), 2, "unit C3 latches")
        != regulator_c3_latches
        or _integers(unit_owner.get("acceptanceState"), 4, "unit acceptance state")
        != regulator_acceptance
    ):
        raise Field3C7Failure("regulator and unit acceptance provenance diverged")
    factored_shape = _integers(
        unit_owner.get("factoredTransformShape"), 2, "factored transform shape"
    )
    if factored_shape != [301, 2]:
        raise Field3C7Failure("factored transform shape changed")
    _integers(unit_owner.get("factoredTransform"), 602, "factored transform")
    adjusted_shape = _integers(
        unit_owner.get("adjustedFactorShape"), 2, "adjusted factor shape"
    )
    if adjusted_shape != [2, 2]:
        raise Field3C7Failure("adjusted factor shape changed")
    adjusted_factor = _integers(unit_owner.get("adjustedFactor"), 4, "adjusted factor")
    if adjusted_factor[0] * adjusted_factor[3] - adjusted_factor[1] * adjusted_factor[
        2
    ] not in (-1, 1):
        raise Field3C7Failure("adjusted factor is not unimodular")
    norms = _integers(unit_owner.get("norms"), 2, "unit norms")
    if any(abs(value) != 1 for value in norms):
        raise Field3C7Failure("materialized unit norm changed")
    units = unit_owner.get("units")
    if not isinstance(units, list) or len(units) != 2:
        raise Field3C7Failure("materialized unit count changed")
    for column, unit_value in enumerate(units):
        unit = _mapping(unit_value, f"unit {column}")
        if (
            _integer(unit.get("column"), f"unit {column} index") != column
            or _integers(unit.get("powerBasis"), 4, f"unit {column} power basis")
            == [0, 0, 0, 0]
            or _integer(unit.get("norm"), f"unit {column} norm") != norms[column]
            or not isinstance(unit.get("inverseChosen"), bool)
            or _integer(unit.get("torsionSign"), f"unit {column} torsion sign")
            not in (-1, 1)
            or unit.get("exactFactorback") is not True
        ):
            raise Field3C7Failure("materialized unit correspondence changed")
    unit_ancestry = _mapping(unit_owner.get("ancestry"), "unit ancestry")
    for key in (
        "full15OwnerSha256",
        "c5OwnerSha256",
        "c6OwnerSha256",
        "c3OwnerSha256",
        "acceptedC4OwnerSha256",
        "embeddingOwnerSha256",
        "candidateSha256",
        "factorbackSourceOwnerSha256",
        "factorbackReceiptSha256",
    ):
        _digest(unit_ancestry.get(key), f"unit ancestry {key}")
    full15_sha256 = full15_owner.get("_authenticatedSha256")
    if full15_sha256 is None:
        raise Field3C7Failure("full15 owner lacks authenticated digest")
    full15_sha256 = _digest(full15_sha256, "authenticated full15 digest")
    if full15_sha256 != unit_ancestry.get("full15OwnerSha256"):
        raise Field3C7Failure("unit owner is detached from authenticated full15")
    if regulator_full15_sha256 != full15_sha256:
        raise Field3C7Failure("regulator owner is detached from authenticated full15")
    if (
        unit_ancestry.get("acceptedC4OwnerSha256") != accepted_c4_sha256
        or unit_ancestry.get("c3OwnerSha256") != regulator_c3_sha256
    ):
        raise Field3C7Failure("regulator and unit owner ancestry diverged")
    unit_proof = _mapping(unit_owner.get("proof"), "unit proof")
    for key in (
        "relationKernel",
        "exactFactorback",
        "principalIdealOne",
        "torsionPlusMinusOne",
        "normAndInverse",
        "logLattice",
    ):
        if unit_proof.get(key) is not True:
            raise Field3C7Failure(f"unit proof {key} is absent")
    inverse_mask = _integer(unit_proof.get("inverseMask"), "unit inverse mask")
    if inverse_mask < 0 or inverse_mask > 3:
        raise Field3C7Failure("unit inverse mask changed")
    proof_columns = unit_proof.get("columns")
    if not isinstance(proof_columns, list) or len(proof_columns) != 2:
        raise Field3C7Failure("unit proof columns changed")
    for column, proof_value in enumerate(proof_columns):
        proof_column = _mapping(proof_value, f"unit proof column {column}")
        if (
            _integer(proof_column.get("column"), "unit proof column index") != column
            or proof_column.get("inverseChosen") != bool(inverse_mask & (1 << column))
            or _integer(proof_column.get("materializedNorm"), "proof materialized norm")
            != norms[column]
            or _integer(proof_column.get("torsionSign"), "proof torsion sign")
            != _integer(units[column].get("torsionSign"), "unit torsion sign")
        ):
            raise Field3C7Failure("unit proof/materialization correspondence changed")

    w = _integers(live_owner.get("W"), 4, "live W")
    live_c = _integers(live_owner.get("packedC"), 42, "live C")
    if w != terminal_h or live_c != packed_ce:
        raise Field3C7Failure("live terminal W/C owners diverged")
    b = _integers(live_owner.get("B"), 572, "live B")
    relation_records = _integers(
        live_owner.get("relationRecords"), 288 * 301, "relation records"
    )
    principals = live_owner.get("relationPrincipals")
    if not isinstance(principals, list) or len(principals) != RAW_COLUMNS:
        raise Field3C7Failure("exact relation principal basis changed")
    for index, principal in enumerate(principals):
        exact = _mapping(principal, f"relation principal {index}")
        if (
            _integer(exact.get("relation"), f"relation principal {index} index")
            != index
        ):
            raise Field3C7Failure("relation principal order changed")
        divisor = _integers(
            exact.get("divisor"), RELATION_ROWS, f"relation principal {index} divisor"
        )
        expected_divisor = [
            relation_records[index * RELATION_ROWS + row]
            for row in range(RELATION_ROWS)
        ]
        if divisor != expected_divisor:
            raise Field3C7Failure("relation principal divisor changed")
        exact_factor = _mapping(
            exact.get("exactFactor"), f"relation principal {index} exact factor"
        )
        power_basis = _integers(
            exact_factor.get("powerBasis"),
            4,
            f"relation principal {index} power basis",
        )
        if power_basis == [0, 0, 0, 0] or exact_factor.get("source") != (
            "authenticated-principal-generator"
        ):
            raise Field3C7Failure("relation exact principal factor changed")
    vbase = live_owner.get("Vbase")
    if not isinstance(vbase, list) or len(vbase) != 2:
        raise Field3C7Failure("Vbase descriptor count changed")
    primes: list[int] = []
    tau: list[int] = []
    for index, descriptor_value in enumerate(vbase):
        descriptor = _mapping(descriptor_value, f"Vbase[{index}]")
        primes.append(_integer(descriptor.get("prime"), f"Vbase[{index}].prime"))
        tau.extend(_integers(descriptor.get("tau"), 16, f"Vbase[{index}].tau"))
    torsion = _mapping(live_owner.get("torsion"), "torsion owner")
    live_assumptions = _mapping(live_owner.get("assumptions"), "live assumptions")
    precision = _integer(live_owner.get("precision"), "live precision")
    if precision != unit_precision:
        raise Field3C7Failure("live and unit precision differ")
    if (
        live_assumptions.get("exactRelationAuthority") is not True
        or live_assumptions.get("exactClassReplay") is not True
        or live_assumptions.get("publicCompletion") is not False
    ):
        raise Field3C7Failure("live assumptions overstate or omit authority")
    live_ancestry = _mapping(live_owner.get("ancestry"), "live ancestry")
    for key in (
        "full15OwnerSha256",
        "relationAuthoritySha256",
        "classAuthoritySha256",
    ):
        _digest(live_ancestry.get(key), f"live ancestry {key}")
    if full15_sha256 != live_ancestry.get("full15OwnerSha256"):
        raise Field3C7Failure("live owner is detached from authenticated full15")

    witness_exponents = [0] * (301 * 2)
    witness_images = [0] * (288 * 2)
    witness_state = [0] * 8
    if (
        pari_field3_retain_generator_square_witnesses(
            relation_records,
            transform,
            terminal_h,
            permutation,
            [0] * (301 * 2),
            [0] * (288 * 2),
            witness_exponents,
            witness_images,
            witness_state,
        )
        != 0
    ):
        raise Field3C7Failure("terminal generator-square witnesses failed")

    cleaned_ce, cleanarch_state = _clean_class_logs(packed_ce, precision)
    assembly = _class_assembly(w, cleaned_ce, primes, tau)
    analytic_class_number = _integer(
        regulator_owner.get("classNumber"), "analytic class number"
    )
    if assembly["classNumber"] != analytic_class_number:
        raise Field3C7Failure("analytic and Smith class numbers diverged")

    witnesses = []
    for generator in range(2):
        witnesses.append(
            {
                "generator": generator,
                "rawRelationExponents": witness_exponents[
                    generator * 301 : (generator + 1) * 301
                ],
                "physicalDivisorImage": witness_images[
                    generator * 288 : (generator + 1) * 288
                ],
                "logicalTerminalColumn": terminal_h[generator * 2 : generator * 2 + 2],
                "principalBasis": "relationPrincipals",
            }
        )

    return {
        "schema": OUTPUT_SCHEMA,
        "field": FIELD,
        "publicComplete": False,
        "status": "authenticated-correspondence-prepared",
        "precision": precision,
        "terminal": {
            "W": w,
            "H": terminal_h,
            "permutation": permutation,
            "B": b,
            "A": packed_a,
            "Ce": packed_ce,
            "cleanedCe": cleaned_ce,
            "Vbase": vbase,
            "transform301x15": transform,
        },
        "classGroup": assembly,
        "generatorSquareWitnesses": witnesses,
        "witnessState": witness_state,
        "cleanarchState": cleanarch_state,
        "relationPrincipals": principals,
        "regulatorOwner": {
            "regulator": regulator,
            "classNumber": analytic_class_number,
            "denominator": regulator_owner.get("denominator"),
        },
        "unitOwner": {
            key: value
            for key, value in unit_owner.items()
            if key != "_authenticatedSha256"
        },
        "torsion": dict(torsion),
        "assumptions": {
            "analytic": dict(analytic_assumptions),
            "unit": dict(unit_assumptions),
            "live": dict(live_assumptions),
        },
    }


__all__ = [
    "Field3C7Failure",
    "assemble_authenticated_owners",
    "pari_field3_retain_generator_square_witnesses",
]
