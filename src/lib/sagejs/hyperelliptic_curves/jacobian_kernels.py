"""Source-transparent packed Cantor arithmetic for genus 2 and 3.

The public entry points operate on fixed eight-word Mumford rows
`(degree,u0,u1,u2,u3,v0,v1,v2)`.  They deliberately cover only odd-degree
models with one point at infinity over an odd prime field.  The same ordinary
typed-Python bodies are the dynamic oracle and the source of the isolated
native implementation.
"""

from __future__ import annotations

from sagejs.native import (
    PrimeFieldModulus,
    UInt64Buffer,
    native,
    prime_add,
    prime_inverse,
    prime_mul,
    prime_sub,
    prime_zeros,
    uint64,
)


def _poly_clear(store: UInt64Buffer, offset: uint64) -> uint64:
    index: uint64 = 0
    while index < 16:
        store[offset + index] = 0
        index += 1
    return 0


def _poly_copy(
    store: UInt64Buffer,
    target: uint64,
    source: uint64,
    length: uint64,
) -> uint64:
    _cleared = _poly_clear(store, target)
    index: uint64 = 0
    while index < length:
        store[target + index] = store[source + index]
        index += 1
    while length > 0 and store[target + length - 1] == 0:
        length -= 1
    return length


def _poly_is_one(store: UInt64Buffer, offset: uint64, length: uint64) -> bool:
    return length == 1 and store[offset] == 1


def _poly_add(
    store: UInt64Buffer,
    target: uint64,
    left: uint64,
    left_length: uint64,
    right: uint64,
    right_length: uint64,
    modulus: PrimeFieldModulus,
) -> uint64:
    length = left_length
    if right_length > length:
        length = right_length
    _cleared = _poly_clear(store, target)
    index: uint64 = 0
    while index < length:
        value: uint64 = 0
        if index < left_length:
            value = store[left + index]
        if index < right_length:
            value = prime_add(value, store[right + index], modulus)
        store[target + index] = value
        index += 1
    while length > 0 and store[target + length - 1] == 0:
        length -= 1
    return length


def _poly_sub(
    store: UInt64Buffer,
    target: uint64,
    left: uint64,
    left_length: uint64,
    right: uint64,
    right_length: uint64,
    modulus: PrimeFieldModulus,
) -> uint64:
    length = left_length
    if right_length > length:
        length = right_length
    _cleared = _poly_clear(store, target)
    index: uint64 = 0
    while index < length:
        value: uint64 = 0
        if index < left_length:
            value = store[left + index]
        if index < right_length:
            value = prime_sub(value, store[right + index], modulus)
        store[target + index] = value
        index += 1
    while length > 0 and store[target + length - 1] == 0:
        length -= 1
    return length


def _poly_mul(
    store: UInt64Buffer,
    target: uint64,
    left: uint64,
    left_length: uint64,
    right: uint64,
    right_length: uint64,
    modulus: PrimeFieldModulus,
) -> uint64:
    _cleared = _poly_clear(store, target)
    if left_length == 0 or right_length == 0:
        return 0
    length = left_length + right_length - 1
    left_index: uint64 = 0
    while left_index < left_length:
        right_index: uint64 = 0
        while right_index < right_length:
            position = left_index + right_index
            store[target + position] = prime_add(
                store[target + position],
                prime_mul(
                    store[left + left_index],
                    store[right + right_index],
                    modulus,
                ),
                modulus,
            )
            right_index += 1
        left_index += 1
    while length > 0 and store[target + length - 1] == 0:
        length -= 1
    return length


def _poly_scale(
    store: UInt64Buffer,
    target: uint64,
    source: uint64,
    length: uint64,
    scalar: uint64,
    modulus: PrimeFieldModulus,
) -> uint64:
    _cleared = _poly_clear(store, target)
    index: uint64 = 0
    while index < length:
        store[target + index] = prime_mul(store[source + index], scalar, modulus)
        index += 1
    while length > 0 and store[target + length - 1] == 0:
        length -= 1
    return length


def _poly_divrem(
    store: UInt64Buffer,
    quotient: uint64,
    remainder: uint64,
    dividend: uint64,
    dividend_length: uint64,
    divisor: uint64,
    divisor_length: uint64,
    modulus: PrimeFieldModulus,
) -> uint64:
    """Return `32*quotient_length + remainder_length`."""
    _cleared = _poly_clear(store, quotient)
    _cleared = _poly_clear(store, remainder)
    if divisor_length == 0:
        return 1024
    index: uint64 = 0
    while index < dividend_length:
        store[remainder + index] = store[dividend + index]
        index += 1
    remainder_length = dividend_length
    quotient_length: uint64 = 0
    inverse = prime_inverse(store[divisor + divisor_length - 1], modulus)
    while remainder_length >= divisor_length and remainder_length > 0:
        shift = remainder_length - divisor_length
        factor = prime_mul(store[remainder + remainder_length - 1], inverse, modulus)
        store[quotient + shift] = factor
        if shift + 1 > quotient_length:
            quotient_length = shift + 1
        index = 0
        while index < divisor_length:
            position = shift + index
            store[remainder + position] = prime_sub(
                store[remainder + position],
                prime_mul(factor, store[divisor + index], modulus),
                modulus,
            )
            index += 1
        while remainder_length > 0 and store[remainder + remainder_length - 1] == 0:
            remainder_length -= 1
    while quotient_length > 0 and store[quotient + quotient_length - 1] == 0:
        quotient_length -= 1
    return quotient_length * 32 + remainder_length


def _poly_xgcd(
    store: UInt64Buffer,
    gcd_offset: uint64,
    left_coefficient: uint64,
    right_coefficient: uint64,
    left: uint64,
    left_length: uint64,
    right: uint64,
    right_length: uint64,
    modulus: PrimeFieldModulus,
) -> uint64:
    """Return packed lengths `g + 32*s + 1024*t`."""
    # Spans 40--51 of the one per-batch workspace are private xgcd scratch.
    # Keeping them in `store` avoids a heap allocation in every composition.
    old_r: uint64 = 640
    r: uint64 = 656
    old_s: uint64 = 672
    s: uint64 = 688
    old_t: uint64 = 704
    t: uint64 = 720
    quotient: uint64 = 736
    remainder: uint64 = 752
    product: uint64 = 768
    next_value: uint64 = 784
    spare: uint64 = 800

    _cleared = _poly_clear(store, old_r)
    _cleared = _poly_clear(store, r)
    index: uint64 = 0
    while index < left_length:
        store[old_r + index] = store[left + index]
        index += 1
    index = 0
    while index < right_length:
        store[r + index] = store[right + index]
        index += 1
    old_r_length = left_length
    r_length = right_length
    while old_r_length > 0 and store[old_r + old_r_length - 1] == 0:
        old_r_length -= 1
    while r_length > 0 and store[r + r_length - 1] == 0:
        r_length -= 1

    _cleared = _poly_clear(store, old_s)
    _cleared = _poly_clear(store, s)
    _cleared = _poly_clear(store, old_t)
    _cleared = _poly_clear(store, t)
    store[old_s] = 1
    store[t] = 1
    old_s_length: uint64 = 1
    s_length: uint64 = 0
    old_t_length: uint64 = 0
    t_length: uint64 = 1

    while r_length > 0:
        encoded = _poly_divrem(
            store,
            quotient,
            remainder,
            old_r,
            old_r_length,
            r,
            r_length,
            modulus,
        )
        quotient_length = encoded // 32
        remainder_length = encoded % 32

        old_r_length = _poly_copy(store, spare, r, r_length)
        r_length = _poly_copy(store, r, remainder, remainder_length)
        _copied = _poly_copy(store, old_r, spare, old_r_length)

        product_length = _poly_mul(
            store, product, quotient, quotient_length, s, s_length, modulus
        )
        next_length = _poly_sub(
            store, next_value, old_s, old_s_length, product, product_length, modulus
        )
        old_s_length = _poly_copy(store, spare, s, s_length)
        s_length = _poly_copy(store, s, next_value, next_length)
        _copied = _poly_copy(store, old_s, spare, old_s_length)

        product_length = _poly_mul(
            store, product, quotient, quotient_length, t, t_length, modulus
        )
        next_length = _poly_sub(
            store, next_value, old_t, old_t_length, product, product_length, modulus
        )
        old_t_length = _poly_copy(store, spare, t, t_length)
        t_length = _poly_copy(store, t, next_value, next_length)
        _copied = _poly_copy(store, old_t, spare, old_t_length)

    _cleared = _poly_clear(store, gcd_offset)
    _cleared = _poly_clear(store, left_coefficient)
    _cleared = _poly_clear(store, right_coefficient)
    if old_r_length == 0:
        return 0
    inverse = prime_inverse(store[old_r + old_r_length - 1], modulus)
    gcd_length = _poly_scale(store, gcd_offset, old_r, old_r_length, inverse, modulus)
    left_length_out = _poly_scale(
        store, left_coefficient, old_s, old_s_length, inverse, modulus
    )
    right_length_out = _poly_scale(
        store, right_coefficient, old_t, old_t_length, inverse, modulus
    )
    return gcd_length + 32 * left_length_out + 1024 * right_length_out


def _divexact(
    store: UInt64Buffer,
    target: uint64,
    numerator: uint64,
    numerator_length: uint64,
    denominator: uint64,
    denominator_length: uint64,
    modulus: PrimeFieldModulus,
) -> uint64:
    remainder: uint64 = 624
    encoded = _poly_divrem(
        store,
        target,
        remainder,
        numerator,
        numerator_length,
        denominator,
        denominator_length,
        modulus,
    )
    if encoded % 32 != 0:
        return 32
    return encoded // 32


def _reduce(
    store: UInt64Buffer,
    u: uint64,
    u_length: uint64,
    v: uint64,
    v_length: uint64,
    f: uint64,
    f_length: uint64,
    h: uint64,
    h_length: uint64,
    genus: uint64,
    modulus: PrimeFieldModulus,
) -> uint64:
    square: uint64 = 384
    product: uint64 = 400
    numerator: uint64 = 416
    quotient: uint64 = 432
    remainder: uint64 = 448
    next_v: uint64 = 464
    spare_u: uint64 = 480
    spare_v: uint64 = 496
    steps: uint64 = 0
    while u_length > genus + 1:
        square_length = _poly_mul(store, square, v, v_length, v, v_length, modulus)
        product_length = _poly_mul(store, product, h, h_length, v, v_length, modulus)
        numerator_length = _poly_add(
            store, numerator, square, square_length, product, product_length, modulus
        )
        numerator_length = _poly_sub(
            store, square, numerator, numerator_length, f, f_length, modulus
        )
        encoded = _poly_divrem(
            store,
            quotient,
            remainder,
            square,
            numerator_length,
            u,
            u_length,
            modulus,
        )
        if encoded % 32 != 0:
            return 0
        quotient_length = encoded // 32
        if quotient_length == 0:
            return 0
        inverse = prime_inverse(store[quotient + quotient_length - 1], modulus)
        quotient_length = _poly_scale(
            store, spare_u, quotient, quotient_length, inverse, modulus
        )
        numerator_length = _poly_add(
            store, numerator, h, h_length, v, v_length, modulus
        )
        _cleared = _poly_clear(store, square)
        numerator_length = _poly_sub(
            store, square, square, 0, numerator, numerator_length, modulus
        )
        encoded = _poly_divrem(
            store,
            quotient,
            next_v,
            square,
            numerator_length,
            spare_u,
            quotient_length,
            modulus,
        )
        next_v_length = encoded % 32
        u_length = _poly_copy(store, u, spare_u, quotient_length)
        v_length = _poly_copy(store, v, next_v, next_v_length)
        steps += 1
        if steps > 8:
            return 0
    encoded = _poly_divrem(store, quotient, spare_v, v, v_length, u, u_length, modulus)
    v_length = encoded % 32
    _copied = _poly_copy(store, v, spare_v, v_length)
    return u_length + 32 * v_length


def _unpack_row(
    store: UInt64Buffer,
    u: uint64,
    v: uint64,
    rows: UInt64Buffer,
    row_offset: uint64,
    genus: uint64,
    modulus: PrimeFieldModulus,
) -> uint64:
    degree = rows[row_offset]
    checked_modulus = modulus + 0
    if degree > genus:
        return 0
    _cleared = _poly_clear(store, u)
    _cleared = _poly_clear(store, v)
    index: uint64 = 0
    while index <= degree:
        value = rows[row_offset + 1 + index]
        if value >= checked_modulus:
            return 0
        store[u + index] = value
        index += 1
    index = 0
    while index < degree:
        value = rows[row_offset + 5 + index]
        if value >= checked_modulus:
            return 0
        store[v + index] = value
        index += 1
    index = degree + 1
    while index < 4:
        if rows[row_offset + 1 + index] != 0:
            return 0
        index += 1
    index = degree
    while index < 3:
        if rows[row_offset + 5 + index] != 0:
            return 0
        index += 1
    if store[u + degree] != 1:
        return 0
    return degree + 1 + 32 * degree


def _pack_row(
    output: UInt64Buffer,
    row_offset: uint64,
    store: UInt64Buffer,
    u: uint64,
    u_length: uint64,
    v: uint64,
    v_length: uint64,
) -> uint64:
    zero = row_offset - row_offset
    index: uint64 = 0
    while index < 8:
        output[row_offset + index] = 0
        index += 1
    if u_length == 0 or u_length > 4 or v_length >= u_length:
        return zero
    output[row_offset] = u_length - store[u + u_length - 1]
    index = 0
    while index < u_length:
        output[row_offset + 1 + index] = store[u + index]
        index += 1
    index = 0
    while index < v_length:
        output[row_offset + 5 + index] = store[v + index]
        index += 1
    return store[u + u_length - 1]


def _cantor_negate_one(
    output: UInt64Buffer,
    output_offset: uint64,
    source: UInt64Buffer,
    source_offset: uint64,
    model: UInt64Buffer,
    genus: uint64,
    modulus: PrimeFieldModulus,
    store: UInt64Buffer,
) -> uint64:
    u: uint64 = 0
    v: uint64 = 16
    h: uint64 = 32
    total: uint64 = 48
    negative: uint64 = 64
    quotient: uint64 = 80
    remainder: uint64 = 96
    packed = _unpack_row(store, u, v, source, source_offset, genus, modulus)
    if packed == 0:
        return 0
    u_length = packed % 32
    v_length = packed // 32
    h_length = genus + 1
    index: uint64 = 0
    while index < h_length:
        store[h + index] = model[8 + index]
        index += 1
    while h_length > 0 and store[h + h_length - 1] == 0:
        h_length -= 1
    total_length = _poly_add(store, total, h, h_length, v, v_length, modulus)
    _cleared = _poly_clear(store, negative)
    index = 0
    while index < total_length:
        store[negative + index] = prime_sub(0, store[total + index], modulus)
        index += 1
    encoded = _poly_divrem(
        store,
        quotient,
        remainder,
        negative,
        total_length,
        u,
        u_length,
        modulus,
    )
    v_length = encoded % 32
    return _pack_row(output, output_offset, store, u, u_length, remainder, v_length)


def _cantor_add_one(
    output: UInt64Buffer,
    output_offset: uint64,
    left_rows: UInt64Buffer,
    left_offset: uint64,
    right_rows: UInt64Buffer,
    right_offset: uint64,
    model: UInt64Buffer,
    genus: uint64,
    modulus: PrimeFieldModulus,
    store: UInt64Buffer,
) -> uint64:
    checked_modulus = modulus + 0
    index: uint64 = 0
    while index < len(store):
        store[index] = 0
        index += 1
    u1: uint64 = 0
    v1: uint64 = 16
    u2: uint64 = 32
    v2: uint64 = 48
    f: uint64 = 64
    h: uint64 = 80
    common0: uint64 = 96
    left0: uint64 = 112
    right0: uint64 = 128
    difference: uint64 = 144
    conjugate: uint64 = 160
    common: uint64 = 176
    coefficient0: uint64 = 192
    coefficient1: uint64 = 208
    u3: uint64 = 224
    v3: uint64 = 240
    temp0: uint64 = 256
    temp1: uint64 = 272
    temp2: uint64 = 288
    temp3: uint64 = 304
    temp4: uint64 = 320
    temp5: uint64 = 336
    temp6: uint64 = 352
    temp7: uint64 = 368

    packed = _unpack_row(store, u1, v1, left_rows, left_offset, genus, modulus)
    if packed == 0:
        return 0
    u1_length = packed % 32
    v1_length = packed // 32
    packed = _unpack_row(store, u2, v2, right_rows, right_offset, genus, modulus)
    if packed == 0:
        return 0
    u2_length = packed % 32
    v2_length = packed // 32

    f_length = genus * 2 + 2
    h_length = genus + 1
    index: uint64 = 0
    while index < 8:
        if model[index] >= checked_modulus:
            return 0
        store[f + index] = model[index]
        index += 1
    index = 0
    while index < 4:
        if model[8 + index] >= checked_modulus:
            return 0
        store[h + index] = model[8 + index]
        index += 1
    while f_length > 0 and store[f + f_length - 1] == 0:
        f_length -= 1
    while h_length > 0 and store[h + h_length - 1] == 0:
        h_length -= 1
    if f_length != genus * 2 + 2:
        return 0

    if u1_length == 1:
        _copied = _poly_copy(store, u3, u2, u2_length)
        _copied = _poly_copy(store, v3, v2, v2_length)
        if _pack_row(output, output_offset, store, u3, u2_length, v3, v2_length) != 0:
            return 5
        return 0
    if u2_length == 1:
        _copied = _poly_copy(store, u3, u1, u1_length)
        _copied = _poly_copy(store, v3, v1, v1_length)
        if _pack_row(output, output_offset, store, u3, u1_length, v3, v1_length) != 0:
            return 5
        return 0

    equal = u1_length == u2_length and v1_length == v2_length
    if equal:
        index = 0
        while index < u1_length:
            if store[u1 + index] != store[u2 + index]:
                equal = False
            index += 1
        index = 0
        while index < v1_length:
            if store[v1 + index] != store[v2 + index]:
                equal = False
            index += 1

    branch: uint64 = 1
    if equal:
        branch = 2
        temp0_length = _poly_add(store, temp0, v1, v1_length, v1, v1_length, modulus)
        temp0_length = _poly_add(
            store, temp1, temp0, temp0_length, h, h_length, modulus
        )
        encoded = _poly_xgcd(
            store,
            common,
            coefficient0,
            coefficient1,
            u1,
            u1_length,
            temp1,
            temp0_length,
            modulus,
        )
        common_length = encoded % 32
        bezout_length = encoded // 1024
        temp0_length = _divexact(
            store, temp0, u1, u1_length, common, common_length, modulus
        )
        if temp0_length >= 32:
            return 0
        u3_length = _poly_mul(
            store, u3, temp0, temp0_length, temp0, temp0_length, modulus
        )
        temp0_length = _poly_mul(store, temp0, h, h_length, v1, v1_length, modulus)
        temp1_length = _poly_mul(store, temp1, v1, v1_length, v1, v1_length, modulus)
        temp2_length = _poly_sub(
            store, temp2, f, f_length, temp0, temp0_length, modulus
        )
        temp3_length = _poly_sub(
            store, temp3, temp2, temp2_length, temp1, temp1_length, modulus
        )
        temp4_length = _divexact(
            store, temp4, temp3, temp3_length, common, common_length, modulus
        )
        if temp4_length >= 32:
            return 0
        temp5_length = _poly_mul(
            store,
            temp5,
            coefficient1,
            bezout_length,
            temp4,
            temp4_length,
            modulus,
        )
        temp6_length = _poly_add(
            store, temp6, v1, v1_length, temp5, temp5_length, modulus
        )
        encoded = _poly_divrem(
            store, temp7, v3, temp6, temp6_length, u3, u3_length, modulus
        )
        v3_length = encoded % 32
    else:
        encoded = _poly_xgcd(
            store,
            common0,
            left0,
            right0,
            u1,
            u1_length,
            u2,
            u2_length,
            modulus,
        )
        common0_length = encoded % 32
        right0_length = encoded // 1024
        difference_length = _poly_sub(
            store, difference, v1, v1_length, v2, v2_length, modulus
        )
        if _poly_is_one(store, common0, common0_length):
            u3_length = _poly_mul(store, u3, u1, u1_length, u2, u2_length, modulus)
            temp0_length = _poly_mul(
                store, temp0, right0, right0_length, u2, u2_length, modulus
            )
            temp1_length = _poly_mul(
                store,
                temp1,
                temp0,
                temp0_length,
                difference,
                difference_length,
                modulus,
            )
            temp2_length = _poly_add(
                store, temp2, v2, v2_length, temp1, temp1_length, modulus
            )
            encoded = _poly_divrem(
                store, temp3, v3, temp2, temp2_length, u3, u3_length, modulus
            )
            v3_length = encoded % 32
        else:
            conjugate_length = _poly_add(
                store, conjugate, v1, v1_length, v2, v2_length, modulus
            )
            conjugate_length = _poly_add(
                store,
                temp0,
                conjugate,
                conjugate_length,
                h,
                h_length,
                modulus,
            )
            conjugate_length = _poly_copy(store, conjugate, temp0, conjugate_length)
            if conjugate_length == 0:
                branch = 3
                temp0_length = _poly_mul(
                    store, temp0, u1, u1_length, u2, u2_length, modulus
                )
                temp1_length = _poly_mul(
                    store,
                    temp1,
                    common0,
                    common0_length,
                    common0,
                    common0_length,
                    modulus,
                )
                u3_length = _divexact(
                    store,
                    u3,
                    temp0,
                    temp0_length,
                    temp1,
                    temp1_length,
                    modulus,
                )
                if u3_length >= 32:
                    return 0
                temp2_length = _divexact(
                    store,
                    temp2,
                    u2,
                    u2_length,
                    common0,
                    common0_length,
                    modulus,
                )
                if temp2_length >= 32:
                    return 0
                temp3_length = _poly_mul(
                    store,
                    temp3,
                    right0,
                    right0_length,
                    difference,
                    difference_length,
                    modulus,
                )
                temp4_length = _poly_mul(
                    store,
                    temp4,
                    temp3,
                    temp3_length,
                    temp2,
                    temp2_length,
                    modulus,
                )
                temp5_length = _poly_add(
                    store, temp5, v2, v2_length, temp4, temp4_length, modulus
                )
                encoded = _poly_divrem(
                    store, temp6, v3, temp5, temp5_length, u3, u3_length, modulus
                )
                v3_length = encoded % 32
            else:
                branch = 4
                encoded = _poly_xgcd(
                    store,
                    common,
                    coefficient0,
                    coefficient1,
                    common0,
                    common0_length,
                    conjugate,
                    conjugate_length,
                    modulus,
                )
                common_length = encoded % 32
                coefficient0_length = (encoded // 32) % 32
                coefficient1_length = encoded // 1024
                temp0_length = _poly_mul(
                    store, temp0, u1, u1_length, u2, u2_length, modulus
                )
                temp1_length = _poly_mul(
                    store,
                    temp1,
                    common,
                    common_length,
                    common,
                    common_length,
                    modulus,
                )
                u3_length = _divexact(
                    store,
                    u3,
                    temp0,
                    temp0_length,
                    temp1,
                    temp1_length,
                    modulus,
                )
                if u3_length >= 32:
                    return 0
                temp0_length = _poly_mul(
                    store,
                    temp0,
                    coefficient0,
                    coefficient0_length,
                    right0,
                    right0_length,
                    modulus,
                )
                temp1_length = _poly_mul(
                    store,
                    temp1,
                    temp0,
                    temp0_length,
                    difference,
                    difference_length,
                    modulus,
                )
                temp2_length = _poly_mul(
                    store, temp2, temp1, temp1_length, u2, u2_length, modulus
                )
                temp0_length = _poly_mul(
                    store, temp0, h, h_length, v2, v2_length, modulus
                )
                temp1_length = _poly_mul(
                    store, temp1, v2, v2_length, v2, v2_length, modulus
                )
                temp3_length = _poly_sub(
                    store, temp3, f, f_length, temp0, temp0_length, modulus
                )
                temp4_length = _poly_sub(
                    store, temp4, temp3, temp3_length, temp1, temp1_length, modulus
                )
                temp5_length = _poly_mul(
                    store,
                    temp5,
                    coefficient1,
                    coefficient1_length,
                    temp4,
                    temp4_length,
                    modulus,
                )
                temp6_length = _poly_add(
                    store,
                    temp6,
                    temp2,
                    temp2_length,
                    temp5,
                    temp5_length,
                    modulus,
                )
                temp7_length = _divexact(
                    store,
                    temp7,
                    temp6,
                    temp6_length,
                    common,
                    common_length,
                    modulus,
                )
                if temp7_length >= 32:
                    return 0
                temp0_length = _poly_add(
                    store, temp0, v2, v2_length, temp7, temp7_length, modulus
                )
                encoded = _poly_divrem(
                    store, temp1, v3, temp0, temp0_length, u3, u3_length, modulus
                )
                v3_length = encoded % 32

    reduced = _reduce(
        store,
        u3,
        u3_length,
        v3,
        v3_length,
        f,
        f_length,
        h,
        h_length,
        genus,
        modulus,
    )
    if reduced == 0:
        return 0
    u3_length = reduced % 32
    v3_length = reduced // 32
    if _pack_row(output, output_offset, store, u3, u3_length, v3, v3_length) == 0:
        return 0
    return branch


def _validate_packed_row(
    rows: UInt64Buffer,
    row_offset: uint64,
    model: UInt64Buffer,
    genus: uint64,
    modulus: PrimeFieldModulus,
    store: UInt64Buffer,
) -> uint64:
    """Check one canonical reduced row against its exact curve equation."""
    u: uint64 = 0
    v: uint64 = 16
    f: uint64 = 32
    h: uint64 = 48
    square: uint64 = 64
    product: uint64 = 80
    total: uint64 = 96
    relation: uint64 = 112
    quotient: uint64 = 128
    remainder: uint64 = 144
    packed: uint64 = _unpack_row(store, u, v, rows, row_offset, genus, modulus)
    if packed == 0:
        return 0
    u_length: uint64 = packed % 32
    v_length: uint64 = packed // 32
    f_length: uint64 = 2 * genus + 2
    h_length: uint64 = genus + 1
    _cleared = _poly_clear(store, f)
    _cleared = _poly_clear(store, h)
    index: uint64 = 0
    while index < f_length:
        store[f + index] = model[index]
        index += 1
    index = 0
    while index < h_length:
        store[h + index] = model[8 + index]
        index += 1
    while f_length > 0 and store[f + f_length - 1] == 0:
        f_length -= 1
    while h_length > 0 and store[h + h_length - 1] == 0:
        h_length -= 1
    square_length: uint64 = _poly_mul(store, square, v, v_length, v, v_length, modulus)
    product_length: uint64 = _poly_mul(
        store, product, h, h_length, v, v_length, modulus
    )
    relation_length: uint64 = _poly_add(
        store,
        total,
        square,
        square_length,
        product,
        product_length,
        modulus,
    )
    relation_length = _poly_sub(
        store,
        relation,
        total,
        relation_length,
        f,
        f_length,
        modulus,
    )
    encoded: uint64 = _poly_divrem(
        store,
        quotient,
        remainder,
        relation,
        relation_length,
        u,
        u_length,
        modulus,
    )
    if encoded % 32 == 0:
        return 1
    return 0


@native
def packed_cantor_validate_batch(
    output: UInt64Buffer,
    statuses: UInt64Buffer,
    model: UInt64Buffer,
    rows: UInt64Buffer,
    count: uint64,
    genus: uint64,
    modulus: PrimeFieldModulus,
) -> bool:
    """Authenticate canonical serialized rows before copying any output."""
    checked_modulus = modulus + 0
    if (
        checked_modulus <= 2
        or (genus != 2 and genus != 3)
        or len(model) != 12
        or len(rows) != count * 8
        or len(output) != count * 8
        or len(statuses) != count
    ):
        return False
    index: uint64 = 0
    while index < 12:
        if model[index] >= checked_modulus:
            return False
        index += 1
    index = 2 * genus + 2
    while index < 8:
        if model[index] != 0:
            return False
        index += 1
    index = genus + 1
    while index < 4:
        if model[8 + index] != 0:
            return False
        index += 1
    if model[2 * genus + 1] == 0:
        return False
    store = prime_zeros(16 * 10)
    item: uint64 = 0
    while item < count:
        valid: uint64 = _validate_packed_row(
            rows,
            item * 8,
            model,
            genus,
            modulus,
            store,
        )
        if valid == 0:
            statuses[item] = 0
            return False
        statuses[item] = 1
        item += 1
    # The validation pass must finish before the first output word changes.
    # This makes a failed call atomic even when callers reuse output storage.
    item = 0
    while item < count:
        index = 0
        while index < 8:
            output[item * 8 + index] = rows[item * 8 + index]
            index += 1
        item += 1
    return True


@native
def packed_cantor_copy_batch(
    output: UInt64Buffer,
    statuses: UInt64Buffer,
    model: UInt64Buffer,
    left: UInt64Buffer,
    right: UInt64Buffer,
    count: uint64,
    genus: uint64,
    modulus: PrimeFieldModulus,
) -> bool:
    """Copy rows through the exact add ABI as a boundary-only control."""
    checked_modulus = modulus + 0
    if (
        checked_modulus <= 2
        or (genus != 2 and genus != 3)
        or len(model) != 12
        or len(output) != count * 8
        or len(statuses) != count
        or len(left) != count * 8
        or len(right) != count * 8
    ):
        return False
    item: uint64 = 0
    while item < count:
        index: uint64 = 0
        while index < 8:
            output[item * 8 + index] = left[item * 8 + index]
            index += 1
        statuses[item] = 1
        item += 1
    return True


@native
def packed_cantor_add_batch(
    output: UInt64Buffer,
    statuses: UInt64Buffer,
    model: UInt64Buffer,
    left: UInt64Buffer,
    right: UInt64Buffer,
    count: uint64,
    genus: uint64,
    modulus: PrimeFieldModulus,
) -> bool:
    """Add `count` pairs, emitting canonical rows and branch statuses."""
    item: uint64 = 0
    checked_modulus = modulus + 0
    valid = (
        (genus == 2 or genus == 3)
        and checked_modulus > 2
        and len(model) == 12
        and len(output) == count * 8
        and len(statuses) == count
        and len(left) == count * 8
        and len(right) == count * 8
    )
    if not valid:
        return False
    store = prime_zeros(16 * 52)
    while item < count:
        status = _cantor_add_one(
            output,
            item * 8,
            left,
            item * 8,
            right,
            item * 8,
            model,
            genus,
            modulus,
            store,
        )
        statuses[item] = status
        if status == 0:
            return False
        item += 1
    return True


@native
def packed_cantor_sum_batch(
    output: UInt64Buffer,
    statuses: UInt64Buffer,
    model: UInt64Buffer,
    elements: UInt64Buffer,
    count: uint64,
    genus: uint64,
    modulus: PrimeFieldModulus,
) -> bool:
    """Reduce one packed batch to its exact group sum in a single crossing."""
    checked_modulus = modulus + 0
    status_count: uint64 = 0
    if count > 0:
        status_count = count - 1
    if (
        checked_modulus <= 2
        or (genus != 2 and genus != 3)
        or len(output) != 8
        or len(statuses) != status_count
        or len(model) != 12
        or len(elements) != count * 8
    ):
        return False
    index: uint64 = 0
    while index < 12:
        if model[index] >= checked_modulus:
            return False
        index += 1
    index = 2 * genus + 2
    while index < 8:
        if model[index] != 0:
            return False
        index += 1
    index = genus + 1
    while index < 4:
        if model[8 + index] != 0:
            return False
        index += 1
    if model[2 * genus + 1] == 0:
        return False
    if count == 0:
        index = 0
        while index < 8:
            output[index] = 0
            index += 1
        output[1] = 1
        return True

    store = prime_zeros(16 * 52)
    accumulator = prime_zeros(8)
    temporary = prime_zeros(8)
    packed = _unpack_row(store, 0, 16, elements, 0, genus, modulus)
    if packed == 0:
        return False
    index = 0
    while index < 8:
        accumulator[index] = elements[index]
        index += 1
    item: uint64 = 1
    while item < count:
        status = _cantor_add_one(
            temporary,
            0,
            accumulator,
            0,
            elements,
            item * 8,
            model,
            genus,
            modulus,
            store,
        )
        statuses[item - 1] = status
        if status == 0:
            return False
        index = 0
        while index < 8:
            accumulator[index] = temporary[index]
            index += 1
        item += 1
    index = 0
    while index < 8:
        output[index] = accumulator[index]
        index += 1
    return True


@native
def packed_cantor_progression_batch(
    output: UInt64Buffer,
    statuses: UInt64Buffer,
    model: UInt64Buffer,
    start: UInt64Buffer,
    step: UInt64Buffer,
    count: uint64,
    genus: uint64,
    modulus: PrimeFieldModulus,
) -> bool:
    """Emit `start + i*step` in one source-transparent boundary crossing."""
    checked_modulus = modulus + 0
    valid = (
        (genus == 2 or genus == 3)
        and checked_modulus > 2
        and len(model) == 12
        and len(start) == 8
        and len(step) == 8
        and len(output) == count * 8
        and len(statuses) == count
    )
    if not valid:
        return False
    if count == 0:
        return True
    store = prime_zeros(16 * 52)
    current = prime_zeros(8)
    increment = prime_zeros(8)
    temporary = prime_zeros(8)
    identity = prime_zeros(8)
    identity[0] = 0
    identity[1] = 1
    status = _cantor_add_one(
        current, 0, start, 0, identity, 0, model, genus, modulus, store
    )
    if status == 0:
        return False
    status = _cantor_add_one(
        increment, 0, step, 0, identity, 0, model, genus, modulus, store
    )
    if status == 0:
        return False
    item: uint64 = 0
    while item < count:
        index = 0
        while index < 8:
            output[item * 8 + index] = current[index]
            index += 1
        if item == 0:
            statuses[item] = 5
        if item > 0:
            statuses[item] = status
        if item + 1 < count:
            status = _cantor_add_one(
                temporary,
                0,
                current,
                0,
                increment,
                0,
                model,
                genus,
                modulus,
                store,
            )
            if status == 0:
                return False
            index = 0
            while index < 8:
                current[index] = temporary[index]
                index += 1
        item += 1
    return True


def _scalar_bit_length(
    scalar_words: UInt64Buffer,
    scalar_offset: uint64,
    words_per_scalar: uint64,
) -> uint64:
    used_words = words_per_scalar
    while used_words > 0 and scalar_words[scalar_offset + used_words - 1] == 0:
        used_words -= 1
    if used_words == 0:
        return 0
    bits: uint64 = (used_words - 1) * 64
    word = scalar_words[scalar_offset + used_words - 1]
    while word > 0:
        bits += 1
        word //= 2
    return bits


def _scalar_operation_count(
    scalar_words: UInt64Buffer,
    scalar_offset: uint64,
    words_per_scalar: uint64,
) -> uint64:
    # Count the signed non-adjacent chain exactly. The first nonzero digit is
    # copied (or negated) into the accumulator and is not a group operation.
    bits = _scalar_bit_length(scalar_words, scalar_offset, words_per_scalar)
    if bits == 0:
        return 0
    operations: uint64 = 0
    started: uint64 = 0
    carry: uint64 = 0
    position: uint64 = 0
    word_index: uint64 = 0
    bit_in_word: uint64 = 0
    word = scalar_words[scalar_offset]
    while position < bits or carry != 0:
        original_bit: uint64 = 0
        if position < bits:
            original_bit = word % 2
            word //= 2
        next_bit: uint64 = 0
        if position + 1 < bits:
            if bit_in_word + 1 < 64:
                next_bit = word % 2
            else:
                next_bit = scalar_words[scalar_offset + word_index + 1] % 2
        total = original_bit + carry
        digit: uint64 = 0
        if total == 0:
            carry = 0
        elif total == 2:
            carry = 1
        else:
            digit = 1
            carry = 0
            if next_bit != 0:
                digit = 2
                carry = 1
        if digit != 0:
            if started != 0:
                operations += 1
            else:
                started = 1
        position += 1
        bit_in_word += 1
        if bit_in_word == 64:
            word_index += 1
            bit_in_word = 0
            if word_index < words_per_scalar:
                word = scalar_words[scalar_offset + word_index]
        if position < bits or carry != 0:
            operations += 1
    return operations


def _cantor_scalar_one(
    output: UInt64Buffer,
    output_offset: uint64,
    element: UInt64Buffer,
    element_offset: uint64,
    scalar_words: UInt64Buffer,
    scalar_offset: uint64,
    words_per_scalar: uint64,
    negative: uint64,
    model: UInt64Buffer,
    genus: uint64,
    modulus: PrimeFieldModulus,
    store: UInt64Buffer,
    accumulator: UInt64Buffer,
    addend: UInt64Buffer,
    temporary: UInt64Buffer,
) -> uint64:
    packed = _unpack_row(
        store,
        0,
        16,
        element,
        element_offset,
        genus,
        modulus,
    )
    if packed == 0:
        return 0
    index: uint64 = 0
    while index < 8:
        accumulator[index] = 0
        addend[index] = element[element_offset + index]
        index += 1
    accumulator[0] = 0
    accumulator[1] = 1
    operations: uint64 = 0
    started: uint64 = 0
    carry: uint64 = 0
    bits = _scalar_bit_length(scalar_words, scalar_offset, words_per_scalar)
    position: uint64 = 0
    word_index: uint64 = 0
    bit_in_word: uint64 = 0
    word: uint64 = 0
    if bits != 0:
        word = scalar_words[scalar_offset]
    # Generate the width-two non-adjacent form from the immutable little-endian
    # words. `carry` can create one final digit above the original top bit.
    while position < bits or carry != 0:
        original_bit: uint64 = 0
        if position < bits:
            original_bit = word % 2
            word //= 2
        next_bit: uint64 = 0
        if position + 1 < bits:
            if bit_in_word + 1 < 64:
                next_bit = word % 2
            else:
                next_bit = scalar_words[scalar_offset + word_index + 1] % 2
        total = original_bit + carry
        digit: uint64 = 0
        if total == 0:
            carry = 0
        elif total == 2:
            carry = 1
        else:
            digit = 1
            carry = 0
            if next_bit != 0:
                digit = 2
                carry = 1
        if digit != 0:
            if started == 0:
                if digit == 1:
                    index = 0
                    while index < 8:
                        accumulator[index] = addend[index]
                        index += 1
                else:
                    if (
                        _cantor_negate_one(
                            accumulator,
                            0,
                            addend,
                            0,
                            model,
                            genus,
                            modulus,
                            store,
                        )
                        == 0
                    ):
                        return 0
                started = 1
            else:
                status: uint64 = 0
                # Keep the two borrowed roots explicit. Native Kernel v22 does
                # not yet prove a buffer local safely rebindable between them.
                if digit == 1:
                    status = _cantor_add_one(
                        temporary,
                        0,
                        accumulator,
                        0,
                        addend,
                        0,
                        model,
                        genus,
                        modulus,
                        store,
                    )
                else:
                    if (
                        _cantor_negate_one(
                            output,
                            output_offset,
                            addend,
                            0,
                            model,
                            genus,
                            modulus,
                            store,
                        )
                        == 0
                    ):
                        return 0
                    status = _cantor_add_one(
                        temporary,
                        0,
                        accumulator,
                        0,
                        output,
                        output_offset,
                        model,
                        genus,
                        modulus,
                        store,
                    )
                if status == 0:
                    return 0
                index = 0
                while index < 8:
                    accumulator[index] = temporary[index]
                    index += 1
                operations += 1
        position += 1
        bit_in_word += 1
        if bit_in_word == 64:
            word_index += 1
            bit_in_word = 0
            if word_index < words_per_scalar:
                word = scalar_words[scalar_offset + word_index]
        if position < bits or carry != 0:
            status = _cantor_add_one(
                temporary,
                0,
                addend,
                0,
                addend,
                0,
                model,
                genus,
                modulus,
                store,
            )
            if status == 0:
                return 0
            index = 0
            while index < 8:
                addend[index] = temporary[index]
                index += 1
            operations += 1
    index = 0
    while index < 8:
        output[output_offset + index] = accumulator[index]
        index += 1
    if negative != 0 and output[output_offset] != 0:
        if (
            _cantor_negate_one(
                output,
                output_offset,
                output,
                output_offset,
                model,
                genus,
                modulus,
                store,
            )
            == 0
        ):
            return 0
    return operations + 1


@native
def packed_cantor_scalar_batch(
    output: UInt64Buffer,
    statuses: UInt64Buffer,
    model: UInt64Buffer,
    elements: UInt64Buffer,
    scalar_words: UInt64Buffer,
    scalar_signs: UInt64Buffer,
    count: uint64,
    words_per_scalar: uint64,
    genus: uint64,
    modulus: PrimeFieldModulus,
) -> bool:
    """Multiply a batch by signed little-endian 64-bit scalar words."""
    item: uint64 = 0
    checked_modulus = modulus + 0
    valid = (
        (genus == 2 or genus == 3)
        and checked_modulus > 2
        and len(model) == 12
        and len(output) == count * 8
        and len(statuses) == count
        and len(elements) == count * 8
        and len(scalar_words) == count * words_per_scalar
        and len(scalar_signs) == count
    )
    if not valid:
        return False
    index: uint64 = 0
    while index < 12:
        if model[index] >= checked_modulus:
            return False
        index += 1
    index = 2 * genus + 2
    while index < 8:
        if model[index] != 0:
            return False
        index += 1
    index = genus + 1
    while index < 4:
        if model[8 + index] != 0:
            return False
        index += 1
    if model[2 * genus + 1] == 0:
        return False
    store = prime_zeros(16 * 52)
    accumulator = prime_zeros(8)
    addend = prime_zeros(8)
    temporary = prime_zeros(8)
    while item < count:
        statuses[item] = _cantor_scalar_one(
            output,
            item * 8,
            elements,
            item * 8,
            scalar_words,
            item * words_per_scalar,
            words_per_scalar,
            scalar_signs[item],
            model,
            genus,
            modulus,
            store,
            accumulator,
            addend,
            temporary,
        )
        if statuses[item] == 0:
            return False
        item += 1
    return True


def _row_copy(
    target: UInt64Buffer,
    target_offset: uint64,
    source: UInt64Buffer,
    source_offset: uint64,
) -> uint64:
    index: uint64 = 0
    while index < 8:
        target[target_offset + index] = source[source_offset + index]
        index += 1
    return 0


def _row_equal(
    left: UInt64Buffer,
    left_offset: uint64,
    right: UInt64Buffer,
    right_offset: uint64,
) -> bool:
    index: uint64 = 0
    equal = True
    while index < 8:
        if left[left_offset + index] != right[right_offset + index]:
            equal = False
        index += 1
    return equal


def _row_hash(
    rows: UInt64Buffer,
    offset: uint64,
    capacity: uint64,
) -> uint64:
    value: uint64 = 1469598103934665603
    index: uint64 = 0
    while index < 8:
        value = value * 1099511628211 + rows[offset + index]
        index += 1
    return value % capacity


def _search_record(
    statuses: UInt64Buffer,
    diagnostics: UInt64Buffer,
    status: uint64,
    group_operations: uint64,
    scalar_bits: uint64,
    baby_steps: uint64,
    giant_steps: uint64,
    hash_collisions: uint64,
) -> bool:
    statuses[0] = status
    diagnostics[0] = group_operations
    diagnostics[1] = scalar_bits
    diagnostics[2] = baby_steps
    diagnostics[3] = giant_steps
    diagnostics[4] = hash_collisions
    return True


@native
def packed_cantor_search_progression(
    output: UInt64Buffer,
    statuses: UInt64Buffer,
    diagnostics: UInt64Buffer,
    model: UInt64Buffer,
    divisor: UInt64Buffer,
    base_words: UInt64Buffer,
    stride_words: UInt64Buffer,
    words_per_scalar: uint64,
    count: uint64,
    baby_count: uint64,
    max_group_operations: uint64,
    genus: uint64,
    modulus: PrimeFieldModulus,
) -> bool:
    """Search `(base + i*stride)*D == 0` in one native boundary.

    Status 1 means found, 2 means not found, 3 means the exact operation or
    table resource bound was reached, and 4 means a mathematically invalid
    input.  The boolean return reports whether the fixed buffer ABI itself was
    accepted; it is deliberately independent of mathematical success.
    """
    checked_modulus = modulus + 0
    shape_valid = (
        len(output) == 1
        and len(statuses) == 1
        and len(diagnostics) == 5
        and len(model) == 12
        and len(divisor) == 8
        and words_per_scalar > 0
        and len(base_words) == words_per_scalar
        and len(stride_words) == words_per_scalar
    )
    if not shape_valid:
        return False
    statuses[0] = 4
    diagnostic_index: uint64 = 0
    while diagnostic_index < 5:
        diagnostics[diagnostic_index] = 0
        diagnostic_index += 1
    mathematical_input_valid = (
        (genus == 2 or genus == 3)
        and checked_modulus > 2
        and count > 0
        and baby_count > 0
        and base_words[words_per_scalar - 1] != 0
        and stride_words[words_per_scalar - 1] != 0
    )
    if not mathematical_input_valid:
        return True
    if baby_count > 1000000:
        return _search_record(statuses, diagnostics, 3, 0, 0, 0, 0, 0)
    # The explicit million-row cap makes these square checks and all table
    # capacity arithmetic safely fixed-width while bounding native allocation.
    if count > baby_count * baby_count:
        return True
    if baby_count > 1 and count <= (baby_count - 1) * (baby_count - 1):
        return True

    target_capacity = baby_count * 2 + 1
    capacity: uint64 = 1
    while capacity < target_capacity:
        capacity *= 2

    store = prime_zeros(16 * 52)
    scalar_accumulator = prime_zeros(8)
    scalar_addend = prime_zeros(8)
    scalar_temporary = prime_zeros(8)
    base_multiple = prime_zeros(8)
    stride_multiple = prime_zeros(8)
    giant_stride = prime_zeros(8)
    negative_base = prime_zeros(8)
    negative_giant_stride = prime_zeros(8)
    current = prime_zeros(8)
    temporary = prime_zeros(8)
    one_word = prime_zeros(1)
    occupied = prime_zeros(capacity)
    hashes = prime_zeros(capacity)
    indices = prime_zeros(capacity)
    table_rows = prime_zeros(capacity * 8)

    group_operations: uint64 = 0
    scalar_bits: uint64 = 0
    baby_steps: uint64 = 0
    giant_steps: uint64 = 0
    hash_collisions: uint64 = 0

    needed = _scalar_operation_count(base_words, 0, words_per_scalar)
    if group_operations + needed > max_group_operations:
        return _search_record(
            statuses,
            diagnostics,
            3,
            group_operations,
            scalar_bits,
            baby_steps,
            giant_steps,
            hash_collisions,
        )
    scalar_status = _cantor_scalar_one(
        base_multiple,
        0,
        divisor,
        0,
        base_words,
        0,
        words_per_scalar,
        0,
        model,
        genus,
        modulus,
        store,
        scalar_accumulator,
        scalar_addend,
        scalar_temporary,
    )
    if scalar_status == 0:
        return _search_record(
            statuses,
            diagnostics,
            4,
            group_operations,
            scalar_bits,
            baby_steps,
            giant_steps,
            hash_collisions,
        )
    group_operations += needed
    scalar_bits += _scalar_bit_length(base_words, 0, words_per_scalar)

    needed = _scalar_operation_count(stride_words, 0, words_per_scalar)
    if group_operations + needed > max_group_operations:
        return _search_record(
            statuses,
            diagnostics,
            3,
            group_operations,
            scalar_bits,
            baby_steps,
            giant_steps,
            hash_collisions,
        )
    scalar_status = _cantor_scalar_one(
        stride_multiple,
        0,
        divisor,
        0,
        stride_words,
        0,
        words_per_scalar,
        0,
        model,
        genus,
        modulus,
        store,
        scalar_accumulator,
        scalar_addend,
        scalar_temporary,
    )
    if scalar_status == 0:
        return _search_record(
            statuses,
            diagnostics,
            4,
            group_operations,
            scalar_bits,
            baby_steps,
            giant_steps,
            hash_collisions,
        )
    group_operations += needed
    scalar_bits += _scalar_bit_length(stride_words, 0, words_per_scalar)

    one_word[0] = baby_count
    needed = _scalar_operation_count(one_word, 0, 1)
    if group_operations + needed > max_group_operations:
        return _search_record(
            statuses,
            diagnostics,
            3,
            group_operations,
            scalar_bits,
            baby_steps,
            giant_steps,
            hash_collisions,
        )
    scalar_status = _cantor_scalar_one(
        giant_stride,
        0,
        stride_multiple,
        0,
        one_word,
        0,
        1,
        0,
        model,
        genus,
        modulus,
        store,
        scalar_accumulator,
        scalar_addend,
        scalar_temporary,
    )
    if scalar_status == 0:
        return _search_record(
            statuses,
            diagnostics,
            4,
            group_operations,
            scalar_bits,
            baby_steps,
            giant_steps,
            hash_collisions,
        )
    group_operations += needed
    scalar_bits += _scalar_bit_length(one_word, 0, 1)

    if (
        _cantor_negate_one(
            negative_base,
            0,
            base_multiple,
            0,
            model,
            genus,
            modulus,
            store,
        )
        == 0
    ):
        return _search_record(
            statuses,
            diagnostics,
            4,
            group_operations,
            scalar_bits,
            baby_steps,
            giant_steps,
            hash_collisions,
        )
    if (
        _cantor_negate_one(
            negative_giant_stride,
            0,
            giant_stride,
            0,
            model,
            genus,
            modulus,
            store,
        )
        == 0
    ):
        return _search_record(
            statuses,
            diagnostics,
            4,
            group_operations,
            scalar_bits,
            baby_steps,
            giant_steps,
            hash_collisions,
        )

    # Insert j*S in increasing j, retaining the first (smallest) j for a
    # duplicate row.  Identity is an ordinary canonical key, never a sentinel.
    current[0] = 0
    current[1] = 1
    baby: uint64 = 0
    while baby < baby_count:
        code = _row_hash(current, 0, capacity)
        slot = code
        probing = True
        while probing:
            if occupied[slot] == 0:
                occupied[slot] = 1
                hashes[slot] = code
                indices[slot] = baby
                _copied = _row_copy(table_rows, slot * 8, current, 0)
                probing = False
            else:
                hash_collisions += 1
                if hashes[slot] == code and _row_equal(
                    table_rows, slot * 8, current, 0
                ):
                    probing = False
                else:
                    slot += 1
                    if slot == capacity:
                        slot = 0
        baby_steps += 1
        if baby + 1 < baby_count:
            if group_operations == max_group_operations:
                return _search_record(
                    statuses,
                    diagnostics,
                    3,
                    group_operations,
                    scalar_bits,
                    baby_steps,
                    giant_steps,
                    hash_collisions,
                )
            add_status = _cantor_add_one(
                temporary,
                0,
                current,
                0,
                stride_multiple,
                0,
                model,
                genus,
                modulus,
                store,
            )
            if add_status == 0:
                return _search_record(
                    statuses,
                    diagnostics,
                    4,
                    group_operations,
                    scalar_bits,
                    baby_steps,
                    giant_steps,
                    hash_collisions,
                )
            _copied = _row_copy(current, 0, temporary, 0)
            group_operations += 1
        baby += 1

    _copied = _row_copy(current, 0, negative_base, 0)
    giant_count = (count + baby_count - 1) // baby_count
    giant: uint64 = 0
    while giant < giant_count:
        giant_steps += 1
        code = _row_hash(current, 0, capacity)
        slot = code
        probing = True
        matched = False
        matched_index: uint64 = 0
        while probing:
            if occupied[slot] == 0:
                probing = False
            elif hashes[slot] == code and _row_equal(table_rows, slot * 8, current, 0):
                matched_index = giant * baby_count + indices[slot]
                if matched_index < count:
                    matched = True
                probing = False
            else:
                hash_collisions += 1
                slot += 1
                if slot == capacity:
                    slot = 0
        if matched:
            output[0] = matched_index
            return _search_record(
                statuses,
                diagnostics,
                1,
                group_operations,
                scalar_bits,
                baby_steps,
                giant_steps,
                hash_collisions,
            )
        if giant + 1 < giant_count:
            if group_operations == max_group_operations:
                return _search_record(
                    statuses,
                    diagnostics,
                    3,
                    group_operations,
                    scalar_bits,
                    baby_steps,
                    giant_steps,
                    hash_collisions,
                )
            add_status = _cantor_add_one(
                temporary,
                0,
                current,
                0,
                negative_giant_stride,
                0,
                model,
                genus,
                modulus,
                store,
            )
            if add_status == 0:
                return _search_record(
                    statuses,
                    diagnostics,
                    4,
                    group_operations,
                    scalar_bits,
                    baby_steps,
                    giant_steps,
                    hash_collisions,
                )
            _copied = _row_copy(current, 0, temporary, 0)
            group_operations += 1
        giant += 1
    return _search_record(
        statuses,
        diagnostics,
        2,
        group_operations,
        scalar_bits,
        baby_steps,
        giant_steps,
        hash_collisions,
    )


def _multi_search_record(
    statuses: UInt64Buffer,
    diagnostics: UInt64Buffer,
    status: uint64,
    group_operations: uint64,
    scalar_bits: uint64,
    baby_steps: uint64,
    giant_steps: uint64,
    hash_collisions: uint64,
    progressions_scanned: uint64,
    table_bytes: uint64,
) -> bool:
    statuses[0] = status
    diagnostics[0] = group_operations
    diagnostics[1] = scalar_bits
    diagnostics[2] = baby_steps
    diagnostics[3] = giant_steps
    diagnostics[4] = hash_collisions
    diagnostics[5] = progressions_scanned
    diagnostics[6] = table_bytes
    return True


@native
def packed_cantor_search_progressions(
    output: UInt64Buffer,
    statuses: UInt64Buffer,
    diagnostics: UInt64Buffer,
    model: UInt64Buffer,
    divisor: UInt64Buffer,
    base_words: UInt64Buffer,
    stride_words: UInt64Buffer,
    counts: UInt64Buffer,
    progression_count: uint64,
    words_per_scalar: uint64,
    baby_count: uint64,
    max_group_operations: uint64,
    genus: uint64,
    modulus: PrimeFieldModulus,
) -> bool:
    """Search ordered disjoint progressions with one shared baby table.

    The first output word is the first matching input progression and the
    second is its least represented index.  Status 1 means found, 2 means not
    found, 3 means a resource bound was reached, and 4 means invalid
    mathematical input.  Diagnostics append progressions scanned and retained
    table bytes to the five counters used by the single-progression kernel.
    """
    checked_modulus = modulus + 0
    shape_valid = (
        len(output) == 2
        and len(statuses) == 1
        and len(diagnostics) == 7
        and len(model) == 12
        and len(divisor) == 8
        and progression_count > 0
        and words_per_scalar > 0
        and len(counts) == progression_count
        and len(stride_words) == words_per_scalar
        and len(base_words) % progression_count == 0
        and len(base_words) // progression_count == words_per_scalar
    )
    if not shape_valid:
        return False
    statuses[0] = 4
    diagnostic_index: uint64 = 0
    while diagnostic_index < 7:
        diagnostics[diagnostic_index] = 0
        diagnostic_index += 1
    mathematical_input_valid = (
        (genus == 2 or genus == 3)
        and checked_modulus > 2
        and baby_count > 0
        and stride_words[words_per_scalar - 1] != 0
    )
    if not mathematical_input_valid:
        return True
    if progression_count > 1000000 or baby_count > 1000000:
        return _multi_search_record(statuses, diagnostics, 3, 0, 0, 0, 0, 0, 0, 0)

    maximum_count: uint64 = 0
    progression: uint64 = 0
    while progression < progression_count:
        count = counts[progression]
        base_offset = progression * words_per_scalar
        if (
            count == 0
            or _scalar_bit_length(base_words, base_offset, words_per_scalar) == 0
        ):
            return True
        if count > maximum_count:
            maximum_count = count
        progression += 1
    # The million-row cap makes the square and capacity arithmetic fixed-width.
    if maximum_count > baby_count * baby_count:
        return True
    if baby_count > 1 and maximum_count <= (baby_count - 1) * (baby_count - 1):
        return True

    target_capacity = baby_count * 2 + 1
    capacity: uint64 = 1
    while capacity < target_capacity:
        capacity *= 2
    table_bytes = capacity * 80

    store = prime_zeros(16 * 52)
    scalar_accumulator = prime_zeros(8)
    scalar_addend = prime_zeros(8)
    scalar_temporary = prime_zeros(8)
    base_multiple = prime_zeros(8)
    stride_multiple = prime_zeros(8)
    giant_stride = prime_zeros(8)
    negative_giant_stride = prime_zeros(8)
    current = prime_zeros(8)
    temporary = prime_zeros(8)
    one_word = prime_zeros(1)
    occupied = prime_zeros(capacity)
    hashes = prime_zeros(capacity)
    indices = prime_zeros(capacity)
    table_rows = prime_zeros(capacity * 8)

    group_operations: uint64 = 0
    scalar_bits: uint64 = 0
    baby_steps: uint64 = 0
    giant_steps: uint64 = 0
    hash_collisions: uint64 = 0
    progressions_scanned: uint64 = 0

    needed = _scalar_operation_count(stride_words, 0, words_per_scalar)
    if group_operations + needed > max_group_operations:
        return _multi_search_record(
            statuses,
            diagnostics,
            3,
            group_operations,
            scalar_bits,
            baby_steps,
            giant_steps,
            hash_collisions,
            progressions_scanned,
            table_bytes,
        )
    scalar_status = _cantor_scalar_one(
        stride_multiple,
        0,
        divisor,
        0,
        stride_words,
        0,
        words_per_scalar,
        0,
        model,
        genus,
        modulus,
        store,
        scalar_accumulator,
        scalar_addend,
        scalar_temporary,
    )
    if scalar_status == 0:
        return _multi_search_record(
            statuses,
            diagnostics,
            4,
            group_operations,
            scalar_bits,
            baby_steps,
            giant_steps,
            hash_collisions,
            progressions_scanned,
            table_bytes,
        )
    group_operations += needed
    scalar_bits += _scalar_bit_length(stride_words, 0, words_per_scalar)

    one_word[0] = baby_count
    needed = _scalar_operation_count(one_word, 0, 1)
    if group_operations + needed > max_group_operations:
        return _multi_search_record(
            statuses,
            diagnostics,
            3,
            group_operations,
            scalar_bits,
            baby_steps,
            giant_steps,
            hash_collisions,
            progressions_scanned,
            table_bytes,
        )
    scalar_status = _cantor_scalar_one(
        giant_stride,
        0,
        stride_multiple,
        0,
        one_word,
        0,
        1,
        0,
        model,
        genus,
        modulus,
        store,
        scalar_accumulator,
        scalar_addend,
        scalar_temporary,
    )
    if scalar_status == 0:
        return _multi_search_record(
            statuses,
            diagnostics,
            4,
            group_operations,
            scalar_bits,
            baby_steps,
            giant_steps,
            hash_collisions,
            progressions_scanned,
            table_bytes,
        )
    group_operations += needed
    scalar_bits += _scalar_bit_length(one_word, 0, 1)
    if (
        _cantor_negate_one(
            negative_giant_stride,
            0,
            giant_stride,
            0,
            model,
            genus,
            modulus,
            store,
        )
        == 0
    ):
        return _multi_search_record(
            statuses,
            diagnostics,
            4,
            group_operations,
            scalar_bits,
            baby_steps,
            giant_steps,
            hash_collisions,
            progressions_scanned,
            table_bytes,
        )

    # Insert j*S once in increasing j, retaining the smallest duplicate index.
    current[0] = 0
    current[1] = 1
    baby: uint64 = 0
    while baby < baby_count:
        code = _row_hash(current, 0, capacity)
        slot = code
        probing = True
        while probing:
            if occupied[slot] == 0:
                occupied[slot] = 1
                hashes[slot] = code
                indices[slot] = baby
                copied = _row_copy(table_rows, slot * 8, current, 0)
                if copied != 0:
                    return _multi_search_record(
                        statuses,
                        diagnostics,
                        4,
                        group_operations,
                        scalar_bits,
                        baby_steps,
                        giant_steps,
                        hash_collisions,
                        progressions_scanned,
                        table_bytes,
                    )
                probing = False
            else:
                hash_collisions += 1
                if hashes[slot] == code and _row_equal(
                    table_rows, slot * 8, current, 0
                ):
                    probing = False
                else:
                    slot += 1
                    if slot == capacity:
                        slot = 0
        baby_steps += 1
        if baby + 1 < baby_count:
            if group_operations == max_group_operations:
                return _multi_search_record(
                    statuses,
                    diagnostics,
                    3,
                    group_operations,
                    scalar_bits,
                    baby_steps,
                    giant_steps,
                    hash_collisions,
                    progressions_scanned,
                    table_bytes,
                )
            add_status = _cantor_add_one(
                temporary,
                0,
                current,
                0,
                stride_multiple,
                0,
                model,
                genus,
                modulus,
                store,
            )
            if add_status == 0:
                return _multi_search_record(
                    statuses,
                    diagnostics,
                    4,
                    group_operations,
                    scalar_bits,
                    baby_steps,
                    giant_steps,
                    hash_collisions,
                    progressions_scanned,
                    table_bytes,
                )
            copied = _row_copy(current, 0, temporary, 0)
            if copied != 0:
                return _multi_search_record(
                    statuses,
                    diagnostics,
                    4,
                    group_operations,
                    scalar_bits,
                    baby_steps,
                    giant_steps,
                    hash_collisions,
                    progressions_scanned,
                    table_bytes,
                )
            group_operations += 1
        baby += 1

    progression = 0
    while progression < progression_count:
        progressions_scanned += 1
        base_offset = progression * words_per_scalar
        needed = _scalar_operation_count(base_words, base_offset, words_per_scalar)
        if group_operations + needed > max_group_operations:
            return _multi_search_record(
                statuses,
                diagnostics,
                3,
                group_operations,
                scalar_bits,
                baby_steps,
                giant_steps,
                hash_collisions,
                progressions_scanned,
                table_bytes,
            )
        scalar_status = _cantor_scalar_one(
            base_multiple,
            0,
            divisor,
            0,
            base_words,
            base_offset,
            words_per_scalar,
            0,
            model,
            genus,
            modulus,
            store,
            scalar_accumulator,
            scalar_addend,
            scalar_temporary,
        )
        if scalar_status == 0:
            return _multi_search_record(
                statuses,
                diagnostics,
                4,
                group_operations,
                scalar_bits,
                baby_steps,
                giant_steps,
                hash_collisions,
                progressions_scanned,
                table_bytes,
            )
        group_operations += needed
        scalar_bits += _scalar_bit_length(base_words, base_offset, words_per_scalar)
        if (
            _cantor_negate_one(
                current,
                0,
                base_multiple,
                0,
                model,
                genus,
                modulus,
                store,
            )
            == 0
        ):
            return _multi_search_record(
                statuses,
                diagnostics,
                4,
                group_operations,
                scalar_bits,
                baby_steps,
                giant_steps,
                hash_collisions,
                progressions_scanned,
                table_bytes,
            )
        count = counts[progression]
        giant_count = (count + baby_count - 1) // baby_count
        giant: uint64 = 0
        while giant < giant_count:
            giant_steps += 1
            code = _row_hash(current, 0, capacity)
            slot = code
            probing = True
            matched = False
            matched_index: uint64 = 0
            while probing:
                if occupied[slot] == 0:
                    probing = False
                elif hashes[slot] == code and _row_equal(
                    table_rows, slot * 8, current, 0
                ):
                    matched_index = giant * baby_count + indices[slot]
                    if matched_index < count:
                        matched = True
                    probing = False
                else:
                    hash_collisions += 1
                    slot += 1
                    if slot == capacity:
                        slot = 0
            if matched:
                output[0] = progression
                output[1] = matched_index
                return _multi_search_record(
                    statuses,
                    diagnostics,
                    1,
                    group_operations,
                    scalar_bits,
                    baby_steps,
                    giant_steps,
                    hash_collisions,
                    progressions_scanned,
                    table_bytes,
                )
            if giant + 1 < giant_count:
                if group_operations == max_group_operations:
                    return _multi_search_record(
                        statuses,
                        diagnostics,
                        3,
                        group_operations,
                        scalar_bits,
                        baby_steps,
                        giant_steps,
                        hash_collisions,
                        progressions_scanned,
                        table_bytes,
                    )
                add_status = _cantor_add_one(
                    temporary,
                    0,
                    current,
                    0,
                    negative_giant_stride,
                    0,
                    model,
                    genus,
                    modulus,
                    store,
                )
                if add_status == 0:
                    return _multi_search_record(
                        statuses,
                        diagnostics,
                        4,
                        group_operations,
                        scalar_bits,
                        baby_steps,
                        giant_steps,
                        hash_collisions,
                        progressions_scanned,
                        table_bytes,
                    )
                copied = _row_copy(current, 0, temporary, 0)
                if copied != 0:
                    return _multi_search_record(
                        statuses,
                        diagnostics,
                        4,
                        group_operations,
                        scalar_bits,
                        baby_steps,
                        giant_steps,
                        hash_collisions,
                        progressions_scanned,
                        table_bytes,
                    )
                group_operations += 1
            giant += 1
        progression += 1
    return _multi_search_record(
        statuses,
        diagnostics,
        2,
        group_operations,
        scalar_bits,
        baby_steps,
        giant_steps,
        hash_collisions,
        progressions_scanned,
        table_bytes,
    )


@native
def packed_cantor_scalar_many_primes(
    output: UInt64Buffer,
    statuses: UInt64Buffer,
    diagnostics: UInt64Buffer,
    models: UInt64Buffer,
    elements: UInt64Buffer,
    element_statuses: UInt64Buffer,
    targets: UInt64Buffer,
    scalar_words: UInt64Buffer,
    primes: UInt64Buffer,
    divisor_count: uint64,
    prime_count: uint64,
    words_per_scalar: uint64,
    uniform_scalar: uint64,
    genus: uint64,
    domain_modulus: PrimeFieldModulus,
) -> bool:
    """Multiply retained prime-major rows for many moduli in one call.

    `domain_modulus` selects and validates the prime-source compiler family;
    the caller supplies the first checked modulus. Arithmetic itself uses each
    prime-major block's locally checked modulus while reusing one finite Cantor
    workspace across the whole batch. Status zero is unavailable, statuses two
    and four match the requested target, and statuses three and four mark a
    nonidentity input. The three diagnostics count available, nonidentity, and
    matching pairs respectively.
    """
    pair_count = divisor_count * prime_count
    valid = (
        (genus == 2 or genus == 3)
        and words_per_scalar > 0
        and prime_count > 0
        and len(primes) == prime_count
        and len(models) == prime_count * 12
        and len(elements) == pair_count * 8
        and len(element_statuses) == pair_count
        and len(targets) == prime_count * 8
        and (
            (uniform_scalar != 0 and len(scalar_words) == words_per_scalar)
            or (
                uniform_scalar == 0
                and len(scalar_words) == pair_count * words_per_scalar
            )
        )
        and len(output) == pair_count * 8
        and len(statuses) == pair_count
        and len(diagnostics) == 3
    )
    if not valid:
        return False
    diagnostics[0] = 0
    diagnostics[1] = 0
    diagnostics[2] = 0
    model = prime_zeros(12)
    store = prime_zeros(16 * 52)
    accumulator = prime_zeros(8)
    addend = prime_zeros(8)
    temporary = prime_zeros(8)
    prime_index: uint64 = 0
    while prime_index < prime_count:
        raw_modulus: uint64 = primes[prime_index]
        if raw_modulus < 3 or raw_modulus > 4294967295 or raw_modulus % 2 == 0:
            return False
        modulus: PrimeFieldModulus = raw_modulus
        model_index: uint64 = 0
        while model_index < 12:
            model[model_index] = models[prime_index * 12 + model_index]
            model_index += 1
        zero_h = model[8] == 0 and model[9] == 0 and model[10] == 0 and model[11] == 0
        divisor_index: uint64 = 0
        while divisor_index < divisor_count:
            pair_index = prime_index * divisor_count + divisor_index
            scalar_offset = pair_index * words_per_scalar
            if uniform_scalar != 0:
                scalar_offset = 0
            if element_statuses[pair_index] == 0:
                statuses[pair_index] = 0
            elif (
                zero_h
                and elements[pair_index * 8 + 5] == 0
                and elements[pair_index * 8 + 6] == 0
                and elements[pair_index * 8 + 7] == 0
            ):
                # For `h=0`, a reduced Mumford row `(u,0)` is its own inverse.
                # Its multiple is therefore the identity for an even scalar
                # and the original canonical row for an odd scalar.  Retained
                # rows already passed the exact QQ reduction kernel, so this
                # is an exact group-law shortcut rather than a heuristic.
                output_index: uint64 = 0
                if scalar_words[scalar_offset] % 2 == 0:
                    while output_index < 8:
                        output[pair_index * 8 + output_index] = 0
                        output_index += 1
                    output[pair_index * 8 + 1] = 1
                else:
                    while output_index < 8:
                        output[pair_index * 8 + output_index] = elements[
                            pair_index * 8 + output_index
                        ]
                        output_index += 1
                statuses[pair_index] = 1
            else:
                statuses[pair_index] = _cantor_scalar_one(
                    output,
                    pair_index * 8,
                    elements,
                    pair_index * 8,
                    scalar_words,
                    scalar_offset,
                    words_per_scalar,
                    0,
                    model,
                    genus,
                    modulus,
                    store,
                    accumulator,
                    addend,
                    temporary,
                )
                if statuses[pair_index] == 0:
                    return False
            if element_statuses[pair_index] != 0:
                diagnostics[0] = diagnostics[0] + 1
                matches_target = True
                output_index = 0
                while output_index < 8:
                    if (
                        output[pair_index * 8 + output_index]
                        != targets[prime_index * 8 + output_index]
                    ):
                        matches_target = False
                    output_index += 1
                statuses[pair_index] = 1
                if matches_target:
                    statuses[pair_index] = 2
                    diagnostics[2] = diagnostics[2] + 1
                if elements[pair_index * 8] != 0:
                    statuses[pair_index] = statuses[pair_index] + 2
                    diagnostics[1] = diagnostics[1] + 1
            divisor_index += 1
        prime_index += 1
    return True


__all__ = [
    "packed_cantor_add_batch",
    "packed_cantor_copy_batch",
    "packed_cantor_progression_batch",
    "packed_cantor_scalar_many_primes",
    "packed_cantor_search_progression",
    "packed_cantor_search_progressions",
    "packed_cantor_scalar_batch",
    "packed_cantor_validate_batch",
]
