"""Source-transparent exact kernels used by Dedekind-zeta computations."""

from __future__ import annotations

from sagejs.native import IntegerBuffer, UInt64Buffer, native, uint64


@native
def _dyadic_floor_quotient(numerator: int, denominator: int) -> int:
    return numerator // denominator


@native
def _dyadic_ceiling_quotient(numerator: int, denominator: int) -> int:
    return -((-numerator) // denominator)


@native
def _dyadic_multiply(
    left_lower: int,
    left_upper: int,
    right_lower: int,
    right_upper: int,
    scale: int,
) -> tuple[int, int]:
    first = left_lower * right_lower
    lower_product = first
    upper_product = first
    second = left_lower * right_upper
    if second < lower_product:
        lower_product = second
    if second > upper_product:
        upper_product = second
    third = left_upper * right_lower
    if third < lower_product:
        lower_product = third
    if third > upper_product:
        upper_product = third
    fourth = left_upper * right_upper
    if fourth < lower_product:
        lower_product = fourth
    if fourth > upper_product:
        upper_product = fourth
    return (
        _dyadic_floor_quotient(lower_product, scale),
        _dyadic_ceiling_quotient(upper_product, scale),
    )


@native
def _dyadic_divide_by_positive(
    numerator_lower: int,
    numerator_upper: int,
    denominator_lower: int,
    denominator_upper: int,
    scale: int,
) -> tuple[int, int]:
    reciprocal_lower = _dyadic_floor_quotient(scale * scale, denominator_upper)
    reciprocal_upper = _dyadic_ceiling_quotient(scale * scale, denominator_lower)
    return _dyadic_multiply(
        numerator_lower,
        numerator_upper,
        reciprocal_lower,
        reciprocal_upper,
        scale,
    )


@native
def assemble_bf_dyadic_finite_term(
    output: IntegerBuffer,
    term_data: IntegerBuffer,
    endpoints: IntegerBuffer,
    term_count: uint64,
    precision_bits: uint64,
) -> bool:
    """Replay one BF finite sum over outward `2^-precision_bits` endpoints.

    `term_data` stores `(multiplicity, scale_index, norm, exponent)` rows.
    `endpoints` starts with the two scale balls, `sqrt(threshold)`, and
    `log(3*threshold)`, followed by one log ball and one square-root ball per
    row. The caller computes those transcendental endpoints independently;
    this exact kernel performs only the same rounded rational operations as
    the ordinary `RealBall` implementation.
    """
    maximum_precision: uint64 = 1
    maximum_precision = maximum_precision << 14
    if (
        len(output) != 2
        or precision_bits < 2
        or precision_bits > maximum_precision
        or len(term_data) != 4 * term_count
        or len(endpoints) != 8 + 4 * term_count
    ):
        return False
    scale = 1
    for _bit in range(precision_bits):
        scale = scale * 2
    total_lower = 0
    total_upper = 0
    for index in range(term_count):
        data_offset = 4 * index
        multiplicity = term_data[data_offset]
        scale_index = term_data[data_offset + 1]
        norm = term_data[data_offset + 2]
        exponent = term_data[data_offset + 3]
        if (
            multiplicity == 0
            or scale_index < 0
            or scale_index > 1
            or norm < 2
            or exponent < 1
            or exponent > 1024
        ):
            return False
        endpoint_offset = 8 + 4 * index
        logarithm_lower = endpoints[endpoint_offset]
        logarithm_upper = endpoints[endpoint_offset + 1]
        root_lower = endpoints[endpoint_offset + 2]
        root_upper = endpoints[endpoint_offset + 3]
        if logarithm_lower <= 0 or logarithm_upper < logarithm_lower:
            return False

        norm_power = 1
        for _step in range(exponent):
            norm_power = norm_power * norm
        denominator = exponent * norm_power
        scale_offset = 2 * scale_index
        first_lower, first_upper = _dyadic_divide_by_positive(
            endpoints[scale_offset],
            endpoints[scale_offset + 1],
            denominator * scale,
            denominator * scale,
            scale,
        )

        half_power = 1
        for _step in range(exponent // 2):
            half_power = half_power * norm
        if exponent % 2 == 0:
            half_lower = half_power * scale
            half_upper = half_lower
        else:
            if root_lower <= 0 or root_upper < root_lower:
                return False
            half_lower, half_upper = _dyadic_multiply(
                half_power * scale,
                half_power * scale,
                root_lower,
                root_upper,
                scale,
            )
        second_lower, second_upper = _dyadic_divide_by_positive(
            logarithm_lower,
            logarithm_upper,
            half_lower,
            half_upper,
            scale,
        )
        summand_lower = first_lower - second_upper
        summand_upper = first_upper - second_lower
        if multiplicity != 1:
            summand_lower, summand_upper = _dyadic_multiply(
                summand_lower,
                summand_upper,
                multiplicity * scale,
                multiplicity * scale,
                scale,
            )
        total_lower = total_lower + summand_lower
        total_upper = total_upper + summand_upper

    denominator_lower, denominator_upper = _dyadic_multiply(
        2 * scale,
        2 * scale,
        endpoints[4],
        endpoints[5],
        scale,
    )
    denominator_lower, denominator_upper = _dyadic_multiply(
        denominator_lower,
        denominator_upper,
        endpoints[6],
        endpoints[7],
        scale,
    )
    if denominator_lower <= 0:
        return False
    multiplier_lower, multiplier_upper = _dyadic_divide_by_positive(
        3 * scale,
        3 * scale,
        denominator_lower,
        denominator_upper,
        scale,
    )
    result_lower, result_upper = _dyadic_multiply(
        multiplier_lower,
        multiplier_upper,
        total_lower,
        total_upper,
        scale,
    )
    output[0] = result_lower
    output[1] = result_upper
    return output[0] <= output[1]


@native
def assemble_zeta_coefficients_from_factors(
    output: IntegerBuffer,
    local: IntegerBuffer,
    primes: UInt64Buffer,
    factor_counts: UInt64Buffer,
    factor_exponents: UInt64Buffer,
    factor_degrees: UInt64Buffer,
    degree: int,
) -> bool:
    """Fill `output[n-1]` directly from packed residue degrees."""
    bound = len(output)
    if (
        bound < 1
        or degree < 1
        or len(factor_counts) != len(primes)
        or len(factor_exponents) != len(primes) * degree
        or len(factor_degrees) != len(primes) * degree
        or len(local) < 2
    ):
        return False
    output[0] = 1
    for row in range(len(primes)):
        prime = primes[row]
        count = factor_counts[row]
        if prime < 2 or prime > bound or count < 1 or count > degree:
            return False
        maximum_exponent = 0
        power: uint64 = 1
        while power <= bound // prime:
            power = power * prime
            maximum_exponent += 1
        if maximum_exponent + 1 > len(local):
            return False
        for exponent in range(maximum_exponent + 1):
            local[exponent] = 0
        local[0] = 1
        local_degree = 0
        for factor_index in range(count):
            factor_offset = row * degree + factor_index
            ramification_index = factor_exponents[factor_offset]
            residue_degree = factor_degrees[factor_offset]
            if (
                ramification_index < 1
                or ramification_index > degree
                or residue_degree < 1
                or residue_degree > degree
            ):
                return False
            local_degree += ramification_index * residue_degree
            for exponent in range(residue_degree, maximum_exponent + 1):
                local[exponent] += local[exponent - residue_degree]
        if local_degree != degree:
            return False

        power = prime
        for exponent in range(1, maximum_exponent + 1):
            local_coefficient = local[exponent]
            if local_coefficient != 0:
                largest_base = bound // power
                for base in range(1, largest_base + 1):
                    if base % prime != 0 and output[base - 1] != 0:
                        output[base * power - 1] = output[base - 1] * local_coefficient
            power = power * prime
    return True


__all__ = [
    "assemble_bf_dyadic_finite_term",
    "assemble_zeta_coefficients_from_factors",
]
