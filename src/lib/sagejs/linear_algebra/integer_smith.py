"""Bound coefficient growth before computing integral Smith invariants."""

from typing import Any

import sagejs as sage
import sagejs.runtime as runtime


def _modular_hnf(source: Any, annihilator: int) -> Any:
    """Row HNF with a proved positive annihilator of the full-rank quotient."""
    from sagejs.ffi.flint import fmpz_mat_hnf_modular_eldiv

    rows, columns = source.nrows(), source.ncols()
    # Explicit runtime packing is also correct when @native is disabled.
    # kernel_integer_buffer would return a Python list in that mode, which
    # is not the IntegerBuffer representation accepted by the foreign call.
    entries = runtime.integer_buffer([int(x) for x in source.list()])
    output = runtime.integer_buffer(
        [0] * (rows * columns), max(2, (annihilator.bit_length() + 63) // 64 + 1)
    )
    bound = runtime.integer_buffer([annihilator])
    if not fmpz_mat_hnf_modular_eldiv(output, entries, rows, columns, bound, 1):
        raise ArithmeticError("modular HNF rejected a full-rank integral matrix")
    matrix = runtime.reflect.get(runtime.global_object, "matrix")
    return matrix(sage.ZZ, rows, columns, output.toArray())


def preconditioned_elementary_divisors(source: Any) -> Any:
    r"""Smith invariants, using bounded alternating HNF for large isogenies.

    For nonsingular square $A$, the lcm of the denominators of $A^{-1}$
    annihilates $\mathbf Z^n/\mathbf Z^n A$. Modular HNF may therefore
    reduce entries modulo this proved bound. Row HNF and transposition
    preserve Smith invariants. Four passes bound preconditioning work;
    diagonalization is an optimization, never a correctness assumption.

    Small, singular and rectangular matrices keep the general Smith path.
    The foreign modular HNF has native and Wasm adapters; if unavailable,
    the original Smith algorithm remains a correct fallback.
    """
    if source.base_ring() != sage.ZZ:
        raise TypeError("Smith preconditioning requires an integer matrix")
    if source.nrows() < 16 or source.nrows() != source.ncols():
        return source.elementary_divisors()
    try:
        inverse = source.change_ring(sage.QQ).inverse()
    except (ZeroDivisionError, ValueError):
        return source.elementary_divisors()
    annihilator = 1
    for entry in inverse.list():
        denominator = int(entry.denominator())
        a, b = annihilator, denominator
        while b:
            a, b = b, a % b
        annihilator = annihilator // a * denominator
    current = source
    for _step in range(4):
        try:
            current = _modular_hnf(current, annihilator)
        except (ImportError, RuntimeError, NotImplementedError):
            return current.elementary_divisors()
        values = current.list()
        columns = current.ncols()
        if all(value == 0 for i, value in enumerate(values) if i % (columns + 1)):
            break
        current = current.transpose()
    return current.elementary_divisors()
