r"""Exact locally principal right ideals in definite quaternion orders.

Positive ideal-class equivalence is certified by an explicit connecting
quaternion and exact lattice replay.  Theta vectors are only negative filters.
The short-vector enumerator uses an exact Gram-LLL reduction and exact norm
comparisons; floating-point values are not part of any proof boundary.
"""

from __future__ import annotations

from itertools import product
from typing import Any, Iterable, Iterator

import sagejs as sage
import sagejs.runtime as runtime

from .algebra import (
    QuaternionElement,
    QuaternionOrder,
    _basis_matrix,
    _canonical_lattice,
    _global,
    _lattice_contains,
    _lattice_intersection,
    _rational_parts,
)

_LOCAL_PRINCIPAL_CONSTRUCTION = object()
_THEOREM_DERIVED_CONSTRUCTION = object()
_gram_lll_kernel: Any = None
_gram_lll_native: Any = None
_gram_lll_import_attempted = False
_theta_kernel: Any = None
_theta_native: Any = None
_theta_import_attempted = False
_vector_kernel: Any = None
_vector_native: Any = None
_vector_import_attempted = False


def _nearest_integer(value: Any) -> Any:
    numerator, denominator = _rational_parts(value)
    if numerator >= 0:
        return (numerator + denominator // 2) // denominator
    return -((-numerator + denominator // 2) // denominator)


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


def _rational_sqrt_bound(value: Any) -> int:
    rational = sage.QQ(value)
    if rational < 0:
        raise ValueError("a coordinate bound must be nonnegative")
    numerator, denominator = _rational_parts(rational)
    # sqrt(n/d) <= floor(sqrt(n*d)/d)+1, with one exact correction below.
    bound = _integer_sqrt(numerator * denominator) // denominator + 1
    while bound > 0 and (bound - 1) * (bound - 1) > rational:
        bound -= 1
    while bound * bound < rational:
        bound += 1
    return runtime.number(bound)


def _ldl_decomposition(
    gram: Any,
) -> tuple[tuple[tuple[Any, ...], ...], tuple[Any, ...]]:
    r"""Return the exact unit-lower $LDL^{\mathsf T}$ decomposition of `gram`."""

    dimension = gram.nrows()
    lower = [
        [sage.QQ(1 if row == column else 0) for column in range(dimension)]
        for row in range(dimension)
    ]
    diagonal: list[Any] = []
    for row in range(dimension):
        value = sage.QQ(gram[row, row])
        for previous in range(row):
            value -= lower[row][previous] ** 2 * diagonal[previous]
        if value <= 0:
            raise ArithmeticError(
                "quaternion norm Gram matrix is not positive definite"
            )
        diagonal.append(value)
        for following in range(row + 1, dimension):
            numerator = sage.QQ(gram[following, row])
            for previous in range(row):
                numerator -= (
                    lower[following][previous]
                    * lower[row][previous]
                    * diagonal[previous]
                )
            lower[following][row] = numerator / value
    return tuple(tuple(row) for row in lower), tuple(diagonal)


def _dot_gram(left: list[Any], gram: Any, right: list[Any]) -> Any:
    answer = sage.QQ(0)
    for row in range(len(left)):
        if left[row] == 0:
            continue
        for column in range(len(right)):
            if right[column] != 0:
                answer += left[row] * gram[row, column] * right[column]
    return answer


def _exact_gcd(left: Any, right: Any) -> Any:
    left = abs(sage.ZZ(left))
    right = abs(sage.ZZ(right))
    while right:
        left, right = right, left % right
    return left


def _integer_gram_data(gram: Any) -> tuple[list[list[Any]], Any]:
    """Clear one common denominator from a rational Gram matrix."""

    dimension = gram.nrows()
    denominator = sage.ZZ(1)
    for row in range(dimension):
        for column in range(dimension):
            _numerator, entry_denominator = _rational_parts(gram[row, column])
            denominator = (
                denominator
                // _exact_gcd(denominator, entry_denominator)
                * entry_denominator
            )
    answer = []
    for row in range(dimension):
        result_row = []
        for column in range(dimension):
            scaled = sage.QQ(gram[row, column]) * denominator
            numerator, entry_denominator = _rational_parts(scaled)
            if entry_denominator != 1:
                raise ArithmeticError("failed to clear a Gram-matrix denominator")
            result_row.append(sage.ZZ(numerator))
        answer.append(result_row)
    return answer, denominator


def _transformed_integer_gram(
    source: list[list[Any]], transform: list[list[Any]]
) -> list[list[Any]]:
    dimension = len(source)
    answer = [[sage.ZZ(0) for _column in range(dimension)] for _row in range(dimension)]
    for row in range(dimension):
        for column in range(row + 1):
            value = sage.ZZ(0)
            for left in range(dimension):
                if transform[row][left] == 0:
                    continue
                for right in range(dimension):
                    if transform[column][right] != 0:
                        value += (
                            transform[row][left]
                            * source[left][right]
                            * transform[column][right]
                        )
            answer[row][column] = value
            answer[column][row] = value
    return answer


def _integer_determinant(rows: list[list[Any]]) -> Any:
    """Return an exact determinant using fraction-free elimination."""

    dimension = len(rows)
    if dimension == 0:
        return sage.ZZ(1)
    matrix = [[sage.ZZ(value) for value in row] for row in rows]
    sign = 1
    previous = sage.ZZ(1)
    for column in range(dimension - 1):
        pivot = column
        while pivot < dimension and matrix[pivot][column] == 0:
            pivot += 1
        if pivot == dimension:
            return sage.ZZ(0)
        if pivot != column:
            matrix[column], matrix[pivot] = matrix[pivot], matrix[column]
            sign = -sign
        pivot_value = matrix[column][column]
        for row in range(column + 1, dimension):
            for following in range(column + 1, dimension):
                numerator = (
                    matrix[row][following] * pivot_value
                    - matrix[row][column] * matrix[column][following]
                )
                quotient, remainder = divmod(numerator, previous)
                if remainder != 0:
                    raise ArithmeticError("fraction-free determinant division failed")
                matrix[row][following] = quotient
            matrix[row][column] = sage.ZZ(0)
        previous = pivot_value
    return sign * matrix[dimension - 1][dimension - 1]


def _try_flint_gram_lll_transform(
    integer_gram: list[list[Any]],
) -> list[list[Any]] | None:
    """Return an authenticated FLINT Gram-LLL transform when available."""

    global _gram_lll_import_attempted, _gram_lll_kernel, _gram_lll_native
    dimension = len(integer_gram)
    if dimension == 0 or any(len(row) != dimension for row in integer_gram):
        return None
    if not _gram_lll_import_attempted:
        _gram_lll_import_attempted = True
        try:
            kernel_module = __import__(
                "sagejs.kernels.matrix.dense_integer_flint",
                fromlist=["dense_integer_flint"],
            )
            _gram_lll_native = __import__("sagejs.native", fromlist=["native"])
            _gram_lll_kernel = (
                kernel_module.flint_dense_integer_matrix_gram_lll_transform
            )
        except (ImportError, AttributeError):
            _gram_lll_kernel = None
            _gram_lll_native = None
    if (
        _gram_lll_kernel is None
        or _gram_lll_native is None
        or not _gram_lll_native.is_compiled(_gram_lll_kernel)
    ):
        return None
    try:
        flattened = [value for row in integer_gram for value in row]
        maximum_bits = max(
            runtime.number(abs(sage.ZZ(value)).nbits()) for value in flattened
        )
        word_capacity = max(8, (maximum_bits + 2 * dimension + 255) // 64)
        source = _gram_lll_native.kernel_integer_buffer(_gram_lll_kernel, flattened)
        reduced_output = _gram_lll_native.kernel_integer_zeros(
            _gram_lll_kernel, dimension * dimension, word_capacity
        )
        transform_output = _gram_lll_native.kernel_integer_zeros(
            _gram_lll_kernel, dimension * dimension, word_capacity
        )
        if not _gram_lll_kernel(
            reduced_output,
            transform_output,
            source,
            dimension,
            dimension,
        ):
            return None
        reduced_values = [
            sage.ZZ(value)
            for value in _gram_lll_native.integer_buffer_values(reduced_output)
        ]
        transform_values = [
            sage.ZZ(value)
            for value in _gram_lll_native.integer_buffer_values(transform_output)
        ]
        reduced = [
            reduced_values[index * dimension : (index + 1) * dimension]
            for index in range(dimension)
        ]
        transform = [
            transform_values[index * dimension : (index + 1) * dimension]
            for index in range(dimension)
        ]
        if abs(_integer_determinant(transform)) != 1:
            return None
        if reduced != _transformed_integer_gram(integer_gram, transform):
            return None
        return transform
    except (
        ArithmeticError,
        AttributeError,
        OverflowError,
        RuntimeError,
        TypeError,
        ValueError,
    ):
        return None


def _integer_gram_lll_transform(integer_gram: list[list[Any]]) -> list[list[Any]]:
    """Return a unimodular row transform reducing an integral Gram matrix."""

    dimension = len(integer_gram)
    transform = [
        [sage.ZZ(1 if row == column else 0) for column in range(dimension)]
        for row in range(dimension)
    ]
    accelerated = _try_flint_gram_lll_transform(integer_gram)
    if accelerated is not None:
        return accelerated
    reduced_gram = [list(row) for row in integer_gram]

    def row_submul(target: int, source: int, quotient: Any) -> None:
        old_diagonal = reduced_gram[target][target]
        old_pairing = reduced_gram[target][source]
        source_diagonal = reduced_gram[source][source]
        for column in range(dimension):
            if column == target:
                continue
            value = (
                reduced_gram[target][column] - quotient * reduced_gram[source][column]
            )
            reduced_gram[target][column] = value
            reduced_gram[column][target] = value
        reduced_gram[target][target] = (
            old_diagonal - 2 * quotient * old_pairing + quotient**2 * source_diagonal
        )
        transform[target] = [
            transform[target][column] - quotient * transform[source][column]
            for column in range(dimension)
        ]

    def swap(left: int, right: int) -> None:
        reduced_gram[left], reduced_gram[right] = (
            reduced_gram[right],
            reduced_gram[left],
        )
        for row in range(dimension):
            reduced_gram[row][left], reduced_gram[row][right] = (
                reduced_gram[row][right],
                reduced_gram[row][left],
            )
        transform[left], transform[right] = transform[right], transform[left]

    def gram_schmidt() -> tuple[list[list[Any]], list[Any]]:
        mu = [[sage.QQ(0) for _column in range(dimension)] for _row in range(dimension)]
        norms: list[Any] = []
        for row in range(dimension):
            for previous in range(row):
                coefficient = sage.QQ(reduced_gram[row][previous])
                for earlier in range(previous):
                    coefficient -= (
                        mu[row][earlier] * mu[previous][earlier] * norms[earlier]
                    )
                mu[row][previous] = coefficient / norms[previous]
            norm = sage.QQ(reduced_gram[row][row])
            for previous in range(row):
                norm -= mu[row][previous] ** 2 * norms[previous]
            if norm <= 0:
                raise ArithmeticError(
                    "quaternion norm Gram matrix is not positive definite"
                )
            norms.append(norm)
        return mu, norms

    index = 1
    while index < dimension:
        mu, norms = gram_schmidt()
        for previous in range(index - 1, -1, -1):
            quotient = _nearest_integer(mu[index][previous])
            if quotient != 0:
                row_submul(index, previous, quotient)
                # Subtracting a multiple of an earlier basis vector preserves
                # this row's orthogonal component and norm.  Update only the
                # exact Gram--Schmidt coefficients affected by the operation;
                # a full replay here made rank-four reduction dominate the
                # entire Brandt computation.
                for earlier in range(previous):
                    mu[index][earlier] -= quotient * mu[previous][earlier]
                mu[index][previous] -= quotient
        if (
            norms[index]
            >= (sage.QQ(3) / 4 - mu[index][index - 1] ** 2) * norms[index - 1]
        ):
            index += 1
        else:
            swap(index, index - 1)
            index = max(1, index - 1)
    if reduced_gram != _transformed_integer_gram(integer_gram, transform):
        raise ArithmeticError("Gram-LLL transform failed exact replay")
    return transform


def _linear_combination(
    algebra: Any, coefficients: Iterable[Any], basis: Iterable[QuaternionElement]
) -> QuaternionElement:
    answer = algebra.zero()
    for coefficient, element in zip(coefficients, basis, strict=True):
        answer += element * coefficient
    return answer


class _LatticeNormPlan:
    """Immutable exact reduction data for repeated rank-$4$ norm searches."""

    def __init__(self, algebra: Any, rows: Iterable[Iterable[Any]]) -> None:
        self.algebra = algebra
        self.canonical_rows = _canonical_lattice(rows)
        self.basis = tuple(algebra(row) for row in self.canonical_rows)
        self.gram = _global("matrix")(
            sage.QQ,
            [[left.pair(right) / 2 for right in self.basis] for left in self.basis],
        )
        self.integer_gram, self.gram_denominator = _integer_gram_data(self.gram)
        self.transform = tuple(
            tuple(value for value in row)
            for row in _integer_gram_lll_transform(self.integer_gram)
        )
        self.reduced_basis = tuple(
            _linear_combination(algebra, row, self.basis) for row in self.transform
        )
        self.reduced_integer_gram = _transformed_integer_gram(
            self.integer_gram, [list(row) for row in self.transform]
        )
        self.reduced_gram = _global("matrix")(
            sage.QQ,
            [
                [sage.QQ(value) / self.gram_denominator for value in integer_row]
                for integer_row in self.reduced_integer_gram
            ],
        )
        self.lower, self.diagonal = _ldl_decomposition(self.reduced_gram)
        inverse = self.reduced_gram.inverse()
        self.inverse_diagonal = tuple(inverse[index, index] for index in range(4))
        self._kernel_gram: Any = None
        self._kernel_gram_owner: Any = None


def _packed_kernel_gram(plan: _LatticeNormPlan, kernel: Any, native_module: Any) -> Any:
    """Return the reduced integral Gram matrix packed for `kernel`."""

    if plan._kernel_gram is None or plan._kernel_gram_owner is not kernel:
        plan._kernel_gram = native_module.kernel_integer_buffer(
            kernel,
            [value for row in plan.reduced_integer_gram for value in row],
        )
        plan._kernel_gram_owner = kernel
    return plan._kernel_gram


def _try_native_theta_counts(
    plan: _LatticeNormPlan, normalization: Any, precision: int
) -> tuple[int, ...] | None:
    """Count one theta prefix in the accepted live-exact workspace."""

    global _theta_import_attempted, _theta_kernel, _theta_native
    if precision <= 0:
        return ()
    normalized = sage.QQ(normalization)
    if normalized <= 0:
        return None
    if not _theta_import_attempted:
        _theta_import_attempted = True
        try:
            kernel_module = __import__(
                "sagejs.kernels.quaternion.brandt_rank4",
                fromlist=["brandt_rank4"],
            )
            _theta_native = __import__("sagejs.native", fromlist=["native"])
            _theta_kernel = kernel_module.brandt_rank4_theta_counts
        except (ImportError, AttributeError):
            _theta_kernel = None
            _theta_native = None
    if (
        _theta_kernel is None
        or _theta_native is None
        or not _theta_native.is_compiled(_theta_kernel)
    ):
        return None
    numerator, denominator = _rational_parts(normalized)
    normalization_multiplier = sage.ZZ(denominator)
    normalization_denominator = plan.gram_denominator * sage.ZZ(numerator)
    absolute_bound = (precision - 1) * normalized
    bounds = [
        _rational_sqrt_bound(absolute_bound * value) for value in plan.inverse_diagonal
    ]
    try:
        output = _theta_native.kernel_uint64_zeros(_theta_kernel, precision)
        packed_bounds = _theta_native.kernel_uint64_buffer(_theta_kernel, bounds)
        if not _theta_kernel(
            output,
            _packed_kernel_gram(plan, _theta_kernel, _theta_native),
            packed_bounds,
            normalization_multiplier,
            normalization_denominator,
            precision,
            65536,
        ):
            return None
        return tuple(
            runtime.number(value)
            for value in _theta_native.integer_buffer_values(output)
        )
    except (
        ArithmeticError,
        AttributeError,
        MemoryError,
        OverflowError,
        RuntimeError,
        TypeError,
        ValueError,
    ):
        return None


def _try_native_vectors_of_norm(
    plan: _LatticeNormPlan,
    target: Any,
    *,
    max_results: int = 256,
) -> tuple[tuple[int, ...], ...] | None:
    """Enumerate one exact norm through the bounded native rank-four kernel.

    `None` means that the compiled capability is unavailable or that its
    explicitly bounded output was insufficient.  Callers then replay the exact
    source implementation; a partial native result is never published.
    """

    global _vector_import_attempted, _vector_kernel, _vector_native
    exact_target = sage.QQ(target)
    if exact_target < 0 or max_results <= 0:
        return () if exact_target < 0 else None
    if not _vector_import_attempted:
        _vector_import_attempted = True
        try:
            kernel_module = __import__(
                "sagejs.kernels.quaternion.brandt_rank4",
                fromlist=["brandt_rank4"],
            )
            _vector_native = __import__("sagejs.native", fromlist=["native"])
            _vector_kernel = kernel_module.brandt_rank4_vectors_of_norm
        except (ImportError, AttributeError):
            _vector_kernel = None
            _vector_native = None
    if (
        _vector_kernel is None
        or _vector_native is None
        or not _vector_native.is_compiled(_vector_kernel)
    ):
        return None
    numerator, denominator = _rational_parts(exact_target)
    bounds = [
        _rational_sqrt_bound(exact_target * value) for value in plan.inverse_diagonal
    ]
    try:
        output = _vector_native.kernel_integer_zeros(
            _vector_kernel, 4 * max_results, 16
        )
        metadata = _vector_native.kernel_uint64_zeros(_vector_kernel, 1)
        packed_bounds = _vector_native.kernel_uint64_buffer(_vector_kernel, bounds)
        if not _vector_kernel(
            output,
            metadata,
            _packed_kernel_gram(plan, _vector_kernel, _vector_native),
            packed_bounds,
            denominator,
            numerator * plan.gram_denominator,
            65536,
        ):
            return None
        count = runtime.number(_vector_native.integer_buffer_values(metadata)[0])
        values = _vector_native.integer_buffer_values(output)
        return tuple(
            tuple(
                runtime.number(values[4 * index + coordinate])
                for coordinate in range(4)
            )
            for index in range(count)
        )
    except (
        ArithmeticError,
        AttributeError,
        MemoryError,
        OverflowError,
        RuntimeError,
        TypeError,
        ValueError,
    ):
        return None


def _enumerate_plan_by_norm(
    plan: _LatticeNormPlan,
    absolute_bound: Any,
) -> Iterator[tuple[tuple[int, ...], Any]]:
    """Enumerate exact coordinates and norms using recursive Gram pruning."""

    bound = sage.QQ(absolute_bound)
    if bound < 0:
        return
    dimension = len(plan.diagonal)
    coordinates = [0 for _index in range(dimension)]

    def visit(index: int, remaining: Any) -> Iterator[tuple[tuple[int, ...], Any]]:
        if index < 0:
            vector = tuple(coordinates)
            norm = _dot_gram(list(vector), plan.reduced_gram, list(vector))
            if norm <= bound:
                yield vector, norm
            return
        shift = sage.QQ(0)
        for following in range(index + 1, dimension):
            shift += plan.lower[following][index] * coordinates[following]
        radius = _rational_sqrt_bound(remaining / plan.diagonal[index])
        center = runtime.number(_nearest_integer(-shift))
        for value in range(center - radius - 1, center + radius + 2):
            term = plan.diagonal[index] * (value + shift) ** 2
            if term > remaining:
                continue
            coordinates[index] = value
            yield from visit(index - 1, remaining - term)

    yield from visit(dimension - 1, bound)


def _rational_mod(value: Any, prime: int) -> int:
    numerator, denominator = _rational_parts(value)
    numerator_value = runtime.number(sage.ZZ(numerator) % prime)
    denominator_value = runtime.number(sage.ZZ(denominator) % prime)
    if denominator_value == 0:
        raise ZeroDivisionError("a local quaternion coordinate has bad denominator")
    return numerator_value * pow(denominator_value, prime - 2, prime) % prime


def _matrix_rank_mod(rows: Iterable[Iterable[int]], prime: int) -> int:
    matrix = [[value % prime for value in row] for row in rows]
    if not matrix:
        return 0
    column = 0
    rank = 0
    while rank < len(matrix) and column < len(matrix[0]):
        pivot = rank
        while pivot < len(matrix) and matrix[pivot][column] == 0:
            pivot += 1
        if pivot == len(matrix):
            column += 1
            continue
        matrix[rank], matrix[pivot] = matrix[pivot], matrix[rank]
        inverse = pow(matrix[rank][column], prime - 2, prime)
        matrix[rank] = [(value * inverse) % prime for value in matrix[rank]]
        for row in range(len(matrix)):
            if row == rank:
                continue
            coefficient = matrix[row][column]
            if coefficient:
                matrix[row] = [
                    (left - coefficient * right) % prime
                    for left, right in zip(matrix[row], matrix[rank], strict=True)
                ]
        rank += 1
        column += 1
    return rank


def _vector_matrix(
    vector: tuple[int, ...], matrix: list[list[int]], prime: int
) -> tuple[int, ...]:
    return tuple(
        sum(vector[row] * matrix[row][column] for row in range(len(vector))) % prime
        for column in range(len(matrix[0]))
    )


def _local_split_basis(
    order: QuaternionOrder, prime: int
) -> tuple[QuaternionElement, QuaternionElement, QuaternionElement, int]:
    """Return one cached local algebra basis suitable for neighbor generation."""

    for cached_prime, alpha, beta, gamma, root in order._neighbor_split_cache:
        if cached_prime == prime:
            if alpha is None or beta is None or gamma is None:
                raise ArithmeticError("a cached local splitting basis is incomplete")
            return alpha, beta, gamma, root
    algebra = order.quaternion_algebra()
    alpha: QuaternionElement | None = None
    beta: QuaternionElement | None = None
    gamma: QuaternionElement | None = None
    gamma_root = 0
    centered = tuple(range(-(prime // 2), prime - prime // 2))
    for coefficients in product(centered, repeat=4):
        if all(value == 0 for value in coefficients):
            continue
        candidate = _linear_combination(algebra, coefficients, order.basis())
        trace_residue = runtime.number(sage.ZZ(candidate.reduced_trace()) % prime)
        norm_residue = runtime.number(sage.ZZ(candidate.reduced_norm()) % prime)
        discriminant = candidate.reduced_trace() ** 2 - 4 * candidate.reduced_norm()
        residue = runtime.number(sage.ZZ(discriminant) % prime)
        irreducible = (
            trace_residue != 0 and norm_residue != 0
            if prime == 2
            else residue != 0 and pow(residue, (prime - 1) // 2, prime) == prime - 1
        )
        if irreducible:
            alpha = candidate
            break
    if alpha is None:
        raise ArithmeticError(
            "failed to find an irreducible local quaternion generator"
        )
    inverse_order_basis = order.basis_matrix().inverse()
    for coefficients in product(centered, repeat=4):
        candidate = _linear_combination(algebra, coefficients, order.basis())
        ambient_rows = [
            tuple(algebra.one()),
            tuple(alpha),
            tuple(candidate),
            tuple(alpha * candidate),
        ]
        integral_rows = []
        for row in ambient_rows:
            coordinates = _global("vector")(sage.QQ, row) * inverse_order_basis
            integral_rows.append([_rational_mod(value, prime) for value in coordinates])
        if _matrix_rank_mod(integral_rows, prime) == 4:
            beta = candidate
            break
    if beta is None:
        raise ArithmeticError("failed to find a second local quaternion generator")
    # A split semisimple element gives a primitive idempotent
    # e=(gamma-root')/(root-root') in O/pO.  Its two minimal right ideals,
    # together with their graphs, identify P^1(F_p) directly below.
    for coefficients in product(centered, repeat=4):
        candidate = _linear_combination(algebra, coefficients, order.basis())
        trace = runtime.number(sage.ZZ(candidate.reduced_trace()) % prime)
        norm = runtime.number(sage.ZZ(candidate.reduced_norm()) % prime)
        roots = [
            root
            for root in range(prime)
            if (root * root - trace * root + norm) % prime == 0
        ]
        if len(roots) == 2 and roots[0] != roots[1]:
            gamma = candidate
            gamma_root = roots[0]
            break
    if gamma is None:
        raise ArithmeticError("failed to find a split local quaternion element")
    assert alpha is not None and beta is not None and gamma is not None
    order._neighbor_split_cache.append((prime, alpha, beta, gamma, gamma_root))
    return alpha, beta, gamma, gamma_root


class QuaternionRightIdeal:
    """A normalized right ideal of a certified quaternion order."""

    def __init__(
        self,
        right_order: QuaternionOrder,
        basis: Iterable[Any],
        *,
        _construction_proof: Any = None,
    ) -> None:
        self._right_order = right_order
        self._algebra = right_order.quaternion_algebra()
        self._basis_rows = _canonical_lattice(
            tuple(self._algebra(value)) for value in basis
        )
        self._basis = tuple(self._algebra(row) for row in self._basis_rows)
        self._right_ideal_proven = _construction_proof is _THEOREM_DERIVED_CONSTRUCTION
        if not self._right_ideal_proven and not self._replay_right_ideal():
            raise ValueError("the lattice is not a right ideal of the requested order")
        self._right_ideal_proven = True
        self._left_order: QuaternionOrder | None = None
        self._left_order_product_rows: tuple[tuple[Any, ...], ...] | None = None
        self._left_order_product_plan: _LatticeNormPlan | None = None
        self._norm: Any | None = None
        self._norm_plan: _LatticeNormPlan | None = None
        self._theta_cache: tuple[int, ...] = ()
        self._unit_weight_cache: int | None = None
        self._local_principality_proven = _construction_proof in (
            _LOCAL_PRINCIPAL_CONSTRUCTION,
            _THEOREM_DERIVED_CONSTRUCTION,
        )
        if (
            not self._local_principality_proven
            and not self._replay_local_principality()
        ):
            raise ValueError(
                "the right-ideal lattice is not a locally principal proper ideal"
            )
        self._local_principality_proven = True

    def quaternion_algebra(self) -> Any:
        return self._algebra

    def basis(self) -> tuple[QuaternionElement, ...]:
        return self._basis

    gens = basis

    def basis_matrix(self) -> Any:
        return _basis_matrix(self._basis_rows)

    def contains(self, value: Any) -> bool:
        return _lattice_contains(self._basis_rows, self._algebra(value))

    def __contains__(self, value: Any) -> bool:
        return self.contains(value)

    def right_order(self) -> QuaternionOrder:
        return self._right_order

    def _replay_right_ideal(self) -> bool:
        for element in self._basis:
            for order_element in self._right_order.basis():
                if not self.contains(element * order_element):
                    return False
        return True

    def is_right_ideal(self, *, replay: bool = False) -> bool:
        """Return the construction proof, or replay closure under the order."""

        if replay:
            return self._replay_right_ideal()
        return self._right_ideal_proven

    def _compute_order(self, side: str) -> QuaternionOrder:
        ambient = self._algebra.basis()
        ideal_matrix = self.basis_matrix()
        lattices = []
        for generator in self._basis:
            if side == "left":
                multiplication_rows = [
                    tuple(element * generator) for element in ambient
                ]
            elif side == "right":
                multiplication_rows = [
                    tuple(generator * element) for element in ambient
                ]
            else:
                raise ValueError("side must be left or right")
            multiplication = _global("matrix")(sage.QQ, multiplication_rows)
            lattices.append(
                _canonical_lattice((ideal_matrix * multiplication.inverse()).rows())
            )
        return QuaternionOrder(self._algebra, _lattice_intersection(lattices))

    def left_order(self) -> QuaternionOrder:
        if self._left_order is None:
            if self._local_principality_proven:
                ideal_norm = self.norm()
                rows = tuple(
                    tuple(value / ideal_norm for value in row)
                    for row in self._left_order_product_lattice()
                )
                self._left_order = QuaternionOrder(self._algebra, rows)
            else:
                self._left_order = self._compute_order("left")
        return self._left_order

    def _left_order_product_lattice(self) -> tuple[tuple[Any, ...], ...]:
        if self._left_order_product_rows is None:
            self._left_order_product_rows = self.multiply_by_conjugate(self)
        return self._left_order_product_rows

    def _left_order_product_norm_plan(self) -> _LatticeNormPlan:
        if self._left_order_product_plan is None:
            self._left_order_product_plan = _LatticeNormPlan(
                self._algebra, self._left_order_product_lattice()
            )
        return self._left_order_product_plan

    def norm(self) -> Any:
        if self._norm is None:
            gram = self.gram_matrix()
            determinant = gram.determinant() / (2**4)
            if determinant < 0:
                determinant = -determinant
            numerator, denominator = _rational_parts(determinant)
            numerator_integer = sage.ZZ(numerator)
            denominator_integer = sage.ZZ(denominator)
            if not numerator_integer.is_square() or not denominator_integer.is_square():
                raise ArithmeticError("the ideal norm determinant is not a square")
            volume = sage.QQ(_integer_sqrt(numerator_integer)) / _integer_sqrt(
                denominator_integer
            )
            quotient = volume / self._right_order.discriminant()
            numerator, denominator = _rational_parts(quotient)
            numerator_integer = sage.ZZ(numerator)
            denominator_integer = sage.ZZ(denominator)
            if not numerator_integer.is_square() or not denominator_integer.is_square():
                raise ArithmeticError("the ideal reduced norm is not a square")
            self._norm = sage.QQ(_integer_sqrt(numerator_integer)) / _integer_sqrt(
                denominator_integer
            )
        return self._norm

    def _replay_local_principality(self) -> bool:
        left_order = self.left_order()
        if left_order.discriminant() != self._right_order.discriminant():
            return False
        ideal_norm = self.norm()
        product_lattice = _canonical_lattice(
            tuple(left * right.conjugate() / ideal_norm)
            for left in self._basis
            for right in self._basis
        )
        return product_lattice == tuple(
            tuple(element) for element in left_order.basis()
        )

    def is_locally_principal(self, *, replay: bool = False) -> bool:
        """Return the construction proof, or replay $I\bar I=N(I)O_L(I)$."""

        if replay:
            return self._replay_local_principality()
        return self._local_principality_proven

    def gram_matrix(self) -> Any:
        return _global("matrix")(
            sage.QQ,
            [[2 * left.pair(right) for right in self._basis] for left in self._basis],
        )

    def _lattice_norm_plan(self) -> _LatticeNormPlan:
        if self._norm_plan is None:
            self._norm_plan = _LatticeNormPlan(self._algebra, self._basis_rows)
        return self._norm_plan

    def reduced_basis(self) -> tuple[QuaternionElement, ...]:
        return self._lattice_norm_plan().reduced_basis

    def elements_with_normalized_norm_at_most(
        self, bound: Any
    ) -> Iterator[tuple[QuaternionElement, Any]]:
        normalized_bound = sage.QQ(bound)
        if normalized_bound < 0:
            return
        absolute_bound = normalized_bound * self.norm()
        plan = self._lattice_norm_plan()
        for coordinates, norm in _enumerate_plan_by_norm(plan, absolute_bound):
            yield (
                _linear_combination(self._algebra, coordinates, plan.reduced_basis),
                norm / self.norm(),
            )

    def theta_series_vector(self, precision: Any) -> tuple[int, ...]:
        bound = runtime.number(runtime.normalize_integer(precision))
        if bound <= 0:
            return ()
        if len(self._theta_cache) >= bound:
            return self._theta_cache[:bound]
        old_bound = len(self._theta_cache)
        native_counts = _try_native_theta_counts(
            self._lattice_norm_plan(), self.norm(), bound
        )
        if native_counts is not None:
            if native_counts[:old_bound] != self._theta_cache:
                raise ArithmeticError("native theta extension changed a proved prefix")
            self._theta_cache = native_counts
            return self._theta_cache
        coefficients = list(self._theta_cache) + [
            0 for _index in range(old_bound, bound)
        ]
        ideal_norm = self.norm()
        plan = self._lattice_norm_plan()
        for _coordinates, norm in _enumerate_plan_by_norm(
            plan, (bound - 1) * ideal_norm
        ):
            normalized_norm = norm / ideal_norm
            numerator, denominator = _rational_parts(normalized_norm)
            if denominator != 1:
                raise ArithmeticError(
                    "a locally principal ideal has a nonintegral normalized norm"
                )
            index = runtime.number(numerator)
            if old_bound <= index < bound:
                coefficients[index] += 1
        self._theta_cache = tuple(coefficients)
        return self._theta_cache

    def elements_of_normalized_norm(self, value: Any) -> tuple[QuaternionElement, ...]:
        target = sage.QQ(value)
        if target < 0:
            return ()
        ideal_norm = self.norm()
        absolute_target = target * ideal_norm
        plan = self._lattice_norm_plan()
        answer = []
        native_coordinates = _try_native_vectors_of_norm(
            plan, absolute_target, max_results=4096
        )
        if native_coordinates is not None:
            for coordinates in native_coordinates:
                if (
                    _dot_gram(list(coordinates), plan.reduced_gram, list(coordinates))
                    != absolute_target
                ):
                    raise ArithmeticError(
                        "native rank-four norm enumeration failed exact replay"
                    )
                answer.append(
                    _linear_combination(self._algebra, coordinates, plan.reduced_basis)
                )
            return tuple(answer)
        for coordinates, norm in _enumerate_plan_by_norm(plan, absolute_target):
            if norm == absolute_target:
                answer.append(
                    _linear_combination(self._algebra, coordinates, plan.reduced_basis)
                )
        return tuple(answer)

    def scale(self, value: Any, *, left: bool = True) -> QuaternionRightIdeal:
        scalar = self._algebra(value)
        if scalar.is_zero():
            raise ValueError("an ideal scaling quaternion must be nonzero")
        if left:
            basis = tuple(scalar * element for element in self._basis)
            result = QuaternionRightIdeal(
                self._right_order,
                basis,
                _construction_proof=_THEOREM_DERIVED_CONSTRUCTION,
            )
        else:
            basis = tuple(element * scalar for element in self._basis)
            result = QuaternionRightIdeal(self._compute_order("right"), basis)
        return result

    def conjugate_basis(self) -> tuple[QuaternionElement, ...]:
        return tuple(element.conjugate() for element in self._basis)

    def multiply_by_conjugate(
        self, other: QuaternionRightIdeal
    ) -> tuple[tuple[Any, ...], ...]:
        if other._algebra.invariants() != self._algebra.invariants():
            raise TypeError("quaternion ideals have different ambient algebras")
        return _canonical_lattice(
            tuple(left * right.conjugate())
            for left in self._basis
            for right in other._basis
        )

    def is_equivalent(
        self,
        other: QuaternionRightIdeal,
        *,
        certificate: bool = False,
        theta_precision: int = 6,
    ) -> Any:
        if other.right_order() != self._right_order:
            raise ValueError("equivalent right ideals must have the same right order")
        if theta_precision > 0 and self.theta_series_vector(
            theta_precision
        ) != other.theta_series_vector(theta_precision):
            return (False, None) if certificate else False
        connecting_rows = self.multiply_by_conjugate(other)
        scaled_rows = [
            tuple(value / other.norm() for value in row) for row in connecting_rows
        ]
        target = self.norm() / other.norm()
        plan = _LatticeNormPlan(self._algebra, scaled_rows)
        native_coordinates = _try_native_vectors_of_norm(plan, target)
        if native_coordinates is None:
            candidates = (
                coordinates
                for coordinates, norm in _enumerate_plan_by_norm(plan, target)
                if norm == target
            )
        else:
            candidates = iter(native_coordinates)
        for coordinates in candidates:
            alpha = _linear_combination(self._algebra, coordinates, plan.reduced_basis)
            if self._basis_rows == _canonical_lattice(
                tuple(alpha * value for value in other._basis)
            ):
                return (True, alpha) if certificate else True
        return (False, None) if certificate else False

    is_right_equivalent = is_equivalent

    def cyclic_right_subideals(self, prime: int) -> tuple[QuaternionRightIdeal, ...]:
        if self._right_order.discriminant() % prime == 0:
            raise ValueError(
                "the neighbor prime must be coprime to the order discriminant"
            )
        order = self._right_order
        alpha, beta, gamma, gamma_root = _local_split_basis(order, prime)

        inverse_basis = self.basis_matrix().inverse()

        def action_matrix(element: QuaternionElement) -> list[list[int]]:
            rows = []
            for basis_element in self._basis:
                coordinates = (
                    _global("vector")(sage.QQ, tuple(basis_element * element))
                    * inverse_basis
                )
                row = []
                for value in coordinates:
                    if value._denominator != 1:
                        raise ArithmeticError("right-ideal action is not integral")
                    row.append(runtime.number(sage.ZZ(value) % prime))
                rows.append(row)
            return rows

        alpha_action = action_matrix(alpha)
        beta_action = action_matrix(beta)
        gamma_action = action_matrix(gamma)
        standard = tuple(
            tuple(1 if row == column else 0 for column in range(4)) for row in range(4)
        )
        gamma_trace = runtime.number(sage.ZZ(gamma.reduced_trace()) % prime)
        other_root = (gamma_trace - gamma_root) % prime
        root_difference = (gamma_root - other_root) % prime
        if root_difference == 0:
            raise ArithmeticError("a split local element has a repeated root")
        inverse_difference = pow(root_difference, prime - 2, prime)
        idempotent_action = []
        complement_action = []
        for row in range(4):
            idempotent_row = []
            complement_row = []
            for column in range(4):
                identity = 1 if row == column else 0
                value = (
                    (gamma_action[row][column] - other_root * identity)
                    * inverse_difference
                ) % prime
                idempotent_row.append(value)
                complement_row.append((identity - value) % prime)
            idempotent_action.append(idempotent_row)
            complement_action.append(complement_row)

        generator: tuple[int, ...] | None = None
        for candidate in standard:
            candidate_alpha = _vector_matrix(candidate, alpha_action, prime)
            candidate_beta = _vector_matrix(candidate, beta_action, prime)
            if (
                _matrix_rank_mod(
                    [
                        candidate,
                        candidate_alpha,
                        candidate_beta,
                        _vector_matrix(candidate_alpha, beta_action, prime),
                    ],
                    prime,
                )
                == 4
            ):
                generator = candidate
                break
        if generator is None:
            for coefficients in product(range(prime), repeat=4):
                if all(value == 0 for value in coefficients):
                    continue
                candidate = tuple(coefficients)
                candidate_alpha = _vector_matrix(candidate, alpha_action, prime)
                candidate_beta = _vector_matrix(candidate, beta_action, prime)
                if (
                    _matrix_rank_mod(
                        [
                            candidate,
                            candidate_alpha,
                            candidate_beta,
                            _vector_matrix(candidate_alpha, beta_action, prime),
                        ],
                        prime,
                    )
                    == 4
                ):
                    generator = candidate
                    break
        if generator is None:
            raise ArithmeticError(
                "failed to find a generator of the local ideal module"
            )

        finite_seed = _vector_matrix(generator, idempotent_action, prime)
        infinite_seed = _vector_matrix(generator, complement_action, prime)
        graph_seed = _vector_matrix(
            _vector_matrix(infinite_seed, beta_action, prime),
            idempotent_action,
            prime,
        )
        if all(value == 0 for value in graph_seed):
            for element in order.basis():
                action = action_matrix(element)
                graph_seed = _vector_matrix(
                    _vector_matrix(infinite_seed, action, prime),
                    idempotent_action,
                    prime,
                )
                if any(value != 0 for value in graph_seed):
                    break
        if all(value == 0 for value in graph_seed):
            raise ArithmeticError("failed to connect the two local minimal ideals")

        candidates = []
        projective_seeds = [
            tuple(
                (finite_seed[index] + scalar * graph_seed[index]) % prime
                for index in range(4)
            )
            for scalar in range(prime)
        ]
        projective_seeds.append(infinite_seed)
        for first_row in projective_seeds:
            second_row = _vector_matrix(first_row, alpha_action, prime)
            beta_row = _vector_matrix(first_row, beta_action, prime)
            alpha_beta_row = _vector_matrix(second_row, beta_action, prime)
            if (
                _matrix_rank_mod(
                    [first_row, second_row, beta_row, alpha_beta_row], prime
                )
                != 2
            ):
                raise ArithmeticError("a projective local row is not a right submodule")
            rows = [
                tuple(prime * value for value in basis_element)
                for basis_element in self._basis
            ]
            rows.append(
                tuple(_linear_combination(self._algebra, first_row, self._basis))
            )
            rows.append(
                tuple(_linear_combination(self._algebra, second_row, self._basis))
            )
            candidate = QuaternionRightIdeal(
                order,
                rows,
                _construction_proof=_THEOREM_DERIVED_CONSTRUCTION,
            )
            if candidate not in candidates:
                candidates.append(candidate)
        if len(candidates) != prime + 1:
            raise ArithmeticError(
                "local neighbor enumeration did not produce ell+1 ideals"
            )
        return tuple(candidates)

    def unit_weight(self) -> int:
        if self._unit_weight_cache is not None:
            return self._unit_weight_cache
        # For a locally principal ideal, I*conjugate(I)=N(I)*O_L(I).
        # Count the norm-N(I)^2 vectors in this product lattice directly;
        # constructing the left order and then a second public unit ideal is
        # semantically redundant on this proof-backed path.
        target = self.norm() ** 2
        native_counts = _try_native_theta_counts(
            self._left_order_product_norm_plan(), target, 2
        )
        if native_counts is not None:
            count = native_counts[1]
            if count % 2:
                raise ArithmeticError(
                    "a definite rational unit group must contain plus/minus pairs"
                )
            self._unit_weight_cache = count // 2
            return self._unit_weight_cache
        count = 0
        for _coordinates, norm in _enumerate_plan_by_norm(
            self._left_order_product_norm_plan(), target
        ):
            if norm == target:
                count += 1
        if count % 2:
            raise ArithmeticError(
                "a definite rational unit group must contain plus/minus pairs"
            )
        self._unit_weight_cache = count // 2
        return self._unit_weight_cache

    def fingerprint(self) -> tuple[Any, ...]:
        return (self.theta_series_vector(12), self.unit_weight(), self._basis_rows)

    def __eq__(self, other: object) -> bool:
        return (
            isinstance(other, QuaternionRightIdeal)
            and other._right_order == self._right_order
            and other._basis_rows == self._basis_rows
        )

    def __hash__(self) -> int:
        return hash((self._right_order, self._basis_rows))

    def __repr__(self) -> str:
        return "Fractional right ideal " + repr(self._basis)

    __str__ = __repr__
    toString = __repr__


__all__ = ["QuaternionRightIdeal"]
