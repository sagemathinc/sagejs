"""Honest prepared-field prefix probe for frozen development row 19.

This is intentionally a Python orchestrator over the existing translated
PARI 2.17.4 arithmetic.  Its input is only the authenticated prepared nfinit
projection.  In particular it does not accept the frozen factor-base event,
successful bounds, descriptors, relations, or terminal answers.

The probe derives all five maximal-order index-prime decompositions, merges
them with the ordinary Kummer catalog, constructs the selected prime-ideal
packets, chooses the subfactor base, and publishes PARI's initial rational
relation prefix.  It stops before random relation search.
"""

from __future__ import annotations

import json
import sys
from typing import Any

from .bad_subfactor import pari_bad_subfactor_flags
from .discriminant_log import pari_discriminant_log
from .get_fs_small import pari_get_fs_small
from .initial_base import pari_prepared_initial_base
from .initial_kummer_catalog import pari_initial_kummer_catalog
from .pari_random import pari_random_seed
from .prepared_index_prime import (
    INDEX_PRIME_WORKSPACE,
    pari_prepared_index_prime_descriptors,
)
from .relation_insertion import pari_initialize_owned_relations
from .selected_ideal_metadata import pari_selected_ideal_metadata
from .selected_ideal_packets import pari_selected_ideal_packets
from .subfactor_base import pari_prepared_subfactor_base
from .subfactor_product import pari_subfactor_product


DEGREE = 3
INDEX_PRIMES = (3, 7, 17, 23, 31)
MAX_IDEALS = 512
EXPECTED_POLYNOMIAL = (-51050867718180330, 0, 0, 1)
EXPECTED_DISCRIMINANT = -1086061775432017340256300


class Row19PreparedPrefixFailure(ValueError):
    """The prepared-only row-19 probe failed closed."""


def _integers(values: Any, length: int, label: str) -> list[int]:
    if not isinstance(values, list) or len(values) != length:
        raise Row19PreparedPrefixFailure(f"{label} changed")
    try:
        return [int(value) for value in values]
    except (TypeError, ValueError) as error:
        raise Row19PreparedPrefixFailure(f"{label} is not integral") from error


def _validate(prepared: dict[str, Any]) -> None:
    if (
        tuple(_integers(prepared.get("prep_polynomial"), 4, "polynomial"))
        != EXPECTED_POLYNOMIAL
        or int(prepared.get("analytic_discriminant", 0)) != EXPECTED_DISCRIMINANT
        or int(prepared.get("n", 0)) != DEGREE
        or int(prepared.get("admission_real_count", 0)) != 1
        or int(prepared.get("precision", 0)) != 192
        or int(prepared.get("prep_index", 0)) != 254541
        or int(prepared.get("prep_zkden", 0)) != 254541
        or int(prepared.get("analytic_roots_of_unity", 0)) != 2
        or int(prepared.get("admission_factorlimit", 0)) != 1048576
        or int(prepared.get("admission_prime_limit", 0)) != 65537
    ):
        raise Row19PreparedPrefixFailure("unsupported row-19 prepared corridor")


def _degree_catalog(
    polynomial: list[int],
    equation_index: int,
    primes: list[int],
    index_descriptors: dict[int, list[int]],
) -> tuple[list[int], ...]:
    capacity = len(primes) * DEGREE
    pattern_offsets = [0] * len(primes)
    pattern_counts = [0] * len(primes)
    pattern_degrees = [0] * capacity
    pattern_multiplicities = [0] * capacity
    full_offsets = [0] * len(primes)
    full_counts = [0] * len(primes)
    full_degrees = [0] * capacity
    factor_degrees = [0] * DEGREE
    factor_exponents = [0] * DEGREE
    group_degrees = [0] * DEGREE
    group_counts = [0] * DEGREE
    local_state = [0] * 3
    workspace = [0] * 393
    groups = 0
    factors = 0
    for position, prime in enumerate(primes):
        pattern_offsets[position] = groups
        full_offsets[position] = factors
        if equation_index % prime == 0:
            packed = index_descriptors.get(prime)
            if packed is None:
                raise Row19PreparedPrefixFailure("missing live index-prime descriptor")
            degree = packed[2]
            full_degrees[factors] = degree
            pattern_degrees[groups] = degree
            pattern_multiplicities[groups] = 1
            groups += 1
            factors += 1
            pattern_counts[position] = 1
            full_counts[position] = 1
        else:
            status = pari_get_fs_small(
                polynomial,
                DEGREE,
                equation_index,
                prime,
                workspace,
                factor_degrees,
                factor_exponents,
                group_degrees,
                group_counts,
                local_state,
            )
            if status != 0:
                raise Row19PreparedPrefixFailure("ordinary prime degree catalog failed")
            pattern_counts[position] = local_state[1]
            full_counts[position] = local_state[2]
            for index in range(local_state[1]):
                pattern_degrees[groups] = group_degrees[index]
                pattern_multiplicities[groups] = group_counts[index]
                groups += 1
            for index in range(local_state[2]):
                full_degrees[factors] = factor_degrees[index]
                factors += 1
    return (
        pattern_offsets,
        pattern_counts,
        pattern_degrees,
        pattern_multiplicities,
        full_offsets,
        full_counts,
        full_degrees,
        [0, len(primes), groups, factors],
    )


def compute_row19_prepared_prefix(prepared: dict[str, Any]) -> dict[str, Any]:
    """Derive the factor base and initial relations from prepared data only."""
    _validate(prepared)
    polynomial = _integers(prepared["prep_polynomial"], 4, "polynomial")
    table = _integers(prepared["basis_table"], 27, "basis table")
    matrix_m = _integers(prepared["admission_matrix_m"], 9, "embedding mantissas")
    matrix_p = _integers(prepared["admission_matrix_p"], 9, "embedding precisions")
    matrix_e = _integers(prepared["admission_matrix_e"], 9, "embedding exponents")
    primes = [int(value) for value in prepared["admission_primes"]]
    if (
        not primes
        or primes[-1] != 65537
        or any(primes[index] >= primes[index + 1] for index in range(len(primes) - 1))
    ):
        raise Row19PreparedPrefixFailure("neutral runtime prime prefix changed")

    index_descriptors: dict[int, list[int]] = {}
    index_states: list[list[int]] = []
    for prime in INDEX_PRIMES:
        packed = [0] * (DEGREE * 15)
        ranks = [0] * DEGREE
        state = [0] * 4
        count = pari_prepared_index_prime_descriptors(
            table,
            DEGREE,
            prime,
            1,
            matrix_m,
            matrix_p,
            matrix_e,
            [0] * INDEX_PRIME_WORKSPACE,
            packed,
            ranks,
            state,
        )
        if count != 1 or state != [0, 2, 1, 15]:
            raise Row19PreparedPrefixFailure("row-19 index-prime shape changed")
        descriptor = packed[:15]
        if descriptor[:3] != [prime, 3, 1]:
            raise Row19PreparedPrefixFailure("row-19 index-prime metadata changed")
        index_descriptors[prime] = descriptor
        index_states.append(state.copy())

    (
        pattern_offsets,
        pattern_counts,
        pattern_degrees,
        pattern_multiplicities,
        full_offsets,
        full_counts,
        full_degrees,
        degree_state,
    ) = _degree_catalog(polynomial, 254541, primes, index_descriptors)
    slots = degree_state[3]

    base_norms = [0] * 4
    base_configuration = [pari_discriminant_log(EXPECTED_DISCRIMINANT), 0.0, 0.0]
    constants_logs = [0.0] * (len(primes) + 2)
    sums = [0.0, 0.0]
    factor_logs = [0.0] * (len(primes) + 1)
    selected_primes = [0] * len(primes)
    prime_offsets = [-1] * 65538
    prime_counts = [0] * 65538
    complete_groups = [0] * 65538
    selected_indices = [0] * slots
    c1, c2, kc, kcz, kcz2, kc2, product = pari_prepared_initial_base(
        DEGREE,
        1,
        base_configuration,
        primes,
        pattern_offsets,
        pattern_counts,
        pattern_degrees,
        pattern_multiplicities,
        full_offsets,
        full_counts,
        full_degrees,
        base_norms,
        constants_logs,
        sums,
        factor_logs,
        selected_primes,
        prime_offsets,
        prime_counts,
        complete_groups,
        selected_indices,
    )
    if kcz != kcz2 or kc < 1 or kc > MAX_IDEALS:
        raise Row19PreparedPrefixFailure("row-19 factor-base admission failed")

    random_state = [0] * 66
    pari_random_seed(random_state, 1)
    saved_degrees: list[tuple[int, int]] = []
    for position, prime in enumerate(primes):
        if prime in index_descriptors:
            offset = pattern_offsets[position]
            saved_degrees.append((offset, pattern_degrees[offset]))
            pattern_degrees[offset] = DEGREE
    catalog_primes = [0] * slots
    catalog_e = [0] * slots
    catalog_f = [0] * slots
    catalog_inert = [0] * slots
    catalog_generators = [0] * (slots * DEGREE)
    catalog_tau = [0] * (slots * DEGREE * DEGREE)
    requested_counts = [0] * len(primes)
    kummer_state = [0] * 4
    written = pari_initial_kummer_catalog(
        primes,
        pattern_offsets,
        pattern_counts,
        pattern_degrees,
        pattern_multiplicities,
        full_offsets,
        len(primes),
        c2,
        polynomial,
        _integers(prepared["prep_invzk"], 9, "invzk"),
        _integers(prepared["prep_zk"], 9, "zk"),
        _integers(prepared["prep_zk_degrees"], 3, "zk degrees"),
        table,
        DEGREE,
        254541,
        254541,
        random_state,
        [0] * 16994,
        [0] * 4,
        [0] * 3,
        [0],
        [0] * 64,
        [0] * 3,
        [0] * 3,
        [0] * 6,
        [0] * 3,
        [0] * 3,
        [0] * 12,
        [0] * 25,
        [0] * 3,
        [0] * 9,
        [0] * 12,
        [0] * (DEGREE * (4 + DEGREE + DEGREE * DEGREE)),
        [0] * 9,
        [0] * 3,
        [0] * 3,
        [0] * 2,
        [0] * (DEGREE * (4 + DEGREE + DEGREE * DEGREE)),
        [0] * 3,
        catalog_primes,
        catalog_e,
        catalog_f,
        catalog_inert,
        catalog_generators,
        catalog_tau,
        requested_counts,
        kummer_state,
    )
    for offset, degree in saved_degrees:
        pattern_degrees[offset] = degree
    for position, prime in enumerate(primes):
        descriptor = index_descriptors.get(prime)
        if descriptor is None:
            continue
        slot = full_offsets[position]
        catalog_primes[slot] = descriptor[0]
        catalog_e[slot] = descriptor[1]
        catalog_f[slot] = descriptor[2]
        catalog_inert[slot] = 0
        catalog_generators[slot * DEGREE : (slot + 1) * DEGREE] = descriptor[3:6]
        # Packed descriptor tau is column-major; catalog tau is row-major.
        for row in range(DEGREE):
            for column in range(DEGREE):
                catalog_tau[slot * 9 + row * 3 + column] = descriptor[
                    6 + column * 3 + row
                ]
        requested_counts[position] = 1
        written += 1
    kummer_state[3] = written
    if written != kc:
        raise Row19PreparedPrefixFailure("generated descriptor count mismatch")

    packet_ideals = [0] * (kc * 9)
    packet_norms = [0] * kc
    pari_selected_ideal_packets(
        table,
        catalog_primes,
        catalog_f,
        catalog_inert,
        catalog_generators,
        slots,
        selected_indices,
        kc,
        DEGREE,
        [0] * 3,
        [0] * 9,
        [0] * 9,
        [0] * 3,
        [0] * 9,
        packet_ideals,
        packet_norms,
    )
    relation_primes = [0] * kc
    ramification = [0] * kc
    residue_degrees = [0] * kc
    inert_flags = [0] * kc
    selected_tau = [0] * (kc * 9)
    pari_selected_ideal_metadata(
        catalog_primes,
        catalog_e,
        catalog_f,
        catalog_inert,
        catalog_tau,
        slots,
        selected_indices,
        kc,
        DEGREE,
        relation_primes,
        ramification,
        residue_degrees,
        inert_flags,
        selected_tau,
    )

    rational_primes = selected_primes[:kcz]
    group_offsets = [prime_offsets[prime] for prime in rational_primes]
    group_counts = [prime_counts[prime] for prime in rational_primes]
    group_complete = [complete_groups[prime] for prime in rational_primes]
    bad = [0] * kc
    pari_bad_subfactor_flags(group_offsets, group_counts, group_complete, kcz, kc, bad)
    sub_configuration = [pari_subfactor_product(DEGREE, 1, base_configuration[0], c2)]
    permutation = [0] * kc
    subcount, sublimit, sublimit2 = pari_prepared_subfactor_base(
        packet_norms,
        bad,
        sub_configuration,
        3,
        [0] * kc,
        [0] * kc,
        [0] * (3 * kc + 3),
        [0] * kc,
        [0] * kc,
        permutation,
    )
    subfactor = permutation[:subcount]

    additional = 6  # 5 + unit rank (1 + 1 - 1).
    target = kc + additional
    capacity = 10 * target + 50
    relation_state = [0] * 6
    relation_basis = [0] * (kc * kc)
    relation_records = [0] * (capacity * kc)
    relation_hashes = [0] * capacity
    relation_metadata = [0] * (capacity * 3)
    relation_generators = [0] * (capacity * DEGREE)
    initial_count = pari_initialize_owned_relations(
        additional,
        rational_primes,
        group_offsets,
        group_counts,
        group_complete,
        ramification,
        relation_state,
        relation_basis,
        relation_records,
        relation_hashes,
        relation_metadata,
        [0] * kc,
        [0] * kc,
        DEGREE,
        relation_generators,
    )
    if initial_count > capacity:
        raise Row19PreparedPrefixFailure("initial relation count exceeds capacity")
    return {
        "schema": "sagejs.pari-class-group/row19-prepared-prefix-probe-v1",
        "field": {
            "polynomial": [str(value) for value in polynomial],
            "discriminant": str(EXPECTED_DISCRIMINANT),
            "signature": [1, 1],
            "equationIndex": "254541",
        },
        "factor": {
            "C1": c1,
            "C2": c2,
            "KC": kc,
            "KCZ": kcz,
            "KCZ2": kcz2,
            "KC2": kc2,
            "prodZ": str(product),
            "selectedIndices": selected_indices[:kc],
            "primes": relation_primes,
            "ramification": ramification,
            "residueDegrees": residue_degrees,
            "inert": inert_flags,
            "generators": [
                catalog_generators[index * 3 : index * 3 + 3]
                for index in selected_indices[:kc]
            ],
            "tau": selected_tau,
            "packetIdeals": packet_ideals,
            "packetNorms": packet_norms,
            "rationalPrimes": rational_primes,
            "groupOffsets": group_offsets,
            "groupCounts": group_counts,
            "groupComplete": group_complete,
            "bad": bad,
            "permutation": permutation,
            "subfactor": subfactor,
            "subLimits": [sublimit, sublimit2],
        },
        "relations": {
            "initialCount": initial_count,
            "target": target,
            "need": target - initial_count,
            "Nrelid": 4,
            "missing": relation_state[2],
            "state": relation_state,
            "basis": relation_basis,
            "records": relation_records[: initial_count * kc],
            "hashes": relation_hashes[:initial_count],
            "metadata": relation_metadata[: initial_count * 3],
            "generators": relation_generators[: initial_count * DEGREE],
        },
        "diagnostic": {
            "degreeState": degree_state,
            "indexPrimeStates": index_states,
            "kummerState": kummer_state,
            "rng": random_state,
            "oracleDataConsumed": False,
            "stoppedBeforeRandomRelationSearch": True,
        },
    }


def main() -> None:
    prepared = json.load(sys.stdin)
    if not isinstance(prepared, dict):
        raise Row19PreparedPrefixFailure("prepared input is not an object")
    json.dump(
        compute_row19_prepared_prefix(prepared), sys.stdout, separators=(",", ":")
    )
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
