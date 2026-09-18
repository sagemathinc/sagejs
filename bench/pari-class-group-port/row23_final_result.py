"""Immutable row-23 `buchall_end`-equivalent result and cold replay.

This experiment-only composer joins authenticated prepared, factor-base,
relation/HNF, analytic-acceptance, cyclic-class, and exact-unit owners.  It
retains the complete active relation/logarithm/transformation state and
replays every exact identity that is currently available, including the
degree-five reduction and expanded ideal-power correspondence.  It
intentionally keeps `publicComplete` false because PARI's analytic
assumptions are inherited and this is a row-specific internal result.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence as SequenceABC
from dataclasses import dataclass
import gzip
import hashlib
import importlib
import json
import os
from pathlib import Path
import sys
from threading import Lock
from typing import Any, Sequence


SCHEMA = "sagejs.pari-class-group/row23-final-buchall-end-v1"
FACTOR_SCHEMA = "sagejs.pari-class-group/row23-prepared-factor-base-v1"
RELATION_SCHEMA = "sagejs.pari-class-group/row23-live-relation-hnf-owner-v1"
ACCEPTANCE_SCHEMA = "sagejs.pari-class-group/row23-live-acceptance-owner-v1"
CLASS_SCHEMA = "sagejs.pari-class-group/row23-cyclic-class-witness-v1"
CORRESPONDENCE_SCHEMA = "sagejs.pari-class-group/row23-degree5-correspondence-v1"
UNIT_SCHEMA = "sagejs.pari-class-group/row23-live-exact-unit-owner-v2"

PREPARED_SHA256 = "0bb8aa6665e3cfdb5184f53cb4ded97655007da9d08e9969c052f81a3640a299"
PREPARED_FILE_SHA256 = (
    "1d342f14fe9f2cac7a49e75727952a65401f8af01f7d754dd256372c2f7ee154"
)
FACTOR_SHA256 = "b4fa7209eb9fcd86438dc8d1f0fac9d194a32535f612de97ed605da6ca2bf439"
CLASS_SHA256 = "beafd37a044a22ae3fdb8996993901b69aee39dec2095d444d88596344a69b50"
CORRESPONDENCE_SHA256 = (
    "0dae599f70d46e1de77804b8a47c277d20114f31555f1c7db68587c7b78dd68b"
)

# Filled only after deterministic live owners are published.  Keeping these
# as named authorities makes any producer change fail closed rather than
# quietly changing a supposedly immutable terminal result.
RELATION_SHA256 = "2d6fea4e7b2b5bdc4bf7adc6ca198f4a09072446ff405c774583e7d97e54761f"
ACCEPTANCE_SHA256 = "eeaa34177b556abd306c1f2e84fe1a09aeac2cb6b418dcca0dd199dbfb1bfb33"
UNIT_SHA256 = "54dd682a216054b5278806ba1f943f6ca94407ffe0d3b4c1e05e6111e78a2712"
FACTOR_CONTENT_SHA256 = (
    "a7970bdcaee0fa2639ebc0c1ab50871f993f88816ab1e7d911bfe6790e65a820"
)
RELATION_CONTENT_SHA256 = (
    "49331c1db4f44bc7182cf32b7645dfd4412f5bfcda55260f8d3a91bfadc7b15d"
)
ACCEPTANCE_CONTENT_SHA256 = (
    "5a45b78d3a62430981efb058c548331208cd3dfa46bf120bbfb9618e4b9e5317"
)
CLASS_CONTENT_SHA256 = (
    "aad597324c8d4df835dc1cb8c3b0b956779a1f3c750eaf2b3ee4e60df09e3b79"
)
CORRESPONDENCE_CONTENT_SHA256 = (
    "ced5bd8586ae40c876777617d25b61bf3a26c9ab7854e131943e6e12533a123b"
)
UNIT_CONTENT_SHA256 = "c10c537eb61b82a578867e3c7f2be00de4fc875b12db7d265e51045a1a4ab8b7"

PARI_VERSION = "2.17.4"
DEGREE = 5
FACTOR_ROWS = 31
RELATION_COLUMNS = 40
LOG_COLUMNS = 9
UNIT_RANK = 4
PRECISION = 256
_MAX_BYTES = 96 * 1024 * 1024
_MAX_VECTOR = 2_000_000
_ASSUMPTIONS = (
    "GRH-dependent factor-base completeness inherited from PARI 2.17.4",
    "PARI 2.17.4 heuristic bounds and retry decisions are assumed correct",
    "PARI 2.17.4 floating analytic and regulator acceptance is assumed correct",
)


class Row23FinalFailure(ValueError):
    """A row-23 owner or detached terminal result failed closed."""


class Row23PublicationConflict(RuntimeError):
    """A different terminal row-23 result was already published."""


@dataclass(frozen=True)
class FreshRow23UnitAuthority:
    """Exact same-run unit-owner authority supplied by the transaction host."""

    expected_owner_sha256: str
    expected_content_sha256: str

    def __post_init__(self) -> None:
        for value in (self.expected_owner_sha256, self.expected_content_sha256):
            if len(value) != 64 or any(
                char not in "0123456789abcdef" for char in value
            ):
                raise Row23FinalFailure("fresh row-23 unit authority is not a digest")


@dataclass(frozen=True)
class FreshRow23CorrespondenceAuthority:
    """Exact same-run correspondence authority supplied by the transaction host."""

    expected_owner_sha256: str
    expected_content_sha256: str

    def __post_init__(self) -> None:
        for value in (self.expected_owner_sha256, self.expected_content_sha256):
            if len(value) != 64 or any(
                char not in "0123456789abcdef" for char in value
            ):
                raise Row23FinalFailure(
                    "fresh row-23 correspondence authority is not a digest"
                )


@dataclass(frozen=True)
class Row23ReplayAuthority:
    expected_sha256: str | None = None
    correspondence_authority: FreshRow23CorrespondenceAuthority | None = None
    unit_authority: FreshRow23UnitAuthority | None = None


@dataclass(frozen=True)
class ImmutableRow23Result:
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
        raise Row23FinalFailure("row-23 result is not canonical JSON") from error
    if len(raw) > _MAX_BYTES:
        raise Row23FinalFailure("row-23 result exceeds its byte bound")
    return raw


def _strict_loads(raw: bytes | str) -> dict[str, Any]:
    if not isinstance(raw, (bytes, str)) or len(raw) > _MAX_BYTES:
        raise Row23FinalFailure("row-23 input exceeds its byte bound")

    def no_duplicates(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
        answer: dict[str, Any] = {}
        for key, value in pairs:
            if key in answer:
                raise Row23FinalFailure("duplicate row-23 JSON key: " + key)
            answer[key] = value
        return answer

    try:
        value = json.loads(raw, object_pairs_hook=no_duplicates)
    except (TypeError, ValueError, UnicodeError) as error:
        raise Row23FinalFailure("row-23 input is not strict JSON") from error
    if not isinstance(value, dict):
        raise Row23FinalFailure("row-23 input must be an object")
    return value


def _exact_dict(value: Any, fields: set[str], name: str) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != fields:
        raise Row23FinalFailure(name + " has the wrong fields")
    return value


def _integer(value: Any, name: str) -> int:
    if isinstance(value, bool) or not isinstance(value, (str, int)):
        raise Row23FinalFailure(name + " is not an exact integer")
    try:
        answer = int(value)
    except (ValueError, OverflowError) as error:
        raise Row23FinalFailure(name + " is not an exact integer") from error
    if str(answer) != str(value):
        raise Row23FinalFailure(name + " is not a canonical integer")
    return answer


def _integers(value: Any, name: str, length: int | None = None) -> list[int]:
    if (
        isinstance(value, (str, bytes))
        or not isinstance(value, SequenceABC)
        or len(value) > _MAX_VECTOR
        or (length is not None and len(value) != length)
    ):
        raise Row23FinalFailure(name + " has the wrong bounded length")
    return [_integer(entry, name + " entry") for entry in value]


def _decimals(values: Sequence[int]) -> list[str]:
    return [str(value) for value in values]


def _integer_vector_digest(values: Sequence[int]) -> str:
    return _sha256("\n".join(str(value) for value in values).encode("ascii"))


def _packed_cleanarch_quintic(source: Sequence[int]) -> list[int]:
    """Replay PARI `cleanarch` for one totally-real quintic column."""
    values = _integers(source, "raw class logarithm", 35)
    for row in range(5):
        at = 7 * row
        kind = values[at]
        if kind not in (1, 2) or values[at + 2] < 64:
            raise Row23FinalFailure("raw class logarithm is not normalized")
        if kind == 1 and values[at + 4 : at + 7] != [0, -1, 0]:
            raise Row23FinalFailure("real class logarithm has imaginary residue")

    # These are the same ordinary-Python fallbacks used by the source-
    # transparent native kernels.  Add the repository's explicit Python
    # library root only for this detached benchmark replay.
    library = str(Path(__file__).resolve().parents[2] / "src" / "lib")
    inserted = library not in sys.path
    if inserted:
        sys.path.insert(0, library)
    try:
        short = importlib.import_module("bench.pari-class-group-port.short_product")
        division = importlib.import_module("bench.pari-class-group-port.real_division")
        integer_product = importlib.import_module(
            "bench.pari-class-group-port.integer_real_product"
        )
        pi_module = importlib.import_module("bench.pari-class-group-port.pi_constant")
    finally:
        if inserted:
            sys.path.remove(library)

    cache = [0] * 3
    a = [0] * 64
    b = [0] * 64
    p = [0] * 64
    q = [0] * 64
    stack = [0] * 128
    pm, pp, pe = pi_module.pari_pi_constant(256, cache, a, b, p, q, stack)
    one = 1 << (pp - 1)
    im, ip, ie = division.pari_real_division(one, pp, 0, pm, pp, pe)
    ie = -3
    pi2m, pi2p, pi2e = pm, pp, pe + 1

    sm, sp, se = values[1:4]
    for row in range(1, 5):
        at = 7 * row
        sm, sp, se = short.pari_signed_real_sum(
            sm, sp, se, values[at + 1], values[at + 2], values[at + 3]
        )
    sm, sp, se = short.pari_real_integer_division(-5, sm, sp, se)
    answer: list[int] = []
    for row in range(5):
        at = 7 * row
        rm, rp, re = short.pari_signed_real_sum(
            values[at + 1], values[at + 2], values[at + 3], sm, sp, se
        )
        xm, xp, xe = values[at + 4 : at + 7]
        if xm != 0:
            qm, qp, qe = short.pari_short_product(xm, xp, xe, im, ip, ie)
            if qe >= 0 and ((qe + 64) // 64) * 64 > qp:
                raise Row23FinalFailure("class cleanarch requires a precision retry")
            shift = qp - qe - 1
            quotient = qm // (1 << shift) if shift >= 0 else qm << -shift
            if quotient != 0:
                tm, tp, te = integer_product.pari_integer_real_product(
                    quotient, pi2m, pi2p, pi2e
                )
                xm, xp, xe = short.pari_signed_real_sum(xm, xp, xe, -tm, tp, te)
        answer.extend(
            [
                1 if xm == 0 else 2,
                rm,
                rp,
                re,
                xm,
                -1 if xm == 0 else xp,
                0 if xm == 0 else xe,
            ]
        )
    return answer


def _content_record(value: Mapping[str, Any]) -> dict[str, Any]:
    detached = json.loads(_canonical(dict(value)))
    return {"contentSha256": _sha256(_canonical(detached)), "value": detached}


def _validate_content_record(value: Any, name: str) -> dict[str, Any]:
    record = _exact_dict(value, {"contentSha256", "value"}, name)
    if record["contentSha256"] != _sha256(_canonical(record["value"])):
        raise Row23FinalFailure(name + " content hash changed")
    if not isinstance(record["value"], dict):
        raise Row23FinalFailure(name + " value must be an object")
    return record["value"]


def _load_gzip_owner(
    path: str | Path, expected_schema: str, expected_sha256: str
) -> tuple[dict[str, Any], str]:
    try:
        raw = gzip.decompress(Path(path).read_bytes())
    except (OSError, EOFError) as error:
        raise Row23FinalFailure("row-23 owner is not valid gzip") from error
    digest = _sha256(raw)
    if digest != expected_sha256:
        raise Row23FinalFailure("row-23 owner authority changed")
    owner = _strict_loads(raw)
    if owner.get("schema") != expected_schema:
        raise Row23FinalFailure("row-23 owner schema changed")
    return owner, digest


def _load_prepared(path: str | Path) -> dict[str, Any]:
    raw = Path(path).read_bytes()
    if _sha256(raw) != PREPARED_FILE_SHA256:
        raise Row23FinalFailure("prepared row-23 authority changed")
    prepared = _strict_loads(raw)
    if (
        _integers(prepared.get("prep_polynomial"), "prepared polynomial", 6)
        != [341, -970, 772, -141, -2, 1]
        or _integer(prepared.get("n"), "degree") != DEGREE
        or _integer(prepared.get("analytic_discriminant"), "discriminant")
        != 1002836007889
        or _integer(prepared.get("analytic_roots_of_unity"), "torsion order") != 2
    ):
        raise Row23FinalFailure("prepared row-23 field identity changed")
    _integers(prepared.get("basis_table"), "multiplication table", 125)
    return prepared


def _multiply_coordinates(
    left: Sequence[int], right: Sequence[int], multiplication_table: Sequence[int]
) -> list[int]:
    if len(left) != DEGREE or len(right) != DEGREE or len(multiplication_table) != 125:
        raise Row23FinalFailure("quintic multiplication has the wrong shape")
    answer = [0] * DEGREE
    for i in range(DEGREE):
        for j in range(DEGREE):
            coefficient = left[i] * right[j]
            for k in range(DEGREE):
                answer[k] += coefficient * multiplication_table[25 * i + 5 * j + k]
    return answer


def _multiplication_matrix(unit: Sequence[int], table: Sequence[int]) -> list[int]:
    columns = [
        _multiply_coordinates(unit, [int(index == j) for index in range(DEGREE)], table)
        for j in range(DEGREE)
    ]
    return [columns[column][row] for row in range(DEGREE) for column in range(DEGREE)]


def _determinant(entries: Sequence[int], size: int) -> int:
    if len(entries) != size * size or size < 0 or size > 64:
        raise Row23FinalFailure("determinant input has the wrong shape")
    if size == 0:
        return 1
    work = [list(entries[row * size : (row + 1) * size]) for row in range(size)]
    previous = 1
    sign = 1
    for pivot_index in range(size - 1):
        pivot_row = next(
            (row for row in range(pivot_index, size) if work[row][pivot_index]), None
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
                    raise Row23FinalFailure("Bareiss division was not exact")
                work[row][column] = numerator // previous
        previous = pivot
    return sign * work[-1][-1]


def _matrix_product(
    left: Sequence[int], rows: int, inner: int, right: Sequence[int], columns: int
) -> list[int]:
    if len(left) != rows * inner or len(right) != inner * columns:
        raise Row23FinalFailure("matrix product has the wrong shape")
    return [
        sum(left[row * inner + k] * right[k * columns + column] for k in range(inner))
        for row in range(rows)
        for column in range(columns)
    ]


def _column_major_product(
    left: Sequence[int], rows: int, inner: int, right: Sequence[int], columns: int
) -> list[int]:
    if len(left) != rows * inner or len(right) != inner * columns:
        raise Row23FinalFailure("column-major matrix product has the wrong shape")
    return [
        sum(left[k * rows + row] * right[column * inner + k] for k in range(inner))
        for column in range(columns)
        for row in range(rows)
    ]


def _normalize_units(
    unit: Mapping[str, Any], prepared: Mapping[str, Any]
) -> dict[str, Any]:
    if unit.get("field") != "5.5.1002836007889.1" or unit.get("classNumber") != "6":
        raise Row23FinalFailure("unit owner field identity changed")
    if unit.get("unitRank") != UNIT_RANK:
        raise Row23FinalFailure("unit owner rank changed")
    coordinates_rows = unit.get("unitsIntegralBasis")
    inverse_rows = unit.get("exactInversesIntegralBasis")
    sign_rows = unit.get("exactRealSigns")
    if (
        not isinstance(coordinates_rows, list)
        or len(coordinates_rows) != UNIT_RANK
        or not isinstance(inverse_rows, list)
        or len(inverse_rows) != UNIT_RANK
        or not isinstance(sign_rows, list)
        or len(sign_rows) != UNIT_RANK
    ):
        raise Row23FinalFailure("unit owner has incomplete exact units")
    coordinates = [
        value
        for row in coordinates_rows
        for value in _integers(row, "unit coordinates", DEGREE)
    ]
    inverses = [
        value
        for row in inverse_rows
        for value in _integers(row, "unit inverse coordinates", DEGREE)
    ]
    signs = [
        value for row in sign_rows for value in _integers(row, "unit real signs", 5)
    ]
    norms = _integers(unit.get("exactNorms"), "unit norms", UNIT_RANK)
    if any(sign not in (-1, 1) for sign in signs) or any(
        norm not in (-1, 1) for norm in norms
    ):
        raise Row23FinalFailure("unit sign data changed")
    table = _integers(prepared["basis_table"], "multiplication table", 125)
    for index in range(UNIT_RANK):
        value = coordinates[DEGREE * index : DEGREE * (index + 1)]
        inverse = inverses[DEGREE * index : DEGREE * (index + 1)]
        if _multiply_coordinates(value, inverse, table) != [1, 0, 0, 0, 0]:
            raise Row23FinalFailure("unit inverse does not replay exactly")
        if _determinant(_multiplication_matrix(value, table), DEGREE) != norms[index]:
            raise Row23FinalFailure("unit norm does not replay exactly")
    relation_to_unit = _integers(
        unit.get("relationToUnit"), "relation-to-unit transform", 36
    )
    factor = _integers(unit.get("getfuFactor"), "getfu factor", 16)
    output_logs = _integers(unit.get("outputPackedLogs"), "unit output logs", 140)
    if _determinant(factor, UNIT_RANK) not in (-1, 1):
        raise Row23FinalFailure("getfu factor is not unimodular")
    rank_states = _exact_dict(
        unit.get("rankFourStates"),
        {"integer", "real", "cleanarch", "privateGetfuReal"},
        "rank-four states",
    )
    state = _integers(unit.get("state"), "getfu state", 6)
    solve_state = _integers(unit.get("solveState"), "getfu solve state", 5)
    if state[:4] != [0, 20, 0, 4] or solve_state[:3] != [0, 5, 4]:
        raise Row23FinalFailure("getfu replay state is not terminal")
    return {
        "freeRank": "4",
        "coordinatesShape": ["4", "5"],
        "coordinates": _decimals(coordinates),
        "inverseShape": ["4", "5"],
        "inverses": _decimals(inverses),
        "norms": _decimals(norms),
        "realSignsShape": ["4", "5"],
        "realSigns": _decimals(signs),
        "compact": {
            "unitTransformShape": ["4", "9"],
            "unitTransform": _decimals(relation_to_unit),
            "getfuFactorShape": ["4", "4"],
            "getfuFactor": _decimals(factor),
            "outputPackedLogsShape": ["4", "5", "7"],
            "outputPackedLogs": _decimals(output_logs),
            "integerLatticeState": _decimals(
                _integers(rank_states["integer"], "integer lattice state", 5)
            ),
            "realLatticeState": _decimals(
                _integers(rank_states["real"], "real lattice state", 2)
            ),
            "cleanarchState": _decimals(
                _integers(rank_states["cleanarch"], "cleanarch state", 7)
            ),
            "getfuRealLatticeState": _decimals(
                _integers(
                    rank_states["privateGetfuReal"], "getfu real lattice state", 2
                )
            ),
            "getfuState": _decimals(state),
            "solveState": _decimals(solve_state),
        },
    }


def _replay_class_witness(
    relation: Mapping[str, Any], class_witness: Mapping[str, Any]
) -> None:
    records = _integers(
        relation.get("relations", {}).get("recordsColumnMajor"),
        "relation records",
        FACTOR_ROWS * RELATION_COLUMNS,
    )
    cleanup = _integers(
        relation.get("hnf", {}).get("cleanupTransform"),
        "cleanup transform",
        RELATION_COLUMNS * RELATION_COLUMNS,
    )
    hnf_transform = _integers(
        relation.get("hnf", {}).get("hnfTransform"),
        "HNF transform",
        13 * 13,
    )
    retained_cleanup = [
        cleanup[column * RELATION_COLUMNS + row]
        for column in range(13)
        for row in range(RELATION_COLUMNS)
    ]
    raw_map = _column_major_product(
        retained_cleanup, RELATION_COLUMNS, 13, hnf_transform, 13
    )
    coefficients = raw_map[9 * RELATION_COLUMNS : 10 * RELATION_COLUMNS]
    target = _column_major_product(
        records, FACTOR_ROWS, RELATION_COLUMNS, coefficients, 1
    )
    compact = class_witness.get("compactPrincipalWitness", {})
    if (
        target != [6] + [0] * 30
        or _integers(
            compact.get("rawRelationCoefficients"), "class relation coefficients", 40
        )
        != coefficients
        or _integers(compact.get("factorBaseExponents"), "factor exponents", 31)
        != target
    ):
        raise Row23FinalFailure("class-order relation does not replay")


def _replay_degree_five_correspondence(
    correspondence: Mapping[str, Any],
    class_witness: Mapping[str, Any],
    relation: Mapping[str, Any],
    multiplication_table: Sequence[int],
) -> tuple[list[int], list[int]]:
    ancestry = correspondence.get("ancestry", {})
    relation_records = _integers(
        relation.get("relations", {}).get("recordsColumnMajor"),
        "correspondence relation matrix",
        FACTOR_ROWS * RELATION_COLUMNS,
    )
    principal_generators = _integers(
        relation.get("relations", {}).get("principalGenerators"),
        "correspondence principal generators",
        DEGREE * RELATION_COLUMNS,
    )
    if (
        ancestry.get("preparedAuthoritySha256") != PREPARED_SHA256
        or ancestry.get("factorOwnerSha256") != FACTOR_SHA256
        or ancestry.get("classWitnessOwnerSha256") != CLASS_SHA256
        or ancestry.get("relationMatrixSha256")
        != _integer_vector_digest(relation_records)
        or ancestry.get("principalGeneratorsSha256")
        != _integer_vector_digest(principal_generators)
    ):
        raise Row23FinalFailure("degree-five correspondence ancestry changed")
    expanded = correspondence.get("expandedPrincipalWitness", {})
    idealred = correspondence.get("idealred", {})
    completion = correspondence.get("completion", {})
    alpha = _integers(expanded.get("alpha"), "expanded principal alpha", 5)
    powers = expanded.get("powerIdealHnfs")
    if not isinstance(powers, list) or len(powers) != 6:
        raise Row23FinalFailure("expanded ideal-power chain changed")
    power_hnfs = [_integers(row, "expanded ideal power", 25) for row in powers]
    principal_hnf = _integers(
        expanded.get("principalIdealHnf"), "principal ideal HNF", 25
    )
    reduced = _integers(
        idealred.get("reducedGeneratorIdealHnf"), "reduced generator ideal", 25
    )
    selected = _integers(
        class_witness.get("generator", {}).get("selectedIdealHnf"),
        "selected class generator",
        25,
    )
    if (
        alpha != [55527, 2886, -7934, -1304, 695]
        or expanded.get("identity") != "J^6=(alpha)"
        or power_hnfs[-1] != principal_hnf
        or power_hnfs[0] != selected
        or reduced != selected
        or _integers(idealred.get("pseudomin"), "idealred pseudomin", 5)
        != [7, 0, 0, 0, 0]
        or idealred.get("scalarShortCircuit") is not True
        or idealred.get("degreeFiveIdealredExecuted") is not True
        or idealred.get("reducedRepresentativePublished") is not True
        or expanded.get("degreeFiveIdealProductReplayComplete") is not True
        or expanded.get("expandedPrincipalGeneratorMaterialized") is not True
        or completion
        != {
            "expandedPrincipalIdentityComplete": True,
            "degreeFiveIdealProductReplayComplete": True,
            "degreeFiveIdealredComplete": True,
            "reducedClassGeneratorComplete": True,
            "postcomputeOracleConsumed": False,
        }
    ):
        raise Row23FinalFailure("degree-five correspondence evidence changed")
    if (
        abs(_determinant(_multiplication_matrix(alpha, multiplication_table), 5))
        != 117649
    ):
        raise Row23FinalFailure("expanded principal generator norm changed")
    return alpha, reduced


def build_row23_payload(
    prepared_path: str | Path,
    factor_path: str | Path,
    relation_path: str | Path,
    acceptance_path: str | Path,
    class_path: str | Path,
    correspondence_path: str | Path,
    unit_path: str | Path,
    correspondence_authority: FreshRow23CorrespondenceAuthority | None = None,
    unit_authority: FreshRow23UnitAuthority | None = None,
) -> dict[str, Any]:
    """Build the complete honest row-23 internal assembly."""
    prepared = _load_prepared(prepared_path)
    factor, factor_sha = _load_gzip_owner(factor_path, FACTOR_SCHEMA, FACTOR_SHA256)
    relation, relation_sha = _load_gzip_owner(
        relation_path, RELATION_SCHEMA, RELATION_SHA256
    )
    acceptance, acceptance_sha = _load_gzip_owner(
        acceptance_path, ACCEPTANCE_SCHEMA, ACCEPTANCE_SHA256
    )
    class_witness, class_sha = _load_gzip_owner(class_path, CLASS_SCHEMA, CLASS_SHA256)
    expected_correspondence_sha = (
        CORRESPONDENCE_SHA256
        if correspondence_authority is None
        else correspondence_authority.expected_owner_sha256
    )
    expected_correspondence_content_sha = (
        CORRESPONDENCE_CONTENT_SHA256
        if correspondence_authority is None
        else correspondence_authority.expected_content_sha256
    )
    correspondence, correspondence_sha = _load_gzip_owner(
        correspondence_path, CORRESPONDENCE_SCHEMA, expected_correspondence_sha
    )
    if _sha256(_canonical(correspondence)) != expected_correspondence_content_sha:
        raise Row23FinalFailure("row-23 correspondence content authority changed")
    expected_unit_sha = (
        UNIT_SHA256 if unit_authority is None else unit_authority.expected_owner_sha256
    )
    expected_unit_content_sha = (
        UNIT_CONTENT_SHA256
        if unit_authority is None
        else unit_authority.expected_content_sha256
    )
    unit, unit_sha = _load_gzip_owner(unit_path, UNIT_SCHEMA, expected_unit_sha)
    if _sha256(_canonical(unit)) != expected_unit_content_sha:
        raise Row23FinalFailure("row-23 unit content authority changed")
    if (
        factor.get("authority", {}).get("preparedSha256") != PREPARED_SHA256
        or relation.get("authority", {}).get("preparedSha256") != PREPARED_SHA256
        or relation.get("authority", {}).get("factorOwnerSha256") != factor_sha
        or acceptance.get("authority", {}).get("preparedSha256") != PREPARED_SHA256
        or acceptance.get("authority", {}).get("relationOwnerSha256") != relation_sha
        or class_witness.get("ancestry", {}).get("preparedAuthoritySha256")
        != PREPARED_SHA256
        or class_witness.get("ancestry", {}).get("factorOwnerSha256") != factor_sha
        or correspondence.get("ancestry", {}).get("preparedAuthoritySha256")
        != PREPARED_SHA256
        or correspondence.get("ancestry", {}).get("factorOwnerSha256") != factor_sha
        or correspondence.get("ancestry", {}).get("classWitnessOwnerSha256")
        != class_sha
        or unit.get("factorOwnerSha256") != factor_sha
    ):
        raise Row23FinalFailure("row-23 source-owner ancestry changed")
    _replay_class_witness(relation, class_witness)
    accepted = acceptance.get("acceptance", {})
    if accepted.get("classNumber") != "6":
        raise Row23FinalFailure("analytic acceptance class number changed")
    regulator = _integers(accepted.get("regulator"), "accepted regulator", 3)
    if _integers(unit.get("regulator"), "unit regulator", 3) != regulator:
        raise Row23FinalFailure("unit owner regulator detached from acceptance")
    regulator_raw = json.dumps(
        accepted["regulator"], separators=(",", ":"), ensure_ascii=True
    ).encode("ascii")
    acceptance_authority = {
        "classNumber": accepted["classNumber"],
        "regulator": accepted["regulator"],
        "lattice": accepted["relationLattice"],
        "postHnfState": accepted["postHnfState"],
        "multipleState": accepted["multipleState"],
        "acceptanceState": accepted["state"],
        "reconstructionState": accepted["reconstructionState"],
    }
    acceptance_raw = json.dumps(
        acceptance_authority, separators=(",", ":"), ensure_ascii=True
    ).encode("ascii")
    if unit.get("regulatorAuthoritySha256") != _sha256(regulator_raw) or unit.get(
        "acceptanceAuthoritySha256"
    ) != _sha256(acceptance_raw):
        raise Row23FinalFailure("unit owner detached from live acceptance authority")
    fundamental = _normalize_units(unit, prepared)
    table = _integers(prepared["basis_table"], "multiplication table", 125)
    alpha, reduced_generator = _replay_degree_five_correspondence(
        correspondence, class_witness, relation, table
    )
    raw_class_log = _integers(
        relation.get("hnf", {}).get("exactClassLog"), "raw class logarithm", 35
    )
    cleaned_class_log = _packed_cleanarch_quintic(raw_class_log)
    minus_one = [-1, 0, 0, 0, 0]
    if _multiply_coordinates(minus_one, minus_one, table) != [1, 0, 0, 0, 0]:
        raise Row23FinalFailure("torsion square does not replay")
    torsion = {
        "order": "2",
        "generator": _decimals(minus_one),
        "inverse": _decimals(minus_one),
        "norm": "-1",
        "square": ["1", "0", "0", "0", "0"],
    }
    presentation = class_witness["presentation"]
    principal = class_witness["compactPrincipalWitness"]
    payload = {
        "source": {
            "pariVersion": PARI_VERSION,
            "preparedSha256": PREPARED_SHA256,
            "factorOwnerSha256": factor_sha,
            "relationOwnerSha256": relation_sha,
            "acceptanceOwnerSha256": acceptance_sha,
            "classOwnerSha256": class_sha,
            "degreeFiveCorrespondenceOwnerSha256": correspondence_sha,
            "unitOwnerSha256": unit_sha,
            "frozenW0RuntimeInput": False,
        },
        "field": {
            "label": "5.5.1002836007889.1",
            "polynomial": _decimals(
                _integers(prepared["prep_polynomial"], "field polynomial", 6)
            ),
            "degree": "5",
            "signature": ["5", "0"],
            "discriminant": "1002836007889",
            "precision": str(PRECISION),
            "multiplicationTable": _decimals(table),
        },
        "owners": {
            "factorBase": _content_record(factor),
            "relationHnf": _content_record(relation),
            "acceptance": _content_record(acceptance),
            "classWitness": _content_record(class_witness),
            "degreeFiveCorrespondence": _content_record(correspondence),
            "units": _content_record(unit),
        },
        "factorBase": json.loads(_canonical(factor["factorBase"])),
        "relations": json.loads(_canonical(relation["relations"])),
        "hnf": json.loads(_canonical(relation["hnf"])),
        "logarithms": {
            "exactHnf": list(relation["hnf"]["exactLogs"]),
            "rawClassColumn": _decimals(raw_class_log),
            "cleanedClassColumn": _decimals(cleaned_class_log),
            "analyticPacked": list(accepted["packedLogs"]),
            "coordinates": list(accepted["coordinates"]),
            "relationLatticeShape": ["4", "9"],
            "relationLattice": list(accepted["relationLattice"]),
        },
        "classGroup": {
            "classNumber": "6",
            "invariantFactors": ["6"],
            "presentation": json.loads(_canonical(presentation)),
            "generatorIdeals": [_decimals(reduced_generator)],
            "generatorOrders": ["6"],
            "compactPrincipalOrderWitnesses": [json.loads(_canonical(principal))],
            "genback": {
                **json.loads(_canonical(class_witness["genback"])),
                "degreeFiveIdealredExecuted": True,
                "reducedRepresentativePublished": True,
                "reducedGeneratorIdealHnf": _decimals(reduced_generator),
                "reductionFactorMatrix": {
                    "factorValues": [],
                    "factorExponents": [],
                },
                "reductionMultiplierIsIdentity": True,
            },
            "expandedPrincipalGenerator": _decimals(alpha),
        },
        "units": {"torsion": torsion, "fundamental": fundamental},
        "regulator": {
            "value": _decimals(regulator),
            "inverseHr": list(acceptance["analytic"]["inverseHr"]),
            "analyticState": list(acceptance["analytic"]["state"]),
            "catalogState": list(acceptance["analytic"]["catalogState"]),
            "postHnfState": list(accepted["postHnfState"]),
            "multipleState": list(accepted["multipleState"]),
            "acceptanceState": list(accepted["state"]),
            "reconstructionState": list(accepted["reconstructionState"]),
            "rigorousEnclosure": False,
        },
        "buchall": {
            "clg1": {
                "classNumber": "6",
                "invariantFactors": ["6"],
                "generatorIdeals": [_decimals(reduced_generator)],
            },
            "clg2": {
                "components": ["Ur", "ga", "GD", "Ge", "M1", "M2"],
                "values": [
                    list(presentation["matrices"]["Ur"]),
                    {
                        "kind": "exact-zero-arch-matrix",
                        "shape": ["5", "1"],
                        "entries": ["0"] * 5,
                    },
                    {
                        "kind": "packed-cleaned-class-log",
                        "shape": ["1", "5", "7"],
                        "entries": _decimals(cleaned_class_log),
                    },
                    {
                        "kind": "trivial-factor-matrix-column",
                        "shape": ["1"],
                        "entries": [{"factorValues": [], "factorExponents": []}],
                    },
                    list(presentation["matrices"]["M1"]),
                    list(presentation["matrices"]["M2"]),
                ],
                "pariClg2ExactShapeComplete": True,
                "missing": [],
            },
            "unitRank": "4",
            "torsionOrder": "2",
            "terminalState": ["0", "0", "0"],
        },
        "assumptions": list(_ASSUMPTIONS),
        "limitations": {
            "degreeFiveIdealredExecuted": True,
            "reducedGeneratorIdealPublished": True,
            "expandedIdealProductReplayComplete": True,
            "compactPrincipalRelationComplete": True,
            "clg2CorrespondenceComplete": True,
            "reason": (
                "degree-five idealred, expanded ideal powers, and every retained "
                "PARI clg2 correspondence component replay exactly"
            ),
        },
        "terminal": {
            "status": "published-upstream-assumed-row23-assembly-v1",
            "buchallEndEquivalentAssemblyComplete": True,
            "correspondenceComplete": True,
            "publicComplete": False,
            "atomic": True,
            "idempotent": True,
            "omittedLazyMaterializations": ["makeunits", "makematal", "makecycgen"],
            "remainingBoundary": [
                "independent rigorous regulator enclosure",
                "independent class/unit saturation certificate",
                "unconditional or independently proved factor-base bound",
                "general-field production integration",
            ],
        },
    }
    _validate_payload(payload, correspondence_authority, unit_authority)
    return payload


def _validate_payload(
    payload: Any,
    correspondence_authority: FreshRow23CorrespondenceAuthority | None = None,
    unit_authority: FreshRow23UnitAuthority | None = None,
) -> None:
    value = _exact_dict(
        payload,
        {
            "source",
            "field",
            "owners",
            "factorBase",
            "relations",
            "hnf",
            "logarithms",
            "classGroup",
            "units",
            "regulator",
            "buchall",
            "assumptions",
            "limitations",
            "terminal",
        },
        "row-23 payload",
    )
    source = _exact_dict(
        value["source"],
        {
            "pariVersion",
            "preparedSha256",
            "factorOwnerSha256",
            "relationOwnerSha256",
            "acceptanceOwnerSha256",
            "classOwnerSha256",
            "degreeFiveCorrespondenceOwnerSha256",
            "unitOwnerSha256",
            "frozenW0RuntimeInput",
        },
        "source",
    )
    expected_unit_sha = (
        UNIT_SHA256 if unit_authority is None else unit_authority.expected_owner_sha256
    )
    expected_unit_content_sha = (
        UNIT_CONTENT_SHA256
        if unit_authority is None
        else unit_authority.expected_content_sha256
    )
    expected_correspondence_sha = (
        CORRESPONDENCE_SHA256
        if correspondence_authority is None
        else correspondence_authority.expected_owner_sha256
    )
    expected_correspondence_content_sha = (
        CORRESPONDENCE_CONTENT_SHA256
        if correspondence_authority is None
        else correspondence_authority.expected_content_sha256
    )
    if source != {
        "pariVersion": PARI_VERSION,
        "preparedSha256": PREPARED_SHA256,
        "factorOwnerSha256": FACTOR_SHA256,
        "relationOwnerSha256": RELATION_SHA256,
        "acceptanceOwnerSha256": ACCEPTANCE_SHA256,
        "classOwnerSha256": CLASS_SHA256,
        "degreeFiveCorrespondenceOwnerSha256": expected_correspondence_sha,
        "unitOwnerSha256": expected_unit_sha,
        "frozenW0RuntimeInput": False,
    }:
        raise Row23FinalFailure("source authority changed")
    field = _exact_dict(
        value["field"],
        {
            "label",
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
        field["label"] != "5.5.1002836007889.1"
        or _integers(field["polynomial"], "field polynomial", 6)
        != [341, -970, 772, -141, -2, 1]
        or field["degree"] != "5"
        or field["signature"] != ["5", "0"]
        or field["discriminant"] != "1002836007889"
        or field["precision"] != "256"
    ):
        raise Row23FinalFailure("field identity changed")
    table = _integers(field["multiplicationTable"], "multiplication table", 125)
    owners = _exact_dict(
        value["owners"],
        {
            "factorBase",
            "relationHnf",
            "acceptance",
            "classWitness",
            "degreeFiveCorrespondence",
            "units",
        },
        "source owners",
    )
    factor = _validate_content_record(owners["factorBase"], "factor owner")
    relation = _validate_content_record(owners["relationHnf"], "relation owner")
    acceptance = _validate_content_record(owners["acceptance"], "acceptance owner")
    class_witness = _validate_content_record(
        owners["classWitness"], "class witness owner"
    )
    correspondence = _validate_content_record(
        owners["degreeFiveCorrespondence"], "degree-five correspondence owner"
    )
    unit_owner = _validate_content_record(owners["units"], "unit owner")
    if (
        owners["factorBase"]["contentSha256"] != FACTOR_CONTENT_SHA256
        or owners["relationHnf"]["contentSha256"] != RELATION_CONTENT_SHA256
        or owners["acceptance"]["contentSha256"] != ACCEPTANCE_CONTENT_SHA256
        or owners["classWitness"]["contentSha256"] != CLASS_CONTENT_SHA256
        or owners["degreeFiveCorrespondence"]["contentSha256"]
        != expected_correspondence_content_sha
        or owners["units"]["contentSha256"] != expected_unit_content_sha
        or factor.get("schema") != FACTOR_SCHEMA
        or relation.get("schema") != RELATION_SCHEMA
        or acceptance.get("schema") != ACCEPTANCE_SCHEMA
        or class_witness.get("schema") != CLASS_SCHEMA
        or correspondence.get("schema") != CORRESPONDENCE_SCHEMA
        or unit_owner.get("schema") != UNIT_SCHEMA
    ):
        raise Row23FinalFailure("retained source owner changed")
    if (
        factor.get("authority", {}).get("preparedSha256") != PREPARED_SHA256
        or relation.get("authority", {}).get("factorOwnerSha256") != FACTOR_SHA256
        or acceptance.get("authority", {}).get("relationOwnerSha256") != RELATION_SHA256
        or class_witness.get("ancestry", {}).get("factorOwnerSha256") != FACTOR_SHA256
        or correspondence.get("ancestry", {}).get("classWitnessOwnerSha256")
        != CLASS_SHA256
        or unit_owner.get("factorOwnerSha256") != FACTOR_SHA256
    ):
        raise Row23FinalFailure("retained owner ancestry changed")
    if value["factorBase"] != factor.get("factorBase"):
        raise Row23FinalFailure("factor-base projection changed")
    factor_base = value["factorBase"]
    if (
        len(factor_base.get("ideals", [])) != 31
        or any(len(ideal) != 25 for ideal in factor_base["ideals"])
        or len(factor_base.get("descriptors", [])) != 31
        or len(factor_base.get("norms", [])) != 31
        or len(factor_base.get("permutation", [])) != 31
    ):
        raise Row23FinalFailure("factor-base geometry changed")
    relations = value["relations"]
    if relations != relation.get("relations"):
        raise Row23FinalFailure("relation projection changed")
    if (
        relations.get("recordsShape") != [31, 40]
        or relations.get("principalGeneratorsShape") != [40, 5]
        or relations.get("metadataShape") != [40, 3]
    ):
        raise Row23FinalFailure("relation shapes changed")
    _integers(relations["recordsColumnMajor"], "relation records", 1240)
    _integers(relations["principalGenerators"], "principal generators", 200)
    _integers(relations["metadata"], "relation metadata", 120)
    hnf = value["hnf"]
    if hnf != relation.get("hnf"):
        raise Row23FinalFailure("HNF projection changed")
    expected_shapes = {
        "originalShape": [31, 40],
        "cleanupTransformShape": [40, 40],
        "fullHShape": [4, 13],
        "hnfTransformShape": [13, 13],
        "hnfLambdaShape": [13, 13],
        "hnfDenominatorsShape": [14],
        "terminalWShape": [1, 1],
        "terminalDepShape": [31, 0],
        "terminalBShape": [30, 1],
        "exactLogShape": [9, 5, 7],
        "exactClassLogShape": [1, 5, 7],
    }
    for name, expected in expected_shapes.items():
        if hnf.get(name) != expected:
            raise Row23FinalFailure("HNF shape changed: " + name)
    if (
        _integers(hnf["original"], "HNF original", 1240)
        != _integers(relations["recordsColumnMajor"], "relations", 1240)
        or _integers(hnf["terminalW"], "terminal W", 1) != [6]
        or sorted(_integers(hnf["terminalPermutation"], "permutation", 31))
        != list(range(1, 32))
    ):
        raise Row23FinalFailure("terminal HNF changed")
    if _integers(relation.get("state", {}).get("final"), "hnffinal state", 7) != [
        1,
        10,
        30,
        0,
        9,
        3,
        0,
    ]:
        raise Row23FinalFailure("class-log destination state changed")
    _integers(hnf["cleanupTransform"], "cleanup transform", 1600)
    _integers(hnf["fullH"], "full HNF", 52)
    _integers(hnf["hnfTransform"], "HNF transform", 169)
    _integers(hnf["hnfLambda"], "HNF lambda", 169)
    _integers(hnf["hnfDenominators"], "HNF denominators", 14)
    if hnf["terminalDep"] != []:
        raise Row23FinalFailure("terminal HNF dependency block changed")
    _integers(hnf["terminalB"], "terminal B", 30)
    exact_logs = _integers(hnf["exactLogs"], "exact HNF logs", 315)
    raw_class_log = _integers(hnf["exactClassLog"], "raw class logarithm", 35)
    cleaned_class_log = _packed_cleanarch_quintic(raw_class_log)
    logs = _exact_dict(
        value["logarithms"],
        {
            "exactHnf",
            "rawClassColumn",
            "cleanedClassColumn",
            "analyticPacked",
            "coordinates",
            "relationLatticeShape",
            "relationLattice",
        },
        "logarithms",
    )
    accepted = acceptance.get("acceptance", {})
    if (
        _integers(logs["exactHnf"], "exact HNF log projection", 315) != exact_logs
        or _integers(logs["rawClassColumn"], "raw class log projection", 35)
        != raw_class_log
        or _integers(logs["cleanedClassColumn"], "clean class log projection", 35)
        != cleaned_class_log
        or logs["analyticPacked"] != accepted.get("packedLogs")
        or logs["coordinates"] != accepted.get("coordinates")
        or logs["relationLattice"] != accepted.get("relationLattice")
        or logs["relationLatticeShape"] != ["4", "9"]
    ):
        raise Row23FinalFailure("retained logarithm projection changed")
    _integers(logs["analyticPacked"], "analytic packed logs", 135)
    _integers(logs["coordinates"], "acceptance coordinates", 108)
    _integers(logs["relationLattice"], "relation lattice", 36)
    class_group = _exact_dict(
        value["classGroup"],
        {
            "classNumber",
            "invariantFactors",
            "presentation",
            "generatorIdeals",
            "generatorOrders",
            "compactPrincipalOrderWitnesses",
            "genback",
            "expandedPrincipalGenerator",
        },
        "class group",
    )
    if (
        class_group["classNumber"] != "6"
        or class_group["invariantFactors"] != ["6"]
        or class_group["presentation"] != class_witness.get("presentation")
        or class_group["generatorOrders"] != ["6"]
        or class_group["compactPrincipalOrderWitnesses"]
        != [class_witness.get("compactPrincipalWitness")]
    ):
        raise Row23FinalFailure("class-group projection changed")
    _replay_class_witness(relation, class_witness)
    alpha, reduced_generator = _replay_degree_five_correspondence(
        correspondence, class_witness, relation, table
    )
    expected_genback = {
        **class_witness["genback"],
        "degreeFiveIdealredExecuted": True,
        "reducedRepresentativePublished": True,
        "reducedGeneratorIdealHnf": _decimals(reduced_generator),
        "reductionFactorMatrix": {"factorValues": [], "factorExponents": []},
        "reductionMultiplierIsIdentity": True,
    }
    if (
        class_group["generatorIdeals"] != [_decimals(reduced_generator)]
        or class_group["genback"] != expected_genback
        or _integers(
            class_group["expandedPrincipalGenerator"],
            "expanded principal generator",
            5,
        )
        != alpha
    ):
        raise Row23FinalFailure("degree-five class correspondence changed")
    units = _exact_dict(value["units"], {"torsion", "fundamental"}, "units")
    expected_torsion = {
        "order": "2",
        "generator": ["-1", "0", "0", "0", "0"],
        "inverse": ["-1", "0", "0", "0", "0"],
        "norm": "-1",
        "square": ["1", "0", "0", "0", "0"],
    }
    if units["torsion"] != expected_torsion or _multiply_coordinates(
        [-1, 0, 0, 0, 0], [-1, 0, 0, 0, 0], table
    ) != [1, 0, 0, 0, 0]:
        raise Row23FinalFailure("torsion evidence changed")
    expected_fundamental = _normalize_units(unit_owner, {"basis_table": table})
    if units["fundamental"] != expected_fundamental:
        raise Row23FinalFailure("fundamental-unit projection changed")
    regulator = _exact_dict(
        value["regulator"],
        {
            "value",
            "inverseHr",
            "analyticState",
            "catalogState",
            "postHnfState",
            "multipleState",
            "acceptanceState",
            "reconstructionState",
            "rigorousEnclosure",
        },
        "regulator",
    )
    expected_regulator = {
        "value": accepted.get("regulator"),
        "inverseHr": acceptance.get("analytic", {}).get("inverseHr"),
        "analyticState": acceptance.get("analytic", {}).get("state"),
        "catalogState": acceptance.get("analytic", {}).get("catalogState"),
        "postHnfState": accepted.get("postHnfState"),
        "multipleState": accepted.get("multipleState"),
        "acceptanceState": accepted.get("state"),
        "reconstructionState": accepted.get("reconstructionState"),
        "rigorousEnclosure": False,
    }
    if (
        regulator != expected_regulator
        or unit_owner.get("regulator") != regulator["value"]
    ):
        raise Row23FinalFailure("regulator evidence changed")
    if _integers(regulator["value"], "regulator", 3) != [
        58120758344776579206426528395464800380047988883988014887510864319728839258178,
        256,
        12,
    ]:
        raise Row23FinalFailure("accepted regulator packet changed")
    presentation = class_witness["presentation"]
    expected_buchall = {
        "clg1": {
            "classNumber": "6",
            "invariantFactors": ["6"],
            "generatorIdeals": [_decimals(reduced_generator)],
        },
        "clg2": {
            "components": ["Ur", "ga", "GD", "Ge", "M1", "M2"],
            "values": [
                presentation["matrices"]["Ur"],
                {
                    "kind": "exact-zero-arch-matrix",
                    "shape": ["5", "1"],
                    "entries": ["0"] * 5,
                },
                {
                    "kind": "packed-cleaned-class-log",
                    "shape": ["1", "5", "7"],
                    "entries": _decimals(cleaned_class_log),
                },
                {
                    "kind": "trivial-factor-matrix-column",
                    "shape": ["1"],
                    "entries": [{"factorValues": [], "factorExponents": []}],
                },
                presentation["matrices"]["M1"],
                presentation["matrices"]["M2"],
            ],
            "pariClg2ExactShapeComplete": True,
            "missing": [],
        },
        "unitRank": "4",
        "torsionOrder": "2",
        "terminalState": ["0", "0", "0"],
    }
    if value["buchall"] != expected_buchall:
        raise Row23FinalFailure("buchall assembly changed")
    if value["assumptions"] != list(_ASSUMPTIONS):
        raise Row23FinalFailure("assumption record changed")
    expected_limitations = {
        "degreeFiveIdealredExecuted": True,
        "reducedGeneratorIdealPublished": True,
        "expandedIdealProductReplayComplete": True,
        "compactPrincipalRelationComplete": True,
        "clg2CorrespondenceComplete": True,
        "reason": (
            "degree-five idealred, expanded ideal powers, and every retained "
            "PARI clg2 correspondence component replay exactly"
        ),
    }
    if value["limitations"] != expected_limitations:
        raise Row23FinalFailure("degree-five arithmetic limitation changed")
    expected_terminal = {
        "status": "published-upstream-assumed-row23-assembly-v1",
        "buchallEndEquivalentAssemblyComplete": True,
        "correspondenceComplete": True,
        "publicComplete": False,
        "atomic": True,
        "idempotent": True,
        "omittedLazyMaterializations": ["makeunits", "makematal", "makecycgen"],
        "remainingBoundary": [
            "independent rigorous regulator enclosure",
            "independent class/unit saturation certificate",
            "unconditional or independently proved factor-base bound",
            "general-field production integration",
        ],
    }
    if value["terminal"] != expected_terminal:
        raise Row23FinalFailure("terminal status changed")


def _envelope(
    payload: Mapping[str, Any],
    correspondence_authority: FreshRow23CorrespondenceAuthority | None = None,
    unit_authority: FreshRow23UnitAuthority | None = None,
) -> tuple[bytes, str]:
    detached = json.loads(_canonical(dict(payload)))
    _validate_payload(detached, correspondence_authority, unit_authority)
    payload_raw = _canonical(detached)
    raw = _canonical(
        {"schema": SCHEMA, "payloadSha256": _sha256(payload_raw), "payload": detached}
    )
    return raw, _sha256(raw)


def cold_replay_row23(
    value: ImmutableRow23Result | bytes | str,
    authority: Row23ReplayAuthority = Row23ReplayAuthority(),
) -> ImmutableRow23Result:
    raw = value.canonical_json if isinstance(value, ImmutableRow23Result) else value
    envelope = _exact_dict(
        _strict_loads(raw), {"schema", "payloadSha256", "payload"}, "row-23 envelope"
    )
    if envelope["schema"] != SCHEMA:
        raise Row23FinalFailure("row-23 result schema changed")
    payload_raw = _canonical(envelope["payload"])
    if envelope["payloadSha256"] != _sha256(payload_raw):
        raise Row23FinalFailure("row-23 payload hash changed")
    _validate_payload(
        envelope["payload"],
        authority.correspondence_authority,
        authority.unit_authority,
    )
    canonical = _canonical(envelope)
    expected_raw = raw.encode("ascii") if isinstance(raw, str) else raw
    if canonical != expected_raw:
        raise Row23FinalFailure("row-23 result is not canonical JSON")
    digest = _sha256(canonical)
    if authority.expected_sha256 is not None and digest != authority.expected_sha256:
        raise Row23FinalFailure("row-23 publication authority changed")
    return ImmutableRow23Result(canonical, digest)


class AtomicRow23Publisher:
    """Validate before publication; repeat equal publication is idempotent."""

    def __init__(self, authority: Row23ReplayAuthority = Row23ReplayAuthority()):
        self._authority = authority
        self._lock = Lock()
        self._current: ImmutableRow23Result | None = None

    def publish(self, payload: Mapping[str, Any]) -> ImmutableRow23Result:
        raw, digest = _envelope(
            payload,
            self._authority.correspondence_authority,
            self._authority.unit_authority,
        )
        candidate = cold_replay_row23(raw, self._authority)
        if candidate.sha256 != digest:
            raise Row23FinalFailure("row-23 envelope digest changed")
        with self._lock:
            if self._current is None:
                self._current = candidate
            elif self._current.canonical_json != candidate.canonical_json:
                raise Row23PublicationConflict("conflicting row-23 publication")
            return self._current

    def current(self) -> ImmutableRow23Result | None:
        with self._lock:
            return self._current

    def publish_file(self, directory: str | Path, payload: Mapping[str, Any]) -> Path:
        result = self.publish(payload)
        target_directory = Path(directory)
        target_directory.mkdir(parents=True, exist_ok=True)
        target = target_directory / f"row23-final-{result.sha256}.json.gz"
        compressed = gzip.compress(result.canonical_json, mtime=0)
        if target.exists():
            if target.read_bytes() != compressed:
                raise Row23PublicationConflict("existing row-23 artifact conflicts")
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
    "AtomicRow23Publisher",
    "CLASS_SHA256",
    "CORRESPONDENCE_SHA256",
    "FACTOR_SHA256",
    "FreshRow23CorrespondenceAuthority",
    "FreshRow23UnitAuthority",
    "ImmutableRow23Result",
    "PREPARED_SHA256",
    "RELATION_SHA256",
    "Row23FinalFailure",
    "Row23PublicationConflict",
    "Row23ReplayAuthority",
    "SCHEMA",
    "UNIT_SHA256",
    "build_row23_payload",
    "cold_replay_row23",
]
