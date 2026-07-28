"""
Source-level Sage.js compatibility package.

The current compiler recognizes ``sagejs.runtime`` intrinsically.  This
package remains on disk so an older checked-in compiler can bootstrap a newer
one from the same readable source.
"""

from sagejs_bootstrap import (
    algebraic_extension_functor,
    element_class,
    factorization_class,
    finite_field_element_class,
    parent_class,
    polynomial_ring,
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
