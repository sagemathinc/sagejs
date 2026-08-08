"""Small exact-integer module used to validate Native Kernel v6."""

from typing import Tuple

from sagejs.native import native


@native
def native_identity(value: int) -> int:
    """Return a borrowed exact input without allocating a local value."""
    return value


@native
def native_add(a: int, b: int) -> int:
    """Add with checked machine-word promotion."""
    return a + b


@native
def native_sub(a: int, b: int) -> int:
    """Subtract with checked machine-word promotion."""
    return a - b


@native
def native_mul(a: int, b: int) -> int:
    """Multiply with checked machine-word promotion."""
    return a * b


@native
def native_neg(value: int) -> int:
    """Negate with checked machine-word promotion."""
    return -value


@native
def native_abs(value: int) -> int:
    """Take an absolute value with checked machine-word promotion."""
    return abs(value)


@native
def native_square(value: int) -> int:
    """Square with checked machine-word promotion."""
    return value ** 2


@native
def native_divmod(a: int, b: int) -> Tuple[int, int]:
    """Return Python's floor quotient and divisor-signed remainder."""
    return divmod(a, b)


@native
def native_gcd(a: int, b: int) -> int:
    """Return the nonnegative greatest common divisor of ``a`` and ``b``."""
    a = abs(a)
    b = abs(b)
    while b != 0:
        remainder = a % b
        a = b
        b = remainder
    return a


@native
def native_lcm(a: int, b: int) -> int:
    """Return the nonnegative least common multiple of ``a`` and ``b``."""
    if a == 0 or b == 0:
        return 0
    return abs((a // native_gcd(a, b)) * b)


@native
def native_powmod(base: int, exponent: int, modulus: int) -> int:
    """Return ``base**exponent`` modulo a positive ``modulus``."""
    result = 1
    base = base % modulus
    while exponent > 0:
        if exponent % 2 == 1:
            result = (result * base) % modulus
        exponent = exponent // 2
        base = (base * base) % modulus
    return result


@native
def native_coprime(a: int, b: int) -> bool:
    """Return whether ``a`` and ``b`` are coprime."""
    return native_gcd(a, b) == 1


@native
def native_floordiv(a: int, b: int) -> int:
    """Expose Python floor division for backend conformance tests."""
    return a // b


@native
def native_mod(a: int, b: int) -> int:
    """Expose Python's divisor-signed remainder for conformance tests."""
    return a % b


@native
def native_zero_or_divides(divisor: int, value: int) -> bool:
    """Exercise Python's short-circuit ``or`` semantics."""
    return divisor == 0 or value % divisor == 0
