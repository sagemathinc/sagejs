"""First declaration-driven FFI witnesses for the Sage.js native compiler."""

from sagejs.ffi.flint import fmpz_gcd, n_is_prime
from sagejs.native import native


@native
def flint_word_is_prime(value: uint64) -> bool:
    return n_is_prime(value)


@native
def flint_integer_gcd(left: Integer, right: Integer) -> Integer:
    return fmpz_gcd(left, right)
