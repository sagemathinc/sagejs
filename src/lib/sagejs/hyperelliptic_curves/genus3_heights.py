"""Bounded Faltings--Hriljac arithmetic for genus-3 Jacobians.

This module is the reference layer for canonical heights on odd-degree
genus-3 hyperelliptic curves over `QQ`.  It deliberately separates the two
very different parts of a Faltings--Hriljac computation:

- exact finite-place intersection arithmetic on a supplied proper regular
  model; and
- numerical archimedean Green functions computed from a supplied normalized
  period matrix and Abel--Jacobi coordinates.

The current local-reduction certificates do not contain enough incidence and
blow-up data to reconstruct a proper regular model.  Consequently this module
never infers an intersection matrix from a cluster picture.  A finite local
symbol is returned only from explicit regular-model data (or the special
reduced semistable graph constructor below).  Missing primes and unsupported
singular intersections raise `Genus3HeightCapabilityError` with diagnostics.

The formulas and normalization follow D. Holmes, *Computing Neron--Tate
Heights of Points on Hyperelliptic Jacobians*, and J. S. Muller, *Computing
Canonical Heights Using Arithmetic Intersection Theory*.  If `D` and `E`
have disjoint support, the global Neron symbol satisfies

```text
<D,E> = sum_p i_p(Dbar + Phi_p(D), Ebar) log(p) + <D,E>_infinity,
([D],[E])_NT = -<D,E>.
```

The theta path uses arbitrary-precision `mpmath` plus an independent radius
refinement.  It is strong numerical evidence, not a rigorous enclosure, so a
result assembled from it always has `rigorous=False`.
"""

from __future__ import annotations

from typing import Any, Mapping

import sagejs as sage
from mpmath import mp


class Genus3HeightCapabilityError(NotImplementedError):
    """The requested height lies outside the certified reference envelope."""

    def __init__(self, message: str, diagnostics: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.diagnostics = {} if diagnostics is None else dict(diagnostics)


class Genus3HeightResourceError(ValueError):
    """A height plan exceeds an explicit resource limit."""

    def __init__(self, message: str, diagnostics: dict[str, Any]) -> None:
        super().__init__(message)
        self.diagnostics = dict(diagnostics)


class Genus3HeightNumericalIndeterminacyError(ArithmeticError):
    """Independent numerical refinements do not isolate a height term."""

    def __init__(self, message: str, diagnostics: dict[str, Any]) -> None:
        super().__init__(message)
        self.diagnostics = dict(diagnostics)


class _AutomaticFiniteVerification:
    """Internal replay witness bound to one curve and horizontal divisor pair."""

    def __init__(self, curve_key: Any, divisor_key: Any, reduction_key: Any) -> None:
        self.curve_key = curve_key
        self.divisor_key = divisor_key
        self.reduction_key = reduction_key


class _CandidateSupportVerification:
    """Internal exact-factorization witness for a complete candidate set."""

    def __init__(self, curve_key: Any, divisor_key: Any) -> None:
        self.curve_key = curve_key
        self.divisor_key = divisor_key


class _FinitePlanVerification:
    """Internal witness binding one complete finite plan to an exact move."""

    def __init__(self, curve_key: Any, divisor_key: Any, move_key: Any) -> None:
        self.curve_key = curve_key
        self.divisor_key = divisor_key
        self.move_key = move_key


class _AutomaticArchimedeanVerification:
    """Internal numerical-refinement witness; never a rigorous enclosure."""

    def __init__(
        self,
        precision: int,
        convention: str,
        *,
        curve_key: Any = None,
        move_key: Any = None,
    ) -> None:
        self.precision = precision
        self.convention = convention
        self.curve_key = curve_key
        self.move_key = move_key


def _positive_integer(value: Any, name: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise ValueError(name + " must be a positive integer")
    return int(value)


class Genus3HeightLimits:
    """Resource limits shared by exact and archimedean reference paths."""

    def __init__(
        self,
        *,
        max_components: int = 64,
        max_theta_radius: int = 36,
        max_theta_terms: int = 2_000_000,
        max_archimedean_terms: int = 64,
        max_pairing_rank: int = 24,
        max_factor_bits: int = 512,
    ) -> None:
        self.max_components = _positive_integer(max_components, "max_components")
        self.max_theta_radius = _positive_integer(max_theta_radius, "max_theta_radius")
        self.max_theta_terms = _positive_integer(max_theta_terms, "max_theta_terms")
        self.max_archimedean_terms = _positive_integer(
            max_archimedean_terms, "max_archimedean_terms"
        )
        self.max_pairing_rank = _positive_integer(max_pairing_rank, "max_pairing_rank")
        self.max_factor_bits = _positive_integer(max_factor_bits, "max_factor_bits")

    def to_dict(self) -> dict[str, int]:
        return {
            "max_components": self.max_components,
            "max_theta_radius": self.max_theta_radius,
            "max_theta_terms": self.max_theta_terms,
            "max_archimedean_terms": self.max_archimedean_terms,
            "max_pairing_rank": self.max_pairing_rank,
            "max_factor_bits": self.max_factor_bits,
        }


DEFAULT_HEIGHT_LIMITS = Genus3HeightLimits()


def _checked_prime(value: Any) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise TypeError("a finite-place prime must be an integer")
    prime = int(value)
    if prime < 2:
        raise ValueError("a finite-place prime must be at least 2")
    divisor = 2
    while divisor <= prime // divisor:
        if prime % divisor == 0:
            raise ValueError("a finite-place prime must be prime")
        divisor += 1 if divisor == 2 else 2
    return prime


def _qq(value: Any) -> Any:
    return sage.QQ(value)


def _qq_string(value: Any) -> str:
    rational = _qq(value)
    numerator = int(rational._numerator)
    denominator = int(rational._denominator)
    if denominator == 1:
        return str(numerator)
    return str(numerator) + "/" + str(denominator)


def _curve_key(curve: Any) -> tuple[Any, ...]:
    f_value, h_value = curve.hyperelliptic_polynomials()
    return (
        int(curve.genus()),
        tuple(_qq_string(value) for value in f_value.list()),
        tuple(_qq_string(value) for value in h_value.list()),
    )


def _divisor_pair_key(
    left_terms: Any,
    right_terms: Any,
    left_infinity: Any,
    right_infinity: Any,
) -> tuple[Any, ...]:
    def terms_key(terms: Any) -> tuple[Any, ...]:
        return tuple(
            (
                _qq_string(term[0]),
                tuple(_qq_string(coordinate) for coordinate in term[1]),
            )
            for term in terms
        )

    return (
        terms_key(left_terms),
        terms_key(right_terms),
        _qq_string(left_infinity),
        _qq_string(right_infinity),
    )


def _point_key(point: Any) -> tuple[str, str]:
    x_value, y_value = point.xy()
    return (_qq_string(x_value), _qq_string(y_value))


def _move_key(move: Any) -> tuple[Any, ...]:
    """Return an exact representation key for one Holmes moving datum."""
    u_value, v_value = move.divisor.uv()
    return (
        _curve_key(move.curve),
        (
            tuple(_qq_string(value) for value in u_value.list()),
            tuple(_qq_string(value) for value in v_value.list()),
        ),
        _divisor_pair_key(
            move.left_affine_terms,
            move.right_affine_terms,
            -move.degree,
            0,
        ),
        tuple(_point_key(point) for point in move.moving_fibre),
        (None if move.auxiliary_point is None else _point_key(move.auxiliary_point)),
        tuple(
            (
                tuple(_point_key(point) for point in left),
                tuple(_point_key(point) for point in right),
            )
            for left, right in move.theta_pairs
        ),
        int(move.negative_class_multiple),
    )


def _mpf_qq(value: Any) -> Any:
    """Embed one exact Sage rational into the active `mpmath` context."""
    rational = _qq(value)
    return mp.mpf(int(rational._numerator)) / mp.mpf(int(rational._denominator))


def _mpf_value(value: Any) -> Any:
    if hasattr(value, "_numerator") and hasattr(value, "_denominator"):
        result = _mpf_qq(value)
    else:
        result = mp.mpf(value)
    if not mp.isfinite(result):
        raise ValueError("a numerical height value must be finite")
    return result


def _matrix_rows(values: Any, name: str) -> list[list[Any]]:
    rows = [list(row) for row in values]
    if not rows:
        raise ValueError(name + " must be nonempty")
    width = len(rows)
    if any(len(row) != width for row in rows):
        raise ValueError(name + " must be square")
    return [[_qq(value) for value in row] for row in rows]


def _is_symmetric(values: list[list[Any]]) -> bool:
    return all(
        values[row][column] == values[column][row]
        for row in range(len(values))
        for column in range(row)
    )


def _solve_exact(matrix: list[list[Any]], right: list[Any]) -> list[Any]:
    """Solve one square rational system by checked Gaussian elimination."""
    size = len(matrix)
    if len(right) != size or any(len(row) != size for row in matrix):
        raise ValueError("an exact solve requires matching square dimensions")
    augmented = [
        [_qq(value) for value in matrix[row]] + [_qq(right[row])] for row in range(size)
    ]
    for column in range(size):
        pivot = column
        while pivot < size and augmented[pivot][column] == 0:
            pivot += 1
        if pivot == size:
            raise ArithmeticError("the reduced intersection matrix is singular")
        if pivot != column:
            augmented[pivot], augmented[column] = (
                augmented[column],
                augmented[pivot],
            )
        scale = augmented[column][column]
        augmented[column] = [value / scale for value in augmented[column]]
        for row in range(size):
            if row == column:
                continue
            factor = augmented[row][column]
            if factor == 0:
                continue
            augmented[row] = [
                augmented[row][index] - factor * augmented[column][index]
                for index in range(size + 1)
            ]
    answer = [augmented[row][-1] for row in range(size)]
    for row in range(size):
        if (
            sum(matrix[row][column] * answer[column] for column in range(size))
            != right[row]
        ):
            raise ArithmeticError("an exact linear-system check failed")
    return answer


def _determinant_exact(matrix: list[list[Any]]) -> Any:
    size = len(matrix)
    if any(len(row) != size for row in matrix):
        raise ValueError("a determinant requires a square matrix")
    if size == 0:
        return _qq(1)
    working = [[_qq(value) for value in row] for row in matrix]
    answer = _qq(1)
    for column in range(size):
        pivot = column
        while pivot < size and working[pivot][column] == 0:
            pivot += 1
        if pivot == size:
            return _qq(0)
        if pivot != column:
            working[pivot], working[column] = working[column], working[pivot]
            answer = -answer
        pivot_value = working[column][column]
        answer *= pivot_value
        for row in range(column + 1, size):
            factor = working[row][column] / pivot_value
            for index in range(column + 1, size):
                working[row][index] -= factor * working[column][index]
    return answer


class RegularModelPrimeData:
    """Exact scaled-component data for one proper regular model.

    If the special fibre is `sum(n_i Gamma_i)`, `intersection_matrix` is
    `i(n_i Gamma_i, n_j Gamma_j)`.  A horizontal divisor vector is therefore
    `s(D)_i = n_i i(Dbar, Gamma_i)`, precisely the convention in Muller's
    correction formula.  The identity component must have multiplicity one.
    """

    def __init__(
        self,
        prime: int,
        intersection_matrix: Any,
        multiplicities: Any,
        *,
        identity_component: int = 0,
        model_certified: bool,
        provenance: Mapping[str, Any],
        limits: Genus3HeightLimits = DEFAULT_HEIGHT_LIMITS,
    ) -> None:
        self.prime = _checked_prime(prime)
        self.intersection_matrix = _matrix_rows(
            intersection_matrix, "intersection_matrix"
        )
        self.component_count = len(self.intersection_matrix)
        if self.component_count > limits.max_components:
            raise Genus3HeightResourceError(
                "the regular model has too many components",
                {
                    "prime": self.prime,
                    "components": self.component_count,
                    "max_components": limits.max_components,
                },
            )
        self.multiplicities = tuple(
            _positive_integer(value, "component multiplicity")
            for value in multiplicities
        )
        if len(self.multiplicities) != self.component_count:
            raise ValueError("component multiplicities have the wrong length")
        if not isinstance(identity_component, int) or isinstance(
            identity_component, bool
        ):
            raise TypeError("identity_component must be an integer index")
        if identity_component < 0 or identity_component >= self.component_count:
            raise ValueError("identity_component is outside the component list")
        if self.multiplicities[identity_component] != 1:
            raise Genus3HeightCapabilityError(
                "the Cox--Zucker correction requires a multiplicity-one identity component",
                {
                    "prime": self.prime,
                    "identity_component": identity_component,
                    "multiplicity": self.multiplicities[identity_component],
                },
            )
        if not _is_symmetric(self.intersection_matrix):
            raise ValueError("the component intersection matrix must be symmetric")
        for row_index, row in enumerate(self.intersection_matrix):
            if sum(row) != 0:
                raise ValueError(
                    "a scaled component intersection matrix must annihilate the fibre vector"
                )
            for column, value in enumerate(row):
                if row_index == column and value > 0:
                    raise ValueError("component self-intersections must be nonpositive")
                if row_index != column and value < 0:
                    raise ValueError(
                        "distinct component intersections must be nonnegative"
                    )
        reduced = [
            [
                self.intersection_matrix[row][column]
                for column in range(self.component_count)
                if column != identity_component
            ]
            for row in range(self.component_count)
            if row != identity_component
        ]
        if reduced:
            negative_reduced = [[-value for value in row] for row in reduced]
            for size in range(1, len(negative_reduced) + 1):
                leading = [row[:size] for row in negative_reduced[:size]]
                if _determinant_exact(leading) <= 0:
                    raise ValueError(
                        "the component matrix must be negative semidefinite with fibre kernel"
                    )
        if not isinstance(model_certified, bool):
            raise TypeError("model_certified must be boolean")
        if not provenance:
            raise ValueError("regular-model data requires nonempty provenance")
        self.identity_component = identity_component
        # Explicit matrices are exact conditional input.  A boolean assertion
        # cannot turn them into a curve-bound regular-model certificate.
        self.model_certified = False
        self.model_certification_claimed = bool(model_certified)
        self.provenance = dict(provenance)
        self.resource_diagnostics = {
            "components": self.component_count,
            "exact_solve_dimension": max(0, self.component_count - 1),
            "limits": limits.to_dict(),
        }

    def _horizontal_vector(self, values: Any, name: str) -> list[Any]:
        vector = [_qq(value) for value in values]
        if len(vector) != self.component_count:
            raise ValueError(name + " has the wrong component-vector length")
        if sum(vector) != 0:
            raise ValueError(
                name
                + " must have degree zero: its scaled component entries must sum to zero"
            )
        return vector

    def vertical_coefficients(self, divisor_components: Any) -> tuple[Any, ...]:
        """Return exact coefficients of `Phi(D)=sum(alpha_i n_i Gamma_i)`."""
        source = self._horizontal_vector(divisor_components, "divisor_components")
        keep = [
            index
            for index in range(self.component_count)
            if index != self.identity_component
        ]
        if not keep:
            return (_qq(0),)
        reduced_matrix = [
            [self.intersection_matrix[row][column] for column in keep] for row in keep
        ]
        solution = _solve_exact(reduced_matrix, [-source[index] for index in keep])
        answer = []
        cursor = 0
        for index in range(self.component_count):
            if index == self.identity_component:
                answer.append(_qq(0))
            else:
                answer.append(solution[cursor])
                cursor += 1
        residual = []
        for row in range(self.component_count):
            residual.append(
                source[row]
                + sum(
                    self.intersection_matrix[row][column] * answer[column]
                    for column in range(self.component_count)
                )
            )
        if any(value != 0 for value in residual):
            raise ArithmeticError(
                "the vertical correction failed its orthogonality check"
            )
        return tuple(answer)

    def vertical_correction(self, left_components: Any, right_components: Any) -> Any:
        """Return `i(Phi(left), rightbar)` exactly."""
        right = self._horizontal_vector(right_components, "right_components")
        coefficients = self.vertical_coefficients(left_components)
        return sum(
            right[index] * coefficients[index] for index in range(self.component_count)
        )

    def local_symbol(
        self,
        left_components: Any,
        right_components: Any,
        horizontal_intersection: Any,
        *,
        horizontal_certificate: Mapping[str, Any],
    ) -> FinitePlacePairing:
        """Return the exact coefficient of `log(p)` in the local symbol."""
        if not horizontal_certificate:
            raise ValueError("an exact horizontal intersection needs a certificate")
        left = self._horizontal_vector(left_components, "left_components")
        right = self._horizontal_vector(right_components, "right_components")
        vertical = self.vertical_correction(left, right)
        return FinitePlacePairing(
            self.prime,
            horizontal_intersection=_qq(horizontal_intersection),
            vertical_correction=vertical,
            left_components=left,
            right_components=right,
            model_certified=self.model_certified,
            certificate={
                "regular_model": self.to_dict(),
                "horizontal_intersection": dict(horizontal_certificate),
                "vertical_coefficients": tuple(
                    _qq_string(value) for value in self.vertical_coefficients(left)
                ),
                "orthogonality_checked": True,
            },
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema": "sagejs.hyperelliptic.regular-model-prime.v1",
            "prime": str(self.prime),
            "scaled_component_intersection_matrix": tuple(
                tuple(_qq_string(value) for value in row)
                for row in self.intersection_matrix
            ),
            "component_multiplicities": self.multiplicities,
            "identity_component": self.identity_component,
            "model_certified": self.model_certified,
            "model_certification_claimed": self.model_certification_claimed,
            "verification_status": "conditional_unverified_regular_model_input",
            "provenance": dict(self.provenance),
            "resource_diagnostics": dict(self.resource_diagnostics),
        }


def regular_model_from_semistable_graph(
    prime: int,
    vertex_count: int,
    edges: Any,
    *,
    identity_component: int = 0,
    graph_certified: bool,
    provenance: Mapping[str, Any],
    limits: Genus3HeightLimits = DEFAULT_HEIGHT_LIMITS,
) -> RegularModelPrimeData:
    """Construct a reduced semistable regular fibre from its dual graph.

    Each edge is a pair of distinct vertex indices and represents one ordinary
    node of thickness one.  The component intersection matrix is the negative
    graph Laplacian.  Edges with a thickness label other than one are rejected:
    resolving them changes the component graph and belongs in a regular-model
    constructor, not in this shortcut.
    """
    count = _positive_integer(vertex_count, "vertex_count")
    matrix = [[0 for _column in range(count)] for _row in range(count)]
    checked_edges = []
    for item in edges:
        edge = list(item)
        if len(edge) not in (2, 3):
            raise ValueError("a semistable graph edge must have two endpoints")
        left = int(edge[0])
        right = int(edge[1])
        thickness = 1 if len(edge) == 2 else int(edge[2])
        if left < 0 or right < 0 or left >= count or right >= count:
            raise ValueError("a semistable graph edge has invalid endpoints")
        if thickness != 1:
            raise Genus3HeightCapabilityError(
                "a thickness greater than one requires explicit regular-model resolution",
                {"prime": prime, "edge": tuple(edge), "thickness": thickness},
            )
        # A self-node contributes a loop to H_1 of the dual graph but does not
        # change the component intersection matrix.  Distinct endpoints give
        # one off-diagonal intersection and the corresponding diagonal terms.
        if left != right:
            matrix[left][left] -= 1
            matrix[right][right] -= 1
            matrix[left][right] += 1
            matrix[right][left] += 1
        checked_edges.append((left, right))
    if count > 1 and not checked_edges:
        raise ValueError("a multi-component special fibre graph must be connected")
    details = dict(provenance)
    details["construction"] = "negative graph Laplacian of reduced semistable fibre"
    details["edges"] = tuple(checked_edges)
    details["graph_certified"] = bool(graph_certified)
    return RegularModelPrimeData(
        prime,
        matrix,
        [1 for _index in range(count)],
        identity_component=identity_component,
        model_certified=bool(graph_certified),
        provenance=details,
        limits=limits,
    )


def regular_model_from_local_reduction(
    local_reduction: Any,
    *,
    intersection_matrix: Any | None = None,
    multiplicities: Any | None = None,
    identity_component: int = 0,
    model_certificate: Mapping[str, Any] | None = None,
    limits: Genus3HeightLimits = DEFAULT_HEIGHT_LIMITS,
) -> RegularModelPrimeData:
    """Validate explicit regular-model data against a local-reduction record.

    The present cluster certificate contains local factors and toric data, but
    not all blow-up charts or the component intersection matrix.  Omitting
    those data is therefore an explicit capability failure.
    """
    prime = int(local_reduction.prime)
    genus = int(local_reduction.genus)
    if genus != 3:
        raise Genus3HeightCapabilityError(
            "the reference Faltings--Hriljac lane currently requires genus 3",
            {"prime": prime, "genus": genus},
        )
    if (
        not local_reduction.curve_good_reduction
        and local_reduction.semistable is not True
    ):
        raise Genus3HeightCapabilityError(
            "the finite height path requires good or certified semistable reduction",
            {
                "prime": prime,
                "reduction_type": local_reduction.reduction_type,
                "semistable": local_reduction.semistable,
            },
        )
    if (
        intersection_matrix is None
        or multiplicities is None
        or model_certificate is None
    ):
        raise Genus3HeightCapabilityError(
            "the local-reduction certificate does not determine a proper regular model",
            {
                "prime": prime,
                "reduction_type": local_reduction.reduction_type,
                "needs": (
                    "scaled component intersection matrix",
                    "component multiplicities",
                    "identity component",
                    "regular-model/blow-up certificate",
                ),
                "cluster_certificate_available": bool(
                    getattr(local_reduction, "certificate", {}).get("cluster_picture")
                ),
            },
        )
    provenance = dict(model_certificate)
    provenance["local_reduction_type"] = local_reduction.reduction_type
    provenance["local_reduction_backend"] = local_reduction.backend
    provenance["local_reduction_certificate"] = dict(local_reduction.certificate)
    return RegularModelPrimeData(
        prime,
        intersection_matrix,
        multiplicities,
        identity_component=identity_component,
        model_certified=bool(local_reduction.certified),
        provenance=provenance,
        limits=limits,
    )


class FinitePlacePairing:
    """Exact coefficient of `log(p)` in one finite local Neron symbol."""

    def __init__(
        self,
        prime: int,
        *,
        horizontal_intersection: Any,
        vertical_correction: Any,
        left_components: Any,
        right_components: Any,
        model_certified: bool,
        certificate: Mapping[str, Any],
        _verification: Any = None,
    ) -> None:
        self.prime = _checked_prime(prime)
        self.horizontal_intersection = _qq(horizontal_intersection)
        self.vertical_correction = _qq(vertical_correction)
        self.coefficient = self.horizontal_intersection + self.vertical_correction
        self.left_components = tuple(_qq(value) for value in left_components)
        self.right_components = tuple(_qq(value) for value in right_components)
        self.exact = True
        self.model_certification_claimed = bool(model_certified)
        self.model_certified = isinstance(_verification, _AutomaticFiniteVerification)
        self._verification = _verification if self.model_certified else None
        self.certificate = dict(certificate)

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema": "sagejs.hyperelliptic.finite-height-pairing.v1",
            "prime": str(self.prime),
            "horizontal_intersection": _qq_string(self.horizontal_intersection),
            "vertical_correction": _qq_string(self.vertical_correction),
            "log_prime_coefficient": _qq_string(self.coefficient),
            "left_scaled_component_intersections": tuple(
                _qq_string(value) for value in self.left_components
            ),
            "right_scaled_component_intersections": tuple(
                _qq_string(value) for value in self.right_components
            ),
            "exact": True,
            "model_certified": self.model_certified,
            "model_certification_claimed": self.model_certification_claimed,
            "verification_status": (
                "automatic_curve_and_divisor_bound_replay"
                if self.model_certified
                else "conditional_unverified_input"
            ),
            "certificate": dict(self.certificate),
        }


def _rational_pair(value: Any) -> tuple[int, int]:
    rational = _qq(value)
    numerator = int(rational._numerator)
    denominator = int(rational._denominator)
    if denominator < 0:
        numerator = -numerator
        denominator = -denominator
    return numerator, denominator


def _valuation_integer(value: int, prime: int) -> int:
    if value == 0:
        return 10**9
    answer = 0
    active = abs(value)
    while active % prime == 0:
        active //= prime
        answer += 1
    return answer


def _valuation_rational(value: Any, prime: int) -> int:
    numerator, denominator = _rational_pair(value)
    if numerator == 0:
        return 10**9
    return _valuation_integer(numerator, prime) - _valuation_integer(denominator, prime)


def _mod_rational(value: Any, prime: int) -> int:
    numerator, denominator = _rational_pair(value)
    if denominator % prime == 0:
        raise Genus3HeightCapabilityError(
            "a rational section is not integral at the requested prime",
            {"prime": prime, "value": _qq_string(value)},
        )
    return numerator % prime * pow(denominator % prime, prime - 2, prime) % prime


def _evaluate_mod(polynomial: Any, value: int, prime: int) -> int:
    answer = 0
    for coefficient in reversed(polynomial.list()):
        answer = (answer * value + _mod_rational(coefficient, prime)) % prime
    return answer


def rational_section_intersection(
    curve: Any,
    left: Any,
    right: Any,
    prime: int,
) -> int:
    """Return the intersection of two rational sections at a smooth affine point.

    `left` and `right` are `(x,y)` pairs on an integral odd-degree genus-3
    model.  If their reductions differ, the intersection is zero.  At a common
    smooth reduction it is `min(v_p(x_1-x_2), v_p(y_1-y_2))`.  A common
    singular reduction is rejected because blow-up transforms are required.
    """
    checked_prime = _checked_prime(prime)
    if int(curve.genus()) != 3:
        raise Genus3HeightCapabilityError(
            "rational-section intersections currently require genus 3",
            {"genus": int(curve.genus()), "prime": checked_prime},
        )
    if getattr(curve.base_ring(), "_kind", None) != "QQ":
        raise TypeError("rational-section intersections require a curve over QQ")
    left_values = list(left)
    right_values = list(right)
    if len(left_values) != 2 or len(right_values) != 2:
        raise ValueError("a rational section must be an (x,y) pair")
    left_x, left_y = _qq(left_values[0]), _qq(left_values[1])
    right_x, right_y = _qq(right_values[0]), _qq(right_values[1])
    if left_x == right_x and left_y == right_y:
        raise ValueError("horizontal divisors must have disjoint generic support")
    left_mod = _validate_rational_section(curve, (left_x, left_y), checked_prime)
    right_mod = _validate_rational_section(curve, (right_x, right_y), checked_prime)
    if left_mod != right_mod:
        return 0
    x_valuation = _valuation_rational(left_x - right_x, checked_prime)
    y_valuation = _valuation_rational(left_y - right_y, checked_prime)
    answer = min(x_valuation, y_valuation)
    if answer < 1 or answer >= 10**9:
        raise ArithmeticError("a common smooth reduction has an invalid intersection")
    return answer


def _validate_rational_section(curve: Any, point: Any, prime: int) -> tuple[int, int]:
    """Validate one rational affine section and its smooth reduction."""
    f_value, h_value = curve.hyperelliptic_polynomials()
    if max(f_value.degree(), 2 * h_value.degree()) != 7:
        raise Genus3HeightCapabilityError(
            "rational-section intersections require an odd-degree model",
            {"prime": prime, "model_degree": f_value.degree()},
        )
    x_value = _qq(point[0])
    y_value = _qq(point[1])
    if y_value * y_value + h_value(x_value) * y_value != f_value(x_value):
        raise ValueError("a rational section does not lie on the curve")
    for polynomial in (f_value, h_value):
        for coefficient in polynomial.list():
            _mod_rational(coefficient, prime)
    x_mod = _mod_rational(x_value, prime)
    y_mod = _mod_rational(y_value, prime)
    derivative_x = (
        _evaluate_mod(h_value.derivative(), x_mod, prime) * y_mod
        - _evaluate_mod(f_value.derivative(), x_mod, prime)
    ) % prime
    derivative_y = (2 * y_mod + _evaluate_mod(h_value, x_mod, prime)) % prime
    if derivative_x == 0 and derivative_y == 0:
        raise Genus3HeightCapabilityError(
            "a rational section meets a singular point of the plane special fibre",
            {
                "prime": prime,
                "reduction": (x_mod, y_mod),
                "needs": "regular-model blow-up charts",
            },
        )
    return x_mod, y_mod


def rational_horizontal_intersection(
    curve: Any,
    left_terms: Any,
    right_terms: Any,
    prime: int,
) -> tuple[Any, dict[str, Any]]:
    """Intersect rational affine point divisors by exact bilinearity.

    Each term is `(multiplicity, (x,y))`; multiplicities may be rational.  This
    is the useful pointwise-rational part of the general norm/length method.
    Closed points of degree greater than one remain an explicit capability
    boundary.
    """
    checked_left = [(_qq(term[0]), tuple(term[1])) for term in left_terms]
    checked_right = [(_qq(term[0]), tuple(term[1])) for term in right_terms]
    total = _qq(0)
    rows = []
    for left_multiplicity, left_point in checked_left:
        for right_multiplicity, right_point in checked_right:
            intersection = rational_section_intersection(
                curve, left_point, right_point, prime
            )
            weighted = left_multiplicity * right_multiplicity * intersection
            total += weighted
            rows.append(
                {
                    "left": tuple(_qq_string(value) for value in left_point),
                    "right": tuple(_qq_string(value) for value in right_point),
                    "left_multiplicity": _qq_string(left_multiplicity),
                    "right_multiplicity": _qq_string(right_multiplicity),
                    "intersection": intersection,
                    "weighted_intersection": _qq_string(weighted),
                }
            )
    return total, {
        "schema": "sagejs.hyperelliptic.rational-section-intersections.v1",
        "prime": str(_checked_prime(prime)),
        "algorithm": "smooth rational sections on the affine regular locus",
        "pairs": tuple(rows),
        "total": _qq_string(total),
        "exact": True,
    }


def _replay_local_reduction(curve: Any, local_reduction: Any) -> Any:
    module = __import__(
        "sagejs.hyperelliptic_curves.bad_reduction",
        fromlist=["LocalReductionData", "local_reduction"],
    )
    if not isinstance(local_reduction, module.LocalReductionData):
        raise Genus3HeightCapabilityError(
            "finite certification requires a typed LocalReductionData record",
            {"received_type": type(local_reduction).__name__},
        )
    prime = int(local_reduction.prime)
    replayed = module.local_reduction(curve, prime, "auto")
    fields = (
        "prime",
        "genus",
        "coefficients",
        "conductor_exponent",
        "reduction_type",
        "curve_good_reduction",
        "semistable",
        "toric_rank",
        "backend",
        "certificate",
    )
    mismatches = tuple(
        name
        for name in fields
        if getattr(local_reduction, name) != getattr(replayed, name)
    )
    if mismatches:
        raise Genus3HeightCapabilityError(
            "the supplied local-reduction record failed curve-bound replay",
            {"prime": prime, "mismatched_fields": mismatches},
        )
    return replayed


def smooth_identity_finite_pairing(
    curve: Any,
    left_terms: Any,
    right_terms: Any,
    local_reduction: Any,
    *,
    left_infinity_multiplicity: Any = 0,
    right_infinity_multiplicity: Any = 0,
    identity_component_witness: Mapping[str, Any] | None = None,
) -> FinitePlacePairing:
    """Compute a finite symbol when all sections meet one smooth component.

    On a good or certified semistable reduced model, rational sections whose
    reductions lie in the smooth locus of the same multiplicity-one identity
    component have zero component vector as degree-zero divisors.  Thus their
    vertical correction is exactly zero.  This theorem path avoids pretending
    that the existing cluster certificate contains missing blow-up charts.
    """
    local_reduction = _replay_local_reduction(curve, local_reduction)
    prime = int(local_reduction.prime)
    if int(local_reduction.genus) != 3 or not bool(local_reduction.certified):
        raise Genus3HeightCapabilityError(
            "an automatic finite height needs certified genus-3 local reduction",
            {"prime": prime, "genus": int(local_reduction.genus)},
        )
    if (
        not local_reduction.curve_good_reduction
        and local_reduction.semistable is not True
    ):
        raise Genus3HeightCapabilityError(
            "the smooth-identity path requires good or certified semistable reduction",
            {
                "prime": prime,
                "reduction_type": local_reduction.reduction_type,
                "semistable": local_reduction.semistable,
            },
        )
    if prime == 2 and not local_reduction.curve_good_reduction:
        raise Genus3HeightCapabilityError(
            "the automatic finite height path excludes bad reduction at p=2",
            {"prime": 2, "needs": "certified 2-adic regular model"},
        )
    local_certificate = dict(local_reduction.certificate)
    unique_nodal_component = bool(
        local_reduction.reduction_type == "semistable_nodal"
        and local_certificate.get("theorem")
        == "normalization-dual-graph semistable factorization"
        and local_certificate.get("normalization_branch_mod_p") is not None
    )
    if not local_reduction.curve_good_reduction and not unique_nodal_component:
        raise Genus3HeightCapabilityError(
            "the automatic path has no replayable component map for a reducible fibre",
            {
                "prime": prime,
                "reduction_type": local_reduction.reduction_type,
                "supplied_witness_ignored": identity_component_witness is not None,
                "needs": (
                    "a typed regular-model certificate bound to this curve",
                    "a replayable section-to-component map bound to both divisors",
                ),
            },
        )
    left = [(_qq(term[0]), tuple(term[1])) for term in left_terms]
    right = [(_qq(term[0]), tuple(term[1])) for term in right_terms]
    left_infinity = _qq(left_infinity_multiplicity)
    right_infinity = _qq(right_infinity_multiplicity)
    if (
        sum(term[0] for term in left) + left_infinity != 0
        or sum(term[0] for term in right) + right_infinity != 0
    ):
        raise ValueError("smooth-identity divisors must have degree zero")
    f_value, _h_value = curve.hyperelliptic_polynomials()
    if (left_infinity != 0 or right_infinity != 0) and _mod_rational(
        f_value[f_value.degree()], prime
    ) == 0:
        raise Genus3HeightCapabilityError(
            "the infinity section needs a unit odd-degree leading coefficient",
            {"prime": prime, "leading_coefficient": str(f_value[f_value.degree()])},
        )
    left_reductions = tuple(
        _validate_rational_section(curve, term[1], prime) for term in left
    )
    right_reductions = tuple(
        _validate_rational_section(curve, term[1], prime) for term in right
    )
    horizontal, horizontal_certificate = rational_horizontal_intersection(
        curve, left, right, prime
    )
    divisor_key = _divisor_pair_key(left, right, left_infinity, right_infinity)
    reduction_key = (
        prime,
        local_reduction.reduction_type,
        tuple(int(value) for value in local_reduction.coefficients),
    )
    return FinitePlacePairing(
        prime,
        horizontal_intersection=horizontal,
        vertical_correction=_qq(0),
        left_components=(_qq(0),),
        right_components=(_qq(0),),
        model_certified=True,
        _verification=_AutomaticFiniteVerification(
            _curve_key(curve), divisor_key, reduction_key
        ),
        certificate={
            "theorem": (
                "degree-zero horizontal divisors supported on the smooth "
                "multiplicity-one identity component have Phi intersection zero"
            ),
            "local_reduction_type": local_reduction.reduction_type,
            "local_reduction_backend": local_reduction.backend,
            "local_reduction_certificate": dict(local_reduction.certificate),
            "identity_component_witness": (
                {"good_reduction_unique_component": True}
                if local_reduction.curve_good_reduction
                else (
                    {
                        "certified_irreducible_nodal_fibre": True,
                        "theorem": local_certificate["theorem"],
                    }
                    if unique_nodal_component
                    else dict(identity_component_witness or {})
                )
            ),
            "left_reductions": left_reductions,
            "right_reductions": right_reductions,
            "left_infinity_multiplicity": _qq_string(left_infinity),
            "right_infinity_multiplicity": _qq_string(right_infinity),
            "infinity_horizontal_intersection": "0 (opposite divisor has affine integral support)",
            "horizontal_intersection": horizontal_certificate,
            "vertical_coefficients": ("0",),
            "exact": True,
            "binding": {
                "curve_key": _curve_key(curve),
                "divisor_pair_key": divisor_key,
                "reduction_key": reduction_key,
            },
        },
    )


def split_mumford_finite_pairing_at_prime(
    move: SplitMumfordMove,
    local_reduction: Any,
    *,
    identity_component_witness: Mapping[str, Any] | None = None,
) -> FinitePlacePairing:
    """Compute one automatic finite symbol for a Holmes split-Mumford move."""
    return smooth_identity_finite_pairing(
        move.curve,
        move.left_affine_terms,
        move.right_affine_terms,
        local_reduction,
        left_infinity_multiplicity=-move.degree,
        identity_component_witness=identity_component_witness,
    )


class SplitMumfordMove:
    """Holmes's disjoint rational-point representative for a Mumford class."""

    def __init__(
        self,
        divisor: Any,
        points: Any,
        moving_fibre: Any,
        auxiliary_point: Any,
        right_terms: Any,
        theta_pairs: Any,
        negative_class_multiple: int,
    ) -> None:
        self.divisor = divisor
        self.curve = divisor.curve()
        self.points = tuple(points)
        self.degree = len(self.points)
        self.moving_fibre = tuple(moving_fibre)
        self.auxiliary_point = auxiliary_point
        self.left_affine_terms = tuple(
            (sage.QQ(1), point.xy()) for point in self.points
        )
        self.right_affine_terms = tuple(
            (sage.QQ(multiplicity), point.xy()) for multiplicity, point in right_terms
        )
        self.theta_pairs = tuple(
            (tuple(left), tuple(right)) for left, right in theta_pairs
        )
        self.automatic_archimedean_supported = self.degree == 3
        self.negative_class_multiple = int(negative_class_multiple)
        self.height_scale = sage.QQ(1) / sage.QQ(self.negative_class_multiple)
        self.certificate = {
            "schema": "sagejs.hyperelliptic.split-mumford-move.v1",
            "reference": "Holmes arXiv:1004.4503, Step 1; Muller arXiv:1105.1719, Move1h",
            "mumford_degree": self.degree,
            "split_rational_support": tuple(
                tuple(_qq_string(value) for value in point.xy())
                for point in self.points
            ),
            "moving_fibre": tuple(
                tuple(_qq_string(value) for value in point.xy())
                for point in self.moving_fibre
            ),
            "auxiliary_point": (
                None
                if auxiliary_point is None
                else tuple(_qq_string(value) for value in auxiliary_point.xy())
            ),
            "right_class_relation": "[E] = -"
            + str(self.negative_class_multiple)
            + "*[D]",
            "height_formula": "h([D]) = <D,E>/" + str(self.negative_class_multiple),
            "generic_support_disjoint": True,
            "automatic_archimedean_supported": self.automatic_archimedean_supported,
            "archimedean_support_status": (
                "both degree-three theta representatives contain no hyperelliptic-conjugate pair"
                if self.automatic_archimedean_supported
                else "a nonspecial degree-three theta move is not yet constructed for Mumford degree below three"
            ),
        }

    def to_dict(self) -> dict[str, Any]:
        return dict(self.certificate)


def split_mumford_points(divisor: Any) -> tuple[Any, ...]:
    """Recover rational affine points from a split `QQ` Mumford divisor.

    Nonsplit closed points are intentionally rejected; their finite
    intersections require local factorization and norm/length arithmetic.
    """
    curve = divisor.curve()
    if int(curve.genus()) != 3 or getattr(curve.base_ring(), "_kind", None) != "QQ":
        raise Genus3HeightCapabilityError(
            "split Mumford heights require a genus-3 Jacobian over QQ",
            {"genus": int(curve.genus()), "base_ring": repr(curve.base_ring())},
        )
    f_value, h_value = curve.hyperelliptic_polynomials()
    if max(f_value.degree(), 2 * h_value.degree()) != 7:
        raise Genus3HeightCapabilityError(
            "split Mumford heights require an odd-degree model with rational infinity",
            {"model_degree": max(f_value.degree(), 2 * h_value.degree())},
        )
    u_value, v_value = divisor.uv()
    if u_value.is_one():
        return ()
    points = []
    for factor, exponent in u_value.factor():
        if factor.degree() != 1:
            raise Genus3HeightCapabilityError(
                "the Mumford u-polynomial does not split over QQ",
                {
                    "u": str(u_value),
                    "nonsplit_factor": str(factor),
                    "factor_degree": factor.degree(),
                },
            )
        coefficients = list(factor)
        root = -coefficients[0] / coefficients[1]
        y_value = v_value(root)
        point = curve((root, y_value))
        conjugate_y = -h_value(root) - y_value
        if conjugate_y == y_value:
            raise Genus3HeightCapabilityError(
                "Holmes's initial move excludes affine Weierstrass support",
                {"point": tuple(_qq_string(value) for value in point.xy())},
            )
        for _index in range(int(exponent)):
            points.append(point)
    if len(points) != int(u_value.degree()):
        raise ArithmeticError("split Mumford support has the wrong degree")
    return tuple(points)


def _rational_fibre(curve: Any, x_value: Any) -> tuple[Any, Any] | None:
    f_value, h_value = curve.hyperelliptic_polynomials()
    x_rational = _qq(x_value)
    h_at_x = h_value(x_rational)
    discriminant = h_at_x * h_at_x + 4 * f_value(x_rational)
    if discriminant == 0:
        return None
    try:
        square_root = discriminant.sqrt()
    except ValueError:
        return None
    first = curve((x_rational, (-h_at_x + square_root) / 2))
    second = curve((x_rational, (-h_at_x - square_root) / 2))
    if first == second:
        return None
    return first, second


def _search_rational_fibre(
    curve: Any, excluded_x: Any, max_search: int
) -> tuple[Any, Any]:
    excluded = {_qq(value) for value in excluded_x}
    bound = _positive_integer(max_search, "max_search")
    candidates = [0]
    for value in range(1, bound + 1):
        candidates.extend((value, -value))
    for value in candidates:
        if _qq(value) in excluded:
            continue
        fibre = _rational_fibre(curve, value)
        if fibre is not None:
            return fibre
    raise Genus3HeightResourceError(
        "no rational moving fibre was found within the search bound",
        {
            "max_search": bound,
            "excluded_x": tuple(_qq_string(value) for value in excluded),
        },
    )


def move_split_mumford_divisor(
    divisor: Any,
    *,
    moving_x: Any | None = None,
    max_search: int = 128,
) -> SplitMumfordMove:
    """Construct Holmes's moved representative using rational point support."""
    points = split_mumford_points(divisor)
    degree = len(points)
    if degree == 0:
        raise ValueError("the zero divisor does not need a moved representative")
    curve = divisor.curve()
    _f_value, h_value = curve.hyperelliptic_polynomials()
    excluded_x = [point.xy()[0] for point in points]
    if moving_x is None:
        moving_fibre = _search_rational_fibre(curve, excluded_x, max_search)
    else:
        if _qq(moving_x) in {_qq(value) for value in excluded_x}:
            raise ValueError("the moving fibre meets the Mumford support")
        moving_fibre = _rational_fibre(curve, moving_x)
        if moving_fibre is None:
            raise Genus3HeightCapabilityError(
                "the selected moving fibre does not split into rational non-Weierstrass points",
                {"moving_x": _qq_string(moving_x)},
            )
    inverse_points = tuple(
        curve((point.xy()[0], -h_value(point.xy()[0]) - point.xy()[1]))
        for point in points
    )
    auxiliary = None
    if degree == 3:
        theta_pairs = (
            (inverse_points, (moving_fibre[0],) * 3),
            (inverse_points, (moving_fibre[1],) * 3),
        )
        right_terms = tuple((2, point) for point in inverse_points) + (
            (-3, moving_fibre[0]),
            (-3, moving_fibre[1]),
        )
        multiple = 2
    elif degree == 2:
        # Adding the same auxiliary point would leave the moving fibre as a
        # hyperelliptic-conjugate pair, hence a special degree-three divisor.
        # Keep the exact finite representative but do not expose that invalid
        # pair to the theta evaluator.
        theta_pairs = ()
        right_terms = tuple((1, point) for point in inverse_points) + tuple(
            (-1, point) for point in moving_fibre
        )
        multiple = 1
    else:
        theta_pairs = ()
        right_terms = (
            (2, inverse_points[0]),
            (-1, moving_fibre[0]),
            (-1, moving_fibre[1]),
        )
        multiple = 2
    left_keys = {tuple(_qq_string(value) for value in point.xy()) for point in points}
    right_keys = {
        tuple(_qq_string(value) for value in point.xy())
        for _multiplicity, point in right_terms
    }
    if left_keys.intersection(right_keys):
        raise Genus3HeightCapabilityError(
            "the selected Holmes representative is not disjoint",
            {"common_support": tuple(sorted(left_keys.intersection(right_keys)))},
        )
    return SplitMumfordMove(
        divisor,
        points,
        moving_fibre,
        auxiliary,
        right_terms,
        theta_pairs,
        multiple,
    )


def _bounded_prime_support(
    value: Any, max_factor_bits: int, *, source: str
) -> tuple[tuple[int, ...], int]:
    """Return prime support via Sage.js factorization under an input-size cap."""
    active = abs(int(value))
    if active in (0, 1):
        return (), 0
    bits = active.bit_length()
    if bits > max_factor_bits:
        raise Genus3HeightResourceError(
            "finite-height candidate factorization exceeds its input-size cap",
            {
                "source": source,
                "integer_bits": bits,
                "max_factor_bits": max_factor_bits,
                "needs": "a supplied certified prime support",
            },
        )
    factors = tuple(int(prime) for prime, _exponent in sage.factor(sage.ZZ(active)))
    return factors, bits


class SplitMumfordCandidateSupport:
    """A complete finite-prime support proof for one moved divisor pair."""

    def __init__(
        self,
        primes: Any,
        *,
        sources: Any,
        factor_work_bits: int,
        max_factor_bits: int,
        _verification: Any = None,
    ) -> None:
        self.primes = tuple(sorted(_checked_prime(int(prime)) for prime in primes))
        self.sources = tuple(dict(source) for source in sources)
        self.factor_work_bits = int(factor_work_bits)
        self.max_factor_bits = int(max_factor_bits)
        self._verification = (
            _verification
            if isinstance(_verification, _CandidateSupportVerification)
            else None
        )
        self.complete = self._verification is not None

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema": "sagejs.hyperelliptic.split-mumford-prime-support.v1",
            "primes": tuple(str(prime) for prime in self.primes),
            "sources": self.sources,
            "factor_work_bits": self.factor_work_bits,
            "max_factor_bits": self.max_factor_bits,
            "outside_support_theorem": (
                "the integral completed branch model is smooth, every rational "
                "section is integral, and opposite supports have distinct reductions"
            ),
            "verification_status": (
                "exact_curve_and_divisor_bound_factorization"
                if self.complete
                else "conditional_unverified_candidate_support"
            ),
            "complete": self.complete,
        }


def split_mumford_candidate_primes(
    move: SplitMumfordMove,
    *,
    extra_primes: Any = (),
    limits: Genus3HeightLimits = DEFAULT_HEIGHT_LIMITS,
) -> SplitMumfordCandidateSupport:
    """Prove a finite candidate set for the moved local intersection symbols.

    The set contains the completed branch discriminant and model-denominator
    support, all rational point denominators, and the numerator support of
    every coordinate difference between opposite horizontal divisors.  Thus
    outside the set the model is smooth and the two divisors have disjoint
    reduction, so the local symbol is zero.
    """
    model = move.curve._smalljac_integral_model_data()
    ring = sage.PolynomialRing(sage.ZZ, "x_height_support")
    f_value = ring(model["f_coefficients"])
    h_value = ring(model["h_coefficients"])
    completed = h_value * h_value + 4 * f_value
    discriminant = sage.ZZ(completed.discriminant())
    if discriminant == 0:
        raise ArithmeticError("the completed branch polynomial is not squarefree")
    integer_sources = [
        ("completed_branch_discriminant", int(discriminant)),
        ("integral_model_denominator", int(model["excluded_denominator"])),
    ]
    all_terms = list(move.left_affine_terms) + list(move.right_affine_terms)
    for term_index, (_multiplicity, point) in enumerate(all_terms):
        for coordinate_index, coordinate in enumerate(point):
            _numerator, denominator = _rational_pair(coordinate)
            integer_sources.append(
                (
                    "point_"
                    + str(term_index)
                    + "_coordinate_"
                    + str(coordinate_index)
                    + "_denominator",
                    denominator,
                )
            )
    for left_index, (_left_multiplicity, left) in enumerate(move.left_affine_terms):
        for right_index, (_right_multiplicity, right) in enumerate(
            move.right_affine_terms
        ):
            for coordinate_index in range(2):
                numerator, denominator = _rational_pair(
                    left[coordinate_index] - right[coordinate_index]
                )
                integer_sources.append(
                    (
                        "opposite_difference_"
                        + str(left_index)
                        + "_"
                        + str(right_index)
                        + "_coordinate_"
                        + str(coordinate_index)
                        + "_numerator",
                        numerator,
                    )
                )
                integer_sources.append(
                    (
                        "opposite_difference_"
                        + str(left_index)
                        + "_"
                        + str(right_index)
                        + "_coordinate_"
                        + str(coordinate_index)
                        + "_denominator",
                        denominator,
                    )
                )
    primes = {_checked_prime(int(prime)) for prime in extra_primes}
    source_records = []
    work = 0
    for name, integer in integer_sources:
        factors, used = _bounded_prime_support(
            integer, limits.max_factor_bits, source=name
        )
        work += used
        primes.update(factors)
        if factors:
            source_records.append(
                {
                    "name": name,
                    "integer": str(integer),
                    "prime_support": tuple(str(prime) for prime in factors),
                }
            )
    divisor_key = _divisor_pair_key(
        move.left_affine_terms,
        move.right_affine_terms,
        -move.degree,
        0,
    )
    return SplitMumfordCandidateSupport(
        primes,
        sources=source_records,
        factor_work_bits=work,
        max_factor_bits=limits.max_factor_bits,
        _verification=_CandidateSupportVerification(
            _curve_key(move.curve), divisor_key
        ),
    )


class SplitMumfordFinitePlan:
    """Computed local symbols plus structured unsupported candidate primes."""

    def __init__(
        self,
        support: SplitMumfordCandidateSupport,
        pairings: Any,
        unsupported: Any,
        *,
        _verification: Any = None,
    ) -> None:
        self.support = support
        self.pairings = tuple(sorted(pairings, key=lambda item: item.prime))
        self.unsupported = tuple(dict(item) for item in unsupported)
        self._verification = (
            _verification
            if isinstance(_verification, _FinitePlanVerification)
            else None
        )
        support_verification = support._verification
        bindings_match = bool(
            support_verification is not None
            and self._verification is not None
            and self._verification.curve_key == support_verification.curve_key
            and self._verification.divisor_key == support_verification.divisor_key
        )
        if bindings_match and support_verification is not None:
            for item in self.pairings:
                item_verification = item._verification
                if (
                    item_verification is None
                    or item_verification.curve_key != support_verification.curve_key
                    or item_verification.divisor_key != support_verification.divisor_key
                ):
                    bindings_match = False
        self.complete = bool(
            support.complete
            and not self.unsupported
            and {item.prime for item in self.pairings} == set(support.primes)
            and all(item.model_certified for item in self.pairings)
            and bindings_match
        )

    def belongs_to(self, move: SplitMumfordMove) -> bool:
        """Return whether this plan was computed for exactly `move`."""
        return bool(
            self.complete
            and self._verification is not None
            and self._verification.curve_key == _curve_key(move.curve)
            and self._verification.move_key == _move_key(move)
        )

    def require_complete(self) -> SplitMumfordFinitePlan:
        if not self.complete:
            raise Genus3HeightCapabilityError(
                "the finite Faltings--Hriljac assembly has unsupported primes",
                self.to_dict(),
            )
        return self

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema": "sagejs.hyperelliptic.split-mumford-finite-plan.v1",
            "candidate_support": self.support.to_dict(),
            "pairings": tuple(pairing.to_dict() for pairing in self.pairings),
            "unsupported": self.unsupported,
            "binding": (
                None
                if self._verification is None
                else {
                    "curve_key": self._verification.curve_key,
                    "divisor_pair_key": self._verification.divisor_key,
                    "move_key": self._verification.move_key,
                }
            ),
            "complete": self.complete,
        }


def split_mumford_finite_plan(
    move: SplitMumfordMove,
    *,
    supplied_pairings: Any = (),
    identity_component_witnesses: Mapping[int, Mapping[str, Any]] | None = None,
    extra_primes: Any = (),
    limits: Genus3HeightLimits = DEFAULT_HEIGHT_LIMITS,
) -> SplitMumfordFinitePlan:
    """Compute every supported finite symbol in a proved candidate set."""
    supplied = {}
    for pairing in supplied_pairings:
        if not isinstance(pairing, FinitePlacePairing):
            raise TypeError("supplied_pairings must contain FinitePlacePairing objects")
        if pairing.prime in supplied:
            raise ValueError("a supplied finite prime occurs more than once")
        supplied[pairing.prime] = pairing
    support = split_mumford_candidate_primes(
        move,
        extra_primes=tuple(extra_primes) + tuple(supplied),
        limits=limits,
    )
    witnesses = (
        {}
        if identity_component_witnesses is None
        else dict(identity_component_witnesses)
    )
    local_module = __import__(
        "sagejs.hyperelliptic_curves.bad_reduction",
        fromlist=["LocalReductionUnsupportedError", "local_reduction"],
    )
    pairings = []
    unsupported = []
    for prime in support.primes:
        if prime in supplied:
            pairing = supplied[prime]
            if not pairing.model_certified:
                unsupported.append(
                    {
                        "prime": str(prime),
                        "stage": "supplied_pairing",
                        "error": "the supplied finite pairing is not model-certified",
                    }
                )
            else:
                pairings.append(pairing)
            continue
        try:
            reduction = local_module.local_reduction(move.curve, prime, "auto")
        except local_module.LocalReductionUnsupportedError as error:
            unsupported.append(
                {
                    "prime": str(prime),
                    "stage": "local_reduction",
                    "error": str(error),
                    "diagnostics": dict(error.diagnostics),
                }
            )
            continue
        try:
            pairings.append(
                split_mumford_finite_pairing_at_prime(
                    move,
                    reduction,
                    identity_component_witness=witnesses.get(prime),
                )
            )
        except Genus3HeightCapabilityError as error:
            unsupported.append(
                {
                    "prime": str(prime),
                    "stage": "finite_intersection",
                    "error": str(error),
                    "diagnostics": dict(error.diagnostics),
                }
            )
    support_verification = support._verification
    return SplitMumfordFinitePlan(
        support,
        pairings,
        unsupported,
        _verification=(
            None
            if support_verification is None
            else _FinitePlanVerification(
                support_verification.curve_key,
                support_verification.divisor_key,
                _move_key(move),
            )
        ),
    )


def _periods_module() -> Any:
    return __import__(
        "sagejs.hyperelliptic_curves.periods",
        fromlist=["abel_jacobi", "real_period"],
    )


def split_mumford_archimedean_pairing(
    move: SplitMumfordMove,
    *,
    period_result: Any | None = None,
    prec: int = 128,
    theta_radius: int | None = None,
    limits: Genus3HeightLimits = DEFAULT_HEIGHT_LIMITS,
) -> ArchimedeanPairing:
    """Compute the real symbol for a split Mumford Holmes representative.

    This adapter reuses `periods.real_period`, its normalized Siegel matrix,
    and `periods.abel_jacobi`; it does not duplicate branch-path integration.
    Decimal `(real,imag)` pairs keep the boundary representation-neutral.  A
    chosen Abel--Jacobi lift is sufficient because the complete
    theta/quadratic expression is lattice-invariant.
    """
    if not move.automatic_archimedean_supported:
        raise Genus3HeightCapabilityError(
            "the automatic theta path currently requires Mumford degree three",
            {
                "mumford_degree": move.degree,
                "needs": (
                    "two certified nonspecial effective degree-three representatives",
                    "or a supplied archimedean local symbol",
                ),
                "move": move.to_dict(),
            },
        )
    periods = _periods_module()
    active_period_result = (
        periods.real_period(move.curve, prec=prec)
        if period_result is None
        else period_result
    )
    if int(active_period_result.precision_bits) < int(prec):
        raise Genus3HeightCapabilityError(
            "the period matrix has insufficient precision for the theta request",
            {
                "requested_precision_bits": int(prec),
                "period_precision_bits": int(active_period_result.precision_bits),
            },
        )
    period_verification = active_period_result.verify()
    if period_verification.get("verified") is not True:
        raise Genus3HeightCapabilityError(
            "the period result failed its structural/refinement replay",
            {"period_verification": dict(period_verification)},
        )
    period_matrix = active_period_result.siegel_matrix_pairs()
    full_period_matrix = active_period_result.period_matrix_pairs()
    abel_jacobi_records = []

    def vector(point_or_points: Any) -> Any:
        abel_result = periods.abel_jacobi(
            move.curve,
            point_or_points,
            period_result=active_period_result,
            basepoint="infinity",
            prec=prec,
        )
        raw_vector = abel_result.vector_pairs()
        abel_verification = abel_result.verify()
        if abel_verification.get("verified") is not True:
            raise Genus3HeightCapabilityError(
                "an Abel--Jacobi result failed its curve/refinement replay",
                {"abel_verification": dict(abel_verification)},
            )
        normalized = normalize_abel_jacobi_coordinates(
            raw_vector,
            full_period_matrix,
            prec=prec,
        )
        abel_jacobi_records.append(
            {
                "support": tuple(abel_result.to_dict().get("support", ())),
                "raw_model_basis_vector": tuple(tuple(value) for value in raw_vector),
                "normalized_theta_vector": normalized,
                "transformation": "z_theta = A^-1 * integral(omega_model)",
            }
        )
        return normalized

    d_terms = [(1, vector(point)) for point in move.points]
    d_terms.append((-move.degree, [0, 0, 0]))
    pieces = []
    for e1_points, e2_points in move.theta_pairs:
        pieces.append(
            archimedean_green_pairing(
                d_terms,
                vector(e1_points),
                vector(e2_points),
                period_matrix,
                prec=prec,
                theta_radius=theta_radius,
                limits=limits,
            )
        )
    value = mp.fsum(piece.value for piece in pieces)
    return ArchimedeanPairing(
        value,
        precision=prec,
        refinement_stable=all(piece.refinement_stable for piece in pieces),
        rigorous=False,
        algorithm="Holmes split-Mumford move plus Muller theta Green functions",
        certificate={
            "move": move.to_dict(),
            "period_result": active_period_result.to_dict(),
            "abel_jacobi_normalization": {
                "full_period_convention": "[A|B] in the model differential basis",
                "theta_period_matrix": "tau = A^-1*B",
                "theta_coordinate_convention": (
                    "z = A^-1*integral(omega_model); raw Abel--Jacobi vectors "
                    "must not be paired directly with tau"
                ),
                "records": tuple(abel_jacobi_records),
                "period_verification": dict(period_verification),
            },
            "theta_pieces": tuple(piece.to_dict() for piece in pieces),
            "right_class_relation": "[E] = -"
            + str(move.negative_class_multiple)
            + "*[D]",
            "height_scale": _qq_string(move.height_scale),
            "rigorous": False,
        },
        _verification=_AutomaticArchimedeanVerification(
            prec,
            "period/Abel refinement plus normalized-coordinate theta refinement",
            curve_key=_curve_key(move.curve),
            move_key=_move_key(move),
        ),
    )


def _complex_vector(values: Any, size: int, name: str) -> list[Any]:
    source = list(values)
    if len(source) != size:
        raise ValueError(name + " has the wrong dimension")
    answer = []
    for value in source:
        if isinstance(value, (tuple, list)):
            if len(value) != 2:
                raise ValueError(name + " complex pairs must have length two")
            answer.append(mp.mpc(value[0], value[1]))
        else:
            answer.append(mp.mpc(value))
        if not mp.isfinite(mp.re(answer[-1])) or not mp.isfinite(mp.im(answer[-1])):
            raise ValueError(name + " entries must be finite")
    return answer


def _complex_matrix(values: Any, size: int, name: str) -> list[list[Any]]:
    rows = [list(row) for row in values]
    if len(rows) != size or any(len(row) != size for row in rows):
        raise ValueError(
            name + " must be a " + str(size) + " by " + str(size) + " matrix"
        )
    return [_complex_vector(row, size, name) for row in rows]


def _solve_complex_three(matrix: list[list[Any]], right: list[Any]) -> list[Any]:
    working = [list(matrix[row]) + [right[row]] for row in range(3)]
    for column in range(3):
        pivot = max(range(column, 3), key=lambda row: abs(working[row][column]))
        if working[pivot][column] == 0:
            raise ArithmeticError("the A-period matrix is singular")
        if pivot != column:
            working[pivot], working[column] = working[column], working[pivot]
        scale = working[column][column]
        working[column] = [value / scale for value in working[column]]
        for row in range(3):
            if row == column:
                continue
            factor = working[row][column]
            working[row] = [
                working[row][entry] - factor * working[column][entry]
                for entry in range(4)
            ]
    return [working[row][3] for row in range(3)]


def _complex_pairs(values: Any, precision: int) -> tuple[tuple[str, str], ...]:
    digits = max(20, int(precision * 0.30103) + 5)
    return tuple(
        (str(mp.nstr(mp.re(value), digits)), str(mp.nstr(mp.im(value), digits)))
        for value in values
    )


def normalize_abel_jacobi_coordinates(
    raw_vector: Any,
    full_period_matrix: Any,
    *,
    prec: int = 128,
) -> tuple[tuple[str, str], ...]:
    """Convert model-basis Abel integrals to coordinates for `tau=A^-1 B`.

    `full_period_matrix` must use the periods module's `g x 2g` `[A|B]`
    convention.  If `w=integral(omega_model)`, theta functions with normalized
    period matrix `tau=A^-1 B` require `z=A^-1 w`.
    """
    precision = _positive_integer(prec, "prec")
    rows = [list(row) for row in full_period_matrix]
    if len(rows) != 3 or any(len(row) != 6 for row in rows):
        raise ValueError("full_period_matrix must be a 3 by 6 [A|B] matrix")
    with mp.workprec(precision + 32):
        a_matrix = [_complex_vector(row[:3], 3, "A-period matrix") for row in rows]
        source = _complex_vector(raw_vector, 3, "raw Abel--Jacobi vector")
        normalized = _solve_complex_three(a_matrix, source)
        residual = [
            sum(a_matrix[row][column] * normalized[column] for column in range(3))
            - source[row]
            for row in range(3)
        ]
        tolerance = mp.power(2, -max(32, precision - 20)) * max(
            [mp.mpf(1)] + [abs(value) for value in source]
        )
        if max(abs(value) for value in residual) > tolerance:
            raise Genus3HeightNumericalIndeterminacyError(
                "A-period coordinate normalization failed its residual check",
                {
                    "precision_bits": precision,
                    "maximum_residual": mp.nstr(
                        max(abs(value) for value in residual), 20
                    ),
                    "tolerance": mp.nstr(tolerance, 20),
                    "convention": "z=A^-1*integral(omega_model)",
                },
            )
        return _complex_pairs(normalized, precision)


def _real_determinant(values: list[list[Any]]) -> Any:
    if len(values) == 1:
        return values[0][0]
    if len(values) == 2:
        return values[0][0] * values[1][1] - values[0][1] * values[1][0]
    return (
        values[0][0] * (values[1][1] * values[2][2] - values[1][2] * values[2][1])
        - values[0][1] * (values[1][0] * values[2][2] - values[1][2] * values[2][0])
        + values[0][2] * (values[1][0] * values[2][1] - values[1][1] * values[2][0])
    )


def _period_geometry(period_matrix: Any) -> tuple[list[list[Any]], Any]:
    tau = _complex_matrix(period_matrix, 3, "period_matrix")
    tolerance = mp.power(2, -max(32, mp.prec // 2))
    for row in range(3):
        for column in range(row):
            if abs(tau[row][column] - tau[column][row]) > tolerance:
                raise ValueError("the normalized period matrix must be symmetric")
    imaginary = [[mp.im(tau[row][column]) for column in range(3)] for row in range(3)]
    first_minor = imaginary[0][0]
    second_minor = imaginary[0][0] * imaginary[1][1] - imaginary[0][1] * imaginary[1][0]
    determinant = _real_determinant(imaginary)
    if first_minor <= 0 or second_minor <= 0 or determinant <= 0:
        raise ValueError("the period matrix must have positive definite imaginary part")
    row_bound = max(sum(abs(value) for value in row) for row in imaginary)
    eigenvalue_lower_bound = determinant / (row_bound * row_bound)
    if eigenvalue_lower_bound <= 0:
        raise ArithmeticError("failed to bound the period-matrix eigenvalues")
    return tau, eigenvalue_lower_bound


def _integer_vectors(radius: int, size: int) -> Any:
    current = [0 for _index in range(size)]

    def visit(index: int) -> Any:
        if index == size:
            yield list(current)
            return
        for value in range(-radius, radius + 1):
            current[index] = value
            yield from visit(index + 1)

    yield from visit(0)


def _theta_radius(
    z_value: list[Any], eigenvalue_lower_bound: Any, precision: int
) -> int:
    imaginary_norm = mp.sqrt(sum(mp.im(value) ** 2 for value in z_value))
    displacement = imaginary_norm / eigenvalue_lower_bound
    demand = (
        precision * mp.log(2) + mp.pi * imaginary_norm**2 / eigenvalue_lower_bound + 16
    )
    return max(
        2,
        int(
            mp.ceil(
                displacement + mp.sqrt(demand / (mp.pi * eigenvalue_lower_bound)) + 1
            )
        ),
    )


def _theta_sum(z_value: list[Any], tau: list[list[Any]], radius: int) -> Any:
    genus = 3
    a_value = [mp.mpf("0.5") for _index in range(genus)]
    b_value = [mp.mpf(genus - index) / 2 for index in range(genus)]
    terms = []
    for integer_vector in _integer_vectors(radius, genus):
        shifted = [integer_vector[index] + a_value[index] for index in range(genus)]
        quadratic = mp.mpc(0)
        for row in range(genus):
            for column in range(genus):
                quadratic += shifted[row] * tau[row][column] * shifted[column]
        linear = sum(
            shifted[index] * (z_value[index] + b_value[index]) for index in range(genus)
        )
        terms.append(mp.exp(mp.pi * mp.j * quadratic + 2 * mp.pi * mp.j * linear))
    return mp.fsum(terms)


class ThetaEvaluation:
    """A genus-3 theta value with a radius-refinement witness."""

    def __init__(
        self,
        value: Any,
        difference: Any,
        radius: int,
        terms: int,
        precision: int,
        stable: bool,
    ) -> None:
        self.value = value
        self.refinement_difference = difference
        self.radius = radius
        self.terms = terms
        self.precision = precision
        self.refinement_stable = bool(stable)
        self.rigorous = False
        self.analytic_error_status = (
            "radius-refinement-stable; truncation and rounding not enclosed"
        )

    def to_dict(self) -> dict[str, Any]:
        digits = max(20, int(self.precision * 0.30103) + 5)
        return {
            "schema": "sagejs.hyperelliptic.genus3-theta-evaluation.v1",
            "value_real": mp.nstr(mp.re(self.value), digits),
            "value_imag": mp.nstr(mp.im(self.value), digits),
            "refinement_difference": mp.nstr(self.refinement_difference, digits),
            "radius": self.radius,
            "terms": self.terms,
            "precision_bits": self.precision,
            "refinement_stable": self.refinement_stable,
            "rigorous": False,
            "analytic_error_status": self.analytic_error_status,
        }


def genus3_theta(
    z_value: Any,
    period_matrix: Any,
    *,
    prec: int = 128,
    radius: int | None = None,
    limits: Genus3HeightLimits = DEFAULT_HEIGHT_LIMITS,
) -> ThetaEvaluation:
    """Evaluate Muller's genus-3 theta characteristic by radius refinement."""
    precision = _positive_integer(prec, "prec")
    if precision < 53:
        raise ValueError("theta evaluation requires at least 53 bits")
    with mp.workprec(precision + 32):
        tau, lower_bound = _period_geometry(period_matrix)
        z_vector = _complex_vector(z_value, 3, "z_value")
        coarse_radius = (
            _theta_radius(z_vector, lower_bound, precision)
            if radius is None
            else _positive_integer(radius, "radius")
        )
        fine_radius = coarse_radius + 2
        fine_terms = (2 * fine_radius + 1) ** 3
        total_terms = (2 * coarse_radius + 1) ** 3 + fine_terms
        diagnostics = {
            "precision_bits": precision,
            "coarse_radius": coarse_radius,
            "fine_radius": fine_radius,
            "fine_terms": fine_terms,
            "total_terms": total_terms,
            "eigenvalue_lower_bound": mp.nstr(lower_bound, 20),
            "limits": limits.to_dict(),
        }
        if (
            fine_radius > limits.max_theta_radius
            or total_terms > limits.max_theta_terms
        ):
            raise Genus3HeightResourceError(
                "the genus-3 theta plan exceeds its declared limit", diagnostics
            )
        coarse = _theta_sum(z_vector, tau, coarse_radius)
        fine = _theta_sum(z_vector, tau, fine_radius)
        difference = abs(fine - coarse)
        tolerance = mp.power(2, -max(32, precision - 20)) * max(1, abs(fine))
        stable = difference <= tolerance
        if not stable:
            diagnostics["refinement_difference"] = mp.nstr(difference, 20)
            diagnostics["tolerance"] = mp.nstr(tolerance, 20)
            raise Genus3HeightNumericalIndeterminacyError(
                "theta radius refinement did not stabilize", diagnostics
            )
        return ThetaEvaluation(
            +fine,
            +difference,
            fine_radius,
            total_terms,
            precision,
            True,
        )


def _real_matrix_inverse_three(values: list[list[Any]]) -> list[list[Any]]:
    determinant = _real_determinant(values)
    if determinant == 0:
        raise ArithmeticError("the imaginary period matrix is singular")
    answer = []
    for row in range(3):
        target = [mp.mpf(1 if index == row else 0) for index in range(3)]
        working = [list(values[index]) + [target[index]] for index in range(3)]
        for column in range(3):
            pivot = column
            while pivot < 3 and working[pivot][column] == 0:
                pivot += 1
            if pivot == 3:
                raise ArithmeticError("the imaginary period matrix is singular")
            if pivot != column:
                working[pivot], working[column] = working[column], working[pivot]
            scale = working[column][column]
            working[column] = [value / scale for value in working[column]]
            for index in range(3):
                if index == column:
                    continue
                factor = working[index][column]
                working[index] = [
                    working[index][entry] - factor * working[column][entry]
                    for entry in range(4)
                ]
        answer.append([working[column][-1] for column in range(3)])
    return [list(row) for row in zip(*answer, strict=True)]


class ArchimedeanPairing:
    """One real-place local Neron symbol and its numerical provenance."""

    def __init__(
        self,
        value: Any,
        *,
        precision: int,
        refinement_stable: bool,
        rigorous: bool,
        algorithm: str,
        certificate: Mapping[str, Any],
        _verification: Any = None,
    ) -> None:
        self.value = _mpf_value(value)
        if not mp.isfinite(self.value):
            raise ValueError("an archimedean pairing must be finite")
        self.precision = _positive_integer(precision, "precision")
        self.refinement_stability_claimed = bool(refinement_stable)
        self._verification = (
            _verification
            if isinstance(_verification, _AutomaticArchimedeanVerification)
            else None
        )
        self.refinement_stable = bool(
            self._verification is not None
            and self._verification.precision >= self.precision
        )
        self.rigorous_claimed = bool(rigorous)
        # No current Phase-8 analytic path returns ball enclosures.
        self.rigorous = False
        self.algorithm = str(algorithm)
        self.certificate = dict(certificate)

    def belongs_to(self, move: SplitMumfordMove) -> bool:
        """Return whether an automatic symbol is bound to exactly `move`."""
        return bool(
            self._verification is not None
            and self._verification.curve_key == _curve_key(move.curve)
            and self._verification.move_key == _move_key(move)
        )

    def to_dict(self) -> dict[str, Any]:
        digits = max(20, int(self.precision * 0.30103) + 5)
        return {
            "schema": "sagejs.hyperelliptic.archimedean-height-pairing.v1",
            "value": mp.nstr(self.value, digits),
            "precision_bits": self.precision,
            "refinement_stable": self.refinement_stable,
            "refinement_stability_claimed": self.refinement_stability_claimed,
            "rigorous": self.rigorous,
            "rigorous_claimed": self.rigorous_claimed,
            "move_bound": bool(
                self._verification is not None
                and self._verification.move_key is not None
            ),
            "algorithm": self.algorithm,
            "certificate": dict(self.certificate),
        }


def supplied_archimedean_pairing(
    value: Any,
    *,
    prec: int,
    rigorous: bool,
    provenance: Mapping[str, Any],
) -> ArchimedeanPairing:
    """Record a conditional supplied real-place local Neron symbol.

    `rigorous=True` is retained as a claim in the provenance but cannot promote
    this unbound scalar to a rigorous Phase-8 result.
    """
    if not provenance:
        raise ValueError("a supplied archimedean pairing needs provenance")
    return ArchimedeanPairing(
        value,
        precision=_positive_integer(prec, "prec"),
        refinement_stable=False,
        rigorous=bool(rigorous),
        algorithm="supplied-conditional",
        certificate={
            "provenance": dict(provenance),
            "supplied_rigorous_claim": bool(rigorous),
            "verification_status": "conditional_unverified_archimedean_input",
        },
    )


def archimedean_green_pairing(
    d_terms: Any,
    e1_sum: Any,
    e2_sum: Any,
    period_matrix: Any,
    *,
    prec: int = 128,
    theta_radius: int | None = None,
    limits: Genus3HeightLimits = DEFAULT_HEIGHT_LIMITS,
) -> ArchimedeanPairing:
    """Compute Muller's theta formula for one real local Neron symbol.

    `d_terms` consists of `(multiplicity, Abel--Jacobi vector)` pairs and must
    have total multiplicity zero.  `e1_sum` and `e2_sum` are Abel--Jacobi lifts
    of the summation points of two disjoint non-special effective degree-three
    divisors representing the second degree-zero divisor.  The caller is
    responsible for the Abel--Jacobi integration and disjoint/non-special
    certificates; those facts are recorded explicitly rather than inferred.
    """
    precision = _positive_integer(prec, "prec")
    terms = [(_qq(item[0]), item[1]) for item in d_terms]
    if not terms or sum(item[0] for item in terms) != 0:
        raise ValueError("d_terms must be a nonempty degree-zero divisor")
    if len(terms) > limits.max_archimedean_terms:
        raise Genus3HeightResourceError(
            "the archimedean divisor has too many terms",
            {
                "terms": len(terms),
                "max_archimedean_terms": limits.max_archimedean_terms,
            },
        )
    with mp.workprec(precision + 32):
        tau, _lower_bound = _period_geometry(period_matrix)
        e1_vector = _complex_vector(e1_sum, 3, "e1_sum")
        e2_vector = _complex_vector(e2_sum, 3, "e2_sum")
        imaginary = [
            [mp.im(tau[row][column]) for column in range(3)] for row in range(3)
        ]
        inverse_imaginary = _real_matrix_inverse_three(imaginary)
        theta_log = mp.mpf(0)
        d_imaginary = [mp.mpf(0) for _index in range(3)]
        theta_certificates = []
        for multiplicity, point_value in terms:
            point = _complex_vector(point_value, 3, "d_term")
            first = genus3_theta(
                [point[index] - e1_vector[index] for index in range(3)],
                tau,
                prec=precision,
                radius=theta_radius,
                limits=limits,
            )
            second = genus3_theta(
                [point[index] - e2_vector[index] for index in range(3)],
                tau,
                prec=precision,
                radius=theta_radius,
                limits=limits,
            )
            first_absolute = abs(first.value)
            second_absolute = abs(second.value)
            zero_threshold = mp.power(2, -max(30, precision - 16))
            if first_absolute <= zero_threshold or second_absolute <= zero_threshold:
                raise Genus3HeightNumericalIndeterminacyError(
                    "a theta value is indistinguishable from the theta divisor",
                    {
                        "precision_bits": precision,
                        "first_absolute": mp.nstr(first_absolute, 20),
                        "second_absolute": mp.nstr(second_absolute, 20),
                        "threshold": mp.nstr(zero_threshold, 20),
                        "needs": "disjoint non-special divisor representatives or more precision",
                    },
                )
            multiplicity_mpf = _mpf_qq(multiplicity)
            theta_log -= multiplicity_mpf * (
                mp.log(first_absolute) - mp.log(second_absolute)
            )
            for index in range(3):
                d_imaginary[index] += multiplicity_mpf * mp.im(point[index])
            theta_certificates.append(
                {
                    "multiplicity": _qq_string(multiplicity),
                    "theta_e1": first.to_dict(),
                    "theta_e2": second.to_dict(),
                }
            )
        e_difference = [
            mp.im(e1_vector[index] - e2_vector[index]) for index in range(3)
        ]
        inverse_times_d = [
            sum(
                inverse_imaginary[row][column] * d_imaginary[column]
                for column in range(3)
            )
            for row in range(3)
        ]
        quadratic_term = (
            -2
            * mp.pi
            * sum(e_difference[index] * inverse_times_d[index] for index in range(3))
        )
        value = theta_log + quadratic_term
        return ArchimedeanPairing(
            +value,
            precision=precision,
            refinement_stable=True,
            rigorous=False,
            algorithm="Muller-Hriljac genus-3 theta characteristic",
            certificate={
                "reference": "Muller arXiv:1105.1719, Corollary GreenForm",
                "theta_terms": tuple(theta_certificates),
                "theta_log_term": mp.nstr(theta_log, max(20, precision // 3)),
                "period_quadratic_term": mp.nstr(
                    quadratic_term, max(20, precision // 3)
                ),
                "period_matrix_supplied": True,
                "abel_jacobi_coordinates_supplied": True,
                "disjoint_non_special_representatives": "caller-certified precondition",
                "analytic_error_status": (
                    "theta radius refinements stable; Abel-Jacobi, period, truncation, "
                    "and rounding errors are not enclosed"
                ),
            },
            _verification=_AutomaticArchimedeanVerification(
                precision, "theta radius refinement with normalized tau coordinates"
            ),
        )


class FaltingsHriljacPairingResult:
    """A separated finite/archimedean Faltings--Hriljac pairing result."""

    def __init__(
        self,
        finite_places: Any,
        archimedean: ArchimedeanPairing,
        *,
        complete_prime_set: bool,
        unsupported_primes: Any,
        prec: int,
        finite_plan: Any = None,
    ) -> None:
        supplied_finite_places = tuple(finite_places)
        if any(
            not isinstance(item, FinitePlacePairing) for item in supplied_finite_places
        ):
            raise TypeError("finite_places must contain FinitePlacePairing objects")
        primes = [item.prime for item in supplied_finite_places]
        if len(set(primes)) != len(primes):
            raise ValueError("a finite prime occurs more than once")
        if not isinstance(archimedean, ArchimedeanPairing):
            raise TypeError("archimedean must be an ArchimedeanPairing")
        self.archimedean = archimedean
        self.complete_prime_set_claimed = bool(complete_prime_set)
        self.unsupported_primes = tuple(
            sorted(_checked_prime(int(p)) for p in unsupported_primes)
        )
        self.finite_plan = (
            finite_plan if isinstance(finite_plan, SplitMumfordFinitePlan) else None
        )
        self.finite_places_derived_from_plan = self.finite_plan is not None
        if self.finite_plan is not None:
            supplied_by_prime = {item.prime: item for item in supplied_finite_places}
            planned_by_prime = {item.prime: item for item in self.finite_plan.pairings}
            exact_plan_pairings = bool(
                set(supplied_by_prime) == set(planned_by_prime)
                and all(
                    supplied_by_prime[prime] is planned_by_prime[prime]
                    for prime in planned_by_prime
                )
            )
            if not exact_plan_pairings:
                raise Genus3HeightCapabilityError(
                    "finite_places must be the exact pairings computed by finite_plan",
                    {
                        "supplied_primes": tuple(sorted(supplied_by_prime)),
                        "planned_primes": tuple(sorted(planned_by_prime)),
                        "same_prime_objects": tuple(
                            (
                                prime,
                                prime in supplied_by_prime
                                and supplied_by_prime[prime] is planned_by_prime[prime],
                            )
                            for prime in sorted(planned_by_prime)
                        ),
                        "needs": (
                            "pass finite_plan.pairings without substituting or "
                            "reconstructing local symbols"
                        ),
                    },
                )
            # The plan is the sole source of finite symbols once supplied.
            self.finite_places = self.finite_plan.pairings
        else:
            self.finite_places = supplied_finite_places
        self.finite_support_verified = bool(
            self.finite_plan is not None
            and self.finite_plan.complete
            and not self.unsupported_primes
        )
        self.complete_prime_set = self.finite_support_verified
        self.precision = _positive_integer(prec, "prec")
        if archimedean.precision < self.precision:
            raise Genus3HeightCapabilityError(
                "the archimedean pairing has insufficient precision",
                {
                    "requested_precision_bits": self.precision,
                    "archimedean_precision_bits": archimedean.precision,
                },
            )
        with mp.workprec(self.precision + 32):
            self.finite_value = mp.fsum(
                _mpf_qq(item.coefficient) * mp.log(item.prime)
                for item in self.finite_places
            )
            self.neron_symbol = +(self.finite_value + archimedean.value)
            self.canonical_pairing = -self.neron_symbol
        self.finite_exact = all(item.exact for item in self.finite_places)
        self.finite_models_certified = all(
            item.model_certified for item in self.finite_places
        )
        self.archimedean_refinement_stable = archimedean.refinement_stable
        self.rigorous = bool(
            self.complete_prime_set
            and not self.unsupported_primes
            and self.finite_exact
            and self.finite_models_certified
            and archimedean.rigorous
        )

    def require_complete(self) -> FaltingsHriljacPairingResult:
        if not self.complete_prime_set or self.unsupported_primes:
            raise Genus3HeightCapabilityError(
                "the global height has unsupported or unchecked finite primes",
                {
                    "complete_prime_set": self.complete_prime_set,
                    "unsupported_primes": self.unsupported_primes,
                    "computed_primes": tuple(item.prime for item in self.finite_places),
                },
            )
        return self

    def to_dict(self) -> dict[str, Any]:
        digits = max(20, int(self.precision * 0.30103) + 5)
        return {
            "schema": "sagejs.hyperelliptic.faltings-hriljac-pairing.v1",
            "normalization": "([D],[E])_NT = -sum_v <D,E>_v",
            "finite_places": tuple(item.to_dict() for item in self.finite_places),
            "finite_value": mp.nstr(self.finite_value, digits),
            "archimedean": self.archimedean.to_dict(),
            "neron_symbol": mp.nstr(self.neron_symbol, digits),
            "canonical_pairing": mp.nstr(self.canonical_pairing, digits),
            "complete_prime_set": self.complete_prime_set,
            "complete_prime_set_claimed": self.complete_prime_set_claimed,
            "finite_support_verified": self.finite_support_verified,
            "finite_places_derived_from_plan": self.finite_places_derived_from_plan,
            "unsupported_primes": tuple(str(p) for p in self.unsupported_primes),
            "finite_exact": self.finite_exact,
            "finite_models_certified": self.finite_models_certified,
            "archimedean_refinement_stable": self.archimedean_refinement_stable,
            "rigorous": self.rigorous,
            "precision_bits": self.precision,
        }


def faltings_hriljac_pairing(
    finite_places: Any,
    archimedean: ArchimedeanPairing,
    *,
    complete_prime_set: bool,
    unsupported_primes: Any = (),
    prec: int = 128,
    finite_plan: SplitMumfordFinitePlan | None = None,
) -> FaltingsHriljacPairingResult:
    """Assemble exact finite coefficients and one numerical real local symbol."""
    return FaltingsHriljacPairingResult(
        finite_places,
        archimedean,
        complete_prime_set=complete_prime_set,
        unsupported_primes=unsupported_primes,
        prec=prec,
        finite_plan=finite_plan,
    )


class Genus3CanonicalHeightResult:
    """Canonical height obtained from a certified negative moved class."""

    def __init__(
        self,
        move: SplitMumfordMove,
        pairing: FaltingsHriljacPairingResult,
    ) -> None:
        pairing.require_complete()
        finite_plan = pairing.finite_plan
        if finite_plan is None or not finite_plan.belongs_to(move):
            raise Genus3HeightCapabilityError(
                "the finite plan is not bound to the supplied Mumford move",
                {
                    "expected_move_key": _move_key(move),
                    "finite_plan": (
                        None if finite_plan is None else finite_plan.to_dict()
                    ),
                },
            )
        archimedean_verification = pairing.archimedean._verification
        if (
            archimedean_verification is not None
            and archimedean_verification.move_key is not None
            and not pairing.archimedean.belongs_to(move)
        ):
            raise Genus3HeightCapabilityError(
                "the automatic archimedean pairing belongs to a different Mumford move",
                {
                    "expected_curve_key": _curve_key(move.curve),
                    "expected_move_key": _move_key(move),
                    "archimedean_curve_key": archimedean_verification.curve_key,
                    "archimedean_move_key": archimedean_verification.move_key,
                },
            )
        self.move = move
        self.pairing = pairing
        self.negative_class_multiple = move.negative_class_multiple
        with mp.workprec(pairing.precision + 32):
            self.value = +(pairing.neron_symbol / self.negative_class_multiple)
        self.finite_exact = pairing.finite_exact
        self.archimedean_move_verified = pairing.archimedean.belongs_to(move)
        self.archimedean_refinement_stable = bool(
            pairing.archimedean_refinement_stable and self.archimedean_move_verified
        )
        self.rigorous = bool(pairing.rigorous and self.archimedean_move_verified)
        self.finite_plan: SplitMumfordFinitePlan | None = finite_plan
        self.normalization = "[E]=-k[D], <D,E>=k*h([D]), height=<D,E>/k"

    def to_dict(self) -> dict[str, Any]:
        digits = max(20, int(self.pairing.precision * 0.30103) + 5)
        return {
            "schema": "sagejs.hyperelliptic.genus3-canonical-height.v1",
            "value": mp.nstr(self.value, digits),
            "negative_class_multiple": self.negative_class_multiple,
            "normalization": self.normalization,
            "move": self.move.to_dict(),
            "faltings_hriljac_pairing": self.pairing.to_dict(),
            "finite_exact": self.finite_exact,
            "finite_plan_move_verified": True,
            "archimedean_move_verified": self.archimedean_move_verified,
            "archimedean_refinement_stable": self.archimedean_refinement_stable,
            "rigorous": self.rigorous,
            "finite_plan": (
                None if self.finite_plan is None else self.finite_plan.to_dict()
            ),
        }


def split_mumford_canonical_height(
    move: SplitMumfordMove,
    finite_places: Any,
    archimedean: ArchimedeanPairing,
    *,
    complete_prime_set: bool,
    unsupported_primes: Any = (),
    prec: int = 128,
    finite_plan: SplitMumfordFinitePlan | None = None,
) -> Genus3CanonicalHeightResult:
    """Assemble the canonical height of a split Mumford divisor."""
    pairing = faltings_hriljac_pairing(
        finite_places,
        archimedean,
        complete_prime_set=complete_prime_set,
        unsupported_primes=unsupported_primes,
        prec=prec,
        finite_plan=finite_plan,
    )
    return Genus3CanonicalHeightResult(move, pairing)


def automatic_split_mumford_canonical_height(
    move: SplitMumfordMove,
    *,
    period_result: Any | None = None,
    supplied_archimedean: ArchimedeanPairing | None = None,
    supplied_finite_pairings: Any = (),
    identity_component_witnesses: Mapping[int, Mapping[str, Any]] | None = None,
    extra_primes: Any = (),
    prec: int = 128,
    theta_radius: int | None = None,
    limits: Genus3HeightLimits = DEFAULT_HEIGHT_LIMITS,
) -> Genus3CanonicalHeightResult:
    """Run the complete supported split-Mumford height pipeline.

    Unsupported candidate primes are collected before this function raises,
    and the full finite plan is attached to the capability diagnostics.  A
    numerical archimedean symbol may be supplied with provenance; otherwise
    the shared periods/Abel--Jacobi engine and genus-3 theta path are used.
    """
    finite_plan = split_mumford_finite_plan(
        move,
        supplied_pairings=supplied_finite_pairings,
        identity_component_witnesses=identity_component_witnesses,
        extra_primes=extra_primes,
        limits=limits,
    )
    finite_plan.require_complete()
    archimedean = (
        split_mumford_archimedean_pairing(
            move,
            period_result=period_result,
            prec=prec,
            theta_radius=theta_radius,
            limits=limits,
        )
        if supplied_archimedean is None
        else supplied_archimedean
    )
    if not isinstance(archimedean, ArchimedeanPairing):
        raise TypeError("supplied_archimedean must be an ArchimedeanPairing")
    result = split_mumford_canonical_height(
        move,
        finite_plan.pairings,
        archimedean,
        complete_prime_set=True,
        prec=prec,
        finite_plan=finite_plan,
    )
    return result


class HeightPairingMatrixResult:
    """A numerical Neron--Tate pairing matrix and regulator."""

    def __init__(
        self, entries: Any, *, prec: int, provenance: Mapping[str, Any]
    ) -> None:
        self.precision = _positive_integer(prec, "prec")
        source = [list(row) for row in entries]
        if not source or any(len(row) != len(source) for row in source):
            raise ValueError("a height pairing matrix must be nonempty and square")
        with mp.workprec(self.precision + 32):
            self.entries = tuple(
                tuple(_mpf_value(value) for value in row) for row in source
            )
            tolerance = mp.power(2, -max(30, self.precision - 20))
            for row in range(len(source)):
                for column in range(row):
                    if (
                        abs(self.entries[row][column] - self.entries[column][row])
                        > tolerance
                    ):
                        raise ValueError("the height pairing matrix must be symmetric")
            working = [list(row) for row in self.entries]
            determinant = mp.mpf(1)
            positive = True
            pivots = []
            for column in range(len(working)):
                pivot = working[column][column]
                pivots.append(+pivot)
                if pivot <= tolerance:
                    positive = False
                    break
                determinant *= pivot
                for row in range(column + 1, len(working)):
                    factor = working[row][column] / pivot
                    for index in range(column + 1, len(working)):
                        working[row][index] -= factor * working[column][index]
            if not positive:
                raise Genus3HeightNumericalIndeterminacyError(
                    "the height pairing is not numerically positive definite",
                    {
                        "precision_bits": self.precision,
                        "pivots": tuple(mp.nstr(value, 20) for value in pivots),
                        "tolerance": mp.nstr(tolerance, 20),
                    },
                )
            self.regulator = +determinant
        self.rank = len(source)
        self.provenance = dict(provenance)
        self.input_completeness = str(
            self.provenance.get("input_completeness", "not_recorded")
        )
        self.input_rigor = str(self.provenance.get("input_rigor", "not_recorded"))
        self.rigorous = False

    def to_dict(self) -> dict[str, Any]:
        digits = max(20, int(self.precision * 0.30103) + 5)
        return {
            "schema": "sagejs.hyperelliptic.height-pairing-matrix.v1",
            "rank": self.rank,
            "entries": tuple(
                tuple(mp.nstr(value, digits) for value in row) for row in self.entries
            ),
            "regulator": mp.nstr(self.regulator, digits),
            "precision_bits": self.precision,
            "positive_definite": True,
            "rigorous": False,
            "input_completeness": self.input_completeness,
            "input_rigor": self.input_rigor,
            "provenance": dict(self.provenance),
        }


def regulator_from_pairing_matrix(
    entries: Any,
    *,
    prec: int = 128,
    provenance: Mapping[str, Any] | None = None,
    limits: Genus3HeightLimits = DEFAULT_HEIGHT_LIMITS,
) -> HeightPairingMatrixResult:
    """Validate a numerical canonical pairing matrix and return its regulator."""
    source = [list(row) for row in entries]
    if len(source) > limits.max_pairing_rank:
        raise Genus3HeightResourceError(
            "the height-pairing rank exceeds its declared limit",
            {"rank": len(source), "max_pairing_rank": limits.max_pairing_rank},
        )
    return HeightPairingMatrixResult(
        source,
        prec=prec,
        provenance={} if provenance is None else provenance,
    )


def pairing_matrix_from_heights(
    points: Any,
    height_function: Any,
    *,
    prec: int = 128,
    limits: Genus3HeightLimits = DEFAULT_HEIGHT_LIMITS,
) -> HeightPairingMatrixResult:
    """Build `(P_i,P_j)` from heights using the polarization identity."""
    values = list(points)
    if not values:
        raise ValueError("at least one point is required")
    if len(values) > limits.max_pairing_rank:
        raise Genus3HeightResourceError(
            "the height-pairing rank exceeds its declared limit",
            {"rank": len(values), "max_pairing_rank": limits.max_pairing_rank},
        )
    evaluations = []

    def evaluate(point: Any, label: str) -> Any:
        result = height_function(point)
        numeric = result.value if hasattr(result, "value") else result
        complete = bool(
            isinstance(result, Genus3CanonicalHeightResult)
            and result.pairing.finite_support_verified
        )
        rigorous = bool(
            isinstance(result, Genus3CanonicalHeightResult) and result.rigorous
        )
        evaluations.append(
            {
                "label": label,
                "result_type": type(result).__name__,
                "complete": complete,
                "rigorous": rigorous,
                "provenance": (
                    result.to_dict() if hasattr(result, "to_dict") else None
                ),
            }
        )
        return _mpf_value(numeric)

    diagonals = [
        evaluate(point, "height(P_" + str(index) + ")")
        for index, point in enumerate(values)
    ]
    entries = [[mp.mpf(0) for _column in values] for _row in values]
    for row in range(len(values)):
        entries[row][row] = _mpf_value(diagonals[row])
        for column in range(row):
            combined = evaluate(
                values[row] + values[column],
                "height(P_" + str(row) + "+P_" + str(column) + ")",
            )
            pairing = (combined - diagonals[row] - diagonals[column]) / 2
            entries[row][column] = pairing
            entries[column][row] = pairing
    return regulator_from_pairing_matrix(
        entries,
        prec=prec,
        provenance={
            "algorithm": "polarization from canonical heights",
            "point_count": len(values),
            "input_completeness": (
                "verified_complete"
                if evaluations and all(item["complete"] for item in evaluations)
                else "not_verified_complete"
            ),
            "input_rigor": (
                "rigorous"
                if evaluations and all(item["rigorous"] for item in evaluations)
                else "non_rigorous_or_unverified"
            ),
            "height_evaluations": tuple(evaluations),
        },
        limits=limits,
    )


__all__ = [
    "ArchimedeanPairing",
    "DEFAULT_HEIGHT_LIMITS",
    "FaltingsHriljacPairingResult",
    "FinitePlacePairing",
    "Genus3HeightCapabilityError",
    "Genus3CanonicalHeightResult",
    "Genus3HeightLimits",
    "Genus3HeightNumericalIndeterminacyError",
    "Genus3HeightResourceError",
    "HeightPairingMatrixResult",
    "RegularModelPrimeData",
    "SplitMumfordCandidateSupport",
    "SplitMumfordFinitePlan",
    "SplitMumfordMove",
    "ThetaEvaluation",
    "archimedean_green_pairing",
    "automatic_split_mumford_canonical_height",
    "faltings_hriljac_pairing",
    "genus3_theta",
    "pairing_matrix_from_heights",
    "rational_horizontal_intersection",
    "rational_section_intersection",
    "regular_model_from_local_reduction",
    "regular_model_from_semistable_graph",
    "regulator_from_pairing_matrix",
    "supplied_archimedean_pairing",
    "move_split_mumford_divisor",
    "normalize_abel_jacobi_coordinates",
    "smooth_identity_finite_pairing",
    "split_mumford_archimedean_pairing",
    "split_mumford_candidate_primes",
    "split_mumford_canonical_height",
    "split_mumford_finite_pairing_at_prime",
    "split_mumford_finite_plan",
    "split_mumford_points",
]
