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
    store = prime_zeros(16 * 52)
    accumulator = prime_zeros(8)
    addend = prime_zeros(8)
    temporary = prime_zeros(8)
    while item < count:
        index = 0
        while index < 8:
            accumulator[index] = 0
            addend[index] = elements[item * 8 + index]
            index += 1
        accumulator[0] = 0
        accumulator[1] = 1
        operations = 0
        used_words = words_per_scalar
        while (
            used_words > 0
            and scalar_words[item * words_per_scalar + used_words - 1] == 0
        ):
            used_words -= 1
        word_index = 0
        while word_index < used_words:
            word = scalar_words[item * words_per_scalar + word_index]
            bit_count = 64
            if word_index + 1 == used_words:
                bit_count = 0
                remaining = word
                while remaining > 0:
                    bit_count += 1
                    remaining //= 2
            bit = 0
            while bit < bit_count:
                if word % 2 == 1:
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
                    if status == 0:
                        return False
                    index = 0
                    while index < 8:
                        accumulator[index] = temporary[index]
                        index += 1
                    operations += 1
                word //= 2
                if bit + 1 < bit_count or word_index + 1 < used_words:
                    status = _cantor_add_one(
                        temporary, 0, addend, 0, addend, 0, model, genus, modulus, store
                    )
                    if status == 0:
                        return False
                    index = 0
                    while index < 8:
                        addend[index] = temporary[index]
                        index += 1
                    operations += 1
                bit += 1
            word_index += 1
        index = 0
        while index < 8:
            output[item * 8 + index] = accumulator[index]
            index += 1
        if scalar_signs[item] != 0 and output[item * 8] != 0:
            if (
                _cantor_negate_one(
                    output,
                    item * 8,
                    output,
                    item * 8,
                    model,
                    genus,
                    modulus,
                    store,
                )
                == 0
            ):
                return False
        statuses[item] = operations + 1
        item += 1
    return True


__all__ = [
    "packed_cantor_add_batch",
    "packed_cantor_progression_batch",
    "packed_cantor_scalar_batch",
]
