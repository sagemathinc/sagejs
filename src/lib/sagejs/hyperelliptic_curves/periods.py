"""Real periods of genus-2 and genus-3 hyperelliptic Jacobians.

This module is the readable, portable implementation of the archimedean BSD
factor.  For a characteristic-zero model

```text
y^2 + h(x)y = f(x)
```

it works with the completed branch polynomial `F=h^2+4f` and the model
differentials

```text
omega_i = x^i dx / (2y+h) = x^i dx / sqrt(F),  0 <= i < g.
```

Exact `QQbar` roots give stable algebraic branch identities.  Their numerical
centres do not retain the Arb radii currently discarded by `QQbar.n`, and the
quadrature error is checked by independent refinement rather than enclosed.
Consequently every result from this module deliberately has `rigorous=False`.

The branch points are joined by a deterministic noncrossing chain.  The usual
cut-and-gap cycles associated to that chain give a symplectic basis.  All
differentials on one edge are integrated together after a cosine substitution
removes the square-root endpoint singularities.  Relative square-root signs
are accepted only when the normalized period matrix is symmetric with
positive-definite imaginary part.

Complex conjugation is recovered as an integral involution on homology.  If
`Lambda` is the period lattice, the identity-component lattice is
`Lambda^+`, while the number of real components is computed exactly as

```text
#(Lambda^- / (1-conjugation)Lambda).
```

This avoids topology-specific root-count shortcuts and works uniformly for
real, mixed, odd-degree, and even-degree branch loci whenever the numerical
capability checks succeed.
"""

from __future__ import annotations

from itertools import permutations
from math import ceil
from typing import Any

import sagejs as sage
import sagejs.runtime as runtime
from mpmath import mp


__all__ = [
    "AbelJacobiResult",
    "HyperellipticPeriodCapabilityError",
    "HyperellipticPeriodResult",
    "abel_jacobi",
    "clear_period_cache",
    "period_cache_info",
    "real_period",
]


PERIOD_SCHEMA = "sagejs.hyperelliptic/real-period-v1"
_GEOMETRY_CACHE: dict[tuple[str, int], dict[str, Any]] = {}
_MODEL_PERIOD_CACHE: dict[tuple[Any, ...], dict[str, Any]] = {}
_ABEL_CACHE: dict[tuple[Any, ...], dict[str, Any]] = {}
_GAUSS_CACHE: dict[tuple[int, int], tuple[list[Any], list[Any]]] = {}
_CACHE_LIMIT = 24
_CACHE_STATS = {
    "geometry_hits": 0,
    "model_hits": 0,
    "abel_hits": 0,
    "computations": 0,
}


class HyperellipticPeriodCapabilityError(ArithmeticError):
    """A period computation left its explicitly supported envelope."""

    def __init__(
        self,
        code: str,
        message: str,
        diagnostics: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = str(code)
        self.diagnostics = {} if diagnostics is None else dict(diagnostics)

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema": PERIOD_SCHEMA + "/capability-error",
            "code": self.code,
            "message": str(self),
            "diagnostics": dict(self.diagnostics),
        }


def _exact_text(value: Any) -> str:
    numerator = getattr(value, "_numerator", None)
    denominator = getattr(value, "_denominator", None)
    if numerator is not None and denominator is not None:
        if int(denominator) == 1:
            return str(numerator)
        return str(numerator) + "/" + str(denominator)
    return str(value)


def _rational_parts(value: Any) -> tuple[int, int]:
    rational = sage.QQ(value)
    return (int(rational._numerator), int(rational._denominator))


def _mp_exact(value: Any) -> Any:
    numerator = getattr(value, "_numerator", None)
    denominator = getattr(value, "_denominator", None)
    if numerator is not None and denominator is not None:
        return mp.mpf(str(numerator)) / mp.mpf(str(denominator))
    return mp.mpf(str(value))


def _decimal_digits(bits: int) -> int:
    return max(18, int(ceil(bits * 0.3010299956639812)) + 8)


def _real_text(value: Any, bits: int) -> str:
    return str(mp.nstr(mp.re(value), _decimal_digits(bits), strip_zeros=False))


def _global(name: str) -> Any:
    value = runtime.reflect.get(runtime.global_object, name)
    if value is runtime.undefined:
        raise RuntimeError(name + " is not available in this runtime")
    return value


def _complex_pair(value: Any, bits: int) -> tuple[str, str]:
    return (_real_text(mp.re(value), bits), _real_text(mp.im(value), bits))


def _model_key(curve: Any) -> str:
    f_value, h_value = curve.hyperelliptic_polynomials()
    return (
        "g="
        + str(curve.genus())
        + ";f="
        + ",".join(_exact_text(value) for value in f_value.list())
        + ";h="
        + ",".join(_exact_text(value) for value in h_value.list())
    )


def _completed_model(curve: Any) -> tuple[Any, list[Any]]:
    base = curve.base_ring()
    if getattr(base, "_kind", None) != "QQ" and base is not sage.QQ:
        raise TypeError("real periods require a hyperelliptic curve over QQ")
    f_value, h_value = curve.hyperelliptic_polynomials()
    completed = h_value * h_value + 4 * f_value
    degree = int(completed.degree())
    genus = int(curve.genus())
    if degree not in (2 * genus + 1, 2 * genus + 2):
        raise HyperellipticPeriodCapabilityError(
            "unsupported_completed_degree",
            "the completed branch polynomial must have degree 2g+1 or 2g+2",
            {"genus": genus, "degree": degree},
        )
    if completed.gcd(completed.derivative()).degree() != 0:
        raise ValueError("the completed branch polynomial is not squarefree")
    return completed, list(completed.list())


def _compare_exact(left: Any, right: Any) -> int:
    if left < right:
        return -1
    if left > right:
        return 1
    return 0


def _compare_exact_roots(left: Any, right: Any) -> int:
    comparison = _compare_exact(left.real(), right.real())
    if comparison:
        return comparison
    return _compare_exact(left.imag(), right.imag())


def _sort_exact_roots(roots: list[Any]) -> list[Any]:
    answer: list[Any] = []
    for root in roots:
        position = len(answer)
        while position and _compare_exact_roots(root, answer[position - 1]) < 0:
            position -= 1
        answer.insert(position, root)
    return answer


def _approximate_root(root: Any, bits: int) -> Any:
    real_value = root.real().n(bits)
    imaginary_value = root.imag().n(bits)
    return mp.mpc(mp.mpf(str(real_value)), mp.mpf(str(imaginary_value)))


def _orientation(left: Any, right: Any, point: Any) -> Any:
    return mp.im((right - left) * mp.conj(point - left))


def _properly_intersect(a_value: Any, b_value: Any, c_value: Any, d_value: Any) -> bool:
    first = _orientation(a_value, b_value, c_value)
    second = _orientation(a_value, b_value, d_value)
    third = _orientation(c_value, d_value, a_value)
    fourth = _orientation(c_value, d_value, b_value)
    return first * second < 0 and third * fourth < 0


def _point_segment_distance(point: Any, left: Any, right: Any) -> Any:
    direction = right - left
    denominator = abs(direction) ** 2
    if denominator == 0:
        return abs(point - left)
    coordinate = mp.re((point - left) * mp.conj(direction)) / denominator
    if coordinate <= 0:
        return abs(point - left)
    if coordinate >= 1:
        return abs(point - right)
    return abs(point - (left + coordinate * direction))


def _path_quality(points: list[Any], order: tuple[int, ...]) -> tuple[Any, Any] | None:
    edge_count = len(order) - 1
    for first in range(edge_count):
        for second in range(first + 2, edge_count):
            if _properly_intersect(
                points[order[first]],
                points[order[first + 1]],
                points[order[second]],
                points[order[second + 1]],
            ):
                return None
    minimum_clearance = mp.inf
    total_length = mp.mpf(0)
    for edge in range(edge_count):
        left_index = order[edge]
        right_index = order[edge + 1]
        left = points[left_index]
        right = points[right_index]
        total_length += abs(right - left)
        for index, point in enumerate(points):
            if index in (left_index, right_index):
                continue
            clearance = _point_segment_distance(point, left, right)
            if clearance < minimum_clearance:
                minimum_clearance = clearance
    if minimum_clearance <= 0:
        return None
    return (minimum_clearance, total_length)


def _noncrossing_order(
    exact_roots: list[Any], points: list[Any]
) -> tuple[list[int], Any]:
    count = len(points)
    if all(root.is_real() for root in exact_roots):
        return (
            list(range(count)),
            min(abs(points[i + 1] - points[i]) for i in range(count - 1)),
        )

    # Fixing the first exact-lexicographic root removes reversal duplicates.
    # At degree at most eight this examines at most 7! deterministic paths.
    best_order: tuple[int, ...] | None = None
    best_clearance = mp.mpf(-1)
    best_length = mp.inf
    for tail in permutations(range(1, count)):
        order = (0,) + tail
        quality = _path_quality(points, order)
        if quality is None:
            continue
        clearance, length = quality
        if (
            clearance > best_clearance
            or (clearance == best_clearance and length < best_length)
            or (
                clearance == best_clearance
                and length == best_length
                and (best_order is None or order < best_order)
            )
        ):
            best_order = order
            best_clearance = clearance
            best_length = length
    if best_order is None:
        raise HyperellipticPeriodCapabilityError(
            "branch_chain_not_isolated",
            "no noncrossing straight branch chain was numerically isolated",
        )
    return (list(best_order), best_clearance)


def _branch_geometry(curve: Any, completed: Any, bits: int) -> dict[str, Any]:
    key = (_model_key(curve), int(bits))
    cached = _GEOMETRY_CACHE.get(key)
    if cached is not None:
        _CACHE_STATS["geometry_hits"] += 1
        return cached
    exact_roots = list(completed.roots(_global("QQbar"), multiplicities=False))
    degree = int(completed.degree())
    if len(exact_roots) != degree:
        raise ArithmeticError(
            "the completed polynomial did not yield every branch root"
        )
    exact_roots = _sort_exact_roots(exact_roots)
    points = [_approximate_root(root, bits) for root in exact_roots]
    order, clearance = _noncrossing_order(exact_roots, points)
    result = {
        "exact_roots": exact_roots,
        "points": points,
        "order": order,
        "ordered_points": [points[index] for index in order],
        "real_root_count": sum(1 for root in exact_roots if root.is_real()),
        "clearance": clearance,
    }
    if len(_GEOMETRY_CACHE) >= _CACHE_LIMIT:
        del _GEOMETRY_CACHE[next(iter(_GEOMETRY_CACHE))]
    _GEOMETRY_CACHE[key] = result
    return result


def _gauss_rule(order: int) -> tuple[list[Any], list[Any]]:
    key = (int(mp.prec), int(order))
    cached = _GAUSS_CACHE.get(key)
    if cached is not None:
        return cached
    nodes, weights = mp.gauss_quadrature(order, "legendre")
    result = (list(nodes), list(weights))
    if len(_GAUSS_CACHE) >= 16:
        del _GAUSS_CACHE[next(iter(_GAUSS_CACHE))]
    _GAUSS_CACHE[key] = result
    return result


def _canonical_edge_sign(values: list[Any]) -> list[Any]:
    for value in values:
        if abs(value) == 0:
            continue
        if abs(mp.re(value)) >= abs(mp.im(value)):
            return [-item for item in values] if mp.re(value) < 0 else values
        return [-item for item in values] if mp.im(value) < 0 else values
    return values


def _edge_integrals(
    roots: list[Any],
    leading: Any,
    edge: int,
    genus: int,
    panels: int,
    quadrature_order: int,
) -> list[Any]:
    left = roots[edge]
    right = roots[edge + 1]
    midpoint = (left + right) / 2
    half_edge = (right - left) / 2
    nodes, weights = _gauss_rule(quadrature_order)
    values = [mp.mpc(0) for _ in range(genus)]
    previous_root = None
    for panel in range(panels):
        lower = mp.pi * panel / panels
        upper = mp.pi * (panel + 1) / panels
        panel_midpoint = (lower + upper) / 2
        panel_half = (upper - lower) / 2
        for node, weight in zip(nodes, weights):
            theta = panel_midpoint + panel_half * node
            x_value = midpoint + half_edge * mp.cos(theta)
            residual = -leading
            for root_index, root in enumerate(roots):
                if root_index not in (edge, edge + 1):
                    residual *= x_value - root
            square_root = mp.sqrt(residual)
            if previous_root is not None and abs(square_root - previous_root) > abs(
                -square_root - previous_root
            ):
                square_root = -square_root
            previous_root = square_root
            power = mp.mpc(1)
            factor = panel_half * weight / square_root
            for differential in range(genus):
                values[differential] += factor * power
                power *= x_value
    return _canonical_edge_sign(values)


def _matrix_maximum(values: Any) -> Any:
    answer = mp.mpf(0)
    for row in range(values.rows):
        for column in range(values.cols):
            answer = max(answer, abs(values[row, column]))
    return answer


def _periods_from_edges(edges: list[list[Any]], genus: int) -> dict[str, Any]:
    best: dict[str, Any] | None = None
    # A simultaneous sign change is immaterial, so fix the first edge sign.
    for mask in range(1 << (2 * genus - 1)):
        signs = [1]
        for index in range(1, 2 * genus):
            signs.append(-1 if mask & (1 << (index - 1)) else 1)
        a_matrix = mp.matrix(genus, genus)
        b_matrix = mp.matrix(genus, genus)
        for column in range(genus):
            for row in range(genus):
                a_matrix[row, column] = 2 * signs[2 * column] * edges[2 * column][row]
                b_matrix[row, column] = 2 * sum(
                    signs[2 * item + 1] * edges[2 * item + 1][row]
                    for item in range(column, genus)
                )
        try:
            tau = a_matrix**-1 * b_matrix
        except ZeroDivisionError:
            continue
        symmetry_defect = max(
            abs(tau[row, column] - tau[column, row])
            for row in range(genus)
            for column in range(genus)
        )
        imaginary_symmetric = mp.matrix(
            [
                [
                    mp.im((tau[row, column] + tau[column, row]) / 2)
                    for column in range(genus)
                ]
                for row in range(genus)
            ]
        )
        eigenvalues = mp.eigsy(imaginary_symmetric, eigvals_only=True)
        minimum_eigenvalue = min(eigenvalues)
        if minimum_eigenvalue <= 0:
            continue
        score = symmetry_defect / max(mp.mpf(1), _matrix_maximum(tau))
        candidate = {
            "a": a_matrix,
            "b": b_matrix,
            "tau": tau,
            "signs": signs,
            "symmetry_defect": symmetry_defect,
            "symmetry_relative_defect": score,
            "minimum_eigenvalue": minimum_eigenvalue,
        }
        if best is None or score < best["symmetry_relative_defect"]:
            best = candidate
    if best is None:
        raise HyperellipticPeriodCapabilityError(
            "riemann_form_not_positive",
            "no square-root continuation produced a positive Riemann matrix",
        )
    period_matrix = mp.matrix(genus, 2 * genus)
    for row in range(genus):
        for column in range(genus):
            period_matrix[row, column] = best["a"][row, column]
            period_matrix[row, genus + column] = best["b"][row, column]
    best["period_matrix"] = period_matrix
    return best


def _integer_matrix_product(
    left: list[list[int]], right: list[list[int]]
) -> list[list[int]]:
    return [
        [
            sum(left[row][index] * right[index][column] for index in range(len(right)))
            for column in range(len(right[0]))
        ]
        for row in range(len(left))
    ]


def _conjugation_action(
    period_matrix: Any, genus: int, tolerance: Any
) -> dict[str, Any]:
    dimension = 2 * genus
    real_basis = mp.matrix(dimension, dimension)
    for column in range(dimension):
        for row in range(genus):
            real_basis[row, column] = mp.re(period_matrix[row, column])
            real_basis[genus + row, column] = mp.im(period_matrix[row, column])
    conjugation = mp.diag([1 for _ in range(genus)] + [-1 for _ in range(genus)])
    try:
        approximate = real_basis**-1 * conjugation * real_basis
    except ZeroDivisionError as error:
        raise HyperellipticPeriodCapabilityError(
            "period_lattice_rank_deficient",
            "the numerical period lattice does not have full real rank",
        ) from error
    integral = [
        [int(mp.nint(approximate[row, column])) for column in range(dimension)]
        for row in range(dimension)
    ]
    defect = max(
        abs(approximate[row, column] - integral[row][column])
        for row in range(dimension)
        for column in range(dimension)
    )
    if defect > tolerance:
        raise HyperellipticPeriodCapabilityError(
            "conjugation_not_integral",
            "complex conjugation was not isolated as an integral homology action",
            {"integrality_defect": str(defect), "tolerance": str(tolerance)},
        )
    identity = [
        [1 if row == column else 0 for column in range(dimension)]
        for row in range(dimension)
    ]
    if _integer_matrix_product(integral, integral) != identity:
        raise ArithmeticError("the recovered conjugation action is not an involution")
    intersection = [
        [
            1
            if row < genus and column == genus + row
            else -1
            if row >= genus and column == row - genus
            else 0
            for column in range(dimension)
        ]
        for row in range(dimension)
    ]
    transpose = [
        [integral[column][row] for column in range(dimension)]
        for row in range(dimension)
    ]
    transformed = _integer_matrix_product(
        _integer_matrix_product(transpose, intersection), integral
    )
    if transformed != [[-value for value in row] for row in intersection]:
        raise ArithmeticError("conjugation does not reverse the intersection form")
    return {"matrix": integral, "integrality_defect": defect}


def _integer_kernel(rows: list[list[int]]) -> list[list[int]]:
    matrix_value = _global("matrix")(sage.ZZ, rows)
    basis = matrix_value.right_kernel_matrix()
    return [
        [int(basis[row, column]) for column in range(basis.ncols())]
        for row in range(basis.nrows())
    ]


def _real_lattice_data(
    period_matrix: Any, action: list[list[int]], genus: int, tolerance: Any
) -> dict[str, Any]:
    dimension = 2 * genus
    fixed_operator = [
        [
            action[row][column] - (1 if row == column else 0)
            for column in range(dimension)
        ]
        for row in range(dimension)
    ]
    anti_operator = [
        [
            action[row][column] + (1 if row == column else 0)
            for column in range(dimension)
        ]
        for row in range(dimension)
    ]
    fixed_basis = _integer_kernel(fixed_operator)
    anti_basis = _integer_kernel(anti_operator)
    if len(fixed_basis) != genus or len(anti_basis) != genus:
        raise ArithmeticError("conjugation eigenspaces have unexpected ranks")

    anti_columns = (
        _global("matrix")(sage.ZZ, anti_basis).transpose().change_ring(sage.QQ)
    )
    difference = [
        [
            (1 if row == column else 0) - action[row][column]
            for column in range(dimension)
        ]
        for row in range(dimension)
    ]
    coordinates: list[list[int]] = [[0 for _ in range(dimension)] for _ in range(genus)]
    for column in range(dimension):
        target = _global("vector")(
            sage.QQ, [difference[row][column] for row in range(dimension)]
        )
        solution = anti_columns.solve_right(target)
        for row in range(genus):
            value = solution[row]
            numerator, denominator = _rational_parts(value)
            if denominator != 1:
                raise ArithmeticError(
                    "(1-conjugation)Lambda is not in the anti-invariant lattice"
                )
            coordinates[row][column] = numerator
    smith, _left, _right = _global("matrix")(sage.ZZ, coordinates).smith_form()
    component_count = 1
    for index in range(genus):
        diagonal = abs(int(smith[index, index]))
        if diagonal == 0:
            raise ArithmeticError("the real component quotient is not finite")
        component_count *= diagonal

    real_periods = mp.matrix(genus, genus)
    imaginary_defect = mp.mpf(0)
    for column, cycle in enumerate(fixed_basis):
        for row in range(genus):
            value = sum(
                period_matrix[row, index] * cycle[index] for index in range(dimension)
            )
            real_periods[row, column] = mp.re(value)
            imaginary_defect = max(imaginary_defect, abs(mp.im(value)))
    if imaginary_defect > tolerance:
        raise HyperellipticPeriodCapabilityError(
            "real_lattice_not_isolated",
            "the invariant homology periods were not numerically real",
            {"imaginary_defect": str(imaginary_defect), "tolerance": str(tolerance)},
        )
    identity_volume = abs(mp.det(real_periods))
    model_period = component_count * identity_volume
    if model_period <= 0:
        raise ArithmeticError("the model real period is not positive")
    return {
        "fixed_basis": fixed_basis,
        "anti_basis": anti_basis,
        "component_coordinates": coordinates,
        "component_count": component_count,
        "identity_volume": identity_volume,
        "model_period": model_period,
        "imaginary_defect": imaginary_defect,
    }


def _run_period_computation(
    curve: Any,
    completed: Any,
    coefficients: list[Any],
    bits: int,
    panels: int,
    quadrature_order: int,
) -> dict[str, Any]:
    genus = int(curve.genus())
    with mp.workprec(bits):
        geometry = _branch_geometry(curve, completed, bits)
        roots = geometry["ordered_points"]
        root_scale = max([mp.mpf(1)] + [abs(root) for root in roots])
        relative_clearance = geometry["clearance"] / root_scale
        effective_panels = panels
        effective_order = quadrature_order
        # A straight branch chain that passes near a third branch point has a
        # much narrower analytic strip after the cosine substitution.  Spend
        # the extra work here rather than allowing the first deliberately
        # coarse refinement to fail before refinement can say anything.  The
        # thresholds are deterministic, representation-neutral condition
        # estimates; every final result still has to pass the Riemann and
        # independent panel-refinement gates below.
        if relative_clearance < mp.mpf(1) / 1024:
            effective_panels *= 4
            effective_order = max(effective_order, 64)
        elif relative_clearance < mp.mpf(1) / 16:
            effective_panels *= 2
            effective_order = max(effective_order, 32)
        leading = _mp_exact(coefficients[-1])
        edges = [
            _edge_integrals(
                roots,
                leading,
                edge,
                genus,
                effective_panels,
                effective_order,
            )
            for edge in range(2 * genus)
        ]
        periods = _periods_from_edges(edges, genus)
        scale = max(mp.mpf(1), _matrix_maximum(periods["period_matrix"]))
        internal_tolerance = mp.power(2, -max(24, min(100, bits // 2))) * scale
        if periods["symmetry_relative_defect"] > internal_tolerance:
            raise HyperellipticPeriodCapabilityError(
                "riemann_relation_not_isolated",
                "the Riemann symmetry relation did not stabilize",
                {
                    "relative_defect": str(periods["symmetry_relative_defect"]),
                    "tolerance": str(internal_tolerance),
                },
            )
        action = _conjugation_action(
            periods["period_matrix"], genus, 128 * internal_tolerance
        )
        lattice = _real_lattice_data(
            periods["period_matrix"],
            action["matrix"],
            genus,
            128 * internal_tolerance,
        )
        return {
            "bits": bits,
            "panels": effective_panels,
            "quadrature_order": effective_order,
            "requested_panels": panels,
            "requested_quadrature_order": quadrature_order,
            "relative_branch_clearance": relative_clearance,
            "geometry": geometry,
            "periods": periods,
            "action": action,
            "lattice": lattice,
        }


def _maximum_matrix_difference(left: Any, right: Any) -> Any:
    return max(
        abs(left[row, column] - right[row, column])
        for row in range(left.rows)
        for column in range(left.cols)
    )


def _serialize_model_result(
    curve: Any,
    coefficients: list[Any],
    run: dict[str, Any],
    previous: dict[str, Any],
    requested_bits: int,
    difference: Any,
    tolerance: Any,
    refinement_runs: list[dict[str, Any]],
) -> dict[str, Any]:
    genus = int(curve.genus())
    bits = int(run["bits"])
    period_matrix = run["periods"]["period_matrix"]
    tau = run["periods"]["tau"]
    roots = run["geometry"]["points"]
    order = run["geometry"]["order"]
    return {
        "model_key": _model_key(curve),
        "genus": genus,
        "requested_precision_bits": requested_bits,
        "work_precision_bits": bits,
        "completed_coefficients": [_exact_text(value) for value in coefficients],
        "completed_degree": len(coefficients) - 1,
        "differential_basis": [
            "x^" + str(index) + " dx/(2y+h)" for index in range(genus)
        ],
        "branch_roots": [_complex_pair(root, requested_bits) for root in roots],
        "branch_order": list(order),
        "ordered_branch_roots": [
            _complex_pair(roots[index], requested_bits) for index in order
        ],
        "real_root_count": int(run["geometry"]["real_root_count"]),
        "branch_chain_clearance": _real_text(
            run["geometry"]["clearance"], requested_bits
        ),
        "root_isolation_status": "exact_QQbar_identity_numerical_centres_without_exported_radii",
        "cycle_basis": {
            "kind": "noncrossing-chain-cut-gap-symplectic-basis",
            "a_edges": [2 * index for index in range(genus)],
            "b_gap_sums": [
                [2 * item + 1 for item in range(index, genus)] for index in range(genus)
            ],
            "edge_signs": list(run["periods"]["signs"]),
        },
        "period_matrix": [
            [
                _complex_pair(period_matrix[row, column], requested_bits)
                for column in range(2 * genus)
            ]
            for row in range(genus)
        ],
        "coarse_period_matrix": [
            [
                _complex_pair(
                    previous["periods"]["period_matrix"][row, column], requested_bits
                )
                for column in range(2 * genus)
            ]
            for row in range(genus)
        ],
        "siegel_matrix": [
            [_complex_pair(tau[row, column], requested_bits) for column in range(genus)]
            for row in range(genus)
        ],
        "riemann_symmetry_defect": _real_text(
            run["periods"]["symmetry_defect"], requested_bits
        ),
        "riemann_symmetry_relative_defect": _real_text(
            run["periods"]["symmetry_relative_defect"], requested_bits
        ),
        "riemann_minimum_eigenvalue": _real_text(
            run["periods"]["minimum_eigenvalue"], requested_bits
        ),
        "conjugation_matrix": [list(row) for row in run["action"]["matrix"]],
        "conjugation_integrality_defect": _real_text(
            run["action"]["integrality_defect"], requested_bits
        ),
        "real_invariant_lattice_basis": [
            list(row) for row in run["lattice"]["fixed_basis"]
        ],
        "real_anti_invariant_lattice_basis": [
            list(row) for row in run["lattice"]["anti_basis"]
        ],
        "real_component_coordinates": [
            list(row) for row in run["lattice"]["component_coordinates"]
        ],
        "real_components": int(run["lattice"]["component_count"]),
        "identity_component_volume": _real_text(
            run["lattice"]["identity_volume"], requested_bits
        ),
        "model_real_period": _real_text(run["lattice"]["model_period"], requested_bits),
        "real_lattice_imaginary_defect": _real_text(
            run["lattice"]["imaginary_defect"], requested_bits
        ),
        "refinement_difference": _real_text(difference, requested_bits),
        "refinement_tolerance": _real_text(tolerance, requested_bits),
        "refinement_runs": refinement_runs,
        "refinement_stable": True,
        "quadrature_order": int(refinement_runs[-1]["quadrature_order"]),
        "quadrature_panels": int(run["panels"]),
        "rigorous": False,
        "arithmetic_balls_rigorous": False,
        "analytic_error_status": "estimated_by_precision_and_quadrature_refinement",
    }


def _model_period_data(
    curve: Any,
    requested_bits: int,
    max_refinements: int,
    quadrature_order: int,
    initial_panels: int,
    use_cache: bool,
) -> tuple[dict[str, Any], bool]:
    completed, coefficients = _completed_model(curve)
    cache_key = (
        _model_key(curve),
        requested_bits,
        max_refinements,
        quadrature_order,
        initial_panels,
    )
    if use_cache and cache_key in _MODEL_PERIOD_CACHE:
        _CACHE_STATS["model_hits"] += 1
        return (_MODEL_PERIOD_CACHE[cache_key], True)
    _CACHE_STATS["computations"] += 1
    target_tolerance = mp.power(2, -max(20, min(80, requested_bits // 2)))
    previous = None
    previous_order = None
    refinement_runs: list[dict[str, Any]] = []
    last_difference = mp.inf
    last_tolerance = target_tolerance
    for refinement in range(max_refinements):
        work_bits = requested_bits + 32 * (refinement + 1)
        panels = initial_panels * (2**refinement)
        run = _run_period_computation(
            curve,
            completed,
            coefficients,
            work_bits,
            panels,
            quadrature_order,
        )
        order = tuple(run["geometry"]["order"])
        refinement_runs.append(
            {
                "work_precision_bits": work_bits,
                "quadrature_order": int(run["quadrature_order"]),
                "quadrature_panels": int(run["panels"]),
                "requested_quadrature_order": quadrature_order,
                "requested_quadrature_panels": panels,
                "relative_branch_clearance": _real_text(
                    run["relative_branch_clearance"], requested_bits
                ),
                "branch_order": list(order),
                "model_real_period": _real_text(
                    run["lattice"]["model_period"], requested_bits
                ),
            }
        )
        if previous is not None and order == previous_order:
            period_difference = _maximum_matrix_difference(
                run["periods"]["period_matrix"],
                previous["periods"]["period_matrix"],
            )
            volume_difference = abs(
                run["lattice"]["model_period"] - previous["lattice"]["model_period"]
            )
            scale = max(
                mp.mpf(1),
                _matrix_maximum(run["periods"]["period_matrix"]),
                abs(run["lattice"]["model_period"]),
            )
            last_difference = max(period_difference, volume_difference)
            last_tolerance = target_tolerance * scale
            if last_difference <= last_tolerance:
                result = _serialize_model_result(
                    curve,
                    coefficients,
                    run,
                    previous,
                    requested_bits,
                    last_difference,
                    last_tolerance,
                    refinement_runs,
                )
                if use_cache:
                    if len(_MODEL_PERIOD_CACHE) >= _CACHE_LIMIT:
                        del _MODEL_PERIOD_CACHE[next(iter(_MODEL_PERIOD_CACHE))]
                    _MODEL_PERIOD_CACHE[cache_key] = result
                return (result, False)
        previous = run
        previous_order = order
    raise HyperellipticPeriodCapabilityError(
        "refinement_not_stable",
        "period integration did not stabilize within the refinement limit",
        {
            "requested_precision_bits": requested_bits,
            "max_refinements": max_refinements,
            "last_difference": str(last_difference),
            "last_tolerance": str(last_tolerance),
            "runs": refinement_runs,
        },
    )


def _split_points(curve: Any, value: Any) -> list[Any]:
    """Interpret a point or split divisor as a sum of affine points."""
    if hasattr(value, "is_at_infinity") and hasattr(value, "parent"):
        points = [value]
    elif isinstance(value, dict) and "points" in value:
        points = list(value["points"])
    else:
        try:
            points = list(value)
        except TypeError as error:
            raise TypeError(
                "Abel--Jacobi input must be a curve point or an iterable of split support points"
            ) from error
    for point in points:
        if not hasattr(point, "parent") or point.parent() is not curve:
            raise TypeError("every Abel--Jacobi support point must belong to the curve")
    return points


def _ray_clearance(
    target: Any, direction: Any, roots: list[Any], omitted: int | None
) -> Any:
    answer = mp.inf
    for index, root in enumerate(roots):
        if omitted is not None and index == omitted:
            continue
        displacement = root - target
        coordinate = mp.re(displacement * mp.conj(direction))
        distance = (
            abs(displacement - coordinate * direction)
            if coordinate >= 0
            else abs(displacement)
        )
        answer = min(answer, distance)
    return answer


def _choose_infinity_ray(target: Any, roots: list[Any]) -> tuple[int, Any, Any]:
    omitted = None
    separation = mp.inf
    for index, root in enumerate(roots):
        distance = abs(root - target)
        if distance < separation:
            separation = distance
            omitted = index
    scale = max([mp.mpf(1), abs(target)] + [abs(root) for root in roots])
    if separation > mp.power(2, -mp.prec // 3) * scale:
        omitted = None
    best_index = -1
    best_direction = None
    best_clearance = mp.mpf(-1)
    # Offset the 16 equally spaced rays by pi/32 so no candidate is forced to
    # be the real axis on a real model.
    for index in range(16):
        angle = mp.pi * (2 * index + 1) / 32
        direction = mp.expj(angle)
        clearance = _ray_clearance(target, direction, roots, omitted)
        if clearance > best_clearance:
            best_index = index
            best_direction = direction
            best_clearance = clearance
    if best_direction is None or best_clearance <= 0:
        raise HyperellipticPeriodCapabilityError(
            "abel_jacobi_path_not_isolated",
            "no branch-free path from the point to infinity was isolated",
        )
    return (best_index, best_direction, best_clearance)


def _evaluate_mp_polynomial(coefficients: list[Any], value: Any) -> Any:
    answer = mp.mpc(0)
    for coefficient in reversed(coefficients):
        answer = answer * value + _mp_exact(coefficient)
    return answer


def _point_integrals_to_infinity(
    point: Any,
    completed_coefficients: list[Any],
    h_coefficients: list[Any],
    roots: list[Any],
    genus: int,
    panels: int,
    quadrature_order: int,
) -> tuple[list[Any], int, Any]:
    if point.is_at_infinity():
        return ([mp.mpc(0) for _ in range(genus)], -1, mp.inf)
    x_exact, y_exact = point.xy()
    target = mp.mpc(_mp_exact(x_exact), 0)
    direction_index, direction, clearance = _choose_infinity_ray(target, roots)
    desired_square_root = 2 * _mp_exact(y_exact) + _evaluate_mp_polynomial(
        h_coefficients, target
    )
    nodes, weights = _gauss_rule(quadrature_order)
    values = [mp.mpc(0) for _ in range(genus)]
    previous_root = None
    initial_sign_fixed = False
    for panel in range(panels):
        lower = mp.pi * panel / (2 * panels)
        upper = mp.pi * (panel + 1) / (2 * panels)
        midpoint = (lower + upper) / 2
        half = (upper - lower) / 2
        for node, weight in zip(nodes, weights):
            theta = midpoint + half * node
            tangent = mp.tan(theta)
            secant_squared = 1 + tangent * tangent
            x_value = target + direction * tangent * tangent
            square_root = mp.sqrt(
                _evaluate_mp_polynomial(completed_coefficients, x_value)
            )
            if not initial_sign_fixed and abs(desired_square_root) > 0:
                if abs(square_root - desired_square_root) > abs(
                    -square_root - desired_square_root
                ):
                    square_root = -square_root
                initial_sign_fixed = True
            elif previous_root is not None and abs(square_root - previous_root) > abs(
                -square_root - previous_root
            ):
                square_root = -square_root
            previous_root = square_root
            factor = (
                half * weight * 2 * direction * tangent * secant_squared / square_root
            )
            power = mp.mpc(1)
            for differential in range(genus):
                values[differential] += factor * power
                power *= x_value
    # The parameter runs from the point to infinity; Abel--Jacobi uses the
    # requested infinity-to-point orientation.
    return ([-value for value in values], direction_index, clearance)


def _abel_run(
    curve: Any,
    points: list[Any],
    bits: int,
    panels: int,
    quadrature_order: int,
) -> dict[str, Any]:
    completed, completed_coefficients = _completed_model(curve)
    f_value, h_value = curve.hyperelliptic_polynomials()
    del f_value
    with mp.workprec(bits):
        geometry = _branch_geometry(curve, completed, bits)
        roots = geometry["points"]
        total = [mp.mpc(0) for _ in range(curve.genus())]
        directions = []
        clearances = []
        for point in points:
            contribution, direction, clearance = _point_integrals_to_infinity(
                point,
                completed_coefficients,
                list(h_value.list()),
                roots,
                int(curve.genus()),
                panels,
                quadrature_order,
            )
            for index in range(curve.genus()):
                total[index] += contribution[index]
            directions.append(direction)
            clearances.append(clearance)
        return {
            "bits": bits,
            "panels": panels,
            "branch_order": tuple(geometry["order"]),
            "vector": total,
            "directions": directions,
            "clearances": clearances,
        }


def _point_key(point: Any) -> str:
    if point.is_at_infinity():
        return "infinity"
    x_value, y_value = point.xy()
    return "(" + _exact_text(x_value) + "," + _exact_text(y_value) + ")"


def _abel_data(
    curve: Any,
    points: list[Any],
    prec: int,
    max_refinements: int,
    quadrature_order: int,
    initial_panels: int,
    use_cache: bool,
) -> tuple[dict[str, Any], bool]:
    key = (
        _model_key(curve),
        tuple(_point_key(point) for point in points),
        prec,
        max_refinements,
        quadrature_order,
        initial_panels,
    )
    if use_cache and key in _ABEL_CACHE:
        _CACHE_STATS["abel_hits"] += 1
        return (_ABEL_CACHE[key], True)
    target_tolerance = mp.power(2, -max(20, min(80, prec // 2)))
    previous = None
    runs = []
    last_difference = mp.inf
    last_tolerance = target_tolerance
    for refinement in range(max_refinements):
        bits = prec + 32 * (refinement + 1)
        panels = initial_panels * (2**refinement)
        run = _abel_run(curve, points, bits, panels, quadrature_order)
        runs.append(
            {
                "work_precision_bits": bits,
                "quadrature_order": quadrature_order,
                "quadrature_panels": panels,
                "branch_order": list(run["branch_order"]),
                "ray_directions": list(run["directions"]),
            }
        )
        if (
            previous is not None
            and run["branch_order"] == previous["branch_order"]
            and run["directions"] == previous["directions"]
        ):
            last_difference = max(
                abs(run["vector"][index] - previous["vector"][index])
                for index in range(curve.genus())
            )
            scale = max([mp.mpf(1)] + [abs(value) for value in run["vector"]])
            last_tolerance = target_tolerance * scale
            if last_difference <= last_tolerance:
                result = {
                    "model_key": _model_key(curve),
                    "genus": int(curve.genus()),
                    "precision_bits": prec,
                    "work_precision_bits": bits,
                    "support": [_point_key(point) for point in points],
                    "basepoint": "infinity",
                    "vector": [_complex_pair(value, prec) for value in run["vector"]],
                    "branch_order": list(run["branch_order"]),
                    "ray_directions": list(run["directions"]),
                    "ray_clearances": [
                        "infinity"
                        if clearance == mp.inf
                        else _real_text(clearance, prec)
                        for clearance in run["clearances"]
                    ],
                    "refinement_difference": _real_text(last_difference, prec),
                    "refinement_tolerance": _real_text(last_tolerance, prec),
                    "refinement_runs": runs,
                    "refinement_stable": True,
                    "rigorous": False,
                    "analytic_error_status": "estimated_by_precision_and_quadrature_refinement",
                }
                if use_cache:
                    if len(_ABEL_CACHE) >= _CACHE_LIMIT:
                        del _ABEL_CACHE[next(iter(_ABEL_CACHE))]
                    _ABEL_CACHE[key] = result
                return (result, False)
        previous = run
    raise HyperellipticPeriodCapabilityError(
        "abel_jacobi_refinement_not_stable",
        "Abel--Jacobi integration did not stabilize within the refinement limit",
        {
            "last_difference": str(last_difference),
            "last_tolerance": str(last_tolerance),
            "runs": runs,
        },
    )


def _normalization_data(
    normalization: str,
    neron_differential_determinant: Any,
    neron_lattice_index: Any,
    provenance: Any,
) -> dict[str, Any]:
    if normalization not in ("model", "neron"):
        raise ValueError("normalization must be 'model' or 'neron'")
    if neron_differential_determinant is not None and neron_lattice_index is not None:
        raise ValueError(
            "specify either neron_differential_determinant or neron_lattice_index, not both"
        )
    determinant = None
    lattice_index = None
    if neron_lattice_index is not None:
        lattice_index = int(neron_lattice_index)
        if lattice_index <= 0 or sage.ZZ(neron_lattice_index) != neron_lattice_index:
            raise ValueError(
                "the Neron differential-lattice index must be a positive integer"
            )
        determinant = sage.QQ(1) / sage.QQ(lattice_index)
    elif neron_differential_determinant is not None:
        determinant = sage.QQ(neron_differential_determinant)
        if determinant <= 0:
            raise ValueError("the Neron differential determinant must be positive")
    if determinant is not None and provenance is None:
        raise ValueError("a supplied Neron normalization requires provenance")
    if normalization == "neron" and determinant is None:
        raise HyperellipticPeriodCapabilityError(
            "neron_normalization_unavailable",
            "a Neron-normalized period requires a supplied or certified differential determinant",
            {
                "required_convention": "eta_Neron = q*eta_model and Omega_Neron=abs(q)*Omega_model"
            },
        )
    determinant_parts = None if determinant is None else _rational_parts(determinant)
    return {
        "requested": normalization,
        "status": (
            "model_normalized" if determinant is None else "neron_normalized_supplied"
        ),
        "determinant_parts": determinant_parts,
        "lattice_index": lattice_index,
        "provenance": provenance,
    }


class AbelJacobiResult:
    """A chosen refinement-stable lift in `C^g` of an Abel--Jacobi image."""

    def __init__(
        self,
        curve: Any,
        data: dict[str, Any],
        period_result: HyperellipticPeriodResult,
        cache_hit: bool,
    ) -> None:
        self._curve = curve
        self._data = dict(data)
        self.period_result = period_result
        self.precision_bits = int(data["precision_bits"])
        self.genus = int(data["genus"])
        self.cache_hit = bool(cache_hit)
        self.rigorous = False

    def __repr__(self) -> str:
        return (
            "Abel--Jacobi lift "
            + repr(self.vector())
            + " (infinity basepoint, refinement-stable, non-rigorous)"
        )

    def vector_pairs(self) -> tuple[tuple[str, str], ...]:
        return tuple(tuple(value) for value in self._data["vector"])

    def vector(self) -> Any:
        """Return the chosen lift in `ComplexField(precision_bits)^g`."""
        field = _global("ComplexField")(self.precision_bits)
        return _global("vector")(
            field,
            [field(real, imaginary) for real, imaginary in self.vector_pairs()],
        )

    def period_matrix(self) -> Any:
        return self.period_result.period_matrix()

    def verify(self) -> dict[str, Any]:
        stable = float(self._data["refinement_difference"]) <= float(
            self._data["refinement_tolerance"]
        )
        compatible = (
            self._data["model_key"] == self.period_result._model_data["model_key"]
            and self.genus == self.period_result.genus
        )
        return {
            "model_compatible": compatible,
            "refinement_stable": stable,
            "rigorous": False,
            "verified": compatible and stable,
        }

    def diagnostics(self) -> dict[str, Any]:
        return {
            "support": list(self._data["support"]),
            "basepoint": "infinity",
            "branch_order": list(self._data["branch_order"]),
            "ray_directions": list(self._data["ray_directions"]),
            "ray_clearances": list(self._data["ray_clearances"]),
            "refinement_difference": self._data["refinement_difference"],
            "refinement_tolerance": self._data["refinement_tolerance"],
            "refinement_runs": list(self._data["refinement_runs"]),
            "analytic_error_status": self._data["analytic_error_status"],
            "cache_hit": self.cache_hit,
            "rigorous": False,
        }

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema": PERIOD_SCHEMA + "/abel-jacobi-v1",
            **dict(self._data),
            "period_model_key": self.period_result._model_data["model_key"],
            "cache_hit": self.cache_hit,
        }


class HyperellipticPeriodResult:
    """A refinement-stable model period and optional supplied Neron scaling."""

    def __init__(
        self,
        curve: Any,
        model_data: dict[str, Any],
        normalization_data: dict[str, Any],
        cache_hit: bool,
    ) -> None:
        self._curve = curve
        self._model_data = dict(model_data)
        self._normalization = dict(normalization_data)
        self.cache_hit = bool(cache_hit)
        self.rigorous = False
        self.arithmetic_balls_rigorous = False
        self.precision_bits = int(model_data["requested_precision_bits"])
        self.genus = int(model_data["genus"])
        self.normalization_status = str(normalization_data["status"])

    def __repr__(self) -> str:
        value = self.value()
        return (
            "Hyperelliptic real period "
            + str(value)
            + " ("
            + self._normalization["requested"]
            + ", refinement-stable, non-rigorous)"
        )

    def model_period(self) -> Any:
        """Return the real period for the stated model differential basis."""
        return _global("RealField")(self.precision_bits)(
            self._model_data["model_real_period"]
        )

    def neron_period(self) -> Any:
        """Return the Neron period, requiring an explicit exact normalization."""
        determinant = self._normalization["determinant_parts"]
        if determinant is None:
            raise HyperellipticPeriodCapabilityError(
                "neron_normalization_unavailable",
                "this result has no certified or supplied Neron normalization",
            )
        numerator, denominator = determinant
        field = _global("RealField")(self.precision_bits)
        return self.model_period() * field(numerator) / field(denominator)

    def value(self) -> Any:
        """Return the period in the requested model or Neron normalization."""
        if self._normalization["requested"] == "neron":
            return self.neron_period()
        return self.model_period()

    def period_matrix_pairs(self) -> tuple[tuple[tuple[str, str], ...], ...]:
        """Return immutable `(real, imaginary)` decimal pairs."""
        return tuple(
            tuple(tuple(value) for value in row)
            for row in self._model_data["period_matrix"]
        )

    def period_matrix(self) -> Any:
        """Return the `g x 2g` matrix in `ComplexField(precision_bits)`."""
        field = _global("ComplexField")(self.precision_bits)
        return _global("matrix")(
            field,
            self.genus,
            2 * self.genus,
            [
                field(real, imaginary)
                for row in self.period_matrix_pairs()
                for real, imaginary in row
            ],
        )

    def siegel_matrix(self) -> Any:
        """Return `A^-1 B` in the recorded symplectic basis."""
        field = _global("ComplexField")(self.precision_bits)
        return _global("matrix")(
            field,
            self.genus,
            self.genus,
            [
                field(real, imaginary)
                for row in self._model_data["siegel_matrix"]
                for real, imaginary in row
            ],
        )

    normalized_period_matrix = siegel_matrix

    def siegel_matrix_pairs(self) -> tuple[tuple[tuple[str, str], ...], ...]:
        """Return immutable decimal pairs for the normalized matrix `A^-1 B`."""
        return tuple(
            tuple(tuple(value) for value in row)
            for row in self._model_data["siegel_matrix"]
        )

    normalized_period_matrix_pairs = siegel_matrix_pairs

    def abel_jacobi(
        self,
        point_or_split_mumford: Any,
        *,
        basepoint: str = "infinity",
        prec: int | None = None,
        max_refinements: int = 3,
        quadrature_order: int = 16,
        initial_panels: int = 4,
        use_cache: bool = True,
    ) -> AbelJacobiResult:
        """Return a chosen Abel--Jacobi lift using this period result."""
        return abel_jacobi(
            self._curve,
            point_or_split_mumford,
            period_result=self,
            basepoint=basepoint,
            prec=self.precision_bits if prec is None else prec,
            max_refinements=max_refinements,
            quadrature_order=quadrature_order,
            initial_panels=initial_panels,
            use_cache=use_cache,
        )

    def real_components(self) -> int:
        return int(self._model_data["real_components"])

    def verify(self) -> dict[str, Any]:
        """Replay exact structural checks and report numerical status."""
        action = self._model_data["conjugation_matrix"]
        dimension = 2 * self.genus
        identity = [
            [1 if row == column else 0 for column in range(dimension)]
            for row in range(dimension)
        ]
        involution = _integer_matrix_product(action, action) == identity
        refinement = float(self._model_data["refinement_difference"]) <= float(
            self._model_data["refinement_tolerance"]
        )
        riemann = float(self._model_data["riemann_minimum_eigenvalue"]) > 0 and float(
            self._model_data["riemann_symmetry_relative_defect"]
        ) <= 128 * float(self._model_data["refinement_tolerance"])
        return {
            "exact_conjugation_involution": involution,
            "positive_real_components": self.real_components() > 0,
            "riemann_checks": riemann,
            "refinement_stable": refinement,
            "rigorous": False,
            "verified": involution and riemann and refinement,
        }

    def diagnostics(self) -> dict[str, Any]:
        return {
            "root_isolation_status": self._model_data["root_isolation_status"],
            "branch_chain_clearance": self._model_data["branch_chain_clearance"],
            "riemann_symmetry_relative_defect": self._model_data[
                "riemann_symmetry_relative_defect"
            ],
            "riemann_minimum_eigenvalue": self._model_data[
                "riemann_minimum_eigenvalue"
            ],
            "conjugation_integrality_defect": self._model_data[
                "conjugation_integrality_defect"
            ],
            "refinement_difference": self._model_data["refinement_difference"],
            "refinement_tolerance": self._model_data["refinement_tolerance"],
            "refinement_runs": list(self._model_data["refinement_runs"]),
            "refinement_stable": bool(self._model_data["refinement_stable"]),
            "analytic_error_status": self._model_data["analytic_error_status"],
            "cache_hit": self.cache_hit,
            "rigorous": False,
        }

    def to_dict(self) -> dict[str, Any]:
        model = dict(self._model_data)
        determinant = self._normalization["determinant_parts"]
        neron_period = None
        if determinant is not None:
            neron_period = str(self.neron_period())
        return {
            "schema": PERIOD_SCHEMA,
            **model,
            "normalization": {
                "requested": self._normalization["requested"],
                "status": self.normalization_status,
                "model_top_differential": "wedge_(i=0)^(g-1) x^i dx/(2y+h)",
                "neron_differential_determinant": (
                    None
                    if determinant is None
                    else {
                        "numerator": str(determinant[0]),
                        "denominator": str(determinant[1]),
                        "meaning": "eta_Neron=q*eta_model; Omega_Neron=abs(q)*Omega_model",
                    }
                ),
                "neron_lattice_index": self._normalization["lattice_index"],
                "provenance": self._normalization["provenance"],
            },
            "neron_real_period": neron_period,
            "selected_real_period": str(self.value()),
            "cache_hit": self.cache_hit,
        }


def real_period(
    curve: Any,
    *,
    prec: int = 128,
    normalization: str = "model",
    neron_differential_determinant: Any = None,
    neron_lattice_index: Any = None,
    provenance: Any = None,
    max_refinements: int = 3,
    quadrature_order: int = 16,
    initial_panels: int = 4,
    use_cache: bool = True,
) -> HyperellipticPeriodResult:
    """Compute a refinement-stable genus-2/3 real period.

    `neron_differential_determinant=q` means exactly
    `eta_Neron=q*eta_model`; the returned Neron period is therefore
    `abs(q)` times the model period.  Alternatively,
    `neron_lattice_index=m` means the model differentials form an index-`m`
    sublattice of the supplied Neron differential lattice, so `q=1/m`.

    Neither numerical branch centres nor quadrature errors are rigorous
    enclosures in the current implementation.  Precision/panel refinement,
    Riemann relations, positivity, integral conjugation, and real-lattice
    checks are all mandatory capability gates, but the result remains
    `rigorous=False`.
    """
    requested_bits = int(prec)
    if requested_bits < 32 or requested_bits > 1024:
        raise ValueError("period precision must be between 32 and 1024 bits")
    max_refinements = int(max_refinements)
    if max_refinements < 2 or max_refinements > 6:
        raise ValueError("max_refinements must be between 2 and 6")
    quadrature_order = int(quadrature_order)
    if quadrature_order < 8 or quadrature_order > 64:
        raise ValueError("quadrature_order must be between 8 and 64")
    initial_panels = int(initial_panels)
    if initial_panels < 1 or initial_panels > 64:
        raise ValueError("initial_panels must be between 1 and 64")
    genus = int(curve.genus())
    if genus not in (2, 3):
        raise NotImplementedError("real periods are implemented only in genus 2 and 3")
    normalization_data = _normalization_data(
        str(normalization),
        neron_differential_determinant,
        neron_lattice_index,
        provenance,
    )
    model_data, cache_hit = _model_period_data(
        curve,
        requested_bits,
        max_refinements,
        quadrature_order,
        initial_panels,
        bool(use_cache),
    )
    return HyperellipticPeriodResult(curve, model_data, normalization_data, cache_hit)


def abel_jacobi(
    curve: Any,
    point_or_split_mumford: Any,
    *,
    period_result: HyperellipticPeriodResult | None = None,
    basepoint: str = "infinity",
    prec: int = 128,
    max_refinements: int = 3,
    quadrature_order: int = 16,
    initial_panels: int = 4,
    use_cache: bool = True,
) -> AbelJacobiResult:
    """Return a chosen Abel--Jacobi lift for a point or split divisor.

    The current certified capability boundary is an odd-degree model over
    `QQ`, whose unique rational point at infinity is the basepoint.  An
    iterable is interpreted as the divisor sum `sum(P_i-infinity)`; a mapping
    with a `points` entry is accepted as an explicit split-Mumford adapter.
    The lift is not reduced modulo the period lattice, which is intentional:
    archimedean Green functions combine it with the `Im(tau)^-1` quadratic
    term to obtain a lattice-invariant value.
    """
    if basepoint != "infinity":
        raise HyperellipticPeriodCapabilityError(
            "unsupported_abel_jacobi_basepoint",
            "the initial Abel--Jacobi envelope requires the unique odd-degree point at infinity",
        )
    completed, _coefficients = _completed_model(curve)
    if int(completed.degree()) != 2 * int(curve.genus()) + 1:
        raise HyperellipticPeriodCapabilityError(
            "ambiguous_infinity_basepoint",
            "even-degree models have two geometric points at infinity; supply a future explicit basepoint implementation",
        )
    requested_bits = int(prec)
    if requested_bits < 32 or requested_bits > 1024:
        raise ValueError("Abel--Jacobi precision must be between 32 and 1024 bits")
    max_refinements = int(max_refinements)
    quadrature_order = int(quadrature_order)
    initial_panels = int(initial_panels)
    if max_refinements < 2 or max_refinements > 6:
        raise ValueError("max_refinements must be between 2 and 6")
    if quadrature_order < 8 or quadrature_order > 64:
        raise ValueError("quadrature_order must be between 8 and 64")
    if initial_panels < 1 or initial_panels > 64:
        raise ValueError("initial_panels must be between 1 and 64")
    if period_result is None:
        period_result = real_period(
            curve,
            prec=requested_bits,
            max_refinements=max_refinements,
            quadrature_order=quadrature_order,
            initial_panels=initial_panels,
            use_cache=use_cache,
        )
    elif period_result._curve is not curve or period_result._model_data[
        "model_key"
    ] != _model_key(curve):
        raise ValueError("the supplied period result belongs to a different curve")
    points = _split_points(curve, point_or_split_mumford)
    data, cache_hit = _abel_data(
        curve,
        points,
        requested_bits,
        max_refinements,
        quadrature_order,
        initial_panels,
        bool(use_cache),
    )
    return AbelJacobiResult(curve, data, period_result, cache_hit)


def clear_period_cache() -> None:
    """Clear branch geometry and completed model-period caches."""
    _GEOMETRY_CACHE.clear()
    _MODEL_PERIOD_CACHE.clear()
    _ABEL_CACHE.clear()
    _GAUSS_CACHE.clear()
    for key in _CACHE_STATS:
        _CACHE_STATS[key] = 0


def period_cache_info() -> dict[str, int]:
    """Return deterministic cache sizes and hit/computation counters."""
    return {
        "geometry_entries": len(_GEOMETRY_CACHE),
        "model_entries": len(_MODEL_PERIOD_CACHE),
        "abel_entries": len(_ABEL_CACHE),
        "gauss_rule_entries": len(_GAUSS_CACHE),
        "geometry_hits": int(_CACHE_STATS["geometry_hits"]),
        "model_hits": int(_CACHE_STATS["model_hits"]),
        "abel_hits": int(_CACHE_STATS["abel_hits"]),
        "computations": int(_CACHE_STATS["computations"]),
    }
