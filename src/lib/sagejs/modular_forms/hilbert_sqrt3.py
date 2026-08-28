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
    ExactHeckeSubspace,
    QuaternionComponentDegeneracyTrace,
    QuaternionComponentHeckeSet,
    QuaternionHeckeCorrespondence,
    QuaternionIdealComponent,
    QuaternionOldNewDecomposition,
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

    def prime_power(self, exponent: Any) -> Qsqrt3PrimePowerLevel:
        return Qsqrt3PrimePowerLevel(self, exponent)

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


class Qsqrt3PrimePowerLevel:
    r"""The compatible level $\mathfrak p^e$ above $13$ in $\mathbf Q(\sqrt3)$."""

    def __init__(self, prime_ideal: Qsqrt3PrimeIdeal, exponent: Any = 1) -> None:
        if not isinstance(prime_ideal, Qsqrt3PrimeIdeal):
            raise TypeError("a Qsqrt3PrimeIdeal is required")
        power = _integer(exponent, "prime-power exponent")
        if power < 1 or power > 2:
            raise NotImplementedError("the checked Q(sqrt(3)) packet supports e=1,2")
        prime = prime_ideal.rational_prime()
        modulus = prime**power
        root = prime_ideal.root()
        current_modulus = prime
        for _step in range(1, power):
            value = root * root - 3
            correction = (
                -(value // current_modulus) * pow(2 * root, prime - 2, prime) % prime
            )
            root += correction * current_modulus
            current_modulus *= prime
        if (root * root - 3) % modulus != 0:
            raise ArithmeticError("the Q(sqrt(3)) Hensel lift is inconsistent")
        self._prime_ideal = prime_ideal
        self._exponent = power
        self._modulus = modulus
        self._root = root % modulus
        runtime.object.freeze(self)

    def prime_ideal(self) -> Qsqrt3PrimeIdeal:
        return self._prime_ideal

    def rational_prime(self) -> int:
        return self._prime_ideal.rational_prime()

    def exponent(self) -> int:
        return self._exponent

    def modulus(self) -> int:
        return self._modulus

    def norm(self) -> int:
        return self._modulus

    def root(self) -> int:
        return self._root

    def basis(self) -> tuple[tuple[int, int], tuple[int, int]]:
        return ((self._modulus, 0), ((-self._root) % self._modulus, 1))

    def lower_level(self) -> Qsqrt3PrimePowerLevel:
        if self._exponent == 1:
            raise ValueError("a prime level has no positive lower exponent")
        return Qsqrt3PrimePowerLevel(self._prime_ideal, self._exponent - 1)

    def fingerprint(self) -> tuple[Any, ...]:
        return (
            "Qsqrt3-prime-power-v1",
            self._prime_ideal.fingerprint(),
            self._exponent,
            self._modulus,
            self._root,
        )

    def __eq__(self, other: object) -> bool:
        return (
            isinstance(other, Qsqrt3PrimePowerLevel)
            and self._prime_ideal == other._prime_ideal
            and self._exponent == other._exponent
        )

    def __repr__(self) -> str:
        return repr(self._prime_ideal) + "^" + str(self._exponent)

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


# One compatible local packet at levels 13a and 13a^2.  These are reductions
# modulo 169 of a single Magma quaternion splitting, so lowering every matrix
# modulo 13 is mathematically meaningful (and is checked by the degeneracy
# publisher).
_POWER_UNIT_MATRICES: tuple[tuple[Matrix2, ...], ...] = (
    (
        (168, 0, 0, 168),
        (51, 111, 111, 119),
        (95, 60, 60, 13),
        (58, 51, 50, 111),
        (36, 107, 107, 132),
        (50, 111, 111, 118),
        (156, 60, 60, 74),
        (132, 62, 62, 36),
        (111, 119, 118, 58),
        (145, 2, 2, 131),
        (82, 120, 120, 87),
        (94, 60, 60, 12),
        (109, 156, 95, 60),
        (131, 167, 167, 145),
        (0, 1, 168, 0),
        (120, 87, 87, 49),
        (60, 75, 12, 109),
        (2, 24, 131, 167),
        (12, 109, 109, 94),
        (60, 74, 13, 109),
        (2, 131, 24, 167),
        (60, 12, 75, 109),
        (62, 37, 36, 107),
        (62, 36, 37, 107),
    ),
    (
        (168, 0, 0, 168),
        (67, 82, 113, 103),
        (125, 133, 163, 45),
        (32, 97, 65, 30),
        (66, 82, 113, 102),
        (45, 36, 6, 125),
        (30, 72, 104, 32),
        (60, 74, 13, 109),
        (131, 167, 167, 145),
        (127, 156, 126, 43),
        (60, 12, 75, 109),
        (82, 120, 120, 87),
        (30, 109, 140, 77),
        (126, 156, 126, 42),
        (163, 95, 63, 6),
        (77, 60, 29, 30),
        (16, 38, 7, 154),
        (154, 131, 162, 16),
        (107, 132, 133, 62),
        (24, 167, 167, 38),
        (101, 58, 27, 68),
        (111, 118, 119, 58),
        (161, 70, 102, 8),
        (54, 107, 138, 115),
    ),
)

_POWER_GOOD_TRANSITIONS: dict[
    str, tuple[int, tuple[tuple[int, int, tuple[Matrix2, ...]], ...]]
] = {
    "2": (
        2,
        (
            (0, 1, ((65, 154, 45, 45), (40, 147, 146, 128), (109, 0, 0, 109))),
            (1, 0, ((126, 43, 42, 13), (102, 87, 56, 66), (168, 0, 0, 168))),
        ),
    ),
    "3": (
        3,
        (
            (
                0,
                1,
                (
                    (154, 110, 111, 125),
                    (89, 59, 60, 79),
                    (41, 142, 143, 127),
                    (142, 128, 127, 26),
                ),
            ),
            (
                1,
                0,
                (
                    (44, 37, 5, 124),
                    (89, 104, 105, 49),
                    (79, 22, 53, 28),
                    (124, 132, 164, 44),
                ),
            ),
        ),
    ),
}

_POWER_LEVEL_TRANSITIONS: tuple[tuple[int, int, tuple[Matrix2, ...]], ...] = (
    (
        0,
        0,
        (
            (23, 10, 73, 86),
            (25, 83, 85, 82),
            (111, 11, 57, 58),
            (106, 154, 155, 1),
            (107, 134, 131, 62),
            (148, 85, 86, 19),
            (148, 133, 26, 130),
            (92, 97, 37, 14),
            (145, 104, 166, 130),
            (45, 146, 148, 61),
            (82, 86, 84, 25),
            (88, 11, 73, 79),
            (130, 99, 39, 38),
            (153, 43, 106, 123),
        ),
    ),
    (
        1,
        1,
        (
            (56, 17, 47, 112),
            (116, 91, 60, 52),
            (148, 168, 28, 127),
            (137, 68, 36, 138),
            (25, 83, 85, 82),
            (111, 11, 57, 58),
            (162, 33, 125, 5),
            (85, 168, 138, 23),
            (124, 131, 165, 44),
            (107, 134, 131, 62),
            (54, 157, 18, 113),
            (104, 35, 65, 3),
            (129, 35, 144, 147),
            (31, 2, 78, 78),
        ),
    ),
)

_POWER_REPRESENTATIVES = {
    1: ((11, 6), (4, 11)),
    2: (
        (76, 88, 41, 47, 91, 90, 142, 173, 165),
        (32, 101, 83, 48, 90, 111, 95, 173, 44),
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


def _reduce_matrix(matrix: Matrix2, modulus: int) -> Matrix2:
    return tuple(value % modulus for value in matrix)  # type: ignore[return-value]


def _power_finite_set(
    exponent: int, dense_entry_limit: Any
) -> QuaternionComponentHeckeSet:
    modulus = 13**exponent
    components = tuple(
        QuaternionIdealComponent(
            "I" + str(index + 1),
            modulus,
            tuple(_reduce_matrix(matrix, modulus) for matrix in units),
            residue_prime=13,
            representatives=_POWER_REPRESENTATIVES[exponent][index],
        )
        for index, units in enumerate(_POWER_UNIT_MATRICES)
    )
    correspondences = []
    for label in ["2", "3"]:
        norm, transitions = _POWER_GOOD_TRANSITIONS[label]
        reduced = []
        for source, target, matrices in transitions:
            reduced.append(
                (
                    source,
                    target,
                    tuple(_reduce_matrix(matrix, modulus) for matrix in matrices),
                )
            )
        correspondences.append(QuaternionHeckeCorrespondence(label, norm, reduced))
    return QuaternionComponentHeckeSet(
        components,
        correspondences,
        dense_entry_limit=dense_entry_limit,
    )


def _power_level_correspondence() -> QuaternionHeckeCorrespondence:
    return QuaternionHeckeCorrespondence("13a", 13, _POWER_LEVEL_TRANSITIONS)


class HilbertModularFormsQsqrt3:
    r"""Full Brandt module of level $(13,\sqrt3-9)$ over $\mathbf Q(\sqrt3)$."""

    def __init__(
        self,
        level: Qsqrt3PrimeIdeal | Qsqrt3PrimePowerLevel | Iterable[Any] = _LEVEL,
        *,
        dense_entry_limit: Any = 1000000,
        _compatible_power_packet: bool = False,
    ) -> None:
        if not isinstance(level, (Qsqrt3PrimeIdeal, Qsqrt3PrimePowerLevel)):
            data = tuple(level)
            if len(data) not in [2, 3]:
                raise ValueError(
                    "the Q(sqrt(3)) level is specified by (13, 9[, exponent])"
                )
            prime_level = Qsqrt3PrimeIdeal(data[0], data[1], "13a")
            level = (
                prime_level
                if len(data) == 2
                else Qsqrt3PrimePowerLevel(prime_level, data[2])
            )
        prime_ideal = (
            level if isinstance(level, Qsqrt3PrimeIdeal) else level.prime_ideal()
        )
        if prime_ideal != _LEVEL:
            raise NotImplementedError("the second-field slice implements level 13a")
        self._level = level
        self._dense_entry_limit = _integer(dense_entry_limit, "dense entry limit")
        self._compatible_power_packet = bool(_compatible_power_packet)
        exponent = 1 if isinstance(level, Qsqrt3PrimeIdeal) else level.exponent()
        if exponent == 1 and not self._compatible_power_packet:
            self._finite_set = _finite_set(self._dense_entry_limit)
        else:
            self._finite_set = _power_finite_set(exponent, self._dense_entry_limit)

    def base_field(self) -> str:
        return "Q(sqrt(3))"

    def level(self) -> Qsqrt3PrimeIdeal | Qsqrt3PrimePowerLevel:
        return self._level

    def level_exponent(self) -> int:
        if isinstance(self._level, Qsqrt3PrimeIdeal):
            return 1
        return self._level.exponent()

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
        if self.level_exponent() == 2 and prime.label() not in ["2", "3"]:
            raise NotImplementedError(
                "the prime-power packet currently records T_2 and T_3"
            )
        return self._finite_set.hecke_operator(prime.label())

    T = hecke_operator

    def hecke_matrix(self, index: Any) -> Any:
        return self.hecke_operator(index).matrix()

    def cuspidal_operator(self, index: Any) -> ComponentCuspidalHeckeOperator:
        prime = sqrt3_hecke_prime(index)
        return self._finite_set.cuspidal_operator(prime.label())

    def cuspidal_matrix(self, index: Any) -> Any:
        return self.cuspidal_operator(index).matrix()

    def compatible_lower_module(self) -> HilbertModularFormsQsqrt3:
        if self.level_exponent() != 2:
            raise ValueError("only level exponent two has an adjacent lower module")
        return HilbertModularFormsQsqrt3(
            Qsqrt3PrimePowerLevel(_LEVEL, 1),
            dense_entry_limit=self._dense_entry_limit,
            _compatible_power_packet=True,
        )

    def degeneracy_maps(
        self,
    ) -> tuple[QuaternionComponentDegeneracyTrace, QuaternionComponentDegeneracyTrace]:
        lower = self.compatible_lower_module()
        identity = QuaternionComponentDegeneracyTrace(
            self._finite_set,
            lower._finite_set,
            dense_entry_limit=self._dense_entry_limit,
        )
        prime = QuaternionComponentDegeneracyTrace(
            self._finite_set,
            lower._finite_set,
            _power_level_correspondence(),
            dense_entry_limit=self._dense_entry_limit,
        )
        return (identity, prime)

    def old_new_decomposition(self) -> QuaternionOldNewDecomposition:
        identity, prime = self.degeneracy_maps()
        decomposition = QuaternionOldNewDecomposition(identity, prime)
        for index in ["2", "3"]:
            if not identity.commutes_with_hecke(index):
                raise ArithmeticError("identity degeneracy is not Hecke equivariant")
            if not prime.commutes_with_hecke(index):
                raise ArithmeticError("prime degeneracy is not Hecke equivariant")
            decomposition.old_subspace().hecke_matrix(index)
            decomposition.new_subspace().hecke_matrix(index)
        return decomposition

    def old_subspace(self) -> ExactHeckeSubspace:
        return self.old_new_decomposition().old_subspace()

    def new_subspace(self) -> ExactHeckeSubspace:
        return self.old_new_decomposition().new_subspace()

    def __repr__(self) -> str:
        level = "13a" if self.level_exponent() == 1 else "13a^2"
        return (
            "Hilbert Brandt module over Q(sqrt(3)) of level "
            + level
            + ", dimension "
            + str(self.dimension())
        )

    __str__ = __repr__
    toString = __repr__


__all__ = [
    "HilbertModularFormsQsqrt3",
    "Qsqrt3PrimeIdeal",
    "Qsqrt3PrimePowerLevel",
    "sqrt3_hecke_prime",
    "sqrt3_prime_ideals",
]
