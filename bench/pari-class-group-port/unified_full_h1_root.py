"""Frozen native suffix control for the prepared real-cubic `h = 1` run.

The resident candidate and live owner bridge produce all mathematical inputs to
this suffix.  This module keeps their exact owners in the same generated addon
while it expands compact unit provenance, replays the principal relations,
rebuilds the p2,176 embeddings and logarithms, evaluates the regulator minor,
and publishes a diagnostic state.  No exact arithmetic is delegated to
the JavaScript host.

This remains an internal fixed-field experiment. Fixed logical shapes and
retry precision make it a component control, not a live completion authority,
independent unit-saturation proof, or general regulator proof.
"""

from sagejs.native import IntegerBuffer, Int64Buffer, native

from .cubic_embedding_rebuild import pari_cubic_embedding_rebuild
from .cubic_precision_rebuild import pari_cubic_sunit_precision_rebuild
from .exponential import pari_real_resize
from .regulator_determinant import pari_regulator_determinant


@native
def _unified_cubic_multiply(
    a0: int,
    a1: int,
    a2: int,
    b0: int,
    b1: int,
    b2: int,
    tensor: IntegerBuffer,
) -> tuple[int, int, int]:
    """Multiply two integral-basis triples with the resident tensor."""
    m0 = a0 * tensor[0] + a1 * tensor[9] + a2 * tensor[18]
    m1 = a0 * tensor[1] + a1 * tensor[10] + a2 * tensor[19]
    m2 = a0 * tensor[2] + a1 * tensor[11] + a2 * tensor[20]
    m3 = a0 * tensor[3] + a1 * tensor[12] + a2 * tensor[21]
    m4 = a0 * tensor[4] + a1 * tensor[13] + a2 * tensor[22]
    m5 = a0 * tensor[5] + a1 * tensor[14] + a2 * tensor[23]
    m6 = a0 * tensor[6] + a1 * tensor[15] + a2 * tensor[24]
    m7 = a0 * tensor[7] + a1 * tensor[16] + a2 * tensor[25]
    m8 = a0 * tensor[8] + a1 * tensor[17] + a2 * tensor[26]
    return (
        m0 * b0 + m3 * b1 + m6 * b2,
        m1 * b0 + m4 * b1 + m7 * b2,
        m2 * b0 + m5 * b1 + m8 * b2,
    )


@native
def _unified_cubic_norm(a0: int, a1: int, a2: int, tensor: IntegerBuffer) -> int:
    """Return the determinant of multiplication by one cubic element."""
    m0 = a0 * tensor[0] + a1 * tensor[9] + a2 * tensor[18]
    m1 = a0 * tensor[1] + a1 * tensor[10] + a2 * tensor[19]
    m2 = a0 * tensor[2] + a1 * tensor[11] + a2 * tensor[20]
    m3 = a0 * tensor[3] + a1 * tensor[12] + a2 * tensor[21]
    m4 = a0 * tensor[4] + a1 * tensor[13] + a2 * tensor[22]
    m5 = a0 * tensor[5] + a1 * tensor[14] + a2 * tensor[23]
    m6 = a0 * tensor[6] + a1 * tensor[15] + a2 * tensor[24]
    m7 = a0 * tensor[7] + a1 * tensor[16] + a2 * tensor[25]
    m8 = a0 * tensor[8] + a1 * tensor[17] + a2 * tensor[26]
    return (
        m0 * (m4 * m8 - m7 * m5) - m3 * (m1 * m8 - m7 * m2) + m6 * (m1 * m5 - m4 * m2)
    )


@native
def _unified_cubic_divide_exact(
    a0: int,
    a1: int,
    a2: int,
    b0: int,
    b1: int,
    b2: int,
    tensor: IntegerBuffer,
) -> tuple[int, int, int]:
    """Divide integral cubic elements, rejecting a nonintegral quotient."""
    m0 = b0 * tensor[0] + b1 * tensor[9] + b2 * tensor[18]
    m1 = b0 * tensor[1] + b1 * tensor[10] + b2 * tensor[19]
    m2 = b0 * tensor[2] + b1 * tensor[11] + b2 * tensor[20]
    m3 = b0 * tensor[3] + b1 * tensor[12] + b2 * tensor[21]
    m4 = b0 * tensor[4] + b1 * tensor[13] + b2 * tensor[22]
    m5 = b0 * tensor[5] + b1 * tensor[14] + b2 * tensor[23]
    m6 = b0 * tensor[6] + b1 * tensor[15] + b2 * tensor[24]
    m7 = b0 * tensor[7] + b1 * tensor[16] + b2 * tensor[25]
    m8 = b0 * tensor[8] + b1 * tensor[17] + b2 * tensor[26]
    determinant = (
        m0 * (m4 * m8 - m7 * m5) - m3 * (m1 * m8 - m7 * m2) + m6 * (m1 * m5 - m4 * m2)
    )
    if determinant == 0:
        raise ValueError("zero principal relation denominator")
    c0 = m4 * m8 - m7 * m5
    c1 = m2 * m7 - m1 * m8
    c2 = m1 * m5 - m2 * m4
    q0, q1, q2 = _unified_cubic_multiply(a0, a1, a2, c0, c1, c2, tensor)
    if q0 % determinant != 0 or q1 % determinant != 0 or q2 % determinant != 0:
        raise ValueError("nonintegral principal relation quotient")
    return q0 // determinant, q1 // determinant, q2 // determinant


@native
def _unified_cubic_power(
    a0: int, a1: int, a2: int, exponent: int, tensor: IntegerBuffer
) -> tuple[int, int, int]:
    """Binary powering for a nonnegative exact cubic exponent."""
    if exponent < 0:
        raise ValueError("negative exponent at exact power boundary")
    r0, r1, r2 = 1, 0, 0
    while exponent != 0:
        if exponent % 2 != 0:
            r0, r1, r2 = _unified_cubic_multiply(r0, r1, r2, a0, a1, a2, tensor)
        exponent //= 2
        if exponent != 0:
            a0, a1, a2 = _unified_cubic_multiply(a0, a1, a2, a0, a1, a2, tensor)
    return r0, r1, r2


@native
def _unified_relation_product(
    generators: IntegerBuffer,
    exponents: IntegerBuffer,
    exponent_offset: int,
    tensor: IntegerBuffer,
) -> tuple[int, int, int]:
    """Replay one signed 73-generator principal-relation word."""
    positive0, positive1, positive2 = 1, 0, 0
    negative0, negative1, negative2 = 1, 0, 0
    for relation in range(73):
        exponent = exponents[exponent_offset + relation]
        source = 3 * relation
        if exponent > 0:
            power0, power1, power2 = _unified_cubic_power(
                generators[source],
                generators[source + 1],
                generators[source + 2],
                exponent,
                tensor,
            )
            positive0, positive1, positive2 = _unified_cubic_multiply(
                positive0,
                positive1,
                positive2,
                power0,
                power1,
                power2,
                tensor,
            )
        elif exponent < 0:
            power0, power1, power2 = _unified_cubic_power(
                generators[source],
                generators[source + 1],
                generators[source + 2],
                -exponent,
                tensor,
            )
            negative0, negative1, negative2 = _unified_cubic_multiply(
                negative0,
                negative1,
                negative2,
                power0,
                power1,
                power2,
                tensor,
            )
    return _unified_cubic_divide_exact(
        positive0,
        positive1,
        positive2,
        negative0,
        negative1,
        negative2,
        tensor,
    )


@native
def pari_unified_full_h1_suffix(
    polynomial: IntegerBuffer,
    basis: IntegerBuffer,
    multiplication_tensor: IntegerBuffer,
    generators: IntegerBuffer,
    cleanup_transform: IntegerBuffer,
    active_hnf_transform: IntegerBuffer,
    compact_provenance: IntegerBuffer,
    expected_regulator: IntegerBuffer,
    kernel_relation_map: IntegerBuffer,
    retained_relation_map: IntegerBuffer,
    kernel_factors: IntegerBuffer,
    exact_units_integral: IntegerBuffer,
    exact_units_power: IntegerBuffer,
    exact_norms: IntegerBuffer,
    root_m: IntegerBuffer,
    root_p: IntegerBuffer,
    root_e: IntegerBuffer,
    embedding_m: IntegerBuffer,
    embedding_p: IntegerBuffer,
    embedding_e: IntegerBuffer,
    embedding_state: Int64Buffer,
    atom_logs: IntegerBuffer,
    transformed_logs: IntegerBuffer,
    clean_scratch: IntegerBuffer,
    clean_result: IntegerBuffer,
    rebuilt_logs: IntegerBuffer,
    phase_scratch: IntegerBuffer,
    rebuilt_phases: IntegerBuffer,
    log_cache: IntegerBuffer,
    pi_cache: IntegerBuffer,
    transcendental_a: IntegerBuffer,
    transcendental_b: IntegerBuffer,
    transcendental_p: IntegerBuffer,
    transcendental_q: IntegerBuffer,
    transcendental_stack: IntegerBuffer,
    clean_state: Int64Buffer,
    precision_state: Int64Buffer,
    determinant_values: IntegerBuffer,
    determinant_work: IntegerBuffer,
    determinant_output: IntegerBuffer,
    determinant_pivots: Int64Buffer,
    determinant_state: Int64Buffer,
    authority_state: Int64Buffer,
) -> int:
    """Run the frozen exact suffix and publish its diagnostic state.

    `authority_state` is status, kernel factors checked, exact units checked,
    embedding rebuilt, logs rebuilt, determinant evaluated, the absolute p192
    mantissa delta from the resident accepted regulator, and terminal
    authority-complete bit. The final bit always remains zero: the fixed retry
    precision and observed logical shapes are sentinels, not live policy.
    """
    if (
        len(polynomial) < 4
        or len(basis) < 9
        or len(multiplication_tensor) < 27
        or len(generators) < 219
        or len(cleanup_transform) < 73 * 73
        or len(active_hnf_transform) < 15 * 15
        or len(compact_provenance) < 14
        or len(expected_regulator) < 3
        or len(kernel_relation_map) < 7 * 73
        or len(retained_relation_map) < 2 * 73
        or len(kernel_factors) < 21
        or len(exact_units_integral) < 6
        or len(exact_units_power) < 6
        or len(exact_norms) < 2
        or len(authority_state) < 8
    ):
        raise ValueError("short unified h1 suffix owner")
    for i in range(8):
        authority_state[i] = 0
    authority_state[0] = -1

    for kernel in range(7):
        for relation in range(73):
            value = 0
            for column in range(15):
                value += (
                    active_hnf_transform[15 * kernel + column]
                    * cleanup_transform[73 * column + relation]
                )
            kernel_relation_map[73 * kernel + relation] = value
        factor0, factor1, factor2 = _unified_relation_product(
            generators, kernel_relation_map, 73 * kernel, multiplication_tensor
        )
        norm = _unified_cubic_norm(factor0, factor1, factor2, multiplication_tensor)
        if norm != -1 and norm != 1:
            raise ValueError("kernel relation did not reconstruct a unit")
        kernel_factors[3 * kernel] = factor0
        kernel_factors[3 * kernel + 1] = factor1
        kernel_factors[3 * kernel + 2] = factor2
        authority_state[1] = kernel + 1

    for unit in range(2):
        for relation in range(73):
            value = 0
            for kernel in range(7):
                value += (
                    compact_provenance[7 * unit + kernel]
                    * kernel_relation_map[73 * kernel + relation]
                )
            retained_relation_map[73 * unit + relation] = value
        direct0, direct1, direct2 = _unified_relation_product(
            generators, retained_relation_map, 73 * unit, multiplication_tensor
        )
        factored0, factored1, factored2 = 1, 0, 0
        for kernel in range(7):
            exponent = compact_provenance[7 * unit + kernel]
            source = 3 * kernel
            if exponent > 0:
                power0, power1, power2 = _unified_cubic_power(
                    kernel_factors[source],
                    kernel_factors[source + 1],
                    kernel_factors[source + 2],
                    exponent,
                    multiplication_tensor,
                )
                factored0, factored1, factored2 = _unified_cubic_multiply(
                    factored0,
                    factored1,
                    factored2,
                    power0,
                    power1,
                    power2,
                    multiplication_tensor,
                )
            elif exponent < 0:
                power0, power1, power2 = _unified_cubic_power(
                    kernel_factors[source],
                    kernel_factors[source + 1],
                    kernel_factors[source + 2],
                    -exponent,
                    multiplication_tensor,
                )
                factored0, factored1, factored2 = _unified_cubic_divide_exact(
                    factored0,
                    factored1,
                    factored2,
                    power0,
                    power1,
                    power2,
                    multiplication_tensor,
                )
        if direct0 != factored0 or direct1 != factored1 or direct2 != factored2:
            raise ValueError("direct and factored exact-unit replay disagree")
        norm = _unified_cubic_norm(direct0, direct1, direct2, multiplication_tensor)
        if norm != -1 and norm != 1:
            raise ValueError("selected exact element is not a unit")
        target = 3 * unit
        exact_units_integral[target] = direct0
        exact_units_integral[target + 1] = direct1
        exact_units_integral[target + 2] = direct2
        exact_units_power[target] = direct0 - 13345 * direct2
        exact_units_power[target + 1] = direct1 + 2 * direct2
        exact_units_power[target + 2] = direct2
        exact_norms[unit] = norm
        authority_state[2] = unit + 1

    status = pari_cubic_embedding_rebuild(
        polynomial,
        basis,
        2176,
        root_m,
        root_p,
        root_e,
        embedding_m,
        embedding_p,
        embedding_e,
        embedding_state,
    )
    if status != 0:
        authority_state[0] = 1
        return 1
    authority_state[3] = 1
    # ``make_M`` publishes basis columns, while the S-unit evaluator consumes
    # one contiguous basis row per real place.  Transpose each packed plane in
    # this same owner domain; the earlier split-addon worker missed this edge.
    for index in range(3):
        left = index
        right = 3 * index
        temporary = embedding_m[left]
        embedding_m[left] = embedding_m[right]
        embedding_m[right] = temporary
        temporary = embedding_p[left]
        embedding_p[left] = embedding_p[right]
        embedding_p[right] = temporary
        temporary = embedding_e[left]
        embedding_e[left] = embedding_e[right]
        embedding_e[right] = temporary
    temporary = embedding_m[5]
    embedding_m[5] = embedding_m[7]
    embedding_m[7] = temporary
    temporary = embedding_p[5]
    embedding_p[5] = embedding_p[7]
    embedding_p[7] = temporary
    temporary = embedding_e[5]
    embedding_e[5] = embedding_e[7]
    embedding_e[7] = temporary
    status = pari_cubic_sunit_precision_rebuild(
        embedding_m,
        embedding_p,
        embedding_e,
        generators,
        retained_relation_map,
        73,
        2176,
        atom_logs,
        transformed_logs,
        clean_scratch,
        clean_result,
        rebuilt_logs,
        phase_scratch,
        rebuilt_phases,
        log_cache,
        pi_cache,
        transcendental_a,
        transcendental_b,
        transcendental_p,
        transcendental_q,
        transcendental_stack,
        clean_state,
        precision_state,
    )
    if status != 0:
        authority_state[0] = 2
        return 2
    authority_state[4] = 1

    # Rows zero and one of both rebuilt columns, in determinant column order.
    for entry in range(4):
        source = 1
        if entry == 1:
            source = 8
        elif entry == 2:
            source = 22
        elif entry == 3:
            source = 29
        for word in range(3):
            determinant_values[3 * entry + word] = rebuilt_logs[source + word]
    status = pari_regulator_determinant(
        determinant_values,
        2,
        determinant_work,
        determinant_output,
        determinant_pivots,
        determinant_state,
    )
    if status != 0:
        authority_state[0] = 3
        return 3
    authority_state[5] = 1
    resized_m, resized_p, resized_e = pari_real_resize(
        abs(determinant_output[0]),
        determinant_output[1],
        determinant_output[2],
        192,
    )
    regulator_delta = abs(resized_m - abs(expected_regulator[0]))
    # This comparison is diagnostic only. The direct p192 schedule is not
    # bitwise coherent with the p2,176 schedule resized to p192, and an
    # observed delta is not a mathematical enclosure or source-policy bound.
    if resized_p != expected_regulator[1] or resized_e != expected_regulator[2]:
        regulator_delta = -1
    determinant_output[0] = resized_m
    determinant_output[1] = resized_p
    determinant_output[2] = resized_e
    authority_state[6] = regulator_delta
    authority_state[7] = 0
    authority_state[0] = 0
    return 0
