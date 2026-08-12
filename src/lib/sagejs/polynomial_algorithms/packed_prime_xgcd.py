"""Source-transparent extended GCD for packed small `GF(p)[x]`."""

from __future__ import annotations

from sagejs.native import (
    PrimeFieldModulus,
    UInt64Buffer,
    native,
    prime_inverse,
    prime_mul,
    prime_sub,
)


@native
def packed_prime_field_polynomial_xgcd(
    output_gcd: UInt64Buffer,
    output_left_coefficient: UInt64Buffer,
    output_right_coefficient: UInt64Buffer,
    output_lengths: UInt64Buffer,
    left: UInt64Buffer,
    right: UInt64Buffer,
    workspace: UInt64Buffer,
    modulus: PrimeFieldModulus,
) -> bool:
    """Write the Sage-normalized extended GCD of `left` and `right`.

    Coefficients use the canonical low-to-high packed representation. The
    three result buffers have one shared capacity, at least one and at least
    the length of either input. `output_lengths` receives the logical lengths
    of the gcd and its left and right Bezout coefficients. Unused result slots
    are zeroed.

    `workspace` is caller-owned scratch with seven times the result capacity.
    This explicit degree-bounded workspace keeps the source portable and the
    isolated ABI allocation-free. It does not impose a coefficient-capacity
    assumption: every coefficient is one fixed-size residue modulo `modulus`.
    The public caller must provide scratch disjoint from the inputs and outputs.
    """
    capacity = len(output_gcd)
    valid = capacity != 0
    if len(output_left_coefficient) != capacity:
        valid = False
    if len(output_right_coefficient) != capacity:
        valid = False
    if len(output_lengths) != 3:
        valid = False
    if len(left) > capacity or len(right) > capacity:
        valid = False
    if len(workspace) != capacity * 7:
        valid = False
    if not valid:
        return False

    # Derive packed zero and one from the caller-owned uint64 span. This is
    # indistinguishable from integer 0/1 to CPython and native C, while the
    # JavaScript fallback retains BigUint64Array-compatible scalar values.
    zero = workspace[0] - workspace[0]
    one = zero + 1
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

    for index in range(capacity):
        output_gcd[index] = zero
        output_left_coefficient[index] = zero
        output_right_coefficient[index] = zero

    if old_remainder_length == 0:
        # Sage uses (0, 0, 1) for xgcd(0, 0).
        output_right_coefficient[0] = one
        output_lengths[0] = zero
        output_lengths[1] = zero
        output_lengths[2] = one
        return True

    scale = prime_inverse(
        workspace[old_remainder_offset + old_remainder_length - 1], modulus
    )
    for index in range(old_remainder_length):
        output_gcd[index] = prime_mul(
            workspace[old_remainder_offset + index], scale, modulus
        )
    for index in range(old_left_length):
        output_left_coefficient[index] = prime_mul(
            workspace[old_left_offset + index], scale, modulus
        )
    for index in range(old_right_length):
        output_right_coefficient[index] = prime_mul(
            workspace[old_right_offset + index], scale, modulus
        )
    output_lengths[0] = zero + old_remainder_length
    output_lengths[1] = zero + old_left_length
    output_lengths[2] = zero + old_right_length
    return True


__all__ = ["packed_prime_field_polynomial_xgcd"]
