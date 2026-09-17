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
import hashlib
import json
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
from .flx_small_factor import pari_flx_small_factor_workspace_size
from .prime_degree_catalog import pari_prime_degree_catalog
from .regulator_multiple import pari_regulator_multiple


FIELD = "x^4-2000022*x-2000042"
RUN_IDENTITY = "pari-2.17.4:nfinit192->nfnewprec153088:field3"
FULL_SCHEMA = "sagejs.pari-class-group/field3-full-terminal-ancestry-v1"
C3_SCHEMA = "sagejs.pari-class-group/field3-high-precision-A-v1"
FIELD_SCHEMA = "sagejs.pari-class-group/field3-analytic-field-v1"
CATALOG_SCHEMA = "sagejs.pari-class-group/field3-analytic-prime-catalog-v1"
OUTPUT_SCHEMA = "sagejs.pari-class-group/field3-accepted-c4-v1"
ANALYTIC_SCHEMA = "sagejs.pari-class-group/field3-analytic-accepted-owner-v1"
TEST_FIELD_SCHEMA = "sagejs.pari-class-group/test-field3-analytic-field-v1"
TEST_CATALOG_SCHEMA = "sagejs.pari-class-group/test-field3-analytic-prime-catalog-v1"
TEST_OUTPUT_SCHEMA = "sagejs.pari-class-group/test-field3-accepted-c4-v1"
TEST_ANALYTIC_SCHEMA = "sagejs.pari-class-group/test-field3-analytic-accepted-owner-v1"
PREPARED_SCHEMA = "sagejs.pari-class-group/field3-prepared-embedding-owner-v1"
TEST_PREPARED_SCHEMA = "sagejs.pari-class-group/test-field3-prepared-embedding-owner-v1"
TEST_INITIAL_SCHEMA = (
    "sagejs.pari-class-group/test-field3-initial-catalog-consequences-v1"
)
TEST_AUTHORITY_SCHEMA = "sagejs.pari-class-group/test-field3-catalog-authority-v1"
AUTHORITY_SHA256 = "246bfe2af51c8be732308719773fc7d696f7dc1bf21958c91d96cd8fc448954c"
INITIAL_SHA256 = "81b9d3b237e781a697f0ae170554426b363ec2235297407be1deed38ebbbc6fe"
PREPARED_IDENTITY_SHA256 = (
    "bc0dfbca45a575a381ba87371fb27906f68b34cedd025435986fad4c7c6287cf"
)
PRODUCTION_BITS = 153088
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


def _semantic_sha256(value: Any) -> str:
    return hashlib.sha256(
        json.dumps(value, separators=(",", ":"), ensure_ascii=False).encode()
    ).hexdigest()


def _determinant(matrix: Sequence[Sequence[int]]) -> int:
    size = len(matrix)
    work = [list(row) for row in matrix]
    denominator = 1
    sign = 1
    for pivot_index in range(size - 1):
        if work[pivot_index][pivot_index] == 0:
            swap = next(
                (
                    row
                    for row in range(pivot_index + 1, size)
                    if work[row][pivot_index] != 0
                ),
                -1,
            )
            if swap < 0:
                return 0
            work[pivot_index], work[swap] = work[swap], work[pivot_index]
            sign = -sign
        pivot = work[pivot_index][pivot_index]
        for row in range(pivot_index + 1, size):
            for column in range(pivot_index + 1, size):
                numerator = (
                    work[row][column] * pivot
                    - work[row][pivot_index] * work[pivot_index][column]
                )
                if numerator % denominator:
                    raise Field3AcceptedC4Failure("nonintegral trace determinant")
                work[row][column] = numerator // denominator
        denominator = pivot
    return sign * work[-1][-1]


def _tensor_discriminant(tensor: Sequence[int]) -> int:
    if len(tensor) != 64:
        raise Field3AcceptedC4Failure("multiplication tensor shape changed")
    matrices = []
    for basis in range(4):
        block = tensor[16 * basis : 16 * basis + 16]
        matrices.append(
            [[block[4 * column + row] for column in range(4)] for row in range(4)]
        )
    trace_pairing = [
        [
            sum(
                matrices[left][row][inner] * matrices[right][inner][row]
                for row in range(4)
                for inner in range(4)
            )
            for right in range(4)
        ]
        for left in range(4)
    ]
    discriminant = _determinant(trace_pairing)
    if discriminant >= 0:
        raise Field3AcceptedC4Failure("trace discriminant has the wrong signature")
    return -discriminant


def _prime_power_degree(norm: int, prime: int) -> int:
    """Return `f` for an authenticated prime-ideal norm `prime**f`."""
    degree = 0
    while norm > 1 and norm % prime == 0:
        norm //= prime
        degree += 1
    if norm != 1 or degree < 1:
        raise Field3AcceptedC4Failure("authority packet norm is not a prime power")
    return degree


def _production_prime_catalog(
    polynomial: Sequence[int],
    equation_index: int,
    residue_bound: int,
    source: Mapping[str, Any],
    owners: Mapping[str, Any],
) -> tuple[list[int], list[int], list[int], list[int], list[int]]:
    """Derive the GRH catalog from source code plus exact bad-prime packets.

    The collector's `admission_*` outputs are a factor-base admission
    schedule, not the analytic prime catalog. Only its authenticated rational
    prime stream is reused here. Ordinary splitting patterns are recomputed
    from the defining polynomial. Primes dividing the equation index cannot
    use that polynomial-mod-p path, so their residue degrees are independently
    recovered from the authority's exact prime-ideal norms.
    """
    all_primes = [
        _integer(value, "catalog rational prime")
        for value in source.get("admission_primes", [])
    ]
    if not all_primes or all_primes[0] != 2:
        raise Field3AcceptedC4Failure("authenticated rational-prime stream changed")
    for index in range(1, len(all_primes)):
        if all_primes[index - 1] >= all_primes[index]:
            raise Field3AcceptedC4Failure("rational-prime stream is not increasing")
    prime_count = 0
    while prime_count < len(all_primes) and all_primes[prime_count] <= residue_bound:
        prime_count += 1
    if prime_count == len(all_primes):
        raise Field3AcceptedC4Failure("catalog lacks a prime beyond the residue bound")
    primes = all_primes[: prime_count + 1]

    packet_primes = _integers(
        owners.get("packetPrimes"), len(owners.get("packetPrimes", [])), "packet primes"
    )
    packet_norms = _integers(
        owners.get("packetNorms"), len(owners.get("packetNorms", [])), "packet norms"
    )
    relation_primes = _integers(
        owners.get("relationPrimes"),
        len(owners.get("relationPrimes", [])),
        "authority primes",
    )
    ramification = _integers(
        owners.get("ramification"),
        len(owners.get("ramification", [])),
        "authority ramification",
    )
    packet_ids = _integers(
        owners.get("packetIds"), len(owners.get("packetIds", [])), "packet ids"
    )
    if (
        len(packet_primes) != len(packet_norms)
        or packet_primes != relation_primes
        or len(packet_primes) != len(ramification)
        or packet_ids != list(range(1, len(packet_ids) + 1))
        or len(packet_ids) != len(packet_primes)
    ):
        raise Field3AcceptedC4Failure("prime-ideal packet authority detached")

    ordinary_primes = [prime for prime in primes if equation_index % prime != 0]
    ordinary_count = len(ordinary_primes)
    degree = len(polynomial) - 1
    capacity = ordinary_count * degree
    workspace = [0] * (9 + pari_flx_small_factor_workspace_size())
    factor_degrees = [0] * degree
    factor_exponents = [0] * degree
    group_degrees = [0] * degree
    group_counts = [0] * degree
    local_state = [0] * 3
    pattern_offsets = [0] * ordinary_count
    pattern_counts = [0] * ordinary_count
    pattern_degrees = [0] * capacity
    pattern_multiplicities = [0] * capacity
    full_offsets = [0] * ordinary_count
    full_counts = [0] * ordinary_count
    full_degrees = [0] * capacity
    state = [0] * 4
    status = pari_prime_degree_catalog(
        list(polynomial),
        degree,
        equation_index,
        ordinary_primes,
        ordinary_count,
        workspace,
        factor_degrees,
        factor_exponents,
        group_degrees,
        group_counts,
        local_state,
        pattern_offsets,
        pattern_counts,
        pattern_degrees,
        pattern_multiplicities,
        full_offsets,
        full_counts,
        full_degrees,
        state,
    )
    if status != 0 or state[0] != 0 or state[1] != ordinary_count:
        raise Field3AcceptedC4Failure("source-derived prime catalog failed")
    ordinary_patterns: dict[int, tuple[list[int], list[int]]] = {}
    for index, prime in enumerate(ordinary_primes):
        start = pattern_offsets[index]
        stop = start + pattern_counts[index]
        ordinary_patterns[prime] = (
            pattern_degrees[start:stop],
            pattern_multiplicities[start:stop],
        )

    offsets: list[int] = []
    counts: list[int] = []
    degrees: list[int] = []
    multiplicities: list[int] = []
    for prime in primes:
        if equation_index % prime != 0:
            local_degrees, local_counts = ordinary_patterns[prime]
        else:
            factors = []
            weighted_degree = 0
            for packet_prime, packet_norm, exponent in zip(
                packet_primes, packet_norms, ramification
            ):
                if packet_prime == prime:
                    residue_degree = _prime_power_degree(packet_norm, prime)
                    factors.append(residue_degree)
                    weighted_degree += exponent * residue_degree
            if not factors or weighted_degree != degree:
                raise Field3AcceptedC4Failure(
                    "index-prime packets do not give a complete decomposition"
                )
            factors.sort()
            local_degrees = []
            local_counts = []
            for residue_degree in factors:
                if local_degrees and local_degrees[-1] == residue_degree:
                    local_counts[-1] += 1
                else:
                    local_degrees.append(residue_degree)
                    local_counts.append(1)
        offsets.append(len(degrees))
        counts.append(len(local_degrees))
        degrees.extend(local_degrees)
        multiplicities.extend(local_counts)
    return primes, offsets, counts, degrees, multiplicities


def derive_analytic_inputs(
    prepared_owner: Mapping[str, Any],
    initial_owner: Mapping[str, Any],
    authority_owner: Mapping[str, Any],
    prepared_file_sha256: str,
    initial_file_sha256: str,
    authority_file_sha256: str,
    profile: str,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Derive analytic field/catalog owners from authenticated consequences."""
    prepared = _mapping(prepared_owner, "prepared embedding owner")
    initial_raw = _mapping(initial_owner, "initial collector owner")
    authority_raw = _mapping(authority_owner, "catalog authority owner")
    prepared_file_sha = _sha256(prepared_file_sha256, "prepared file digest")
    initial_sha = _sha256(initial_file_sha256, "initial file digest")
    authority_sha = _sha256(authority_file_sha256, "authority file digest")
    if profile == "production":
        if initial_sha != INITIAL_SHA256 or authority_sha != AUTHORITY_SHA256:
            raise Field3AcceptedC4Failure("production source content address changed")
        if prepared.get("schema") != PREPARED_SCHEMA:
            raise Field3AcceptedC4Failure("wrong production prepared schema")
        if prepared.get("runIdentity") != RUN_IDENTITY:
            raise Field3AcceptedC4Failure("wrong production prepared identity")
        requested = _integer(prepared.get("requestedBits"), "prepared bits")
        if (
            requested != PRODUCTION_BITS
            or _integer(prepared.get("makeMRootPrecisionBits"), "root bits")
            != PRODUCTION_BITS + 64
            or prepared.get("makeMTruncation") is not False
        ):
            raise Field3AcceptedC4Failure("production prepared precision changed")
        identity = {
            "polynomial": prepared.get("polynomial"),
            "signature": prepared.get("signature"),
            "zkden": prepared.get("zkden"),
            "zk": prepared.get("zk"),
            "tensor": prepared.get("tensor"),
            "requestedBits": prepared.get("requestedBits"),
            "makeMRootPrecisionBits": prepared.get("makeMRootPrecisionBits"),
            "makeMTruncation": prepared.get("makeMTruncation"),
            "makeMRootState": prepared.get("roots"),
        }
        prepared_identity_sha = _semantic_sha256(identity)
        if prepared_identity_sha != PREPARED_IDENTITY_SHA256:
            raise Field3AcceptedC4Failure("production prepared identity changed")
        expected_values = initial_raw.get("expected")
        native_inputs = initial_raw.get("nativeInputs")
        if not isinstance(expected_values, list) or not isinstance(native_inputs, list):
            raise Field3AcceptedC4Failure("initial collector shape changed")
        expected = _mapping(expected_values[0], "field-3 initial consequence")
        native = _mapping(native_inputs[0], "field-3 native input")
        source = _mapping(native.get("input"), "field-3 native input payload")
        authority = _mapping(authority_raw.get("authority"), "field-3 authority")
        owners = _mapping(authority.get("owners"), "field-3 authority owners")
        if authority.get("state") != [
            0,
            288,
            301,
            4,
            3,
            288,
            86688,
            82944,
            903,
            1204,
            6321,
            4608,
            1152,
            66,
            4,
            2,
            286,
            301,
            4,
            292,
            576,
            62,
            48,
            3000,
        ]:
            raise Field3AcceptedC4Failure("frozen authority state changed")
        equation_index = _integer(prepared.get("zkden"), "prepared equation index")
    elif profile == "synthetic-test":
        if (
            prepared.get("schema") != TEST_PREPARED_SCHEMA
            or initial_raw.get("schema") != TEST_INITIAL_SCHEMA
            or authority_raw.get("schema") != TEST_AUTHORITY_SCHEMA
            or prepared.get("testOnly") is not True
            or initial_raw.get("testOnly") is not True
            or authority_raw.get("testOnly") is not True
        ):
            raise Field3AcceptedC4Failure("synthetic source is not test-only")
        run_identity = prepared.get("runIdentity")
        if not isinstance(run_identity, str) or not run_identity.startswith(
            "synthetic-c4-low-"
        ):
            raise Field3AcceptedC4Failure("wrong synthetic run identity")
        requested = _integer(prepared.get("requestedBits"), "prepared bits")
        if requested not in (64, 192):
            raise Field3AcceptedC4Failure("unsupported synthetic precision")
        prepared_identity_sha = _semantic_sha256(prepared)
        expected = initial_raw
        source = initial_raw
        owners = authority_raw
        authority_primes = owners.get("relationPrimes")
        authority_e = owners.get("ramification")
    else:
        raise Field3AcceptedC4Failure("unknown derivation profile")

    polynomial_value = prepared.get("polynomial")
    signature_value = prepared.get("signature")
    tensor_value = prepared.get("tensor")
    polynomial = _integers(polynomial_value, 5, "prepared polynomial")
    signature = _integers(signature_value, 2, "prepared signature")
    tensor = _integers(tensor_value, 64, "prepared tensor")
    basis_table = _integers(expected.get("basisTable"), 64, "initial tensor")
    if tensor != basis_table or polynomial != [-2000042, -2000022, 0, 0, 1]:
        raise Field3AcceptedC4Failure("prepared field detached from initial collector")
    if signature != [2, 1]:
        raise Field3AcceptedC4Failure("prepared signature changed")
    residue_bound = _integer(expected.get("residueBound"), "residue bound")
    if residue_bound != 6144:
        raise Field3AcceptedC4Failure("analytic residue bound changed")
    if profile == "production":
        primes, offsets, counts, degrees, multiplicities = _production_prime_catalog(
            polynomial, equation_index, residue_bound, source, owners
        )
    else:
        all_primes = [
            _integer(x, "admission prime") for x in source.get("admission_primes", [])
        ]
        prime_count = sum(prime <= residue_bound for prime in all_primes) + 1
        if prime_count > len(all_primes):
            raise Field3AcceptedC4Failure(
                "catalog lacks a prime beyond the residue bound"
            )
        primes = all_primes[:prime_count]
        offsets = _integers(
            source.get("admission_prime_offsets"),
            len(source.get("admission_prime_offsets", [])),
            "prime offsets",
        )[:prime_count]
        counts = _integers(
            source.get("admission_prime_counts"),
            len(source.get("admission_prime_counts", [])),
            "prime counts",
        )[:prime_count]
        ideal_count = max(offset + count for offset, count in zip(offsets, counts))
        degrees = _integers(
            source.get("admission_group_f"),
            len(source.get("admission_group_f", [])),
            "residue degrees",
        )[:ideal_count]
        multiplicities = _integers(
            source.get("admission_group_e"),
            len(source.get("admission_group_e", [])),
            "ramification multiplicities",
        )[:ideal_count]
        relation_primes = _integers(
            authority_primes, len(authority_primes or []), "authority primes"
        )
        ramification = _integers(
            authority_e, len(authority_e or []), "authority ramification"
        )
        expanded_primes = [
            prime
            for prime, offset, count in zip(primes, offsets, counts)
            for _ in range(count)
        ]
        if (
            relation_primes[:ideal_count] != expanded_primes
            or ramification[:ideal_count] != multiplicities
        ):
            raise Field3AcceptedC4Failure("catalog detached from relation authority")
    field_schema = FIELD_SCHEMA if profile == "production" else TEST_FIELD_SCHEMA
    catalog_schema = CATALOG_SCHEMA if profile == "production" else TEST_CATALOG_SCHEMA
    run_identity = prepared.get("runIdentity")
    field = {
        "schema": field_schema,
        "field": FIELD,
        "runIdentity": run_identity,
        "targetBits": str(requested),
        "testOnly": profile != "production",
        "polynomial": [str(value) for value in polynomial],
        "discriminant": str(_tensor_discriminant(tensor)),
        "degree": "4",
        "realPlaces": "2",
        "complexPlaces": "1",
        "rootsOfUnity": "2",
        "preparedFileSha256": prepared_file_sha,
        "preparedIdentitySha256": prepared_identity_sha,
        "initialOwnerSha256": initial_sha,
        "authorityOwnerSha256": authority_sha,
    }
    # Filled by the coordinator after the field owner receives its content address.
    catalog = {
        "schema": catalog_schema,
        "field": FIELD,
        "runIdentity": run_identity,
        "targetBits": str(requested),
        "testOnly": profile != "production",
        "fieldOwnerSha256": "",
        "preparedFileSha256": prepared_file_sha,
        "preparedIdentitySha256": prepared_identity_sha,
        "initialOwnerSha256": initial_sha,
        "authorityOwnerSha256": authority_sha,
        "residueBound": str(residue_bound),
        "primes": [str(value) for value in primes],
        "offsets": [str(value) for value in offsets],
        "counts": [str(value) for value in counts],
        "degrees": [str(value) for value in degrees],
        "multiplicities": [str(value) for value in multiplicities],
    }
    return field, catalog


def _authenticate_identity(
    full: Mapping[str, Any],
    c3: Mapping[str, Any],
    field: Mapping[str, Any],
    catalog: Mapping[str, Any],
) -> tuple[str, str, int]:
    if full.get("schema") != FULL_SCHEMA or c3.get("schema") != C3_SCHEMA:
        raise Field3AcceptedC4Failure("wrong terminal/C3 schema")
    production = (
        field.get("schema") == FIELD_SCHEMA and catalog.get("schema") == CATALOG_SCHEMA
    )
    synthetic = (
        field.get("schema") == TEST_FIELD_SCHEMA
        and catalog.get("schema") == TEST_CATALOG_SCHEMA
    )
    if not production and not synthetic:
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
    if field_name != FIELD:
        raise Field3AcceptedC4Failure("unsupported field-3 identity")
    precision = _integer(c3.get("targetBits"), "C3 precision")
    if production:
        if (
            run_identity != RUN_IDENTITY
            or precision != PRODUCTION_BITS
            or field.get("testOnly") is not False
            or catalog.get("testOnly") is not False
        ):
            raise Field3AcceptedC4Failure("production identity requires 153088 bits")
    elif (
        not run_identity.startswith("synthetic-c4-low-")
        or precision not in (64, 192)
        or field.get("testOnly") is not True
        or catalog.get("testOnly") is not True
    ):
        raise Field3AcceptedC4Failure("invalid synthetic C4 identity")
    if (
        _integer(field.get("targetBits"), "field target bits") != precision
        or _integer(catalog.get("targetBits"), "catalog target bits") != precision
    ):
        raise Field3AcceptedC4Failure("analytic input precision diverged")
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
        "targetBits",
        "testOnly",
        "preparedFileSha256",
        "preparedIdentitySha256",
        "initialOwnerSha256",
        "authorityOwnerSha256",
    }
    required_catalog = {
        "schema",
        "field",
        "runIdentity",
        "fieldOwnerSha256",
        "targetBits",
        "testOnly",
        "preparedFileSha256",
        "preparedIdentitySha256",
        "initialOwnerSha256",
        "authorityOwnerSha256",
        "residueBound",
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
    for key in (
        "preparedFileSha256",
        "preparedIdentitySha256",
        "initialOwnerSha256",
        "authorityOwnerSha256",
    ):
        value = _sha256(field.get(key), key)
        if catalog.get(key) != value:
            raise Field3AcceptedC4Failure(f"catalog detached at {key}")
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
    if state[0] != _integer(catalog.get("residueBound"), "residue bound"):
        raise Field3AcceptedC4Failure("analytic residue consequence changed")
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
    output_schema = (
        OUTPUT_SCHEMA if field.get("schema") == FIELD_SCHEMA else TEST_OUTPUT_SCHEMA
    )
    return {
        "schema": output_schema,
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
        "testOnly": output_schema == TEST_OUTPUT_SCHEMA,
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
    accepted_c4: Mapping[str, Any],
    accepted_c4_sha256: str,
    full_owner: Mapping[str, Any],
    c3_owner: Mapping[str, Any],
    field_owner: Mapping[str, Any],
    catalog_owner: Mapping[str, Any],
    full_owner_sha256: str,
    c3_owner_sha256: str,
    field_owner_sha256: str,
    catalog_owner_sha256: str,
) -> dict[str, Any]:
    """Return C7's view after reauthenticating C4's complete ancestry."""
    owner = _mapping(accepted_c4, "accepted C4 owner")
    digest = _sha256(accepted_c4_sha256, "accepted C4 digest")
    full = _mapping(full_owner, "full terminal owner")
    c3 = _mapping(c3_owner, "C3 owner")
    field = _mapping(field_owner, "field owner")
    catalog = _mapping(catalog_owner, "catalog owner")
    supplied = {
        "fullTerminalOwnerSha256": _sha256(full_owner_sha256, "full terminal digest"),
        "c3OwnerSha256": _sha256(c3_owner_sha256, "C3 digest"),
        "fieldOwnerSha256": _sha256(field_owner_sha256, "field digest"),
        "catalogOwnerSha256": _sha256(catalog_owner_sha256, "catalog digest"),
    }
    for key, value in supplied.items():
        if owner.get(key) != value:
            raise Field3AcceptedC4Failure(f"C4 ancestry changed at {key}")
    if catalog.get("fieldOwnerSha256") != supplied["fieldOwnerSha256"]:
        raise Field3AcceptedC4Failure("catalog detached from field owner")
    field_name, run_identity, source_precision = _authenticate_identity(
        full, c3, field, catalog
    )
    _, packed_a, _ = _authenticate_terminal_and_c3(full, c3, source_precision)
    c3_latches = list(pari_field3_regulator_owner_latches(packed_a, 273))
    if _integers(owner.get("c3Latches"), 2, "C3 latches") != c3_latches:
        raise Field3AcceptedC4Failure("C4 C3 latches changed")
    if _integers(owner.get("c3Hash"), 4, "C3 hash") != _hash_words(
        supplied["c3OwnerSha256"]
    ):
        raise Field3AcceptedC4Failure("C4 C3 content-address latch changed")
    _, analytic_state = _analytic_preparation(field, catalog)
    if (
        _integers(owner.get("analyticOwnerState"), 6, "analytic owner state")
        != analytic_state
    ):
        raise Field3AcceptedC4Failure("C4 analytic owner state changed")
    _, _, multiple_state = _regulator_multiple(packed_a)
    if _integers(owner.get("multipleState"), 4, "multiple state") != multiple_state:
        raise Field3AcceptedC4Failure("C4 regulator-multiple state changed")
    expected_schema = (
        OUTPUT_SCHEMA if field.get("schema") == FIELD_SCHEMA else TEST_OUTPUT_SCHEMA
    )
    if (
        owner.get("schema") != expected_schema
        or owner.get("candidatePublished") is not True
        or owner.get("analyticPending") is not False
        or owner.get("testOnly") is not (expected_schema == TEST_OUTPUT_SCHEMA)
    ):
        raise Field3AcceptedC4Failure("C4 owner was not accepted")
    analytic = _mapping(owner.get("analytic"), "analytic acceptance")
    if analytic.get("status") != "accepted" or analytic.get("badCheckStatus") != 0:
        raise Field3AcceptedC4Failure("C4 analytic gate was not accepted")
    state = _integers(owner.get("acceptanceState"), 4, "acceptance state")
    precision = _integer(owner.get("precision"), "accepted precision")
    generation = _integer(owner.get("generation"), "accepted generation")
    if (
        owner.get("field") != field_name
        or owner.get("runIdentity") != run_identity
        or state[0] != 0
        or state[1] != generation
        or generation < 1
        or state[2] != precision
        or state[3] != 1
        or precision != source_precision
    ):
        raise Field3AcceptedC4Failure("C4 acceptance state changed")
    if _integers(owner.get("computeRState"), 6, "compute_R state") != [
        0,
        0,
        0,
        0,
        1,
        precision,
    ]:
        raise Field3AcceptedC4Failure("C4 compute_R acceptance latch changed")
    # A projection is an authenticated adapter, not an endorsement of values
    # copied from its input.  Replay the complete C4 derivation and require the
    # supplied payload to be exactly the result of that computation.  This
    # covers every candidate value as well as all state and ancestry fields.
    recomputed = compose_authenticated_c4(
        full,
        c3,
        field,
        catalog,
        supplied["fullTerminalOwnerSha256"],
        supplied["c3OwnerSha256"],
        supplied["fieldOwnerSha256"],
        supplied["catalogOwnerSha256"],
    )
    if dict(owner) != recomputed:
        raise Field3AcceptedC4Failure("C4 payload diverged from authenticated replay")
    ancestry = supplied
    return {
        "schema": (
            ANALYTIC_SCHEMA
            if expected_schema == OUTPUT_SCHEMA
            else TEST_ANALYTIC_SCHEMA
        ),
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
        "testOnly": expected_schema == TEST_OUTPUT_SCHEMA,
        "c3Hash": [str(value) for value in _hash_words(supplied["c3OwnerSha256"])],
        "c3Latches": [str(value) for value in c3_latches],
        "analyticOwnerState": [str(value) for value in analytic_state],
        "multipleState": [str(value) for value in multiple_state],
        "acceptanceState": [str(value) for value in state],
        "computeRState": [str(value) for value in [0, 0, 0, 0, 1, precision]],
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
    "TEST_ANALYTIC_SCHEMA",
    "TEST_CATALOG_SCHEMA",
    "TEST_FIELD_SCHEMA",
    "TEST_OUTPUT_SCHEMA",
    "compose_authenticated_c4",
    "derive_analytic_inputs",
    "project_analytic_owner",
]
