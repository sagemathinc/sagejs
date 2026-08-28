r"""Parallel weight-two Brandt modules over $\mathbf Q(\sqrt3)$.

This second-field witness uses two genuine right-ideal-class components of a
maximal order in $(-1,-1)_{\mathbf Q(\sqrt3)}$.  The component units and
good-prime transporters are exact arithmetic data generated independently by
Magma; the Sage.js operator is reconstructed from their projective actions,
not from Magma's final matrices.
"""

from __future__ import annotations

from typing import Any, Iterable

import sagejs as sage
import sagejs.runtime as runtime

from .algebraic import (
    ComponentCuspidalHeckeOperator,
    QuaternionComponentHeckeSet,
    QuaternionHeckeCorrespondence,
    QuaternionIdealComponent,
)
from .sparse_hecke import SparseHeckeOperator

Matrix2 = tuple[int, int, int, int]


def _integer(value: Any, label: str) -> int:
    normalized = runtime.normalize_integer(value)
    if runtime.jstype(normalized) != "number" or not runtime.number.isSafeInteger(
        normalized
    ):
        raise TypeError(label + " must be an exact machine integer")
    return runtime.number(normalized)


class Qsqrt3PrimeIdeal:
    r"""A selected degree-one prime $(p,\sqrt3-r)$ of $\mathbf Q(\sqrt3)$."""

    def __init__(self, rational_prime: Any, root: Any, label: Any) -> None:
        prime = _integer(rational_prime, "rational prime")
        residue = _integer(root, "prime root")
        if prime < 2 or not sage.is_prime(prime):
            raise ValueError("the rational prime must be prime")
        if (residue * residue - 3) % prime != 0:
            raise ValueError("the supplied residue is not a root of x^2-3")
        self._prime = prime
        self._root = residue % prime
        self._label = str(label)
        runtime.object.freeze(self)

    def rational_prime(self) -> int:
        return self._prime

    def root(self) -> int:
        return self._root

    def norm(self) -> int:
        return self._prime

    def label(self) -> str:
        return self._label

    def basis(self) -> tuple[tuple[int, int], tuple[int, int]]:
        return ((self._prime, 0), ((-self._root) % self._prime, 1))

    def contains(self, constant: Any, radical: Any = 0) -> bool:
        first = _integer(constant, "ideal test constant")
        second = _integer(radical, "ideal test radical coefficient")
        return (first + second * self._root) % self._prime == 0

    def fingerprint(self) -> tuple[Any, ...]:
        return ("Qsqrt3-prime-v1", self._prime, self._root, self._label)

    def __eq__(self, other: object) -> bool:
        return (
            isinstance(other, Qsqrt3PrimeIdeal)
            and self._prime == other._prime
            and self._root == other._root
            and self._label == other._label
        )

    def __repr__(self) -> str:
        return "Prime ideal (" + str(self._prime) + ", sqrt(3)-" + str(self._root) + ")"

    __str__ = __repr__
    toString = __repr__


_LEVEL = Qsqrt3PrimeIdeal(13, 9, "13a")
_HECKE_PRIMES = {
    "2": Qsqrt3PrimeIdeal(2, 1, "2"),
    "3": Qsqrt3PrimeIdeal(3, 0, "3"),
    "11a": Qsqrt3PrimeIdeal(11, 6, "11a"),
    "11b": Qsqrt3PrimeIdeal(11, 5, "11b"),
}


def sqrt3_hecke_prime(index: Any) -> Qsqrt3PrimeIdeal:
    """Resolve one of the exact good primes $2,3,11a,11b$."""
    if isinstance(index, Qsqrt3PrimeIdeal):
        for prime in _HECKE_PRIMES.values():
            if prime == index:
                return prime
        raise NotImplementedError("this Q(sqrt(3)) prime has no transporter data")
    key = str(index)
    if key not in _HECKE_PRIMES:
        raise NotImplementedError(
            "implemented Q(sqrt(3)) Hecke indices are 2, 3, 11a, and 11b"
        )
    return _HECKE_PRIMES[key]


def sqrt3_prime_ideals(index: Any) -> tuple[Qsqrt3PrimeIdeal, ...]:
    """Return the selected implemented primes above a rational prime."""
    prime = _integer(index, "rational prime")
    return tuple(
        value for value in _HECKE_PRIMES.values() if value.rational_prime() == prime
    )


_COMPONENT_UNITS: tuple[tuple[Matrix2, ...], ...] = (
    (
        (12, 0, 0, 12),
        (12, 7, 7, 2),
        (4, 8, 8, 0),
        (6, 12, 11, 7),
        (10, 3, 3, 2),
        (11, 7, 7, 1),
        (0, 8, 8, 9),
        (2, 10, 10, 10),
        (7, 2, 1, 6),
        (2, 2, 2, 1),
        (4, 3, 3, 9),
        (3, 8, 8, 12),
        (5, 0, 4, 8),
        (1, 11, 11, 2),
        (0, 1, 12, 0),
        (3, 9, 9, 10),
        (8, 10, 12, 5),
        (2, 11, 1, 11),
        (12, 5, 5, 3),
        (8, 9, 0, 5),
        (2, 1, 11, 11),
        (8, 12, 10, 5),
        (10, 11, 10, 3),
        (10, 10, 11, 3),
    ),
    (
        (12, 0, 0, 12),
        (2, 4, 9, 12),
        (8, 3, 7, 6),
        (6, 6, 0, 4),
        (1, 4, 9, 11),
        (6, 10, 6, 8),
        (4, 7, 0, 6),
        (8, 9, 0, 5),
        (1, 11, 11, 2),
        (10, 0, 9, 4),
        (8, 12, 10, 5),
        (4, 3, 3, 9),
        (4, 5, 10, 12),
        (9, 0, 9, 3),
        (7, 4, 11, 6),
        (12, 8, 3, 4),
        (3, 12, 7, 11),
        (11, 1, 6, 3),
        (3, 2, 3, 10),
        (11, 11, 11, 12),
        (10, 6, 1, 3),
        (7, 1, 2, 6),
        (5, 5, 11, 8),
        (2, 3, 8, 11),
    ),
)


_TRANSITIONS: dict[
    str, tuple[int, tuple[tuple[int, int, tuple[Matrix2, ...]], ...]]
] = {
    "2": (
        2,
        (
            (0, 1, ((0, 11, 6, 6), (1, 4, 3, 11), (5, 0, 0, 5))),
            (1, 0, ((9, 4, 3, 0), (11, 9, 4, 1), (12, 0, 0, 12))),
        ),
    ),
    "3": (
        3,
        (
            (
                0,
                1,
                ((11, 6, 7, 8), (11, 7, 8, 1), (2, 12, 0, 10), (12, 11, 10, 0)),
            ),
            (
                1,
                0,
                ((5, 11, 5, 7), (11, 0, 1, 10), (1, 9, 1, 2), (7, 2, 8, 5)),
            ),
        ),
    ),
    "11a": (
        11,
        (
            (
                0,
                1,
                (
                    (9, 6, 10, 3),
                    (5, 8, 2, 7),
                    (12, 0, 11, 7),
                    (8, 4, 10, 9),
                    (6, 9, 7, 5),
                    (0, 4, 5, 11),
                    (6, 9, 2, 4),
                    (1, 1, 5, 11),
                    (12, 9, 8, 0),
                    (7, 7, 2, 1),
                    (1, 6, 6, 3),
                    (8, 10, 4, 9),
                ),
            ),
            (
                1,
                0,
                (
                    (2, 9, 2, 6),
                    (2, 5, 4, 7),
                    (3, 1, 2, 3),
                    (9, 0, 6, 8),
                    (6, 1, 7, 11),
                    (5, 4, 11, 5),
                    (1, 11, 0, 7),
                    (1, 5, 0, 7),
                    (11, 11, 8, 11),
                    (1, 0, 10, 7),
                    (4, 4, 0, 5),
                    (4, 6, 10, 7),
                ),
            ),
        ),
    ),
    "11b": (
        11,
        (
            (
                0,
                1,
                (
                    (5, 0, 10, 7),
                    (10, 9, 8, 12),
                    (11, 7, 3, 11),
                    (7, 4, 0, 5),
                    (3, 0, 4, 3),
                    (4, 1, 10, 8),
                    (1, 4, 0, 9),
                    (7, 5, 5, 3),
                    (3, 5, 6, 0),
                    (12, 0, 9, 4),
                    (12, 1, 8, 9),
                    (2, 0, 4, 11),
                ),
            ),
            (
                1,
                0,
                (
                    (9, 7, 8, 11),
                    (3, 7, 2, 6),
                    (8, 2, 11, 0),
                    (6, 5, 3, 1),
                    (1, 2, 8, 7),
                    (11, 3, 10, 9),
                    (11, 1, 7, 1),
                    (12, 2, 9, 4),
                    (4, 10, 8, 8),
                    (3, 5, 12, 4),
                    (4, 10, 5, 7),
                    (3, 4, 0, 10),
                ),
            ),
        ),
    ),
}


def _finite_set(dense_entry_limit: Any) -> QuaternionComponentHeckeSet:
    # The content-addressed Magma packet uses ((1,-1),(1,-4)) and
    # ((1,4),(1,-6)).  Our compact P^1 encoding sends (0,1) to 0 and
    # (1,t) to 1+t modulo 13.
    orbit_representatives = ((13, 10), (5, 8))
    components = tuple(
        QuaternionIdealComponent(
            "I" + str(index + 1),
            13,
            units,
            representatives=orbit_representatives[index],
        )
        for index, units in enumerate(_COMPONENT_UNITS)
    )
    correspondences = []
    for label in ["2", "3", "11a", "11b"]:
        norm, transitions = _TRANSITIONS[label]
        correspondences.append(QuaternionHeckeCorrespondence(label, norm, transitions))
    return QuaternionComponentHeckeSet(
        components,
        correspondences,
        dense_entry_limit=dense_entry_limit,
    )


class HilbertModularFormsQsqrt3:
    r"""Full Brandt module of level $(13,\sqrt3-9)$ over $\mathbf Q(\sqrt3)$."""

    def __init__(
        self,
        level: Qsqrt3PrimeIdeal | Iterable[Any] = _LEVEL,
        *,
        dense_entry_limit: Any = 1000000,
    ) -> None:
        if not isinstance(level, Qsqrt3PrimeIdeal):
            data = tuple(level)
            if len(data) != 2:
                raise ValueError("the Q(sqrt(3)) level is specified by (13, 9)")
            level = Qsqrt3PrimeIdeal(data[0], data[1], "13a")
        if level != _LEVEL:
            raise NotImplementedError("the second-field slice implements level 13a")
        self._level = level
        self._dense_entry_limit = _integer(dense_entry_limit, "dense entry limit")
        self._finite_set = _finite_set(self._dense_entry_limit)

    def base_field(self) -> str:
        return "Q(sqrt(3))"

    def level(self) -> Qsqrt3PrimeIdeal:
        return self._level

    def weight(self) -> tuple[int, int]:
        return (2, 2)

    def dimension(self) -> int:
        return self._finite_set.cardinality()

    rank = dimension

    def cuspidal_dimension(self) -> int:
        return self._finite_set.cuspidal_dimension()

    def finite_hecke_set(self) -> QuaternionComponentHeckeSet:
        return self._finite_set

    def ideal_class_components(self) -> tuple[QuaternionIdealComponent, ...]:
        return self._finite_set.components()

    def mass_weights(self) -> tuple[Any, ...]:
        return self._finite_set.mass_weights()

    def eisenstein_basis(self) -> tuple[Any, ...]:
        return self._finite_set.component_eisenstein_basis()

    def is_cuspidal(self, vector: Any) -> bool:
        return self._finite_set.is_cuspidal(vector)

    def hecke_operator(self, index: Any) -> SparseHeckeOperator:
        prime = sqrt3_hecke_prime(index)
        return self._finite_set.hecke_operator(prime.label())

    T = hecke_operator

    def hecke_matrix(self, index: Any) -> Any:
        return self.hecke_operator(index).matrix()

    def cuspidal_operator(self, index: Any) -> ComponentCuspidalHeckeOperator:
        prime = sqrt3_hecke_prime(index)
        return self._finite_set.cuspidal_operator(prime.label())

    def cuspidal_matrix(self, index: Any) -> Any:
        return self.cuspidal_operator(index).matrix()

    def __repr__(self) -> str:
        return "Hilbert Brandt module over Q(sqrt(3)) of level 13a, dimension " + str(
            self.dimension()
        )

    __str__ = __repr__
    toString = __repr__


__all__ = [
    "HilbertModularFormsQsqrt3",
    "Qsqrt3PrimeIdeal",
    "sqrt3_hecke_prime",
    "sqrt3_prime_ideals",
]
