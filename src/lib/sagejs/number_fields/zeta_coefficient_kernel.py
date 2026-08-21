"""Source-transparent multiplicative Dedekind-zeta coefficient assembly."""

from __future__ import annotations

from sagejs.native import IntegerBuffer, UInt64Buffer, native, uint64


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


__all__ = ["assemble_zeta_coefficients_from_factors"]
