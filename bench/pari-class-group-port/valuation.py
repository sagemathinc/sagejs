"""Prepared prime-ideal valuation translation from PARI 2.17.4.

Derived from base3.c ZC_nfvalrem and gen2.c gen_lval/rem, gen_pvalrem_DC.
Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Prepared tau is row-major; scalar tau uses the inert flag. No prime
decomposition is supplied by this module. Scratch owners must be disjoint.
"""

from sagejs.native import IntegerBuffer, native
from math import gcd


@native
def pari_prepared_divide_prime_batch(
    coordinates: IntegerBuffer,
    ideal: IntegerBuffer,
    group_tau: IntegerBuffer,
    group_e: IntegerBuffer,
    group_f: IntegerBuffer,
    group_inert: IntegerBuffer,
    tau: IntegerBuffer,
    x: IntegerBuffer,
    y: IntegerBuffer,
    spare: IntegerBuffer,
    stack: IntegerBuffer,
    primitive: IntegerBuffer,
    columns: IntegerBuffer,
    values: IntegerBuffer,
    temporary: IntegerBuffer,
    indices: IntegerBuffer,
    exponents: IntegerBuffer,
    degree: int,
    prime: int,
    prime_count: int,
    index_base: int,
    norm_valuation: int,
    mode: int,
    count: int,
    repeats: int,
) -> int:
    """Diagnostic fresh logical admission calls within one native boundary.

    Each call starts with the same count and read-only inputs; all observed
    scratch is overwritten by the callee. This is not relation collection.
    """
    checksum = 0
    for repetition in range(repeats):
        accepted, final_count = pari_prepared_divide_prime(
            coordinates,
            ideal,
            group_tau,
            group_e,
            group_f,
            group_inert,
            tau,
            x,
            y,
            spare,
            stack,
            primitive,
            columns,
            values,
            temporary,
            indices,
            exponents,
            degree,
            prime,
            prime_count,
            index_base,
            norm_valuation,
            mode,
            count,
        )
        checksum += accepted + final_count
    return checksum


@native
def pari_prepared_divide_prime(
    coordinates: IntegerBuffer,
    ideal: IntegerBuffer,
    group_tau: IntegerBuffer,
    group_e: IntegerBuffer,
    group_f: IntegerBuffer,
    group_inert: IntegerBuffer,
    tau: IntegerBuffer,
    x: IntegerBuffer,
    y: IntegerBuffer,
    spare: IntegerBuffer,
    stack: IntegerBuffer,
    primitive: IntegerBuffer,
    columns: IntegerBuffer,
    values: IntegerBuffer,
    temporary: IntegerBuffer,
    indices: IntegerBuffer,
    exponents: IntegerBuffer,
    degree: int,
    prime: int,
    prime_count: int,
    index_base: int,
    norm_valuation: int,
    mode: int,
    count: int,
) -> tuple[int, int]:
    """One prepared prime group, stored from offset zero."""
    return pari_prepared_divide_prime_at(
        coordinates,
        ideal,
        group_tau,
        group_e,
        group_f,
        group_inert,
        tau,
        x,
        y,
        spare,
        stack,
        primitive,
        columns,
        values,
        temporary,
        indices,
        exponents,
        degree,
        prime,
        prime_count,
        index_base,
        norm_valuation,
        mode,
        count,
        0,
    )


@native
def pari_prepared_divide_prime_at(
    coordinates: IntegerBuffer,
    ideal: IntegerBuffer,
    group_tau: IntegerBuffer,
    group_e: IntegerBuffer,
    group_f: IntegerBuffer,
    group_inert: IntegerBuffer,
    tau: IntegerBuffer,
    x: IntegerBuffer,
    y: IntegerBuffer,
    spare: IntegerBuffer,
    stack: IntegerBuffer,
    primitive: IntegerBuffer,
    columns: IntegerBuffer,
    values: IntegerBuffer,
    temporary: IntegerBuffer,
    indices: IntegerBuffer,
    exponents: IntegerBuffer,
    degree: int,
    prime: int,
    prime_count: int,
    index_base: int,
    norm_valuation: int,
    mode: int,
    count: int,
    group_start: int,
) -> tuple[int, int]:
    """Translate buch2.c divide_p_elt/id/quo from one prepared LP group.

    mode=0 is element, 1 integral-HNF ideal, 2 element/ideal quotient. The
    factorization of the norm supplies norm_valuation; it is not computed here.
    Preserve one-based factor indices, order, early exit, and partial output on
    failure. The quotient branch skips a zero element valuation *before*
    computing idealval, exactly as upstream. Inputs obey upstream integrality.
    """
    if mode < 0 or mode > 2 or count < 0 or prime_count < 0 or group_start < 0:
        raise ValueError("invalid prepared divide_p input")
    remaining = norm_valuation
    for j in range(prime_count):
        position = group_start + j
        for i in range(degree * degree):
            tau[i] = group_tau[position * degree * degree + i]
        value = 0
        if mode == 1:
            value = pari_prepared_hnf_valuation(
                ideal,
                tau,
                primitive,
                columns,
                values,
                temporary,
                degree,
                prime,
                group_e[position],
                group_f[position],
                group_inert[position],
            )
        else:
            value = pari_prepared_ideal_valuation(
                coordinates,
                tau,
                x,
                y,
                spare,
                stack,
                degree,
                prime,
                group_e[position],
                group_inert[position],
            )
            if value != 0 and mode == 2:
                value -= pari_prepared_hnf_valuation(
                    ideal,
                    tau,
                    primitive,
                    columns,
                    values,
                    temporary,
                    degree,
                    prime,
                    group_e[position],
                    group_f[position],
                    group_inert[position],
                )
        if value != 0:
            indices[count] = index_base + j + 1
            exponents[count] = value
            count += 1
            remaining -= value * group_f[position]
            if remaining == 0:
                return 1, count
    return 0, count


@native
def pari_scalar_pval_control(x: int, prime: int) -> int:
    """Exact scalar valuation leaf; repeated division, not PARI's tuned kernel."""
    if x == 0 or prime < 2:
        raise ValueError("scalar valuation needs nonzero x and prime >= 2")
    value = 0
    while x % prime == 0:
        x //= prime
        value += 1
    return value


@native
def pari_prepared_hnf_valuation(
    ideal: IntegerBuffer,
    tau: IntegerBuffer,
    primitive: IntegerBuffer,
    columns: IntegerBuffer,
    values: IntegerBuffer,
    temporary: IntegerBuffer,
    degree: int,
    prime: int,
    ramification: int,
    residue_degree: int,
    inert: int,
) -> int:
    """Integral-HNF idealval and idealHNF_val, using prepared prime data.

    Row-major matrices and disjoint workspaces. The input must be a nonzero
    integral ideal in HNF, not an arbitrary lattice. Rational input conversion
    and other idealtyp branches are outside this entry. Scalar p-valuation and
    initial prime-power construction are labeled arithmetic substitutions.
    """
    if degree <= 0 or prime < 2 or ramification < 1 or residue_degree < 1:
        raise ValueError("invalid prepared HNF valuation input")
    content = 0
    for i in range(degree * degree):
        content = gcd(content, ideal[i])
    if content == 0:
        raise ValueError("zero ideal valuation is not finite")
    for i in range(degree * degree):
        primitive[i] = ideal[i] // content
    vc = pari_scalar_pval_control(content, prime)
    if inert != 0:
        return vc
    zval = pari_scalar_pval_control(primitive[0], prime)
    if zval == 0:
        return vc * ramification
    nval = zval
    for i in range(1, degree):
        nval += pari_scalar_pval_control(primitive[i * degree + i], prime)
    if nval < residue_degree:
        return vc * ramification
    maximum = zval * ramification
    if nval // residue_degree < maximum:
        maximum = nval // residue_degree
    for j in range(1, degree):
        for i in range(degree):
            total = primitive[j] * tau[i * degree]
            for k in range(1, j + 1):
                total += primitive[k * degree + j] * tau[i * degree + k]
            if total % prime != 0:
                return vc * ramification
            columns[i * degree + j] = total // prime
    for j in range(1, degree):
        column_content = 0
        for i in range(degree):
            column_content = gcd(column_content, columns[i * degree + j])
        values[j] = 1 + ramification * pari_scalar_pval_control(column_content, prime)
        for i in range(degree):
            columns[i * degree + j] //= column_content
    pk = 1
    for i in range((maximum + ramification - 1) // ramification):
        pk *= prime
    value = 1
    while value < maximum:
        if ramification == 1 or (maximum - value) % ramification == 0:
            pk //= prime
        for j in range(1, degree):
            if value >= values[j]:
                for i in range(degree):
                    total = columns[j] * tau[i * degree]
                    for k in range(1, degree):
                        total += columns[k * degree + j] * tau[i * degree + k]
                    if total % prime != 0:
                        return value + vc * ramification
                    total //= prime
                    if (abs(total).bit_length() + 63) // 64 > (
                        pk.bit_length() + 63
                    ) // 64:
                        remainder = abs(total) % pk
                        if total < 0:
                            remainder = -remainder
                        total = remainder
                    temporary[i] = total
                for i in range(degree):
                    columns[i * degree + j] = temporary[i]
        value += 1
    return value + vc * ramification


@native
def pari_vector_divide(
    x: IntegerBuffer, y: IntegerBuffer, degree: int, divisor: int
) -> int:
    """Return smallest nonzero quotient lgefint, or zero on failure."""
    minimum = 9223372036854775807
    for i in range(degree):
        a = x[i]
        if a % divisor != 0:
            return 0
        y[i] = a // divisor
        if y[i] != 0:
            size = 2 + (abs(y[i]).bit_length() + 63) // 64
            if size < minimum:
                minimum = size
    return minimum


@native
def pari_vector_strip_dc(
    x: IntegerBuffer, y: IntegerBuffer, stack: IntegerBuffer, degree: int, divisor: int
) -> int:
    """Explicit stack for gen_pvalrem_DC; reduced vector is copied to x.

    Input is nonzero. Preserve recursive division/squaring/unwind order.
    The explicit stack replaces recursive allocation, not the arithmetic.
    """
    current = x
    spare = y
    depth = 0
    q = divisor
    value = 0
    descending = 1
    while descending != 0:
        size = pari_vector_divide(current, spare, degree, q)
        if size == 0:
            value = 0
            descending = 0
        else:
            temporary = current
            current = spare
            spare = temporary
            if 2 * (2 + (q.bit_length() + 63) // 64) <= size + 3:
                if depth >= len(stack):
                    raise ValueError("valuation stack capacity exhausted")
                stack[depth] = q
                depth += 1
                q *= q
            else:
                value = 1
                if pari_vector_divide(current, spare, degree, q) != 0:
                    temporary = current
                    current = spare
                    spare = temporary
                    value = 2
                descending = 0
    while depth > 0:
        depth -= 1
        q = stack[depth]
        value = 2 * value + 1
        if pari_vector_divide(current, spare, degree, q) != 0:
            temporary = current
            current = spare
            spare = temporary
            value += 1
    for i in range(degree):
        x[i] = current[i]
    return value


@native
def pari_vector_strip(
    x: IntegerBuffer, y: IntegerBuffer, stack: IntegerBuffer, degree: int, prime: int
) -> int:
    """Word-prime gen_lvalrem; modifies x to its prime-to-part.

    The p=2 scalar vali leaf currently uses exact repeated halving rather than
    PARI's trailing-zero primitive. This leaf cost is a labeled representation
    difference; it cannot support a language-only performance claim.
    """
    if prime == 2:
        minimum = 9223372036854775807
        for i in range(degree):
            a = abs(x[i])
            if a != 0:
                count = 0
                while a % 2 == 0:
                    a //= 2
                    count += 1
                if count < minimum:
                    minimum = count
                if minimum == 0:
                    return 0
        for i in range(degree):
            x[i] = x[i] >> minimum
        return minimum
    value = 0
    while value < 16:
        if pari_vector_divide(x, y, degree, prime) == 0:
            return value
        for i in range(degree):
            x[i] = y[i]
        value += 1
    value += 2 * pari_vector_strip_dc(x, y, stack, degree, prime * prime)
    if pari_vector_divide(x, y, degree, prime) != 0:
        for i in range(degree):
            x[i] = y[i]
        value += 1
    return value


@native
def pari_prepared_ideal_valuation(
    coordinates: IntegerBuffer,
    tau: IntegerBuffer,
    x: IntegerBuffer,
    y: IntegerBuffer,
    spare: IntegerBuffer,
    stack: IntegerBuffer,
    degree: int,
    prime: int,
    ramification: int,
    inert: int,
) -> int:
    """ZC_nfval's no-remainder path from prepared pr_get_tau data.

    Noninert ramification zero is the provisional descriptor used by
    `base2.c:get_pr` while computing the actual ramification index.
    """
    if (
        degree <= 0
        or prime < 2
        or prime.bit_length() > 64
        or ramification < 0
        or (inert != 0 and ramification == 0)
    ):
        raise ValueError("invalid prepared prime-ideal valuation input")
    nonzero = 0
    for i in range(degree):
        x[i] = coordinates[i]
        if x[i] != 0:
            nonzero = 1
    if nonzero == 0:
        raise ValueError("zero element valuation is not finite")
    if inert != 0:
        if prime == 2:
            return pari_vector_strip(x, y, stack, degree, prime)
        # gen_lval does not take gen_lvalrem's divide-and-conquer branch.
        value = 0
        while True:
            for i in range(degree):
                a = abs(x[i])
                x[i] = a // prime
                if a % prime != 0:
                    return value
            value += 1
    value = 0
    while True:
        for i in range(degree):
            total = tau[i * degree] * x[0]
            for j in range(1, degree):
                term = tau[i * degree + j] * x[j]
                if term != 0:
                    total += term
            quotient, remainder = divmod(abs(total), prime)
            if total < 0:
                quotient = -quotient
            y[i] = quotient
            if remainder != 0:
                return value
        for i in range(degree):
            x[i] = y[i]
        if value % 16 == 15:
            value += ramification * pari_vector_strip(x, spare, stack, degree, prime)
        value += 1
