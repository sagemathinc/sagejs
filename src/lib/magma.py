"""Small compatibility runtime for the experimental Magma frontend.

The parser preserves Magma's global intrinsic-call programming model.  Each
``MagmaIntrinsic`` contains independently registered implementations selected
from the complete runtime argument signature.  The first compatibility
methods mostly delegate to Sage's existing generic operations; the registry
is deliberately present now so future Magma categories do not have to be
encoded as object methods.
"""

from typing import Any, Callable

import sagejs as sage


class MagmaIntrinsic:
    def __init__(self, name: str) -> None:
        self._name = name
        self._methods: list[
            tuple[tuple[type, ...], Callable[..., Any]]
        ] = []

    def register(
        self, *signature: type
    ) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
        def add_method(
            function: Callable[..., Any]
        ) -> Callable[..., Any]:
            self._methods.append((signature, function))
            return function

        return add_method

    def __call__(self, *args: Any, **kwargs: Any) -> Any:
        for signature, function in reversed(self._methods):
            if len(signature) != len(args):
                continue
            matches = True
            for expected, value in zip(signature, args, strict=True):
                if expected is not object and not isinstance(value, expected):
                    matches = False
                    break
            if matches:
                return function(*args, **kwargs)
        types = ', '.join(type(value).__name__ for value in args)
        raise TypeError(
            "no matching intrinsic '" + self._name +
            "' for argument types (" + types + ")")

    def __repr__(self) -> str:
        return "Magma intrinsic " + self._name


Integers = MagmaIntrinsic('Integers')
Rationals = MagmaIntrinsic('Rationals')
PolynomialRing = MagmaIntrinsic('PolynomialRing')
Factorization = MagmaIntrinsic('Factorization')
IsPrime = MagmaIntrinsic('IsPrime')
PrimeDivisors = MagmaIntrinsic('PrimeDivisors')
Divisors = MagmaIntrinsic('Divisors')
Parent = MagmaIntrinsic('Parent')
Type = MagmaIntrinsic('Type')


@Integers.register()
def integers_method() -> Any:
    return sage.ZZ


@Rationals.register()
def rationals_method() -> Any:
    return sage.QQ


@PolynomialRing.register(object)
def polynomial_ring_default_method(base: Any) -> Any:
    return sage.PolynomialRing(base, 'x')


@PolynomialRing.register(object, str)
def polynomial_ring_named_method(base: Any, name: str) -> Any:
    return sage.PolynomialRing(base, name)


@Factorization.register(object)
def factorization_method(value: Any) -> Any:
    return sage.factor(value)


@IsPrime.register(object)
def is_prime_method(value: Any) -> bool:
    return sage.is_prime(value)


@PrimeDivisors.register(object)
def prime_divisors_method(value: Any) -> Any:
    return sage.prime_divisors(value)


@Divisors.register(object)
def divisors_method(value: Any) -> Any:
    return sage.divisors(value)


@Parent.register(object)
def parent_method(value: Any) -> Any:
    return sage.parent(value)


def _runtime_type_name(value: Any) -> str:
    name = type(value).__name__
    if name.startswith('ρσ_'):
        return name[3:]
    return name


@Type.register(object)
def type_method(value: Any) -> str:
    """Return a Magma-style category for a shared evaluator object."""

    names = {
        'bool': 'BoolElt',
        'int': 'RngIntElt',
        'Integer': 'RngIntElt',
        'Rational': 'FldRatElt',
        'float': 'FldReElt',
        'RealLiteral': 'FldReElt',
        'RealNumberElement': 'FldReElt',
        'complex': 'FldComElt',
        'PythonComplex': 'FldComElt',
        'ComplexNumberElement': 'FldComElt',
        'str': 'MonStgElt',
        'list': 'SeqEnum',
        'list_constructor': 'SeqEnum',
        'tuple': 'Tup',
        'set': 'SetEnum',
        'dict': 'Assoc',
        'ndarray': 'AlgMatElt',
        'PolynomialRingParent': 'RngUPol',
        'PolynomialElement': 'RngUPolElt',
        'Expression': 'SymExpr',
        'Graphics': 'GrphObj',
        'Graphics3d': 'GrphObj',
    }
    name = _runtime_type_name(value)
    return names[name] if name in names else name


def magma_range(start: int, stop: int, step: int = 1) -> list[int]:
    """Return Magma's inclusive integer range as an ordinary sequence."""

    if step == 0:
        raise ValueError('Magma range step must not be zero')
    boundary = stop + (1 if step > 0 else -1)
    return list(range(start, boundary, step))


def magma_getitem(value: Any, index: int) -> Any:
    """Apply Magma's one-based indexing convention."""

    if index == 0:
        raise IndexError('Magma sequence indices start at 1')
    return value[index - 1 if index > 0 else index]
