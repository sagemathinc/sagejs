r"""Exact definite quaternion algebras and integral orders over $\mathbf Q$.

The implementation is intentionally small and source-transparent.  Quaternion
elements use four rational coordinates in the basis $1,i,j,ij$.  Orders are
normalized rank-four rational lattices.  Maximal orders are obtained by exact
prime-index overorder saturation, so the construction is not tied to prime
quaternion discriminant.

The discriminant-to-Hilbert-symbol construction follows the algorithm of
Gonzalo Tornaria used by SageMath's `hilbert_conductor_inverse`.  The
overorder search is the elementary definite rational specialization of the
standard maximal-order saturation algorithm.
"""

from __future__ import annotations

from itertools import product
from typing import Any, Iterable, Iterator

import sagejs as sage
import sagejs.runtime as runtime


def _global(name: str) -> Any:
    return runtime.reflect.get(runtime.global_object, name)


def _integer(value: Any, label: str) -> int:
    normalized = runtime.normalize_integer(value)
    if runtime.jstype(normalized) != "number" or not runtime.number.isSafeInteger(
        normalized
    ):
        raise TypeError(label + " must be an exact machine integer")
    return runtime.number(normalized)


def _gcd(left: int, right: int) -> int:
    left = abs(left)
    right = abs(right)
    while right:
        left, right = right, left % right
    return left


def _lcm(left: int, right: int) -> int:
    if left == 0 or right == 0:
        return 0
    return abs(left // _gcd(left, right) * right)


def _valuation(value: int, prime: int) -> int:
    value = abs(value)
    answer = 0
    while value and value % prime == 0:
        value //= prime
        answer += 1
    return answer


def _integer_sqrt(value: Any) -> Any:
    integer = sage.ZZ(value)
    if integer < 0:
        raise ValueError("an integer square root needs a nonnegative argument")
    if integer < 2:
        return integer
    current = integer
    next_value = (current + 1) // 2
    while next_value < current:
        current = next_value
        next_value = (current + integer // current) // 2
    return current


def _factorization(value: int) -> tuple[tuple[int, int], ...]:
    return tuple(
        (runtime.number(prime), runtime.number(exponent))
        for prime, exponent in sage.factor(value)
    )


def _next_prime(value: int) -> int:
    candidate = value + 1
    while not sage.is_prime(candidate):
        candidate += 1
    return candidate


def _squarefree(value: int) -> bool:
    return all(exponent == 1 for _prime, exponent in _factorization(value))


def _moebius_squarefree(value: int) -> int:
    factors = _factorization(value)
    if any(exponent != 1 for _prime, exponent in factors):
        return 0
    return -1 if len(factors) % 2 else 1


def _kronecker(numerator: int, denominator: int) -> int:
    return runtime.number(_global("kronecker")(numerator, denominator))


def _hilbert_symbol(a: int, b: int, prime: int) -> int:
    """Return the rational Hilbert symbol $(a,b)_p$ for finite `prime`."""

    if prime == 2:
        alpha = _valuation(a, 2)
        beta = _valuation(b, 2)
        unit_a = a // (2**alpha)
        unit_b = b // (2**beta)
        exponent = (
            ((unit_a - 1) // 2) * ((unit_b - 1) // 2)
            + alpha * ((unit_b * unit_b - 1) // 8)
            + beta * ((unit_a * unit_a - 1) // 8)
        )
        return -1 if exponent % 2 else 1
    alpha = _valuation(a, prime)
    beta = _valuation(b, prime)
    unit_a = a // (prime**alpha)
    unit_b = b // (prime**beta)
    value = -1 if (alpha * beta * ((prime - 1) // 2)) % 2 else 1
    if beta % 2:
        value *= _kronecker(unit_a, prime)
    if alpha % 2:
        value *= _kronecker(unit_b, prime)
    return value


def _hilbert_discriminant(a: int, b: int) -> int:
    candidate_primes = {2}
    for prime, _exponent in _factorization(abs(a * b)):
        candidate_primes.add(prime)
    answer = 1
    for prime in sorted(candidate_primes):
        if _hilbert_symbol(a, b, prime) == -1:
            answer *= prime
    return answer


def _hilbert_conductor_inverse(discriminant: int) -> tuple[int, int]:
    if discriminant <= 0:
        raise ValueError("quaternion discriminant must be positive")
    if not _squarefree(discriminant):
        raise ValueError("quaternion discriminant must be squarefree")
    if discriminant == 1:
        return (-1, 1)
    if discriminant == 2:
        return (-1, -1)
    if sage.is_prime(discriminant):
        if discriminant % 4 == 3:
            return (-1, -discriminant)
        if discriminant % 8 == 5:
            return (-2, -discriminant)
        auxiliary = 3
        while auxiliary % 4 != 3 or _kronecker(discriminant, auxiliary) != -1:
            auxiliary = _next_prime(auxiliary)
        return (-auxiliary, -discriminant)
    mu = _moebius_squarefree(discriminant)
    signed = mu * discriminant
    if discriminant % 2 == 0 and signed % 16 != 2:
        signed //= 2
    auxiliary = 1
    while _hilbert_discriminant(-auxiliary, signed) != discriminant:
        auxiliary += 1
    if signed % auxiliary == 0:
        signed //= auxiliary
    return (-auxiliary, signed)


def _rational_parts(value: Any) -> tuple[Any, Any]:
    rational = sage.QQ(value)
    return rational._numerator, rational._denominator


def _canonical_lattice(rows: Iterable[Iterable[Any]]) -> tuple[tuple[Any, ...], ...]:
    rational_rows: list[list[Any]] = []
    denominator = 1
    for source in rows:
        row = [sage.QQ(value) for value in source]
        if len(row) != 4:
            raise ValueError("a quaternion lattice row must have length four")
        rational_rows.append(row)
        for value in row:
            _numerator, entry_denominator = _rational_parts(value)
            denominator = _lcm(denominator, runtime.number(entry_denominator))
    if not rational_rows:
        return ()
    integer_rows = []
    for row in rational_rows:
        integer_row = []
        for value in row:
            scaled = value * denominator
            numerator, entry_denominator = _rational_parts(scaled)
            if entry_denominator != 1:
                raise ArithmeticError("failed to clear quaternion lattice denominator")
            integer_row.append(numerator)
        integer_rows.append(integer_row)
    hermite = _global("matrix")(sage.ZZ, integer_rows).hermite_form(
        include_zero_rows=False
    )
    if hermite.nrows() != 4:
        raise ValueError("a quaternion order or ideal must have rank four")
    return tuple(
        tuple(sage.QQ(value) / denominator for value in row) for row in hermite.rows()
    )


def _basis_matrix(rows: tuple[tuple[Any, ...], ...]) -> Any:
    return _global("matrix")(sage.QQ, rows)


def _lattice_contains(
    basis_rows: tuple[tuple[Any, ...], ...], row: Iterable[Any]
) -> bool:
    coordinates = (
        _global("vector")(sage.QQ, list(row)) * _basis_matrix(basis_rows).inverse()
    )
    return all(value._denominator == 1 for value in coordinates)


def _lattice_dual(
    basis_rows: tuple[tuple[Any, ...], ...],
) -> tuple[tuple[Any, ...], ...]:
    return _canonical_lattice(_basis_matrix(basis_rows).inverse().transpose().rows())


def _lattice_intersection(
    lattices: Iterable[tuple[tuple[Any, ...], ...]],
) -> tuple[tuple[Any, ...], ...]:
    entries = tuple(lattices)
    if not entries:
        raise ValueError("at least one lattice is required")
    dual_generators: list[tuple[Any, ...]] = []
    for lattice in entries:
        dual_generators.extend(_lattice_dual(lattice))
    return _lattice_dual(_canonical_lattice(dual_generators))


def _projective_vectors(prime: int) -> Iterator[tuple[int, int, int, int]]:
    for pivot in range(4):
        tail = 3 - pivot
        for suffix in product(range(prime), repeat=tail):
            yield tuple([0 for _index in range(pivot)] + [1] + list(suffix))  # type: ignore[return-value]


@runtime.lightweight_math_class
class QuaternionElement(sage.Element):
    """An exact element of a rational quaternion algebra."""

    def __init__(self, parent: RationalQuaternionAlgebra, coordinates: Any) -> None:
        self._parent = parent
        if isinstance(coordinates, QuaternionElement):
            if coordinates.parent() is not parent:
                raise TypeError("quaternion elements have different parents")
            coordinates = coordinates._coordinates
        elif not isinstance(coordinates, (list, tuple)):
            coordinates = (coordinates, 0, 0, 0)
        if len(coordinates) != 4:
            raise ValueError("a quaternion element needs four coordinates")
        self._coordinates = tuple(sage.QQ(value) for value in coordinates)

    def parent(self) -> RationalQuaternionAlgebra:
        return self._parent

    def coefficient_tuple(self) -> tuple[Any, Any, Any, Any]:
        return self._coordinates  # type: ignore[return-value]

    coefficients = coefficient_tuple

    def __iter__(self) -> Iterator[Any]:
        return iter(self._coordinates)

    def __getitem__(self, index: Any) -> Any:
        return self._coordinates[index]

    def __add__(self, other: Any) -> QuaternionElement:
        right = self._parent(other)
        return self._parent(
            tuple(left + value for left, value in zip(self, right, strict=True))
        )

    def _add_(self, other: Any) -> QuaternionElement:
        return self.__add__(other)

    def __sub__(self, other: Any) -> QuaternionElement:
        right = self._parent(other)
        return self._parent(
            tuple(left - value for left, value in zip(self, right, strict=True))
        )

    def _sub_(self, other: Any) -> QuaternionElement:
        return self.__sub__(other)

    def __neg__(self) -> QuaternionElement:
        return self._parent(tuple(-value for value in self))

    def _neg_(self) -> QuaternionElement:
        return self.__neg__()

    def __mul__(self, other: Any) -> QuaternionElement:
        if not isinstance(other, QuaternionElement):
            scalar = sage.QQ(other)
            return self._parent(tuple(value * scalar for value in self))
        if other.parent() is not self._parent:
            raise TypeError("quaternion elements have different parents")
        x0, x1, x2, x3 = self._coordinates
        y0, y1, y2, y3 = other._coordinates
        a = self._parent.a()
        b = self._parent.b()
        return self._parent(
            (
                x0 * y0 + a * x1 * y1 + b * x2 * y2 - a * b * x3 * y3,
                x0 * y1 + x1 * y0 - b * x2 * y3 + b * x3 * y2,
                x0 * y2 + x2 * y0 + a * x1 * y3 - a * x3 * y1,
                x0 * y3 + x3 * y0 + x1 * y2 - x2 * y1,
            )
        )

    def __rmul__(self, other: Any) -> QuaternionElement:
        if isinstance(other, QuaternionElement):
            return other.__mul__(self)
        scalar = sage.QQ(other)
        return self._parent(tuple(scalar * value for value in self))

    def _mul_(self, other: Any) -> QuaternionElement:
        return self.__mul__(other)

    def _lmul_(self, other: Any) -> QuaternionElement:
        return self.__rmul__(other)

    def _rmul_(self, other: Any) -> QuaternionElement:
        return self.__mul__(other)

    def __truediv__(self, scalar: Any) -> QuaternionElement:
        return self * (sage.QQ(1) / scalar)

    def _div_(self, scalar: Any) -> QuaternionElement:
        return self.__truediv__(scalar)

    def _sage_binop_(self, operator: str, other: Any, reflected: bool) -> Any:
        if operator == "mul":
            return self.__rmul__(other) if reflected else self.__mul__(other)
        if operator == "truediv" and not reflected:
            return self.__truediv__(other)
        if operator == "add" and not reflected:
            return self.__add__(other)
        if operator == "sub" and not reflected:
            return self.__sub__(other)
        raise TypeError("unsupported quaternion operation " + operator)

    def __pow__(self, exponent: Any) -> QuaternionElement:
        power = _integer(exponent, "quaternion exponent")
        if power < 0:
            return (self.inverse()) ** (-power)
        answer = self._parent.one()
        base = self
        while power:
            if power % 2:
                answer = answer * base
            base = base * base
            power //= 2
        return answer

    def conjugate(self) -> QuaternionElement:
        x0, x1, x2, x3 = self._coordinates
        return self._parent((x0, -x1, -x2, -x3))

    def reduced_trace(self) -> Any:
        return 2 * self._coordinates[0]

    trace = reduced_trace

    def reduced_norm(self) -> Any:
        x0, x1, x2, x3 = self._coordinates
        a = self._parent.a()
        b = self._parent.b()
        return x0 * x0 - a * x1 * x1 - b * x2 * x2 + a * b * x3 * x3

    norm = reduced_norm

    def pair(self, other: Any) -> Any:
        return (self * self._parent(other).conjugate()).reduced_trace()

    def inverse(self) -> QuaternionElement:
        norm = self.reduced_norm()
        if norm == 0:
            raise ZeroDivisionError("a zero quaternion is not invertible")
        return self.conjugate() / norm

    def is_zero(self) -> bool:
        return all(value == 0 for value in self)

    def __eq__(self, other: object) -> bool:
        return (
            isinstance(other, QuaternionElement)
            and other._parent is self._parent
            and other._coordinates == self._coordinates
        )

    def __hash__(self) -> int:
        return hash(self._coordinates)

    def __repr__(self) -> str:
        names = ("", "i", "j", "k")
        terms = []
        for index, value in enumerate(self._coordinates):
            if value == 0:
                continue
            if index == 0:
                terms.append(str(value))
            elif value == 1:
                terms.append(names[index])
            elif value == -1:
                terms.append("-" + names[index])
            else:
                terms.append(str(value) + "*" + names[index])
        return " + ".join(terms).replace("+ -", "- ") if terms else "0"

    __str__ = __repr__
    toString = __repr__


class RationalQuaternionAlgebra:
    r"""The rational quaternion algebra $(a,b)_{\mathbf Q}$."""

    def __init__(self, a: Any, b: Any, *, discriminant: Any | None = None) -> None:
        self._a = sage.QQ(a)
        self._b = sage.QQ(b)
        if self._a == 0 or self._b == 0:
            raise ValueError("quaternion invariants must be nonzero")
        if self._a._denominator != 1 or self._b._denominator != 1:
            raise ValueError("the exact order implementation needs integral invariants")
        a_integer = runtime.number(self._a._numerator)
        b_integer = runtime.number(self._b._numerator)
        computed = _hilbert_discriminant(a_integer, b_integer)
        if discriminant is not None and computed != _integer(
            discriminant, "quaternion discriminant"
        ):
            raise ArithmeticError(
                "the quaternion Hilbert symbols have the wrong discriminant"
            )
        self._discriminant = computed
        if not self.is_definite():
            raise ValueError(
                "the ideal-class implementation requires a definite algebra"
            )
        self._maximal_order: QuaternionOrder | None = None

    def __call__(self, value: Any) -> QuaternionElement:
        return QuaternionElement(self, value)

    def a(self) -> Any:
        return self._a

    def b(self) -> Any:
        return self._b

    def invariants(self) -> tuple[Any, Any]:
        return (self._a, self._b)

    def discriminant(self) -> int:
        return self._discriminant

    def ramified_primes(self) -> tuple[int, ...]:
        return tuple(prime for prime, _exponent in _factorization(self._discriminant))

    def is_definite(self) -> bool:
        return self._a < 0 and self._b < 0

    def zero(self) -> QuaternionElement:
        return self(0)

    def one(self) -> QuaternionElement:
        return self(1)

    def gens(self) -> tuple[QuaternionElement, QuaternionElement, QuaternionElement]:
        return (self((0, 1, 0, 0)), self((0, 0, 1, 0)), self((0, 0, 0, 1)))

    def basis(self) -> tuple[QuaternionElement, ...]:
        return (self.one(),) + self.gens()

    def order(self, basis: Iterable[Any]) -> QuaternionOrder:
        return QuaternionOrder(self, basis)

    quaternion_order = order

    def maximal_order(self) -> QuaternionOrder:
        if self._maximal_order is not None:
            return self._maximal_order
        order = QuaternionOrder(self, self.basis())
        target = self._discriminant
        while order.discriminant() != target:
            quotient = runtime.number(order.discriminant() // target)
            prime = _factorization(quotient)[0][0]
            enlarged = order._index_prime_overorder(prime)
            if enlarged is None:
                raise ArithmeticError(
                    "maximal-order saturation found no closed prime-index overorder"
                )
            order = enlarged
        order._maximal = True
        self._maximal_order = order
        return order

    def order_with_level(self, level: Any) -> QuaternionOrder:
        conductor = _integer(level, "Eichler conductor")
        if conductor <= 0 or _gcd(conductor, self._discriminant) != 1:
            raise ValueError("the Eichler conductor must be positive and coprime to D")
        order = self.maximal_order()
        for prime, exponent in _factorization(conductor):
            order = order._eichler_step(prime, exponent)
        expected = self._discriminant * conductor
        if order.discriminant() != expected:
            raise ArithmeticError("the constructed Eichler order has the wrong level")
        return order

    def __repr__(self) -> str:
        return (
            "Quaternion Algebra ("
            + str(self._a)
            + ", "
            + str(self._b)
            + ") over Rational Field"
        )

    __str__ = __repr__
    toString = __repr__


class QuaternionOrder:
    """An exactly certified rank-four quaternion order."""

    def __init__(
        self, algebra: RationalQuaternionAlgebra, basis: Iterable[Any]
    ) -> None:
        self._algebra = algebra
        rows = []
        for value in basis:
            rows.append(tuple(algebra(value)))
        self._basis_rows = _canonical_lattice(rows)
        self._basis = tuple(algebra(row) for row in self._basis_rows)
        self._maximal = False
        if not self.contains(algebra.one()):
            raise ValueError("a quaternion order must contain one")
        for left in self._basis:
            for right in self._basis:
                if not self.contains(left * right):
                    raise ValueError(
                        "a quaternion order basis is not closed under multiplication"
                    )
        self._discriminant = self._compute_discriminant()

    def quaternion_algebra(self) -> RationalQuaternionAlgebra:
        return self._algebra

    def basis(self) -> tuple[QuaternionElement, ...]:
        return self._basis

    def basis_matrix(self) -> Any:
        return _basis_matrix(self._basis_rows)

    def contains(self, value: Any) -> bool:
        return _lattice_contains(self._basis_rows, self._algebra(value))

    def __contains__(self, value: Any) -> bool:
        return self.contains(value)

    def _compute_discriminant(self) -> Any:
        gram = _global("matrix")(
            sage.QQ,
            [[left.pair(right) for right in self._basis] for left in self._basis],
        )
        determinant = gram.determinant()
        if determinant < 0:
            determinant = -determinant
        numerator, denominator = _rational_parts(determinant)
        numerator_integer = sage.ZZ(numerator)
        denominator_integer = sage.ZZ(denominator)
        if not numerator_integer.is_square() or not denominator_integer.is_square():
            raise ArithmeticError("a quaternion order discriminant is not a square")
        return sage.QQ(_integer_sqrt(numerator_integer)) / _integer_sqrt(
            denominator_integer
        )

    def discriminant(self) -> Any:
        return self._discriminant

    reduced_discriminant = discriminant

    def is_maximal(self) -> bool:
        return self._discriminant == self._algebra.discriminant()

    def _index_prime_overorder(self, prime: int) -> QuaternionOrder | None:
        basis = self._basis
        for vector in _projective_vectors(prime):
            element = self._algebra.zero()
            for coefficient, generator in zip(vector, basis, strict=True):
                element += generator * coefficient
            candidate_rows = list(self._basis_rows)
            candidate_rows.append(tuple(element / prime))
            try:
                candidate = QuaternionOrder(self._algebra, candidate_rows)
            except (ArithmeticError, ValueError):
                continue
            if candidate.discriminant() * prime == self.discriminant():
                return candidate
        return None

    def _left_ideal_lattice(
        self, generators: Iterable[QuaternionElement]
    ) -> tuple[tuple[Any, ...], ...]:
        return _canonical_lattice(
            tuple(left * right) for left in self._basis for right in generators
        )

    def _right_order_from_left_ideal(
        self, ideal_basis: tuple[tuple[Any, ...], ...]
    ) -> QuaternionOrder:
        ideal_matrix = _basis_matrix(ideal_basis)
        ambient = self._algebra.basis()
        # The requested right order is the order *inside self*.  Intersecting
        # with self is what turns the right order of a locally principal
        # maximal-order ideal into the desired Eichler intersection.
        lattices = [self._basis_rows]
        for generator_row in ideal_basis:
            generator = self._algebra(generator_row)
            multiplication = _global("matrix")(
                sage.QQ,
                [tuple(generator * basis_element) for basis_element in ambient],
            )
            lattices.append(
                _canonical_lattice((ideal_matrix * multiplication.inverse()).rows())
            )
        return QuaternionOrder(self._algebra, _lattice_intersection(lattices))

    def _split_element(self, prime: int) -> tuple[QuaternionElement, int]:
        centered = tuple(range(-(prime // 2), prime - prime // 2))
        for coefficients in product(centered, repeat=4):
            if all(value == 0 for value in coefficients):
                continue
            element = self._algebra.zero()
            for coefficient, basis_element in zip(
                coefficients, self._basis, strict=True
            ):
                element += basis_element * coefficient
            trace = runtime.number(sage.ZZ(element.reduced_trace()) % prime)
            norm = runtime.number(sage.ZZ(element.reduced_norm()) % prime)
            for root in range(prime):
                if (root * root - trace * root + norm) % prime == 0:
                    other = (trace - root) % prime
                    if root != other:
                        return element, root
        raise ArithmeticError(
            "failed to find a split element in an Eichler local factor"
        )

    def _eichler_step(self, prime: int, exponent: int) -> QuaternionOrder:
        element, root = self._split_element(prime)
        modulus = prime**exponent
        generators = (
            self._algebra(modulus),
            (element - self._algebra(root)) ** exponent,
        )
        ideal = self._left_ideal_lattice(generators)
        result = self._right_order_from_left_ideal(ideal)
        if result.discriminant() != self.discriminant() * modulus:
            raise ArithmeticError("Eichler right-order construction has wrong index")
        return result

    def unit_ideal(self) -> Any:
        from .ideals import _LOCAL_PRINCIPAL_CONSTRUCTION, QuaternionRightIdeal

        return QuaternionRightIdeal(
            self,
            self._basis,
            _construction_proof=_LOCAL_PRINCIPAL_CONSTRUCTION,
        )

    def right_ideal(self, generators: Iterable[Any], *, is_basis: bool = False) -> Any:
        from .ideals import QuaternionRightIdeal

        if is_basis:
            basis = tuple(self._algebra(value) for value in generators)
        else:
            basis = tuple(
                self._algebra(generator) * order_element
                for generator in generators
                for order_element in self._basis
            )
        return QuaternionRightIdeal(self, basis)

    def __eq__(self, other: object) -> bool:
        return (
            isinstance(other, QuaternionOrder)
            and other._algebra.invariants() == self._algebra.invariants()
            and other._basis_rows == self._basis_rows
        )

    def __hash__(self) -> int:
        return hash((self._algebra.invariants(), self._basis_rows))

    def __repr__(self) -> str:
        return "Order of " + repr(self._algebra) + " with basis " + repr(self._basis)

    __str__ = __repr__
    toString = __repr__


def QuaternionAlgebra(
    discriminant_or_a: Any,
    b: Any | None = None,
) -> RationalQuaternionAlgebra:
    r"""Construct a definite rational quaternion algebra.

    With one argument, construct the algebra of squarefree discriminant $D$.
    With two arguments, construct $(a,b)_{\mathbf Q}$ and certify its finite
    ramification set.
    """

    if b is None:
        discriminant = _integer(discriminant_or_a, "quaternion discriminant")
        factors = _factorization(discriminant)
        if discriminant <= 1 or any(exponent != 1 for _prime, exponent in factors):
            raise ValueError(
                "a definite quaternion discriminant must be squarefree and > 1"
            )
        if len(factors) % 2 != 1:
            raise ValueError(
                "a definite rational quaternion algebra has odd finite ramification parity"
            )
        a, second = _hilbert_conductor_inverse(discriminant)
        return RationalQuaternionAlgebra(a, second, discriminant=discriminant)
    return RationalQuaternionAlgebra(discriminant_or_a, b)


__all__ = [
    "QuaternionAlgebra",
    "QuaternionElement",
    "QuaternionOrder",
    "RationalQuaternionAlgebra",
]
