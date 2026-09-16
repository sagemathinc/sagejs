"""PARI 2.17.4 `buch2.c:FBgen` requested Kummer descriptor catalog.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Prepared nf and generated degree patterns are inputs, not prime descriptors.
This visits only source-eligible rational primes and preserves a single RNG
stream. Catalog offsets use a full degree catalog, rather than FBgen's packed
LV vectors; only the requested prefixes are written.
"""

from math import log
from sagejs.native import IntegerBuffer, checked_float64, native
from .kummer_prime_decomposition import pari_kummer_prime_decomposition


@native
def pari_initial_kummer_catalog(
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
    n: int,
    index: int,
    zkden: int,
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
    """Return written descriptors; state=[status,visited,calls,written].

    Prime list is increasing, complete, and reaches a prime >=bound. Each
    degree-pattern group is sorted with positive counts of distinct ideals.
    Full offsets reserve all those ideals, including skipped ones. Output tau
    is row-major, inert generator/tau use zero metadata placeholders. Scratch
    and RNG contracts are inherited from pari_kummer_prime_decomposition.
    All owners are disjoint. Catalog metadata preflight is mutation-free;
    inherited nf/scratch validation occurs in the first requested decomposition.
    Later failures leave partial state and earlier catalog prefixes published.
    """
    if n < 3 or n > 4 or prime_count < 1 or bound < 1 or bound > 3037000493:
        raise ValueError("initial Kummer catalog dimension/bound frontier")
    if (
        len(primes) < prime_count
        or len(pattern_offsets) < prime_count
        or len(pattern_counts) < prime_count
        or len(full_offsets) < prime_count
        or len(requested_counts) < prime_count
        or len(state) < 4
    ):
        raise ValueError("short initial Kummer catalog metadata")
    if primes[prime_count - 1] < bound:
        raise ValueError("initial Kummer catalog needs a terminal prime")
    previous_prime = 1
    previous_end = 0
    for j in range(prime_count):
        p = primes[j]
        offset = pattern_offsets[j]
        count = pattern_counts[j]
        if (
            p <= previous_prime
            or p > 3037000493
            or offset < 0
            or count < 1
            or len(pattern_degrees) < offset + count
            or len(multiplicities) < offset + count
            or full_offsets[j] < previous_end
        ):
            raise ValueError("invalid initial Kummer catalog group")
        previous_prime = p
        total = 0
        previous_degree = 0
        for k in range(count):
            f = pattern_degrees[offset + k]
            m = multiplicities[offset + k]
            if f <= previous_degree or f > n or m < 1:
                raise ValueError("invalid initial Kummer degree pattern")
            previous_degree = f
            total += m
        if total > n:
            raise ValueError("initial Kummer catalog excessive factor count")
        previous_end = full_offsets[j] + total
    slots = previous_end
    if (
        len(catalog_primes) < slots
        or len(catalog_e) < slots
        or len(catalog_f) < slots
        or len(catalog_inert) < slots
        or len(catalog_generators) < slots * n
        or len(catalog_tau) < slots * n * n
    ):
        raise ValueError("short initial Kummer catalog outputs")
    state[0] = -1
    state[1] = 0
    state[2] = 0
    state[3] = 0
    logarithm = log(checked_float64(bound) + 0.5)
    stride = 4 + n + n * n
    for j in range(prime_count):
        p = primes[j]
        if p > bound:
            break
        state[1] += 1
        offset = pattern_offsets[j]
        requested_counts[j] = 0
        if pattern_degrees[offset] == n:
            if p == bound:
                break
            continue
        limit = int(logarithm / log(checked_float64(p)))
        requested = 0
        for k in range(pattern_counts[j]):
            if pattern_degrees[offset + k] > limit:
                break
            requested += multiplicities[offset + k]
        if requested == 0:
            if p == bound:
                break
            continue
        state[2] += 1
        count = pari_kummer_prime_decomposition(
            polynomial,
            invzk,
            zk,
            zk_degrees,
            table,
            n,
            p,
            index,
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
            raise ValueError("generated Kummer descriptor/pattern count mismatch")
        base = full_offsets[j]
        for k in range(count):
            row = k * stride
            out = base + k
            catalog_primes[out] = decomposition_output[row]
            catalog_e[out] = decomposition_output[row + 1]
            catalog_f[out] = decomposition_output[row + 2]
            inert = decomposition_output[row + 3]
            catalog_inert[out] = inert
            for i in range(n):
                catalog_generators[out * n + i] = 0
                if inert == 0:
                    catalog_generators[out * n + i] = decomposition_output[row + 4 + i]
            for a in range(n):
                for b in range(n):
                    catalog_tau[out * n * n + a * n + b] = 0
                    if inert == 0:
                        catalog_tau[out * n * n + a * n + b] = decomposition_output[
                            row + 4 + n + b * n + a
                        ]
        requested_counts[j] = count
        state[3] += count
        if p == bound:
            break
    state[0] = 0
    return int(state[3])
