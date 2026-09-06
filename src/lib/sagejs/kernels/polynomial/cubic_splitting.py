"""Bounded word arithmetic for cubic factor-degree data over prime fields.

The caller proves primality and reduces the three coefficients modulo `p`.
No defining-order or maximal-order claim is made here: at an index prime the
number-field caller must still use its certified maximal-order algebra.
"""

from sagejs.native import native, uint64


def _power_mod(base: uint64, exponent: uint64, prime: uint64) -> uint64:
    result: uint64 = 1
    while exponent > 0:
        if exponent % 2 == 1:
            result = result * base % prime
        exponent //= 2
        if exponent > 0:
            base = base * base % prime
    return result


def _multiply_mod_cubic(
    left_zero: uint64,
    left_one: uint64,
    left_two: uint64,
    right_zero: uint64,
    right_one: uint64,
    right_two: uint64,
    constant: uint64,
    linear: uint64,
    quadratic: uint64,
    prime: uint64,
) -> tuple[uint64, uint64, uint64]:
    zero: uint64 = left_zero * right_zero % prime
    one: uint64 = (left_zero * right_one + left_one * right_zero) % prime
    two: uint64 = (
        left_zero * right_two + left_one * right_one + left_two * right_zero
    ) % prime
    three: uint64 = (left_one * right_two + left_two * right_one) % prime
    four: uint64 = left_two * right_two % prime
    # Subtract four*x*f and then three*f, retaining canonical residues.
    three = (three + prime - four * quadratic % prime) % prime
    two = (two + prime - four * linear % prime) % prime
    one = (one + prime - four * constant % prime) % prime
    two = (two + prime - three * quadratic % prime) % prime
    one = (one + prime - three * linear % prime) % prime
    zero = (zero + prime - three * constant % prime) % prime
    return zero, one, two


@native
def cubic_root_multiplicity_counts(
    constant: uint64,
    linear: uint64,
    quadratic: uint64,
    prime: uint64,
) -> tuple[uint64, uint64]:
    """Return distinct-root count and their total multiplicity over `F_p`.

    Requires a proven prime `2 <= p <= 65535` and canonical coefficients.
    Invalid bounds return the impossible counts `(4, 4)`. Primality is a
    caller obligation, not an unchecked claim established by this function.

    At odd primes a nonsquare discriminant forces splitting type `(1, 2)`:
    Frobenius has negative sign on the three roots and is a transposition.
    This certifies one simple root without polynomial powering. See
    `docs/cubic-discriminant-splitting.md` for the argument and word bounds.

    Otherwise the squarefree polynomial `x^p-x` contains every element of `F_p` once.
    Thus its gcd with the monic cubic counts distinct roots, including in
    characteristics two and three. Compute its remainder by binary powering,
    then finish the degree-at-most-two Euclidean algorithm with word scalars.
    All arithmetic intermediates are below `32*p*p`, hence fit in `uint64`.
    """
    no_roots: uint64 = 0
    one_root: uint64 = 1
    two_roots: uint64 = 2
    three_roots: uint64 = 3
    invalid: uint64 = 4
    if (
        prime < 2
        or prime > 65535
        or constant >= prime
        or linear >= prime
        or quadratic >= prime
    ):
        return invalid, invalid
    if prime > 2:
        quadratic_square: uint64 = quadratic * quadratic % prime
        discriminant_positive: uint64 = (
            quadratic_square * (linear * linear % prime)
            + (18 * quadratic * linear % prime) * constant
        ) % prime
        discriminant_negative: uint64 = (
            (4 * linear * linear % prime) * linear
            + (4 * quadratic_square * quadratic % prime) * constant
            + 27 * constant * constant
        ) % prime
        discriminant: uint64 = (
            discriminant_positive + prime - discriminant_negative
        ) % prime
        if _power_mod(discriminant, (prime - 1) // 2, prime) == prime - 1:
            return one_root, one_root
    zero: uint64 = 1
    one: uint64 = 0
    two: uint64 = 0
    base_zero: uint64 = 0
    base_one: uint64 = 1
    base_two: uint64 = 0
    exponent: uint64 = prime
    while exponent > 0:
        if exponent % 2 == 1:
            zero, one, two = _multiply_mod_cubic(
                zero,
                one,
                two,
                base_zero,
                base_one,
                base_two,
                constant,
                linear,
                quadratic,
                prime,
            )
        exponent //= 2
        if exponent > 0:
            base_zero, base_one, base_two = _multiply_mod_cubic(
                base_zero,
                base_one,
                base_two,
                base_zero,
                base_one,
                base_two,
                constant,
                linear,
                quadratic,
                prime,
            )
    one = (one + prime - 1) % prime
    remainder_zero: uint64 = zero
    remainder_one: uint64 = one
    if two != 0:
        inverse: uint64 = _power_mod(two, prime - 2, prime)
        zero = zero * inverse % prime
        one = one * inverse % prime
        # f mod (x^2 + one*x + zero).
        remainder_zero = (
            one * zero % prime + constant + prime - quadratic * zero % prime
        ) % prime
        remainder_one = (
            one * one % prime + linear + 2 * prime - zero - quadratic * one % prime
        ) % prime
        if remainder_zero == 0 and remainder_one == 0:
            # A cubic with two distinct rational roots has all three roots
            # rational with multiplicity, even when it is not squarefree.
            return two_roots, three_roots
    elif zero == 0 and one == 0:
        return three_roots, three_roots
    if remainder_one == 0:
        return no_roots, no_roots
    root: uint64 = (
        (prime - remainder_zero) * _power_mod(remainder_one, prime - 2, prime)
    ) % prime
    if two != 0:
        if (root * root + one * root + zero) % prime != 0:
            return no_roots, no_roots
    elif (((root + quadratic) * root + linear) % prime * root + constant) % prime != 0:
        return no_roots, no_roots
    if (3 * (root * root % prime) + 2 * quadratic * root + linear) % prime == 0:
        # A single distinct root which is repeated must be a triple root:
        # division by its square leaves another rational linear factor.
        return one_root, three_roots
    return one_root, one_root
