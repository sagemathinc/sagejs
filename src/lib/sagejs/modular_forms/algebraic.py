"""Sparse algebraic modular forms from quaternion ideal components.

The arithmetic input is deliberately explicit: a component supplies the
projective images of the units of one left order, and a good-prime
correspondence supplies the projective transporter matrices between
components.  This is the finite-set layer of the definite Brandt method; it
does not disguise quaternion ideal enumeration as generic sparse algebra.
"""

from __future__ import annotations

from typing import Any, Iterable

import sagejs as sage
import sagejs.runtime as runtime

from .finite_hecke import FiniteHeckeSet
from .sparse_hecke import SparseHeckeOperator

Matrix2 = tuple[int, int, int, int]


def _global(name: str) -> Any:
    return runtime.reflect.get(runtime.global_object, name)


def _integer(value: Any, label: str) -> int:
    normalized = runtime.normalize_integer(value)
    if runtime.jstype(normalized) != "number" or not runtime.number.isSafeInteger(
        normalized
    ):
        raise TypeError(label + " must be an exact machine integer")
    return runtime.number(normalized)


def _inverse(value: int, modulus: int) -> int:
    old_r, remainder = value % modulus, modulus
    old_s, coefficient = 1, 0
    while remainder:
        quotient = old_r // remainder
        old_r, remainder = remainder, old_r - quotient * remainder
        old_s, coefficient = coefficient, old_s - quotient * coefficient
    if old_r != 1:
        raise ZeroDivisionError("a projective matrix entry is not invertible")
    return old_s % modulus


def _normalize_matrix(matrix: Iterable[Any], modulus: int) -> Matrix2:
    data = tuple(
        _integer(value, "projective matrix entry") % modulus for value in matrix
    )
    if len(data) != 4:
        raise ValueError("a projective matrix needs four entries")
    determinant = (data[0] * data[3] - data[1] * data[2]) % modulus
    try:
        _inverse(determinant, modulus)
    except ZeroDivisionError:
        raise ValueError("a projective matrix must be invertible") from None
    return (data[0], data[1], data[2], data[3])


def _projective_matrix(matrix: Matrix2, modulus: int) -> Matrix2:
    for value in matrix:
        try:
            scale = _inverse(value, modulus)
            return tuple((entry * scale) % modulus for entry in matrix)  # type: ignore[return-value]
        except ZeroDivisionError:
            pass
    raise ArithmeticError("an invertible matrix cannot be projectively zero")


def _prime_power(modulus: int, residue_prime: Any | None) -> tuple[int, int]:
    if residue_prime is None:
        if modulus < 3 or not sage.is_prime(modulus):
            raise ValueError("a composite projective modulus needs its residue prime")
        return (modulus, 1)
    prime = _integer(residue_prime, "projective residue prime")
    if prime < 3 or not sage.is_prime(prime):
        raise ValueError("the projective residue characteristic must be odd prime")
    remaining = modulus
    exponent = 0
    while remaining % prime == 0:
        remaining //= prime
        exponent += 1
    if remaining != 1 or exponent < 1:
        raise ValueError("the projective modulus must be a power of its prime")
    return (prime, exponent)


def _matrix_product(left: Matrix2, right: Matrix2, modulus: int) -> Matrix2:
    a, b, c, d = left
    e, f, g, h = right
    return (
        (a * e + b * g) % modulus,
        (a * f + b * h) % modulus,
        (c * e + d * g) % modulus,
        (c * f + d * h) % modulus,
    )


class QuaternionIdealComponent:
    r"""One $\Gamma_i$-orbit component of a definite quaternion order."""

    def __init__(
        self,
        label: Any,
        modulus: Any,
        unit_matrices: Iterable[Iterable[Any]],
        *,
        residue_prime: Any | None = None,
        representatives: Iterable[Any] | None = None,
    ) -> None:
        modulus_value = _integer(modulus, "projective modulus")
        prime, exponent = _prime_power(modulus_value, residue_prime)
        units = tuple(
            _normalize_matrix(matrix, modulus_value) for matrix in unit_matrices
        )
        if not units:
            raise ValueError("a quaternion component needs its projective unit group")
        projective_units: list[Matrix2] = []
        for matrix in units:
            normalized = _projective_matrix(matrix, modulus_value)
            if normalized not in projective_units:
                projective_units.append(normalized)
        identity = (1, 0, 0, 1)
        if identity not in projective_units:
            raise ArithmeticError("the projective unit data has no identity")
        for left in projective_units:
            for right in projective_units:
                product = _projective_matrix(
                    _matrix_product(left, right, modulus_value), modulus_value
                )
                if product not in projective_units:
                    raise ArithmeticError("the projective unit data is not a group")
        lower_chart_size = modulus_value // prime
        projective_cardinality = modulus_value + lower_chart_size
        table = [-1 for _index in range(projective_cardinality)]
        automatic_representatives = []
        orbit_sizes = []
        for point in range(projective_cardinality):
            if table[point] >= 0:
                continue
            orbit_index = len(automatic_representatives)
            orbit = {
                self.act(
                    point,
                    matrix,
                    modulus=modulus_value,
                    residue_prime=prime,
                )
                for matrix in projective_units
            }
            if len(projective_units) % len(orbit) != 0:
                raise ArithmeticError(
                    "a component orbit size does not divide its group"
                )
            for target in orbit:
                if table[target] not in [-1, orbit_index]:
                    raise ArithmeticError("component projective orbits overlap")
                table[target] = orbit_index
            automatic_representatives.append(point)
            orbit_sizes.append(len(orbit))
        if any(value < 0 for value in table):
            raise ArithmeticError("component projective orbits are incomplete")
        if representatives is not None:
            requested = tuple(
                _integer(value, "component orbit representative")
                for value in representatives
            )
            if any(value < 0 or value >= projective_cardinality for value in requested):
                raise IndexError("a component orbit representative is out of range")
            old_orbits = tuple(table[value] for value in requested)
            if len(old_orbits) != len(automatic_representatives) or len(
                set(old_orbits)
            ) != len(old_orbits):
                raise ValueError(
                    "explicit representatives must select every orbit exactly once"
                )
            permutation = {old: new for new, old in enumerate(old_orbits)}
            table = [permutation[old] for old in table]
            orbit_sizes = [orbit_sizes[old] for old in old_orbits]
            automatic_representatives = list(requested)
        self._label = str(label)
        self._modulus = modulus_value
        self._residue_prime = prime
        self._exponent = exponent
        self._lower_chart_size = lower_chart_size
        self._units = units
        self._projective_unit_order = len(projective_units)
        self._table = tuple(table)
        self._representatives = tuple(automatic_representatives)
        self._orbit_sizes = tuple(orbit_sizes)
        runtime.object.freeze(self)

    @staticmethod
    def act(
        point: Any,
        matrix: Iterable[Any],
        *,
        modulus: Any,
        residue_prime: Any | None = None,
    ) -> int:
        modulus_value = _integer(modulus, "projective modulus")
        prime, _exponent = _prime_power(modulus_value, residue_prime)
        lower_chart_size = modulus_value // prime
        cardinality = modulus_value + lower_chart_size
        position = _integer(point, "projective point")
        if position < 0 or position >= cardinality:
            raise IndexError("projective point is out of range")
        normalized = _normalize_matrix(matrix, modulus_value)
        return QuaternionIdealComponent.transport(
            position,
            normalized,
            modulus=modulus_value,
            residue_prime=prime,
        )

    @staticmethod
    def transport(
        point: Any,
        matrix: Iterable[Any],
        *,
        modulus: Any,
        residue_prime: Any | None = None,
    ) -> int:
        """Apply a possibly singular local correspondence to a primitive point."""
        modulus_value = _integer(modulus, "projective modulus")
        prime, _exponent = _prime_power(modulus_value, residue_prime)
        lower_chart_size = modulus_value // prime
        cardinality = modulus_value + lower_chart_size
        position = _integer(point, "projective point")
        if position < 0 or position >= cardinality:
            raise IndexError("projective point is out of range")
        data = tuple(
            _integer(value, "projective matrix entry") % modulus_value
            for value in matrix
        )
        if len(data) != 4:
            raise ValueError("a projective matrix needs four entries")
        if position < lower_chart_size:
            first, second = prime * position, 1
        else:
            first, second = 1, position - lower_chart_size
        a, b, c, d = data
        # Magma's ``ProjectiveLine(Type := "Matrix")`` stores a projective
        # point as a column and the residue splitting acts on the left.
        image_first = (a * first + b * second) % modulus_value
        image_second = (c * first + d * second) % modulus_value
        if image_first % prime != 0:
            return (
                lower_chart_size
                + image_second * _inverse(image_first, modulus_value) % modulus_value
            )
        if image_second % prime != 0:
            normalized_first = (
                image_first * _inverse(image_second, modulus_value) % modulus_value
            )
            if normalized_first % prime != 0:
                raise ArithmeticError("projective normalization left the lower chart")
            return normalized_first // prime
        raise ArithmeticError("a nonprimitive vector has no projective class")

    def label(self) -> str:
        return self._label

    def modulus(self) -> int:
        return self._modulus

    def residue_prime(self) -> int:
        return self._residue_prime

    def exponent(self) -> int:
        return self._exponent

    def projective_cardinality(self) -> int:
        return len(self._table)

    def projective_unit_order(self) -> int:
        return self._projective_unit_order

    def unit_matrices(self) -> tuple[Matrix2, ...]:
        return self._units

    def cardinality(self) -> int:
        return len(self._representatives)

    __len__ = cardinality

    def representative_indices(self) -> tuple[int, ...]:
        return self._representatives

    def representatives(self) -> tuple[tuple[int, int], ...]:
        return tuple(self.coordinates(point) for point in self._representatives)

    def coordinates(self, point: Any) -> tuple[int, int]:
        position = _integer(point, "projective point")
        if position < 0 or position >= self.projective_cardinality():
            raise IndexError("projective point is out of range")
        if position < self._lower_chart_size:
            return (self._residue_prime * position, 1)
        return (1, position - self._lower_chart_size)

    def standard_index(self, first: Any, second: Any) -> int:
        x = _integer(first, "projective first coordinate") % self._modulus
        y = _integer(second, "projective second coordinate") % self._modulus
        if x % self._residue_prime != 0:
            return (
                self._lower_chart_size + y * _inverse(x, self._modulus) % self._modulus
            )
        if y % self._residue_prime != 0:
            normalized = x * _inverse(y, self._modulus) % self._modulus
            if normalized % self._residue_prime != 0:
                raise ArithmeticError("projective normalization left the lower chart")
            return normalized // self._residue_prime
        raise ArithmeticError("a nonprimitive vector has no projective class")

    def reduces_to(self, lower: QuaternionIdealComponent) -> bool:
        if not isinstance(lower, QuaternionIdealComponent):
            return False
        if self._label != lower._label:
            return False
        if self._residue_prime != lower._residue_prime:
            return False
        if self._exponent != lower._exponent + 1:
            return False
        if self._modulus != lower._modulus * self._residue_prime:
            return False
        modulus = lower._modulus
        # Tuple hashing in the translated runtime is deliberately not an
        # arithmetic identity contract; this packet has only 24 units, so use
        # equality-based membership just as the orbit constructors do.
        lower_units = [_projective_matrix(unit, modulus) for unit in lower._units]
        return all(
            _projective_matrix(
                (
                    unit[0] % modulus,
                    unit[1] % modulus,
                    unit[2] % modulus,
                    unit[3] % modulus,
                ),
                modulus,
            )
            in lower_units
            for unit in self._units
        )

    def orbit_sizes(self) -> tuple[int, ...]:
        return self._orbit_sizes

    def stabilizer_orders(self) -> tuple[int, ...]:
        return tuple(self._projective_unit_order // size for size in self._orbit_sizes)

    def orbit_index(self, point: Any) -> int:
        position = _integer(point, "projective point")
        if position < 0 or position >= len(self._table):
            raise IndexError("projective point is out of range")
        return self._table[position]

    def mass(self, orbit: Any) -> Any:
        index = _integer(orbit, "component orbit")
        if index < 0 or index >= self.cardinality():
            raise IndexError("component orbit is out of range")
        return sage.QQ(self._orbit_sizes[index]) / sage.QQ(self._projective_unit_order)


class QuaternionHeckeCorrespondence:
    """Exact local transporter matrices for one good prime ideal."""

    def __init__(
        self,
        label: Any,
        norm: Any,
        transitions: Iterable[tuple[Any, Any, Iterable[Iterable[Any]]]],
    ) -> None:
        prime_norm = _integer(norm, "Hecke prime norm")
        if prime_norm < 2:
            raise ValueError("a Hecke prime norm must be at least two")
        normalized = []
        for source, target, matrices in transitions:
            source_index = _integer(source, "source component")
            target_index = _integer(target, "target component")
            normalized.append(
                (
                    source_index,
                    target_index,
                    tuple(tuple(matrix) for matrix in matrices),
                )
            )
        if not normalized:
            raise ValueError("a Hecke correspondence needs transporter matrices")
        self._label = str(label)
        self._norm = prime_norm
        self._transitions = tuple(normalized)
        runtime.object.freeze(self)

    def label(self) -> str:
        return self._label

    def norm(self) -> int:
        return self._norm

    def degree(self) -> int:
        return self._norm + 1

    def transitions(
        self,
    ) -> tuple[tuple[int, int, tuple[tuple[Any, ...], ...]], ...]:
        return self._transitions

    def __eq__(self, other: object) -> bool:
        return (
            isinstance(other, QuaternionHeckeCorrespondence)
            and self._label == other._label
            and self._norm == other._norm
            and self._transitions == other._transitions
        )

    def __repr__(self) -> str:
        return "Quaternion Hecke correspondence " + self._label

    __str__ = __repr__
    toString = __repr__


class QuaternionComponentHeckeSet(FiniteHeckeSet):
    """A finite Hecke set assembled from genuine quaternion components."""

    def __init__(
        self,
        components: Iterable[QuaternionIdealComponent],
        correspondences: Iterable[QuaternionHeckeCorrespondence],
        *,
        dense_entry_limit: Any = 1000000,
    ) -> None:
        FiniteHeckeSet.__init__(
            self, base_ring=sage.ZZ, dense_entry_limit=dense_entry_limit
        )
        component_data = tuple(components)
        if len(component_data) < 2:
            raise ValueError(
                "the general component engine requires multiple ideal classes"
            )
        if not all(
            isinstance(value, QuaternionIdealComponent) for value in component_data
        ):
            raise TypeError("quaternion ideal components are required")
        modulus = component_data[0].modulus()
        if any(component.modulus() != modulus for component in component_data):
            raise ValueError("all components must use the same local level")
        offsets = [0]
        for component in component_data:
            offsets.append(offsets[-1] + component.cardinality())
        correspondence_data = tuple(correspondences)
        if not correspondence_data:
            raise ValueError("at least one good Hecke correspondence is required")
        labels = []
        checked_correspondences = []
        for correspondence in correspondence_data:
            if not isinstance(correspondence, QuaternionHeckeCorrespondence):
                raise TypeError("quaternion Hecke correspondences are required")
            if correspondence.label() in labels:
                raise ValueError("Hecke correspondence labels must be unique")
            labels.append(correspondence.label())
            counts = [0 for _component in component_data]
            checked = []
            for source, target, matrices in correspondence.transitions():
                if source < 0 or source >= len(component_data):
                    raise IndexError("source component is out of range")
                if target < 0 or target >= len(component_data):
                    raise IndexError("target component is out of range")
                normalized_matrices = tuple(
                    _normalize_matrix(matrix, modulus) for matrix in matrices
                )
                counts[source] += len(normalized_matrices)
                checked.append((source, target, normalized_matrices))
            if any(count != correspondence.degree() for count in counts):
                raise ArithmeticError(
                    "every source component needs norm-plus-one transporters"
                )
            checked_correspondences.append(
                QuaternionHeckeCorrespondence(
                    correspondence.label(), correspondence.norm(), checked
                )
            )
        self._components = component_data
        self._offsets = tuple(offsets)
        self._modulus = modulus
        self._correspondences = tuple(checked_correspondences)

    def components(self) -> tuple[QuaternionIdealComponent, ...]:
        return self._components

    def component_count(self) -> int:
        return len(self._components)

    def component_offsets(self) -> tuple[int, ...]:
        return self._offsets

    def cardinality(self) -> int:
        return self._offsets[-1]

    def _component_orbit(self, index: Any) -> tuple[int, int]:
        position = _integer(index, "finite-set index")
        if position < 0 or position >= self.cardinality():
            raise IndexError("finite-set index is out of range")
        for component in range(len(self._components)):
            if position < self._offsets[component + 1]:
                return (component, position - self._offsets[component])
        raise ArithmeticError("finite-set component lookup failed")

    def mass(self, index: Any) -> Any:
        component, orbit = self._component_orbit(index)
        return self._components[component].mass(orbit)

    def resolve_correspondence(self, index: Any) -> QuaternionHeckeCorrespondence:
        if isinstance(index, QuaternionHeckeCorrespondence):
            for correspondence in self._correspondences:
                if correspondence == index:
                    return correspondence
            raise ValueError("the Hecke correspondence belongs to another finite set")
        label = str(index)
        for correspondence in self._correspondences:
            if correspondence.label() == label:
                return correspondence
        raise NotImplementedError("no Hecke correspondence is registered for " + label)

    def hecke_degree(self, index: Any) -> int:
        return self.resolve_correspondence(index).degree()

    def hecke_label(self, index: Any) -> str:
        return "T_(" + self.resolve_correspondence(index).label() + ")"

    def hecke_row(self, index: Any, row: Any) -> tuple[tuple[int, int], ...]:
        correspondence = self.resolve_correspondence(index)
        source, orbit = self._component_orbit(row)
        source_component = self._components[source]
        representative = source_component.representative_indices()[orbit]
        counts: dict[int, int] = {}
        for transition_source, target, matrices in correspondence.transitions():
            if transition_source != source:
                continue
            target_component = self._components[target]
            for matrix in matrices:
                point = QuaternionIdealComponent.act(
                    representative,
                    matrix,
                    modulus=self._modulus,
                    residue_prime=source_component.residue_prime(),
                )
                target_orbit = target_component.orbit_index(point)
                target_index = self._offsets[target] + target_orbit
                counts[target_index] = counts.get(target_index, 0) + 1
        if sum(counts.values()) != correspondence.degree():
            raise ArithmeticError("a quaternion Hecke row has the wrong degree")
        return tuple((column, counts[column]) for column in sorted(counts))

    def hecke_operator(self, index: Any) -> SparseHeckeOperator:
        correspondence = self.resolve_correspondence(index)
        return FiniteHeckeSet.hecke_operator(self, correspondence)

    T = hecke_operator

    def component_eisenstein_basis(self) -> tuple[Any, ...]:
        basis = []
        for component in range(len(self._components)):
            vector = [sage.ZZ(0) for _index in range(self.cardinality())]
            for index in range(self._offsets[component], self._offsets[component + 1]):
                vector[index] = sage.ZZ(1)
            basis.append(_global("vector")(sage.ZZ, vector))
        return tuple(basis)

    def is_cuspidal(self, vector: Any) -> bool:
        entries = [sage.QQ(value) for value in vector]
        if len(entries) != self.cardinality():
            raise ValueError("cuspidal vector has the wrong length")
        for component in range(len(self._components)):
            total = sage.QQ(0)
            for index in range(self._offsets[component], self._offsets[component + 1]):
                total += self.mass(index) * entries[index]
            if total != 0:
                return False
        return True

    def cuspidal_dimension(self) -> int:
        return self.cardinality() - len(self._components)

    def cuspidal_operator(self, index: Any) -> ComponentCuspidalHeckeOperator:
        return ComponentCuspidalHeckeOperator(
            self,
            self.hecke_operator(index),
            dense_entry_limit=self._finite_hecke_dense_limit,
        )


class QuaternionComponentDegeneracyMap:
    """One exact adjacent-level map between compatible component packets."""

    def __init__(
        self,
        domain: QuaternionComponentHeckeSet,
        codomain: QuaternionComponentHeckeSet,
        correspondence: QuaternionHeckeCorrespondence | None = None,
        *,
        dense_entry_limit: Any = 1000000,
    ) -> None:
        if not isinstance(domain, QuaternionComponentHeckeSet) or not isinstance(
            codomain, QuaternionComponentHeckeSet
        ):
            raise TypeError("component Hecke sets are required")
        high_components = domain.components()
        low_components = codomain.components()
        if len(high_components) != len(low_components):
            raise ValueError("degeneracy packets need the same ideal components")
        if not all(
            high.reduces_to(low)
            for high, low in zip(high_components, low_components, strict=True)
        ):
            raise ValueError("degeneracy packets do not have compatible local data")
        if correspondence is not None and not isinstance(
            correspondence, QuaternionHeckeCorrespondence
        ):
            raise TypeError("a quaternion transporter correspondence is required")

        row_offsets = [0]
        columns = []
        values = []
        expected_degree = (
            1 if correspondence is None else high_components[0].residue_prime()
        )
        for row in range(domain.cardinality()):
            source, orbit = domain._component_orbit(row)
            high_component = high_components[source]
            representative = high_component.representative_indices()[orbit]
            counts: dict[int, int] = {}
            if correspondence is None:
                targets = ((source, representative),)
            else:
                images = []
                for transition_source, target, matrices in correspondence.transitions():
                    if transition_source != source:
                        continue
                    for matrix in matrices:
                        try:
                            point = QuaternionIdealComponent.transport(
                                representative,
                                matrix,
                                modulus=high_component.modulus(),
                                residue_prime=high_component.residue_prime(),
                            )
                        except ArithmeticError:
                            continue
                        images.append((target, point))
                targets = tuple(images)
            for target, point in targets:
                high_target = high_components[target]
                low_target = low_components[target]
                first, second = high_target.coordinates(point)
                reduced = low_target.standard_index(
                    first % low_target.modulus(), second % low_target.modulus()
                )
                target_orbit = low_target.orbit_index(reduced)
                target_index = codomain.component_offsets()[target] + target_orbit
                counts[target_index] = counts.get(target_index, 0) + 1
            if sum(counts.values()) != expected_degree:
                raise ArithmeticError("a degeneracy row has the wrong degree")
            for column in sorted(counts):
                columns.append(column)
                values.append(counts[column])
            row_offsets.append(len(columns))

        label = "identity" if correspondence is None else correspondence.label()
        self._domain = domain
        self._codomain = codomain
        self._label = label
        self._operator = SparseHeckeOperator(
            sage.QQ,
            domain.cardinality(),
            codomain.cardinality(),
            row_offsets,
            columns,
            values,
            index=label,
            name="Sparse quaternion-component degeneracy map " + label,
            dense_entry_limit=dense_entry_limit,
        )
        runtime.object.freeze(self)

    def domain(self) -> QuaternionComponentHeckeSet:
        return self._domain

    def codomain(self) -> QuaternionComponentHeckeSet:
        return self._codomain

    def label(self) -> str:
        return self._label

    def sparse_operator(self) -> SparseHeckeOperator:
        return self._operator

    def matrix(self) -> Any:
        return self._operator.matrix()

    def pullback(self, vector: Any) -> Any:
        return self._operator.apply(vector)

    def pushforward(self, vector: Any) -> Any:
        return self._operator.transpose_apply(vector)

    def commutes_with_hecke(self, index: Any) -> bool:
        high = self._domain.hecke_operator(index)
        low = self._codomain.hecke_operator(index)
        for row in range(self._domain.cardinality()):
            if high._product_row(self._operator, row) != self._operator._product_row(
                low, row
            ):
                return False
        return True


class QuaternionComponentDegeneracyTrace:
    r"""One downward trace used at an adjacent prime-power level.

    At level $\mathfrak p^e$ with $e\geq 2$, the robust old/new algorithm uses
    the common kernel of the identity and $\mathfrak p$ trace operators.  This
    is also the convention used by Magma's definite Hilbert modular-form
    implementation.  The stored matrix acts on row vectors on the right; the
    public Hecke operators act on function columns, so equivariance is checked
    against their transposes.
    """

    def __init__(
        self,
        domain: QuaternionComponentHeckeSet,
        codomain: QuaternionComponentHeckeSet,
        correspondence: QuaternionHeckeCorrespondence | None = None,
        *,
        dense_entry_limit: Any = 1000000,
    ) -> None:
        if not isinstance(domain, QuaternionComponentHeckeSet) or not isinstance(
            codomain, QuaternionComponentHeckeSet
        ):
            raise TypeError("component Hecke sets are required")
        high_components = domain.components()
        low_components = codomain.components()
        if len(high_components) != len(low_components):
            raise ValueError("degeneracy packets need the same ideal components")
        if not all(
            high.reduces_to(low)
            for high, low in zip(high_components, low_components, strict=True)
        ):
            raise ValueError("degeneracy packets do not have compatible local data")
        if correspondence is not None and not isinstance(
            correspondence, QuaternionHeckeCorrespondence
        ):
            raise TypeError("a quaternion transporter correspondence is required")

        size = domain.cardinality()
        row_data: list[dict[int, int]] = [{} for _index in range(size)]
        if correspondence is None:
            high_offsets = domain.component_offsets()
            for component_index, (high, low) in enumerate(
                zip(high_components, low_components, strict=True)
            ):
                fibers: list[list[int]] = [
                    [] for _point in range(low.projective_cardinality())
                ]
                for point in range(high.projective_cardinality()):
                    first, second = high.coordinates(point)
                    reduced = low.standard_index(
                        first % low.modulus(), second % low.modulus()
                    )
                    fibers[reduced].append(point)
                offset = high_offsets[component_index]
                for representative in high.representative_indices():
                    first, second = high.coordinates(representative)
                    reduced = low.standard_index(
                        first % low.modulus(), second % low.modulus()
                    )
                    counts: dict[int, int] = {}
                    for point in fibers[reduced]:
                        orbit = high.orbit_index(point)
                        counts[orbit] = counts.get(orbit, 0) + 1
                    for column in counts:
                        target_column = offset + column
                        for row, multiplicity in counts.items():
                            target_row = offset + row
                            previous = row_data[target_row].get(target_column)
                            if previous is not None and previous != multiplicity:
                                raise ArithmeticError(
                                    "the identity trace has incompatible fibre counts"
                                )
                            row_data[target_row][target_column] = multiplicity
            expected_column_degree = high_components[0].residue_prime()
            column_degrees = [0 for _index in range(size)]
            for row in range(size):
                for column, value in row_data[row].items():
                    column_degrees[column] += value
            if any(value != expected_column_degree for value in column_degrees):
                raise ArithmeticError("an identity trace fibre has the wrong degree")
            label = "identity-trace"
        else:
            # First form the bad-prime row correspondence.  Exactly one of the
            # norm-plus-one singular transporters kills each primitive point;
            # the remaining norm-many images give U_p.  Magma's downward trace
            # is its transpose in our function-column convention.
            offsets = domain.component_offsets()
            image_rows: list[dict[int, int]] = [{} for _index in range(size)]
            expected_degree = high_components[0].residue_prime()
            for row in range(size):
                source, orbit = domain._component_orbit(row)
                high = high_components[source]
                representative = high.representative_indices()[orbit]
                for transition_source, target, matrices in correspondence.transitions():
                    if transition_source != source:
                        continue
                    for matrix in matrices:
                        try:
                            point = QuaternionIdealComponent.transport(
                                representative,
                                matrix,
                                modulus=high.modulus(),
                                residue_prime=high.residue_prime(),
                            )
                        except ArithmeticError:
                            continue
                        column = offsets[target] + high_components[target].orbit_index(
                            point
                        )
                        image_rows[row][column] = image_rows[row].get(column, 0) + 1
                if sum(image_rows[row].values()) != expected_degree:
                    raise ArithmeticError("a prime trace row has the wrong degree")
            for row in range(size):
                for column, value in image_rows[row].items():
                    row_data[column][row] = value
            label = correspondence.label() + "-trace"

        row_offsets = [0]
        columns = []
        values = []
        for row in row_data:
            for column in sorted(row):
                columns.append(column)
                values.append(row[column])
            row_offsets.append(len(columns))
        self._domain = domain
        self._codomain = codomain
        self._label = label
        self._operator = SparseHeckeOperator(
            sage.QQ,
            size,
            size,
            row_offsets,
            columns,
            values,
            index=label,
            name="Sparse quaternion-component downward trace " + label,
            dense_entry_limit=dense_entry_limit,
        )
        runtime.object.freeze(self)

    def domain(self) -> QuaternionComponentHeckeSet:
        return self._domain

    def codomain(self) -> QuaternionComponentHeckeSet:
        return self._codomain

    def direction(self) -> str:
        return "downward"

    def label(self) -> str:
        return self._label

    def sparse_operator(self) -> SparseHeckeOperator:
        return self._operator

    def matrix(self) -> Any:
        return self._operator.matrix()

    def kernel_matrix(self) -> Any:
        return self.matrix().left_kernel_matrix()

    def commutes_with_hecke(self, index: Any) -> bool:
        hecke = self._domain.hecke_operator(index).matrix()
        trace = self.matrix()
        return hecke.transpose() * trace == trace * hecke.transpose()


class ExactHeckeSubspace:
    """An exact rational subspace with verified restricted Hecke actions."""

    def __init__(
        self,
        finite_set: QuaternionComponentHeckeSet,
        basis_rows: Iterable[Any],
        *,
        name: str,
    ) -> None:
        rows = [list(row) for row in basis_rows]
        if any(len(row) != finite_set.cardinality() for row in rows):
            raise ValueError("a subspace basis row has the wrong ambient degree")
        if rows:
            source = _global("matrix")(sage.QQ, rows)
        else:
            source = _global("matrix")(sage.QQ, 0, finite_set.cardinality(), [])
        self._finite_set = finite_set
        self._basis = source.row_space().basis_matrix()
        self._space = self._basis.row_space()
        self._name = name
        runtime.object.freeze(self)

    def ambient_dimension(self) -> int:
        return self._finite_set.cardinality()

    def dimension(self) -> int:
        return self._basis.nrows()

    rank = dimension

    def basis_matrix(self) -> Any:
        return self._basis

    def contains(self, vector: Any) -> bool:
        entries = _global("vector")(sage.QQ, [sage.QQ(value) for value in vector])
        if len(entries) != self.ambient_dimension():
            return False
        return entries in self._space

    def hecke_matrix(self, index: Any) -> Any:
        operator = self._finite_set.hecke_operator(index)
        columns = []
        for basis_row in self._basis.rows():
            image_entries = []
            for row in range(self.ambient_dimension()):
                total = sage.QQ(0)
                for column, multiplicity in operator.row(row):
                    total += sage.QQ(multiplicity) * sage.QQ(basis_row[column])
                image_entries.append(total)
            image = _global("vector")(sage.QQ, image_entries)
            if not self.contains(image):
                raise ArithmeticError("the exact subspace is not Hecke invariant")
            coordinates = self._basis.transpose().solve_right(image)
            columns.append(list(coordinates))
        rows = []
        for row in range(self.dimension()):
            rows.append([columns[column][row] for column in range(self.dimension())])
        return _global("matrix")(sage.QQ, rows)

    T = hecke_matrix

    def __repr__(self) -> str:
        return self._name + " of dimension " + str(self.dimension())

    __str__ = __repr__
    toString = __repr__


class QuaternionOldNewDecomposition:
    """The exact old/new decomposition from two downward degeneracy traces."""

    def __init__(
        self,
        identity_map: QuaternionComponentDegeneracyTrace,
        prime_map: QuaternionComponentDegeneracyTrace,
    ) -> None:
        if not isinstance(
            identity_map, QuaternionComponentDegeneracyTrace
        ) or not isinstance(prime_map, QuaternionComponentDegeneracyTrace):
            raise TypeError("two quaternion degeneracy traces are required")
        if (
            identity_map.domain() is not prime_map.domain()
            or identity_map.codomain() is not prime_map.codomain()
        ):
            raise ValueError(
                "oldspace maps must share exact domain and codomain packets"
            )
        high = identity_map.domain()
        traces = identity_map.matrix().augment(prime_map.matrix())
        new_basis = traces.left_kernel_matrix()
        new = ExactHeckeSubspace(high, new_basis.rows(), name="Quaternion new subspace")
        if any(not high.is_cuspidal(row) for row in new.basis_matrix().rows()):
            raise ArithmeticError("the common trace kernel is not cuspidal")

        # Recover the oldspace as the mass-orthogonal complement of the exact
        # newspace inside the componentwise cusp space.  This avoids choosing
        # arbitrary upward lifts and makes the pairing convention explicit.
        constraints = []
        offsets = high.component_offsets()
        for component in range(high.component_count()):
            row = [sage.QQ(0) for _index in range(high.cardinality())]
            for index in range(offsets[component], offsets[component + 1]):
                row[index] = high.mass(index)
            constraints.append(row)
        for basis_vector in new.basis_matrix().rows():
            constraints.append(
                [
                    high.mass(index) * sage.QQ(basis_vector[index])
                    for index in range(high.cardinality())
                ]
            )
        constraint_matrix = _global("matrix")(sage.QQ, constraints)
        old_basis = constraint_matrix.right_kernel_matrix()
        old = ExactHeckeSubspace(high, old_basis.rows(), name="Quaternion old subspace")
        if old.dimension() + new.dimension() != high.cuspidal_dimension():
            raise ArithmeticError("old and new dimensions do not fill the cusp space")
        self._identity_map = identity_map
        self._prime_map = prime_map
        self._old = old
        self._new = new
        runtime.object.freeze(self)

    def degeneracy_maps(
        self,
    ) -> tuple[QuaternionComponentDegeneracyTrace, QuaternionComponentDegeneracyTrace]:
        return (self._identity_map, self._prime_map)

    def old_subspace(self) -> ExactHeckeSubspace:
        return self._old

    def new_subspace(self) -> ExactHeckeSubspace:
        return self._new


class ComponentCuspidalHeckeOperator:
    """Exact sparse ambient action on the componentwise cuspidal quotient."""

    def __init__(
        self,
        finite_set: QuaternionComponentHeckeSet,
        operator: SparseHeckeOperator,
        *,
        dense_entry_limit: Any = 1000000,
    ) -> None:
        if not isinstance(finite_set, QuaternionComponentHeckeSet):
            raise TypeError("a quaternion component finite set is required")
        self._finite_set = finite_set
        self._operator = operator
        self._dimension = finite_set.cuspidal_dimension()
        self._dense_entry_limit = _integer(dense_entry_limit, "dense entry limit")
        runtime.object.freeze(self)

    def nrows(self) -> int:
        return self._dimension

    ncols = nrows
    degree = nrows
    dimension = nrows

    def hecke_index(self) -> Any:
        return self._operator.hecke_index()

    def is_sparse(self) -> bool:
        return True

    def lift(self, vector: Any) -> Any:
        coordinates = [sage.QQ(value) for value in vector]
        if len(coordinates) != self._dimension:
            raise ValueError("vector length does not match the cuspidal quotient")
        ambient = [sage.QQ(0) for _index in range(self._finite_set.cardinality())]
        coordinate = 0
        offsets = self._finite_set.component_offsets()
        for component in range(self._finite_set.component_count()):
            start, stop = offsets[component], offsets[component + 1]
            anchor = stop - 1
            weighted = sage.QQ(0)
            for index in range(start, anchor):
                value = coordinates[coordinate]
                ambient[index] = value
                weighted += self._finite_set.mass(index) * value
                coordinate += 1
            ambient[anchor] = -weighted / self._finite_set.mass(anchor)
        return _global("vector")(sage.QQ, ambient)

    def coordinates(self, vector: Any) -> Any:
        ambient = [sage.QQ(value) for value in vector]
        if len(ambient) != self._finite_set.cardinality():
            raise ValueError("ambient vector has the wrong length")
        if not self._finite_set.is_cuspidal(ambient):
            raise ValueError("the ambient vector is not componentwise cuspidal")
        answer = []
        offsets = self._finite_set.component_offsets()
        for component in range(self._finite_set.component_count()):
            start, stop = offsets[component], offsets[component + 1]
            answer.extend(ambient[start : stop - 1])
        return _global("vector")(sage.QQ, answer)

    def apply(self, vector: Any) -> Any:
        ambient = list(self.lift(vector))
        image = []
        for row in range(self._finite_set.cardinality()):
            total = sage.QQ(0)
            for column, multiplicity in self._operator.row(row):
                total += sage.QQ(multiplicity) * ambient[column]
            image.append(total)
        if not self._finite_set.is_cuspidal(image):
            raise ArithmeticError("the Hecke action did not preserve the cusp space")
        return self.coordinates(image)

    def matrix(self, max_entries: Any = None, force: bool = False) -> Any:
        limit = (
            self._dense_entry_limit
            if max_entries is None
            else _integer(max_entries, "dense entry limit")
        )
        entries = self._dimension * self._dimension
        if not force and entries > limit:
            raise MemoryError(
                "cuspidal dense materialization needs "
                + str(entries)
                + " entries, above the explicit limit "
                + str(limit)
            )
        columns = []
        for column in range(self._dimension):
            basis = [sage.QQ(0) for _index in range(self._dimension)]
            basis[column] = sage.QQ(1)
            columns.append(list(self.apply(basis)))
        rows = []
        for row in range(self._dimension):
            rows.append([columns[column][row] for column in range(self._dimension)])
        return _global("matrix")(sage.QQ, rows)

    dense_matrix = matrix

    def __mul__(self, vector: Any) -> Any:
        return self.apply(vector)

    def _sage_binop_(self, operator: str, other: Any, reflected: bool) -> Any:
        if operator == "mul" and not reflected:
            return self.apply(other)
        raise TypeError(
            "operation " + operator + " is not defined for cuspidal Hecke operators"
        )


__all__ = [
    "ComponentCuspidalHeckeOperator",
    "ExactHeckeSubspace",
    "QuaternionComponentDegeneracyMap",
    "QuaternionComponentDegeneracyTrace",
    "QuaternionComponentHeckeSet",
    "QuaternionHeckeCorrespondence",
    "QuaternionIdealComponent",
    "QuaternionOldNewDecomposition",
]
