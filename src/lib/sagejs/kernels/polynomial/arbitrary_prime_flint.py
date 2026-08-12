"""Generated-FLINT kernels for arbitrary-prime `GF(p)[x]` resources.

The resource owns its FLINT context and polynomial.  These compiled functions
borrow that owner only for the synchronous native call; neither a pointer nor
a context token escapes into the host runtime.
"""

from __future__ import annotations

from sagejs.ffi.flint import (
    FmpzModPolynomial,
    fmpz_mod_polynomial_coefficient,
    fmpz_mod_polynomial_entry_count,
    fmpz_mod_polynomial_modulus,
)
from sagejs.native import native, uint64


@native
def flint_arbitrary_prime_polynomial_coefficient_sum(
    source: FmpzModPolynomial,
) -> int:
    """Traverse every coefficient in native code and return their field sum."""
    length: uint64 = fmpz_mod_polynomial_entry_count(source)
    modulus = fmpz_mod_polynomial_modulus(source)
    total = 0
    for index in range(length):
        total = (total + fmpz_mod_polynomial_coefficient(source, index)) % modulus
    return total


__all__ = ["flint_arbitrary_prime_polynomial_coefficient_sum"]
