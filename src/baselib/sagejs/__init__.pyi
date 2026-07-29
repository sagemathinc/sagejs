from typing import Any, Iterator


class Parent:
    _kind: str
    _modulus: int
    _construction: Any

    def __call__(self, value: Any = ...) -> Any: ...
    def __str__(self) -> str: ...


class Element:
    # An element's exact parent type is generally value-dependent.
    _parent: Any

    def parent(self) -> Any: ...


class Rational(Element):
    _numerator: int
    _denominator: int

    def numerator(self) -> int: ...
    def denominator(self) -> int: ...


class FiniteFieldElement(Element):
    _value: int


class RealNumberElement(Element):
    def __float__(self) -> float: ...


class Factorization:
    def __init__(
        self,
        factors: Any,
        unit: Any = ...,
        cr: bool = ...,
        sort: bool = ...,
        simplify: bool = ...,
    ) -> None: ...


class ZeroDivisionError(ArithmeticError): ...


class _Functor:
    def __str__(self) -> str: ...


AlgebraicExtensionFunctor: _Functor
QuotientFunctor: _Functor
ZZ: Parent
QQ: Parent
RDF: Parent
RR: Parent


def PolynomialRing(
    base: Parent,
    variable: str | None = ...,
    names: str | None = ...,
) -> Any: ...
