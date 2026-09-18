"""Immutable row-21 ``buchall_end`` result and detached exact replay.

This experiment-only publisher joins the authenticated row-21 relation/HNF,
analytic-acceptance, factor-base, and exact-unit owners.  It deliberately does
not call PARI and it does not read the frozen W0 trace.  The public claim stays
``False`` because the PARI/GRH bounds and the floating regulator acceptance are
assumed rather than independently certified.

The trivial class group is not accepted merely because an upstream owner says
``h = 1``.  We recompute a column-Hermite transform of the retained 24 by 32
relation matrix.  Its exact witness satisfies ``A * V = [0 | I_24]`` and hence
gives an integral right inverse for the relation map.
"""

from __future__ import annotations

from collections.abc import Sequence as SequenceABC
from dataclasses import dataclass
import gzip
import hashlib
import json
import os
from pathlib import Path
from threading import Lock
from typing import Any, Mapping, Sequence


SCHEMA = "sagejs.pari-class-group/row21-final-buchall-end-v1"
FACTOR_SCHEMA = "sagejs.pari-class-group/row21-prepared-factor-base-v1"
FIRST_HNF_SCHEMA = "sagejs.pari-class-group/row21-first-hnf-owner-v1"
ACCEPTANCE_SCHEMA = "sagejs.pari-class-group/row21-live-hnf-log-regulator-owner-v1"
UNIT_SCHEMA = "sagejs.pari-class-group/row21-live-unit-owner-v1"

PREPARED_SHA256 = "63378e8424e81d0d5653d965ef18a518b78ec7f78b66f57afcc55052849ac95f"
PREPARED_FILE_SHA256 = (
    "f33a1c37bb9f7bcafbe20a0e22b0c0434a29070843fa98e90ea3368db2302397"
)
FACTOR_SHA256 = "7784eef663b7ca2fad9259f2efe642a14aac511331d0ca9de93fae050aebc533"
FIRST_HNF_SHA256 = "a0eec806853ea37226ded40be707f95abb414b9af6e3bb0a811493147382c136"
ACCEPTANCE_SHA256 = "530fbd38198464fcac1285402cdb1394bdb8ce82f876198770aaef475b2749bb"
UNIT_SHA256 = "8d474d9ddbcaa1d8cfca584b089e666100f143834105ce393f82f34b0140fcd9"
FACTOR_CONTENT_SHA256 = (
    "46b1856793dd2310c44e0cabeb6561e0ac3b9cc17cc84bcda37acb7562598d2d"
)
FIRST_HNF_CONTENT_SHA256 = (
    "9b6513a13db4321d8e0665dc07f02c0c724842d85114992e799966bb58794717"
)
ACCEPTANCE_CONTENT_SHA256 = (
    "0ce985ff1c1a41257c64b9d5235fca2ce82b46c2601ca400cf091fb4669ea992"
)
UNIT_CONTENT_SHA256 = "b6c4137118b74256aa4146de42f7ff1cb47e3f39f8c5f98b9fa9c120b1ac8075"
PARI_VERSION = "2.17.4"

ROWS = 24
COLUMNS = 32
DEGREE = 5
UNIT_RANK = 3
PRECISION = 192
_MAX_BYTES = 64 * 1024 * 1024
_MAX_VECTOR = 1_000_000
_ASSUMPTIONS = (
    "GRH-dependent factor-base completeness inherited from PARI 2.17.4",
    "PARI 2.17.4 heuristic bounds and retry decisions are assumed correct",
    "PARI 2.17.4 floating analytic and regulator acceptance is assumed correct",
)


class Row21FinalFailure(ValueError):
    """A source owner or detached row-21 result failed closed."""


class Row21PublicationConflict(RuntimeError):
    """A different terminal row-21 result was already published."""


@dataclass(frozen=True)
class Row21ReplayAuthority:
    expected_sha256: str | None = None


@dataclass(frozen=True)
class ImmutableRow21Result:
    canonical_json: bytes
    sha256: str

    def detached_payload(self) -> dict[str, Any]:
        return dict(_strict_loads(self.canonical_json)["payload"])


def _sha256(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def _canonical(value: Any) -> bytes:
    try:
        raw = json.dumps(
            value,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=True,
            allow_nan=False,
        ).encode("ascii")
    except (TypeError, ValueError, UnicodeError) as error:
        raise Row21FinalFailure("row-21 result is not canonical JSON") from error
    if len(raw) > _MAX_BYTES:
        raise Row21FinalFailure("row-21 result exceeds its byte bound")
    return raw


def _strict_loads(raw: bytes | str) -> dict[str, Any]:
    if not isinstance(raw, (bytes, str)) or len(raw) > _MAX_BYTES:
        raise Row21FinalFailure("row-21 input exceeds its byte bound")

    def no_duplicates(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
        answer: dict[str, Any] = {}
        for key, value in pairs:
            if key in answer:
                raise Row21FinalFailure("duplicate row-21 JSON key: " + key)
            answer[key] = value
        return answer

    try:
        value = json.loads(raw, object_pairs_hook=no_duplicates)
    except (TypeError, ValueError, UnicodeError) as error:
        raise Row21FinalFailure("row-21 input is not strict JSON") from error
    if not isinstance(value, dict):
        raise Row21FinalFailure("row-21 input must be an object")
    return value


def _exact_dict(value: Any, fields: set[str], name: str) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != fields:
        raise Row21FinalFailure(name + " has the wrong fields")
    return value


def _integer(value: Any, name: str) -> int:
    if isinstance(value, bool):
        raise Row21FinalFailure(name + " is not an exact integer")
    if isinstance(value, str):
        if not value or len(value) > 4096:
            raise Row21FinalFailure(name + " is not a bounded decimal integer")
        try:
            answer = int(value)
        except (ValueError, OverflowError) as error:
            raise Row21FinalFailure(name + " is not an exact integer") from error
        if str(answer) != value:
            raise Row21FinalFailure(name + " is not a canonical decimal integer")
        return answer
    if not isinstance(value, int):
        raise Row21FinalFailure(name + " is not an exact integer")
    return value


def _integers(value: Any, name: str, length: int | None = None) -> list[int]:
    if (
        isinstance(value, (str, bytes))
        or not isinstance(value, SequenceABC)
        or len(value) > _MAX_VECTOR
        or (length is not None and len(value) != length)
    ):
        raise Row21FinalFailure(name + " has the wrong bounded length")
    return [_integer(entry, name + " entry") for entry in value]


def _decimals(value: Sequence[int]) -> list[str]:
    return [str(entry) for entry in value]


def _matrix_product(
    left: Sequence[int], rows: int, inner: int, right: Sequence[int], columns: int
) -> list[int]:
    if len(left) != rows * inner or len(right) != inner * columns:
        raise Row21FinalFailure("matrix multiplication shape mismatch")
    if rows * inner * columns > 2_000_000:
        raise Row21FinalFailure("matrix replay exceeds its work bound")
    return [
        sum(left[row * inner + k] * right[k * columns + column] for k in range(inner))
        for row in range(rows)
        for column in range(columns)
    ]


def _identity(size: int) -> list[int]:
    return [int(row == column) for row in range(size) for column in range(size)]


def _determinant(entries: Sequence[int], size: int) -> int:
    """Return an exact determinant by bounded fraction-free elimination."""
    if size < 0 or size > 64 or len(entries) != size * size:
        raise Row21FinalFailure("determinant input has the wrong shape")
    if size == 0:
        return 1
    work = [list(entries[row * size : (row + 1) * size]) for row in range(size)]
    previous = 1
    sign = 1
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
        for row in range(pivot_index + 1, size):
            for column in range(pivot_index + 1, size):
                numerator = (
                    work[row][column] * pivot
                    - work[row][pivot_index] * work[pivot_index][column]
                )
                if numerator % previous:
                    raise Row21FinalFailure("Bareiss division was not exact")
                work[row][column] = numerator // previous
        previous = pivot
    return sign * work[-1][-1]


def _extended_gcd(left: int, right: int) -> tuple[int, int, int]:
    """Return ``u, v, d`` with ``u*left + v*right = d >= 0``."""
    old_r, remainder = abs(left), abs(right)
    old_u, u = 1, 0
    old_v, v = 0, 1
    while remainder:
        quotient = old_r // remainder
        old_r, remainder = remainder, old_r - quotient * remainder
        old_u, u = u, old_u - quotient * u
        old_v, v = v, old_v - quotient * v
    return (
        old_u if left >= 0 else -old_u,
        old_v if right >= 0 else -old_v,
        old_r,
    )


def _add_columns(
    matrix: list[list[int]],
    first: int,
    second: int,
    a: int,
    b: int,
    c: int,
    d: int,
) -> None:
    if first == second:
        for row in matrix:
            row[first] *= a
        return
    for row in matrix:
        left, right = row[first], row[second]
        row[first] = a * left + b * right
        row[second] = c * left + d * right


def _column_hnf_witness(entries: Sequence[int]) -> dict[str, Any]:
    """Derive Cohen 2.4.5's column transform and the h=1 right inverse."""
    if len(entries) != ROWS * COLUMNS:
        raise Row21FinalFailure("relation presentation has the wrong shape")
    # Owners are column-major; internal replay matrices are row-major.
    original = [
        entries[column * ROWS + row] for row in range(ROWS) for column in range(COLUMNS)
    ]
    work = [original[row * COLUMNS : (row + 1) * COLUMNS] for row in range(ROWS)]
    transform = [
        [int(row == column) for column in range(COLUMNS)] for row in range(COLUMNS)
    ]
    pivot_column = COLUMNS
    for row in range(ROWS - 1, -1, -1):
        if pivot_column == 0:
            break
        pivot_column -= 1
        for column in range(pivot_column - 1, -1, -1):
            if work[row][column] == 0:
                continue
            u, v, divisor = _extended_gcd(work[row][pivot_column], work[row][column])
            if divisor == 0:
                raise Row21FinalFailure("zero HNF divisor")
            r = work[row][pivot_column] // divisor
            s = work[row][column] // divisor
            _add_columns(work, pivot_column, column, u, v, -s, r)
            _add_columns(transform, pivot_column, column, u, v, -s, r)
        pivot = work[row][pivot_column]
        if pivot < 0:
            _add_columns(work, pivot_column, pivot_column, -1, 0, -1, 0)
            _add_columns(transform, pivot_column, pivot_column, -1, 0, -1, 0)
            pivot = -pivot
        if pivot == 0:
            pivot_column += 1
            continue
        for column in range(pivot_column + 1, COLUMNS):
            quotient = work[row][column] // pivot
            _add_columns(work, column, pivot_column, 1, -quotient, 0, 1)
            _add_columns(transform, column, pivot_column, 1, -quotient, 0, 1)
    if pivot_column != COLUMNS - ROWS:
        raise Row21FinalFailure("relation matrix does not have full row rank")
    transformed = [entry for row in work for entry in row]
    expected = [0] * (ROWS * (COLUMNS - ROWS))
    for row in range(ROWS):
        expected.extend([])  # Retain the source-friendly row-major construction below.
    expected = [
        int(column == COLUMNS - ROWS + row)
        for row in range(ROWS)
        for column in range(COLUMNS)
    ]
    if transformed != expected:
        raise Row21FinalFailure("relation column HNF is not [0 | I]")
    flat_transform = [entry for row in transform for entry in row]
    if _matrix_product(original, ROWS, COLUMNS, flat_transform, COLUMNS) != expected:
        raise Row21FinalFailure("relation HNF transform does not replay")
    determinant = _determinant(flat_transform, COLUMNS)
    if determinant not in (-1, 1):
        raise Row21FinalFailure("relation HNF transform is not unimodular")
    right_inverse = [
        transform[row][column]
        for row in range(COLUMNS)
        for column in range(COLUMNS - ROWS, COLUMNS)
    ]
    if _matrix_product(original, ROWS, COLUMNS, right_inverse, ROWS) != _identity(ROWS):
        raise Row21FinalFailure("derived relation right inverse failed")
    return {
        "relationShape": [str(ROWS), str(COLUMNS)],
        "relationEntries": _decimals(original),
        "columnHnfShape": [str(ROWS), str(COLUMNS)],
        "columnHnf": _decimals(expected),
        "transformShape": [str(COLUMNS), str(COLUMNS)],
        "transform": _decimals(flat_transform),
        "transformDeterminant": str(determinant),
        "rightInverseShape": [str(COLUMNS), str(ROWS)],
        "rightInverse": _decimals(right_inverse),
    }


def _load_gzip_owner(
    path: str | Path, expected_schema: str, expected_sha256: str | None
) -> tuple[dict[str, Any], str]:
    compressed = Path(path).read_bytes()
    try:
        raw = gzip.decompress(compressed)
    except (OSError, EOFError) as error:
        raise Row21FinalFailure("owner is not valid gzip") from error
    digest = _sha256(raw)
    if expected_sha256 is not None and digest != expected_sha256:
        raise Row21FinalFailure("owner has the wrong authenticated SHA-256")
    owner = _strict_loads(raw)
    if owner.get("schema") != expected_schema:
        raise Row21FinalFailure("owner has the wrong schema")
    return owner, digest


def _load_prepared(path: str | Path) -> dict[str, Any]:
    raw = Path(path).read_bytes()
    if _sha256(raw) != PREPARED_FILE_SHA256:
        raise Row21FinalFailure("prepared row-21 authority changed")
    prepared = _strict_loads(raw)
    if (
        _integers(prepared.get("prep_polynomial"), "prepared polynomial", 6)
        != [36, 930, -305, -90, 0, 1]
        or _integer(prepared.get("n"), "prepared degree") != DEGREE
        or _integer(prepared.get("precision"), "prepared precision") != PRECISION
        or _integer(prepared.get("analytic_roots_of_unity"), "roots of unity") != 2
    ):
        raise Row21FinalFailure("prepared row-21 field identity changed")
    _integers(prepared.get("basis_table"), "prepared multiplication table", 125)
    return prepared


def _content_record(value: Mapping[str, Any]) -> dict[str, Any]:
    detached = json.loads(_canonical(dict(value)))
    return {"contentSha256": _sha256(_canonical(detached)), "value": detached}


def _validate_source_owners(
    prepared: Mapping[str, Any],
    factor: Mapping[str, Any],
    first_hnf: Mapping[str, Any],
    acceptance: Mapping[str, Any],
    unit: Mapping[str, Any],
    unit_sha256: str,
) -> None:
    if factor.get("authority", {}).get("preparedSha256") != PREPARED_SHA256:
        raise Row21FinalFailure("factor base is detached from the prepared field")
    if first_hnf.get("authority", {}).get("preparedSha256") != PREPARED_SHA256:
        raise Row21FinalFailure("first HNF is detached from the prepared field")
    if first_hnf.get("authority", {}).get("factorOwnerSha256") != FACTOR_SHA256:
        raise Row21FinalFailure("first HNF is detached from the factor base")
    if acceptance.get("authority", {}).get("preparedSha256") != PREPARED_SHA256:
        raise Row21FinalFailure("acceptance is detached from the prepared field")
    if acceptance.get("authority", {}).get("firstHnfOwnerSha256") != FIRST_HNF_SHA256:
        raise Row21FinalFailure("acceptance is detached from the first HNF")
    if unit.get("authority", {}).get("preparedSha256") != PREPARED_SHA256:
        raise Row21FinalFailure("unit owner is detached from the prepared field")
    if unit.get("authority", {}).get("acceptanceOwnerSha256") != ACCEPTANCE_SHA256:
        raise Row21FinalFailure("unit owner is detached from acceptance")
    if unit.get("publication") != {
        "exactUnitCount": UNIT_RANK,
        "exactInversesVerified": True,
        "exactNormsVerified": True,
        "exactRealSignsVerified": True,
        "finalAssemblyReady": True,
    }:
        raise Row21FinalFailure("unit owner did not publish three exact units")
    if unit_sha256 != UNIT_SHA256:
        raise Row21FinalFailure("unit owner has an invalid authority digest")
    if _integers(prepared["basis_table"], "multiplication table", 125)[0] != 1:
        raise Row21FinalFailure("prepared multiplication identity changed")


def _multiply_coordinates(
    left: Sequence[int], right: Sequence[int], multiplication_table: Sequence[int]
) -> list[int]:
    if len(left) != DEGREE or len(right) != DEGREE or len(multiplication_table) != 125:
        raise Row21FinalFailure("quintic multiplication has the wrong shape")
    answer = [0] * DEGREE
    for i in range(DEGREE):
        for j in range(DEGREE):
            coefficient = left[i] * right[j]
            for k in range(DEGREE):
                answer[k] += coefficient * multiplication_table[25 * i + 5 * j + k]
    return answer


def _multiplication_matrix(unit: Sequence[int], table: Sequence[int]) -> list[int]:
    # Column ``j`` is multiplication of the unit by basis vector ``j``.
    columns: list[list[int]] = []
    for j in range(DEGREE):
        basis = [int(index == j) for index in range(DEGREE)]
        columns.append(_multiply_coordinates(unit, basis, table))
    return [columns[column][row] for row in range(DEGREE) for column in range(DEGREE)]


def _normalize_units(
    unit: Mapping[str, Any], prepared: Mapping[str, Any]
) -> dict[str, Any]:
    """Validate and detach the live exact-unit owner.

    The live owner intentionally has a narrow schema: exact integral-basis
    coordinates, exact inverses, exact norms, real signs, compact transform,
    and its lattice/getfu states.  Every unit is replayed from the prepared
    multiplication table here and again by cold replay.
    """
    units_record = unit.get("units")
    if not isinstance(units_record, dict):
        raise Row21FinalFailure("unit owner has no exact unit record")
    raw_coordinates = units_record.get("exactIntegralBasis")
    raw_inverses = units_record.get("exactInverseIntegralBasis")
    if (
        not isinstance(raw_coordinates, list)
        or len(raw_coordinates) != 3
        or not isinstance(raw_inverses, list)
        or len(raw_inverses) != 3
    ):
        raise Row21FinalFailure("unit owner has the wrong exact-unit geometry")
    coordinates = [
        entry
        for row in raw_coordinates
        for entry in _integers(row, "unit coordinate row", 5)
    ]
    inverses = [
        entry for row in raw_inverses for entry in _integers(row, "unit inverse row", 5)
    ]
    norms = _integers(units_record.get("norms"), "unit norms", 3)
    raw_signs = units_record.get("realSigns")
    if not isinstance(raw_signs, list) or len(raw_signs) != 3:
        raise Row21FinalFailure("unit owner has the wrong sign geometry")
    signs = [entry for row in raw_signs for entry in _integers(row, "unit sign row", 3)]
    if any(norm not in (-1, 1) for norm in norms) or any(
        sign not in (-1, 1) for sign in signs
    ):
        raise Row21FinalFailure("unit norms and signs must be signs")
    table = _integers(prepared["basis_table"], "multiplication table", 125)
    identity = [1, 0, 0, 0, 0]
    for index in range(UNIT_RANK):
        value = coordinates[5 * index : 5 * (index + 1)]
        inverse = inverses[5 * index : 5 * (index + 1)]
        if _multiply_coordinates(value, inverse, table) != identity:
            raise Row21FinalFailure("unit inverse does not replay exactly")
        determinant = _determinant(_multiplication_matrix(value, table), DEGREE)
        if determinant != norms[index]:
            raise Row21FinalFailure("unit norm does not replay exactly")
    transforms = unit.get("transforms")
    replay = unit.get("replay")
    if not isinstance(transforms, dict) or not isinstance(replay, dict):
        raise Row21FinalFailure("unit owner has no compact provenance")
    transform = _integers(transforms.get("relationToUnit"), "unit transform", 24)
    factor = _integers(transforms.get("getfuFactor"), "getfu factor", 9)
    if _determinant(factor, 3) not in (-1, 1):
        raise Row21FinalFailure("getfu factor is not unimodular")
    return {
        "freeRank": "3",
        "coordinatesShape": ["3", "5"],
        "coordinates": _decimals(coordinates),
        "inverseShape": ["3", "5"],
        "inverses": _decimals(inverses),
        "norms": _decimals(norms),
        "realSignsShape": ["3", "3"],
        "realSigns": _decimals(signs),
        "compact": {
            "unitTransformShape": ["8", "3"],
            "unitTransform": _decimals(transform),
            "getfuFactorShape": ["3", "3"],
            "getfuFactor": _decimals(factor),
            "integerLatticeState": _decimals(
                _integers(replay.get("integerLatticeState"), "integer lattice state", 5)
            ),
            "realLatticeState": _decimals(
                _integers(replay.get("realLatticeState"), "real lattice state", 2)
            ),
            "cleanarchState": _decimals(
                _integers(replay.get("cleanarchState"), "cleanarch state", 7)
            ),
            "getfuRealLatticeState": _decimals(
                _integers(
                    replay.get("getfuRealLatticeState"),
                    "getfu real lattice state",
                    2,
                )
            ),
            "getfuState": _decimals(
                _integers(replay.get("getfuState"), "getfu state", 8)
            ),
            "outputLogs": json.loads(_canonical(replay.get("outputLogs"))),
        },
    }


def build_row21_payload(
    prepared_path: str | Path,
    factor_path: str | Path,
    first_hnf_path: str | Path,
    acceptance_path: str | Path,
    unit_path: str | Path,
) -> dict[str, Any]:
    """Build and validate the complete upstream-assumed row-21 payload."""
    prepared = _load_prepared(prepared_path)
    factor, factor_sha256 = _load_gzip_owner(factor_path, FACTOR_SCHEMA, FACTOR_SHA256)
    first_hnf, first_sha256 = _load_gzip_owner(
        first_hnf_path, FIRST_HNF_SCHEMA, FIRST_HNF_SHA256
    )
    acceptance, acceptance_sha256 = _load_gzip_owner(
        acceptance_path, ACCEPTANCE_SCHEMA, ACCEPTANCE_SHA256
    )
    unit, unit_sha256 = _load_gzip_owner(unit_path, UNIT_SCHEMA, UNIT_SHA256)
    _validate_source_owners(prepared, factor, first_hnf, acceptance, unit, unit_sha256)
    relations = first_hnf.get("relations")
    if (
        not isinstance(relations, dict)
        or relations.get("rows") != ROWS
        or relations.get("columns") != COLUMNS
    ):
        raise Row21FinalFailure("row-21 relation dimensions changed")
    relation_entries = _integers(
        relations.get("records"), "relation records", ROWS * COLUMNS
    )
    presentation = _column_hnf_witness(relation_entries)
    if acceptance.get("acceptance", {}).get("classNumber") != "1":
        raise Row21FinalFailure("live acceptance did not derive class number one")
    regulator = _integers(
        acceptance.get("acceptance", {}).get("regulator"), "accepted regulator", 3
    )
    units = _normalize_units(unit, prepared)
    torsion = {
        "order": "2",
        "generator": ["-1", "0", "0", "0", "0"],
        "inverse": ["-1", "0", "0", "0", "0"],
        "norm": "-1",
        "square": ["1", "0", "0", "0", "0"],
    }
    table = _integers(prepared["basis_table"], "multiplication table", 125)
    if _multiply_coordinates([-1, 0, 0, 0, 0], [-1, 0, 0, 0, 0], table) != [
        1,
        0,
        0,
        0,
        0,
    ]:
        raise Row21FinalFailure("torsion square does not replay")
    payload = {
        "source": {
            "pariVersion": PARI_VERSION,
            "preparedSha256": PREPARED_SHA256,
            "factorOwnerSha256": factor_sha256,
            "firstHnfOwnerSha256": first_sha256,
            "acceptanceOwnerSha256": acceptance_sha256,
            "unitOwnerSha256": unit_sha256,
            "frozenW0RuntimeInput": False,
        },
        "field": {
            "polynomial": [str(value) for value in prepared["prep_polynomial"]],
            "degree": "5",
            "signature": ["3", "1"],
            "discriminant": factor["field"]["discriminant"],
            "precision": "192",
            "multiplicationTable": _decimals(table),
        },
        "factorBase": _content_record(factor),
        "owners": {
            "firstHnf": _content_record(first_hnf),
            "acceptance": _content_record(acceptance),
            "units": _content_record(unit),
        },
        "relations": {
            "recordsShape": ["24", "32"],
            "recordsColumnMajor": [str(value) for value in relations["records"]],
            "generatorsShape": ["32", "5"],
            "generators": [str(value) for value in relations["generators"]],
            "metadataShape": ["32", "3"],
            "metadata": [str(value) for value in relations["metadata"]],
            "state": json.loads(_canonical(first_hnf["state"])),
        },
        "classGroup": {
            "classNumber": "1",
            "invariantFactors": [],
            "generatorIdeals": [],
            "generatorOrderRelations": [],
            "presentation": presentation,
            "smith": {
                "shape": ["24", "24"],
                "diagonal": _decimals(_identity(24)),
                "left": _decimals(_identity(24)),
                "right": _decimals(_identity(24)),
                "invariantFactors": [],
            },
        },
        "logarithms": {
            "firstHnf": _content_record(first_hnf["hnf"]),
            "acceptance": _content_record(acceptance["hnf"]),
            "realLogs": list(acceptance["acceptance"]["realLogs"]),
            "coordinates": list(acceptance["acceptance"]["coordinates"]),
            "relationLatticeShape": ["8", "3"],
            "relationLattice": list(acceptance["acceptance"]["relationLattice"]),
        },
        "units": {
            "torsion": torsion,
            "fundamental": units,
        },
        "regulator": {
            "value": _decimals(regulator),
            "inverseHr": list(acceptance["analytic"]["inverseHr"]),
            "analyticState": list(acceptance["analytic"]["state"]),
            "catalogState": list(acceptance["analytic"]["catalogState"]),
            "acceptanceState": list(acceptance["acceptance"]["state"]),
            "multipleState": list(acceptance["acceptance"]["multipleState"]),
            "reconstructionState": list(
                acceptance["acceptance"]["reconstructionState"]
            ),
        },
        "buchall": {
            "clg1": {
                "classNumber": "1",
                "invariantFactors": [],
                "generatorIdeals": [],
            },
            "clg2": {
                "components": ["Ur", "ga", "GD", "Ge", "M1", "M2"],
                "values": [[], [], [], [], [], []],
            },
            "unitRank": "3",
            "torsionOrder": "2",
            "terminalState": ["0", "0", "0"],
        },
        "assumptions": list(_ASSUMPTIONS),
        "terminal": {
            "status": "published-upstream-assumed-buchall-end-v1",
            "correspondenceComplete": True,
            "buchallEndComplete": True,
            "phase5CompleteForRow21": True,
            "publicComplete": False,
            "atomic": True,
            "idempotent": True,
            "omittedLazyMaterializations": ["makeunits", "makematal", "makecycgen"],
            "remainingBoundary": [
                "independent rigorous regulator enclosure",
                "independent class/unit saturation certificate",
                "unconditional or independently proved factor-base bound",
                "general-field integration beyond this authenticated row",
            ],
        },
    }
    _validate_payload(payload)
    return payload


def _validate_content_record(value: Any, name: str) -> dict[str, Any]:
    record = _exact_dict(value, {"contentSha256", "value"}, name)
    if record["contentSha256"] != _sha256(_canonical(record["value"])):
        raise Row21FinalFailure(name + " content hash changed")
    if not isinstance(record["value"], dict):
        raise Row21FinalFailure(name + " value must be an object")
    return record["value"]


def _validate_payload(payload: Any) -> None:
    value = _exact_dict(
        payload,
        {
            "source",
            "field",
            "factorBase",
            "owners",
            "relations",
            "classGroup",
            "logarithms",
            "units",
            "regulator",
            "buchall",
            "assumptions",
            "terminal",
        },
        "row-21 payload",
    )
    source = _exact_dict(
        value["source"],
        {
            "pariVersion",
            "preparedSha256",
            "factorOwnerSha256",
            "firstHnfOwnerSha256",
            "acceptanceOwnerSha256",
            "unitOwnerSha256",
            "frozenW0RuntimeInput",
        },
        "source",
    )
    if (
        source["pariVersion"] != PARI_VERSION
        or source["preparedSha256"] != PREPARED_SHA256
        or source["factorOwnerSha256"] != FACTOR_SHA256
        or source["firstHnfOwnerSha256"] != FIRST_HNF_SHA256
        or source["acceptanceOwnerSha256"] != ACCEPTANCE_SHA256
        or source["frozenW0RuntimeInput"] is not False
    ):
        raise Row21FinalFailure("source authority changed")
    if (
        not isinstance(source["unitOwnerSha256"], str)
        or len(source["unitOwnerSha256"]) != 64
    ):
        raise Row21FinalFailure("unit owner authority changed")
    field = _exact_dict(
        value["field"],
        {
            "polynomial",
            "degree",
            "signature",
            "discriminant",
            "precision",
            "multiplicationTable",
        },
        "field",
    )
    if (
        _integers(field["polynomial"], "field polynomial", 6)
        != [36, 930, -305, -90, 0, 1]
        or field["degree"] != "5"
        or field["signature"] != ["3", "1"]
        or field["discriminant"] != "-1009349859375"
        or field["precision"] != "192"
    ):
        raise Row21FinalFailure("field identity changed")
    table = _integers(field["multiplicationTable"], "multiplication table", 125)
    factor = _validate_content_record(value["factorBase"], "factor base")
    if value["factorBase"]["contentSha256"] != FACTOR_CONTENT_SHA256 or (
        factor.get("schema") != FACTOR_SCHEMA
        or factor.get("authority", {}).get("preparedSha256") != PREPARED_SHA256
    ):
        raise Row21FinalFailure("factor-base authority changed")
    fb = factor.get("factorBase", {})
    if (
        len(fb.get("ideals", [])) != ROWS
        or any(len(ideal) != 25 for ideal in fb["ideals"])
        or len(fb.get("norms", [])) != ROWS
        or len(fb.get("permutation", [])) != ROWS
    ):
        raise Row21FinalFailure("factor-base logical lengths changed")
    owners = _exact_dict(
        value["owners"], {"firstHnf", "acceptance", "units"}, "source owners"
    )
    first_owner = _validate_content_record(owners["firstHnf"], "first-HNF owner")
    acceptance_owner = _validate_content_record(
        owners["acceptance"], "acceptance owner"
    )
    unit_owner = _validate_content_record(owners["units"], "unit owner")
    if (
        owners["firstHnf"]["contentSha256"] != FIRST_HNF_CONTENT_SHA256
        or owners["acceptance"]["contentSha256"] != ACCEPTANCE_CONTENT_SHA256
        or owners["units"]["contentSha256"] != UNIT_CONTENT_SHA256
        or first_owner.get("schema") != FIRST_HNF_SCHEMA
        or acceptance_owner.get("schema") != ACCEPTANCE_SCHEMA
        or unit_owner.get("schema") != UNIT_SCHEMA
    ):
        raise Row21FinalFailure("retained source owner changed")
    relations = _exact_dict(
        value["relations"],
        {
            "recordsShape",
            "recordsColumnMajor",
            "generatorsShape",
            "generators",
            "metadataShape",
            "metadata",
            "state",
        },
        "relations",
    )
    if (
        relations["recordsShape"] != ["24", "32"]
        or relations["generatorsShape"] != ["32", "5"]
        or relations["metadataShape"] != ["32", "3"]
    ):
        raise Row21FinalFailure("retained relation shapes changed")
    records = _integers(relations["recordsColumnMajor"], "relations", 768)
    _integers(relations["generators"], "relation generators", 160)
    _integers(relations["metadata"], "relation metadata", 96)
    if not isinstance(relations["state"], dict):
        raise Row21FinalFailure("relation state is missing")
    if (
        first_owner.get("relations", {}).get("records")
        != relations["recordsColumnMajor"]
        or first_owner.get("relations", {}).get("generators") != relations["generators"]
        or first_owner.get("relations", {}).get("metadata") != relations["metadata"]
        or first_owner.get("state") != relations["state"]
    ):
        raise Row21FinalFailure("retained relation projection changed")
    class_group = _exact_dict(
        value["classGroup"],
        {
            "classNumber",
            "invariantFactors",
            "generatorIdeals",
            "generatorOrderRelations",
            "presentation",
            "smith",
        },
        "class group",
    )
    if (
        class_group["classNumber"] != "1"
        or class_group["invariantFactors"] != []
        or class_group["generatorIdeals"] != []
        or class_group["generatorOrderRelations"] != []
    ):
        raise Row21FinalFailure("trivial class-group result changed")
    expected_presentation = _column_hnf_witness(records)
    if class_group["presentation"] != expected_presentation:
        raise Row21FinalFailure("trivial relation presentation changed")
    smith = _exact_dict(
        class_group["smith"],
        {"shape", "diagonal", "left", "right", "invariantFactors"},
        "Smith state",
    )
    identity = _identity(24)
    if smith != {
        "shape": ["24", "24"],
        "diagonal": _decimals(identity),
        "left": _decimals(identity),
        "right": _decimals(identity),
        "invariantFactors": [],
    }:
        raise Row21FinalFailure("trivial Smith state changed")
    logs = _exact_dict(
        value["logarithms"],
        {
            "firstHnf",
            "acceptance",
            "realLogs",
            "coordinates",
            "relationLatticeShape",
            "relationLattice",
        },
        "logarithms",
    )
    first_logs = _validate_content_record(logs["firstHnf"], "first-HNF logs")
    acceptance_logs = _validate_content_record(logs["acceptance"], "acceptance logs")
    shared_hnf_keys = {"H", "dep", "B", "C", "exactC", "permutation"}
    if set(acceptance_logs) != shared_hnf_keys or any(
        first_logs.get(key) != acceptance_logs[key] for key in shared_hnf_keys
    ):
        raise Row21FinalFailure("retained HNF logarithms disagree")
    if (
        first_owner.get("hnf") != first_logs
        or acceptance_owner.get("hnf") != acceptance_logs
        or acceptance_owner.get("acceptance", {}).get("realLogs") != logs["realLogs"]
        or acceptance_owner.get("acceptance", {}).get("coordinates")
        != logs["coordinates"]
        or acceptance_owner.get("acceptance", {}).get("relationLattice")
        != logs["relationLattice"]
    ):
        raise Row21FinalFailure("retained logarithm projection changed")
    if logs["relationLatticeShape"] != ["8", "3"]:
        raise Row21FinalFailure("relation lattice shape changed")
    _integers(logs["realLogs"], "real logs", 96)
    _integers(logs["coordinates"], "acceptance coordinates", 72)
    _integers(logs["relationLattice"], "relation lattice", 24)
    units = _exact_dict(value["units"], {"torsion", "fundamental"}, "units")
    torsion = _exact_dict(
        units["torsion"], {"order", "generator", "inverse", "norm", "square"}, "torsion"
    )
    if torsion != {
        "order": "2",
        "generator": ["-1", "0", "0", "0", "0"],
        "inverse": ["-1", "0", "0", "0", "0"],
        "norm": "-1",
        "square": ["1", "0", "0", "0", "0"],
    }:
        raise Row21FinalFailure("torsion evidence changed")
    fundamental = _exact_dict(
        units["fundamental"],
        {
            "freeRank",
            "coordinatesShape",
            "coordinates",
            "inverseShape",
            "inverses",
            "norms",
            "realSignsShape",
            "realSigns",
            "compact",
        },
        "fundamental units",
    )
    if (
        fundamental["freeRank"] != "3"
        or fundamental["coordinatesShape"] != ["3", "5"]
        or fundamental["inverseShape"] != ["3", "5"]
        or fundamental["realSignsShape"] != ["3", "3"]
    ):
        raise Row21FinalFailure("fundamental-unit shapes changed")
    coordinates = _integers(fundamental["coordinates"], "unit coordinates", 15)
    inverses = _integers(fundamental["inverses"], "unit inverses", 15)
    norms = _integers(fundamental["norms"], "unit norms", 3)
    signs = _integers(fundamental["realSigns"], "unit signs", 9)
    if any(sign not in (-1, 1) for sign in signs):
        raise Row21FinalFailure("fundamental-unit signs changed")
    for index in range(3):
        unit = coordinates[5 * index : 5 * (index + 1)]
        inverse = inverses[5 * index : 5 * (index + 1)]
        if _multiply_coordinates(unit, inverse, table) != [1, 0, 0, 0, 0]:
            raise Row21FinalFailure("detached unit inverse failed")
        if _determinant(_multiplication_matrix(unit, table), 5) != norms[index]:
            raise Row21FinalFailure("detached unit norm failed")
    compact = _exact_dict(
        fundamental["compact"],
        {
            "unitTransformShape",
            "unitTransform",
            "getfuFactorShape",
            "getfuFactor",
            "integerLatticeState",
            "realLatticeState",
            "cleanarchState",
            "getfuRealLatticeState",
            "getfuState",
            "outputLogs",
        },
        "compact units",
    )
    if compact["unitTransformShape"] != ["8", "3"] or compact["getfuFactorShape"] != [
        "3",
        "3",
    ]:
        raise Row21FinalFailure("compact-unit shape changed")
    _integers(compact["unitTransform"], "unit transform", 24)
    factor_matrix = _integers(compact["getfuFactor"], "getfu factor", 9)
    if _determinant(factor_matrix, 3) not in (-1, 1):
        raise Row21FinalFailure("detached getfu factor is not unimodular")
    _integers(compact["integerLatticeState"], "integer lattice state", 5)
    _integers(compact["realLatticeState"], "real lattice state", 2)
    _integers(compact["cleanarchState"], "cleanarch state", 7)
    _integers(compact["getfuRealLatticeState"], "getfu real lattice state", 2)
    getfu_state = _integers(compact["getfuState"], "getfu state", 8)
    if getfu_state[0] != 0 or getfu_state[6:] != [3, 1]:
        raise Row21FinalFailure("detached getfu state is not terminal")
    output_logs = _exact_dict(
        compact["outputLogs"], {"real", "imaginary"}, "unit output logs"
    )
    _integers(output_logs["real"], "unit real logs", 36)
    _integers(output_logs["imaginary"], "unit imaginary logs", 36)
    expected_fundamental = _normalize_units(unit_owner, {"basis_table": table})
    if fundamental != expected_fundamental:
        raise Row21FinalFailure("retained unit projection changed")
    regulator = _exact_dict(
        value["regulator"],
        {
            "value",
            "inverseHr",
            "analyticState",
            "catalogState",
            "acceptanceState",
            "multipleState",
            "reconstructionState",
        },
        "regulator",
    )
    if _integers(regulator["value"], "regulator value", 3) != [
        5992046333468088822741755840508858568018241354821770564346,
        192,
        16,
    ]:
        raise Row21FinalFailure("accepted regulator changed")
    for name in (
        "inverseHr",
        "analyticState",
        "catalogState",
        "acceptanceState",
        "multipleState",
        "reconstructionState",
    ):
        _integers(regulator[name], name)
    acceptance_record = acceptance_owner.get("acceptance", {})
    analytic_record = acceptance_owner.get("analytic", {})
    if (
        acceptance_record.get("regulator") != regulator["value"]
        or analytic_record.get("inverseHr") != regulator["inverseHr"]
        or analytic_record.get("state") != regulator["analyticState"]
        or analytic_record.get("catalogState") != regulator["catalogState"]
        or acceptance_record.get("state") != regulator["acceptanceState"]
        or acceptance_record.get("multipleState") != regulator["multipleState"]
        or acceptance_record.get("reconstructionState")
        != regulator["reconstructionState"]
    ):
        raise Row21FinalFailure("retained regulator projection changed")
    buchall = _exact_dict(
        value["buchall"],
        {"clg1", "clg2", "unitRank", "torsionOrder", "terminalState"},
        "buchall state",
    )
    if buchall != {
        "clg1": {
            "classNumber": "1",
            "invariantFactors": [],
            "generatorIdeals": [],
        },
        "clg2": {
            "components": ["Ur", "ga", "GD", "Ge", "M1", "M2"],
            "values": [[], [], [], [], [], []],
        },
        "unitRank": "3",
        "torsionOrder": "2",
        "terminalState": ["0", "0", "0"],
    }:
        raise Row21FinalFailure("buchall-end state changed")
    if value["assumptions"] != list(_ASSUMPTIONS):
        raise Row21FinalFailure("assumption record changed")
    terminal = _exact_dict(
        value["terminal"],
        {
            "status",
            "correspondenceComplete",
            "buchallEndComplete",
            "phase5CompleteForRow21",
            "publicComplete",
            "atomic",
            "idempotent",
            "omittedLazyMaterializations",
            "remainingBoundary",
        },
        "terminal",
    )
    if terminal != {
        "status": "published-upstream-assumed-buchall-end-v1",
        "correspondenceComplete": True,
        "buchallEndComplete": True,
        "phase5CompleteForRow21": True,
        "publicComplete": False,
        "atomic": True,
        "idempotent": True,
        "omittedLazyMaterializations": ["makeunits", "makematal", "makecycgen"],
        "remainingBoundary": [
            "independent rigorous regulator enclosure",
            "independent class/unit saturation certificate",
            "unconditional or independently proved factor-base bound",
            "general-field integration beyond this authenticated row",
        ],
    }:
        raise Row21FinalFailure("terminal status changed")


def _envelope(payload: Mapping[str, Any]) -> tuple[bytes, str]:
    detached = json.loads(_canonical(dict(payload)))
    _validate_payload(detached)
    payload_raw = _canonical(detached)
    payload_sha256 = _sha256(payload_raw)
    raw = _canonical(
        {"schema": SCHEMA, "payloadSha256": payload_sha256, "payload": detached}
    )
    return raw, _sha256(raw)


def cold_replay_row21(
    value: ImmutableRow21Result | bytes | str,
    authority: Row21ReplayAuthority = Row21ReplayAuthority(),
) -> ImmutableRow21Result:
    raw = value.canonical_json if isinstance(value, ImmutableRow21Result) else value
    envelope = _exact_dict(
        _strict_loads(raw), {"schema", "payloadSha256", "payload"}, "row-21 envelope"
    )
    if envelope["schema"] != SCHEMA:
        raise Row21FinalFailure("row-21 result schema changed")
    payload_raw = _canonical(envelope["payload"])
    if envelope["payloadSha256"] != _sha256(payload_raw):
        raise Row21FinalFailure("row-21 payload hash changed")
    _validate_payload(envelope["payload"])
    canonical = _canonical(envelope)
    if canonical != (raw.encode("ascii") if isinstance(raw, str) else raw):
        raise Row21FinalFailure("row-21 result is not canonical JSON")
    digest = _sha256(canonical)
    if authority.expected_sha256 is not None and digest != authority.expected_sha256:
        raise Row21FinalFailure("row-21 publication authority changed")
    return ImmutableRow21Result(canonical, digest)


class AtomicRow21Publisher:
    """Validate before publication; repeated equal publication is idempotent."""

    def __init__(self, authority: Row21ReplayAuthority = Row21ReplayAuthority()):
        self._authority = authority
        self._lock = Lock()
        self._current: ImmutableRow21Result | None = None

    def publish(self, payload: Mapping[str, Any]) -> ImmutableRow21Result:
        raw, digest = _envelope(payload)
        candidate = cold_replay_row21(raw, self._authority)
        if candidate.sha256 != digest:
            raise Row21FinalFailure("row-21 envelope digest changed")
        with self._lock:
            if self._current is None:
                self._current = candidate
            elif self._current.canonical_json != candidate.canonical_json:
                raise Row21PublicationConflict("conflicting row-21 publication")
            return self._current

    def current(self) -> ImmutableRow21Result | None:
        with self._lock:
            return self._current

    def publish_file(self, directory: str | Path, payload: Mapping[str, Any]) -> Path:
        result = self.publish(payload)
        target_directory = Path(directory)
        target_directory.mkdir(parents=True, exist_ok=True)
        target = target_directory / f"row21-final-{result.sha256}.json.gz"
        compressed = gzip.compress(result.canonical_json, mtime=0)
        if target.exists():
            if target.read_bytes() != compressed:
                raise Row21PublicationConflict("existing row-21 artifact conflicts")
            return target
        temporary = target.with_name(f".{target.name}.{os.getpid()}.tmp")
        try:
            with temporary.open("xb") as handle:
                handle.write(compressed)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temporary, target)
        finally:
            if temporary.exists():
                temporary.unlink()
        return target


__all__ = [
    "ACCEPTANCE_SHA256",
    "AtomicRow21Publisher",
    "FACTOR_SHA256",
    "FIRST_HNF_SHA256",
    "ImmutableRow21Result",
    "PREPARED_SHA256",
    "Row21FinalFailure",
    "Row21PublicationConflict",
    "Row21ReplayAuthority",
    "SCHEMA",
    "UNIT_SCHEMA",
    "UNIT_SHA256",
    "build_row21_payload",
    "cold_replay_row21",
]
