r"""Sparse icosian Hilbert modular forms over $\mathbf{Q}(\sqrt{5})$.

This module revives the finite-set engine from psage's historically fast
`sqrt5_fast.pyx` implementation in ordinary, strict Python.  At a split
prime level $\mathfrak n$, the basis is

$$
R^\times \backslash \mathbf{P}^1(\mathcal O_F/\mathfrak n),
\qquad F=\mathbf{Q}(\sqrt5),
$$

where $R$ is the icosian maximal order.  The hot representation consists only
of four-entry matrices modulo the rational prime, compact projective indices,
and one immutable orbit lookup table.  It deliberately does not construct a
tower of generic number-field and quaternion objects inside a Hecke row.

The five checked small Hecke sets are exact right-unit-orbit representatives
of reduced norms $2$, $3$, $2+\omega$, $3+\omega$, and $3+2\omega$, with
$\omega^2-\omega-1=0$.  They reproduce the matrices and characteristic
polynomials recorded in William Stein's GPL-licensed psage implementation.
"""

from __future__ import annotations

from typing import Any, Iterable

import sagejs as sage
import sagejs.runtime as runtime

from .sparse_hecke import SparseHeckeOperator

Matrix2 = tuple[int, int, int, int]
ScaledQuaternion = tuple[int, int, int, int, int, int, int, int]


def _global(name: str) -> Any:
    return runtime.reflect.get(runtime.global_object, name)


def _integer(value: Any, label: str) -> int:
    normalized = runtime.normalize_integer(value)
    if runtime.jstype(normalized) != "number" or not runtime.number.isSafeInteger(
        normalized
    ):
        raise TypeError(label + " must be an exact machine integer")
    return runtime.number(normalized)


def _prime(value: Any, label: str = "rational prime") -> int:
    answer = _integer(value, label)
    if answer < 2 or not bool(sage.is_prime(answer)):
        raise ValueError(label + " must be prime")
    return answer


def _sqrt_mod_prime(value: int, prime: int) -> int | None:
    """Return the smaller square root modulo an odd prime, or `None`."""
    residue = value % prime
    if residue == 0:
        return 0
    if pow(residue, (prime - 1) // 2, prime) != 1:
        return None
    if prime % 4 == 3:
        root = pow(residue, (prime + 1) // 4, prime)
        return min(root, prime - root)
    odd = prime - 1
    exponent = 0
    while odd % 2 == 0:
        exponent += 1
        odd //= 2
    nonsquare = 2
    while pow(nonsquare, (prime - 1) // 2, prime) != prime - 1:
        nonsquare += 1
    root = pow(residue, (odd + 1) // 2, prime)
    power = pow(residue, odd, prime)
    correction = pow(nonsquare, odd, prime)
    remaining = exponent
    while power != 1:
        step = 1
        square = power * power % prime
        while square != 1:
            square = square * square % prime
            step += 1
            if step >= remaining:
                raise ArithmeticError("Tonelli--Shanks failed to find a square root")
        factor = pow(correction, 1 << (remaining - step - 1), prime)
        root = root * factor % prime
        correction = factor * factor % prime
        power = power * correction % prime
        remaining = step
    return min(root, prime - root)


def _matrix_add(left: Matrix2, right: Matrix2, modulus: int) -> Matrix2:
    return (
        (left[0] + right[0]) % modulus,
        (left[1] + right[1]) % modulus,
        (left[2] + right[2]) % modulus,
        (left[3] + right[3]) % modulus,
    )


def _matrix_scale(scalar: int, matrix: Matrix2, modulus: int) -> Matrix2:
    return (
        scalar * matrix[0] % modulus,
        scalar * matrix[1] % modulus,
        scalar * matrix[2] % modulus,
        scalar * matrix[3] % modulus,
    )


def _matrix_product(left: Matrix2, right: Matrix2, modulus: int) -> Matrix2:
    a, b, c, d = left
    e, f, g, h = right
    return (
        (a * e + b * g) % modulus,
        (a * f + b * h) % modulus,
        (c * e + d * g) % modulus,
        (c * f + d * h) % modulus,
    )


def _matrix_inverse(matrix: Matrix2, modulus: int) -> Matrix2:
    a, b, c, d = matrix
    determinant = (a * d - b * c) % modulus
    if determinant == 0:
        raise ZeroDivisionError("the reduced quaternion matrix is singular")
    inverse = pow(determinant, modulus - 2, modulus)
    return (
        d * inverse % modulus,
        -b * inverse % modulus,
        -c * inverse % modulus,
        a * inverse % modulus,
    )


class Qsqrt5PrimeIdeal:
    r"""A degree-one prime $\mathfrak p=(p,\omega-r)$ of $\mathbf Q(\sqrt5)$."""

    def __init__(self, rational_prime: Any, root: Any) -> None:
        prime = _prime(rational_prime)
        if prime == 2:
            raise ValueError("2 is inert in Q(sqrt(5)), not a degree-one prime")
        residue = _integer(root, "omega residue") % prime
        if (residue * residue - residue - 1) % prime != 0:
            raise ValueError("omega residue must satisfy r^2-r-1 modulo p")
        self._prime = prime
        self._root = residue
        runtime.object.freeze(self)

    @classmethod
    def from_generator(
        cls,
        rational_prime: Any,
        constant: Any,
        omega_coefficient: Any,
    ) -> Qsqrt5PrimeIdeal:
        r"""Construct $(a+b\omega)$ from the relation $a+br=0\pmod p$."""
        prime = _prime(rational_prime)
        a = _integer(constant, "generator constant") % prime
        b = _integer(omega_coefficient, "generator omega coefficient") % prime
        if b == 0:
            raise ValueError("a degree-one generator needs nonzero omega coefficient")
        root = -a * pow(b, prime - 2, prime) % prime
        return cls(prime, root)

    def rational_prime(self) -> int:
        return self._prime

    def norm(self) -> int:
        return self._prime

    def omega_residue(self) -> int:
        return self._root

    def conjugate(self) -> Qsqrt5PrimeIdeal:
        return Qsqrt5PrimeIdeal(self._prime, 1 - self._root)

    def contains(self, constant: Any, omega_coefficient: Any = 0) -> bool:
        a = _integer(constant, "constant")
        b = _integer(omega_coefficient, "omega coefficient")
        return (a + b * self._root) % self._prime == 0

    def fingerprint(self) -> tuple[str, int, int]:
        return ("Qsqrt5-split-prime-v1", self._prime, self._root)

    def __eq__(self, other: object) -> bool:
        return (
            isinstance(other, Qsqrt5PrimeIdeal)
            and self._prime == other._prime
            and self._root == other._root
        )

    def __hash__(self) -> int:
        return hash((self._prime, self._root))

    def __repr__(self) -> str:
        return (
            "Prime ideal ("
            + str(self._prime)
            + ", omega - "
            + str(self._root)
            + ") of Q(sqrt(5))"
        )

    __str__ = __repr__
    toString = __repr__


def sqrt5_prime_ideals(rational_prime: Any) -> tuple[Qsqrt5PrimeIdeal, ...]:
    """Return the degree-one primes above a split or ramified prime."""
    prime = _prime(rational_prime)
    if prime == 2:
        return ()
    square_root = _sqrt_mod_prime(5, prime)
    if square_root is None:
        return ()
    inverse_two = pow(2, prime - 2, prime)
    roots = sorted(
        {
            (1 + square_root) * inverse_two % prime,
            (1 - square_root) * inverse_two % prime,
        }
    )
    return tuple(Qsqrt5PrimeIdeal(prime, root) for root in roots)


class IcosianLocalSplitting:
    r"""A checked local splitting $R\to M_2(\mathbf F_p)$ at a split level."""

    def __init__(self, prime_ideal: Qsqrt5PrimeIdeal) -> None:
        if not isinstance(prime_ideal, Qsqrt5PrimeIdeal):
            raise TypeError("a Qsqrt5PrimeIdeal is required")
        modulus = prime_ideal.rational_prime()
        if modulus == 2:
            raise NotImplementedError("characteristic-two local splitting")
        image_i: Matrix2 = (0, modulus - 1, 1, 0)
        image_j: Matrix2 | None = None
        for upper_right in range(1, modulus):
            root = _sqrt_mod_prime(-1 - upper_right * upper_right, modulus)
            if root is None:
                continue
            diagonal = -root % modulus
            lower_left = (
                (-1 - diagonal * diagonal) * pow(upper_right, modulus - 2, modulus)
            ) % modulus
            image_j = (diagonal, upper_right, lower_left, -diagonal % modulus)
            break
        if image_j is None:
            raise ArithmeticError("failed to construct the local quaternion splitting")
        image_k = _matrix_product(image_i, image_j, modulus)
        minus_identity: Matrix2 = (modulus - 1, 0, 0, modulus - 1)
        if _matrix_product(image_i, image_i, modulus) != minus_identity:
            raise ArithmeticError("the local image of i does not square to -1")
        if _matrix_product(image_j, image_j, modulus) != minus_identity:
            raise ArithmeticError("the local image of j does not square to -1")
        if _matrix_product(image_j, image_i, modulus) != _matrix_scale(
            -1, image_k, modulus
        ):
            raise ArithmeticError("the local images of i and j do not anticommute")
        self._ideal = prime_ideal
        self._modulus = modulus
        self._identity: Matrix2 = (1, 0, 0, 1)
        self._i = image_i
        self._j = image_j
        self._k = image_k
        runtime.object.freeze(self)

    def prime_ideal(self) -> Qsqrt5PrimeIdeal:
        return self._ideal

    def modulus(self) -> int:
        return self._modulus

    def basis_images(self) -> tuple[Matrix2, Matrix2, Matrix2]:
        return (self._i, self._j, self._k)

    def quaternion_matrix(
        self,
        doubled_coordinates: Iterable[Any],
        *,
        inverse: bool = False,
    ) -> Matrix2:
        r"""Map a quaternion whose eight $\mathbf Z$ coordinates were doubled."""
        data = tuple(
            _integer(value, "scaled quaternion coordinate")
            for value in doubled_coordinates
        )
        if len(data) != 8:
            raise ValueError("a scaled quaternion needs eight integer coordinates")
        root = self._ideal.omega_residue()
        half = pow(2, self._modulus - 2, self._modulus)
        scalars = tuple(
            (data[index] + data[index + 1] * root) * half % self._modulus
            for index in range(0, 8, 2)
        )
        answer = _matrix_add(
            _matrix_add(
                _matrix_scale(scalars[0], self._identity, self._modulus),
                _matrix_scale(scalars[1], self._i, self._modulus),
                self._modulus,
            ),
            _matrix_add(
                _matrix_scale(scalars[2], self._j, self._modulus),
                _matrix_scale(scalars[3], self._k, self._modulus),
                self._modulus,
            ),
            self._modulus,
        )
        if inverse:
            return _matrix_inverse(answer, self._modulus)
        return answer

    def fingerprint(self) -> tuple[Any, ...]:
        return (
            "icosian-local-splitting-v1",
            self._ideal.fingerprint(),
            self._i,
            self._j,
            self._k,
        )


_ICOSIAN_UNIT_GENERATORS: tuple[ScaledQuaternion, ...] = (
    (0, 0, 2, 0, 0, 0, 0, 0),
    (0, 0, 0, 0, 2, 0, 0, 0),
    (0, 0, 0, 0, 0, 0, 2, 0),
    (-1, 0, 1, 0, 1, 0, 1, 0),
    (0, 0, 1, 0, 0, 1, 1, -1),
)


# One representative for every right-unit orbit of norm pi.  Each record is
# the eight integer coefficients of twice q0+q1*i+q2*j+q3*k, ordered as the
# constant and omega coefficient of q0, q1, q2, q3.
_HECKE_REPRESENTATIVES: dict[tuple[int, int], tuple[ScaledQuaternion, ...]] = {
    (2, 0): (
        (-1, -1, 0, 0, -2, 1, 1, 0),
        (-1, -1, -1, 1, 1, -1, -1, 1),
        (-1, -1, 1, -1, 1, -1, -1, 1),
        (-1, -1, 2, -1, -1, 0, 0, 0),
        (-1, -1, -2, 1, -1, 0, 0, 0),
    ),
    (3, 0): (
        (-1, -1, 2, -2, 0, -1, -1, 0),
        (-1, -1, 2, 0, -2, 1, 1, 0),
        (-1, -1, 2, -1, 1, -2, 0, 0),
        (-1, -1, 2, 0, 2, -1, -1, 0),
        (-1, -1, 1, 0, -2, 0, 2, -1),
        (-1, -1, 2, -1, -1, 0, 2, 0),
        (-1, -1, -1, 0, -2, 0, 2, -1),
        (-1, -1, 0, 0, 2, -1, -1, 2),
        (-1, 0, 2, -2, -1, -1, 0, -1),
        (-1, 0, 1, 1, 2, -1, -2, 0),
    ),
    (2, 1): (
        (-1, -1, 2, 0, 0, -1, -1, 0),
        (-1, -1, 1, 0, -2, 0, 0, -1),
        (-1, -1, 1, -1, -1, -1, -1, 1),
        (-1, -1, 1, 0, -2, 0, 0, 1),
        (-1, -1, 1, -1, -1, -1, 1, -1),
        (-1, -1, 2, 0, 0, -1, 1, 0),
    ),
    (3, 1): (
        (-1, -1, 2, -1, -1, 0, 0, -2),
        (-1, -1, 1, 0, 0, -2, -2, 1),
        (-1, -1, 3, 0, 0, 0, 0, -1),
        (-1, -1, 1, -2, -2, 0, 0, -1),
        (-1, -1, 3, 0, 0, 0, 0, 1),
        (-1, -1, -1, 0, 0, -2, -2, 1),
        (-1, -1, 0, 2, 2, -1, -1, 0),
        (-1, -1, -2, 1, -1, 0, 0, 2),
        (-1, 0, 2, -1, 0, -2, -1, -1),
        (-1, 0, 1, -1, -2, -1, 2, 0),
        (-1, 1, 2, -1, -1, -2, 0, 0),
        (-1, 1, 2, 1, 1, 0, -2, 0),
    ),
    (3, 2): (
        (-1, -1, 2, -1, -1, -2, 0, 0),
        (-1, -1, 2, 0, -2, -1, 1, 0),
        (-1, -1, 0, 0, -2, -1, 1, -2),
        (-1, -1, -2, 0, -2, -1, -1, 0),
        (-1, -1, 2, 1, -1, 0, 2, 0),
        (-1, -1, 1, -2, 0, -2, 0, 1),
        (-1, -1, 1, 0, -2, 0, 2, 1),
        (-1, -1, -2, 1, -1, -2, 0, 0),
        (-1, -1, 0, 1, 1, -2, 0, 2),
        (-1, -1, -2, 0, -2, -1, 1, 0),
        (-1, 0, 1, -1, 0, -3, 0, 0),
        (0, -1, -1, 0, -3, -1, 0, 0),
    ),
}


class Qsqrt5HeckePrime:
    """A checked small prime ideal used as a Hilbert Hecke index."""

    def __init__(self, constant: Any, omega_coefficient: Any, label: str) -> None:
        a = _integer(constant, "Hecke-prime generator constant")
        b = _integer(omega_coefficient, "Hecke-prime omega coefficient")
        if (a, b) not in _HECKE_REPRESENTATIVES:
            raise NotImplementedError("this small Q(sqrt(5)) Hecke prime is unknown")
        norm = a * a + a * b - b * b
        if norm < 2 or len(_HECKE_REPRESENTATIVES[(a, b)]) != norm + 1:
            raise ValueError(
                "the generator does not have the recorded prime-ideal norm"
            )
        self._generator = (a, b)
        self._norm = norm
        self._label = label
        runtime.object.freeze(self)

    def generator(self) -> tuple[int, int]:
        return self._generator

    def norm(self) -> int:
        return self._norm

    def label(self) -> str:
        return self._label

    def representatives(self) -> tuple[ScaledQuaternion, ...]:
        return _HECKE_REPRESENTATIVES[self._generator]

    def __eq__(self, other: object) -> bool:
        return (
            isinstance(other, Qsqrt5HeckePrime) and self._generator == other._generator
        )

    def __hash__(self) -> int:
        return hash(self._generator)

    def __repr__(self) -> str:
        return self._label

    __str__ = __repr__
    toString = __repr__


_SMALL_HECKE_PRIMES: dict[str, Qsqrt5HeckePrime] = {
    "2": Qsqrt5HeckePrime(2, 0, "prime above 2 (norm 4)"),
    "3": Qsqrt5HeckePrime(3, 0, "prime above 3 (norm 9)"),
    "5": Qsqrt5HeckePrime(2, 1, "prime (2 + omega) above 5"),
    "11a": Qsqrt5HeckePrime(3, 1, "prime (3 + omega) above 11"),
    "11b": Qsqrt5HeckePrime(3, 2, "prime (3 + 2*omega) above 11"),
}


def sqrt5_hecke_prime(index: Any) -> Qsqrt5HeckePrime:
    """Resolve one of the exact small Hecke primes $2,3,5,11a,11b$."""
    if isinstance(index, Qsqrt5HeckePrime):
        return index
    if isinstance(index, Qsqrt5PrimeIdeal):
        if index.rational_prime() != 11:
            raise NotImplementedError(
                "degree-one ideal indices are currently implemented above 11"
            )
        if index.contains(3, 1):
            return _SMALL_HECKE_PRIMES["11a"]
        if index.contains(3, 2):
            return _SMALL_HECKE_PRIMES["11b"]
        raise ArithmeticError("the prime above 11 has no recognized generator")
    key = str(index)
    if key not in _SMALL_HECKE_PRIMES:
        raise NotImplementedError(
            "implemented Q(sqrt(5)) Hecke indices are 2, 3, 5, 11a, and 11b"
        )
    return _SMALL_HECKE_PRIMES[key]


class IcosianOrbitSet:
    r"""The compact finite set $R^\times\backslash\mathbf P^1(\mathbf F_p)$."""

    def __init__(self, splitting: IcosianLocalSplitting) -> None:
        if not isinstance(splitting, IcosianLocalSplitting):
            raise TypeError("an IcosianLocalSplitting is required")
        self._splitting = splitting
        modulus = splitting.modulus()
        identity: Matrix2 = (1, 0, 0, 1)
        generators = tuple(
            splitting.quaternion_matrix(generator)
            for generator in _ICOSIAN_UNIT_GENERATORS
        )
        # Use equality-based list membership here.  These are only 120 four-word
        # records, and this also avoids depending on a host tuple-hash identity.
        units: list[Matrix2] = [identity]
        frontier: list[Matrix2] = [identity]
        position = 0
        while position < len(frontier):
            current = frontier[position]
            for generator in generators:
                product = _matrix_product(current, generator, modulus)
                if product not in units:
                    units.append(product)
                    frontier.append(product)
                    if len(frontier) > 120:
                        raise ArithmeticError(
                            "the reduced icosian unit group is too large"
                        )
            position += 1
        if len(units) != 120:
            raise ArithmeticError(
                "the reduced icosian unit group has order "
                + str(len(units))
                + ", expected 120"
            )
        table = [-1 for _ in range(modulus + 1)]
        representatives = []
        orbit_sizes = []
        for point in range(modulus + 1):
            if table[point] >= 0:
                continue
            orbit_index = len(representatives)
            orbit = {self._act(point, unit) for unit in units}
            if 120 % len(orbit) != 0:
                raise ArithmeticError("an icosian orbit size does not divide 120")
            for target in orbit:
                if table[target] not in [-1, orbit_index]:
                    raise ArithmeticError("icosian projective orbits are not disjoint")
                table[target] = orbit_index
            representatives.append(point)
            orbit_sizes.append(len(orbit))
        if any(value < 0 for value in table):
            raise ArithmeticError("the icosian orbit table is incomplete")
        self._units = tuple(sorted(units))
        self._table = tuple(table)
        self._representatives = tuple(representatives)
        self._orbit_sizes = tuple(orbit_sizes)

    def _coordinates(self, point: int) -> tuple[int, int]:
        if point == 0:
            return (0, 1)
        return (1, point - 1)

    def _standard_index(self, first: int, second: int) -> int:
        modulus = self._splitting.modulus()
        first %= modulus
        second %= modulus
        if first == 0:
            if second == 0:
                raise ArithmeticError("the zero vector has no projective class")
            return 0
        return 1 + second * pow(first, modulus - 2, modulus) % modulus

    def _act(self, point: int, matrix: Matrix2) -> int:
        first, second = self._coordinates(point)
        a, b, c, d = matrix
        return self._standard_index(first * a + second * c, first * b + second * d)

    def cardinality(self) -> int:
        return len(self._representatives)

    __len__ = cardinality

    def projective_cardinality(self) -> int:
        return len(self._table)

    def representatives(self) -> tuple[tuple[int, int], ...]:
        return tuple(self._coordinates(point) for point in self._representatives)

    def standard_representative_indices(self) -> tuple[int, ...]:
        return self._representatives

    def standard_to_orbit_table(self) -> tuple[int, ...]:
        return self._table

    def orbit_sizes(self) -> tuple[int, ...]:
        return self._orbit_sizes

    def stabilizer_orders(self) -> tuple[int, ...]:
        return tuple(120 // size for size in self._orbit_sizes)

    def hecke_row(
        self, prime: Qsqrt5HeckePrime, row: Any
    ) -> tuple[tuple[int, int], ...]:
        if not isinstance(prime, Qsqrt5HeckePrime):
            raise TypeError("a Qsqrt5HeckePrime is required")
        index = _integer(row, "basis index")
        if index < 0 or index >= self.cardinality():
            raise IndexError("basis index is out of range")
        representative = self._representatives[index]
        counts: dict[int, int] = {}
        for quaternion in prime.representatives():
            matrix = self._splitting.quaternion_matrix(quaternion, inverse=True)
            target = self._table[self._act(representative, matrix)]
            counts[target] = counts.get(target, 0) + 1
        if sum(counts.values()) != prime.norm() + 1:
            raise ArithmeticError("a Hilbert Hecke row has the wrong degree")
        return tuple((target, counts[target]) for target in sorted(counts))

    def __repr__(self) -> str:
        return (
            "The "
            + str(self.cardinality())
            + " icosian orbits on P^1(F_"
            + str(self._splitting.modulus())
            + ")"
        )

    __str__ = __repr__
    toString = __repr__


class HilbertModularFormsQsqrt5:
    """Parallel weight $(2,2)$ icosian forms at split prime level."""

    def __init__(
        self,
        level: Qsqrt5PrimeIdeal | tuple[Any, Any],
        *,
        dense_entry_limit: Any = 1000000,
    ) -> None:
        if isinstance(level, tuple) and len(level) == 2:
            level = Qsqrt5PrimeIdeal(level[0], level[1])
        if not isinstance(level, Qsqrt5PrimeIdeal):
            raise TypeError("level must be Qsqrt5PrimeIdeal or (prime, omega residue)")
        if level.rational_prime() < 7:
            raise NotImplementedError("the first icosian slice uses split levels >= 7")
        limit = _integer(dense_entry_limit, "dense entry limit")
        if limit < 0:
            raise ValueError("dense entry limit must be nonnegative")
        self._level = level
        self._dense_entry_limit = limit
        self._splitting = IcosianLocalSplitting(level)
        self._finite_set = IcosianOrbitSet(self._splitting)
        self._operators: dict[tuple[int, int], SparseHeckeOperator] = {}

    def base_field(self) -> str:
        return "Q(sqrt(5))"

    def level(self) -> Qsqrt5PrimeIdeal:
        return self._level

    def weight(self) -> tuple[int, int]:
        return (2, 2)

    def dimension(self) -> int:
        return self._finite_set.cardinality()

    rank = dimension

    def finite_hecke_set(self) -> IcosianOrbitSet:
        return self._finite_set

    def local_splitting(self) -> IcosianLocalSplitting:
        return self._splitting

    def orbit_representatives(self) -> tuple[tuple[int, int], ...]:
        return self._finite_set.representatives()

    def orbit_sizes(self) -> tuple[int, ...]:
        return self._finite_set.orbit_sizes()

    def stabilizer_orders(self) -> tuple[int, ...]:
        return self._finite_set.stabilizer_orders()

    def mass_weights(self) -> tuple[Any, ...]:
        return tuple(sage.QQ(1) / sage.QQ(value) for value in self.stabilizer_orders())

    def eisenstein_vector(self) -> Any:
        return _global("vector")(sage.ZZ, [1 for _ in range(self.dimension())])

    def mass_inner_product(self, left: Any, right: Any) -> Any:
        left_entries = list(left)
        right_entries = list(right)
        if (
            len(left_entries) != self.dimension()
            or len(right_entries) != self.dimension()
        ):
            raise ValueError("mass-pairing vectors have the wrong length")
        total = sage.QQ(0)
        for position, mass in enumerate(self.mass_weights()):
            total += (
                mass
                * sage.QQ(left_entries[position])
                * sage.QQ(right_entries[position])
            )
        return total

    def is_cuspidal(self, vector: Any) -> bool:
        return self.mass_inner_product(vector, self.eisenstein_vector()) == 0

    def _construct_operator(self, prime: Qsqrt5HeckePrime) -> None:
        key = prime.generator()
        if key in self._operators:
            return
        row_offsets = [0]
        columns = []
        values = []
        for row in range(self.dimension()):
            for column, multiplicity in self._finite_set.hecke_row(prime, row):
                columns.append(column)
                values.append(multiplicity)
            row_offsets.append(len(columns))
        operator = SparseHeckeOperator(
            sage.ZZ,
            self.dimension(),
            self.dimension(),
            row_offsets,
            columns,
            values,
            index=prime,
            name="Sparse Hilbert Hecke operator T_(" + prime.label() + ")",
            dense_entry_limit=self._dense_entry_limit,
        )
        expected = tuple(prime.norm() + 1 for _ in range(self.dimension()))
        if operator.row_sums() != expected:
            raise ArithmeticError("Hilbert Hecke row sums are inconsistent")
        stabilizers = self.stabilizer_orders()
        for row in range(self.dimension()):
            for column, multiplicity in operator.row(row):
                opposite = int(operator[column, row])
                if multiplicity * stabilizers[column] != opposite * stabilizers[row]:
                    raise ArithmeticError("Hilbert Hecke mass adjointness failed")
        for previous in self._operators.values():
            if not operator.commutes_with(previous):
                raise ArithmeticError("good Hilbert Hecke operators do not commute")
        self._operators[key] = operator

    def hecke_operator(self, index: Any) -> SparseHeckeOperator:
        prime = sqrt5_hecke_prime(index)
        if self._level.contains(*prime.generator()):
            raise NotImplementedError("Hecke operators at primes dividing the level")
        self._construct_operator(prime)
        return self._operators[prime.generator()]

    T = hecke_operator

    def hecke_row(self, index: Any, row: Any) -> tuple[tuple[int, int], ...]:
        return self.hecke_operator(index).row(row)

    def hecke_matrix(self, index: Any) -> Any:
        return self.hecke_operator(index).matrix()

    def __repr__(self) -> str:
        return (
            "Hilbert modular forms of parallel weight (2,2) over Q(sqrt(5)), "
            + "level norm "
            + str(self._level.norm())
            + ", dimension "
            + str(self.dimension())
        )

    __str__ = __repr__
    toString = __repr__


IcosianModularForms = HilbertModularFormsQsqrt5


__all__ = [
    "HilbertModularFormsQsqrt5",
    "IcosianLocalSplitting",
    "IcosianModularForms",
    "IcosianOrbitSet",
    "Qsqrt5HeckePrime",
    "Qsqrt5PrimeIdeal",
    "sqrt5_hecke_prime",
    "sqrt5_prime_ideals",
]
