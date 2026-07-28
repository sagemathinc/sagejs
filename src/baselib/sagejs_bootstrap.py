"""Irreducible aliases and ABI glue used while Sage.js bootstraps itself.

This is the sole top-level baselib module which is intentionally not strict
mathematical Python. The aliases break the compiler's bootstrap import cycle;
the adapter below captures JavaScript's dynamic ``this`` value, which Python
has no source-level spelling for.
"""

# globals: AlgebraicExtensionFunctor, Element, Factorization
# globals: FiniteFieldElement, Parent, PolynomialRing, QQ, QuotientFunctor
# globals: Rational, ZZ, ZeroDivisionError

algebraic_extension_functor = AlgebraicExtensionFunctor
element_class = Element
factorization_class = Factorization
finite_field_element_class = FiniteFieldElement
parent_class = Parent
polynomial_ring = PolynomialRing
qq = QQ
quotient_functor = QuotientFunctor
rational_class = Rational
zz = ZZ
zero_division_error = ZeroDivisionError


def ρσ_native_method_adapter(target_function):
    return r"""%js (() => {
        function method(...args) {
            args.unshift(this);
            return Reflect.apply(target_function, undefined, args);
        }
        if (target_function.__argnames__) {
            method.__argnames__ = target_function.__argnames__.slice(1);
        }
        method.__handles_kwarg_interpolation__ =
            target_function.__handles_kwarg_interpolation__;
        return method;
    })()"""
