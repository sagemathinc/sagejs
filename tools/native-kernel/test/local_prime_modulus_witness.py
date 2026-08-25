"""Independent varying local prime-modulus compiler witness."""

from __future__ import annotations

from sagejs.native import (
    PrimeFieldModulus,
    UInt64Buffer,
    native,
    prime_add,
    prime_mul,
    uint64,
)


def modular_polynomial_step(
    value: uint64,
    modulus: PrimeFieldModulus,
) -> uint64:
    """Evaluate `value^2 + 3` using the supplied local modulus."""
    return prime_add(prime_mul(value, value, modulus), 3, modulus)


@native
def varying_local_modulus_batch(
    output: UInt64Buffer,
    values: UInt64Buffer,
    moduli: UInt64Buffer,
    count: uint64,
    boundary_modulus: PrimeFieldModulus,
) -> bool:
    """Apply one modular step per row with a checked packed modulus."""
    if len(output) < count or len(values) < count or len(moduli) < count:
        return False
    index: uint64 = 0
    while index < count:
        raw_modulus: uint64 = moduli[index]
        if raw_modulus < 2 or raw_modulus > 4294967295:
            return False
        modulus: PrimeFieldModulus = raw_modulus
        output[index] = modular_polynomial_step(values[index], modulus)
        index += 1
    return True
