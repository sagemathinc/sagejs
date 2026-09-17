"""Authenticated production owner for the field-3 analytic C4 cut.

This is orchestration around the ordinary source-transparent arithmetic.  It
authenticates four content-addressed predecessors, derives the analytic
inverse-hR and regulator multiple live, and publishes an accepted result only
after PARI's `compute_R` decision succeeds.  No observed regulator, class
number, relation lattice, inverse-hR value, or successful precision is an
input.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
import re
from typing import Any

from .field3_analytic_acceptance import (
    pari_field3_analytic_acceptance,
    pari_field3_analytic_preparation,
    pari_field3_catalog_latches,
)
from .field3_high_precision_regulator_schedule import (
    pari_field3_regulator_owner_latches,
)
from .regulator_multiple import pari_regulator_multiple


FIELD = "x^4-2000022*x-2000042"
RUN_IDENTITY = "pari-2.17.4:nfinit192->nfnewprec153088:field3"
FULL_SCHEMA = "sagejs.pari-class-group/field3-full-terminal-ancestry-v1"
C3_SCHEMA = "sagejs.pari-class-group/field3-high-precision-A-v1"
FIELD_SCHEMA = "sagejs.pari-class-group/field3-analytic-field-v1"
CATALOG_SCHEMA = "sagejs.pari-class-group/field3-analytic-prime-catalog-v1"
OUTPUT_SCHEMA = "sagejs.pari-class-group/field3-accepted-c4-v1"
ANALYTIC_SCHEMA = "sagejs.pari-class-group/field3-analytic-accepted-owner-v1"
_SHA256 = re.compile(r"[0-9a-f]{64}\Z")


class Field3AcceptedC4Failure(ValueError):
    """An authenticated input or analytic decision failed closed."""


class Field3AcceptedC4Retry(Field3AcceptedC4Failure):
    """A genuine `compute_R` PRECI requested a fresh Buchall generation."""

    def __init__(self, precision: int, target: int):
        self.precision = precision
        self.target = target
        super().__init__(
            f"compute_R PRECI at {precision} bits requests retry at {target} bits"
        )


def _mapping(value: Any, label: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise Field3AcceptedC4Failure(f"{label} is not an object")
    return value


def _integer(value: Any, label: str) -> int:
    if isinstance(value, bool) or not isinstance(value, (int, str)):
        raise Field3AcceptedC4Failure(f"{label} is not integral")
    try:
        answer = int(value)
    except ValueError as error:
        raise Field3AcceptedC4Failure(f"{label} is not integral") from error
    if str(answer) != str(value):
        raise Field3AcceptedC4Failure(f"{label} is not canonical")
    return answer


def _integers(value: Any, length: int, label: str) -> list[int]:
    if not isinstance(value, list) or len(value) != length:
        raise Field3AcceptedC4Failure(f"{label} shape changed")
    return [_integer(cell, f"{label}[{index}]") for index, cell in enumerate(value)]


def _sha256(value: Any, label: str) -> str:
    if not isinstance(value, str) or _SHA256.fullmatch(value) is None:
        raise Field3AcceptedC4Failure(f"{label} is not a SHA-256 digest")
    return value


def _hash_words(digest: str) -> list[int]:
    result = []
    for index in range(4):
        value = int(digest[16 * index : 16 * index + 16], 16)
        if value >= 1 << 63:
            value -= 1 << 64
        result.append(value)
    return result


def _zero(length: int) -> list[int]:
    return [0] * length


def _floats(length: int) -> list[float]:
    return [0.0] * length


def _authenticate_identity(
    full: Mapping[str, Any],
    c3: Mapping[str, Any],
    field: Mapping[str, Any],
    catalog: Mapping[str, Any],
) -> tuple[str, str, int]:
    if full.get("schema") != FULL_SCHEMA or c3.get("schema") != C3_SCHEMA:
        raise Field3AcceptedC4Failure("wrong terminal/C3 schema")
    if field.get("schema") != FIELD_SCHEMA or catalog.get("schema") != CATALOG_SCHEMA:
        raise Field3AcceptedC4Failure("wrong field/catalog schema")
    field_name = field.get("field")
    run_identity = field.get("runIdentity")
    if not isinstance(field_name, str) or not isinstance(run_identity, str):
        raise Field3AcceptedC4Failure("field identity is not textual")
    if any(
        owner.get("field") != field_name or owner.get("runIdentity") != run_identity
        for owner in (full, c3, catalog)
    ):
        raise Field3AcceptedC4Failure("predecessor field identity diverged")
    # Production admits the frozen field-3 identity.  A distinctly labelled
    # low-precision identity is accepted only by the focused oracle tests.
    if (field_name, run_identity) != (FIELD, RUN_IDENTITY) and not (
        field_name != FIELD and run_identity.startswith("synthetic-c4-low-")
    ):
        raise Field3AcceptedC4Failure("unsupported field-3 identity")
    precision = _integer(c3.get("targetBits"), "C3 precision")
    if precision not in (64, 192, 153088):
        raise Field3AcceptedC4Failure("unsupported C4 precision")
    if _integer(full.get("targetBits"), "terminal precision") != precision:
        raise Field3AcceptedC4Failure("terminal/C3 precision diverged")
    return field_name, run_identity, precision


def _authenticate_terminal_and_c3(
    full: Mapping[str, Any], c3: Mapping[str, Any], precision: int
) -> tuple[list[int], list[int], list[int]]:
    if (
        full.get("terminalShape") != [3, 15]
        or full.get("transformShape") != [301, 15]
        or full.get("unitColumns") != 13
        or full.get("classColumns") != 2
        or full.get("retentionState") != [0, 301, 15, 293, 3, 4515, 13, 2]
        or full.get("imageState") != [0, 288, 301, 13, 2, 15, 3744, 576]
        or c3.get("acceptedShape") != [3, 13]
        or c3.get("transformShape") != [301, 13]
        or c3.get("kernelState") != [0, 288, 301, 13, 3744]
    ):
        raise Field3AcceptedC4Failure("terminal/C3 shape authority changed")
    terminal_h = _integers(full.get("terminalH"), 4, "terminal H")
    if terminal_h[0] <= 0 or terminal_h[3] <= 0 or terminal_h[1] != 0:
        raise Field3AcceptedC4Failure("terminal H is not positive triangular")
    packed_a = _integers(c3.get("packedA"), 273, "C3 packed A")
    for entry in range(39):
        at = 7 * entry
        kind = packed_a[at]
        if kind not in (1, 2):
            raise Field3AcceptedC4Failure("invalid packed C3 log kind")
        for component in range(kind):
            base = at + 1 + 3 * component
            mantissa, scalar_precision, exponent = packed_a[base : base + 3]
            if scalar_precision == -1:
                if mantissa != 0 or exponent != 0:
                    raise Field3AcceptedC4Failure("nonzero exact packed C3 log")
            elif mantissa == 0:
                if scalar_precision != 0:
                    raise Field3AcceptedC4Failure("invalid packed C3 zero")
            elif (
                scalar_precision != precision
                or abs(mantissa).bit_length() != scalar_precision
            ):
                raise Field3AcceptedC4Failure("packed C3 precision changed")
        if kind == 1 and packed_a[at + 4 : at + 7] != [0, -1, 0]:
            raise Field3AcceptedC4Failure("real packed C3 log gained an imaginary part")
    full_transform = _integers(full.get("transform"), 301 * 15, "full transform")
    c3_transform = _integers(c3.get("transform"), 301 * 13, "C3 transform")
    if full_transform[: 301 * 13] != c3_transform:
        raise Field3AcceptedC4Failure("C3 transform detached from terminal ancestry")
    return terminal_h, packed_a, c3_transform


def _analytic_preparation(
    field: Mapping[str, Any], catalog: Mapping[str, Any]
) -> tuple[list[int], list[int]]:
    required_field = {
        "schema",
        "field",
        "runIdentity",
        "polynomial",
        "discriminant",
        "degree",
        "realPlaces",
        "complexPlaces",
        "rootsOfUnity",
        "preparedOwnerSha256",
    }
    required_catalog = {
        "schema",
        "field",
        "runIdentity",
        "fieldOwnerSha256",
        "preparedOwnerSha256",
        "primes",
        "offsets",
        "counts",
        "degrees",
        "multiplicities",
    }
    if set(field) != required_field or set(catalog) != required_catalog:
        raise Field3AcceptedC4Failure("field/catalog owner keys changed")
    polynomial = _integers(field.get("polynomial"), 5, "field polynomial")
    discriminant = _integer(field.get("discriminant"), "field discriminant")
    degree = _integer(field.get("degree"), "field degree")
    r1 = _integer(field.get("realPlaces"), "real places")
    r2 = _integer(field.get("complexPlaces"), "complex places")
    roots = _integer(field.get("rootsOfUnity"), "roots of unity")
    prepared = _sha256(field.get("preparedOwnerSha256"), "prepared owner digest")
    if catalog.get("preparedOwnerSha256") != prepared:
        raise Field3AcceptedC4Failure("catalog detached from prepared field")
    # fieldOwnerSha256 is checked against the caller-authenticated digest by
    # compose_authenticated_c4 before any arithmetic starts.
    if degree != 4 or r1 != 2 or r2 != 1:
        raise Field3AcceptedC4Failure("wrong analytic signature")
    primes_value = catalog.get("primes")
    degrees_value = catalog.get("degrees")
    if not isinstance(primes_value, list) or not isinstance(degrees_value, list):
        raise Field3AcceptedC4Failure("catalog arrays changed")
    primes = _integers(primes_value, len(primes_value), "catalog primes")
    offsets = _integers(catalog.get("offsets"), len(primes), "catalog offsets")
    counts = _integers(catalog.get("counts"), len(primes), "catalog counts")
    degrees = _integers(degrees_value, len(degrees_value), "catalog degrees")
    multiplicities = _integers(
        catalog.get("multiplicities"), len(degrees), "catalog multiplicities"
    )
    latches = list(
        pari_field3_catalog_latches(
            primes,
            len(primes),
            offsets,
            counts,
            degrees,
            multiplicities,
            len(degrees),
        )
    )
    inverse_hr = _zero(3)
    state = _zero(6)
    pari_field3_analytic_preparation(
        polynomial,
        discriminant,
        r1,
        r2,
        roots,
        primes,
        len(primes),
        offsets,
        counts,
        degrees,
        multiplicities,
        len(degrees),
        latches,
        _floats(1),
        _floats(7),
        _floats(31),
        _floats(1),
        _floats(len(primes)),
        _floats(1),
        _zero(3),
        _zero(3),
        _zero(3),
        _zero(1024),
        _zero(1024),
        _zero(1024),
        _zero(1024),
        _zero(128),
        inverse_hr,
        state,
    )
    return inverse_hr, state


def _regulator_multiple(
    packed_a: Sequence[int],
) -> tuple[list[int], list[int], list[int]]:
    logs: list[int] = []
    for entry in range(39):
        base = 7 * entry
        kind = packed_a[base]
        if kind not in (1, 2):
            raise Field3AcceptedC4Failure("invalid packed C3 log kind")
        logs.extend(packed_a[base + 1 : base + 4])
    rows, columns, extended, square = 3, 13, 42, 9
    lengths = (
        3 * extended,
        columns + 1,
        3,
        3 * extended,
        rows,
        columns + 1,
        3,
        extended,
        extended,
        rows,
        columns + 1,
        columns + 1,
        10,
        3 * square,
        3 * square,
        3 * square,
        3,
        rows,
        5,
        3 * square,
        3 * square,
        3 * square,
        rows,
        3,
        3 * square,
        3 * square,
        3,
        3 * (rows - 1) * columns,
        4,
    )
    work = [_zero(length) for length in lengths]
    status = pari_regulator_multiple(logs, rows, columns, 4, *work)
    if status != 0:
        raise Field3AcceptedC4Failure(
            f"regulator-multiple stage failed with status {status}"
        )
    return work[-3], work[-2], work[-1]


def _terminal_hnf_state(terminal_h: Sequence[int]) -> list[int]:
    modulus1 = 2305843009213693951
    modulus2 = 2305843009213693921
    first, second = 4, 12
    for index, value in enumerate(terminal_h):
        first = (first * 1000003 + value % modulus1 + index + 1) % modulus1
        second = (second * 1000033 + value % modulus2 + index + 1) % modulus2
    return [0, 2, first, second, 1]


def compose_authenticated_c4(
    full_owner: Mapping[str, Any],
    c3_owner: Mapping[str, Any],
    field_owner: Mapping[str, Any],
    catalog_owner: Mapping[str, Any],
    full_owner_sha256: str,
    c3_owner_sha256: str,
    field_owner_sha256: str,
    catalog_owner_sha256: str,
) -> dict[str, Any]:
    """Derive and return an accepted C4 owner, or fail without publication."""
    full = _mapping(full_owner, "full terminal owner")
    c3 = _mapping(c3_owner, "C3 owner")
    field = _mapping(field_owner, "field owner")
    catalog = _mapping(catalog_owner, "catalog owner")
    full_sha = _sha256(full_owner_sha256, "full terminal digest")
    c3_sha = _sha256(c3_owner_sha256, "C3 digest")
    field_sha = _sha256(field_owner_sha256, "field digest")
    catalog_sha = _sha256(catalog_owner_sha256, "catalog digest")
    if catalog.get("fieldOwnerSha256") != field_sha:
        raise Field3AcceptedC4Failure("catalog detached from field owner")
    field_name, run_identity, precision = _authenticate_identity(
        full, c3, field, catalog
    )
    terminal_h, packed_a, _ = _authenticate_terminal_and_c3(full, c3, precision)
    inverse_hr, analytic_state = _analytic_preparation(field, catalog)
    multiple, coordinates, multiple_state = _regulator_multiple(packed_a)
    c3_latches = list(pari_field3_regulator_owner_latches(packed_a, 273))
    c3_hash = _hash_words(c3_sha)
    multiple_owner_state = [0, 2, 13, precision, *c3_latches, 1]
    candidate_class = _zero(1)
    candidate_zeta = _zero(3)
    candidate_regulator = _zero(3)
    candidate_relations = _zero(26)
    candidate_denominator = _zero(1)
    retry = _zero(6)
    class_number = _zero(1)
    zeta = _zero(3)
    regulator = _zero(3)
    relations = _zero(26)
    denominator = _zero(1)
    compute_state = _zero(6)
    status = pari_field3_analytic_acceptance(
        packed_a,
        c3_latches,
        multiple_owner_state,
        terminal_h,
        _terminal_hnf_state(terminal_h),
        inverse_hr,
        analytic_state,
        precision,
        0,
        coordinates,
        multiple,
        candidate_class,
        candidate_zeta,
        _zero(78),
        _zero(26),
        _zero(26),
        _zero(2),
        _zero(26),
        _zero(15),
        candidate_regulator,
        candidate_relations,
        candidate_denominator,
        _zero(4),
        _zero(2),
        _zero(13),
        retry,
        class_number,
        zeta,
        regulator,
        relations,
        denominator,
        compute_state,
    )
    if status == 3 and compute_state[1] == 1:
        raise Field3AcceptedC4Retry(precision, compute_state[2])
    if status != 0 or compute_state[4] != 1:
        raise Field3AcceptedC4Failure(
            f"analytic acceptance failed with status {status}"
        )
    generation = 1
    return {
        "schema": OUTPUT_SCHEMA,
        "field": field_name,
        "runIdentity": run_identity,
        "precision": str(precision),
        "generation": str(generation),
        "fullTerminalOwnerSha256": full_sha,
        "c3OwnerSha256": c3_sha,
        "fieldOwnerSha256": field_sha,
        "catalogOwnerSha256": catalog_sha,
        "c3Hash": [str(value) for value in c3_hash],
        "c3Latches": [str(value) for value in c3_latches],
        "analyticOwnerState": [str(value) for value in analytic_state],
        "multipleState": [str(value) for value in multiple_state],
        "computeRState": [str(value) for value in compute_state],
        "acceptanceState": ["0", str(generation), str(precision), "1"],
        "candidateClassNumber": str(class_number[0]),
        "candidateZetaFactor": [str(value) for value in zeta],
        "candidateRegulator": [str(value) for value in regulator],
        "candidateRelations": [str(value) for value in relations],
        "candidateDenominator": str(denominator[0]),
        "candidatePublished": True,
        "analyticPending": False,
        "analytic": {
            "status": "accepted",
            "badCheckStatus": 0,
            "fieldDerived": True,
            "precisionRetryComplete": True,
            "pariVersion": "2.17.4",
            "pariAnalyticBoundsAssumed": True,
        },
    }


def project_analytic_owner(
    accepted_c4: Mapping[str, Any], accepted_c4_sha256: str
) -> dict[str, Any]:
    """Return C7's zero-recomputation view of one authenticated C4 owner."""
    owner = _mapping(accepted_c4, "accepted C4 owner")
    digest = _sha256(accepted_c4_sha256, "accepted C4 digest")
    if (
        owner.get("schema") != OUTPUT_SCHEMA
        or owner.get("candidatePublished") is not True
        or owner.get("analyticPending") is not False
    ):
        raise Field3AcceptedC4Failure("C4 owner was not accepted")
    analytic = _mapping(owner.get("analytic"), "analytic acceptance")
    if analytic.get("status") != "accepted" or analytic.get("badCheckStatus") != 0:
        raise Field3AcceptedC4Failure("C4 analytic gate was not accepted")
    state = _integers(owner.get("acceptanceState"), 4, "acceptance state")
    precision = _integer(owner.get("precision"), "accepted precision")
    generation = _integer(owner.get("generation"), "accepted generation")
    if (
        owner.get("field") != FIELD
        or owner.get("runIdentity") != RUN_IDENTITY
        or state[0] != 0
        or state[1] != generation
        or generation < 1
        or state[2] != precision
        or state[3] != 1
    ):
        raise Field3AcceptedC4Failure("C4 acceptance state changed")
    ancestry = {
        key: _sha256(owner.get(key), key)
        for key in (
            "fullTerminalOwnerSha256",
            "c3OwnerSha256",
            "fieldOwnerSha256",
            "catalogOwnerSha256",
        )
    }
    return {
        "schema": ANALYTIC_SCHEMA,
        "field": owner.get("field"),
        "runIdentity": owner.get("runIdentity"),
        "accepted": True,
        "precision": str(precision),
        "generation": str(generation),
        "regulator": [
            str(value)
            for value in _integers(owner.get("candidateRegulator"), 3, "regulator")
        ],
        "classNumber": str(_integer(owner.get("candidateClassNumber"), "class number")),
        "denominator": str(_integer(owner.get("candidateDenominator"), "denominator")),
        "relations": [
            str(value)
            for value in _integers(owner.get("candidateRelations"), 26, "relations")
        ],
        "acceptedC4OwnerSha256": digest,
        **ancestry,
        "assumptions": {
            "pariAnalyticBounds": True,
            "pariVersion": "2.17.4",
            "grh": True,
            "source": "authenticated field3 C4 compute_R acceptance",
        },
    }


__all__ = [
    "ANALYTIC_SCHEMA",
    "CATALOG_SCHEMA",
    "FIELD_SCHEMA",
    "Field3AcceptedC4Failure",
    "Field3AcceptedC4Retry",
    "OUTPUT_SCHEMA",
    "compose_authenticated_c4",
    "project_analytic_owner",
]
