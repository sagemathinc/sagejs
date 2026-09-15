"""PARI 2.17.4 binary degree factorization for degrees two through four.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Translate `FpX_factor.c` F2x_degfact_2, F2x_Berlekamp_i,
F2x_factor_squarefree, F2x_split_Berlekamp, and F2x_Berlekamp_ker.
Frobenius construction follows `F2x.c` F2x_matFrobenius and the small
`bb_group.c` gen_powers schedule. Packed integers represent binary
polynomials, not a table of precomputed factorizations.
"""

from sagejs.native import IntegerBuffer, native

from .f2x_small import (
    _f2x_xor,
    pari_f2x_small_degree,
    pari_f2x_small_valuation,
    pari_f2x_small_mul,
    pari_f2x_small_sqr,
    pari_f2x_small_rem,
    pari_f2x_small_div,
    pari_f2x_small_gcd,
    pari_f2x_small_deriv,
    pari_f2x_small_sqrt,
    pari_f2m_small_kernel,
)
from .flx_small_factor import pari_flx_small_sort_factor


@native
def pari_f2x_small_factor_workspace_size() -> int:
    """Four factors, four squarefree layers, and three four-column owners.

    The twelve kernel slots are reused for the source tiny stable sorter.
    """
    return 4 + 4 + 4 + 4 + 4


@native
def pari_f2x_small_berlekamp_kernel(
    polynomial: int, workspace: IntegerBuffer, scratch: int
) -> int:
    """Construct Q-I in source power order, then its exact kernel basis.

    Three disjoint spans of four entries hold columns, basis, and pivots.
    The returned basis begins at `scratch + 4`.
    """
    degree = pari_f2x_small_degree(polynomial)
    xp = pari_f2x_small_rem(pari_f2x_small_sqr(2), polynomial)
    workspace[scratch] = 1
    workspace[scratch + 1] = xp
    if degree >= 3:
        workspace[scratch + 2] = pari_f2x_small_rem(pari_f2x_small_sqr(xp), polynomial)
    if degree == 4:
        # gen_powers index four is a multiply in either use_sqr branch.
        workspace[scratch + 3] = pari_f2x_small_rem(
            pari_f2x_small_mul(workspace[scratch + 2], xp), polynomial
        )
    for j in range(degree):
        workspace[scratch + j] = _f2x_xor(workspace[scratch + j], 1 << j)
    return pari_f2m_small_kernel(workspace, scratch, degree, scratch + 4, scratch + 8)


@native
def pari_f2x_small_split(
    polynomial: int, workspace: IntegerBuffer, factors: int, kernel: int
) -> int:
    """The no-RNG branch of source Berlekamp splitting, after x stripping.

    A squarefree polynomial of degree at most four with nonzero constant
    term has at most two distinct irreducible factors: the three smallest
    distinct non-x irreducibles have degrees 1, 2, and 3. Thus source kernel
    dimension greater than two is unreachable. Keep a defensive frontier,
    rather than introducing a different randomized splitter.
    """
    workspace[factors] = polynomial
    degree = pari_f2x_small_degree(polynomial)
    if degree == 1:
        return 1
    if degree == 2:
        if polynomial == 6:
            workspace[factors] = 2
            workspace[factors + 1] = 3
            return 2
        return 1
    dimension = pari_f2x_small_berlekamp_kernel(polynomial, workspace, kernel)
    if dimension > 2:
        raise ValueError("binary small factor random-split frontier")
    irreducible = 0
    length = 1
    while length < dimension:
        pol = workspace[kernel + 5]  # Exact second source kernel vector.
        i = irreducible
        while i < length and length < dimension:
            a = workspace[factors + i]
            da = pari_f2x_small_degree(a)
            if da == 1:
                if i > irreducible:
                    temporary = workspace[factors + i]
                    workspace[factors + i] = workspace[factors + irreducible]
                    workspace[factors + irreducible] = temporary
                irreducible += 1
            elif da == 2:
                if a == 6:
                    workspace[factors + i] = 2
                    workspace[factors + length] = 3
                    length += 1
                if i > irreducible:
                    temporary = workspace[factors + i]
                    workspace[factors + i] = workspace[factors + irreducible]
                    workspace[factors + irreducible] = temporary
                irreducible += 1
            else:
                b = pari_f2x_small_rem(pol, a)
                if pari_f2x_small_degree(b) > 0:
                    b = pari_f2x_small_gcd(a, b)
                    db = pari_f2x_small_degree(b)
                    if db != 0 and db < da:
                        workspace[factors + length] = pari_f2x_small_div(a, b)
                        workspace[factors + i] = b
                        length += 1
            i += 1
    return dimension


@native
def pari_f2x_small_degfact(
    polynomial: int,
    factor_degrees: IntegerBuffer,
    factor_exponents: IntegerBuffer,
    workspace: IntegerBuffer,
    scratch: int,
) -> int:
    """Return source degree/exponent vectors, writing only their active prefix.

    Owners are disjoint; scratch has exactly twenty slots. Inputs are packed
    binary polynomials of degree two through four. Unexpected kernel failure
    may alter scratch; the outer get_fs entry owns publication state.
    """
    if polynomial < 4 or polynomial >= 32:
        raise ValueError("binary small factor degree frontier")
    degree = pari_f2x_small_degree(polynomial)
    if (
        len(factor_degrees) < degree
        or len(factor_exponents) < degree
        or scratch < 0
        or scratch + pari_f2x_small_factor_workspace_size() > len(workspace)
    ):
        raise ValueError("short binary small factor storage")
    if degree == 2:
        factor_degrees[0] = 1
        factor_exponents[0] = 1
        if polynomial == 7:
            factor_degrees[0] = 2
            return 1
        if polynomial == 6:
            factor_degrees[1] = 1
            factor_exponents[1] = 1
            return 2
        factor_exponents[0] = 2
        return 1
    valuation = pari_f2x_small_valuation(polynomial)
    f = polynomial >> valuation
    layers = scratch + 4
    kernel = scratch + 8
    for i in range(4):
        workspace[layers + i] = 1
    remaining_degree = pari_f2x_small_degree(f)
    multiplicity = 1
    while True:
        r = pari_f2x_small_gcd(f, pari_f2x_small_deriv(f))
        if pari_f2x_small_degree(r) == 0:
            workspace[layers + multiplicity - 1] = f
            break
        t = pari_f2x_small_div(f, r)
        if pari_f2x_small_degree(t) > 0:
            j = 1
            while True:
                v = pari_f2x_small_gcd(r, t)
                tv = pari_f2x_small_div(t, v)
                if pari_f2x_small_degree(tv) > 0:
                    workspace[layers + j * multiplicity - 1] = tv
                if pari_f2x_small_degree(v) <= 0:
                    break
                r = pari_f2x_small_div(r, v)
                t = v
                j += 1
            if pari_f2x_small_degree(r) == 0:
                break
        f = pari_f2x_small_sqrt(r)
        multiplicity *= 2
    last = remaining_degree
    while last > 0 and pari_f2x_small_degree(workspace[layers + last - 1]) == 0:
        last -= 1
    count = 0
    if valuation != 0:
        factor_degrees[0] = 1
        factor_exponents[0] = valuation
        count = 1
    for k in range(last):
        component = workspace[layers + k]
        if pari_f2x_small_degree(component) == 0:
            continue
        number = pari_f2x_small_split(component, workspace, scratch, kernel)
        for j in range(number):
            factor_degrees[count + j] = pari_f2x_small_degree(workspace[scratch + j])
            factor_exponents[count + j] = k + 1
        count += number
    pari_flx_small_sort_factor(
        workspace, kernel, count, factor_degrees, factor_exponents
    )
    return count
