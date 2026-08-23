"""Source-transparent exact kernels used by Dedekind-zeta computations."""

from __future__ import annotations

from sagejs.ffi.flint import integer_log_sqrt_balls_packed
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
def _bf_integer_square_root(value: int) -> int:
    """Return `floor(sqrt(value))` by exact Newton iteration."""
    if value < 0:
        return -1
    if value < 2:
        return value
    bits = 0
    probe = value
    while probe:
        probe //= 2
        bits += 1
    current = 1
    shift = 0
    while shift < (bits + 1) // 2:
        current *= 2
        shift += 1
    following = (current + value // current) // 2
    while following < current:
        current = following
        following = (current + value // current) // 2
    while (current + 1) * (current + 1) <= value:
        current += 1
    while current * current > value:
        current -= 1
    return current


@native
def _bf_atanh_log_bounds(
    numerator: int, denominator: int, scale: int
) -> tuple[int, int]:
    """Enclose `2*atanh(numerator/denominator)` at one exact scale."""
    if numerator < 0 or denominator <= numerator or scale <= 0:
        return (1, 0)
    if numerator == 0:
        return (0, 0)
    lower = 0
    upper = 0
    numerator_power = numerator
    denominator_power = denominator
    numerator_square = numerator * numerator
    denominator_square = denominator * denominator
    for index in range(4096):
        odd = 2 * index + 1
        term_denominator = odd * denominator_power
        term_numerator = 2 * scale * numerator_power
        lower += term_numerator // term_denominator
        upper += _dyadic_ceiling_quotient(term_numerator, term_denominator)

        next_numerator_power = numerator_power * numerator_square
        next_denominator_power = denominator_power * denominator_square
        tail_numerator = 2 * scale * next_numerator_power * denominator_square
        tail_denominator = (
            (odd + 2) * next_denominator_power * (denominator_square - numerator_square)
        )
        if tail_numerator < tail_denominator:
            # The omitted positive tail is strictly below one scaled unit.
            return (lower, upper + 1)
        numerator_power = next_numerator_power
        denominator_power = next_denominator_power
    return (1, 0)


@native
def _bf_significand_grid_bounds(
    lower: int, upper: int, precision_bits: int
) -> tuple[int, int]:
    """Round positive fixed-point endpoints to a `precision_bits` grid."""
    if lower < 0 or upper < lower:
        return (1, 0)
    if upper == 0:
        return (0, 0)
    bits = 0
    probe = upper
    while probe:
        probe //= 2
        bits += 1
    step = 1
    shift = precision_bits
    while shift < bits:
        step *= 2
        shift += 1
    return (
        (lower // step) * step,
        _dyadic_ceiling_quotient(upper, step) * step,
    )


@native
def assemble_bf_integer_transcendental_endpoints(
    output: IntegerBuffer,
    values: IntegerBuffer,
    precision_bits: uint64,
) -> bool:
    """Batch rigorous `log(n)` and `sqrt(n)` dyadic endpoints.

    Each output row is `(log_lower, log_upper, sqrt_lower, sqrt_upper)` at
    scale `2^precision_bits`.  Logarithms use
    `log(m)=2*atanh((m-1)/(m+1))` after exact power-of-two range reduction;
    square roots use exact scaled integer square root.  Twenty guard bits make
    the final outward significand rounding independent of term accumulation.
    """
    maximum_precision: uint64 = 1
    maximum_precision = maximum_precision << 12
    if (
        precision_bits < 16
        or precision_bits > maximum_precision
        or len(values) > 1000000
        or len(output) != 4 * len(values)
    ):
        return False
    work_precision = precision_bits + 20
    work_scale = 1
    for _work_bit in range(work_precision):
        work_scale *= 2
    output_scale = 1
    precision_integer = 0
    for _output_bit in range(precision_bits):
        output_scale *= 2
        precision_integer += 1
    guard_scale = 1
    for _guard_bit in range(20):
        guard_scale *= 2
    log_two_lower, log_two_upper = _bf_atanh_log_bounds(1, 3, work_scale)
    if log_two_upper < log_two_lower:
        return False

    for index in range(len(values)):
        value = values[index]
        if value < 1:
            return False
        exponent = 0
        power_of_two = 1
        while power_of_two * 2 <= value:
            power_of_two *= 2
            exponent += 1
            if exponent > 63:
                return False
        normalized_lower, normalized_upper = _bf_atanh_log_bounds(
            value - power_of_two, value + power_of_two, work_scale
        )
        if normalized_upper < normalized_lower:
            return False
        logarithm_lower = (exponent * log_two_lower + normalized_lower) // guard_scale
        logarithm_upper = _dyadic_ceiling_quotient(
            exponent * log_two_upper + normalized_upper, guard_scale
        )
        logarithm_lower, logarithm_upper = _bf_significand_grid_bounds(
            logarithm_lower, logarithm_upper, precision_integer
        )
        if logarithm_upper < logarithm_lower:
            return False

        scaled_square = value * output_scale * output_scale
        square_root_lower = _bf_integer_square_root(scaled_square)
        if square_root_lower < 0:
            return False
        square_root_upper = square_root_lower
        if square_root_lower * square_root_lower != scaled_square:
            square_root_upper += 1
        square_root_lower, square_root_upper = _bf_significand_grid_bounds(
            square_root_lower, square_root_upper, precision_integer
        )
        if square_root_upper < square_root_lower:
            return False

        offset = 4 * index
        output[offset] = logarithm_lower
        output[offset + 1] = logarithm_upper
        output[offset + 2] = square_root_lower
        output[offset + 3] = square_root_upper
    return True


@native
def assemble_bf_integer_transcendental_endpoints_flint(
    output: IntegerBuffer,
    values: IntegerBuffer,
    precision_bits: uint64,
) -> bool:
    """Batch rigorous integer log/square-root balls through declared FLINT.

    The declaration adapts both compiler-owned buffers to lexical FLINT
    matrices.  Arb performs the transcendental work, while the portable
    same-source kernel above remains the exact fallback when the foreign
    capability is unavailable.
    """
    one: uint64 = 1
    return integer_log_sqrt_balls_packed(
        output,
        values,
        len(output),
        len(values),
        one,
        precision_bits,
    )


@native
def assemble_bf_dyadic_layout(
    output: IntegerBuffer,
    raw_endpoints: IntegerBuffer,
    value_indices: IntegerBuffer,
    term_data: IntegerBuffer,
    term_count: uint64,
    precision_bits: uint64,
) -> bool:
    """Assemble the finite-sum endpoint layout without host objects.

    `raw_endpoints` contains one four-entry FLINT/Arb row per distinct integer.
    `value_indices` selects the threshold, threshold/9, 3*threshold, and then
    one norm for each prime-power term.  This kernel performs only exact
    outward dyadic multiplication and permutation.
    """
    maximum_precision: uint64 = 1
    maximum_precision = maximum_precision << 14
    if (
        precision_bits < 2
        or precision_bits > maximum_precision
        or len(raw_endpoints) % 4 != 0
        or len(value_indices) != term_count + 3
        or len(term_data) != 4 * term_count
        or len(output) != 8 + 4 * term_count
    ):
        return False
    raw_count = len(raw_endpoints) // 4
    if raw_count == 0:
        return False
    for index in range(len(value_indices)):
        if value_indices[index] < 0 or value_indices[index] >= raw_count:
            return False
    scale = 1
    for _bit in range(precision_bits):
        scale *= 2

    threshold_offset = 4 * value_indices[0]
    ninth_offset = 4 * value_indices[1]
    three_threshold_offset = 4 * value_indices[2]
    if (
        raw_endpoints[threshold_offset + 2] <= 0
        or raw_endpoints[threshold_offset + 3] < raw_endpoints[threshold_offset + 2]
        or raw_endpoints[threshold_offset + 1] < raw_endpoints[threshold_offset]
        or raw_endpoints[ninth_offset + 2] <= 0
        or raw_endpoints[ninth_offset + 3] < raw_endpoints[ninth_offset + 2]
        or raw_endpoints[ninth_offset + 1] < raw_endpoints[ninth_offset]
        or raw_endpoints[three_threshold_offset + 1]
        < raw_endpoints[three_threshold_offset]
    ):
        return False
    scale_zero_lower, scale_zero_upper = _dyadic_multiply(
        raw_endpoints[threshold_offset + 2],
        raw_endpoints[threshold_offset + 3],
        raw_endpoints[threshold_offset],
        raw_endpoints[threshold_offset + 1],
        scale,
    )
    output[0] = scale_zero_lower
    output[1] = scale_zero_upper
    scale_one_lower, scale_one_upper = _dyadic_multiply(
        raw_endpoints[ninth_offset + 2],
        raw_endpoints[ninth_offset + 3],
        raw_endpoints[ninth_offset],
        raw_endpoints[ninth_offset + 1],
        scale,
    )
    output[2] = scale_one_lower
    output[3] = scale_one_upper
    output[4] = raw_endpoints[threshold_offset + 2]
    output[5] = raw_endpoints[threshold_offset + 3]
    output[6] = raw_endpoints[three_threshold_offset]
    output[7] = raw_endpoints[three_threshold_offset + 1]

    for term_index in range(term_count):
        source_offset = 4 * value_indices[term_index + 3]
        output_offset = 8 + 4 * term_index
        exponent = term_data[4 * term_index + 3]
        if (
            raw_endpoints[source_offset] <= 0
            or raw_endpoints[source_offset + 1] < raw_endpoints[source_offset]
            or exponent < 1
        ):
            return False
        output[output_offset] = raw_endpoints[source_offset]
        output[output_offset + 1] = raw_endpoints[source_offset + 1]
        if exponent % 2:
            if (
                raw_endpoints[source_offset + 2] <= 0
                or raw_endpoints[source_offset + 3] < raw_endpoints[source_offset + 2]
            ):
                return False
            output[output_offset + 2] = raw_endpoints[source_offset + 2]
            output[output_offset + 3] = raw_endpoints[source_offset + 3]
        else:
            output[output_offset + 2] = scale
            output[output_offset + 3] = scale
    return True


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
def assemble_bf_prime_power_plan_in_place(
    metadata: IntegerBuffer,
    output: IntegerBuffer,
    workspace: IntegerBuffer,
    primes: UInt64Buffer,
    factor_counts: UInt64Buffer,
    factor_exponents: UInt64Buffer,
    factor_degrees: UInt64Buffer,
    degree: uint64,
    threshold: uint64,
    emit: uint64,
) -> bool:
    """Build the exact aggregated Belabas--Friedman term plan.

    The first pass (`emit=0`) writes `(term_count, raw_term_count)` to
    `metadata`.  The second pass writes canonical
    `(multiplicity, scale_index, norm, exponent)` rows to `output`.  One
    threshold-sized caller workspace stores the coefficient of each prime
    norm, so the kernel never allocates dynamic mathematical objects.
    """
    maximum_threshold: uint64 = 1000000
    maximum_degree: uint64 = 64
    if (
        len(metadata) != 2
        or threshold < 9
        or threshold > maximum_threshold
        or degree < 1
        or degree > maximum_degree
        or emit > 1
        or len(factor_counts) != len(primes)
        or len(factor_exponents) != len(primes) * degree
        or len(factor_degrees) != len(factor_exponents)
        or len(workspace) != threshold
    ):
        return False

    for index in range(len(workspace)):
        workspace[index] = 0

    previous_prime: uint64 = 0
    for row in range(len(primes)):
        prime = primes[row]
        count = factor_counts[row]
        if (
            prime < 2
            or prime >= threshold
            or prime <= previous_prime
            or count < 1
            or count > degree
        ):
            return False
        previous_prime = prime
        workspace[prime] -= 1
        local_degree = 0
        for factor_index in range(degree):
            offset = row * degree + factor_index
            ramification = factor_exponents[offset]
            residue_degree = factor_degrees[offset]
            if factor_index >= count:
                if ramification != 0 or residue_degree != 0:
                    return False
            else:
                if (
                    ramification < 1
                    or ramification > degree
                    or residue_degree < 1
                    or residue_degree > degree
                ):
                    return False
                local_degree += ramification * residue_degree
                norm: uint64 = 1
                for _power_index in range(residue_degree):
                    if norm < threshold:
                        if norm > (threshold - 1) // prime:
                            norm = threshold
                        else:
                            norm = norm * prime
                if norm < threshold:
                    workspace[norm] += 1
        if local_degree != degree:
            return False

    term_count = 0
    raw_term_count = 0
    nine: uint64 = 9
    ninth: uint64 = threshold // nine
    for scale_index in range(2):
        cutoff: uint64 = threshold
        if scale_index == 1:
            cutoff = ninth
        for row in range(len(primes)):
            prime = primes[row]
            if prime < cutoff:
                power = prime
                while power < cutoff:
                    raw_term_count += 1
                    if power > (cutoff - 1) // prime:
                        power = cutoff
                    else:
                        power = power * prime
                count = factor_counts[row]
                for factor_index in range(count):
                    offset = row * degree + factor_index
                    residue_degree = factor_degrees[offset]
                    norm: uint64 = 1
                    for _norm_index in range(residue_degree):
                        if norm < cutoff:
                            if norm > (cutoff - 1) // prime:
                                norm = cutoff
                            else:
                                norm = norm * prime
                    if norm < cutoff:
                        power = norm
                        while power < cutoff:
                            raw_term_count += 1
                            if power > (cutoff - 1) // norm:
                                power = cutoff
                            else:
                                power = power * norm
        for norm_index in range(2, cutoff):
            multiplicity = workspace[norm_index]
            if scale_index == 1:
                multiplicity = -multiplicity
            if multiplicity != 0:
                power = norm_index
                while power < cutoff:
                    term_count += 1
                    if power > (cutoff - 1) // norm_index:
                        power = cutoff
                    else:
                        power = power * norm_index

    metadata[0] = term_count
    metadata[1] = raw_term_count
    if emit == 0:
        return True
    if len(output) != 4 * term_count:
        return False

    output_row = 0
    for scale_index in range(2):
        cutoff: uint64 = threshold
        if scale_index == 1:
            cutoff = ninth
        for norm_index in range(2, cutoff):
            multiplicity = workspace[norm_index]
            if scale_index == 1:
                multiplicity = -multiplicity
            if multiplicity != 0:
                exponent = 1
                power = norm_index
                while power < cutoff:
                    offset = 4 * output_row
                    output[offset] = multiplicity
                    output[offset + 1] = scale_index
                    output[offset + 2] = norm_index
                    output[offset + 3] = exponent
                    output_row += 1
                    exponent += 1
                    if power > (cutoff - 1) // norm_index:
                        power = cutoff
                    else:
                        power = power * norm_index
    return output_row == term_count


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
    one: uint64 = 1
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
                largest_base: uint64 = bound // power
                base: uint64 = one
                while base <= largest_base:
                    if base % prime != 0 and output[base - 1] != 0:
                        output[base * power - 1] = output[base - 1] * local_coefficient
                    base = base + one
            power = power * prime
    return True


__all__ = [
    "assemble_bf_dyadic_layout",
    "assemble_bf_dyadic_finite_term",
    "assemble_bf_integer_transcendental_endpoints",
    "assemble_bf_integer_transcendental_endpoints_flint",
    "assemble_bf_prime_power_plan_in_place",
    "assemble_zeta_coefficients_from_factors",
]
