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
from .ideals import (
    QuaternionRightIdeal,
    _enumerate_plan_by_norm,
    _LatticeNormPlan,
    _rational_parts,
    _try_native_theta_counts,
)


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


def _sigma_one(value: int) -> Any:
    answer = sage.ZZ(1)
    for prime, exponent in _factorization(value):
        answer *= (sage.ZZ(prime) ** (exponent + 1) - 1) // (prime - 1)
    return answer


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
        for ideal in self._ideals:
            if not ideal.is_right_ideal(replay=True):
                return False
            if not ideal.is_locally_principal(replay=True):
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
        self._class_theta_index: dict[tuple[int, ...], list[int]] = {}
        self._classified_neighbor_cache: list[
            tuple[int, tuple[tuple[int, ...] | None, ...]]
        ] = []
        self._brandt_product_plans: tuple[tuple[_LatticeNormPlan, ...], ...] = ()
        self._brandt_series_vectors: tuple[tuple[tuple[Any, ...], ...], ...] = ()
        self._brandt_series_precision = 0
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
        theta_index: dict[tuple[int, ...], list[int]] | None = None,
    ) -> int | None:
        theta = ideal.theta_series_vector(self._theta_precision)
        indices: Iterable[int]
        if theta_index is None:
            indices = range(len(representatives))
        else:
            indices = theta_index.get(theta, ())
        for index in indices:
            representative = representatives[index]
            if theta_index is None and theta != representative.theta_series_vector(
                self._theta_precision
            ):
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
        result = self._classify_in(ideal, list(self._ideals), self._class_theta_index)
        if result is None:
            raise ArithmeticError(
                "an ideal neighbor is absent from the completed class set"
            )
        return result

    def _enumerate(self, max_neighbor_primes: int) -> None:
        target = eichler_mass(self._discriminant, self._conductor)
        representatives = [self._order.unit_ideal()]
        weights = [representatives[0].unit_weight()]
        first_theta = representatives[0].theta_series_vector(self._theta_precision)
        theta_index = {first_theta: [0]}
        traversal_rows: dict[
            int, dict[QuaternionRightIdeal, tuple[QuaternionRightIdeal, ...]]
        ] = {}
        discovered = sage.QQ(1) / weights[0]
        used_primes = []
        prime = 1
        for _attempt in range(max_neighbor_primes):
            prime = _next_prime(prime)
            while (self._discriminant * self._conductor) % prime == 0:
                prime = _next_prime(prime)
            used_primes.append(prime)
            prime_rows: dict[
                QuaternionRightIdeal, tuple[QuaternionRightIdeal, ...]
            ] = {}
            traversal_rows[prime] = prime_rows
            frontier = list(representatives)
            seen_frontier = 0
            while seen_frontier < len(frontier):
                source = frontier[seen_frontier]
                seen_frontier += 1
                classified_row = []
                for candidate in source.cyclic_right_subideals(prime):
                    class_index = self._classify_in(
                        candidate, representatives, theta_index
                    )
                    if class_index is None:
                        weight = candidate.unit_weight()
                        class_index = len(representatives)
                        representatives.append(candidate)
                        weights.append(weight)
                        frontier.append(candidate)
                        theta = candidate.theta_series_vector(self._theta_precision)
                        if theta not in theta_index:
                            theta_index[theta] = []
                        theta_index[theta].append(class_index)
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
                    classified_row.append(representatives[class_index])
                prime_rows[source] = tuple(classified_row)
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
        final_indices = {ideal: index for index, ideal in enumerate(self._ideals)}
        self._class_theta_index = {}
        for index, ideal in enumerate(self._ideals):
            theta = ideal.theta_series_vector(self._theta_precision)
            if theta not in self._class_theta_index:
                self._class_theta_index[theta] = []
            self._class_theta_index[theta].append(index)
        for used_prime in used_primes:
            cached_rows: list[tuple[int, ...] | None] = [
                None for _index in range(len(self._ideals))
            ]
            for source, row in traversal_rows[used_prime].items():
                cached_rows[final_indices[source]] = tuple(
                    final_indices[target_ideal] for target_ideal in row
                )
            self._classified_neighbor_cache.append((used_prime, tuple(cached_rows)))
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

    def _classified_neighbor_indices(self, prime: int) -> tuple[tuple[int, ...], ...]:
        if _gcd(prime, self._discriminant * self._conductor) != 1 or not sage.is_prime(
            prime
        ):
            raise ValueError("a Brandt neighbor index must be a good prime")
        cached_rows: list[tuple[int, ...] | None] | None = None
        cached_position = -1
        for position, (cached_prime, rows) in enumerate(
            self._classified_neighbor_cache
        ):
            if cached_prime == prime:
                cached_rows = list(rows)
                cached_position = position
                break
        if cached_rows is None:
            cached_rows = [None for _index in range(self.dimension())]
        for index, ideal in enumerate(self._ideals):
            if cached_rows[index] is None:
                cached_rows[index] = tuple(
                    self.classify(neighbor)
                    for neighbor in ideal.cyclic_right_subideals(prime)
                )
        result = tuple(row for row in cached_rows if row is not None)
        if len(result) != self.dimension():
            raise ArithmeticError("a classified Brandt neighbor row is missing")
        entry = (prime, result)
        if cached_position < 0:
            self._classified_neighbor_cache.append(entry)
        else:
            self._classified_neighbor_cache[cached_position] = entry
        return result

    def _validate_hecke_matrix(self, index: int, matrix: Any) -> Any:
        expected_sum = _sigma_one(index)
        for row in range(self.dimension()):
            if (
                sum(matrix[row, column] for column in range(self.dimension()))
                != expected_sum
            ):
                raise ArithmeticError("a Brandt row has the wrong divisor sum")
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

    def _direct_hecke_matrix(self, prime: int) -> Any:
        rows = []
        for neighbors in self._classified_neighbor_indices(prime):
            row = [0 for _index in range(self.dimension())]
            for target in neighbors:
                row[target] = row[target] + 1
            if sum(row) != prime + 1:
                raise ArithmeticError("a good Brandt row does not have ell+1 neighbors")
            rows.append(row)
        return self._validate_hecke_matrix(prime, _global("matrix")(sage.ZZ, rows))

    def _ideal_product_plans(self) -> tuple[tuple[_LatticeNormPlan, ...], ...]:
        r"""Return cached lower-triangular plans for $I_i\overline{I_j}$."""

        if self._brandt_product_plans:
            return self._brandt_product_plans
        rows = []
        for index, ideal in enumerate(self._ideals):
            rows.append(
                tuple(
                    _LatticeNormPlan(
                        self._algebra,
                        ideal.multiply_by_conjugate(self._ideals[prior]),
                        canonical=True,
                    )
                    for prior in range(index + 1)
                )
            )
        self._brandt_product_plans = tuple(rows)
        return self._brandt_product_plans

    def _product_theta_vector(
        self,
        row: int,
        column: int,
        precision: int,
    ) -> tuple[int, ...]:
        high = max(row, column)
        low = min(row, column)
        plan = self._ideal_product_plans()[high][low]
        normalization = self._ideals[high].norm() * self._ideals[low].norm()
        native = _try_native_theta_counts(plan, normalization, precision)
        if native is not None:
            return native
        coefficients = [0 for _index in range(precision)]
        for _coordinates, norm in _enumerate_plan_by_norm(
            plan, (precision - 1) * normalization
        ):
            numerator, denominator = _rational_parts(norm / normalization)
            if denominator == 1 and 0 <= numerator < precision:
                coefficients[runtime.number(numerator)] += 1
        return tuple(coefficients)

    def brandt_series_vectors(
        self, precision: int = 2
    ) -> tuple[tuple[tuple[Any, ...], ...], ...]:
        r"""Return coefficients of the exact matrix series $\sum T_nq^n$."""

        if precision < 2:
            raise ValueError("a Brandt-series precision must be at least 2")
        if self._brandt_series_precision >= precision:
            return self._brandt_series_vectors
        dimension = self.dimension()
        theta = [
            [
                self._product_theta_vector(row, column, precision)
                for column in range(row + 1)
            ]
            for row in range(dimension)
        ]
        diagonal = [theta[index][index][1] for index in range(dimension)]
        for index, value in enumerate(diagonal):
            if value != 2 * self._weights[index]:
                raise ArithmeticError(
                    "a diagonal Brandt theta series has the wrong unit weight"
                )
        series: list[list[tuple[Any, ...] | None]] = [
            [None for _column in range(dimension)] for _row in range(dimension)
        ]
        for row in range(dimension):
            series[row][row] = tuple(
                sage.QQ(value) / diagonal[row] for value in theta[row][row]
            )
            for column in range(row):
                # Sage.js operators act on row vectors, so the automorphism
                # factor belongs to the target column.  This is the transpose
                # convention of SageMath's column-action Brandt series.
                series[column][row] = tuple(
                    sage.QQ(value) / diagonal[row] for value in theta[row][column]
                )
                series[row][column] = tuple(
                    sage.QQ(value) / diagonal[column] for value in theta[row][column]
                )
        if any(value is None for row in series for value in row):
            raise ArithmeticError("a Brandt-series coefficient vector is missing")
        self._brandt_series_vectors = tuple(
            tuple(value for value in row if value is not None) for row in series
        )
        self._brandt_series_precision = precision
        return self._brandt_series_vectors

    def _brandt_series_hecke_matrix(self, index: int) -> Any:
        precision = max(index + 1, 2 * index + 10)
        series = self.brandt_series_vectors(precision)
        rows = []
        for row in range(self.dimension()):
            entries = []
            for column in range(self.dimension()):
                value = sage.QQ(series[row][column][index])
                numerator, denominator = _rational_parts(value)
                if denominator != 1:
                    raise ArithmeticError(
                        "an integral Brandt operator has a fractional entry"
                    )
                entries.append(sage.ZZ(numerator))
            rows.append(entries)
        return self._validate_hecke_matrix(index, _global("matrix")(sage.ZZ, rows))

    def hecke_matrix(self, index: int, *, algorithm: str = "auto") -> Any:
        """Return $T_n$ using direct neighbors or the Brandt theta series."""

        if algorithm not in ("auto", "direct", "brandt-series"):
            raise ValueError("algorithm must be 'auto', 'direct', or 'brandt-series'")
        if index <= 0 or _gcd(index, self._discriminant * self._conductor) != 1:
            raise ValueError("a Brandt Hecke index must be positive and coprime to DN")
        if algorithm == "auto":
            algorithm = (
                "brandt-series" if self._brandt_series_precision > index else "direct"
            )
        if algorithm == "brandt-series":
            return self._brandt_series_hecke_matrix(index)
        if not sage.is_prime(index):
            raise ValueError("the direct Brandt algorithm requires a good prime")
        return self._direct_hecke_matrix(index)

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
