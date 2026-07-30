"""
Source-level Sage.js compatibility package.

The current compiler recognizes ``sagejs.runtime`` intrinsically.  This
package remains on disk so an older checked-in compiler can bootstrap a newer
one from the same readable source.
"""

from sagejs_bootstrap import (
    algebraic_extension_functor,
    element_class,
    divisors_function,
    factorization_class,
    factor_function,
    finite_field_element_class,
    is_prime_function,
    parent_class,
    parent_function,
    polynomial_ring,
    prime_divisors_function,
    qq,
    quotient_functor,
    rational_class,
    zz,
    zero_division_error
)

AlgebraicExtensionFunctor = algebraic_extension_functor
Element = element_class
Factorization = factorization_class
FiniteFieldElement = finite_field_element_class
Parent = parent_class
PolynomialRing = polynomial_ring
QQ = qq
QuotientFunctor = quotient_functor
Rational = rational_class
ZZ = zz
ZeroDivisionError = zero_division_error
divisors = divisors_function
factor = factor_function
is_prime = is_prime_function
parent = parent_function
prime_divisors = prime_divisors_function
