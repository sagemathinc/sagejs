r"""Exact Brandt Hecke modules over $\mathbf Q$.

For prime discriminant and Eichler conductor one this module reuses the
canonical supersingular ideal-class realization.  The default general path
constructs the rational Jacquet--Langlands realization

$$
\mathbf Q e_{\mathrm{Eis}} \oplus
S_2(\Gamma_0(DN),\mathbf Q)^{D\text{-new}}.
$$

The latter is a genuine realization of the Brandt *Hecke module*, but its
basis is not advertised as a list of quaternion ideals.  The explicit
`realization="ideal-classes"` backend instead constructs a certified maximal
and Eichler order, enumerates the locally principal right ideal classes to
the exact mass, and publishes their integral pairing.  Keeping the two paths
distinct makes Jacquet--Langlands an independent spectral oracle.
"""

from __future__ import annotations

from typing import Any, Iterable

import sagejs as sage
import sagejs.runtime as runtime

from .supersingular import SupersingularModule


def _global(name: str) -> Any:
    return runtime.reflect.get(runtime.global_object, name)


def _integer(value: Any, label: str) -> int:
    normalized = runtime.normalize_integer(value)
    if runtime.jstype(normalized) != "number" or not runtime.number.isSafeInteger(
        normalized
    ):
        raise TypeError(label + " must be an exact machine integer")
    return runtime.number(normalized)


def _positive_integer(value: Any, label: str) -> int:
    answer = _integer(value, label)
    if answer <= 0:
        raise ValueError(label + " must be positive")
    return answer


def _factorization(value: int) -> tuple[tuple[int, int], ...]:
    return tuple(
        (runtime.number(prime), runtime.number(exponent))
        for prime, exponent in sage.factor(value)
    )


def _gcd(left: int, right: int) -> int:
    left = abs(left)
    right = abs(right)
    while right:
        left, right = right, left % right
    return left


def _validate_discriminant(value: Any) -> tuple[int, tuple[int, ...]]:
    discriminant = _positive_integer(value, "quaternion discriminant")
    factors = _factorization(discriminant)
    if discriminant == 1 or any(exponent != 1 for _prime, exponent in factors):
        raise ValueError(
            "a definite rational quaternion discriminant must be squarefree and > 1"
        )
    primes = tuple(prime for prime, _exponent in factors)
    if len(primes) % 2 != 1:
        raise ValueError(
            "a definite rational quaternion algebra must ramify at an odd "
            "number of finite primes"
        )
    return discriminant, primes


def _sigma_one(value: int) -> Any:
    answer = sage.ZZ(1)
    for prime, exponent in _factorization(value):
        numerator = sage.ZZ(prime) ** (exponent + 1) - 1
        answer *= numerator // (prime - 1)
    return answer


def _block_matrix(scalar: Any, lower: Any, base_ring: Any) -> Any:
    size = lower.nrows()
    rows = [[base_ring(scalar)] + [base_ring(0) for _column in range(size)]]
    for row in range(size):
        rows.append(
            [base_ring(0)] + [base_ring(lower[row, column]) for column in range(size)]
        )
    return _global("matrix")(base_ring, rows)


def _identity_matrix(base_ring: Any, dimension: int) -> Any:
    return _global("identity_matrix")(base_ring, dimension)


@runtime.lightweight_math_class
class BrandtModuleElement(sage.Element):
    """An exact coordinate vector in a rational Brandt Hecke module."""

    def __init__(self, parent: BrandtModule_class, coordinates: Any = 0) -> None:
        self._parent = parent
        if runtime.is_exact_integer(coordinates) and coordinates == 0:
            coordinates = [
                parent.base_ring()(0) for _index in range(parent.dimension())
            ]
        self._vector = _global("vector")(parent.base_ring(), coordinates)
        if len(self._vector) != parent.dimension():
            raise ValueError("Brandt-module coordinates have the wrong length")

    def parent(self) -> BrandtModule_class:
        return self._parent

    def vector(self) -> Any:
        return self._vector

    element = vector

    def is_zero(self) -> bool:
        return all(value == 0 for value in self._vector)

    def hecke(self, index: Any) -> BrandtModuleElement:
        return self._parent.T(index)(self)

    def atkin_lehner(self, divisor: Any) -> BrandtModuleElement:
        return self._parent.atkin_lehner_operator(divisor)(self)

    def _compatible(
        self, other: object
    ) -> tuple[BrandtModuleElement, BrandtModuleElement]:
        if (
            not isinstance(other, BrandtModuleElement)
            or other._parent is not self._parent
        ):
            raise TypeError("Brandt-module elements must have the same parent")
        return self, other

    def __add__(self, other: object) -> BrandtModuleElement:
        left, right = self._compatible(other)
        return self._parent(left._vector + right._vector)

    def _add_(self, other: BrandtModuleElement) -> BrandtModuleElement:
        return self.__add__(other)

    def __sub__(self, other: object) -> BrandtModuleElement:
        left, right = self._compatible(other)
        return self._parent(left._vector - right._vector)

    def _sub_(self, other: BrandtModuleElement) -> BrandtModuleElement:
        return self.__sub__(other)

    def __neg__(self) -> BrandtModuleElement:
        return self._parent(-self._vector)

    def _neg_(self) -> BrandtModuleElement:
        return self.__neg__()

    def __mul__(self, scalar: Any) -> BrandtModuleElement:
        if isinstance(scalar, BrandtLinearOperator):
            return scalar(self)
        return self._parent(self._vector * self._parent.base_ring()(scalar))

    def __rmul__(self, scalar: Any) -> BrandtModuleElement:
        return self.__mul__(scalar)

    def _lmul_(self, scalar: Any) -> BrandtModuleElement:
        return self.__mul__(scalar)

    def _rmul_(self, scalar: Any) -> BrandtModuleElement:
        return self.__mul__(scalar)

    def _sage_binop_(
        self,
        operator: str,
        other: Any,
        reflected: bool,
    ) -> Any:
        if operator == "mul" and not isinstance(other, BrandtModuleElement):
            return self.__mul__(other)
        if operator == "add" and not reflected:
            return self.__add__(other)
        if operator == "sub" and not reflected:
            return self.__sub__(other)
        raise TypeError("unsupported Brandt-module operation " + operator)

    def __getitem__(self, index: Any) -> Any:
        return self._vector[index]

    def __iter__(self) -> Any:
        return iter(self._vector)

    def __eq__(self, other: object) -> bool:
        return (
            isinstance(other, BrandtModuleElement)
            and other._parent is self._parent
            and other._vector == self._vector
        )

    def __repr__(self) -> str:
        return str(self._vector)

    __str__ = __repr__
    toString = __repr__


class BrandtLinearOperator:
    """An exact endomorphism of a Brandt module."""

    def __init__(
        self,
        module: BrandtModule_class,
        defining_matrix: Any | None,
        *,
        name: str,
        index: Any = None,
        sparse_source: Any = None,
    ) -> None:
        source = sparse_source if defining_matrix is None else defining_matrix
        if source is None:
            raise ValueError("a Brandt operator needs a matrix or sparse source")
        if source.nrows() != module.dimension() or source.ncols() != module.dimension():
            raise ValueError("a Brandt operator has the wrong dimensions")
        self._module = module
        self._matrix = defining_matrix
        self._name = name
        self._index = index
        self._sparse_source = sparse_source
        runtime.object.freeze(self)

    def domain(self) -> BrandtModule_class:
        return self._module

    codomain = domain

    def nrows(self) -> int:
        return self._module.dimension()

    ncols = nrows
    degree = nrows

    def hecke_index(self) -> Any:
        return self._index

    def is_sparse(self) -> bool:
        return self._sparse_source is not None

    def nonzero_count(self) -> int:
        if self._sparse_source is not None:
            return self._sparse_source.nonzero_count()
        if self._matrix is None:
            raise RuntimeError("a Brandt operator has no matrix representation")
        count = 0
        for value in self._matrix.list():
            if value != 0:
                count += 1
        return count

    nnz = nonzero_count

    def matrix(self, max_entries: Any = None, force: bool = False) -> Any:
        if self._sparse_source is not None:
            answer = self._sparse_source.matrix(
                max_entries=max_entries,
                force=force,
            )
            if self._module.base_ring() is not sage.ZZ:
                answer = answer.change_ring(self._module.base_ring())
            return answer
        if self._matrix is None:
            raise RuntimeError("a Brandt operator has no matrix representation")
        return self._matrix

    dense_matrix = matrix

    def __call__(self, value: Any) -> BrandtModuleElement:
        element = self._module(value)
        if self._sparse_source is not None:
            answer = [
                self._module.base_ring()(0)
                for _index in range(self._module.dimension())
            ]
            for row, neighbors in enumerate(self._sparse_source.rows()):
                coefficient = element[row]
                for column, multiplicity in neighbors:
                    answer[column] += coefficient * self._module.base_ring()(
                        multiplicity
                    )
            return self._module(answer)
        if self._matrix is None:
            raise RuntimeError("a Brandt operator has no matrix representation")
        return self._module(element.vector() * self._matrix)

    apply = __call__

    def charpoly(self, variable: str = "x") -> Any:
        if self._sparse_source is not None:
            return self._sparse_source.charpoly(variable)
        if self._matrix is None:
            raise RuntimeError("a Brandt operator has no matrix representation")
        return self._matrix.charpoly(variable)

    characteristic_polynomial = charpoly

    def kernel(self) -> BrandtSubspace:
        defining_matrix = self.matrix()
        return BrandtSubspace(
            self._module,
            defining_matrix.left_kernel_matrix().rows(),
            name="Kernel of " + self._name,
        )

    def __repr__(self) -> str:
        return self._name + " on " + str(self._module)

    __str__ = __repr__
    toString = __repr__


class BrandtSubspace:
    """An exact rational subspace in Brandt coordinates."""

    def __init__(
        self,
        ambient: BrandtModule_class,
        basis_rows: Iterable[Any],
        *,
        name: str,
    ) -> None:
        rows = [list(row) for row in basis_rows]
        if any(len(row) != ambient.dimension() for row in rows):
            raise ValueError("a Brandt subspace basis row has the wrong length")
        if rows:
            source = _global("matrix")(ambient.base_ring(), rows)
        else:
            source = _global("matrix")(ambient.base_ring(), 0, ambient.dimension(), [])
        self._ambient = ambient
        self._basis = source.row_space().basis_matrix()
        self._space = self._basis.row_space()
        self._name = name
        runtime.object.freeze(self)

    def ambient_module(self) -> BrandtModule_class:
        return self._ambient

    def dimension(self) -> int:
        return self._basis.nrows()

    rank = dimension

    def basis_matrix(self) -> Any:
        return self._basis

    def basis(self) -> tuple[BrandtModuleElement, ...]:
        return tuple(self._ambient(row) for row in self._basis.rows())

    gens = basis

    def contains(self, value: Any) -> bool:
        element = self._ambient(value)
        return element.vector() in self._space

    def hecke_matrix(self, index: Any) -> Any:
        ambient_matrix = self._ambient.hecke_matrix(index)
        images = self._basis * ambient_matrix
        pivots = list(self._basis.pivots())
        restricted = images.matrix_from_columns(pivots)
        if restricted * self._basis != images:
            raise ArithmeticError("the Brandt subspace is not Hecke invariant")
        return restricted

    def atkin_lehner_matrix(self, divisor: Any) -> Any:
        ambient_matrix = self._ambient.atkin_lehner_operator(divisor).matrix()
        images = self._basis * ambient_matrix
        pivots = list(self._basis.pivots())
        restricted = images.matrix_from_columns(pivots)
        if restricted * self._basis != images:
            raise ArithmeticError("the Brandt subspace is not Atkin--Lehner invariant")
        return restricted

    def decomposition(
        self, bound: Any = None, anemic: bool = True
    ) -> list[BrandtSubspace]:
        return self._ambient._decompose_subspaces([self], bound, anemic)

    def is_cuspidal(self) -> bool:
        return all(self._ambient.is_cuspidal(row) for row in self._basis.rows())

    def __repr__(self) -> str:
        return (
            self._name
            + " of dimension "
            + str(self.dimension())
            + " in "
            + str(self._ambient)
        )

    __str__ = __repr__
    toString = __repr__


class BrandtModule_class(sage.Parent):
    """The weight-two Brandt Hecke module of discriminant $D$ and level $N$."""

    Element = BrandtModuleElement

    def __init__(
        self,
        discriminant: int,
        conductor: int,
        weight: int,
        base_ring: Any,
        *,
        realization: str,
        dense_entry_limit: int,
    ) -> None:
        self._discriminant = discriminant
        self._ramified_primes = tuple(
            prime for prime, _exponent in _factorization(discriminant)
        )
        self._conductor = conductor
        self._level = discriminant * conductor
        self._weight = weight
        self._base_ring = base_ring
        self._dense_entry_limit = dense_entry_limit
        self._operator_cache: list[tuple[int, str, BrandtLinearOperator]] = []
        self._atkin_cache: list[tuple[int, BrandtLinearOperator]] = []
        self._supersingular = None
        self._cusp_symbols = None
        self._ideal_classes = None
        if realization == "supersingular":
            if (
                len(self._ramified_primes) != 1
                or self._ramified_primes[0] < 5
                or conductor != 1
            ):
                raise ValueError(
                    "the supersingular realization requires prime D >= 5 and N = 1"
                )
            self._supersingular = SupersingularModule(
                discriminant,
                base_ring=sage.ZZ,
                dense_entry_limit=dense_entry_limit,
            )
            self._dimension = self._supersingular.dimension()
            self._realization = "supersingular-ideal-classes"
        elif realization == "jacquet-langlands":
            symbols = _global("ModularSymbols")(
                self._level, 2, sign=1, base_ring=sage.QQ
            ).cuspidal_submodule()
            for prime in self._ramified_primes:
                symbols = symbols.new_submodule(prime)
            self._cusp_symbols = symbols
            self._dimension = 1 + symbols.dimension()
            self._realization = "jacquet-langlands-symbols"
        elif realization == "ideal-classes":
            from sagejs.quaternion_algebras.class_set import EichlerIdealClassSet

            symbols = _global("ModularSymbols")(
                self._level, 2, sign=1, base_ring=sage.QQ
            ).cuspidal_submodule()
            for prime in self._ramified_primes:
                symbols = symbols.new_submodule(prime)
            self._cusp_symbols = symbols
            self._dimension = 1 + symbols.dimension()
            self._ideal_classes = EichlerIdealClassSet(
                discriminant,
                conductor,
                expected_dimension=self._dimension,
            )
            self._realization = "eichler-ideal-classes"
        else:
            raise ValueError("unknown Brandt-module realization")

    def discriminant(self) -> int:
        return self._discriminant

    def conductor(self) -> int:
        return self._conductor

    def level(self) -> int:
        return self._level

    def N(self) -> int:
        """Return the quaternion discriminant, following Sage's historical API."""
        return self._discriminant

    def M(self) -> int:
        """Return the Eichler conductor, following Sage's historical API."""
        return self._conductor

    def weight(self) -> int:
        return self._weight

    def base_ring(self) -> Any:
        return self._base_ring

    def dimension(self) -> int:
        return self._dimension

    rank = dimension
    degree = dimension

    def realization(self) -> str:
        return self._realization

    def canonical_ideal_basis_available(self) -> bool:
        return self._supersingular is not None or self._ideal_classes is not None

    def __call__(self, value: Any = 0) -> BrandtModuleElement:
        if isinstance(value, BrandtModuleElement):
            if value.parent() is not self:
                raise TypeError("a Brandt-module element has a different parent")
            return value
        return BrandtModuleElement(self, value)

    def zero(self) -> BrandtModuleElement:
        return self(0)

    def gen(self, index: Any = 0) -> BrandtModuleElement:
        position = _integer(index, "basis index")
        if position < 0 or position >= self._dimension:
            raise IndexError("Brandt-module basis index is out of range")
        coordinates = [self._base_ring(0) for _row in range(self._dimension)]
        coordinates[position] = self._base_ring(1)
        return self(coordinates)

    def basis(self) -> tuple[BrandtModuleElement, ...]:
        return tuple(self.gen(index) for index in range(self._dimension))

    gens = basis

    def free_module(self) -> Any:
        return _global("VectorSpace")(self._base_ring, self._dimension)

    def _cached_operator(
        self, index: int, algorithm: str
    ) -> BrandtLinearOperator | None:
        for cached_index, cached_algorithm, operator in self._operator_cache:
            if cached_index == index and (
                algorithm == "auto" or cached_algorithm == algorithm
            ):
                return operator
        return None

    def _canonical_prime_matrix(self, prime: int) -> tuple[Any, Any]:
        if self._supersingular is None:
            raise RuntimeError("the canonical supersingular realization is unavailable")
        sparse = self._supersingular.T(prime)
        matrix_value = sparse.matrix(force=True).change_ring(self._base_ring)
        return matrix_value, sparse

    def _canonical_hecke_matrix(self, index: int) -> tuple[Any, Any]:
        factors = _factorization(index)
        if len(factors) == 1 and factors[0][1] == 1:
            prime = factors[0][0]
            if self._supersingular is None:
                raise RuntimeError(
                    "the canonical supersingular realization is unavailable"
                )
            return None, self._supersingular.T(prime)
        result = _identity_matrix(self._base_ring, self._dimension)
        for prime, exponent in factors:
            prime_matrix, _prime_sparse = self._canonical_prime_matrix(prime)
            if exponent == 1:
                prime_power = prime_matrix
            else:
                previous = _identity_matrix(self._base_ring, self._dimension)
                current = prime_matrix
                for _power in range(2, exponent + 1):
                    following = prime_matrix * current - previous * prime
                    previous, current = current, following
                prime_power = current
            result = result * prime_power
        return result, None

    def _select_ideal_batch_algorithm(self, indices: tuple[int, ...]) -> str:
        """Choose the measured integral Hecke strategy for a known batch."""

        if self._ideal_classes is None:
            return "direct"
        maximum = max(indices)
        if self._ideal_classes._brandt_series_precision > maximum:
            return "brandt-series"
        primes: set[int] = set()
        for index in indices:
            for prime, _exponent in _factorization(index):
                primes.add(prime)
        dimension = self._dimension
        direct_units = 48 * dimension * sum(prime + 1 for prime in primes)
        pair_count = dimension * (dimension + 1) // 2
        required_precision = max(2, 2 * maximum + 10)
        series_units = (72 + required_precision) * pair_count
        return "brandt-series" if series_units <= direct_units else "direct"

    def hecke_operator(
        self, index: Any, *, algorithm: str = "auto"
    ) -> BrandtLinearOperator:
        """Return $T_n$, optionally choosing an ideal-class Hecke algorithm.

        `algorithm` is one of `"auto"`, `"direct"`, or `"brandt-series"`.
        Explicit algorithm selection applies only to the integral ideal-class
        realization; the other realizations already have one canonical
        backend.
        """

        hecke_index = _positive_integer(index, "Hecke index")
        if algorithm not in ("auto", "direct", "brandt-series"):
            raise ValueError("algorithm must be 'auto', 'direct', or 'brandt-series'")
        if self._ideal_classes is None and algorithm != "auto":
            raise ValueError(
                "explicit Brandt Hecke algorithms require realization='ideal-classes'"
            )
        if _gcd(hecke_index, self._level) != 1:
            raise NotImplementedError(
                "Brandt T_n currently requires n coprime to D*N; use "
                "atkin_lehner_operator() at ramified primes"
            )
        cached = self._cached_operator(hecke_index, algorithm)
        if cached is not None:
            return cached
        sparse_source = None
        resolved_algorithm = algorithm
        if self._supersingular is not None:
            matrix_value, sparse_source = self._canonical_hecke_matrix(hecke_index)
        elif self._ideal_classes is not None:
            if algorithm == "auto":
                resolved_algorithm = (
                    "brandt-series"
                    if self._ideal_classes._brandt_series_precision > hecke_index
                    else "direct"
                )
            if resolved_algorithm == "brandt-series":
                matrix_value = self._ideal_classes.hecke_matrix(
                    hecke_index, algorithm="brandt-series"
                )
            else:
                factors = _factorization(hecke_index)
                matrix_value = _identity_matrix(sage.ZZ, self._dimension)
                for prime, exponent in factors:
                    prime_matrix = self._ideal_classes.hecke_matrix(
                        prime, algorithm="direct"
                    )
                    if exponent == 1:
                        prime_power = prime_matrix
                    else:
                        previous = _identity_matrix(sage.ZZ, self._dimension)
                        current = prime_matrix
                        for _power in range(2, exponent + 1):
                            following = prime_matrix * current - previous * prime
                            previous, current = current, following
                        prime_power = current
                    matrix_value = matrix_value * prime_power
            if self._base_ring is not sage.ZZ:
                matrix_value = matrix_value.change_ring(self._base_ring)
            if self._cusp_symbols is None:
                raise RuntimeError("the Jacquet--Langlands oracle is unavailable")
            oracle = _block_matrix(
                _sigma_one(hecke_index),
                self._cusp_symbols.hecke_matrix(hecke_index),
                sage.QQ,
            )
            if matrix_value.change_ring(sage.QQ).charpoly() != oracle.charpoly():
                raise ArithmeticError(
                    "the integral Brandt operator disagrees with its "
                    "Jacquet--Langlands characteristic polynomial"
                )
            rational_matrix = matrix_value.change_ring(sage.QQ)
            weights = _global("diagonal_matrix")(sage.QQ, self._ideal_classes.weights())
            if rational_matrix * weights != weights * rational_matrix.transpose():
                raise ArithmeticError(
                    "the composite Brandt operator violates mass adjointness"
                )
            eisenstein = _global("vector")(
                sage.QQ,
                [sage.QQ(1) / weight for weight in self._ideal_classes.weights()],
            )
            if eisenstein * rational_matrix != eisenstein * _sigma_one(hecke_index):
                raise ArithmeticError(
                    "the Brandt operator has the wrong Eisenstein eigenvalue"
                )
            for (
                _cached_index,
                _cached_algorithm,
                cached_operator,
            ) in self._operator_cache:
                cached_matrix = cached_operator.matrix().change_ring(sage.QQ)
                if cached_matrix * rational_matrix != rational_matrix * cached_matrix:
                    raise ArithmeticError("good Brandt operators do not commute")
        else:
            if self._cusp_symbols is None:
                raise RuntimeError("the Jacquet--Langlands realization is unavailable")
            cusp_matrix = self._cusp_symbols.hecke_matrix(hecke_index)
            matrix_value = _block_matrix(
                _sigma_one(hecke_index), cusp_matrix, self._base_ring
            )
        operator = BrandtLinearOperator(
            self,
            matrix_value,
            name="Hecke operator T_" + str(hecke_index),
            index=hecke_index,
            sparse_source=sparse_source,
        )
        self._operator_cache.append((hecke_index, resolved_algorithm, operator))
        return operator

    T = hecke_operator

    def hecke_matrix(self, index: Any, *, algorithm: str = "auto") -> Any:
        return self.hecke_operator(index, algorithm=algorithm).matrix()

    def hecke_operators(
        self, indices: Iterable[Any], *, algorithm: str = "auto"
    ) -> tuple[BrandtLinearOperator, ...]:
        """Return a batch of $T_n$, sharing graph or Brandt-series setup.

        For the integral ideal-class realization, `algorithm="auto"` uses a
        checked-in cost model calibrated from complete direct-edge and
        pair-theta workloads.  A single operator remains direct unless the
        requested series is already available.  Explicit selection has the
        same meaning as in `hecke_operator`.
        """

        normalized = tuple(_positive_integer(index, "Hecke index") for index in indices)
        if not normalized:
            return ()
        if algorithm not in ("auto", "direct", "brandt-series"):
            raise ValueError("algorithm must be 'auto', 'direct', or 'brandt-series'")
        if self._ideal_classes is None:
            if algorithm != "auto":
                raise ValueError(
                    "explicit Brandt Hecke algorithms require "
                    "realization='ideal-classes'"
                )
            return tuple(self.hecke_operator(index) for index in normalized)
        resolved = (
            self._select_ideal_batch_algorithm(normalized)
            if algorithm == "auto"
            else algorithm
        )
        if resolved == "brandt-series":
            self.brandt_series(max(2, 2 * max(normalized) + 10))
        return tuple(
            self.hecke_operator(index, algorithm=resolved) for index in normalized
        )

    def hecke_matrices(
        self, indices: Iterable[Any], *, algorithm: str = "auto"
    ) -> tuple[Any, ...]:
        """Return the complete exact matrices for a shared Hecke batch."""

        return tuple(
            operator.matrix()
            for operator in self.hecke_operators(indices, algorithm=algorithm)
        )

    def brandt_series(self, precision: Any) -> Any:
        """Return the exact matrix coefficient vectors through $q^{P-1}$."""

        if self._ideal_classes is None:
            raise ValueError("Brandt theta series require realization='ideal-classes'")
        bound = _positive_integer(precision, "Brandt-series precision")
        if bound < 2:
            raise ValueError("a Brandt-series precision must be at least 2")
        return self._ideal_classes.brandt_series_vectors(bound)

    def _canonical_atkin_prime(self) -> Any:
        if self._supersingular is None:
            raise RuntimeError("the canonical supersingular realization is unavailable")
        points = self._supersingular.supersingular_points()[0]
        rows = []
        for point in points:
            conjugate = point**self._discriminant
            target = -1
            for index, candidate in enumerate(points):
                if candidate == conjugate:
                    target = index
                    break
            if target < 0:
                raise ArithmeticError("Frobenius left the supersingular basis")
            row = [self._base_ring(0) for _column in range(self._dimension)]
            row[target] = self._base_ring(1)
            rows.append(row)
        return -_global("matrix")(self._base_ring, rows)

    def _jl_atkin_prime(self, prime: int) -> Any:
        if self._cusp_symbols is None:
            raise RuntimeError("the Jacquet--Langlands realization is unavailable")
        cusp = -self._cusp_symbols.hecke_matrix(prime)
        result = _block_matrix(-1, cusp, self._base_ring)
        identity = _identity_matrix(self._base_ring, self._dimension)
        if result * result != identity:
            raise ArithmeticError(
                "the ramified-prime U operator did not define an involution"
            )
        return result

    def _ideal_atkin_prime(self, prime: int) -> Any:
        if self._ideal_classes is None:
            raise RuntimeError("the Eichler ideal realization is unavailable")
        permutation = self._ideal_classes.ramified_permutation(prime)
        rows = []
        for target in permutation:
            row = [self._base_ring(0) for _column in range(self._dimension)]
            row[target] = self._base_ring(-1)
            rows.append(row)
        result = _global("matrix")(self._base_ring, rows)
        pairing = self.pairing_matrix()
        if result * pairing * result.transpose() != pairing:
            raise ArithmeticError(
                "the ramified Atkin--Lehner operator is not a pairing isometry"
            )
        oracle = self._jl_atkin_prime(prime).change_ring(sage.QQ)
        if result.change_ring(sage.QQ).charpoly() != oracle.charpoly():
            raise ArithmeticError(
                "the ideal-class Atkin--Lehner operator disagrees with "
                "Jacquet--Langlands"
            )
        return result

    def atkin_lehner_operator(self, divisor: Any) -> BrandtLinearOperator:
        exact_divisor = _positive_integer(divisor, "Atkin--Lehner divisor")
        if self._discriminant % exact_divisor != 0:
            raise NotImplementedError(
                "this Brandt realization currently exposes Atkin--Lehner "
                "operators only for divisors of D"
            )
        for cached_divisor, operator in self._atkin_cache:
            if cached_divisor == exact_divisor:
                return operator
        result = _identity_matrix(self._base_ring, self._dimension)
        for prime, exponent in _factorization(exact_divisor):
            if exponent != 1:
                raise ValueError("an Atkin--Lehner divisor must be squarefree")
            if self._supersingular is not None:
                prime_matrix = self._canonical_atkin_prime()
            elif self._ideal_classes is not None:
                prime_matrix = self._ideal_atkin_prime(prime)
            else:
                prime_matrix = self._jl_atkin_prime(prime)
            result = result * prime_matrix
        identity = _identity_matrix(self._base_ring, self._dimension)
        if result * result != identity:
            raise ArithmeticError("the Atkin--Lehner operator is not an involution")
        operator = BrandtLinearOperator(
            self,
            result,
            name="Atkin--Lehner operator W_" + str(exact_divisor),
            index=exact_divisor,
        )
        self._atkin_cache.append((exact_divisor, operator))
        return operator

    W = atkin_lehner_operator

    def atkin_lehner_matrix(self, divisor: Any) -> Any:
        return self.atkin_lehner_operator(divisor).matrix()

    def eisenstein_subspace(self) -> BrandtSubspace:
        if self._ideal_classes is not None:
            weights = self.monodromy_weights()
            if self._base_ring is sage.ZZ:
                common = 1
                for weight in weights:
                    common = common * weight // _gcd(common, weight)
                row = [self._base_ring(common // weight) for weight in weights]
            else:
                row = [self._base_ring(1) / weight for weight in weights]
        elif self._supersingular is None:
            row = [self._base_ring(1)] + [
                self._base_ring(0) for _index in range(self._dimension - 1)
            ]
        else:
            row = [self._base_ring(1) for _index in range(self._dimension)]
        return BrandtSubspace(self, [row], name="Eisenstein subspace")

    def cuspidal_subspace(self) -> BrandtSubspace:
        if self._ideal_classes is not None:
            rows = []
            for index in range(self._dimension - 1):
                row = [self._base_ring(0) for _column in range(self._dimension)]
                row[index] = self._base_ring(1)
                row[-1] = self._base_ring(-1)
                rows.append(row)
        elif self._supersingular is None:
            rows = []
            for index in range(1, self._dimension):
                row = [self._base_ring(0) for _column in range(self._dimension)]
                row[index] = self._base_ring(1)
                rows.append(row)
        else:
            rows = (
                self._supersingular.cuspidal_basis_matrix()
                .change_ring(self._base_ring)
                .rows()
            )
        return BrandtSubspace(self, rows, name="Cuspidal subspace")

    cuspidal_submodule = cuspidal_subspace

    def is_cuspidal(self, value: Any = None) -> bool:
        if value is None:
            return False
        element = self(value)
        if self._ideal_classes is not None:
            return sum(element.vector()) == 0
        if self._supersingular is None:
            return element[0] == 0
        return self._supersingular.is_cuspidal(element.vector())

    def new_subspace(self, prime: Any = None) -> BrandtSubspace:
        if self._conductor == 1:
            return self.cuspidal_subspace()
        selected = None if prime is None else _positive_integer(prime, "new prime")
        conductor_primes = tuple(
            value for value, _exponent in _factorization(self._conductor)
        )
        if selected is not None and selected not in conductor_primes:
            raise ValueError("the selected new prime must divide the Eichler conductor")
        if self._cusp_symbols is None:
            raise RuntimeError("positive Eichler level requires the JL realization")
        target = self._cusp_symbols
        primes = conductor_primes if selected is None else (selected,)
        for value in primes:
            target = target.new_submodule(value)
        if self._ideal_classes is not None:
            # Recover the same rational Hecke summand intrinsically in the
            # ideal-class basis.  For each good prime, the characteristic
            # polynomial on `target` annihilates precisely the constituents
            # that may belong to the requested newspace.  Intersecting these
            # exact kernels resolves accidental eigenvalue collisions without
            # choosing a noncanonical modular-symbol-to-ideal isomorphism.
            current = self.cuspidal_subspace()
            target_dimension = target.dimension()
            if target_dimension == 0:
                return BrandtSubspace(self, [], name="New cuspidal subspace")
            if target_dimension == current.dimension():
                return current
            candidate_prime = None
            for hecke_prime in self._good_primes(
                max(self._default_decomposition_bound(), 13)
            ):
                source_matrix = current.hecke_matrix(hecke_prime)
                target_polynomial = target.hecke_matrix(hecke_prime).charpoly()
                if (
                    candidate_prime is not None
                    and source_matrix.charpoly() == target_polynomial
                ):
                    return current
                local = target_polynomial(source_matrix).left_kernel_matrix()
                current = BrandtSubspace(
                    self,
                    (local * current.basis_matrix()).rows(),
                    name="New cuspidal subspace",
                )
                if current.dimension() < target_dimension:
                    raise ArithmeticError(
                        "Hecke-kernel reconstruction lost a requested new constituent"
                    )
                if current.dimension() == target_dimension:
                    # Require an independent good-prime fingerprint before
                    # publication: one Hecke polynomial can collide on two
                    # different rational constituents.
                    candidate_prime = hecke_prime
            raise ArithmeticError(
                "good Hecke operators did not separate the requested newspace"
            )
        local = self._cusp_symbols.basis_matrix().solve_left(target.basis_matrix())
        rows = [[self._base_ring(0)] + list(row) for row in local.rows()]
        return BrandtSubspace(self, rows, name="New cuspidal subspace")

    new_submodule = new_subspace

    def _default_decomposition_bound(self) -> int:
        index = self._level
        for prime, _exponent in _factorization(self._level):
            index = index * (prime + 1) // prime
        return max(7, index // 6)

    def _good_primes(self, bound: int) -> list[int]:
        answer = []
        for candidate in range(2, bound + 1):
            if sage.is_prime(candidate) and self._level % candidate != 0:
                answer.append(candidate)
        return answer

    def _decompose_subspaces(
        self,
        spaces: list[BrandtSubspace],
        bound: Any,
        anemic: bool,
    ) -> list[BrandtSubspace]:
        decomposition_bound = (
            self._default_decomposition_bound()
            if bound is None
            else _positive_integer(bound, "decomposition bound")
        )
        active = list(spaces)
        finished: list[BrandtSubspace] = []
        for prime in self._good_primes(decomposition_bound):
            remaining = []
            for space in active:
                if space.dimension() <= 1:
                    finished.append(space)
                    continue
                operator = space.hecke_matrix(prime)
                factors = list(operator.charpoly().factor())
                if len(factors) == 1 and factors[0][1] == 1:
                    finished.append(space)
                    continue
                for factor_value, exponent in factors:
                    local = factor_value(operator).left_kernel_matrix()
                    if local.nrows() == 0:
                        continue
                    ambient_rows = local * space.basis_matrix()
                    constituent = BrandtSubspace(
                        self,
                        ambient_rows.rows(),
                        name="Hecke constituent",
                    )
                    if exponent == 1:
                        finished.append(constituent)
                    else:
                        remaining.append(constituent)
            active = remaining
            if not active:
                break
        answer = finished + active
        if not anemic:
            for prime in self._ramified_primes:
                refined = []
                for space in answer:
                    if space.dimension() <= 1:
                        refined.append(space)
                        continue
                    involution = space.atkin_lehner_matrix(prime)
                    identity = _identity_matrix(self._base_ring, space.dimension())
                    for sign in (-1, 1):
                        local = (involution - identity * sign).left_kernel_matrix()
                        if local.nrows():
                            refined.append(
                                BrandtSubspace(
                                    self,
                                    (local * space.basis_matrix()).rows(),
                                    name="Atkin--Lehner constituent",
                                )
                            )
                answer = refined
        answer.sort(key=lambda item: item.dimension())
        return answer

    def decomposition(
        self, bound: Any = None, anemic: bool = True
    ) -> list[BrandtSubspace]:
        return self._decompose_subspaces(
            [self.eisenstein_subspace(), self.cuspidal_subspace()], bound, anemic
        )

    def monodromy_weights(self) -> tuple[int, ...]:
        if self._ideal_classes is not None:
            return tuple(self._ideal_classes.weights())
        if self._supersingular is None:
            raise NotImplementedError(
                "monodromy weights require the canonical quaternion ideal-class basis"
            )
        return tuple(int(value) for value in self._supersingular.automorphism_weights())

    def pairing_matrix(self) -> Any:
        weights = self.monodromy_weights()
        rows = []
        for row in range(self._dimension):
            rows.append(
                [
                    self._base_ring(weights[row] if row == column else 0)
                    for column in range(self._dimension)
                ]
            )
        return _global("matrix")(self._base_ring, rows)

    monodromy_pairing_matrix = pairing_matrix

    def inner_product(self, left: Any, right: Any) -> Any:
        left_element = self(left)
        right_element = self(right)
        pairing = self.pairing_matrix()
        return (left_element.vector() * pairing).dot_product(right_element.vector())

    def right_ideals(self) -> Any:
        if self._ideal_classes is not None:
            return self._ideal_classes.ideals()
        raise NotImplementedError(
            "general Eichler ideal enumeration is not yet the basis backend; "
            "inspect realization() before requesting ideal representatives"
        )

    def quaternion_algebra(self) -> Any:
        if self._ideal_classes is None:
            raise NotImplementedError(
                "explicit quaternion arithmetic requires realization='ideal-classes'"
            )
        return self._ideal_classes.quaternion_algebra()

    def maximal_order(self) -> Any:
        if self._ideal_classes is None:
            raise NotImplementedError(
                "explicit quaternion orders require realization='ideal-classes'"
            )
        return self._ideal_classes.maximal_order()

    def eichler_order(self) -> Any:
        if self._ideal_classes is None:
            raise NotImplementedError(
                "explicit quaternion orders require realization='ideal-classes'"
            )
        return self._ideal_classes.eichler_order()

    order_of_level_N = eichler_order

    def class_fingerprints(self) -> tuple[Any, ...]:
        if self._ideal_classes is None:
            raise NotImplementedError(
                "class fingerprints require realization='ideal-classes'"
            )
        return self._ideal_classes.class_fingerprints()

    def mass(self) -> Any:
        if self._ideal_classes is None:
            raise NotImplementedError("exact class mass requires ideal classes")
        return self._ideal_classes.mass()

    def mass_certificate(self) -> Any:
        if self._ideal_classes is None:
            raise NotImplementedError("exact class mass requires ideal classes")
        return self._ideal_classes.mass_certificate()

    def degree_zero_submodule(self) -> Any:
        from .component_groups import DegreeZeroBrandtLattice

        return DegreeZeroBrandtLattice(self)

    def __repr__(self) -> str:
        return (
            "Brandt module of discriminant "
            + str(self._discriminant)
            + " and Eichler conductor "
            + str(self._conductor)
            + " of dimension "
            + str(self._dimension)
            + " over "
            + str(self._base_ring)
            + " ("
            + self._realization
            + ")"
        )

    __str__ = __repr__
    toString = __repr__


_BRANDT_CACHE: list[tuple[tuple[Any, ...], BrandtModule_class]] = []


def BrandtModule(
    D: Any,
    N: Any = 1,
    weight: Any = 2,
    base_ring: Any = None,
    use_cache: bool = True,
    *,
    realization: str = "auto",
    dense_entry_limit: Any = 1000000,
) -> BrandtModule_class:
    r"""Construct the Brandt Hecke module of discriminant $D$ and level $N$.

    $D$ must be a squarefree product of an odd number of primes, so the
    quaternion algebra ramified at those primes and infinity is definite.
    $N$ is a positive Eichler conductor coprime to $D$. Only weight two is
    currently defined.

    `realization="auto"` uses the canonical sparse supersingular basis when
    $D\ge5$ is prime and $N=1$, and the exact rational Jacquet--Langlands
    realization otherwise.
    """
    discriminant, ramified_primes = _validate_discriminant(D)
    conductor = _positive_integer(N, "Eichler conductor")
    if _gcd(discriminant, conductor) != 1:
        raise ValueError("D and N must be coprime")
    weight_value = _positive_integer(weight, "weight")
    if weight_value != 2:
        raise NotImplementedError("Brandt modules currently implement weight 2")
    if base_ring is None:
        base_ring = sage.QQ
    if base_ring is not sage.QQ and base_ring is not sage.ZZ:
        raise NotImplementedError("Brandt modules currently use QQ or ZZ")
    limit = _integer(dense_entry_limit, "dense entry limit")
    if limit < 0:
        raise ValueError("dense entry limit must be nonnegative")
    selected = realization
    if selected == "auto":
        selected = (
            "supersingular"
            if len(ramified_primes) == 1 and ramified_primes[0] >= 5 and conductor == 1
            else "jacquet-langlands"
        )
    if selected not in ("supersingular", "jacquet-langlands", "ideal-classes"):
        raise ValueError(
            "realization must be 'auto', 'supersingular', "
            "'jacquet-langlands', or 'ideal-classes'"
        )
    if selected == "jacquet-langlands" and base_ring is sage.ZZ:
        raise NotImplementedError(
            "the general Jacquet--Langlands realization is currently over QQ"
        )
    key = (
        discriminant,
        conductor,
        weight_value,
        base_ring,
        selected,
        limit,
    )
    if use_cache:
        for cached_key, module in _BRANDT_CACHE:
            if cached_key == key:
                return module
    result = BrandtModule_class(
        discriminant,
        conductor,
        weight_value,
        base_ring,
        realization=selected,
        dense_entry_limit=limit,
    )
    if use_cache:
        _BRANDT_CACHE.append((key, result))
    return result


def dimension_brandt_module(D: Any, N: Any = 1) -> int:
    r"""Return the exact weight-two Brandt-module dimension over $\mathbf Q$."""
    return BrandtModule(D, N).dimension()


__all__ = [
    "BrandtLinearOperator",
    "BrandtModule",
    "BrandtModuleElement",
    "BrandtModule_class",
    "BrandtSubspace",
    "dimension_brandt_module",
]
