"""PARI 2.17.4 one-prime Kummer decomposition from a prepared nf.

Copyright (C) The PARI group; GPL-2.0-or-later, without warranty.
Factor the defining polynomial, construct each Kummer descriptor, then use
PARI's descriptor ordering. No factor or descriptor is a prepared input.
Primehood and a genuine consistent prepared nf remain caller preconditions.
"""

from sagejs.native import IntegerBuffer, native
from .f2x_small_polynomial_factor import pari_f2x_small_polynomial_factor
from .flx_small_polynomial_factor import pari_flx_small_polynomial_factor
from .kummer_prime_descriptor import pari_prepared_kummer_prime_descriptor
from .prime_descriptor_sort import pari_prime_descriptor_sort


@native
def pari_kummer_prime_decomposition(
    polynomial: IntegerBuffer,
    invzk: IntegerBuffer,
    zk: IntegerBuffer,
    zk_degrees: IntegerBuffer,
    table: IntegerBuffer,
    n: int,
    p: int,
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
    output: IntegerBuffer,
    state: IntegerBuffer,
    degree_limit: int,
) -> int:
    """Return count; publish sorted records [p,e,f,inert,u...,tau...].

    All owners are disjoint. Record stride is 4+n+n*n; inactive records are
    untouched, inert tau is [1,0,...]. Factorwork16994, factor n+1,
    polywork36, rational2*n, resultant_work n*n+n, resultant_trace25,
    descriptor_state12; other vector owners require n, matrix owners n*n.
    State3 is [status,count,corrections]. RNG66 remains resident and advances
    exactly through factorization. Only final publication writes output;
    scratch/RNG/diagnostic state can change on a mathematical frontier.
    """
    if n < 3 or n > 4 or p < 2 or p > 3037000493 or index < 1 or zkden < 1:
        raise ValueError("Kummer decomposition domain frontier")
    if degree_limit < 0:
        raise ValueError("Kummer decomposition negative degree limit")
    if index % p == 0:
        raise ValueError("Kummer decomposition equation-index frontier")
    stride = 4 + n + n * n
    if (
        len(polynomial) < n + 1
        or len(invzk) < n * n
        or len(zk) < n * n
        or len(zk_degrees) < n
        or len(table) < n * n * n
        or len(random_state) < 66
        or len(factorwork) < 16994
        or len(factor) < n + 1
        or len(diagnostic) < 3
        or len(minpoly_diagnostic) < 1
        or len(polywork) < 36
        or len(u) < n
        or len(t) < n
        or len(rational) < 2 * n
        or len(primitive) < n
        or len(column) < n
        or len(resultant_work) < n * n + n
        or len(resultant_trace) < 25
        or len(u_output) < n
        or len(tau_output) < n * n
        or len(descriptor_state) < 12
        or len(unsorted) < n * stride
        or len(generators) < n * n
        or len(residue_degrees) < n
        or len(order) < n
        or len(sort_diagnostic) < 2
        or len(output) < n * stride
        or len(state) < 3
    ):
        raise ValueError("short Kummer decomposition storage")
    if polynomial[n] != 1:
        raise ValueError("Kummer decomposition monic frontier")
    for i in range(n):
        if zk_degrees[i] < 0 or zk_degrees[i] >= n:
            raise ValueError("Kummer decomposition basis degree")
    state[0] = -1
    state[1] = 0
    state[2] = 0
    if p == 2:
        packed = 0
        bit = 1
        for i in range(n + 1):
            packed += (polynomial[i] % 2) * bit
            bit *= 2
        count = pari_f2x_small_polynomial_factor(
            packed, order, residue_degrees, polywork, random_state, diagnostic
        )
        for j in range(count):
            packed = order[j]
            degree = -1
            for i in range(9):
                factorwork[9 + 9 * j + i] = packed % 2
                if packed != 0:
                    degree = i
                packed //= 2
            factorwork[45 + j] = degree
            factorwork[49 + j] = residue_degrees[j]
    else:
        for i in range(9):
            factorwork[i] = 0
        for i in range(n + 1):
            factorwork[i] = polynomial[i] % p
        count = pari_flx_small_polynomial_factor(
            factorwork,
            0,
            n,
            p,
            9,
            45,
            49,
            53,
            random_state,
            diagnostic,
            minpoly_diagnostic,
        )
    for j in range(count):
        degree = factorwork[45 + j]
        if degree_limit > 0 and degree > degree_limit:
            count = j
            break
        for i in range(degree + 1):
            factor[i] = factorwork[9 + 9 * j + i]
        pari_prepared_kummer_prime_descriptor(
            polynomial,
            invzk,
            zk,
            zk_degrees,
            table,
            factor,
            n,
            degree,
            factorwork[49 + j],
            p,
            zkden,
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
        )
        state[2] += descriptor_state[5]
        residue_degrees[j] = degree
        base = j * stride
        unsorted[base] = p
        unsorted[base + 1] = descriptor_state[2]
        unsorted[base + 2] = degree
        unsorted[base + 3] = descriptor_state[4]
        for i in range(n):
            generators[j * n + i] = u_output[i]
            unsorted[base + 4 + i] = u_output[i]
        for i in range(n * n):
            value = tau_output[i]
            if descriptor_state[4] != 0:
                value = 0
                if i == 0:
                    value = 1
            unsorted[base + 4 + n + i] = value
    pari_prime_descriptor_sort(
        residue_degrees, generators, n, count, order, sort_diagnostic
    )
    for j in range(count):
        for i in range(stride):
            output[j * stride + i] = unsorted[order[j] * stride + i]
    state[1] = count
    state[0] = 0
    return count
