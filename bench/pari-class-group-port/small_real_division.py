"""PARI 2.17.4 gmp/mp.c divrr below DIVRR_GMP_LIMIT=256 bits.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Literal unsigned word arithmetic, with a packed local integer substituting
for the short stack array. Discarded product halves and carry corrections
are retained; exact quotient division of whole mantissas is not equivalent.
"""

from sagejs.native import native


@native
def pari_division_word(words: int, index: int) -> int:
    return (words >> (64 * index)) & ((1 << 64) - 1)


@native
def pari_division_set_word(words: int, index: int, value: int) -> int:
    shift = 64 * index
    mask = (1 << 64) - 1
    old = (words >> shift) & mask
    return words - (old << shift) + ((value & mask) << shift)


@native
def pari_small_real_division(a: int, px: int, b: int, py: int) -> tuple[int, int, int]:
    """Positive normalized mantissas; output mantissa, bits, exponent delta."""
    if py != 128 and py != 192:
        raise ValueError("small divrr requires two or three divisor words")
    if px < 64 or px > 1920 or px % 64 != 0:
        raise ValueError("invalid small divrr numerator precision")
    if a.bit_length() != px or b.bit_length() != py:
        raise ValueError("small divrr requires normalized positive mantissas")
    lx, ly = px // 64 + 2, py // 64 + 2
    lr = lx
    if ly < lr:
        lr = ly
    mask = (1 << 64) - 1
    r = 0
    y = 0
    for j in range(2, ly):
        y = pari_division_set_word(y, j, b >> (py - 64 * (j - 1)))
    for j in range(2, lr):
        r = pari_division_set_word(r, j - 1, a >> (px - 64 * (j - 1)))
    if lx > ly:
        r = pari_division_set_word(r, lr - 1, a >> (px - 64 * (lr - 1)))
    y0, y1 = pari_division_word(y, 2), pari_division_word(y, 3)
    for i in range(lr - 1):
        head = pari_division_word(r, i)
        if head == y0:
            qp = mask
            value = y0 + pari_division_word(r, i + 1)
            k = value & mask
            overflow = value >> 64
        else:
            if head > y0:
                borrow = 0
                for j in range(lr - i, 0, -1):
                    value = (
                        pari_division_word(r, i + j - 1)
                        - pari_division_word(y, j + 1)
                        - borrow
                    )
                    borrow = 0
                    if value < 0:
                        borrow = 1
                    r = pari_division_set_word(r, i + j - 1, value)
                j = i - 1
                while j >= 0:
                    value = (pari_division_word(r, j) + 1) & mask
                    r = pari_division_set_word(r, j, value)
                    if value != 0:
                        break
                    j -= 1
            value = (pari_division_word(r, i) << 64) + pari_division_word(r, i + 1)
            qp, k = value // y0, value % y0
            overflow = 0
        j = lr - i + 1
        if overflow == 0:
            product = qp * y1
            k3 = product & mask
            high = product >> 64
            borrow = 0
            if j != 3:
                value = k3 - pari_division_word(r, i + 2)
                borrow = 0
                if value < 0:
                    borrow = 1
                k3 = value & mask
            value = high - k - borrow
            overflow = 0
            if value < 0:
                overflow = 1
            k4 = value & mask
            while overflow == 0 and k4 != 0:
                qp -= 1
                value = k3 - y1
                borrow = 0
                if value < 0:
                    borrow = 1
                k3 = value & mask
                value = k4 - y0 - borrow
                overflow = 0
                if value < 0:
                    overflow = 1
                k4 = value & mask
        if j < ly:
            high = (qp * pari_division_word(y, j)) >> 64
        else:
            high = 0
            j = ly
        for j in range(j - 1, 1, -1):
            product = qp * pari_division_word(y, j) + high
            high = product >> 64
            value = pari_division_word(r, i + j - 1) - (product & mask)
            overflow = 0
            if value < 0:
                overflow = 1
            r = pari_division_set_word(r, i + j - 1, value)
            high = (high + overflow) & mask
        head = pari_division_word(r, i)
        if head != high:
            if head < high:
                qp -= 1
                stop = lr - i
                if stop >= ly:
                    stop -= 1
                carry = 0
                for j in range(stop, 1, -1):
                    value = (
                        pari_division_word(r, i + j - 1)
                        + pari_division_word(y, j)
                        + carry
                    )
                    carry = value >> 64
                    r = pari_division_set_word(r, i + j - 1, value)
            else:
                r = pari_division_set_word(r, i, head - high)
                while pari_division_word(r, i) != 0:
                    qp = (qp + 1) & mask
                    if qp == 0:
                        j = i - 1
                        while j >= 0:
                            value = (pari_division_word(r, j) + 1) & mask
                            r = pari_division_set_word(r, j, value)
                            if value != 0:
                                break
                            j -= 1
                    stop = lr - i
                    if stop >= ly:
                        stop -= 1
                    borrow = 0
                    for j in range(stop, 1, -1):
                        value = (
                            pari_division_word(r, i + j - 1)
                            - pari_division_word(y, j)
                            - borrow
                        )
                        borrow = 0
                        if value < 0:
                            borrow = 1
                        r = pari_division_set_word(r, i + j - 1, value)
                    r = pari_division_set_word(r, i, pari_division_word(r, i) - borrow)
        r = pari_division_set_word(r, i, qp)
    if pari_division_word(r, lr - 1) > y0 >> 1:
        j = lr - 2
        while j >= 0:
            value = (pari_division_word(r, j) + 1) & mask
            r = pari_division_set_word(r, j, value)
            if value != 0:
                break
            j -= 1
    quotient = 0
    for j in range(lr - 1):
        quotient = (quotient << 64) + pari_division_word(r, j)
    precision = 64 * (lr - 2)
    head = pari_division_word(r, 0)
    if head == 0:
        return quotient, precision, -1
    if head == 1:
        return quotient >> 1, precision, 0
    return 1 << (precision - 1), precision, 1
