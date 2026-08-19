# PARI-free maximal-order computation for simple number fields.
#
# Copyright (C) 2026 Sage.js contributors
# License: GPL-3.0-only

from __future__ import annotations

from typing import Any

import sagejs as sage
import sagejs.runtime as runtime

_nf_module = __import__("sagejs._baselib.number_fields", fromlist=["number_fields"])
NumberFieldOrder = _nf_module.NumberFieldOrder
_nf_canonical_lattice = _nf_module._nf_canonical_lattice
_nf_coordinates = _nf_module._nf_coordinates
_nf_global = _nf_module._nf_global
_nf_lcm = _nf_module._nf_lcm
_nf_trace_matrix = _nf_module._nf_trace_matrix
_untyped = _nf_module._untyped


def integral_equation_polynomial(field: Any) -> Any:
    """Return the monic integral polynomial for the equation-order generator."""
    cached = field._integral_equation_polynomial_cache
    if cached is not None:
        return cached
    degree = field.degree()
    scale = runtime.bigint(1)
    for coefficient in field._defining_coefficients:
        scale = _nf_lcm(scale, coefficient._denominator)
    field._integral_equation_scale_cache = scale
    coefficients = []
    for index, coefficient in enumerate(field._defining_coefficients):
        value = coefficient * scale ** runtime.bigint(degree - index)
        if value._denominator != 1:
            raise ArithmeticError("failed to construct an integral equation polynomial")
        coefficients.append(value._numerator)
    polynomial_ring = _nf_global("PolynomialRing")(
        sage.ZZ,
        field._polynomial._parent.variable_name(),
    )
    polynomial = polynomial_ring(coefficients)
    # Number fields are immutable, so this exact transformed polynomial is a
    # field invariant.  The engine and `equation_order()` intentionally share
    # it instead of rebuilding and rediscriminating the same polynomial.
    field._integral_equation_polynomial_cache = polynomial
    return polynomial


def prime_polynomial_radical(polynomial: Any, prime: Any) -> Any:
    """Return the product of the distinct factors over the prime field."""
    parent = polynomial._parent
    answer = parent(1)
    for factor, _multiplicity in polynomial.factor():
        answer = answer * factor
    return answer


def equation_order_is_p_maximal(
    field: Any,
    prime: Any,
) -> bool:
    """Apply Dedekind's criterion to the equation order at `prime`.

    If `f mod p = g*h` with `g` the product of the distinct monic
    irreducible factors, Dedekind's criterion says that `ZZ[a]` is
    `p`-maximal exactly when `g`, `h`, and `(f - g*h)/p` are coprime modulo
    `p`. Factoring `f mod p` is dramatically cheaper than enumerating the
    trace radical when the equation order is already maximal at `p`.
    """
    integer_polynomial = integral_equation_polynomial(field)
    residue_ring = _nf_global("PolynomialRing")(
        _nf_global("GF")(prime),
        integer_polynomial._parent.variable_name(),
    )
    reduced = residue_ring(integer_polynomial)
    radical = prime_polynomial_radical(reduced, prime)
    quotient = reduced // radical

    integer_ring = integer_polynomial._parent
    radical_lift = integer_ring([coefficient.lift() for coefficient in radical.list()])
    quotient_lift = integer_ring(
        [coefficient.lift() for coefficient in quotient.list()]
    )
    difference = integer_polynomial - radical_lift * quotient_lift
    correction = integer_ring(
        [coefficient // prime for coefficient in difference.list()]
    )
    obstruction = radical.gcd(quotient).gcd(residue_ring(correction))
    return obstruction.degree() == 0


def _nf_order_multiplication_table(order: Any) -> list[list[list[Any]]]:
    """Return the integral multiplication table in the order basis."""
    field = order.number_field()
    degree = field.degree()
    if getattr(field, "_equation_order_cache", None) is order:
        polynomial = integral_equation_polynomial(field)
        coefficients = polynomial.list()
        powers = []
        for exponent in range(2 * degree - 1):
            if exponent < degree:
                row = [sage.ZZ(0) for _index in range(degree)]
                row[exponent] = sage.ZZ(1)
            else:
                previous = powers[exponent - 1]
                row = [sage.ZZ(0) for _index in range(degree)]
                for index in range(degree - 1):
                    row[index + 1] += previous[index]
                leading = previous[degree - 1]
                for index in range(degree):
                    row[index] -= leading * coefficients[index]
            powers.append(row)
        return [
            [list(powers[left + right]) for right in range(degree)]
            for left in range(degree)
        ]
    basis = order.basis()
    basis_inverse = order.basis_matrix().inverse()
    table = []
    for left in basis:
        left_products = []
        for right in basis:
            product = _nf_global("vector")(
                sage.QQ,
                _nf_coordinates(left * right, degree),
            )
            coordinates = list(product * basis_inverse)
            integral_coordinates = []
            for value in coordinates:
                if value._denominator != 1:
                    raise ArithmeticError(
                        "an order multiplication table has a nonintegral entry"
                    )
                integral_coordinates.append(value._numerator)
            left_products.append(integral_coordinates)
        table.append(left_products)
    return table


def _nf_modular_algebra_product(
    left: list[Any],
    right: list[Any],
    table: list[list[list[Any]]],
    residue_field: Any,
) -> list[Any]:
    """Multiply coordinate vectors in an order modulo a prime."""
    degree = len(left)
    answer = [residue_field(0) for _index in range(degree)]
    for left_index in range(degree):
        if left[left_index] == 0:
            continue
        for right_index in range(degree):
            if right[right_index] == 0:
                continue
            scalar = left[left_index] * right[right_index]
            product = table[left_index][right_index]
            for coordinate in range(degree):
                answer[coordinate] += scalar * product[coordinate]
    return answer


def _nf_modular_algebra_power(
    base: list[Any],
    exponent: int,
    one: list[Any],
    table: list[list[list[Any]]],
    residue_field: Any,
) -> list[Any]:
    """Exponentiate an order element modulo a prime."""
    answer = list(one)
    power = list(base)
    remaining = exponent
    while remaining:
        if remaining % 2:
            answer = _nf_modular_algebra_product(
                answer,
                power,
                table,
                residue_field,
            )
        remaining //= 2
        if remaining:
            power = _nf_modular_algebra_product(
                power,
                power,
                table,
                residue_field,
            )
    return answer


def _nf_p_radical_rows(
    order: Any,
    prime: Any,
    table: list[list[list[Any]]],
) -> list[list[Any]]:
    """Return an `F_p` basis of the nilradical of `order / p*order`.

    For `p > degree`, the radical of the regular trace pairing is the
    nilradical. For the finitely many smaller primes, the nilradical is the
    kernel of a sufficiently high Frobenius power. Both descriptions reduce
    the computation to one finite-field matrix kernel.
    """
    degree = order.degree()
    residue_field = _nf_global("GF")(prime)
    if prime > degree:
        trace_rows = _nf_trace_matrix(order.number_field(), order.basis())
        integer_rows = []
        for row in trace_rows:
            integer_row = []
            for value in row:
                if value._denominator != 1:
                    raise ArithmeticError(
                        "an integral order has a nonintegral trace pairing"
                    )
                integer_row.append(value._numerator)
            integer_rows.append(integer_row)
        radical = _nf_global("matrix")(
            residue_field,
            integer_rows,
        ).right_kernel_matrix()
        return [list(row) for row in radical.rows()]

    prime_number = runtime.number(prime)
    basis_inverse = order.basis_matrix().inverse()
    one_power_coordinates = [sage.QQ(0) for _index in range(degree)]
    one_power_coordinates[0] = sage.QQ(1)
    one_coordinates = list(
        _nf_global("vector")(sage.QQ, one_power_coordinates) * basis_inverse
    )
    one = []
    for value in one_coordinates:
        if value._denominator != 1:
            raise ArithmeticError("the identity has nonintegral order coordinates")
        one.append(residue_field(value._numerator))

    modular_table = []
    for left_products in table:
        modular_left_products = []
        for product in left_products:
            modular_left_products.append([residue_field(value) for value in product])
        modular_table.append(modular_left_products)

    frobenius_columns = []
    for basis_index in range(degree):
        basis_vector = [residue_field(0) for _index in range(degree)]
        basis_vector[basis_index] = residue_field(1)
        frobenius_columns.append(
            _nf_modular_algebra_power(
                basis_vector,
                prime_number,
                one,
                modular_table,
                residue_field,
            )
        )
    frobenius = _nf_global("matrix")(
        residue_field,
        frobenius_columns,
    ).transpose()
    nilpotent_power = frobenius
    bound = prime_number
    while bound < degree:
        nilpotent_power = nilpotent_power * frobenius
        bound *= prime_number
    radical = nilpotent_power.right_kernel_matrix()
    return [list(row) for row in radical.rows()]


def _nf_multiplier_ring_step(
    order: Any,
    prime: Any,
    radical_rows: list[list[Any]],
    table: list[list[list[Any]]],
) -> Any:
    """Return the Round-2 multiplier-ring enlargement, or `None`.

    Let `I` be the inverse image in `O` of the nilradical of `O/pO`.
    Elements of `(I:I)/O` have representatives `y/p`, with `y` in `O`.
    Requiring `y*I` to lie in `pI` gives `degree^2` homogeneous linear
    equations over `F_p`. Their kernel generates the complete enlargement.
    """
    degree = order.degree()
    ideal_rows = []
    for index in range(degree):
        row = [sage.QQ(0) for _column in range(degree)]
        row[index] = sage.QQ(prime)
        ideal_rows.append(row)
    for radical_row in radical_rows:
        ideal_rows.append([sage.QQ(value.lift()) for value in radical_row])
    ideal_rows = _nf_canonical_lattice(ideal_rows, degree)
    ideal_inverse = _nf_global("matrix")(sage.QQ, ideal_rows).inverse()

    product_coordinates = []
    for ideal_row in ideal_rows:
        row_products = []
        for order_index in range(degree):
            product = [sage.QQ(0) for _coordinate in range(degree)]
            for basis_index in range(degree):
                coefficient = ideal_row[basis_index]
                if coefficient == 0:
                    continue
                basis_product = table[order_index][basis_index]
                for coordinate in range(degree):
                    product[coordinate] += coefficient * basis_product[coordinate]
            relative = list(_nf_global("vector")(sage.QQ, product) * ideal_inverse)
            integral_relative = []
            for value in relative:
                if value._denominator != 1:
                    raise ArithmeticError("the p-radical is not an order ideal")
                integral_relative.append(value._numerator)
            row_products.append(integral_relative)
        product_coordinates.append(row_products)

    equations = []
    for ideal_index in range(degree):
        for coordinate in range(degree):
            equations.append(
                [
                    product_coordinates[ideal_index][order_index][coordinate]
                    for order_index in range(degree)
                ]
            )
    residue_field = _nf_global("GF")(prime)
    kernel = _nf_global("matrix")(
        residue_field,
        equations,
    ).right_kernel_matrix()
    kernel_rows = [list(row) for row in kernel.rows()]
    if len(kernel_rows) == 0:
        return None

    overorder_rows = list(order._basis_rows)
    for kernel_row in kernel_rows:
        current_coordinates = [
            _untyped(sage.QQ)(value.lift(), prime) for value in kernel_row
        ]
        power_coordinates = [sage.QQ(0) for _index in range(degree)]
        for basis_index in range(degree):
            for coordinate in range(degree):
                power_coordinates[coordinate] += (
                    current_coordinates[basis_index]
                    * order._basis_rows[basis_index][coordinate]
                )
        overorder_rows.append(power_coordinates)
    enlarged = NumberFieldOrder(order.number_field(), overorder_rows, False, False)
    if order._discriminant_cache is not runtime.undefined:
        index = runtime.bigint(prime) ** runtime.bigint(len(kernel_rows))
        enlarged._discriminant_cache = runtime.normalize_integer(
            runtime.integer_bigint(order._discriminant_cache) // (index * index)
        )
    return enlarged


def p_maximal_overorder_dynamic(
    order: Any,
    prime: Any,
) -> Any:
    """Compute the `p`-maximal overorder by dynamic Zassenhaus Round 2."""
    current = order
    while True:
        table = _nf_order_multiplication_table(current)
        radical_rows = _nf_p_radical_rows(current, prime, table)
        enlarged = _nf_multiplier_ring_step(current, prime, radical_rows, table)
        if enlarged is None:
            return current
        if enlarged._basis_rows == current._basis_rows:
            raise ArithmeticError("a multiplier-ring step did not enlarge the order")
        current = enlarged


def maximal_overorder_native(
    order: Any,
    primes: list[int],
) -> Any:
    """Compute all requested local overorders in one FLINT-storage call."""
    if len(primes) == 0:
        return order
    degree = order.degree()
    table = _nf_order_multiplication_table(order)
    flattened = []
    for left in range(degree):
        for right in range(degree):
            flattened.append(table[left][right])
    table_matrix = _nf_global("matrix")(sage.ZZ, flattened)
    ffi = __import__("sagejs.ffi.flint", fromlist=["flint"])
    prime_buffer = runtime.uint64_buffer(primes)
    resource = ffi.number_field_order_maximal_at_primes(
        table_matrix._integer_resource(),
        prime_buffer,
        len(primes),
    )
    change = _nf_global("MatrixSpace")(
        sage.QQ,
        degree,
        degree,
    )._from_fmpq_matrix_resource(resource)
    basis_matrix = change * order.basis_matrix()
    enlarged = NumberFieldOrder(
        order.number_field(),
        [list(row) for row in basis_matrix.rows()],
        False,
        False,
    )
    if order._discriminant_cache is not runtime.undefined:
        determinant = change.determinant()
        discriminant = sage.QQ(order._discriminant_cache) * determinant * determinant
        if discriminant._denominator != 1:
            raise ArithmeticError("a local overorder has nonintegral discriminant")
        enlarged._discriminant_cache = runtime.normalize_integer(
            discriminant._numerator
        )
    return enlarged
