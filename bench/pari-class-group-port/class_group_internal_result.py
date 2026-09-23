"""Immutable internal result and cold replay for the PARI class-group port.

This module is deliberately independent of the live native owners.  A caller
snapshots only authenticated logical prefixes, validates the entire draft, and
then publishes one canonical byte string atomically.  Cold replay decodes that
byte string without importing or invoking the class-group implementation.

The schema is an internal experiment contract.  It never represents a public
certified `ClassUnitComputation`: `public_complete` is fixed to `False`.
"""

from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
from math import gcd
from threading import Lock
from typing import Any, Mapping, Sequence


SCHEMA = "sagejs.pari-class-group/internal-result-v1"
PARI_VERSION = "2.17.4"
PARI_ARCHIVE_SHA256 = "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53"
PARI_BUCH2_SHA256 = "904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac"

_MAX_VECTOR = 1_000_000
_MAX_SQUARE_ARITHMETIC_DIMENSION = 256
_MAX_RECTANGULAR_DIMENSION = 4096
_MAX_MATRIX_CELLS = 1_000_000
_MAX_MULTIPLY_TERMS = 32_000_000
_MAX_INTEGER_DIGITS = 4096
_MAX_ENVELOPE_BYTES = 64 * 1024 * 1024
_MAX_GENERATORS = 256
_MAX_UNIT_RANK = 64


class ReplayFailure(ValueError):
    """The detached result is malformed, unauthenticated, or inconsistent."""


class PublicationConflict(RuntimeError):
    """A terminal result was already published with different content."""


@dataclass(frozen=True)
class PreparedCandidateLayout:
    """Authenticated logical lengths for a live prepared-candidate state."""

    relation_rows: int
    relation_columns: int
    hnf_rows: int
    hnf_columns: int
    transformed_log_length: int
    invariant_count: int
    unit_rank: int


@dataclass(frozen=True)
class ReplayAuthority:
    """Out-of-band facts that a cold replay is not allowed to redefine."""

    field_id: str
    assumptions: tuple[str, ...]
    expected_result_sha256: str | None = None


@dataclass(frozen=True)
class ImmutableInternalResult:
    """Canonical detached bytes; decoding always returns a fresh object."""

    canonical_json: bytes
    sha256: str

    def detached_payload(self) -> dict[str, Any]:
        envelope = _strict_json_loads(self.canonical_json)
        return dict(envelope["payload"])


def _strict_json_loads(raw: bytes | str) -> dict[str, Any]:
    def no_duplicates(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
        answer: dict[str, Any] = {}
        for key, value in pairs:
            if key in answer:
                raise ReplayFailure("duplicate JSON object key: " + key)
            answer[key] = value
        return answer

    if not isinstance(raw, (bytes, str)) or len(raw) > _MAX_ENVELOPE_BYTES:
        raise ReplayFailure("result exceeds the detached replay byte limit")
    try:
        value = json.loads(raw, object_pairs_hook=no_duplicates)
    except (TypeError, ValueError, UnicodeError) as error:
        raise ReplayFailure("result is not strict JSON") from error
    if not isinstance(value, dict):
        raise ReplayFailure("result envelope must be an object")
    return value


def _canonical(value: Any) -> bytes:
    try:
        return json.dumps(
            value,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=True,
            allow_nan=False,
        ).encode("ascii")
    except (TypeError, ValueError, UnicodeError) as error:
        raise ReplayFailure("result is not canonical-JSON encodable") from error


def _sha256(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def _exact_keys(value: Any, keys: set[str], name: str) -> Mapping[str, Any]:
    if not isinstance(value, dict) or set(value) != keys:
        raise ReplayFailure(name + " has the wrong fields")
    return value


def _decimal(value: Any, name: str) -> int:
    if not isinstance(value, str) or not value:
        raise ReplayFailure(name + " must be a canonical decimal string")
    if len(value) > _MAX_INTEGER_DIGITS:
        raise ReplayFailure(name + " exceeds the integer replay limit")
    if value == "0":
        return 0
    negative = value.startswith("-")
    digits = value[1:] if negative else value
    if not digits or not digits.isascii() or not digits.isdigit() or digits[0] == "0":
        raise ReplayFailure(name + " must be a canonical decimal string")
    try:
        answer = int(value)
    except (ValueError, OverflowError) as error:
        raise ReplayFailure(name + " is not a replayable exact integer") from error
    if str(answer) != value:
        raise ReplayFailure(name + " must be a canonical decimal string")
    return answer


def _as_decimal(value: Any, name: str) -> str:
    if isinstance(value, bool):
        raise ReplayFailure(name + " must be an exact integer")
    if not isinstance(value, int):
        try:
            converted = int(value)
        except (TypeError, ValueError, OverflowError) as error:
            raise ReplayFailure(name + " must be an exact integer") from error
        if converted != value:
            raise ReplayFailure(name + " must be an exact integer")
        value = converted
    return str(value)


def _string(value: Any, name: str) -> str:
    if not isinstance(value, str) or not value or len(value.encode("utf-8")) > 65536:
        raise ReplayFailure(name + " must be a nonempty bounded string")
    return value


def _decimal_vector(value: Any, name: str, length: int | None = None) -> list[int]:
    if not isinstance(value, list) or len(value) > _MAX_VECTOR:
        raise ReplayFailure(name + " must be a bounded list")
    if length is not None and len(value) != length:
        raise ReplayFailure(name + " has the wrong logical length")
    return [_decimal(item, name + " cell") for item in value]


def _shape(value: Any, name: str) -> tuple[int, int]:
    entries = _decimal_vector(value, name, 2)
    rows, columns = entries
    if (
        rows < 0
        or columns < 0
        or rows > _MAX_RECTANGULAR_DIMENSION
        or columns > _MAX_RECTANGULAR_DIMENSION
        or rows * columns > _MAX_MATRIX_CELLS
    ):
        raise ReplayFailure(name + " exceeds matrix replay limits")
    return rows, columns


def _matrix(value: Any, shape: Any, name: str) -> tuple[int, int, list[int]]:
    rows, columns = _shape(shape, name + " shape")
    return rows, columns, _decimal_vector(value, name, rows * columns)


def _multiply(
    left: tuple[int, int, list[int]], right: tuple[int, int, list[int]]
) -> tuple[int, int, list[int]]:
    lr, lc, lv = left
    rr, rc, rv = right
    if lc != rr:
        raise ReplayFailure("matrix multiplication shape mismatch")
    if lr * lc * rc > _MAX_MULTIPLY_TERMS:
        raise ReplayFailure("matrix replay exceeds the arithmetic work limit")
    output = [0] * (lr * rc)
    for i in range(lr):
        for k in range(lc):
            coefficient = lv[i * lc + k]
            for j in range(rc):
                output[i * rc + j] += coefficient * rv[k * rc + j]
    return lr, rc, output


def _identity(size: int) -> tuple[int, int, list[int]]:
    return size, size, [int(i == j) for i in range(size) for j in range(size)]


def _matrix_times_column(
    matrix: tuple[int, int, list[int]], column: Sequence[int]
) -> list[int]:
    rows, columns, entries = matrix
    if len(column) != columns:
        raise ReplayFailure("matrix/column shape mismatch")
    return [
        sum(entries[i * columns + j] * column[j] for j in range(columns))
        for i in range(rows)
    ]


def _determinant(entries: list[int], size: int) -> int:
    """Fraction-free Bareiss determinant used only by detached replay."""
    if len(entries) != size * size:
        raise ReplayFailure("determinant matrix has the wrong shape")
    if size == 0:
        return 1
    work = [entries[i * size : (i + 1) * size] for i in range(size)]
    sign = 1
    previous = 1
    for pivot_index in range(size - 1):
        pivot_row = next(
            (row for row in range(pivot_index, size) if work[row][pivot_index]),
            None,
        )
        if pivot_row is None:
            return 0
        if pivot_row != pivot_index:
            work[pivot_index], work[pivot_row] = work[pivot_row], work[pivot_index]
            sign = -sign
        pivot = work[pivot_index][pivot_index]
        for i in range(pivot_index + 1, size):
            for j in range(pivot_index + 1, size):
                numerator = (
                    work[i][j] * pivot - work[i][pivot_index] * work[pivot_index][j]
                )
                if numerator % previous:
                    raise ReplayFailure("Bareiss division was not exact")
                work[i][j] = numerator // previous
        previous = pivot
    return sign * work[size - 1][size - 1]


def _snapshot_prefix(state: Mapping[str, Any], key: str, length: int) -> list[str]:
    if length < 0 or length > _MAX_VECTOR:
        raise ReplayFailure(key + " logical length is invalid")
    try:
        owner = state[key]
        if len(owner) < length:
            raise ReplayFailure(key + " owner is shorter than its logical length")
        return [_as_decimal(owner[index], key) for index in range(length)]
    except KeyError as error:
        raise ReplayFailure("prepared state is missing " + key) from error
    except TypeError as error:
        raise ReplayFailure(key + " is not an indexable owner") from error


def _snapshot_column_major_matrix(
    state: Mapping[str, Any], key: str, rows: int, columns: int
) -> list[str]:
    raw = _snapshot_prefix(state, key, rows * columns)
    return [
        raw[column * rows + row] for row in range(rows) for column in range(columns)
    ]


def snapshot_prepared_candidate(
    state: Mapping[str, Any], layout: PreparedCandidateLayout, field_id: str
) -> dict[str, Any]:
    """Detach authenticated logical prefixes from the existing prepared state."""
    dimensions = (
        layout.relation_rows,
        layout.relation_columns,
        layout.hnf_rows,
        layout.hnf_columns,
        layout.transformed_log_length,
        layout.invariant_count,
        layout.unit_rank,
    )
    if any(
        isinstance(value, bool) or not isinstance(value, int) or value < 0
        for value in dimensions
    ):
        raise ReplayFailure("prepared candidate layout must be nonnegative")
    owner_names = (
        "relation_records",
        "hnf_result_h",
        "hnf_result_c",
        "class_invariants",
        "class_number",
        "accept_regulator",
        "driver_state",
        "relation_state",
    )
    owner_lengths: dict[str, str] = {}
    for name in owner_names:
        try:
            owner_lengths[name] = _as_decimal(len(state[name]), name + " owner length")
        except (KeyError, TypeError) as error:
            raise ReplayFailure("prepared state is missing owner " + name) from error
    return {
        "field_id": _string(field_id, "field id"),
        "class_number": _snapshot_prefix(state, "class_number", 1)[0],
        "invariant_factors": _snapshot_prefix(
            state, "class_invariants", layout.invariant_count
        ),
        "relation_shape": [str(layout.relation_rows), str(layout.relation_columns)],
        "relation_matrix": _snapshot_column_major_matrix(
            state, "relation_records", layout.relation_rows, layout.relation_columns
        ),
        "hnf_shape": [str(layout.hnf_rows), str(layout.hnf_columns)],
        "hnf_matrix": _snapshot_column_major_matrix(
            state, "hnf_result_h", layout.hnf_rows, layout.hnf_columns
        ),
        "transformed_logs": _snapshot_prefix(
            state, "hnf_result_c", layout.transformed_log_length
        ),
        "regulator_triplet": _snapshot_prefix(state, "accept_regulator", 3),
        "driver_state": _snapshot_prefix(state, "driver_state", 8),
        "relation_state": _snapshot_prefix(state, "relation_state", 5),
        "owner_lengths": owner_lengths,
        "expected_unit_rank": str(layout.unit_rank),
    }


def _validate_source(source: Any) -> None:
    value = _exact_keys(
        source,
        {"pari_version", "archive_sha256", "buch2_sha256"},
        "source",
    )
    if value["pari_version"] != PARI_VERSION:
        raise ReplayFailure("wrong PARI source version")
    if value["archive_sha256"] != PARI_ARCHIVE_SHA256:
        raise ReplayFailure("wrong PARI archive hash")
    if value["buch2_sha256"] != PARI_BUCH2_SHA256:
        raise ReplayFailure("wrong PARI buch2.c hash")


def _validate_candidate(
    candidate: Any, authority: ReplayAuthority
) -> tuple[list[int], int]:
    value = _exact_keys(
        candidate,
        {
            "field_id",
            "class_number",
            "invariant_factors",
            "relation_shape",
            "relation_matrix",
            "hnf_shape",
            "hnf_matrix",
            "transformed_logs",
            "regulator_triplet",
            "driver_state",
            "relation_state",
            "owner_lengths",
            "expected_unit_rank",
        },
        "candidate",
    )
    if _string(value["field_id"], "field id") != authority.field_id:
        raise ReplayFailure("candidate field identity changed")
    class_number = _decimal(value["class_number"], "class number")
    invariants = _decimal_vector(value["invariant_factors"], "invariants")
    if any(entry <= 1 for entry in invariants):
        raise ReplayFailure("invariant factors must omit trivial factors")
    if any(left % right for left, right in zip(invariants, invariants[1:])):
        raise ReplayFailure("invariant factors are not normalized")
    product = 1
    for entry in invariants:
        product *= entry
    if class_number != product:
        raise ReplayFailure("class number is not the product of invariant factors")
    relation_rows, relation_columns, _ = _matrix(
        value["relation_matrix"], value["relation_shape"], "relation matrix"
    )
    _matrix(value["hnf_matrix"], value["hnf_shape"], "HNF matrix")
    _decimal_vector(value["transformed_logs"], "transformed logs")
    regulator = _decimal_vector(value["regulator_triplet"], "regulator triplet", 3)
    if regulator[0] <= 0 or regulator[1] <= 0:
        raise ReplayFailure("regulator mantissa and precision must be positive")
    expected_unit_rank = _decimal(value["expected_unit_rank"], "expected unit rank")
    if expected_unit_rank < 0 or expected_unit_rank > _MAX_UNIT_RANK:
        raise ReplayFailure("expected unit rank exceeds replay limits")
    driver = _decimal_vector(value["driver_state"], "driver state", 8)
    relation_state = _decimal_vector(value["relation_state"], "relation state", 5)
    if driver[0] != 4 or driver[1] != 0 or driver[4] != 1:
        raise ReplayFailure("candidate was not terminally and successfully published")
    if relation_state[0] != relation_columns:
        raise ReplayFailure("relation logical column count disagrees with state")
    lengths = value["owner_lengths"]
    if not isinstance(lengths, dict) or set(lengths) != {
        "relation_records",
        "hnf_result_h",
        "hnf_result_c",
        "class_invariants",
        "class_number",
        "accept_regulator",
        "driver_state",
        "relation_state",
    }:
        raise ReplayFailure("owner lengths are incomplete")
    minimums = {
        "relation_records": relation_rows * relation_columns,
        "hnf_result_h": len(value["hnf_matrix"]),
        "hnf_result_c": len(value["transformed_logs"]),
        "class_invariants": len(invariants),
        "class_number": 1,
        "accept_regulator": 3,
        "driver_state": 8,
        "relation_state": 5,
    }
    for name, minimum in minimums.items():
        if _decimal(lengths[name], name + " owner length") < minimum:
            raise ReplayFailure(
                name + " owner length does not cover its logical prefix"
            )
    return invariants, expected_unit_rank


def _validate_transforms(
    transforms: Any, candidate: Mapping[str, Any]
) -> tuple[
    int,
    tuple[int, int, list[int]],
    list[int],
    tuple[int, int, list[int]],
]:
    value = _exact_keys(
        transforms,
        {
            "shape",
            "presentation",
            "left",
            "left_inverse",
            "right",
            "right_inverse",
            "diagonal",
            "relation_to_presentation_shape",
            "relation_to_presentation",
            "presentation_to_relation_shape",
            "presentation_to_relation",
        },
        "transforms",
    )
    size_rows, size_columns = _shape(value["shape"], "transform shape")
    if size_rows != size_columns:
        raise ReplayFailure("the v1 transform replay requires a square presentation")
    size = size_rows
    if size > _MAX_SQUARE_ARITHMETIC_DIMENSION:
        raise ReplayFailure("Smith replay exceeds the square arithmetic limit")
    matrix_shape = [str(size), str(size)]
    presentation = _matrix(value["presentation"], matrix_shape, "presentation")
    hnf = _matrix(candidate["hnf_matrix"], candidate["hnf_shape"], "candidate HNF")
    if hnf != presentation:
        raise ReplayFailure("Smith presentation is not the accepted candidate HNF")
    relation = _matrix(
        candidate["relation_matrix"], candidate["relation_shape"], "candidate relations"
    )
    relation_rows, relation_columns, _ = relation
    if relation_rows != size:
        raise ReplayFailure("relation and presentation ambient ranks differ")
    relation_to_presentation = _matrix(
        value["relation_to_presentation"],
        value["relation_to_presentation_shape"],
        "relation-to-presentation witness",
    )
    presentation_to_relation = _matrix(
        value["presentation_to_relation"],
        value["presentation_to_relation_shape"],
        "presentation-to-relation witness",
    )
    if relation_to_presentation[:2] != (relation_columns, size):
        raise ReplayFailure("relation-to-presentation witness has the wrong shape")
    if presentation_to_relation[:2] != (size, relation_columns):
        raise ReplayFailure("presentation-to-relation witness has the wrong shape")
    if _multiply(relation, relation_to_presentation) != presentation:
        raise ReplayFailure("candidate relations do not generate the published HNF")
    if _multiply(presentation, presentation_to_relation) != relation:
        raise ReplayFailure("published HNF does not generate all candidate relations")
    left = _matrix(value["left"], matrix_shape, "left transform")
    left_inverse = _matrix(value["left_inverse"], matrix_shape, "left inverse")
    right = _matrix(value["right"], matrix_shape, "right transform")
    right_inverse = _matrix(value["right_inverse"], matrix_shape, "right inverse")
    diagonal_matrix = _matrix(value["diagonal"], matrix_shape, "Smith diagonal")
    identity = _identity(size)
    if (
        _multiply(left, left_inverse) != identity
        or _multiply(left_inverse, left) != identity
    ):
        raise ReplayFailure("left transformation is not exactly unimodular")
    if (
        _multiply(right, right_inverse) != identity
        or _multiply(right_inverse, right) != identity
    ):
        raise ReplayFailure("right transformation is not exactly unimodular")
    if _multiply(_multiply(left, presentation), right) != diagonal_matrix:
        raise ReplayFailure("U * W * V does not equal the Smith diagonal")
    diagonal = []
    for i in range(size):
        for j in range(size):
            entry = diagonal_matrix[2][i * size + j]
            if i == j:
                if entry < 0:
                    raise ReplayFailure("Smith diagonal must be nonnegative")
                diagonal.append(entry)
            elif entry:
                raise ReplayFailure("Smith result is not diagonal")
    if any(entry == 0 for entry in diagonal):
        raise ReplayFailure("class-group presentation must have finite Smith quotient")
    if any(
        left_entry % right_entry
        for left_entry, right_entry in zip(diagonal, diagonal[1:])
    ):
        raise ReplayFailure("Smith diagonal is not normalized")
    return size, presentation, diagonal, left


def _validate_generators(
    generators: Any,
    transform_data: tuple[
        int,
        tuple[int, int, list[int]],
        list[int],
        tuple[int, int, list[int]],
    ],
) -> None:
    value = _exact_keys(generators, {"entries"}, "generators")
    entries = value["entries"]
    if not isinstance(entries, list) or len(entries) > _MAX_GENERATORS:
        raise ReplayFailure("generator entries must be a bounded list")
    size, presentation, diagonal, left = transform_data
    nontrivial_indices = [
        index for index, modulus in enumerate(diagonal) if modulus > 1
    ]
    if len(entries) != len(nontrivial_indices):
        raise ReplayFailure(
            "generator count does not match the nontrivial Smith factors"
        )
    seen_indices: set[int] = set()
    for raw in entries:
        entry = _exact_keys(
            raw,
            {
                "class_vector",
                "order",
                "relation_coefficients",
                "ideal_hnf",
                "principal_generator",
                "smith_index",
            },
            "generator entry",
        )
        vector = _decimal_vector(entry["class_vector"], "generator class vector", size)
        order = _decimal(entry["order"], "generator order")
        smith_index = _decimal(entry["smith_index"], "generator Smith index")
        coefficients = _decimal_vector(
            entry["relation_coefficients"], "generator relation coefficients", size
        )
        if smith_index not in nontrivial_indices or smith_index in seen_indices:
            raise ReplayFailure("generator Smith indices are not a complete unique set")
        seen_indices.add(smith_index)
        if order != diagonal[smith_index]:
            raise ReplayFailure("generator order disagrees with its Smith factor")
        if [order * cell for cell in vector] != _matrix_times_column(
            presentation, coefficients
        ):
            raise ReplayFailure("generator order relation does not replay")
        # For the column presentation D = U W V, an ambient class vector maps
        # to U*x.  Each published generator must generate exactly one distinct
        # nontrivial Smith factor; together they therefore span the quotient.
        transformed = _matrix_times_column(left, vector)
        for index, (coordinate, modulus) in enumerate(zip(transformed, diagonal)):
            if index == smith_index:
                if gcd(coordinate, modulus) != 1:
                    raise ReplayFailure(
                        "generator is not primitive in its Smith factor"
                    )
            elif coordinate % modulus:
                raise ReplayFailure("generator leaks into another Smith factor")
        _decimal_vector(entry["ideal_hnf"], "generator ideal HNF")
        _decimal_vector(entry["principal_generator"], "principal generator")
    if seen_indices != set(nontrivial_indices):
        raise ReplayFailure("generator evidence does not span the Smith quotient")


def _validate_units(
    units: Any, candidate: Mapping[str, Any], expected_unit_rank: int
) -> None:
    value = _exact_keys(
        units,
        {
            "rank",
            "factor_norms",
            "factor_exponent_shape",
            "factor_exponents",
            "claimed_norms",
            "log_minor_shape",
            "log_minor_numerators",
            "log_denominator",
            "regulator_determinant_numerator",
            "regulator_determinant_denominator",
            "log_minor_indices",
            "candidate_regulator_triplet",
            "torsion_order",
            "torsion_coordinates",
            "torsion_norm",
        },
        "units",
    )
    rank = _decimal(value["rank"], "unit rank")
    if rank != expected_unit_rank or rank > _MAX_UNIT_RANK:
        raise ReplayFailure("unit rank disagrees with the prepared field")
    factor_norms = _decimal_vector(value["factor_norms"], "unit factor norms")
    if any(norm not in (-1, 1) for norm in factor_norms):
        raise ReplayFailure("unit factor norms must be +1 or -1")
    exponent_rows, exponent_columns, exponents = _matrix(
        value["factor_exponents"],
        value["factor_exponent_shape"],
        "unit factor exponents",
    )
    if exponent_rows != rank or exponent_columns != len(factor_norms):
        raise ReplayFailure("unit factor exponent shape is inconsistent")
    claimed_norms = _decimal_vector(value["claimed_norms"], "unit norms", rank)
    for row in range(rank):
        norm = 1
        for column, factor_norm in enumerate(factor_norms):
            if factor_norm == -1 and exponents[row * exponent_columns + column] % 2:
                norm = -norm
        if claimed_norms[row] != norm:
            raise ReplayFailure("factored unit norm does not replay")
    log_rows, log_columns, log_entries = _matrix(
        value["log_minor_numerators"], value["log_minor_shape"], "unit log minor"
    )
    if log_rows != rank or log_columns != rank:
        raise ReplayFailure("unit log minor must be rank by rank")
    log_indices = _decimal_vector(
        value["log_minor_indices"], "unit log minor indices", rank * rank
    )
    candidate_logs = _decimal_vector(candidate["transformed_logs"], "candidate logs")
    if any(index < 0 or index >= len(candidate_logs) for index in log_indices):
        raise ReplayFailure("unit log selection is outside the accepted candidate")
    if log_entries != [candidate_logs[index] for index in log_indices]:
        raise ReplayFailure(
            "unit log minor is not selected from the accepted candidate"
        )
    candidate_regulator = _decimal_vector(
        value["candidate_regulator_triplet"], "unit candidate regulator", 3
    )
    if candidate_regulator != _decimal_vector(
        candidate["regulator_triplet"], "candidate regulator", 3
    ):
        raise ReplayFailure("unit regulator evidence is detached from the candidate")
    denominator = _decimal(value["log_denominator"], "unit log denominator")
    numerator = _decimal(
        value["regulator_determinant_numerator"], "regulator numerator"
    )
    regulator_denominator = _decimal(
        value["regulator_determinant_denominator"], "regulator denominator"
    )
    if denominator <= 0 or numerator <= 0 or regulator_denominator <= 0:
        raise ReplayFailure("unit denominators must be positive")
    determinant = abs(_determinant(log_entries, rank))
    expected_denominator = denominator**rank
    common = gcd(determinant, expected_denominator)
    if (
        numerator != determinant // common
        or regulator_denominator != expected_denominator // common
    ):
        raise ReplayFailure("scaled unit regulator determinant does not replay")
    torsion_order = _decimal(value["torsion_order"], "torsion order")
    torsion_coordinates = _decimal_vector(
        value["torsion_coordinates"], "torsion coordinates"
    )
    torsion_norm = _decimal(value["torsion_norm"], "torsion norm")
    if torsion_order <= 0 or not torsion_coordinates or torsion_norm not in (-1, 1):
        raise ReplayFailure("torsion evidence is malformed")


def _validate_payload(payload: Any, authority: ReplayAuthority) -> dict[str, Any]:
    value = _exact_keys(
        payload,
        {
            "source",
            "candidate",
            "transforms",
            "generators",
            "units",
            "assumptions",
            "terminal",
        },
        "payload",
    )
    _validate_source(value["source"])
    candidate_invariants, expected_unit_rank = _validate_candidate(
        value["candidate"], authority
    )
    assumptions = value["assumptions"]
    if not isinstance(assumptions, list) or any(
        not isinstance(item, str) for item in assumptions
    ):
        raise ReplayFailure("assumptions must be a list of strings")
    for assumption in assumptions:
        _string(assumption, "assumption")
    if not assumptions or (
        assumptions != sorted(set(assumptions))
        or tuple(assumptions) != authority.assumptions
    ):
        raise ReplayFailure("assumption authority changed")
    transform_data = None
    if value["transforms"] is not None:
        transform_data = _validate_transforms(value["transforms"], value["candidate"])
        smith_invariants = [entry for entry in transform_data[2] if entry > 1]
        if smith_invariants != candidate_invariants:
            raise ReplayFailure("Smith diagonal disagrees with candidate invariants")
    if value["generators"] is not None:
        if transform_data is None:
            raise ReplayFailure("generator evidence requires transformations")
        _validate_generators(value["generators"], transform_data)
    if value["units"] is not None:
        _validate_units(value["units"], value["candidate"], expected_unit_rank)
    missing = [
        name for name in ("transforms", "generators", "units") if value[name] is None
    ]
    terminal = _exact_keys(
        value["terminal"],
        {
            "status",
            "schema_components_present",
            "phase5_complete",
            "public_complete",
            "missing_components",
            "unverified_requirements",
        },
        "terminal",
    )
    if terminal["status"] != "published-partial-v1":
        raise ReplayFailure("terminal result is not published")
    if (
        terminal["phase5_complete"] is not False
        or terminal["public_complete"] is not False
    ):
        raise ReplayFailure(
            "the partial v1 evidence cannot claim Phase-5 or public completeness"
        )
    if terminal["schema_components_present"] is not (not missing):
        raise ReplayFailure("schema-component presence is inconsistent")
    if terminal["missing_components"] != missing:
        raise ReplayFailure("missing-component status is inconsistent")
    required_unverified = [
        "exact-ideal-arithmetic-replay",
        "exact-unit-principality-and-norm-replay",
        "factor-base-and-relation-authentication",
        "full-buchall-end-state",
        "rigorous-regulator-enclosure-and-acceptance",
    ]
    if terminal["unverified_requirements"] != required_unverified:
        raise ReplayFailure("partial-v1 unverified requirements changed")
    return dict(value)


def make_internal_payload(
    candidate: Mapping[str, Any],
    assumptions: Sequence[str],
    *,
    transforms: Mapping[str, Any] | None = None,
    generators: Mapping[str, Any] | None = None,
    units: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Construct and validate a detached draft without publishing it."""
    if isinstance(assumptions, (str, bytes)) or any(
        not isinstance(assumption, str) or not assumption for assumption in assumptions
    ):
        raise ReplayFailure("assumptions must be nonempty strings")
    normalized_assumptions = sorted(set(assumptions))
    if not normalized_assumptions:
        raise ReplayFailure("the PARI correspondence assumption record is required")
    missing = [
        name
        for name, component in (
            ("transforms", transforms),
            ("generators", generators),
            ("units", units),
        )
        if component is None
    ]
    # Canonical encode/decode is the deep-copy boundary.  It also rejects all
    # non-JSON owner/proxy objects before any publication state is touched.
    payload = {
        "source": {
            "pari_version": PARI_VERSION,
            "archive_sha256": PARI_ARCHIVE_SHA256,
            "buch2_sha256": PARI_BUCH2_SHA256,
        },
        "candidate": dict(candidate),
        "transforms": None if transforms is None else dict(transforms),
        "generators": None if generators is None else dict(generators),
        "units": None if units is None else dict(units),
        "assumptions": normalized_assumptions,
        "terminal": {
            "status": "published-partial-v1",
            "schema_components_present": not missing,
            "phase5_complete": False,
            "public_complete": False,
            "missing_components": missing,
            "unverified_requirements": [
                "exact-ideal-arithmetic-replay",
                "exact-unit-principality-and-norm-replay",
                "factor-base-and-relation-authentication",
                "full-buchall-end-state",
                "rigorous-regulator-enclosure-and-acceptance",
            ],
        },
    }
    detached = _strict_json_loads(_canonical(payload))
    authority = ReplayAuthority(
        field_id=_string(candidate.get("field_id"), "field id"),
        assumptions=tuple(normalized_assumptions),
    )
    _validate_payload(detached, authority)
    return detached


class AtomicResultPublisher:
    """Publish once after validation; equal terminal repeats are idempotent."""

    def __init__(self, authority: ReplayAuthority):
        self._authority = authority
        self._lock = Lock()
        self._published: ImmutableInternalResult | None = None

    def publish(self, payload: Mapping[str, Any]) -> ImmutableInternalResult:
        # Validate and serialize before acquiring the publication lock.  Any
        # exception leaves the previously published reference untouched.
        detached = _strict_json_loads(_canonical(dict(payload)))
        _validate_payload(detached, self._authority)
        payload_bytes = _canonical(detached)
        digest = _sha256(payload_bytes)
        envelope_bytes = _canonical(
            {"schema": SCHEMA, "payload": detached, "payload_sha256": digest}
        )
        candidate = ImmutableInternalResult(envelope_bytes, _sha256(envelope_bytes))
        if (
            self._authority.expected_result_sha256 is not None
            and candidate.sha256 != self._authority.expected_result_sha256
        ):
            raise ReplayFailure("publication does not match the pinned result hash")
        with self._lock:
            if self._published is None:
                self._published = candidate
            elif self._published != candidate:
                raise PublicationConflict(
                    "a different terminal result is already published"
                )
            return self._published

    def current(self) -> ImmutableInternalResult | None:
        with self._lock:
            return self._published


def cold_replay(
    raw: bytes | str | ImmutableInternalResult, authority: ReplayAuthority
) -> ImmutableInternalResult:
    """Independently decode, authenticate, and replay a detached result."""
    encoded = raw.canonical_json if isinstance(raw, ImmutableInternalResult) else raw
    envelope = _exact_keys(
        _strict_json_loads(encoded),
        {"schema", "payload", "payload_sha256"},
        "result envelope",
    )
    if envelope["schema"] != SCHEMA:
        raise ReplayFailure("wrong internal result schema")
    payload_bytes = _canonical(envelope["payload"])
    if envelope["payload_sha256"] != _sha256(payload_bytes):
        raise ReplayFailure("payload authentication hash changed")
    _validate_payload(envelope["payload"], authority)
    canonical_envelope = _canonical(envelope)
    digest = _sha256(canonical_envelope)
    if (
        authority.expected_result_sha256 is not None
        and digest != authority.expected_result_sha256
    ):
        raise ReplayFailure("result does not match the pinned publication hash")
    return ImmutableInternalResult(canonical_envelope, digest)


__all__ = [
    "AtomicResultPublisher",
    "ImmutableInternalResult",
    "PARI_ARCHIVE_SHA256",
    "PARI_BUCH2_SHA256",
    "PARI_VERSION",
    "PreparedCandidateLayout",
    "PublicationConflict",
    "ReplayAuthority",
    "ReplayFailure",
    "SCHEMA",
    "cold_replay",
    "make_internal_payload",
    "snapshot_prepared_candidate",
]
