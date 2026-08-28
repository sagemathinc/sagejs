"""Prime-level supersingular modules and Mestre's graph method.

This is an ordinary-Python implementation of the level-one module of divisors
on supersingular elliptic curves. The $T_2$ operator is discovered as a sparse
isogeny multigraph using the classical modular polynomial and its quadratic
continuation. The formulas and public surface follow SageMath's GPL-licensed
`sage.modular.ssmod.ssmod` implementation by Stein, Kohel, and Burhanuddin;
the immutable CSR and weighted graph interfaces are Sage.js additions.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any, Iterator, Sequence

import sagejs as sage
import sagejs.runtime as runtime

from .modular_polynomial import classical_modular_polynomial
from .sparse_hecke import SparseHeckeOperator


def _global(name: str) -> Any:
    return runtime.reflect.get(runtime.global_object, name)


def _integer(value: Any, label: str) -> int:
    normalized = runtime.normalize_integer(value)
    if runtime.jstype(normalized) != "number" or not runtime.number.isSafeInteger(
        normalized
    ):
        raise TypeError(label + " must be an exact machine integer")
    return runtime.number(normalized)


def _prime(value: Any) -> int:
    answer = _integer(value, "prime")
    if answer < 5 or not bool(sage.is_prime(answer)):
        raise ValueError("the argument prime must be a prime number at least 5")
    return answer


def dimension_supersingular_module(prime: Any, level: Any = 1) -> int:
    """Return the rank of the level-one supersingular module."""
    characteristic = _prime(prime)
    auxiliary_level = _integer(level, "level")
    if auxiliary_level != 1:
        raise NotImplementedError(
            "supersingular modules of level > 1 are not implemented"
        )
    residue = characteristic % 12
    correction = 0
    if residue in [5, 7]:
        correction = 1
    elif residue == 11:
        correction = 2
    return characteristic // 12 + correction


def _deuring_supersingular_j(field: Any, prime: int) -> Any:
    """Return a deterministic root of the Deuring polynomial fallback."""
    degree = (prime - 1) // 2
    coefficients = []
    coefficient = 1
    for index in range(degree + 1):
        coefficients.append(field(coefficient))
        if index != degree:
            numerator = degree - index
            denominator = index + 1
            ratio = numerator * pow(denominator, prime - 2, prime) % prime
            coefficient = coefficient * ratio * ratio % prime
    ring = _global("PolynomialRing")(field, "lambda")
    roots = ring(coefficients).roots(multiplicities=False)
    if len(roots) == 0:
        raise ArithmeticError("the Deuring polynomial has no root in GF(p^2)")
    parameter = roots[0]
    one = field(1)
    numerator = field(256) * (one - parameter + parameter * parameter) ** 3
    denominator = parameter * parameter * (one - parameter) ** 2
    if denominator == field(0):
        raise ArithmeticError("the Deuring root is a singular Legendre parameter")
    return numerator / denominator


def supersingular_j(field: Any, *, all: bool = False) -> Any:
    """Return one supersingular $j$-invariant in a finite field of degree two."""
    if getattr(field, "_kind", None) != "GF_EXTENSION" or int(field.degree()) != 2:
        raise ValueError("supersingular_j currently requires GF(p^2)")
    prime = _prime(field.characteristic())
    if all:
        module = SupersingularModule(prime)
        return module.supersingular_points()[0]
    kronecker = _global("kronecker")
    cm_values = [
        (-4, 1728),
        (-8, 8000),
        (-3, 0),
        (-7, 16581375),
        (-11, -32768),
        (-19, -884736),
        (-43, -884736000),
        (-67, -147197952000),
        (-163, -262537412640768000),
    ]
    for discriminant, j_invariant in cm_values:
        if int(kronecker(discriminant, prime)) != 1:
            return field(j_invariant)
    return _deuring_supersingular_j(field, prime)


def _phi2_polynomial(generator: Any, j_invariant: Any) -> Any:
    r"""Return $\Phi_2(X,j)$ using the classical integral formula."""
    ring = generator.parent()
    square = j_invariant * j_invariant
    cube = square * j_invariant
    return ring(
        [
            cube - 162000 * square + 8748000000 * j_invariant - 157464000000000,
            1488 * square + 40773375 * j_invariant + 8748000000,
            -square + 1488 * j_invariant - 162000,
            1,
        ]
    )


def _phi2_quadratic(generator: Any, previous: Any, current: Any) -> Any:
    r"""Return $\Phi_2(X,current)/(X-previous)$ exactly."""
    ring = generator.parent()
    previous_square = previous * previous
    current_square = current * current
    return ring(
        [
            (-previous + 1488) * current_square
            + (1488 * previous + 40773375) * current
            + previous_square
            - 162000 * previous
            + 8748000000,
            -current_square + 1488 * current + (previous - 162000),
            1,
        ]
    )


def _find_equal(values: Sequence[Any], target: Any) -> int:
    """Return the first exact-equal point without identity or text keys."""
    for index, value in enumerate(values):
        if value == target:
            return index
    return -1


def _legacy_power_basis_coordinates(element: Any, field: Any) -> tuple[Any, ...]:
    """Parse a legacy FLINT rendering, then authenticate it by reconstruction."""
    raw = runtime.flint_backend().fqToString(element._native)
    degree = int(field.degree())
    prime = runtime.bigint(field.characteristic())
    variable = field.variable_name()
    coordinates = [runtime.bigint(0) for _index in range(degree)]
    occupied = [False for _index in range(degree)]
    if raw != "0":
        for term in raw.split("+"):
            pieces = term.split("*")
            if len(pieces) == 1:
                coefficient_text = "1" if pieces[0].startswith(variable) else pieces[0]
                monomial = pieces[0] if pieces[0].startswith(variable) else ""
            elif len(pieces) == 2:
                coefficient_text, monomial = pieces
            else:
                raise ArithmeticError("legacy finite-field coordinates are malformed")
            coefficient = runtime.bigint(coefficient_text)
            if coefficient < 0 or coefficient >= prime:
                raise ArithmeticError("legacy finite-field coordinate is not reduced")
            if monomial == "":
                exponent = 0
            elif monomial == variable:
                exponent = 1
            elif monomial.startswith(variable + "^"):
                exponent = int(monomial[len(variable) + 1 :])
            else:
                raise ArithmeticError("legacy finite-field monomial is malformed")
            if exponent < 0 or exponent >= degree or occupied[exponent]:
                raise ArithmeticError("legacy finite-field power basis is malformed")
            coordinates[exponent] = coefficient
            occupied[exponent] = True

    # The formatted string supplies only a candidate.  Exact field equality is
    # the authority, so changes in FLINT formatting fail closed rather than
    # changing a point identity or cache key.
    reconstructed = field(0)
    power = field(1)
    generator = field.gen()
    for coordinate in coordinates:
        reconstructed += field(coordinate) * power
        power *= generator
    if reconstructed != element:
        raise ArithmeticError("legacy finite-field coordinates failed exact replay")
    return tuple(runtime.normalize_integer(value) for value in coordinates)


def _power_basis_coordinates(element: Any, field: Any) -> tuple[Any, ...]:
    """Return authenticated backend-independent power-basis coordinates."""
    if getattr(element, "_parent", None) is not field:
        raise TypeError("the finite-field element belongs to another parent")
    if bool(getattr(field, "_generatedResourceBackend", False)):
        coordinates = tuple(
            runtime.normalize_integer(value)
            for value in element._power_basis_coordinates()
        )
        if len(coordinates) != int(field.degree()):
            raise ArithmeticError("generated finite-field coordinates have wrong width")
        prime = runtime.bigint(field.characteristic())
        if any(value < 0 or value >= prime for value in coordinates):
            raise ArithmeticError("generated finite-field coordinate is not reduced")
        reconstructed = field(0)
        power = field(1)
        generator = field.gen()
        for coordinate in coordinates:
            reconstructed += field(coordinate) * power
            power *= generator
        if reconstructed != element:
            raise ArithmeticError("generated finite-field coordinates failed replay")
        return coordinates
    return _legacy_power_basis_coordinates(element, field)


def _fingerprint_digest(fingerprint: Any) -> str:
    payload = repr(fingerprint).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def _cache_digest(payload: Any) -> str:
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def _modular_polynomial_fingerprint(index: int) -> tuple[Any, ...]:
    if index == 2:
        return (
            "sagejs-classical-modular-polynomial-v1",
            2,
            (
                (0, 3, "1"),
                (1, 2, "1488"),
                (1, 1, "40773375"),
                (0, 2, "-162000"),
                (0, 1, "8748000000"),
                (0, 0, "-157464000000000"),
                (2, 2, "-1"),
            ),
        )
    polynomial = classical_modular_polynomial(index)
    return (
        "sagejs-classical-modular-polynomial-v1",
        index,
        tuple((left, right, str(value)) for left, right, value in polynomial.terms()),
    )


def _primitive_integer_vector(vector: Any) -> list[Any]:
    entries = [sage.ZZ(value) for value in vector]
    common = sage.ZZ(0)
    for value in entries:
        right = abs(value)
        while right != 0:
            common, right = right, common % right
    if common == 0:
        raise ArithmeticError("an eigenspace basis vector is zero")
    entries = [value // common for value in entries]
    for value in entries:
        if value < 0:
            return [-entry for entry in entries]
        if value > 0:
            return entries
    raise ArithmeticError("an eigenspace basis vector is zero")


class SupersingularPointIndex:
    """A read-only equality-based mapping from exact $j$ values to indices."""

    def __init__(self, points: list[Any]) -> None:
        self._points = tuple(points)

    def __len__(self) -> int:
        return len(self._points)

    def __getitem__(self, point: Any) -> int:
        index = _find_equal(self._points, point)
        if index < 0:
            raise KeyError(point)
        return index

    def __contains__(self, point: Any) -> bool:
        return _find_equal(self._points, point) >= 0

    def __iter__(self) -> Iterator[Any]:
        return iter(self._points)

    def items(self) -> Iterator[tuple[Any, int]]:
        for index, point in enumerate(self._points):
            yield (point, index)

    def __repr__(self) -> str:
        pieces = []
        for point, index in self.items():
            pieces.append(repr(point) + ": " + str(index))
        return "{" + ", ".join(pieces) + "}"

    __str__ = __repr__
    toString = __repr__


class NormalizedAdjacencyOperator:
    """Mass-normalized self-adjoint realization of a Brandt operator."""

    def __init__(
        self,
        module: SupersingularModule,
        operator: SparseHeckeOperator,
        *,
        dense_entry_limit: int = 1000000,
    ) -> None:
        self._module = module
        self._operator = operator
        self._dense_entry_limit = dense_entry_limit
        self._masses = tuple(float(value) for value in module.mass_weights())
        runtime.object.freeze(self)

    def nrows(self) -> int:
        return self._operator.nrows()

    def ncols(self) -> int:
        return self._operator.ncols()

    def is_sparse(self) -> bool:
        return True

    def apply(self, vector: Any) -> Any:
        entries = [float(value) for value in vector]
        if len(entries) != self.ncols():
            raise ValueError("vector length does not match the normalized operator")
        scaled = [
            entries[index] / runtime.math.sqrt(self._masses[index])
            for index in range(self.ncols())
        ]
        answer = []
        for row in range(self.nrows()):
            total = 0.0
            for column, multiplicity in self._operator.row(row):
                total += float(multiplicity) * scaled[column]
            answer.append(runtime.math.sqrt(self._masses[row]) * total)
        return _global("vector")(_global("RDF"), answer)

    def matrix(self, max_entries: Any = None, force: bool = False) -> Any:
        limit = (
            self._dense_entry_limit
            if max_entries is None
            else _integer(max_entries, "dense entry limit")
        )
        if limit < 0:
            raise ValueError("dense entry limit must be nonnegative")
        entries = self.nrows() * self.ncols()
        if not force and entries > limit:
            raise MemoryError(
                "normalized dense materialization needs "
                + str(entries)
                + " entries, above the explicit limit "
                + str(limit)
            )
        rows = []
        for row in range(self.nrows()):
            values = [0.0 for _column in range(self.ncols())]
            row_scale = runtime.math.sqrt(self._masses[row])
            for column, multiplicity in self._operator.row(row):
                values[column] = (
                    row_scale
                    * float(multiplicity)
                    / runtime.math.sqrt(self._masses[column])
                )
            rows.append(values)
        return _global("matrix")(_global("RDF"), rows)

    dense_matrix = matrix

    def __mul__(self, vector: Any) -> Any:
        return self.apply(vector)

    def _sage_binop_(self, operator: str, other: Any, reflected: bool) -> Any:
        if operator == "mul" and not reflected:
            return self.apply(other)
        raise TypeError(
            "operation "
            + operator
            + " is not defined for normalized adjacency operators"
        )

    def __repr__(self) -> str:
        return "Mass-normalized sparse adjacency operator of degree " + str(
            self.nrows()
        )

    __str__ = __repr__
    toString = __repr__


class SupersingularIsogenyGraph:
    """Multiplicity- and mass-preserving view of a supersingular graph."""

    def __init__(
        self,
        module: SupersingularModule,
        operator: SparseHeckeOperator,
    ) -> None:
        self._module = module
        self._operator = operator

    def order(self) -> int:
        return self._operator.nrows()

    def degree(self) -> int:
        index = self._operator.hecke_index()
        if index is None:
            raise ValueError("the graph operator has no Hecke index")
        return int(index) + 1

    def vertices(self) -> list[Any]:
        return self._module.supersingular_points()[0]

    def vertex_mass(self, index: Any) -> Any:
        position = _integer(index, "vertex index")
        return self._module.mass_weights()[position]

    def vertex_coordinates(self, index: Any) -> tuple[Any, ...]:
        position = _integer(index, "vertex index")
        return self._module.point_coordinates()[position]

    def neighbors(self, index: Any) -> tuple[tuple[int, int], ...]:
        return self._operator.row(index)

    def edges(self, multiplicities: bool = True) -> list[Any]:
        answer = []
        for source in range(self.order()):
            for target, multiplicity in self._operator.row(source):
                answer.append(
                    (source, target, multiplicity)
                    if multiplicities
                    else (source, target)
                )
        return answer

    def adjacency_operator(self) -> SparseHeckeOperator:
        return self._operator

    def normalized_adjacency_operator(self) -> NormalizedAdjacencyOperator:
        return NormalizedAdjacencyOperator(self._module, self._operator)

    def spectrum(
        self,
        *,
        algorithm: str = "dense",
        max_entries: Any = 1000000,
    ) -> tuple[float, ...]:
        if algorithm != "dense":
            raise NotImplementedError(
                "selected sparse spectral intervals are not implemented"
            )
        values = [
            float(value)
            for value in self.normalized_adjacency_operator()
            .matrix(max_entries=max_entries)
            .eigenvalues()
        ]
        values.sort()
        return tuple(values)

    def ramanujan_bound(self) -> float:
        return 2.0 * runtime.math.sqrt(self.degree() - 1)

    def verify_ramanujan(
        self,
        *,
        algorithm: str = "dense",
        max_entries: Any = 1000000,
        tolerance: float = 1e-9,
    ) -> bool:
        degree = float(self.degree())
        bound = self.ramanujan_bound()
        for eigenvalue in self.spectrum(algorithm=algorithm, max_entries=max_entries):
            if abs(abs(eigenvalue) - degree) <= tolerance:
                continue
            if abs(eigenvalue) > bound + tolerance:
                return False
        return True

    def __repr__(self) -> str:
        return (
            "Supersingular "
            + str(self._operator.hecke_index())
            + "-isogeny multigraph on "
            + str(self.order())
            + " vertices"
        )

    __str__ = __repr__
    toString = __repr__


class CuspidalHeckeOperator:
    """Sparse ambient Hecke action in exact mass-orthogonal coordinates."""

    def __init__(
        self,
        module: SupersingularModule,
        operator: SparseHeckeOperator,
        *,
        dense_entry_limit: int = 1000000,
    ) -> None:
        self._module = module
        self._operator = operator
        self._dimension = max(0, module.dimension() - 1)
        self._dense_entry_limit = dense_entry_limit
        self._masses = module.mass_weights()
        runtime.object.freeze(self)

    def base_ring(self) -> Any:
        return sage.QQ

    def nrows(self) -> int:
        return self._dimension

    def ncols(self) -> int:
        return self._dimension

    def degree(self) -> int:
        return self._dimension

    dimension = degree

    def hecke_index(self) -> Any:
        return self._operator.hecke_index()

    def is_sparse(self) -> bool:
        return True

    def lift(self, vector: Any) -> Any:
        entries = [sage.QQ(value) for value in vector]
        if len(entries) != self._dimension:
            raise ValueError("vector length does not match the cuspidal operator")
        if self._dimension == 0:
            return _global("vector")(sage.QQ, [])
        weighted = sage.QQ(0)
        for index, value in enumerate(entries):
            weighted += self._masses[index] * value
        entries.append(-weighted / self._masses[self._dimension])
        return _global("vector")(sage.QQ, entries)

    def coordinates(self, vector: Any) -> Any:
        entries = [sage.QQ(value) for value in vector]
        if len(entries) != self._dimension + 1:
            raise ValueError("ambient vector length does not match the module")
        if not self._module.is_cuspidal(entries):
            raise ValueError("the ambient vector is not mass-orthogonal to Eisenstein")
        return _global("vector")(sage.QQ, entries[: self._dimension])

    def apply(self, vector: Any) -> Any:
        ambient = list(self.lift(vector))
        image = []
        for row in range(self._dimension + 1):
            total = sage.QQ(0)
            for column, multiplicity in self._operator.row(row):
                total += sage.QQ(multiplicity) * ambient[column]
            image.append(total)
        if not self._module.is_cuspidal(image):
            raise ArithmeticError(
                "a Hecke operator did not preserve the cuspidal space"
            )
        return _global("vector")(sage.QQ, image[: self._dimension])

    def matrix(self, max_entries: Any = None, force: bool = False) -> Any:
        limit = (
            self._dense_entry_limit
            if max_entries is None
            else _integer(max_entries, "dense entry limit")
        )
        if limit < 0:
            raise ValueError("dense entry limit must be nonnegative")
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

    def __repr__(self) -> str:
        return (
            "Cuspidal Hecke operator T_"
            + str(self.hecke_index())
            + " of degree "
            + str(self._dimension)
        )

    __str__ = __repr__
    toString = __repr__


class SupersingularModule:
    """The level-one supersingular module in prime characteristic."""

    def __init__(
        self,
        prime: Any = 2,
        level: Any = 1,
        base_ring: Any = None,
        *,
        dense_entry_limit: Any = 1000000,
    ) -> None:
        characteristic = _prime(prime)
        auxiliary_level = _integer(level, "level")
        if auxiliary_level % characteristic == 0:
            raise ValueError("the argument level must be coprime to the prime")
        if auxiliary_level != 1:
            raise NotImplementedError(
                "supersingular modules of level > 1 are not implemented"
            )
        if base_ring is None:
            base_ring = sage.ZZ
        if base_ring is not sage.ZZ:
            raise NotImplementedError("the first supersingular slice is over ZZ")
        self._prime = characteristic
        self._level = auxiliary_level
        self._base_ring = base_ring
        self._field = _global("GF")(characteristic * characteristic, "a")
        self._dimension = dimension_supersingular_module(
            characteristic, auxiliary_level
        )
        self._dense_entry_limit = _integer(dense_entry_limit, "dense entry limit")
        if self._dense_entry_limit < 0:
            raise ValueError("dense entry limit must be nonnegative")
        self._points: list[Any] | None = None
        self._point_index: SupersingularPointIndex | None = None
        self._operators: dict[int, SparseHeckeOperator] = {}

    def prime(self) -> int:
        return self._prime

    def level(self) -> int:
        return self._level

    def weight(self) -> int:
        return 2

    def base_ring(self) -> Any:
        return self._base_ring

    def finite_field(self) -> Any:
        return self._field

    def dimension(self) -> int:
        return self._dimension

    rank = dimension

    def _construct_t2(self) -> None:
        if 2 in self._operators:
            return
        ring = _global("PolynomialRing")(self._field, "x")
        generator = ring.gen()
        points = [supersingular_j(self._field)]
        predecessors = [-1]
        row_offsets = [0]
        columns = []
        values = []
        position = 0
        while position < len(points):
            if position == 0:
                roots = _phi2_polynomial(generator, points[position]).roots()
            else:
                predecessor = predecessors[position]
                roots = _phi2_quadratic(
                    generator,
                    points[predecessor],
                    points[position],
                ).roots()
            row: dict[int, int] = {}
            for root, multiplicity in roots:
                target = _find_equal(points, root)
                if target < 0:
                    target = len(points)
                    points.append(root)
                    predecessors.append(position)
                    if len(points) > self._dimension:
                        raise ArithmeticError(
                            "the supersingular graph exceeds its dimension formula"
                        )
                row[target] = row.get(target, 0) + int(multiplicity)
            if position != 0:
                predecessor = predecessors[position]
                row[predecessor] = row.get(predecessor, 0) + 1
            for target in sorted(row):
                columns.append(target)
                values.append(row[target])
            if sum(row.values()) != 3:
                raise ArithmeticError("a T_2 row does not have multiplicity 3")
            row_offsets.append(len(columns))
            position += 1
        if len(points) != self._dimension:
            raise ArithmeticError(
                "the supersingular graph has "
                + str(len(points))
                + " vertices, expected "
                + str(self._dimension)
            )
        discovery_operator = SparseHeckeOperator(
            self._base_ring,
            self._dimension,
            self._dimension,
            row_offsets,
            columns,
            values,
            index=2,
            name="Sparse Hecke operator T_2",
            dense_entry_limit=self._dense_entry_limit,
        )
        coordinates = [_power_basis_coordinates(point, self._field) for point in points]
        order = list(range(self._dimension))
        order.sort(key=lambda index: coordinates[index])
        inverse = [0 for _index in range(self._dimension)]
        for new_index, old_index in enumerate(order):
            inverse[old_index] = new_index
        canonical_offsets = [0]
        canonical_columns = []
        canonical_values = []
        for old_row in order:
            row = {}
            for old_column, multiplicity in discovery_operator.row(old_row):
                new_column = inverse[old_column]
                row[new_column] = row.get(new_column, 0) + multiplicity
            for column in sorted(row):
                canonical_columns.append(column)
                canonical_values.append(row[column])
            canonical_offsets.append(len(canonical_columns))
        operator = SparseHeckeOperator(
            self._base_ring,
            self._dimension,
            self._dimension,
            canonical_offsets,
            canonical_columns,
            canonical_values,
            index=2,
            name="Sparse Hecke operator T_2",
            dense_entry_limit=self._dense_entry_limit,
        )
        self._points = [points[index] for index in order]
        self._point_index = SupersingularPointIndex(self._points)
        self._operators[2] = operator
        self._verify_operator(2)

    def _automorphism_weight(self, point: Any) -> int:
        if point == self._field(0):
            return 3
        if point == self._field(1728):
            return 2
        return 1

    def _verify_operator(self, index: int) -> None:
        operator = self._operators[index]
        expected_sum = index + 1
        if operator.row_sums() != tuple(
            expected_sum for _row in range(self._dimension)
        ):
            raise ArithmeticError(
                "T_"
                + str(index)
                + " does not have constant row sum "
                + str(expected_sum)
            )
        points = self._points
        if points is None:
            raise RuntimeError("supersingular points were not published")
        weights = [self._automorphism_weight(point) for point in points]
        for row in range(self._dimension):
            for column, multiplicity in operator.row(row):
                opposite = int(operator[column, row])
                if multiplicity * weights[column] != opposite * weights[row]:
                    raise ArithmeticError(
                        "T_" + str(index) + " violates the exact mass adjoint relation"
                    )
        if index != 2:
            t2 = self._operators[2]
            if not operator.commutes_with(t2):
                raise ArithmeticError("good Hecke operators do not commute")

    def _construct_general_operator(self, index: int) -> None:
        if index in self._operators:
            return
        self._construct_t2()
        polynomial = classical_modular_polynomial(index)
        points = self._points
        if points is None:
            raise RuntimeError("supersingular points were not published")
        row_offsets = [0]
        columns = []
        values = []
        for point in points:
            roots = polynomial.specialize_y(self._field, point).roots()
            row: dict[int, int] = {}
            for root, multiplicity in roots:
                target = _find_equal(points, root)
                if target < 0:
                    raise ArithmeticError(
                        "a modular-polynomial root is outside the supersingular set"
                    )
                row[target] = row.get(target, 0) + int(multiplicity)
            if sum(row.values()) != index + 1:
                raise ArithmeticError(
                    "a T_" + str(index) + " row has the wrong multiplicity"
                )
            for target in sorted(row):
                columns.append(target)
                values.append(row[target])
            row_offsets.append(len(columns))
        self._operators[index] = SparseHeckeOperator(
            self._base_ring,
            self._dimension,
            self._dimension,
            row_offsets,
            columns,
            values,
            index=index,
            name="Sparse Hecke operator T_" + str(index),
            dense_entry_limit=self._dense_entry_limit,
        )
        self._verify_operator(index)

    def supersingular_points(self) -> tuple[list[Any], SupersingularPointIndex]:
        self._construct_t2()
        if self._points is None or self._point_index is None:
            raise RuntimeError("supersingular points were not constructed")
        return (list(self._points), self._point_index)

    def point_coordinates(self) -> tuple[tuple[Any, ...], ...]:
        """Return the canonical ordered $GF(p^2)$ power-basis coordinates."""
        points = self.supersingular_points()[0]
        return tuple(_power_basis_coordinates(point, self._field) for point in points)

    def basis_fingerprint(self) -> tuple[Any, ...]:
        """Return the complete portable identity of the supersingular basis."""
        modulus = tuple(
            runtime.normalize_integer(value)
            for value in self._field._modulusCoefficients
        )
        return (
            "sagejs-supersingular-basis-v1",
            self._prime,
            self._level,
            "power-basis-lexicographic-v1",
            modulus,
            self.point_coordinates(),
            tuple(str(value) for value in self.mass_weights()),
        )

    def basis_digest(self) -> str:
        """Return a SHA-256 digest of `basis_fingerprint()`."""
        return _fingerprint_digest(self.basis_fingerprint())

    def operator_fingerprint(self, index: Any) -> tuple[Any, ...]:
        """Return a basis-bound canonical CSR fingerprint for one operator."""
        operator = self.hecke_operator(index)
        return (
            "sagejs-supersingular-operator-v1",
            self.basis_digest(),
            operator.hecke_index(),
            tuple(operator.rows()),
        )

    def operator_digest(self, index: Any) -> str:
        """Return a SHA-256 digest of one canonical sparse Hecke operator."""
        return _fingerprint_digest(self.operator_fingerprint(index))

    def operator_cache_record(self, index: Any) -> dict[str, Any]:
        """Return a content-addressed portable cache record for one operator."""
        operator = self.hecke_operator(index)
        ell = int(operator.hecke_index())
        body = {
            "schema": "sagejs-supersingular-operator-cache-v1",
            "prime": self._prime,
            "level": self._level,
            "index": ell,
            "field_modulus": [int(value) for value in self._field._modulusCoefficients],
            "point_ordering": "power-basis-lexicographic-v1",
            "point_coordinates": [
                [int(value) for value in point] for point in self.point_coordinates()
            ],
            "basis_sha256": self.basis_digest(),
            "mass_weights": [str(value) for value in self.mass_weights()],
            "modular_polynomial_sha256": _fingerprint_digest(
                _modular_polynomial_fingerprint(ell)
            ),
            "rows": [
                [[column, multiplicity] for column, multiplicity in row]
                for row in operator.rows()
            ],
        }
        body["content_sha256"] = _cache_digest(body)
        return body

    def load_operator_cache(self, record: Any) -> SparseHeckeOperator:
        """Verify and install one portable sparse-operator cache record."""
        if not isinstance(record, dict):
            raise TypeError("a supersingular operator cache record must be a dict")
        expected_keys = [
            "basis_sha256",
            "content_sha256",
            "field_modulus",
            "index",
            "level",
            "mass_weights",
            "modular_polynomial_sha256",
            "point_coordinates",
            "point_ordering",
            "prime",
            "rows",
            "schema",
        ]
        if sorted(record.keys()) != expected_keys:
            raise ValueError("a supersingular operator cache record has wrong fields")
        body = dict(record)
        content_digest = body.pop("content_sha256")
        if not isinstance(content_digest, str) or _cache_digest(body) != content_digest:
            raise ValueError("a supersingular operator cache digest is invalid")
        if (
            body["schema"] != "sagejs-supersingular-operator-cache-v1"
            or body["prime"] != self._prime
            or body["level"] != self._level
            or body["point_ordering"] != "power-basis-lexicographic-v1"
        ):
            raise ValueError("a supersingular operator cache binding is incompatible")
        ell = _integer(body["index"], "cached Hecke index")
        if ell < 2 or not bool(sage.is_prime(ell)) or ell == self._prime:
            raise ValueError("a cached Hecke index is not a good prime")
        if ell != 2:
            self._construct_t2()
        modulus = tuple(
            _integer(value, "cached field modulus") for value in body["field_modulus"]
        )
        expected_modulus = tuple(
            int(value) for value in self._field._modulusCoefficients
        )
        if modulus != expected_modulus:
            raise ValueError("a cached finite-field modulus is incompatible")
        coordinates = tuple(
            tuple(_integer(value, "cached point coordinate") for value in point)
            for point in body["point_coordinates"]
        )
        if len(coordinates) != self._dimension or any(
            len(point) != 2 for point in coordinates
        ):
            raise ValueError("cached supersingular points have the wrong shape")
        if tuple(sorted(coordinates)) != coordinates:
            raise ValueError("cached supersingular points have the wrong ordering")
        for position, point in enumerate(coordinates):
            if position and point == coordinates[position - 1]:
                raise ValueError("cached supersingular points are not distinct")
            if any(value < 0 or value >= self._prime for value in point):
                raise ValueError("a cached supersingular point is not reduced")
        points = []
        generator = self._field.gen()
        for constant, linear in coordinates:
            points.append(self._field(constant) + self._field(linear) * generator)

        rows = body["rows"]
        if not isinstance(rows, list) or len(rows) != self._dimension:
            raise ValueError("a cached sparse operator has the wrong row count")
        row_offsets = [0]
        columns = []
        values = []
        for row in rows:
            if not isinstance(row, list):
                raise TypeError("a cached sparse row must be a list")
            previous = -1
            for entry in row:
                if not isinstance(entry, list) or len(entry) != 2:
                    raise TypeError("a cached sparse entry must be [column,value]")
                column = _integer(entry[0], "cached sparse column")
                value = _integer(entry[1], "cached sparse multiplicity")
                if column <= previous or column >= self._dimension or value <= 0:
                    raise ValueError("a cached sparse row is not canonical")
                previous = column
                columns.append(column)
                values.append(value)
            row_offsets.append(len(columns))
        operator = SparseHeckeOperator(
            self._base_ring,
            self._dimension,
            self._dimension,
            row_offsets,
            columns,
            values,
            index=ell,
            name="Cached sparse Hecke operator T_" + str(ell),
            dense_entry_limit=self._dense_entry_limit,
        )
        source_digest = _fingerprint_digest(_modular_polynomial_fingerprint(ell))
        if body["modular_polynomial_sha256"] != source_digest:
            raise ValueError("a cached modular-polynomial binding is invalid")

        # Recheck every stored edge against the exact modular relation.  This
        # avoids trusting cached graph topology while still avoiding root
        # discovery/factorization.  Multiplicities, masses, and degree are
        # checked below by the ordinary publication path.
        ring = _global("PolynomialRing")(self._field, "x")
        variable = ring.gen()
        polynomial = None if ell == 2 else classical_modular_polynomial(ell)
        for row in range(self._dimension):
            specialized = (
                _phi2_polynomial(variable, points[row])
                if polynomial is None
                else polynomial.specialize_y(self._field, points[row])
            )
            for column, _multiplicity in operator.row(row):
                if specialized(points[column]) != self._field(0):
                    raise ArithmeticError("a cached edge violates its modular relation")

        previous_points = self._points
        previous_index = self._point_index
        previous_operator = self._operators.get(ell)
        self._points = points
        self._point_index = SupersingularPointIndex(points)
        self._operators[ell] = operator
        try:
            if self.basis_digest() != body["basis_sha256"]:
                raise ValueError("a cached supersingular basis digest is invalid")
            if [str(value) for value in self.mass_weights()] != body["mass_weights"]:
                raise ValueError("cached supersingular masses are invalid")
            self._verify_operator(ell)
        except Exception:
            self._points = previous_points
            self._point_index = previous_index
            if previous_operator is None:
                del self._operators[ell]
            else:
                self._operators[ell] = previous_operator
            raise
        return operator

    def hecke_operator(self, index: Any) -> SparseHeckeOperator:
        ell = _integer(index, "Hecke index")
        if ell < 2 or not bool(sage.is_prime(ell)):
            raise NotImplementedError(
                "only prime-index good Hecke operators are implemented"
            )
        if ell == self._prime:
            raise NotImplementedError("the bad-prime operator T_p is not implemented")
        if ell == 2:
            self._construct_t2()
        else:
            self._construct_general_operator(ell)
        return self._operators[ell]

    T = hecke_operator

    def hecke_matrix(self, index: Any) -> Any:
        return self.hecke_operator(index).matrix()

    def isogeny_graph(self, index: Any = 2) -> SupersingularIsogenyGraph:
        return SupersingularIsogenyGraph(self, self.hecke_operator(index))

    def mass_weights(self) -> tuple[Any, ...]:
        points = self.supersingular_points()[0]
        return tuple(
            sage.QQ(1) / sage.QQ(self._automorphism_weight(point)) for point in points
        )

    def automorphism_weights(self) -> tuple[int, ...]:
        points = self.supersingular_points()[0]
        return tuple(self._automorphism_weight(point) for point in points)

    def mass_pairing(self) -> Any:
        weights = self.mass_weights()
        rows = []
        for row in range(self._dimension):
            rows.append(
                [
                    weights[row] if row == column else sage.QQ(0)
                    for column in range(self._dimension)
                ]
            )
        return _global("matrix")(sage.QQ, rows)

    def eisenstein_vector(self) -> Any:
        return _global("vector")(
            self._base_ring,
            [self._base_ring(1) for _ in range(self._dimension)],
        )

    def mass_inner_product(self, left: Any, right: Any) -> Any:
        left_entries = list(left)
        right_entries = list(right)
        if (
            len(left_entries) != self._dimension
            or len(right_entries) != self._dimension
        ):
            raise ValueError("mass-pairing vectors have the wrong length")
        total = sage.QQ(0)
        for index, mass in enumerate(self.mass_weights()):
            total += mass * sage.QQ(left_entries[index]) * sage.QQ(right_entries[index])
        return total

    def is_cuspidal(self, vector: Any) -> bool:
        return self.mass_inner_product(vector, self.eisenstein_vector()) == 0

    def cuspidal_projection(self, vector: Any) -> Any:
        entries = list(vector)
        if len(entries) != self._dimension:
            raise ValueError("projection vector has the wrong length")
        eisenstein = self.eisenstein_vector()
        scale = self.mass_inner_product(entries, eisenstein) / self.mass_inner_product(
            eisenstein, eisenstein
        )
        return _global("vector")(
            sage.QQ,
            [sage.QQ(value) - scale for value in entries],
        )

    def cuspidal_basis_matrix(self) -> Any:
        if self._dimension <= 1:
            return _global("matrix")(sage.QQ, 0, self._dimension, [])
        masses = self.mass_weights()
        anchor = self._dimension - 1
        rows = []
        for index in range(anchor):
            row = [sage.QQ(0) for _column in range(self._dimension)]
            row[index] = sage.QQ(1)
            row[anchor] = -masses[index] / masses[anchor]
            rows.append(row)
        return _global("matrix")(sage.QQ, rows)

    def cuspidal_operator(self, index: Any) -> CuspidalHeckeOperator:
        return CuspidalHeckeOperator(
            self,
            self.hecke_operator(index),
            dense_entry_limit=self._dense_entry_limit,
        )

    def rational_eigenpacket(
        self,
        eigenvalue: Any,
        *,
        index: Any = 2,
        check_primes: Any = (3, 5),
    ) -> Any:
        """Return a proved one-dimensional rational cuspidal eigenpacket."""
        from .mestre import SupersingularEigenpacket

        ell = _integer(index, "Hecke index")
        value = sage.ZZ(eigenvalue)
        operator = self.hecke_operator(ell)
        matrix = operator.matrix()
        identity = _global("identity_matrix")(sage.ZZ, self._dimension)
        kernel = (matrix - value * identity).right_kernel_matrix()
        if kernel.nrows() != 1:
            raise ValueError(
                "the requested Hecke eigenvalue does not have multiplicity one"
            )
        vector = _primitive_integer_vector(kernel.row(0))
        if not self.is_cuspidal(vector):
            raise ValueError("the requested Hecke eigenvalue is Eisenstein")
        eigenvalues = [(ell, value)]
        checked = {ell: True}
        for candidate in check_primes:
            prime = _integer(candidate, "check-prime index")
            if prime in checked:
                continue
            checked[prime] = True
            image = list(self.hecke_operator(prime).apply(vector))
            pivot = -1
            for position, coordinate in enumerate(vector):
                if pivot < 0 and coordinate != 0:
                    pivot = position
            if pivot < 0:
                raise ArithmeticError("a rational eigenpacket vector is zero")
            candidate_value = sage.QQ(image[pivot]) / sage.QQ(vector[pivot])
            if candidate_value.denominator() != 1:
                raise ValueError("the simultaneous eigenvalue is not rational integral")
            integer_value = sage.ZZ(candidate_value.numerator())
            for position, coordinate in enumerate(vector):
                if image[position] != integer_value * coordinate:
                    raise ValueError(
                        "the rational eigenspace is not simultaneous for T_"
                        + str(prime)
                    )
            eigenvalues.append((prime, integer_value))
        eigenvalues.sort()
        return SupersingularEigenpacket(self, vector, eigenvalues)

    def __repr__(self) -> str:
        return (
            "Module of supersingular points on X_0("
            + str(self._level)
            + ")/F_"
            + str(self._prime)
            + " over "
            + str(self._base_ring)
        )

    __str__ = __repr__
    toString = __repr__


__all__ = [
    "CuspidalHeckeOperator",
    "NormalizedAdjacencyOperator",
    "SparseHeckeOperator",
    "SupersingularIsogenyGraph",
    "SupersingularModule",
    "SupersingularPointIndex",
    "dimension_supersingular_module",
    "supersingular_j",
]
