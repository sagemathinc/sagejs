"""Authenticated field-3 C5 unit-lattice and cleanarch arithmetic.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

This is the source-order PARI 2.17.4 `buchall` cut after an analytically
accepted regulator/lattice owner.  The public root consumes the thirteen unit
columns from a complete `[A13 | Ce2]` owner, performs both LLL stages and
`cleanarchunit`, applies `getfu`'s second real LLL factor, and retains the
exact raw-relation exponent columns.  All public owners are copied only after
every arithmetic gate succeeds.
"""

from collections.abc import Mapping, Sequence
import re
import sys
from typing import Any

from sagejs.native import Float64Buffer, IntegerBuffer, Int64Buffer, native

from .field3_mixed_unit_suffix import (
    pari_cleanarchunit_mixed_quartic,
    pari_field3_prepare_getfu,
)
from .log_matrix_transform import pari_log_matrix_transform
from .unit_lattice_reduction import (
    pari_unit_compose_rank_two,
    pari_unit_integer_lattice_rank_two,
    pari_unit_real_lattice_rank_two,
)


RAW_COLUMNS = 301
UNIT_COLUMNS = 13
PLACES = 3
LOG_WIDTH = 7
PACKED_A = UNIT_COLUMNS * PLACES * LOG_WIDTH
PACKED_TERMINAL = 15 * PLACES * LOG_WIDTH
OUTPUT_SCHEMA = "sagejs.pari-class-group/field3-c5-unit-lattice-cleanarch-v1"
FULL_SCHEMA = "sagejs.pari-class-group/field3-full-terminal-ancestry-v1"
ACCEPTED_C4_SCHEMA = "sagejs.pari-class-group/field3-accepted-c4-v1"
C3_SCHEMA = "sagejs.pari-class-group/field3-high-precision-A-v1"


# Authentic packed real components at 153,088-bit precision have roughly
# 46,000 decimal digits.  CPython's generic denial-of-service guard defaults
# to 4,300 digits, but these strings have already crossed an immutable,
# digest-authenticated owner boundary and are subject to exact shape and
# canonical-serialization checks below.
if hasattr(sys, "set_int_max_str_digits"):
    sys.set_int_max_str_digits(0)


@native
def pari_field3_c5_unit_lattice_cleanarch(
    packed_terminal: IntegerBuffer,
    full_transform: IntegerBuffer,
    candidate_relations: IntegerBuffer,
    candidate_regulator: IntegerBuffer,
    precision: int,
    # Integer rank-two LLL workspace.
    integer_basis: IntegerBuffer,
    integer_transform: IntegerBuffer,
    integer_gram: IntegerBuffer,
    integer_mu: Float64Buffer,
    integer_mu_exponents: IntegerBuffer,
    integer_r: Float64Buffer,
    integer_r_exponents: IntegerBuffer,
    integer_s: Float64Buffer,
    integer_s_exponents: IntegerBuffer,
    integer_approximate: Float64Buffer,
    integer_float_gram: Float64Buffer,
    integer_alpha: IntegerBuffer,
    integer_column: IntegerBuffer,
    integer_column_exponents: IntegerBuffer,
    integer_normalized: Float64Buffer,
    integer_temporary: Float64Buffer,
    integer_dpe_scratch: Float64Buffer,
    integer_scratch: IntegerBuffer,
    integer_state: IntegerBuffer,
    # Reused three-by-two real LLL workspace.
    real_triples: IntegerBuffer,
    real_integers: IntegerBuffer,
    real_form: IntegerBuffer,
    real_basis: IntegerBuffer,
    real_transform: IntegerBuffer,
    real_gram: IntegerBuffer,
    real_mu: Float64Buffer,
    real_mu_exponents: IntegerBuffer,
    real_r: Float64Buffer,
    real_r_exponents: IntegerBuffer,
    real_s: Float64Buffer,
    real_s_exponents: IntegerBuffer,
    real_approximate: Float64Buffer,
    real_float_gram: Float64Buffer,
    real_alpha: IntegerBuffer,
    real_column: IntegerBuffer,
    real_column_exponents: IntegerBuffer,
    real_normalized: Float64Buffer,
    real_temporary: Float64Buffer,
    real_dpe_scratch: Float64Buffer,
    real_integer_scratch: IntegerBuffer,
    real_state: IntegerBuffer,
    # Packed logarithm and cleanarch workspace.
    u1_work: IntegerBuffer,
    u2_work: IntegerBuffer,
    unit_transform_work: IntegerBuffer,
    p_work: IntegerBuffer,
    au_work: IntegerBuffer,
    clean_scratch: IntegerBuffer,
    clean_work: IntegerBuffer,
    pi_cache: IntegerBuffer,
    agm_a: IntegerBuffer,
    agm_b: IntegerBuffer,
    agm_p: IntegerBuffer,
    agm_q: IntegerBuffer,
    agm_stack: IntegerBuffer,
    clean_state: Int64Buffer,
    matep: IntegerBuffer,
    arch: IntegerBuffer,
    factored_clean: IntegerBuffer,
    arch_real: IntegerBuffer,
    arch_imag: IntegerBuffer,
    clean_real: IntegerBuffer,
    clean_imag: IntegerBuffer,
    factor_work: IntegerBuffer,
    final_transform_work: IntegerBuffer,
    raw_transform_work: IntegerBuffer,
    # Transactional public outputs.
    output_u1: IntegerBuffer,
    output_u2: IntegerBuffer,
    output_factor: IntegerBuffer,
    output_final_transform: IntegerBuffer,
    output_clean: IntegerBuffer,
    output_arch_real: IntegerBuffer,
    output_arch_imag: IntegerBuffer,
    output_clean_real: IntegerBuffer,
    output_clean_imag: IntegerBuffer,
    output_raw_transform: IntegerBuffer,
    state: Int64Buffer,
) -> int:
    """Run C5 and publish only a complete rank-two unit lattice.

    `state` is status, precision, completed phase, integer-LLL status,
    first real-LLL status, cleanarch status, second real-LLL status,
    determinants of U2 and F, published flag, raw rows, accepted columns,
    unit rank, clean columns, and source terminal columns.
    """

    if precision < 64 or precision > 153088 or precision % 64 != 0:
        raise ValueError("unsupported field3 C5 precision")
    if (
        len(packed_terminal) < PACKED_TERMINAL
        or len(full_transform) < RAW_COLUMNS * 15
        or len(candidate_relations) < 2 * UNIT_COLUMNS
        or len(candidate_regulator) < 3
        or len(u1_work) < 2 * UNIT_COLUMNS
        or len(u2_work) < 4
        or len(unit_transform_work) < 2 * UNIT_COLUMNS
        or len(p_work) < 42
        or len(au_work) < 42
        or len(clean_scratch) < 42
        or len(clean_work) < 42
        or len(real_triples) < 18
        or len(factor_work) < 4
        or len(final_transform_work) < 2 * UNIT_COLUMNS
        or len(raw_transform_work) < 2 * RAW_COLUMNS
        or len(output_u1) < 2 * UNIT_COLUMNS
        or len(output_u2) < 4
        or len(output_factor) < 4
        or len(output_final_transform) < 2 * UNIT_COLUMNS
        or len(output_clean) < 42
        or len(output_arch_real) < 18
        or len(output_arch_imag) < 18
        or len(output_clean_real) < 18
        or len(output_clean_imag) < 18
        or len(output_raw_transform) < 2 * RAW_COLUMNS
        or len(state) < 15
    ):
        raise ValueError("short field3 C5 owner")
    for index in range(15):
        state[index] = 0
    state[0] = -1
    state[1] = precision
    state[10] = RAW_COLUMNS
    state[11] = UNIT_COLUMNS
    state[12] = 2
    state[14] = 15

    status = pari_unit_integer_lattice_rank_two(
        candidate_relations,
        UNIT_COLUMNS,
        u1_work,
        integer_state,
        integer_basis,
        integer_transform,
        integer_gram,
        integer_mu,
        integer_mu_exponents,
        integer_r,
        integer_r_exponents,
        integer_s,
        integer_s_exponents,
        integer_approximate,
        integer_float_gram,
        integer_alpha,
        integer_column,
        integer_column_exponents,
        integer_normalized,
        integer_temporary,
        integer_dpe_scratch,
        integer_scratch,
    )
    state[3] = status
    if status != 0:
        state[0] = 1
        return 1
    state[2] = 1
    pari_log_matrix_transform(
        packed_terminal, u1_work, PLACES, UNIT_COLUMNS, 2, False, p_work
    )
    for row in range(PLACES):
        for column in range(2):
            source = 7 * (column * PLACES + row) + 1
            target = 3 * (row * 2 + column)
            real_triples[target] = p_work[source]
            real_triples[target + 1] = p_work[source + 1]
            real_triples[target + 2] = p_work[source + 2]
    status = pari_unit_real_lattice_rank_two(
        real_triples,
        PLACES,
        real_integers,
        u2_work,
        real_form,
        real_basis,
        real_transform,
        real_gram,
        real_mu,
        real_mu_exponents,
        real_r,
        real_r_exponents,
        real_s,
        real_s_exponents,
        real_approximate,
        real_float_gram,
        real_alpha,
        real_column,
        real_column_exponents,
        real_normalized,
        real_temporary,
        real_dpe_scratch,
        real_integer_scratch,
        real_state,
    )
    state[4] = status
    if status != 0:
        state[0] = 2
        return 2
    determinant = u2_work[0] * u2_work[3] - u2_work[1] * u2_work[2]
    state[7] = determinant
    if determinant != 1 and determinant != -1:
        state[0] = 2
        return 2
    pari_unit_compose_rank_two(u1_work, UNIT_COLUMNS, u2_work, unit_transform_work)
    pari_log_matrix_transform(
        packed_terminal,
        unit_transform_work,
        PLACES,
        UNIT_COLUMNS,
        2,
        False,
        au_work,
    )
    status = pari_cleanarchunit_mixed_quartic(
        au_work,
        candidate_regulator,
        precision,
        pi_cache,
        agm_a,
        agm_b,
        agm_p,
        agm_q,
        agm_stack,
        clean_scratch,
        clean_work,
        clean_state,
    )
    state[5] = status
    if status != 0:
        state[0] = 3 + status
        return 3 + status
    state[2] = 2
    factor_work[0] = 1
    factor_work[1] = 0
    factor_work[2] = 0
    factor_work[3] = 1
    pari_field3_prepare_getfu(
        clean_work,
        factor_work,
        matep,
        arch,
        factored_clean,
        arch_real,
        arch_imag,
        clean_real,
        clean_imag,
    )
    for row in range(PLACES):
        for column in range(2):
            source = 7 * (column * PLACES + row) + 1
            target = 3 * (row * 2 + column)
            real_triples[target] = matep[source]
            real_triples[target + 1] = matep[source + 1]
            real_triples[target + 2] = matep[source + 2]
    status = pari_unit_real_lattice_rank_two(
        real_triples,
        PLACES,
        real_integers,
        factor_work,
        real_form,
        real_basis,
        real_transform,
        real_gram,
        real_mu,
        real_mu_exponents,
        real_r,
        real_r_exponents,
        real_s,
        real_s_exponents,
        real_approximate,
        real_float_gram,
        real_alpha,
        real_column,
        real_column_exponents,
        real_normalized,
        real_temporary,
        real_dpe_scratch,
        real_integer_scratch,
        real_state,
    )
    state[6] = status
    if status != 0:
        state[0] = 6
        return 6
    determinant = factor_work[0] * factor_work[3] - factor_work[1] * factor_work[2]
    state[8] = determinant
    if determinant != 1 and determinant != -1:
        state[0] = 6
        return 6
    pari_field3_prepare_getfu(
        clean_work,
        factor_work,
        matep,
        arch,
        factored_clean,
        arch_real,
        arch_imag,
        clean_real,
        clean_imag,
    )
    pari_unit_compose_rank_two(
        unit_transform_work, UNIT_COLUMNS, factor_work, final_transform_work
    )
    for unit in range(2):
        for raw in range(RAW_COLUMNS):
            value = 0
            for accepted in range(UNIT_COLUMNS):
                value += (
                    full_transform[accepted * RAW_COLUMNS + raw]
                    * final_transform_work[unit * UNIT_COLUMNS + accepted]
                )
            raw_transform_work[unit * RAW_COLUMNS + raw] = value
    state[2] = 3

    for index in range(2 * UNIT_COLUMNS):
        output_u1[index] = u1_work[index]
        output_final_transform[index] = final_transform_work[index]
    for index in range(4):
        output_u2[index] = u2_work[index]
        output_factor[index] = factor_work[index]
    for index in range(42):
        output_clean[index] = clean_work[index]
    for index in range(18):
        output_arch_real[index] = arch_real[index]
        output_arch_imag[index] = arch_imag[index]
        output_clean_real[index] = clean_real[index]
        output_clean_imag[index] = clean_imag[index]
    for index in range(2 * RAW_COLUMNS):
        output_raw_transform[index] = raw_transform_work[index]
    state[0] = 0
    state[9] = 1
    state[13] = 2
    return 0


class Field3C5Failure(ValueError):
    """An authenticated C5 input or arithmetic result failed closed."""


def _integers(value: Any, length: int, name: str) -> list[int]:
    if isinstance(value, (str, bytes)) or not isinstance(value, Sequence):
        raise Field3C5Failure(name + " is not an integer owner")
    if len(value) != length:
        raise Field3C5Failure(name + " has the wrong length")
    result: list[int] = []
    for entry in value:
        if isinstance(entry, bool):
            raise Field3C5Failure(name + " contains a boolean")
        try:
            integer = int(entry)
        except (TypeError, ValueError, OverflowError) as error:
            raise Field3C5Failure(name + " contains a non-integer") from error
        if str(integer) != str(entry):
            raise Field3C5Failure(name + " contains a noncanonical integer")
        result.append(integer)
    return result


def _integer(value: Any, name: str) -> int:
    return _integers([value], 1, name)[0]


def _mapping(value: Any, name: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise Field3C5Failure(name + " is not an object")
    return value


def _sha256(value: Any, name: str) -> str:
    if not isinstance(value, str) or re.fullmatch(r"[0-9a-f]{64}", value) is None:
        raise Field3C5Failure(name + " is not a canonical SHA-256 digest")
    return value


def _c3_latches(packed_a: Sequence[int]) -> list[int]:
    modulus1 = 2305843009213693951
    modulus2 = 2305843009213693921
    first = len(packed_a)
    second = 3 * len(packed_a)
    for index, value in enumerate(packed_a):
        first = (first * 1000003 + value % modulus1 + index + 1) % modulus1
        second = (second * 1000033 + value % modulus2 + index + 1) % modulus2
    return [first, second]


def _zeros(length: int) -> list[int]:
    return [0] * length


def _floats(length: int) -> list[float]:
    return [0.0] * length


def compose_authenticated_c5(
    full_owner: Mapping[str, Any],
    c3_owner: Mapping[str, Any],
    accepted_c4: Mapping[str, Any],
    full_owner_sha256: str,
    c3_owner_sha256: str,
    accepted_c4_sha256: str,
) -> dict[str, Any]:
    """Validate immutable owner metadata and execute the C5 arithmetic cut."""

    full = _mapping(full_owner, "full terminal owner")
    c3 = _mapping(c3_owner, "C3 owner")
    c4 = _mapping(accepted_c4, "accepted C4 owner")
    full_owner_sha256 = _sha256(full_owner_sha256, "full owner digest")
    c3_owner_sha256 = _sha256(c3_owner_sha256, "C3 owner digest")
    accepted_c4_sha256 = _sha256(accepted_c4_sha256, "accepted C4 digest")
    if (
        full.get("schema") != FULL_SCHEMA
        or c3.get("schema") != C3_SCHEMA
        or c4.get("schema") != ACCEPTED_C4_SCHEMA
    ):
        raise Field3C5Failure("wrong C5 input schema")
    field = full.get("field")
    run_identity = full.get("runIdentity")
    if (
        not isinstance(field, str)
        or not isinstance(run_identity, str)
        or c3.get("field") != field
        or c3.get("runIdentity") != run_identity
        or c4.get("field") != field
        or c4.get("runIdentity") != run_identity
    ):
        raise Field3C5Failure("C5 field identity changed")
    if c4.get("fullTerminalOwnerSha256") != full_owner_sha256:
        raise Field3C5Failure("accepted C4 owner is detached from full terminal owner")
    if c4.get("c3OwnerSha256") != c3_owner_sha256:
        raise Field3C5Failure("accepted C4 owner is detached from C3 owner")
    if full.get("terminalShape") != [3, 15] or full.get("transformShape") != [301, 15]:
        raise Field3C5Failure("wrong full terminal shape")
    if full.get("unitColumns") != 13 or full.get("classColumns") != 2:
        raise Field3C5Failure("wrong full terminal split")
    if full.get("retentionState") != [0, 301, 15, 293, 3, 4515, 13, 2]:
        raise Field3C5Failure("full terminal retention was not accepted")
    if full.get("imageState") != [0, 288, 301, 13, 2, 15, 3744, 576]:
        raise Field3C5Failure("full terminal exact image was not accepted")
    if c3.get("acceptedShape") != [3, 13] or c3.get("transformShape") != [301, 13]:
        raise Field3C5Failure("wrong C3 shape")
    if c3.get("kernelState") != [0, 288, 301, 13, 3744]:
        raise Field3C5Failure("C3 relation kernel was not accepted")
    full_transform = _integers(
        full.get("transform"), RAW_COLUMNS * 15, "full terminal transform"
    )
    c3_transform = _integers(c3.get("transform"), RAW_COLUMNS * 13, "C3 transform")
    if full_transform[: RAW_COLUMNS * UNIT_COLUMNS] != c3_transform:
        raise Field3C5Failure("C3 transform differs from full terminal ancestry")
    analytic = _mapping(c4.get("analytic"), "C4 analytic acceptance")
    if (
        analytic.get("status") != "accepted"
        or analytic.get("badCheckStatus") != 0
        or analytic.get("fieldDerived") is not True
        or analytic.get("precisionRetryComplete") is not True
        or c4.get("candidatePublished") is not True
        or c4.get("analyticPending") is not False
    ):
        raise Field3C5Failure("C4 candidate lacks analytic acceptance")
    precision = _integer(c4.get("precision"), "C4 precision")
    generation = _integer(c4.get("generation"), "C4 generation")
    if generation < 1:
        raise Field3C5Failure("C4 generation is not positive")
    if _integer(c3.get("targetBits"), "C3 target bits") != precision:
        raise Field3C5Failure("C3 and C4 precision differ")
    acceptance_state = _integers(
        c4.get("acceptanceState"), 4, "C4 analytic acceptance state"
    )
    if (
        acceptance_state[0] != 0
        or acceptance_state[1] < 1
        or acceptance_state[2] != precision
        or acceptance_state[3] != 1
    ):
        raise Field3C5Failure("C4 analytic acceptance state is not terminal")
    c3_hash = _integers(c4.get("c3Hash"), 4, "C3 hash words")
    c3_latches = _integers(c4.get("c3Latches"), 2, "C3 latches")
    packed_a = _integers(c3.get("packedA"), PACKED_A, "C3 packed A")
    if c3_latches != _c3_latches(packed_a):
        raise Field3C5Failure("C3 packed-A latches changed")
    packed_ce = _integers(full.get("packedCe"), 42, "full terminal packed Ce")
    packed_terminal = packed_a + packed_ce
    transform = full_transform
    relations = _integers(
        c4.get("candidateRelations"), 2 * UNIT_COLUMNS, "candidate relations"
    )
    regulator = _integers(c4.get("candidateRegulator"), 3, "candidate regulator")

    u1 = _zeros(26)
    u2 = _zeros(4)
    factor = _zeros(4)
    final_transform = _zeros(26)
    clean = _zeros(42)
    prepared_arch_real = _zeros(18)
    prepared_arch_imag = _zeros(18)
    prepared_clean_real = _zeros(18)
    prepared_clean_imag = _zeros(18)
    raw_transform = _zeros(602)
    state = _zeros(15)
    status = pari_field3_c5_unit_lattice_cleanarch(
        packed_terminal,
        transform,
        relations,
        regulator,
        precision,
        _zeros(26),
        _zeros(169),
        _zeros(169),
        _floats(169),
        _zeros(169),
        _floats(169),
        _zeros(169),
        _floats(13),
        _zeros(13),
        _floats(26),
        _floats(169),
        _zeros(13),
        _zeros(13),
        _zeros(13),
        _floats(13),
        _floats(13),
        _floats(13),
        _zeros(13),
        _zeros(5),
        _zeros(18),
        _zeros(6),
        _zeros(3),
        _zeros(6),
        _zeros(4),
        _zeros(4),
        _floats(4),
        _zeros(4),
        _floats(4),
        _zeros(4),
        _floats(2),
        _zeros(2),
        _floats(6),
        _floats(4),
        _zeros(2),
        _zeros(3),
        _zeros(3),
        _floats(3),
        _floats(3),
        _floats(3),
        _zeros(3),
        _zeros(2),
        _zeros(26),
        _zeros(4),
        _zeros(26),
        _zeros(42),
        _zeros(42),
        _zeros(42),
        _zeros(42),
        _zeros(3),
        _zeros(16385),
        _zeros(16385),
        _zeros(16385),
        _zeros(16385),
        _zeros(32768),
        _zeros(6),
        _zeros(42),
        _zeros(42),
        _zeros(42),
        _zeros(18),
        _zeros(18),
        _zeros(18),
        _zeros(18),
        _zeros(4),
        _zeros(26),
        _zeros(602),
        u1,
        u2,
        factor,
        final_transform,
        clean,
        prepared_arch_real,
        prepared_arch_imag,
        prepared_clean_real,
        prepared_clean_imag,
        raw_transform,
        state,
    )
    if status != 0 or state[9] != 1:
        raise Field3C5Failure("C5 arithmetic requested a retry: " + str(state))
    for unit in range(2):
        for raw in range(RAW_COLUMNS):
            expected = sum(
                transform[accepted * RAW_COLUMNS + raw]
                * final_transform[unit * UNIT_COLUMNS + accepted]
                for accepted in range(UNIT_COLUMNS)
            )
            if raw_transform[unit * RAW_COLUMNS + raw] != expected:
                raise Field3C5Failure("raw unit transform composition changed")
    return {
        "schema": OUTPUT_SCHEMA,
        "field": field,
        "runIdentity": run_identity,
        "precision": precision,
        "generation": generation,
        "fullTerminalOwnerSha256": full_owner_sha256,
        "c3OwnerSha256": c3_owner_sha256,
        "acceptedC4OwnerSha256": accepted_c4_sha256,
        "c3Hash": [str(value) for value in c3_hash],
        "c3Latches": [str(value) for value in c3_latches],
        "acceptanceState": acceptance_state,
        "u1Shape": [13, 2],
        "u1": [str(value) for value in u1],
        "u2Shape": [2, 2],
        "u2": [str(value) for value in u2],
        "getfuFactorShape": [2, 2],
        "getfuFactor": [str(value) for value in factor],
        "finalTransformShape": [13, 2],
        "finalTransform": [str(value) for value in final_transform],
        "rawUnitTransformShape": [301, 2],
        "rawUnitTransform": [str(value) for value in raw_transform],
        "cleanPackedShape": [3, 2],
        "cleanPacked": [str(value) for value in clean],
        "preparedArchReal": [str(value) for value in prepared_arch_real],
        "preparedArchImag": [str(value) for value in prepared_arch_imag],
        "preparedCleanReal": [str(value) for value in prepared_clean_real],
        "preparedCleanImag": [str(value) for value in prepared_clean_imag],
        "regulator": [str(value) for value in regulator],
        "state": state,
        "kernelEvidence": {
            "source": "authenticated full-terminal exact image",
            "unitImageEntries": 3744,
            "rawCompositionReplayed": True,
        },
        "analyticAcceptance": dict(analytic),
    }


__all__ = [
    "Field3C5Failure",
    "compose_authenticated_c5",
    "pari_field3_c5_unit_lattice_cleanarch",
]
