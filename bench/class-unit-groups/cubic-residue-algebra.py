"""Checked cyclic presentations for a cubic maximal-order residue algebra.

Research helper, not production dispatch. The caller supplies a certified
commutative unital three-dimensional algebra over a proven prime field. Its
27 multiplication constants occupy the first cells of `workspace`, in
`9*i + 3*j + k` order. Exact signed integers are reduced modulo the prime.
The identity coordinates are supplied explicitly, not assumed to be `(1,0,0)`.
"""

from sagejs.native import NativeIntegerVector, checked_uint64, uint64
from sagejs.kernels.polynomial.cubic_splitting import cubic_root_multiplicity_counts


def _cubic_residue_product(
    workspace: NativeIntegerVector,
    left_zero: int,
    left_one: int,
    left_two: int,
    right_zero: int,
    right_one: int,
    right_two: int,
    prime: int,
) -> tuple[int, int, int]:
    """Multiply coordinates in the supplied algebra without scratch writes."""
    zero = 0
    one = 0
    two = 0
    i: uint64 = 0
    while i < 3:
        left = left_zero
        if i == 1:
            left = left_one
        elif i == 2:
            left = left_two
        j: uint64 = 0
        while j < 3:
            right = right_zero
            if j == 1:
                right = right_one
            elif j == 2:
                right = right_two
            coefficient = left * right
            offset: uint64 = 9 * i + 3 * j
            zero += coefficient * workspace[offset]
            one += coefficient * workspace[offset + 1]
            two += coefficient * workspace[offset + 2]
            j += 1
        i += 1
    return zero % prime, one % prime, two % prime


def _cubic_residue_determinant(
    a: int, b: int, c: int, d: int, e: int, f: int, g: int, h: int, i: int
) -> int:
    """Return an exact row-major determinant of order three."""
    return a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)


def _cubic_residue_inverse(value: int, prime: int) -> int:
    """Invert a nonzero residue, or decline a nonunit without division by zero."""
    a = value % prime
    b = prime
    u = 1
    v = 0
    while b != 0:
        quotient = a // b
        a, b = b, a - quotient * b
        u, v = v, u - quotient * v
    if a != 1:
        return 0
    return u % prime


def _cubic_cyclic_degree_one_prime_count(
    workspace: NativeIntegerVector,
    identity_zero: int,
    identity_one: int,
    identity_two: int,
    prime: int,
) -> tuple[bool, uint64]:
    """Count algebra maps to `F_p` after checking a cyclic basis.

    True means a verified basis `1,t,t^2` identifies the entire supplied
    algebra with `F_p[T]/(g)`. Its distinct roots, not their multiplicities,
    count the maps, even when the algebra has nilpotents. Primality and the
    valid algebra table are caller obligations; no class-group bound is used.

    Search at most four combinations of two coordinates complementary to
    the actual identity. Finding a generator is not assumed: a false result
    requires the general exact algorithm. In particular `F_2^3` and some
    nonreduced algebras have no cyclic presentation.
    """
    zero: uint64 = 0
    if len(workspace) < 27 or prime < 2 or prime > 65535:
        return False, zero
    u0 = identity_zero % prime
    u1 = identity_one % prime
    u2 = identity_two % prime
    pivot: uint64 = 0
    if u0 == 0:
        pivot = 1
        if u1 == 0:
            pivot = 2
            if u2 == 0:
                return False, zero
    first: uint64 = 0
    if pivot == 0:
        first = 1
    second: uint64 = first + 1
    if second == pivot:
        second += 1
    coefficient = 0
    while coefficient < 4 and coefficient < prime:
        t0 = 0
        t1 = 0
        t2 = 0
        if first == 0:
            t0 = 1
        else:
            t1 = 1
        if second == 1:
            t1 = coefficient
        else:
            t2 = coefficient
        s0, s1, s2 = _cubic_residue_product(workspace, t0, t1, t2, t0, t1, t2, prime)
        determinant = _cubic_residue_determinant(u0, t0, s0, u1, t1, s1, u2, t2, s2)
        inverse = _cubic_residue_inverse(determinant, prime)
        if inverse != 0:
            c0, c1, c2 = _cubic_residue_product(
                workspace, t0, t1, t2, s0, s1, s2, prime
            )
            r0 = (
                _cubic_residue_determinant(c0, t0, s0, c1, t1, s1, c2, t2, s2) * inverse
            ) % prime
            r1 = (
                _cubic_residue_determinant(u0, c0, s0, u1, c1, s1, u2, c2, s2) * inverse
            ) % prime
            r2 = (
                _cubic_residue_determinant(u0, t0, c0, u1, t1, c1, u2, t2, c2) * inverse
            ) % prime
            # Authenticate the reconstructed relation in the original basis.
            if (
                (r0 * u0 + r1 * t0 + r2 * s0 - c0) % prime != 0
                or (r0 * u1 + r1 * t1 + r2 * s1 - c1) % prime != 0
                or (r0 * u2 + r1 * t2 + r2 * s2 - c2) % prime != 0
            ):
                return False, zero
            roots, multiplicities = cubic_root_multiplicity_counts(
                checked_uint64((-r0) % prime),
                checked_uint64((-r1) % prime),
                checked_uint64((-r2) % prime),
                checked_uint64(prime),
            )
            if roots > 3 or multiplicities > 3 or roots > multiplicities:
                return False, zero
            return True, roots
        coefficient += 1
    return False, zero
