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
    if determinant == 0:
        raise ValueError("a projective matrix must be invertible")
    return (data[0], data[1], data[2], data[3])


def _projective_matrix(matrix: Matrix2, modulus: int) -> Matrix2:
    for value in matrix:
        if value % modulus:
            scale = _inverse(value, modulus)
            return tuple((entry * scale) % modulus for entry in matrix)  # type: ignore[return-value]
    raise ArithmeticError("an invertible matrix cannot be projectively zero")


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
        representatives: Iterable[Any] | None = None,
    ) -> None:
        prime = _integer(modulus, "projective modulus")
        if prime < 3 or not sage.is_prime(prime):
            raise ValueError("the first component engine requires an odd prime modulus")
        units = tuple(_normalize_matrix(matrix, prime) for matrix in unit_matrices)
        if not units:
            raise ValueError("a quaternion component needs its projective unit group")
        projective_units: list[Matrix2] = []
        for matrix in units:
            normalized = _projective_matrix(matrix, prime)
            if normalized not in projective_units:
                projective_units.append(normalized)
        identity = (1, 0, 0, 1)
        if identity not in projective_units:
            raise ArithmeticError("the projective unit data has no identity")
        for left in projective_units:
            for right in projective_units:
                product = _projective_matrix(_matrix_product(left, right, prime), prime)
                if product not in projective_units:
                    raise ArithmeticError("the projective unit data is not a group")
        table = [-1 for _index in range(prime + 1)]
        automatic_representatives = []
        orbit_sizes = []
        for point in range(prime + 1):
            if table[point] >= 0:
                continue
            orbit_index = len(automatic_representatives)
            orbit = {self.act(point, matrix, modulus=prime) for matrix in units}
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
            if any(value < 0 or value > prime for value in requested):
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
        self._modulus = prime
        self._units = units
        self._projective_unit_order = len(projective_units)
        self._table = tuple(table)
        self._representatives = tuple(automatic_representatives)
        self._orbit_sizes = tuple(orbit_sizes)
        runtime.object.freeze(self)

    @staticmethod
    def act(point: Any, matrix: Iterable[Any], *, modulus: Any) -> int:
        prime = _integer(modulus, "projective modulus")
        position = _integer(point, "projective point")
        if position < 0 or position > prime:
            raise IndexError("projective point is out of range")
        normalized = _normalize_matrix(matrix, prime)
        if position == 0:
            first, second = 0, 1
        else:
            first, second = 1, position - 1
        a, b, c, d = normalized
        # Magma's ``ProjectiveLine(Type := "Matrix")`` stores a projective
        # point as a column and the residue splitting acts on the left.
        image_first = (a * first + b * second) % prime
        image_second = (c * first + d * second) % prime
        if image_first == 0:
            return 0
        return 1 + image_second * _inverse(image_first, prime) % prime

    def label(self) -> str:
        return self._label

    def modulus(self) -> int:
        return self._modulus

    def projective_cardinality(self) -> int:
        return self._modulus + 1

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
        answer = []
        for point in self._representatives:
            if point == 0:
                answer.append((0, 1))
            else:
                answer.append((1, point - 1))
        return tuple(answer)

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
                    representative, matrix, modulus=self._modulus
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
    "QuaternionComponentHeckeSet",
    "QuaternionHeckeCorrespondence",
    "QuaternionIdealComponent",
]
