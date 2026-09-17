"""Cold exact factorback verifier for field-3 C6 units.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

PARI retains fundamental units as products of raw principal relation
generators before `getfu` materializes algebraic integers.  This ordinary
Python verifier reconnects those two representations outside the timed native
graph.  It authenticates immutable owners, evaluates both 301-entry factored
columns in the quartic algebra, verifies their divisor kernels, and accepts a
materialized unit only up to the exact torsion choices `1` and `-1`.  It then
recomputes the materialized logarithms from authenticated embeddings; real
entries are exact at the packed policy and phases are compared modulo the
authenticated period and rounding policy.

The authentic 153088-bit field is intentionally not executed here. The exact
correspondence is exercised with fresh low-precision generated data, while
sparse high-precision probes qualify the bounded logarithm corridor.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import stat
import tempfile
from collections.abc import Mapping, Sequence
from fractions import Fraction
from pathlib import Path
from typing import Any


SOURCE_SCHEMA = "sagejs.pari-class-group/field3-c6-factorback-source-v1"
C6_SCHEMA = "sagejs.pari-class-group/field3-c6-getfu-v1"
RECEIPT_SCHEMA = "sagejs.pari-class-group/field3-c6-factorback-receipt-v1"
DEGREE = 4
RELATION_ROWS = 288
RAW_COLUMNS = 301
UNIT_COLUMNS = 2
PLACES = 3
LOG_CELLS = 7


class Field3C6FactorbackFailure(ValueError):
    """Authenticated factored and materialized unit owners disagree."""


def _strict_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    answer: dict[str, Any] = {}
    for key, value in pairs:
        if key in answer:
            raise Field3C6FactorbackFailure("duplicate JSON key: " + key)
        answer[key] = value
    return answer


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _digest(value: Any, label: str) -> str:
    if (
        not isinstance(value, str)
        or len(value) != 64
        or any(character not in "0123456789abcdef" for character in value)
    ):
        raise Field3C6FactorbackFailure(label + " is not a SHA-256 digest")
    return value


def _load_owner(
    path: str | Path, expected_sha256: str, label: str
) -> Mapping[str, Any]:
    expected = _digest(expected_sha256, label + " digest")
    selected = Path(path)
    info = selected.stat()
    if not stat.S_ISREG(info.st_mode) or stat.S_IMODE(info.st_mode) != 0o444:
        raise Field3C6FactorbackFailure(label + " is not an immutable mode-0444 file")
    data = selected.read_bytes()
    if _sha256(data) != expected:
        raise Field3C6FactorbackFailure(label + " digest changed")
    try:
        value = json.loads(data, object_pairs_hook=_strict_object)
    except (TypeError, ValueError, UnicodeError) as error:
        raise Field3C6FactorbackFailure(label + " is not strict JSON") from error
    if not isinstance(value, Mapping):
        raise Field3C6FactorbackFailure(label + " is not an object")
    return value


def _integer(value: Any, label: str) -> int:
    if isinstance(value, bool) or not isinstance(value, (int, str)):
        raise Field3C6FactorbackFailure(label + " is not integral")
    try:
        answer = int(value)
    except (ValueError, OverflowError) as error:
        raise Field3C6FactorbackFailure(label + " is not integral") from error
    if str(answer) != str(value):
        raise Field3C6FactorbackFailure(label + " is not canonical")
    return answer


def _integers(value: Any, length: int, label: str) -> list[int]:
    if isinstance(value, (str, bytes)) or not isinstance(value, Sequence):
        raise Field3C6FactorbackFailure(label + " is not an integer vector")
    if len(value) != length:
        raise Field3C6FactorbackFailure(label + " has the wrong length")
    return [_integer(cell, f"{label}[{index}]") for index, cell in enumerate(value)]


def _multiply(
    left: Sequence[Fraction], right: Sequence[Fraction], tensor: Sequence[int]
) -> tuple[Fraction, Fraction, Fraction, Fraction]:
    result = [Fraction(0) for _ in range(DEGREE)]
    for left_basis in range(DEGREE):
        if left[left_basis] == 0:
            continue
        for right_basis in range(DEGREE):
            coefficient = left[left_basis] * right[right_basis]
            if coefficient == 0:
                continue
            offset = 16 * left_basis + 4 * right_basis
            for row in range(DEGREE):
                result[row] += coefficient * tensor[offset + row]
    return tuple(result)  # type: ignore[return-value]


def _multiplication_matrix(
    element: Sequence[Fraction], tensor: Sequence[int]
) -> list[list[Fraction]]:
    return [
        [
            sum(
                element[basis] * tensor[16 * basis + 4 * column + row]
                for basis in range(DEGREE)
            )
            for column in range(DEGREE)
        ]
        for row in range(DEGREE)
    ]


def _determinant(matrix: Sequence[Sequence[Fraction]]) -> Fraction:
    work = [list(row) for row in matrix]
    answer = Fraction(1)
    for column in range(DEGREE):
        pivot = next(
            (row for row in range(column, DEGREE) if work[row][column] != 0),
            None,
        )
        if pivot is None:
            return Fraction(0)
        if pivot != column:
            work[column], work[pivot] = work[pivot], work[column]
            answer = -answer
        value = work[column][column]
        answer *= value
        for row in range(column + 1, DEGREE):
            multiplier = work[row][column] / value
            for index in range(column + 1, DEGREE):
                work[row][index] -= multiplier * work[column][index]
    return answer


def _inverse(
    element: Sequence[Fraction], tensor: Sequence[int]
) -> tuple[Fraction, Fraction, Fraction, Fraction]:
    matrix = _multiplication_matrix(element, tensor)
    work = [matrix[row] + [Fraction(1 if row == 0 else 0)] for row in range(DEGREE)]
    for column in range(DEGREE):
        pivot = next(
            (row for row in range(column, DEGREE) if work[row][column] != 0),
            None,
        )
        if pivot is None:
            raise Field3C6FactorbackFailure("a principal generator is zero")
        if pivot != column:
            work[column], work[pivot] = work[pivot], work[column]
        value = work[column][column]
        for index in range(column, DEGREE + 1):
            work[column][index] /= value
        for row in range(DEGREE):
            if row == column:
                continue
            multiplier = work[row][column]
            for index in range(column, DEGREE + 1):
                work[row][index] -= multiplier * work[column][index]
    result = tuple(work[row][DEGREE] for row in range(DEGREE))
    if _multiply(element, result, tensor) != (
        Fraction(1),
        Fraction(0),
        Fraction(0),
        Fraction(0),
    ):
        raise Field3C6FactorbackFailure("exact algebraic inversion failed")
    return result  # type: ignore[return-value]


def _power(
    element: Sequence[int], exponent: int, tensor: Sequence[int]
) -> tuple[Fraction, Fraction, Fraction, Fraction]:
    factor = tuple(Fraction(value) for value in element)
    if exponent < 0:
        factor = _inverse(factor, tensor)
        exponent = -exponent
    result = (Fraction(1), Fraction(0), Fraction(0), Fraction(0))
    while exponent:
        if exponent & 1:
            result = _multiply(result, factor, tensor)
        exponent >>= 1
        if exponent:
            factor = _multiply(factor, factor, tensor)
    return result


def _integral(element: Sequence[Fraction], label: str) -> tuple[int, int, int, int]:
    if any(value.denominator != 1 for value in element):
        raise Field3C6FactorbackFailure(label + " is not integral")
    return tuple(value.numerator for value in element)  # type: ignore[return-value]


def _factorback(
    generators: Sequence[int], exponents: Sequence[int], tensor: Sequence[int]
) -> tuple[int, int, int, int]:
    result = (Fraction(1), Fraction(0), Fraction(0), Fraction(0))
    for column, exponent in enumerate(exponents):
        if exponent:
            factor = _power(generators[4 * column : 4 * column + 4], exponent, tensor)
            result = _multiply(result, factor, tensor)
    return _integral(result, "factored unit")


def _unit_data(
    element: Sequence[int], tensor: Sequence[int], label: str
) -> dict[str, Any]:
    rational = tuple(Fraction(value) for value in element)
    norm = _determinant(_multiplication_matrix(rational, tensor))
    if norm.denominator != 1 or abs(norm.numerator) != 1:
        raise Field3C6FactorbackFailure(label + " does not generate ideal one")
    inverse = _integral(_inverse(rational, tensor), label + " inverse")
    return {
        "norm": norm.numerator,
        "inverse": inverse,
        "squaredNorm": sum(value * value for value in element),
        "inverseSquaredNorm": sum(value * value for value in inverse),
    }


def _packed_value(mantissa: int, precision: int, exponent: int) -> Fraction:
    if precision == -1:
        return Fraction(mantissa)
    if mantissa == 0:
        return Fraction(0)
    shift = exponent - (precision - 1)
    if shift >= 0:
        return Fraction(mantissa << shift)
    return Fraction(mantissa, 1 << -shift)


def _nearest_integer(value: Fraction) -> int:
    lower = value.numerator // value.denominator
    if value - lower > Fraction(1, 2):
        return lower + 1
    return lower


def _materialized_log_workspace_capacity(precision: int) -> tuple[int, int]:
    """Return coefficient and split-stack cells for one cold replay."""
    from .pi_constant import pari_pi_workspace_capacity

    if not ((64 <= precision <= 384 and precision % 64 == 0) or precision == 153088):
        raise Field3C6FactorbackFailure("unsupported cold log-replay precision")
    pi_cells, pi_stack = pari_pi_workspace_capacity(precision)
    if precision == 153088:
        # Qualified jointly by the real and complex AGM batch roots.  The
        # log(2) atanh splitters dominate the smaller Ramanujan pi count.
        return max(pi_cells, 16385), max(pi_stack, 105)
    return max(pi_cells, 512), max(pi_stack, 1024)


def _materialized_logs(
    units: list[int],
    embedding_real: list[int],
    embedding_imag: list[int],
    precision: int,
    workspace: tuple[
        list[int],
        list[int],
        list[int],
        list[int],
        list[int],
        list[int],
        list[int],
    ]
    | None = None,
) -> tuple[list[int], list[int]]:
    from .complex_logarithm import pari_real_pair_logarithm
    from .exponential import pari_real_resize
    from .high_precision_agm_log import pari_real_logarithm_high_precision_abs
    from .high_precision_complex_agm_log import pari_complex_logarithm_agm
    from .log_matrix_transform import pari_log_scalar_product, pari_log_scalar_sum
    from .pi_constant import pari_pi_constant

    coefficient_cells, stack_cells = _materialized_log_workspace_capacity(precision)
    if workspace is None:
        log_cache = [0] * 3
        pi_cache = [0] * 3
        a = [0] * coefficient_cells
        b = [0] * coefficient_cells
        p = [0] * coefficient_cells
        q = [0] * coefficient_cells
        stack = [0] * stack_cells
    else:
        if len(workspace) != 7 or len({id(value) for value in workspace}) != 7:
            raise Field3C6FactorbackFailure("aliased cold log-replay workspace")
        log_cache, pi_cache, a, b, p, q, stack = workspace
        if (
            len(log_cache) < 3
            or len(pi_cache) < 3
            or len(a) < coefficient_cells
            or len(b) < coefficient_cells
            or len(p) < coefficient_cells
            or len(q) < coefficient_cells
            or len(stack) < stack_cells
        ):
            raise Field3C6FactorbackFailure("cold log-replay workspace exhausted")
    logs_real: list[int] = []
    logs_imag: list[int] = []
    for unit in range(UNIT_COLUMNS):
        coordinates = units[DEGREE * unit : DEGREE * (unit + 1)]
        for place in range(PLACES):
            real = (0, -1, 0)
            imaginary = (0, -1, 0)
            for basis, coefficient in enumerate(coordinates):
                if coefficient == 0:
                    continue
                at = 3 * (DEGREE * place + basis)
                rm, rp, re = pari_log_scalar_product(
                    coefficient,
                    embedding_real[at],
                    embedding_real[at + 1],
                    embedding_real[at + 2],
                )
                im, ip, ie = pari_log_scalar_product(
                    coefficient,
                    embedding_imag[at],
                    embedding_imag[at + 1],
                    embedding_imag[at + 2],
                )
                real = pari_log_scalar_sum(*real, rm, rp, re)
                imaginary = pari_log_scalar_sum(*imaginary, im, ip, ie)
            if real[0] == 0:
                real = (0, 0, -precision)
            if imaginary[0] == 0:
                imaginary = (0, 0, -precision)
            if precision <= 384:
                kind, lm, lp, le, am, ap, ae = pari_real_pair_logarithm(
                    *real,
                    *imaginary,
                    precision,
                    log_cache,
                    pi_cache,
                    a,
                    b,
                    p,
                    q,
                    stack,
                )
            elif imaginary[0] == 0:
                resized = pari_real_resize(*real, precision)
                lm, lp, le = pari_real_logarithm_high_precision_abs(
                    abs(resized[0]),
                    resized[1],
                    resized[2],
                    pi_cache,
                    log_cache,
                    a,
                    b,
                    p,
                    q,
                    stack,
                )
                if resized[0] > 0:
                    kind, am, ap, ae = 1, 0, -1, 0
                else:
                    kind = 2
                    am, ap, ae = pari_pi_constant(
                        precision, pi_cache, a, b, p, q, stack
                    )
            elif real[0] == 0:
                resized = pari_real_resize(*imaginary, precision)
                lm, lp, le = pari_real_logarithm_high_precision_abs(
                    abs(resized[0]),
                    resized[1],
                    resized[2],
                    pi_cache,
                    log_cache,
                    a,
                    b,
                    p,
                    q,
                    stack,
                )
                kind = 2
                am, ap, ae = pari_pi_constant(precision, pi_cache, a, b, p, q, stack)
                ae -= 1
                if resized[0] < 0:
                    am = -am
            else:
                kind = 2
                lm, lp, le, am, ap, ae = pari_complex_logarithm_agm(
                    *real,
                    *imaginary,
                    precision,
                    pi_cache,
                    log_cache,
                    a,
                    b,
                    p,
                    q,
                    stack,
                )
            if place == 2:
                lm, lp, le = pari_log_scalar_product(2, lm, lp, le)
                am, ap, ae = pari_log_scalar_product(2, am, ap, ae)
            logs_real.extend((lm, lp, le))
            if kind == 1:
                logs_imag.extend((0, -1, 0))
            else:
                logs_imag.extend((am, ap, ae))
    return logs_real, logs_imag


def _verify_logs(
    prepared_real: list[int],
    prepared_imag: list[int],
    embedding_real: list[int],
    embedding_imag: list[int],
    logs_real: list[int],
    logs_imag: list[int],
    inverse_mask: int,
    units: list[int],
    precision: int,
    two_pi: list[int],
    period_multipliers: list[int],
    tolerance_exponent: int,
) -> None:
    recomputed_real, recomputed_imag = _materialized_logs(
        units, embedding_real, embedding_imag, precision
    )
    if (
        two_pi[0] <= 0
        or two_pi[1] != precision
        or two_pi[0].bit_length() != precision
        or tolerance_exponent > -8
    ):
        raise Field3C6FactorbackFailure("missing phase precision authority")
    period = _packed_value(*two_pi)
    tolerance = Fraction(1, 1 << -tolerance_exponent)
    for unit in range(UNIT_COLUMNS):
        sign = -1 if inverse_mask & (1 << unit) else 1
        for place in range(PLACES):
            triple = 3 * (PLACES * unit + place)
            expected_real = prepared_real[triple : triple + 3]
            expected_imag = prepared_imag[triple : triple + 3]
            expected_real[0] *= sign
            expected_imag[0] *= sign
            if logs_real[triple : triple + 3] != expected_real:
                raise Field3C6FactorbackFailure("C5/C6 real-log sign identity changed")
            if logs_imag[triple : triple + 3] != expected_imag:
                raise Field3C6FactorbackFailure(
                    "C5/C6 imaginary-log sign identity changed"
                )
            if logs_real[triple : triple + 3] != recomputed_real[triple : triple + 3]:
                raise Field3C6FactorbackFailure("materialized real log replay changed")
            actual_phase = _packed_value(*logs_imag[triple : triple + 3])
            replayed_phase = _packed_value(*recomputed_imag[triple : triple + 3])
            place_period = period * period_multipliers[place]
            quotient = _nearest_integer((actual_phase - replayed_phase) / place_period)
            residual = actual_phase - replayed_phase - quotient * place_period
            if abs(residual) > tolerance:
                raise Field3C6FactorbackFailure(
                    "materialized phase left its period lattice"
                )


def verify_field3_c6_factorback(
    source: Mapping[str, Any],
    c6: Mapping[str, Any],
    source_sha256: str,
    c6_sha256: str,
) -> dict[str, Any]:
    """Return a complete receipt, or raise without publishing partial state."""
    if source.get("schema") != SOURCE_SCHEMA or c6.get("schema") != C6_SCHEMA:
        raise Field3C6FactorbackFailure("owner schema changed")
    actual_c6_sha256 = _digest(c6_sha256, "C6 owner")
    if _digest(source.get("c6OwnerSha256"), "source C6 owner") != actual_c6_sha256:
        raise Field3C6FactorbackFailure("factorback source C6 ancestry changed")
    embedding_owner_sha256 = _digest(
        source.get("embeddingOwnerSha256"), "source embedding owner"
    )
    if (
        _digest(c6.get("embeddingOwnerSha256"), "C6 embedding owner")
        != embedding_owner_sha256
    ):
        raise Field3C6FactorbackFailure("factorback embedding ancestry changed")
    relation_owner_sha256 = _digest(
        source.get("relationOwnerSha256"), "source relation owner"
    )
    field = source.get("field")
    run_identity = source.get("runIdentity")
    if (
        not isinstance(field, str)
        or not isinstance(run_identity, str)
        or c6.get("field") != field
        or c6.get("runIdentity") != run_identity
    ):
        raise Field3C6FactorbackFailure("owner field identity changed")
    precision = _integer(source.get("precision"), "source precision")
    generation = _integer(source.get("generation"), "source generation")
    if (
        _integer(c6.get("precision"), "C6 precision") != precision
        or _integer(c6.get("generation"), "C6 generation") != generation
    ):
        raise Field3C6FactorbackFailure("owner precision generation changed")
    c5_sha256 = _digest(source.get("c5OwnerSha256"), "source C5 owner")
    if c6.get("c5OwnerSha256") != c5_sha256:
        raise Field3C6FactorbackFailure("C5 ancestry changed")
    if c6.get("status") != "success" or c6.get("reason") is not None:
        raise Field3C6FactorbackFailure("C6 did not publish materialized units")

    generators = _integers(
        source.get("principalGenerators"), DEGREE * RAW_COLUMNS, "principal generators"
    )
    relations = _integers(
        source.get("relationRecords"),
        RELATION_ROWS * RAW_COLUMNS,
        "relation records",
    )
    tensor = _integers(
        source.get("multiplicationBasis"), DEGREE**3, "multiplication basis"
    )
    identity = [1 if index % 5 == 0 else 0 for index in range(16)]
    if tensor[:16] != identity:
        raise Field3C6FactorbackFailure("multiplication by one changed")
    raw_transform = _integers(
        source.get("rawUnitTransform"), RAW_COLUMNS * UNIT_COLUMNS, "raw Wraw"
    )
    adjusted_transform = _integers(
        c6.get("adjustedWraw"), RAW_COLUMNS * UNIT_COLUMNS, "adjusted Wraw"
    )
    units = _integers(c6.get("units"), DEGREE * UNIT_COLUMNS, "materialized units")
    inverse_mask = _integer(c6.get("inverseMask"), "inverse mask")
    if inverse_mask < 0 or inverse_mask >= 1 << UNIT_COLUMNS:
        raise Field3C6FactorbackFailure("inverse mask changed")
    logs_real = _integers(c6.get("logsReal"), 18, "materialized real logs")
    logs_imag = _integers(c6.get("logsImag"), 18, "materialized imaginary logs")
    prepared_real = _integers(
        source.get("preparedCleanReal"), 18, "C5 prepared real logs"
    )
    prepared_imag = _integers(
        source.get("preparedCleanImag"), 18, "C5 prepared imaginary logs"
    )
    embedding_real = _integers(
        source.get("embeddingReal"), 36, "prepared embedding real parts"
    )
    embedding_imag = _integers(
        source.get("embeddingImag"), 36, "prepared embedding imaginary parts"
    )
    log_precision = _integer(source.get("logPrecision"), "log replay precision")
    if log_precision != precision:
        raise Field3C6FactorbackFailure("log replay precision changed")
    two_pi = _integers(source.get("twoPi"), 3, "two-pi authority")
    period_multipliers = _integers(
        source.get("phasePeriodMultipliers"), 3, "phase period multipliers"
    )
    if period_multipliers != [1, 1, 2]:
        raise Field3C6FactorbackFailure("phase period policy changed")
    tolerance_exponent = _integer(
        source.get("phaseToleranceExponent"), "phase tolerance exponent"
    )

    # R * Wraw = 0 is the exact divisor-lattice identity which makes each
    # product of principal generators a candidate global unit.
    for unit in range(UNIT_COLUMNS):
        for row in range(RELATION_ROWS):
            value = sum(
                relations[RELATION_ROWS * column + row]
                * raw_transform[RAW_COLUMNS * unit + column]
                for column in range(RAW_COLUMNS)
            )
            if value != 0:
                raise Field3C6FactorbackFailure("raw Wraw left the relation kernel")

    columns: list[dict[str, Any]] = []
    published_norms = c6.get("unitNorms")
    if (
        not isinstance(published_norms, Sequence)
        or isinstance(published_norms, (str, bytes))
        or len(published_norms) != UNIT_COLUMNS
    ):
        raise Field3C6FactorbackFailure("published unit norms changed")
    for unit in range(UNIT_COLUMNS):
        exponents = raw_transform[RAW_COLUMNS * unit : RAW_COLUMNS * (unit + 1)]
        raw_unit = _factorback(generators, exponents, tensor)
        raw_data = _unit_data(raw_unit, tensor, "factorback column")
        wanted_inverse = raw_data["inverseSquaredNorm"] < raw_data["squaredNorm"]
        if bool(inverse_mask & (1 << unit)) != wanted_inverse:
            raise Field3C6FactorbackFailure("inverse-choice normalization changed")
        sign = -1 if wanted_inverse else 1
        expected_transform = [sign * value for value in exponents]
        if (
            adjusted_transform[RAW_COLUMNS * unit : RAW_COLUMNS * (unit + 1)]
            != expected_transform
        ):
            raise Field3C6FactorbackFailure("adjusted Wraw changed")
        normalized = raw_data["inverse"] if wanted_inverse else raw_unit
        materialized = tuple(units[DEGREE * unit : DEGREE * (unit + 1)])
        materialized_data = _unit_data(materialized, tensor, "materialized unit")
        torsion_sign = 0
        if materialized == normalized:
            torsion_sign = 1
        elif materialized == tuple(-value for value in normalized):
            torsion_sign = -1
        else:
            raise Field3C6FactorbackFailure(
                "factorback and materialized unit differ beyond torsion"
            )
        if (
            _integer(published_norms[unit], f"published unit norm {unit}")
            != materialized_data["norm"]
        ):
            raise Field3C6FactorbackFailure("published unit norm changed")
        columns.append(
            {
                "column": unit,
                "inverseChosen": wanted_inverse,
                "factorbackNorm": raw_data["norm"],
                "materializedNorm": materialized_data["norm"],
                "torsionSign": torsion_sign,
            }
        )

    _verify_logs(
        prepared_real,
        prepared_imag,
        embedding_real,
        embedding_imag,
        logs_real,
        logs_imag,
        inverse_mask,
        units,
        precision,
        two_pi,
        period_multipliers,
        tolerance_exponent,
    )
    return {
        "schema": RECEIPT_SCHEMA,
        "field": field,
        "runIdentity": run_identity,
        "precision": precision,
        "generation": generation,
        "sourceOwnerSha256": _digest(source_sha256, "source owner"),
        "c6OwnerSha256": actual_c6_sha256,
        "c5OwnerSha256": c5_sha256,
        "embeddingOwnerSha256": embedding_owner_sha256,
        "relationOwnerSha256": relation_owner_sha256,
        "inverseMask": inverse_mask,
        "columns": columns,
        "verified": {
            "relationKernel": True,
            "exactFactorback": True,
            "principalIdealOne": True,
            "torsionPlusMinusOne": True,
            "normAndInverse": True,
            "logLattice": True,
        },
        "counts": {
            "relations": RAW_COLUMNS,
            "relationRows": RELATION_ROWS,
            "units": UNIT_COLUMNS,
            "logCells": LOG_CELLS * PLACES * UNIT_COLUMNS,
        },
    }


def verify_authenticated_field3_c6_factorback(
    source_path: str | Path,
    source_sha256: str,
    c6_path: str | Path,
    c6_sha256: str,
) -> dict[str, Any]:
    """Authenticate immutable owners and perform one cold exact replay."""
    source = _load_owner(source_path, source_sha256, "factorback source owner")
    c6 = _load_owner(c6_path, c6_sha256, "C6 owner")
    return verify_field3_c6_factorback(source, c6, source_sha256, c6_sha256)


def publish_authenticated_field3_c6_factorback(
    source_path: str | Path,
    source_sha256: str,
    c6_path: str | Path,
    c6_sha256: str,
    output_dir: str | Path,
) -> dict[str, Any]:
    """Verify fully, then publish one content-addressed immutable receipt."""
    receipt = verify_authenticated_field3_c6_factorback(
        source_path, source_sha256, c6_path, c6_sha256
    )
    data = (json.dumps(receipt, sort_keys=True, separators=(",", ":")) + "\n").encode()
    digest = _sha256(data)
    directory = Path(output_dir)
    directory.mkdir(parents=True, exist_ok=True)
    destination = directory / f"field3-c6-factorback-{digest}.json"
    if destination.exists():
        if (
            _sha256(destination.read_bytes()) != digest
            or stat.S_IMODE(destination.stat().st_mode) != 0o444
        ):
            raise Field3C6FactorbackFailure("existing factorback receipt changed")
    else:
        descriptor, temporary_name = tempfile.mkstemp(
            prefix=".field3-c6-factorback-", dir=directory
        )
        temporary = Path(temporary_name)
        try:
            with os.fdopen(descriptor, "wb") as stream:
                stream.write(data)
                stream.flush()
                os.fsync(stream.fileno())
            temporary.chmod(0o400)
            os.replace(temporary, destination)
            destination.chmod(0o444)
        except BaseException:
            temporary.unlink(missing_ok=True)
            raise
    return {
        "schema": RECEIPT_SCHEMA,
        "path": str(destination),
        "sha256": digest,
        "bytes": len(data),
    }


def _main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--source-sha256", required=True)
    parser.add_argument("--c6", required=True)
    parser.add_argument("--c6-sha256", required=True)
    parser.add_argument("--output-dir", required=True)
    options = parser.parse_args()
    result = publish_authenticated_field3_c6_factorback(
        options.source,
        options.source_sha256,
        options.c6,
        options.c6_sha256,
        options.output_dir,
    )
    print(json.dumps(result, sort_keys=True, separators=(",", ":")))


if __name__ == "__main__":
    _main()


__all__ = [
    "Field3C6FactorbackFailure",
    "publish_authenticated_field3_c6_factorback",
    "verify_authenticated_field3_c6_factorback",
    "verify_field3_c6_factorback",
]
