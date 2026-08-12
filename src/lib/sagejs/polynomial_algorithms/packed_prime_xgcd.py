"""Source-transparent extended GCD for packed small `GF(p)[x]`."""

from __future__ import annotations

from sagejs.native import (
    PrimeFieldModulus,
    UInt64Buffer,
    native,
    prime_inverse,
    prime_mul,
    prime_sub,
    prime_zeros,
)


@native
def packed_prime_field_polynomial_xgcd(
    output: UInt64Buffer,
    left: UInt64Buffer,
    right: UInt64Buffer,
    modulus: PrimeFieldModulus,
) -> bool:
    """Write the Sage-normalized extended GCD of `left` and `right`.

    Coefficients use the canonical low-to-high packed representation. The
    single result buffer contains three equal-capacity coefficient spans,
    followed by the three logical lengths `(gcd, left, right)`. Its capacity is
    `max(1, len(left), len(right))`, so its required length is
    `3 * capacity + 3`. Unused result slots are zeroed.

    The modulus must be a prime between 2 and `2^32 - 1`, and every input
    coefficient must be a canonical residue. The typed boundary rejects an
    out-of-range modulus; composite moduli, noncanonical coefficients, and an
    invalid output shape return `False`. No rejection changes `output`. The
    kernel first copies both inputs into owned compiler scratch and publishes
    only after success. Consequently `output` may share or overlap input
    storage safely; there are no multiple output or caller-scratch spans with
    an unenforceable alias contract.
    """
    capacity = len(left)
    if len(right) > capacity:
        capacity = len(right)
    if capacity == 0:
        capacity = 1
    if len(output) != capacity * 3 + 3:
        return False

    # PrimeFieldModulus is range-checked by generated native adapters, but the
    # same-source fallback must reject the same domain. Convert it through
    # machine arithmetic so comparisons remain uint64 in the isolated IR.
    checked_modulus = modulus + 0
    zero = checked_modulus - checked_modulus
    one = zero + 1
    if checked_modulus < one + 1 or checked_modulus > 4294967295:
        raise ValueError("modulus must be between 2 and 2^32 - 1")
    valid_modulus = True
    if valid_modulus and checked_modulus != one + 1:
        if checked_modulus % (one + 1) == zero:
            valid_modulus = False
    divisor = one + 2
    while valid_modulus and divisor <= checked_modulus // divisor:
        if checked_modulus % divisor == zero:
            valid_modulus = False
        divisor += one + 1
    if not valid_modulus:
        return False

    for index in range(len(left)):
        if left[index] < zero or left[index] >= checked_modulus:
            return False
    for index in range(len(right)):
        if right[index] < zero or right[index] >= checked_modulus:
            return False

    workspace = prime_zeros(capacity * 7)
    old_remainder_offset = 0
    remainder_offset = capacity
    old_left_offset = capacity * 2
    left_offset = capacity * 3
    old_right_offset = capacity * 4
    right_offset = capacity * 5
    quotient_offset = capacity * 6

    for index in range(len(workspace)):
        workspace[index] = zero
    for index in range(len(left)):
        workspace[old_remainder_offset + index] = left[index]
    for index in range(len(right)):
        workspace[remainder_offset + index] = right[index]

    old_remainder_length = len(left)
    while (
        old_remainder_length != 0
        and workspace[old_remainder_offset + old_remainder_length - 1] == 0
    ):
        old_remainder_length -= 1
    remainder_length = len(right)
    while (
        remainder_length != 0
        and workspace[remainder_offset + remainder_length - 1] == 0
    ):
        remainder_length -= 1

    workspace[old_left_offset] = one
    workspace[right_offset] = one
    old_left_length = 1
    left_length = 0
    old_right_length = 0
    right_length = 1

    while remainder_length != 0:
        quotient_length = 0
        if old_remainder_length >= remainder_length:
            quotient_length = old_remainder_length - remainder_length + 1
            inverse = prime_inverse(
                workspace[remainder_offset + remainder_length - 1], modulus
            )
            if (
                prime_mul(
                    workspace[remainder_offset + remainder_length - 1],
                    inverse,
                    modulus,
                )
                != one
            ):
                return False
            for offset in range(quotient_length):
                shift = quotient_length - offset - 1
                factor = prime_mul(
                    workspace[old_remainder_offset + remainder_length + shift - 1],
                    inverse,
                    modulus,
                )
                workspace[quotient_offset + shift] = factor
                if factor != 0:
                    for index in range(remainder_length):
                        target = old_remainder_offset + shift + index
                        workspace[target] = prime_sub(
                            workspace[target],
                            prime_mul(
                                factor,
                                workspace[remainder_offset + index],
                                modulus,
                            ),
                            modulus,
                        )

        next_remainder_length = old_remainder_length
        while (
            next_remainder_length != 0
            and workspace[old_remainder_offset + next_remainder_length - 1] == 0
        ):
            next_remainder_length -= 1
        if next_remainder_length >= remainder_length:
            return False

        left_product_length = 0
        if quotient_length != 0 and left_length != 0:
            left_product_length = quotient_length + left_length - 1
        next_left_length = old_left_length
        if left_product_length > next_left_length:
            next_left_length = left_product_length
        if next_left_length > capacity:
            return False
        for index in range(next_left_length):
            value = zero
            if index < old_left_length:
                value = workspace[old_left_offset + index]
            for quotient_index in range(quotient_length):
                if quotient_index <= index:
                    source_index = index - quotient_index
                    if source_index < left_length:
                        value = prime_sub(
                            value,
                            prime_mul(
                                workspace[quotient_offset + quotient_index],
                                workspace[left_offset + source_index],
                                modulus,
                            ),
                            modulus,
                        )
            workspace[old_left_offset + index] = value
        while (
            next_left_length != 0
            and workspace[old_left_offset + next_left_length - 1] == 0
        ):
            next_left_length -= 1

        right_product_length = 0
        if quotient_length != 0 and right_length != 0:
            right_product_length = quotient_length + right_length - 1
        next_right_length = old_right_length
        if right_product_length > next_right_length:
            next_right_length = right_product_length
        if next_right_length > capacity:
            return False
        for index in range(next_right_length):
            value = zero
            if index < old_right_length:
                value = workspace[old_right_offset + index]
            for quotient_index in range(quotient_length):
                if quotient_index <= index:
                    source_index = index - quotient_index
                    if source_index < right_length:
                        value = prime_sub(
                            value,
                            prime_mul(
                                workspace[quotient_offset + quotient_index],
                                workspace[right_offset + source_index],
                                modulus,
                            ),
                            modulus,
                        )
            workspace[old_right_offset + index] = value
        while (
            next_right_length != 0
            and workspace[old_right_offset + next_right_length - 1] == 0
        ):
            next_right_length -= 1

        temporary_offset = old_remainder_offset
        old_remainder_offset = remainder_offset
        remainder_offset = temporary_offset
        old_remainder_length = remainder_length
        remainder_length = next_remainder_length

        temporary_offset = old_left_offset
        old_left_offset = left_offset
        left_offset = temporary_offset
        old_left_length = left_length
        left_length = next_left_length

        temporary_offset = old_right_offset
        old_right_offset = right_offset
        right_offset = temporary_offset
        old_right_length = right_length
        right_length = next_right_length

    scale = one
    if old_remainder_length == 0:
        # Sage normalizes the indeterminate Bezout identity for (0, 0) to the
        # all-zero triple rather than preserving an initialization witness.
        old_left_length = zero
        old_right_length = zero
    else:
        leading = workspace[old_remainder_offset + old_remainder_length - 1]
        scale = prime_inverse(leading, modulus)
        if prime_mul(leading, scale, modulus) != one:
            return False

    # This is the first caller-visible write. Inputs may overlap this span:
    # every value still needed by the algorithm now lives in owned scratch.
    for index in range(len(output)):
        output[index] = zero
    left_output_offset = capacity
    right_output_offset = capacity * 2
    lengths_offset = capacity * 3
    for index in range(old_remainder_length):
        output[index] = prime_mul(
            workspace[old_remainder_offset + index], scale, modulus
        )
    for index in range(old_left_length):
        output[left_output_offset + index] = prime_mul(
            workspace[old_left_offset + index], scale, modulus
        )
    for index in range(old_right_length):
        output[right_output_offset + index] = prime_mul(
            workspace[old_right_offset + index], scale, modulus
        )
    output[lengths_offset] = zero + old_remainder_length
    output[lengths_offset + 1] = zero + old_left_length
    output[lengths_offset + 2] = zero + old_right_length
    return True


__all__ = ["packed_prime_field_polynomial_xgcd"]
