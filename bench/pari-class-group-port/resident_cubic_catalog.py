"""Prepared degree-three catalogs including equation-index primes.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

This factors the maximal-order splice first exercised by the row-6 prepared
root into a field-neutral resident dependency.  Ordinary primes retain the
defining-polynomial Kummer path.  Primes dividing the equation-order index use
the prepared maximal-order radical, quotient, and descriptor graph.
"""

from math import log

from sagejs.native import (
    IntegerBuffer,
    checked_float64,
    integer_buffer_view,
    native,
)

from .get_fs_small import pari_get_fs_small
from .kummer_prime_decomposition import pari_kummer_prime_decomposition
from .prepared_index_prime import pari_prepared_index_prime_descriptors


@native
def pari_resident_cubic_degree_catalog(
    coefficients: IntegerBuffer,
    equation_index: int,
    table: IntegerBuffer,
    real_places: int,
    matrix_m: IntegerBuffer,
    matrix_p: IntegerBuffer,
    matrix_e: IntegerBuffer,
    primes: IntegerBuffer,
    prime_count: int,
    index_workspace: IntegerBuffer,
    index_descriptors: IntegerBuffer,
    index_ranks: IntegerBuffer,
    index_state: IntegerBuffer,
    workspace: IntegerBuffer,
    factor_degrees: IntegerBuffer,
    factor_exponents: IntegerBuffer,
    group_degrees: IntegerBuffer,
    group_counts: IntegerBuffer,
    local_state: IntegerBuffer,
    pattern_offsets: IntegerBuffer,
    pattern_counts: IntegerBuffer,
    pattern_degrees: IntegerBuffer,
    pattern_multiplicities: IntegerBuffer,
    full_offsets: IntegerBuffer,
    full_counts: IntegerBuffer,
    full_degrees: IntegerBuffer,
    state: IntegerBuffer,
) -> int:
    """Fill the cubic get_fs catalog from prepared maximal-order data."""
    degree = 3
    capacity = prime_count * degree
    if (
        equation_index < 1
        or real_places < 1
        or real_places > degree
        or len(coefficients) < 4
        or len(table) < 27
        or len(matrix_m) < 9
        or len(matrix_p) < 9
        or len(matrix_e) < 9
        or len(primes) < prime_count
        # Keep the translated prepared-index-prime workspace bound literal:
        # native import lowering intentionally imports functions, not globals.
        or len(index_workspace) < 12000
        or len(index_descriptors) < 45
        or len(index_ranks) < 3
        or len(index_state) < 4
        or len(pattern_offsets) < prime_count
        or len(pattern_counts) < prime_count
        or len(pattern_degrees) < capacity
        or len(pattern_multiplicities) < capacity
        or len(full_offsets) < prime_count
        or len(full_counts) < prime_count
        or len(full_degrees) < capacity
        or len(state) < 4
    ):
        raise ValueError("short resident cubic degree catalog")
    state[0] = -1
    state[1] = 0
    state[2] = 0
    state[3] = 0
    groups = 0
    factors = 0
    for position in range(prime_count):
        prime = primes[position]
        pattern_offsets[position] = groups
        full_offsets[position] = factors
        if equation_index % prime == 0:
            count = pari_prepared_index_prime_descriptors(
                table,
                degree,
                prime,
                real_places,
                matrix_m,
                matrix_p,
                matrix_e,
                index_workspace,
                index_descriptors,
                index_ranks,
                index_state,
            )
            previous = 0
            for j in range(count):
                residue_degree = index_descriptors[j * 15 + 2]
                if (
                    residue_degree < previous
                    or residue_degree < 1
                    or residue_degree > degree
                ):
                    raise ValueError("unsorted resident index-prime decomposition")
                full_degrees[factors] = residue_degree
                factors += 1
                if j == 0 or residue_degree != previous:
                    pattern_degrees[groups] = residue_degree
                    pattern_multiplicities[groups] = 1
                    groups += 1
                else:
                    pattern_multiplicities[groups - 1] += 1
                previous = residue_degree
            pattern_counts[position] = groups - pattern_offsets[position]
            full_counts[position] = count
        else:
            result = pari_get_fs_small(
                coefficients,
                degree,
                equation_index,
                prime,
                workspace,
                factor_degrees,
                factor_exponents,
                group_degrees,
                group_counts,
                local_state,
            )
            if result != 0:
                raise ValueError("resident ordinary degree catalog frontier")
            pattern_counts[position] = local_state[1]
            full_counts[position] = local_state[2]
            for j in range(local_state[1]):
                pattern_degrees[groups] = group_degrees[j]
                pattern_multiplicities[groups] = group_counts[j]
                groups += 1
            for j in range(local_state[2]):
                full_degrees[factors] = factor_degrees[j]
                factors += 1
    state[0] = 0
    state[1] = prime_count
    state[2] = groups
    state[3] = factors
    return 0


@native
def pari_resident_cubic_descriptor_catalog(
    primes: IntegerBuffer,
    pattern_offsets: IntegerBuffer,
    pattern_counts: IntegerBuffer,
    pattern_degrees: IntegerBuffer,
    multiplicities: IntegerBuffer,
    full_offsets: IntegerBuffer,
    prime_count: int,
    bound: int,
    polynomial: IntegerBuffer,
    invzk: IntegerBuffer,
    zk: IntegerBuffer,
    zk_degrees: IntegerBuffer,
    table: IntegerBuffer,
    equation_index: int,
    zkden: int,
    real_places: int,
    matrix_m: IntegerBuffer,
    matrix_p: IntegerBuffer,
    matrix_e: IntegerBuffer,
    random_state: IntegerBuffer,
    factorwork: IntegerBuffer,
    factor: IntegerBuffer,
    diagnostic: IntegerBuffer,
    minpoly_diagnostic: IntegerBuffer,
    polywork: IntegerBuffer,
    u: IntegerBuffer,
    t: IntegerBuffer,
    rational: IntegerBuffer,
    primitive: IntegerBuffer,
    column: IntegerBuffer,
    resultant_work: IntegerBuffer,
    resultant_trace: IntegerBuffer,
    u_output: IntegerBuffer,
    tau_output: IntegerBuffer,
    descriptor_state: IntegerBuffer,
    unsorted: IntegerBuffer,
    generators: IntegerBuffer,
    residue_degrees: IntegerBuffer,
    order: IntegerBuffer,
    sort_diagnostic: IntegerBuffer,
    decomposition_output: IntegerBuffer,
    decomposition_state: IntegerBuffer,
    catalog_primes: IntegerBuffer,
    catalog_e: IntegerBuffer,
    catalog_f: IntegerBuffer,
    catalog_inert: IntegerBuffer,
    catalog_generators: IntegerBuffer,
    catalog_tau: IntegerBuffer,
    requested_counts: IntegerBuffer,
    state: IntegerBuffer,
) -> int:
    """Build the source-requested cubic descriptor prefixes."""
    degree = 3
    if (
        prime_count < 1
        or bound < 1
        or equation_index < 1
        or len(primes) < prime_count
        or len(factorwork) < 16994
        or len(decomposition_output) < 48
        or len(residue_degrees) < 3
        or len(descriptor_state) < 12
        or len(requested_counts) < prime_count
        or len(state) < 4
    ):
        raise ValueError("short resident cubic descriptor catalog")
    state[0] = -1
    state[1] = 0
    state[2] = 0
    state[3] = 0
    logarithm = log(checked_float64(bound) + 0.5)
    stride = 16
    for position in range(prime_count):
        prime = primes[position]
        if prime > bound:
            break
        state[1] += 1
        offset = pattern_offsets[position]
        requested_counts[position] = 0
        if pattern_degrees[offset] == degree:
            if prime == bound:
                break
            continue
        limit = int(logarithm / log(checked_float64(prime)))
        requested = 0
        for k in range(pattern_counts[position]):
            if pattern_degrees[offset + k] > limit:
                break
            requested += multiplicities[offset + k]
        if requested == 0:
            if prime == bound:
                break
            continue
        state[2] += 1
        if equation_index % prime == 0:
            count = pari_prepared_index_prime_descriptors(
                table,
                degree,
                prime,
                real_places,
                matrix_m,
                matrix_p,
                matrix_e,
                integer_buffer_view(factorwork, 0, 12000),
                decomposition_output,
                residue_degrees,
                descriptor_state,
            )
            if count < requested:
                raise ValueError("short resident index-prime descriptor prefix")
            # prepared_index_prime uses [p,e,f,u,tau], without the Kummer
            # inert flag.  Source sorting is already part of that graph.
            base = full_offsets[position]
            for j in range(requested):
                source = j * 15
                out = base + j
                catalog_primes[out] = decomposition_output[source]
                catalog_e[out] = decomposition_output[source + 1]
                catalog_f[out] = decomposition_output[source + 2]
                catalog_inert[out] = 0
                for i in range(degree):
                    catalog_generators[out * degree + i] = decomposition_output[
                        source + 3 + i
                    ]
                for a in range(degree):
                    for b in range(degree):
                        catalog_tau[out * 9 + a * degree + b] = decomposition_output[
                            source + 3 + degree + b * degree + a
                        ]
            count = requested
        else:
            count = pari_kummer_prime_decomposition(
                polynomial,
                invzk,
                zk,
                zk_degrees,
                table,
                degree,
                prime,
                equation_index,
                zkden,
                random_state,
                factorwork,
                factor,
                diagnostic,
                minpoly_diagnostic,
                polywork,
                u,
                t,
                rational,
                primitive,
                column,
                resultant_work,
                resultant_trace,
                u_output,
                tau_output,
                descriptor_state,
                unsorted,
                generators,
                residue_degrees,
                order,
                sort_diagnostic,
                decomposition_output,
                decomposition_state,
                limit,
            )
            if count != requested:
                raise ValueError("resident Kummer descriptor/pattern count mismatch")
            base = full_offsets[position]
            for j in range(count):
                source = j * stride
                out = base + j
                catalog_primes[out] = decomposition_output[source]
                catalog_e[out] = decomposition_output[source + 1]
                catalog_f[out] = decomposition_output[source + 2]
                inert = decomposition_output[source + 3]
                catalog_inert[out] = inert
                for i in range(degree):
                    catalog_generators[out * degree + i] = 0
                    if inert == 0:
                        catalog_generators[out * degree + i] = decomposition_output[
                            source + 4 + i
                        ]
                for a in range(degree):
                    for b in range(degree):
                        catalog_tau[out * 9 + a * degree + b] = 0
                        if inert == 0:
                            catalog_tau[out * 9 + a * degree + b] = (
                                decomposition_output[
                                    source + 4 + degree + b * degree + a
                                ]
                            )
        requested_counts[position] = count
        state[3] += count
        if prime == bound:
            break
    state[0] = 0
    return int(state[3])


__all__ = [
    "pari_resident_cubic_degree_catalog",
    "pari_resident_cubic_descriptor_catalog",
]
