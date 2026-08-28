r"""Mass-certified ideal classes and integral Brandt operators over $\mathbf Q$."""

from __future__ import annotations

from typing import Any, Iterable

import sagejs as sage
import sagejs.runtime as runtime

from .algebra import (
    QuaternionAlgebra,
    QuaternionOrder,
    _canonical_lattice,
    _factorization,
)
from .ideals import QuaternionRightIdeal


def _global(name: str) -> Any:
    return runtime.reflect.get(runtime.global_object, name)


def _gcd(left: int, right: int) -> int:
    left = abs(left)
    right = abs(right)
    while right:
        left, right = right, left % right
    return left


def _next_prime(value: int) -> int:
    candidate = value + 1
    while not sage.is_prime(candidate):
        candidate += 1
    return candidate


def eichler_mass(discriminant: int, conductor: int) -> Any:
    r"""Return $\sum_{[I]}1/|O_L(I)^\times/\{\pm1\}|$."""

    answer = sage.QQ(1) / 12
    for prime, _exponent in _factorization(discriminant):
        answer *= prime - 1
    answer *= conductor
    for prime, _exponent in _factorization(conductor):
        answer *= sage.QQ(prime + 1) / prime
    return answer


class IdealClassMassCertificate:
    """Replayable exact completeness evidence for an Eichler class set."""

    def __init__(
        self,
        discriminant: int,
        conductor: int,
        weights: Iterable[int],
        fingerprints: Iterable[Any],
        neighbor_primes: Iterable[int],
        ideals: Iterable[QuaternionRightIdeal] = (),
    ) -> None:
        self.discriminant = discriminant
        self.conductor = conductor
        self.weights = tuple(weights)
        self.fingerprints = tuple(fingerprints)
        self.neighbor_primes = tuple(neighbor_primes)
        self._ideals = tuple(ideals)
        self.expected_mass = eichler_mass(discriminant, conductor)
        self.discovered_mass = sum(
            (sage.QQ(1) / weight for weight in self.weights), sage.QQ(0)
        )
        if len(self.weights) != len(self.fingerprints):
            raise ArithmeticError("mass certificate rows have different lengths")
        if len(set(self.fingerprints)) != len(self.fingerprints):
            raise ArithmeticError(
                "mass certificate contains duplicate class fingerprints"
            )
        if any(weight <= 0 for weight in self.weights):
            raise ArithmeticError("mass certificate has a nonpositive unit weight")
        if self.discovered_mass != self.expected_mass:
            raise ArithmeticError("the discovered ideal mass is incomplete")

    def verify(self) -> bool:
        if self.discovered_mass != self.expected_mass:
            return False
        if not self._ideals:
            return True
        if len(self._ideals) != len(self.weights):
            return False
        for left in range(len(self._ideals)):
            for right in range(left):
                if self._ideals[left].is_equivalent(self._ideals[right]):
                    return False
        for ideal, weight in zip(self._ideals, self.weights, strict=True):
            if ideal.unit_weight() != weight:
                return False
        return True

    def __repr__(self) -> str:
        return (
            "Ideal-class mass certificate (D="
            + str(self.discriminant)
            + ", N="
            + str(self.conductor)
            + ", classes="
            + str(len(self.weights))
            + ")"
        )

    __str__ = __repr__
    toString = __repr__


class EichlerIdealClassSet:
    """The locally principal right ideal classes of a definite Eichler order."""

    def __init__(
        self,
        discriminant: int,
        conductor: int,
        *,
        expected_dimension: int | None = None,
        theta_precision: int = 8,
        max_neighbor_primes: int = 8,
    ) -> None:
        self._discriminant = discriminant
        self._conductor = conductor
        self._algebra = QuaternionAlgebra(discriminant)
        self._order = self._algebra.order_with_level(conductor)
        self._theta_precision = theta_precision
        self._expected_dimension = expected_dimension
        self._ideals: tuple[QuaternionRightIdeal, ...] = ()
        self._weights: tuple[int, ...] = ()
        self._mass_certificate: IdealClassMassCertificate | None = None
        self._neighbor_primes: tuple[int, ...] = ()
        self._neighbor_cache: list[
            tuple[int, tuple[tuple[QuaternionRightIdeal, ...], ...]]
        ] = []
        self._enumerate(max_neighbor_primes)

    def quaternion_algebra(self) -> Any:
        return self._algebra

    def maximal_order(self) -> QuaternionOrder:
        return self._algebra.maximal_order()

    def eichler_order(self) -> QuaternionOrder:
        return self._order

    order = eichler_order

    def ideals(self) -> tuple[QuaternionRightIdeal, ...]:
        return self._ideals

    right_ideals = ideals

    def weights(self) -> tuple[int, ...]:
        return self._weights

    monodromy_weights = weights

    def dimension(self) -> int:
        return len(self._ideals)

    def mass(self) -> Any:
        return sum((sage.QQ(1) / weight for weight in self._weights), sage.QQ(0))

    def mass_certificate(self) -> IdealClassMassCertificate:
        if self._mass_certificate is None:
            raise RuntimeError("the ideal classes have no mass certificate")
        return self._mass_certificate

    def class_fingerprints(self) -> tuple[Any, ...]:
        return tuple(
            (ideal.theta_series_vector(12), weight)
            for ideal, weight in zip(self._ideals, self._weights, strict=True)
        )

    def _classify_in(
        self,
        ideal: QuaternionRightIdeal,
        representatives: list[QuaternionRightIdeal],
    ) -> int | None:
        theta = ideal.theta_series_vector(self._theta_precision)
        for index, representative in enumerate(representatives):
            if theta != representative.theta_series_vector(self._theta_precision):
                continue
            equivalent, witness = ideal.is_equivalent(
                representative,
                certificate=True,
                theta_precision=0,
            )
            if equivalent:
                if witness is None:
                    raise ArithmeticError("ideal equivalence omitted its witness")
                return index
        return None

    def classify(self, ideal: QuaternionRightIdeal) -> int:
        result = self._classify_in(ideal, list(self._ideals))
        if result is None:
            raise ArithmeticError(
                "an ideal neighbor is absent from the completed class set"
            )
        return result

    def _enumerate(self, max_neighbor_primes: int) -> None:
        target = eichler_mass(self._discriminant, self._conductor)
        representatives = [self._order.unit_ideal()]
        weights = [representatives[0].unit_weight()]
        discovered = sage.QQ(1) / weights[0]
        used_primes = []
        prime = 1
        for _attempt in range(max_neighbor_primes):
            prime = _next_prime(prime)
            while (self._discriminant * self._conductor) % prime == 0:
                prime = _next_prime(prime)
            used_primes.append(prime)
            frontier = list(representatives)
            seen_frontier = 0
            while seen_frontier < len(frontier):
                source = frontier[seen_frontier]
                seen_frontier += 1
                for candidate in source.cyclic_right_subideals(prime):
                    if self._classify_in(candidate, representatives) is not None:
                        continue
                    weight = candidate.unit_weight()
                    representatives.append(candidate)
                    weights.append(weight)
                    frontier.append(candidate)
                    discovered += sage.QQ(1) / weight
                    if discovered > target:
                        raise ArithmeticError(
                            "ideal traversal exceeded the exact Eichler mass; "
                            "an equivalence or unit certificate is wrong"
                        )
                    if (
                        self._expected_dimension is not None
                        and len(representatives) > self._expected_dimension
                    ):
                        raise ArithmeticError(
                            "ideal traversal exceeded the Jacquet--Langlands dimension"
                        )
                    if discovered == target:
                        break
                if discovered == target:
                    break
            if discovered == target:
                break
        if discovered != target:
            raise ArithmeticError(
                "neighbor traversal did not reach the exact Eichler mass within its prime budget"
            )
        if (
            self._expected_dimension is not None
            and len(representatives) != self._expected_dimension
        ):
            raise ArithmeticError(
                "mass-complete ideal classes disagree with the Jacquet--Langlands dimension"
            )
        # Stable ordering by arithmetic fingerprints, with the lattice as a
        # deterministic tie-breaker.  Equivalence was already proved above.
        indexed = list(zip(representatives, weights, strict=True))
        indexed.sort(
            key=lambda pair: (
                pair[0].theta_series_vector(12),
                pair[1],
                str(pair[0].basis_matrix()),
            )
        )
        self._ideals = tuple(pair[0] for pair in indexed)
        self._weights = tuple(pair[1] for pair in indexed)
        self._neighbor_primes = tuple(used_primes)
        fingerprints = tuple(
            (ideal.theta_series_vector(16), weight, str(ideal.basis_matrix()))
            for ideal, weight in zip(self._ideals, self._weights, strict=True)
        )
        self._mass_certificate = IdealClassMassCertificate(
            self._discriminant,
            self._conductor,
            self._weights,
            fingerprints,
            self._neighbor_primes,
            self._ideals,
        )

    def neighbors(self, prime: int) -> tuple[tuple[QuaternionRightIdeal, ...], ...]:
        if _gcd(prime, self._discriminant * self._conductor) != 1 or not sage.is_prime(
            prime
        ):
            raise ValueError("a Brandt neighbor index must be a good prime")
        for cached_prime, rows in self._neighbor_cache:
            if cached_prime == prime:
                return rows
        rows = tuple(ideal.cyclic_right_subideals(prime) for ideal in self._ideals)
        self._neighbor_cache.append((prime, rows))
        return rows

    def hecke_matrix(self, prime: int) -> Any:
        rows = []
        for neighbors in self.neighbors(prime):
            row = [0 for _index in range(self.dimension())]
            for ideal in neighbors:
                target = self.classify(ideal)
                row[target] = row[target] + 1
            if sum(row) != prime + 1:
                raise ArithmeticError("a good Brandt row does not have ell+1 neighbors")
            rows.append(row)
        matrix = _global("matrix")(sage.ZZ, rows)
        for row in range(self.dimension()):
            for column in range(self.dimension()):
                # Operators act on row vectors throughout Sage.js.  Thus
                # self-adjointness for the diagonal pairing W is T*W =
                # W*T^t, i.e. T_ij*w_j = w_i*T_ji.
                if (
                    matrix[row, column] * self._weights[column]
                    != self._weights[row] * matrix[column, row]
                ):
                    raise ArithmeticError("the Brandt matrix violates mass adjointness")
        return matrix

    def ramified_permutation(self, prime: int) -> tuple[int, ...]:
        if self._discriminant % prime != 0 or not sage.is_prime(prime):
            raise ValueError("a ramified permutation needs a prime divisor of D")
        generators = [self._algebra(prime)]
        for left in self._order.basis():
            for right in self._order.basis():
                generators.append(left * right - right * left)
        two_sided = self._order.right_ideal(generators)
        answer = []
        for ideal in self._ideals:
            rows = _canonical_lattice(
                tuple(left * right)
                for left in ideal.basis()
                for right in two_sided.basis()
            )
            answer.append(self.classify(QuaternionRightIdeal(self._order, rows)))
        if sorted(answer) != list(range(self.dimension())):
            raise ArithmeticError(
                "the ramified two-sided ideal is not a class permutation"
            )
        if any(answer[answer[index]] != index for index in range(self.dimension())):
            raise ArithmeticError("the ramified class permutation is not an involution")
        return tuple(answer)

    def pairing_matrix(self) -> Any:
        return _global("diagonal_matrix")(sage.ZZ, self._weights)


__all__ = [
    "EichlerIdealClassSet",
    "IdealClassMassCertificate",
    "eichler_mass",
]
