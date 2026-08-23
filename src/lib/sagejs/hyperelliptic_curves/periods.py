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

import json
from itertools import permutations
from math import ceil, cos, isfinite, pi, sqrt
from typing import Any

import sagejs as sage
import sagejs.runtime as runtime
from mpmath import mp
from sagejs.native import (
    Float64Buffer,
    is_compiled,
    kernel_float64_buffer,
    kernel_float64_zeros,
    native,
    uint64,
)

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
_TOPOLOGY_CACHE: dict[str, dict[str, Any]] = {}
_GEOMETRY_CACHE: dict[tuple[str, int], dict[str, Any]] = {}
_MODEL_PERIOD_CACHE: dict[tuple[Any, ...], Any] = {}
_ABEL_CACHE: dict[tuple[Any, ...], dict[str, Any]] = {}
_GAUSS_CACHE: dict[tuple[int, int], tuple[list[Any], list[Any]]] = {}
_FLOAT64_GAUSS_CACHE: dict[int, tuple[list[float], list[float]]] = {}
_FLOAT64_SAMPLE_CACHE: dict[tuple[int, int], list[float]] = {}
_CACHE_LIMIT = 24
_CACHE_STATS = {
    "topology_hits": 0,
    "topology_replans": 0,
    "angular_path_hits": 0,
    "exhaustive_path_fallbacks": 0,
    "geometry_hits": 0,
    "model_hits": 0,
    "abel_hits": 0,
    "computations": 0,
    "float64_quadratures": 0,
    "float64_fallbacks": 0,
    "arb_quadratures": 0,
    "arb_fallbacks": 0,
    "float64_sign_selections": 0,
    "sign_selection_fallbacks": 0,
}


def _clone_data(value: Any) -> Any:
    """Deep-copy the JSON-like records crossing the public/cache boundary."""
    if isinstance(value, dict):
        return {str(key): _clone_data(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_clone_data(item) for item in value]
    if isinstance(value, tuple):
        return tuple(_clone_data(item) for item in value)
    return value


def _sealed_payload(value: Any) -> str:
    """Freeze one JSON-like result tree into an immutable canonical string."""
    return json.dumps(
        _clone_data(value), sort_keys=True, separators=(",", ":"), ensure_ascii=True
    )


def _payload_data(value: str) -> dict[str, Any]:
    """Return a detached mutable view without exposing sealed result state."""
    answer = json.loads(value)
    if not isinstance(answer, dict):
        raise TypeError("a sealed hyperelliptic result payload must be a record")
    return answer


class _PreparedModelData:
    """One sealed model-period payload reusable without copying or encoding."""

    def __init__(self, data: dict[str, Any]) -> None:
        self.payload = _sealed_payload(data)
        self.requested_precision_bits = int(data["requested_precision_bits"])
        self.achieved_stability_bits = int(data["achieved_stability_bits"])
        self.genus = int(data["genus"])


def _validated_provenance(value: Any, path: str = "provenance") -> Any:
    """Validate and detach a deterministic JSON-compatible provenance tree."""
    if value is None or isinstance(value, (bool, int, str)):
        return value
    if isinstance(value, float):
        if not isfinite(value):
            raise ValueError(path + " contains a non-finite floating-point value")
        return value
    if isinstance(value, (list, tuple)):
        return [
            _validated_provenance(item, path + "[" + str(index) + "]")
            for index, item in enumerate(value)
        ]
    if isinstance(value, dict):
        answer: dict[str, Any] = {}
        for key, item in value.items():
            if not isinstance(key, str):
                raise TypeError(path + " object keys must be strings")
            answer[key] = _validated_provenance(item, path + "." + key)
        return answer
    raise TypeError(path + " must be JSON-compatible")


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

    # Radial order about the centroid gives a deterministic simple-chain
    # candidate for ordinary branch configurations.  Validate it with the
    # same exact crossing/clearance predicate used by the exhaustive planner;
    # degenerate radial arrangements retain the old bounded exhaustive
    # fallback.  This avoids examining as many as 7! paths for a generic
    # genus-3 model without weakening the numerical capability gate.
    centroid = sum(points) / count

    def angular_key(index: int) -> tuple[Any, Any, int]:
        displacement = points[index] - centroid
        return (mp.arg(displacement), abs(displacement), index)

    angular = sorted(
        range(count),
        key=angular_key,
    )
    anchor = angular.index(0)
    anchored = tuple(angular[anchor:] + angular[:anchor])
    reversed_anchored = (0,) + tuple(reversed(anchored[1:]))
    candidate = min(anchored, reversed_anchored)
    candidate_quality = _path_quality(points, candidate)
    root_scale = max([mp.mpf(1)] + [abs(point) for point in points])
    if (
        candidate_quality is not None
        and candidate_quality[0] / root_scale >= mp.mpf(1) / 16
    ):
        _CACHE_STATS["angular_path_hits"] += 1
        return (list(candidate), candidate_quality[0])
    _CACHE_STATS["exhaustive_path_fallbacks"] += 1

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
    model_key = _model_key(curve)
    key = (model_key, int(bits))
    cached = _GEOMETRY_CACHE.get(key)
    if cached is not None:
        _CACHE_STATS["geometry_hits"] += 1
        return cached
    degree = int(completed.degree())
    topology: dict[str, Any] | None = _TOPOLOGY_CACHE.get(model_key)
    topology_cache_hit = topology is not None
    if topology is None:
        exact_roots = list(completed.roots(_global("QQbar"), multiplicities=False))
        if len(exact_roots) != degree:
            raise ArithmeticError(
                "the completed polynomial did not yield every branch root"
            )
        exact_roots = _sort_exact_roots(exact_roots)
        topology = {
            "exact_roots": exact_roots,
            "order": None,
            "real_root_count": sum(1 for root in exact_roots if root.is_real()),
        }
        if len(_TOPOLOGY_CACHE) >= _CACHE_LIMIT:
            del _TOPOLOGY_CACHE[next(iter(_TOPOLOGY_CACHE))]
        _TOPOLOGY_CACHE[model_key] = topology
    else:
        _CACHE_STATS["topology_hits"] += 1
        exact_roots = topology["exact_roots"]
        if len(exact_roots) != degree:
            raise ArithmeticError("cached branch topology has the wrong degree")
    points = [_approximate_root(root, bits) for root in exact_roots]
    stored_order = topology["order"]
    quality = (
        None
        if stored_order is None
        else _path_quality(points, tuple(int(index) for index in stored_order))
    )
    if quality is None:
        if stored_order is not None:
            _CACHE_STATS["topology_replans"] += 1
        order, clearance = _noncrossing_order(exact_roots, points)
        topology["order"] = list(order)
    else:
        if stored_order is None:
            raise AssertionError("a validated branch path must have an order")
        order = [int(index) for index in stored_order]
        clearance = quality[0]
    result = {
        "exact_roots": exact_roots,
        "points": points,
        "order": order,
        "ordered_points": [points[index] for index in order],
        "real_root_count": int(topology["real_root_count"]),
        "clearance": clearance,
        "topology_cache_hit": topology_cache_hit,
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


@native
def _period_edge_batch_float64(
    edge_data: Float64Buffer,
    other_roots: Float64Buffer,
    samples: Float64Buffer,
    output: Float64Buffer,
    leading: float,
    edge_count: uint64,
    other_count: uint64,
    genus: uint64,
    sample_count: uint64,
) -> float:
    """Integrate every edge and differential in one packed binary64 call.

    Complex square roots begin on the principal branch and are continued by
    choosing the sign nearest to the preceding quadrature node.  The public
    period code still subjects the result to independent panel refinement and
    all Riemann, positivity, and integral-homology gates.
    """
    for edge in range(edge_count):
        edge_start = edge * 4
        midpoint_real = edge_data[edge_start]
        midpoint_imag = edge_data[edge_start + 1]
        half_real = edge_data[edge_start + 2]
        half_imag = edge_data[edge_start + 3]
        previous_real = 0.0
        previous_imag = 0.0
        has_previous: uint64 = 0
        for sample in range(sample_count):
            cosine = samples[2 * sample]
            weight = samples[2 * sample + 1]
            x_real = midpoint_real + half_real * cosine
            x_imag = midpoint_imag + half_imag * cosine
            residual_real = 0.0 - leading
            residual_imag = 0.0
            roots_start = edge * other_count * 2
            for root_index in range(other_count):
                root_start = roots_start + 2 * root_index
                difference_real = x_real - other_roots[root_start]
                difference_imag = x_imag - other_roots[root_start + 1]
                product_real = (
                    residual_real * difference_real - residual_imag * difference_imag
                )
                product_imag = (
                    residual_real * difference_imag + residual_imag * difference_real
                )
                residual_real = product_real
                residual_imag = product_imag
            magnitude = sqrt(
                residual_real * residual_real + residual_imag * residual_imag
            )
            square_real_squared = (magnitude + residual_real) / 2.0
            square_imag_squared = (magnitude - residual_real) / 2.0
            if square_real_squared < 0.0:
                square_real_squared = 0.0
            if square_imag_squared < 0.0:
                square_imag_squared = 0.0
            square_real = sqrt(square_real_squared)
            square_imag = sqrt(square_imag_squared)
            if residual_imag < 0.0:
                square_imag = -square_imag
            if has_previous == 1:
                same_distance = (square_real - previous_real) * (
                    square_real - previous_real
                ) + (square_imag - previous_imag) * (square_imag - previous_imag)
                opposite_distance = (-square_real - previous_real) * (
                    -square_real - previous_real
                ) + (-square_imag - previous_imag) * (-square_imag - previous_imag)
                if opposite_distance < same_distance:
                    square_real = -square_real
                    square_imag = -square_imag
            previous_real = square_real
            previous_imag = square_imag
            has_previous = 1
            square_norm = square_real * square_real + square_imag * square_imag
            factor_real = weight * square_real / square_norm
            factor_imag = -weight * square_imag / square_norm
            power_real = 1.0
            power_imag = 0.0
            for differential in range(genus):
                output_start = 2 * (edge * genus + differential)
                output[output_start] += (
                    factor_real * power_real - factor_imag * power_imag
                )
                output[output_start + 1] += (
                    factor_real * power_imag + factor_imag * power_real
                )
                next_power_real = power_real * x_real - power_imag * x_imag
                next_power_imag = power_real * x_imag + power_imag * x_real
                power_real = next_power_real
                power_imag = next_power_imag
    checksum = 0.0
    for index in range(edge_count * genus * 2):
        checksum += output[index]
    return checksum


def _float64_samples(panels: int, quadrature_order: int) -> list[float]:
    key = (int(panels), int(quadrature_order))
    cached = _FLOAT64_SAMPLE_CACHE.get(key)
    if cached is not None:
        return cached
    rule = _FLOAT64_GAUSS_CACHE.get(quadrature_order)
    if rule is None:
        nodes = [0.0 for _index in range(quadrature_order)]
        weights = [0.0 for _index in range(quadrature_order)]
        half = (quadrature_order + 1) // 2
        for index in range(half):
            root = cos(pi * (index + 0.75) / (quadrature_order + 0.5))
            derivative = 0.0
            for _iteration in range(16):
                previous = 1.0
                current = root
                for degree in range(2, quadrature_order + 1):
                    following = (
                        (2.0 * degree - 1.0) * root * current
                        - (degree - 1.0) * previous
                    ) / degree
                    previous = current
                    current = following
                derivative = (
                    quadrature_order * (root * current - previous) / (root * root - 1.0)
                )
                following_root = root - current / derivative
                if abs(following_root - root) <= 4.0e-16:
                    root = following_root
                    break
                root = following_root
            weight = 2.0 / ((1.0 - root * root) * derivative * derivative)
            nodes[index] = -root
            nodes[quadrature_order - 1 - index] = root
            weights[index] = weight
            weights[quadrature_order - 1 - index] = weight
        rule = (nodes, weights)
        _FLOAT64_GAUSS_CACHE[quadrature_order] = rule
    nodes, weights = rule
    samples = []
    panel_half = pi / (2.0 * panels)
    for panel in range(panels):
        panel_midpoint = pi * (panel + 0.5) / panels
        for node, weight in zip(nodes, weights, strict=True):
            samples.extend(
                [
                    cos(panel_midpoint + panel_half * node),
                    panel_half * weight,
                ]
            )
    if len(_FLOAT64_SAMPLE_CACHE) >= 16:
        del _FLOAT64_SAMPLE_CACHE[next(iter(_FLOAT64_SAMPLE_CACHE))]
    _FLOAT64_SAMPLE_CACHE[key] = samples
    return samples


def _edge_integrals_float64(
    roots: list[Any],
    leading: Any,
    genus: int,
    panels: int,
    quadrature_order: int,
    kernel: Any = None,
) -> list[list[Any]]:
    """Return all edge integrals through the packed binary64 kernel."""
    if kernel is None:
        kernel = _period_edge_batch_float64
    edge_count = 2 * genus
    other_count = len(roots) - 2
    edge_data = []
    other_roots = []
    for edge in range(edge_count):
        left = roots[edge]
        right = roots[edge + 1]
        midpoint = (left + right) / 2
        half_edge = (right - left) / 2
        residual = -leading
        for root_index, root in enumerate(roots):
            if root_index not in (edge, edge + 1):
                residual *= midpoint - root
                other_roots.extend([float(mp.re(root)), float(mp.im(root))])
        if abs(residual) == 0:
            raise ZeroDivisionError("an edge midpoint has zero residual")
        edge_data.extend(
            [
                float(mp.re(midpoint)),
                float(mp.im(midpoint)),
                float(mp.re(half_edge)),
                float(mp.im(half_edge)),
            ]
        )
    packed_edges = kernel_float64_buffer(kernel, edge_data)
    packed_roots = kernel_float64_buffer(kernel, other_roots)
    packed_samples = kernel_float64_buffer(
        kernel,
        _float64_samples(panels, quadrature_order),
    )
    output = kernel_float64_zeros(
        kernel,
        2 * edge_count * genus,
    )
    kernel(
        packed_edges,
        packed_roots,
        packed_samples,
        output,
        runtime.parse_float(str(leading)),
        edge_count,
        other_count,
        genus,
        panels * quadrature_order,
    )
    answer = []
    for edge in range(edge_count):
        values = []
        for differential in range(genus):
            start = 2 * (edge * genus + differential)
            values.append(mp.mpc(output[start], output[start + 1]))
        answer.append(_canonical_edge_sign(values))
    return answer


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
        for node, weight in zip(nodes, weights, strict=True):
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


def _edge_integrals_arb(
    roots: list[Any],
    leading: Any,
    genus: int,
    panels: int,
    quadrature_order: int,
    bits: int,
) -> tuple[list[list[Any]], dict[str, Any]] | None:
    """Evaluate one arbitrary-precision edge batch with FLINT Arb/Acb.

    The native boundary evaluates exactly the same panelled Gauss--Legendre
    formula as `_edge_integrals`, including square-root continuation and all
    model differentials in one pass.  Root centres are still unenclosed
    numerical approximations, so the returned Arb radii measure arithmetic
    roundoff only.  Independent outer precision/panel refinement therefore
    remains mandatory and the public result remains non-rigorous.
    """
    backend = runtime.flint_backend()
    function = runtime.reflect.get(backend, "hyperellipticPeriodEdgeBatchArb")
    if function is runtime.undefined:
        return None
    digits = _decimal_digits(bits + 32)
    root_pairs = [
        [_real_text(mp.re(root), bits + 32), _real_text(mp.im(root), bits + 32)]
        for root in roots
    ]
    native = runtime.reflect.apply(
        function,
        backend,
        [
            root_pairs,
            _real_text(leading, bits + 32),
            genus,
            panels,
            quadrature_order,
            bits,
        ],
    )
    if str(runtime.reflect.get(native, "status")) != "ok":
        raise ArithmeticError("the bounded Arb period quadrature did not converge")
    raw_values = runtime.reflect.get(native, "values")
    expected = 2 * genus * genus
    if len(raw_values) != expected:
        raise ArithmeticError("the Arb period quadrature returned the wrong shape")
    accuracy_bits = bits
    answer = []
    for edge in range(2 * genus):
        values = []
        for differential in range(genus):
            item = raw_values[edge * genus + differential]
            real_value = str(runtime.reflect.get(item, "realMidpoint"))
            imaginary_value = str(runtime.reflect.get(item, "imagMidpoint"))
            accuracy_bits = min(
                accuracy_bits,
                int(runtime.reflect.get(item, "accuracyBits")),
            )
            values.append(mp.mpc(mp.mpf(real_value), mp.mpf(imaginary_value)))
        answer.append(_canonical_edge_sign(values))
    if accuracy_bits < max(24, bits // 2):
        raise ArithmeticError(
            "the Arb period quadrature did not retain enough arithmetic accuracy"
        )
    diagnostics = {
        "arithmetic_accuracy_bits": int(accuracy_bits),
        "work_precision_bits": int(runtime.reflect.get(native, "workPrecisionBits")),
        "sample_evaluations": int(runtime.reflect.get(native, "sampleEvaluations")),
        "decimal_digits": digits,
    }
    return (answer, diagnostics)


def _matrix_maximum(values: Any) -> Any:
    answer = mp.mpf(0)
    for row in range(values.rows):
        for column in range(values.cols):
            answer = max(answer, abs(values[row, column]))
    return answer


@native
def _period_sign_mask_float64_kernel(
    edge_data: Float64Buffer,
    sign_data: Float64Buffer,
    workspace: Float64Buffer,
    output: Float64Buffer,
    genus: uint64,
    mask_count: uint64,
) -> float:
    """Preselect one Riemann-positive edge-sign mask in a packed call.

    The output remains only a binary64 candidate.  `_periods_from_edges`
    reconstructs the corresponding matrices at arbitrary precision and
    applies the full symmetry and positivity gates before accepting it.
    """
    width = 2 * genus
    square = genus * genus
    augmented_real_start: uint64 = 0
    augmented_imag_start: uint64 = 2 * square
    inverse_real_start: uint64 = 4 * square
    inverse_imag_start: uint64 = 5 * square
    b_real_start: uint64 = 6 * square
    b_imag_start: uint64 = 7 * square
    tau_real_start: uint64 = 8 * square
    tau_imag_start: uint64 = 9 * square
    output[0] = 64.0

    for row in range(genus):
        for column in range(genus):
            source = 2 * ((2 * column) * genus + row)
            target = row * width + column
            workspace[augmented_real_start + target] = 2.0 * edge_data[source]
            workspace[augmented_imag_start + target] = 2.0 * edge_data[source + 1]
        workspace[augmented_real_start + row * width + genus + row] = 1.0
    for column in range(genus):
        pivot = column
        pivot_norm = 0.0
        for row in range(column, genus):
            index = row * width + column
            real = workspace[augmented_real_start + index]
            imaginary = workspace[augmented_imag_start + index]
            norm = real * real + imaginary * imaginary
            if norm > pivot_norm:
                pivot = row
                pivot_norm = norm
        if pivot_norm == 0.0:
            return 64.0
        if pivot != column:
            for entry in range(width):
                left = column * width + entry
                right = pivot * width + entry
                temporary = workspace[augmented_real_start + left]
                workspace[augmented_real_start + left] = workspace[
                    augmented_real_start + right
                ]
                workspace[augmented_real_start + right] = temporary
                temporary = workspace[augmented_imag_start + left]
                workspace[augmented_imag_start + left] = workspace[
                    augmented_imag_start + right
                ]
                workspace[augmented_imag_start + right] = temporary
        pivot_index = column * width + column
        pivot_real = workspace[augmented_real_start + pivot_index]
        pivot_imag = workspace[augmented_imag_start + pivot_index]
        pivot_denominator = pivot_real * pivot_real + pivot_imag * pivot_imag
        for entry in range(width):
            index = column * width + entry
            real = workspace[augmented_real_start + index]
            imaginary = workspace[augmented_imag_start + index]
            workspace[augmented_real_start + index] = (
                real * pivot_real + imaginary * pivot_imag
            ) / pivot_denominator
            workspace[augmented_imag_start + index] = (
                imaginary * pivot_real - real * pivot_imag
            ) / pivot_denominator
        for row in range(genus):
            if row != column:
                factor_index = row * width + column
                factor_real = workspace[augmented_real_start + factor_index]
                factor_imag = workspace[augmented_imag_start + factor_index]
                for entry in range(width):
                    source = column * width + entry
                    target = row * width + entry
                    source_real = workspace[augmented_real_start + source]
                    source_imag = workspace[augmented_imag_start + source]
                    workspace[augmented_real_start + target] -= (
                        factor_real * source_real - factor_imag * source_imag
                    )
                    workspace[augmented_imag_start + target] -= (
                        factor_real * source_imag + factor_imag * source_real
                    )

    for row in range(genus):
        for column in range(genus):
            source = row * width + genus + column
            target = row * genus + column
            workspace[inverse_real_start + target] = workspace[
                augmented_real_start + source
            ]
            workspace[inverse_imag_start + target] = workspace[
                augmented_imag_start + source
            ]

    best_score = 1.0e300
    for mask in range(mask_count):
        for index in range(4 * square):
            workspace[b_real_start + index] = 0.0
        for row in range(genus):
            for column in range(genus):
                target = row * genus + column
                for item in range(column, genus):
                    odd_edge = 2 * item + 1
                    sign = sign_data[mask * width + odd_edge]
                    source = 2 * (odd_edge * genus + row)
                    workspace[b_real_start + target] += 2.0 * sign * edge_data[source]
                    workspace[b_imag_start + target] += (
                        2.0 * sign * edge_data[source + 1]
                    )
        maximum = 1.0
        for row in range(genus):
            even_sign = sign_data[mask * width + 2 * row]
            for column in range(genus):
                target = row * genus + column
                for index in range(genus):
                    left = row * genus + index
                    right = index * genus + column
                    workspace[tau_real_start + target] += even_sign * (
                        workspace[inverse_real_start + left]
                        * workspace[b_real_start + right]
                        - workspace[inverse_imag_start + left]
                        * workspace[b_imag_start + right]
                    )
                    workspace[tau_imag_start + target] += even_sign * (
                        workspace[inverse_real_start + left]
                        * workspace[b_imag_start + right]
                        + workspace[inverse_imag_start + left]
                        * workspace[b_real_start + right]
                    )
                real = workspace[tau_real_start + target]
                imaginary = workspace[tau_imag_start + target]
                norm = sqrt(real * real + imaginary * imaginary)
                if norm > maximum:
                    maximum = norm
        defect = 0.0
        for row in range(genus):
            for column in range(genus):
                left = row * genus + column
                right = column * genus + row
                real = (
                    workspace[tau_real_start + left] - workspace[tau_real_start + right]
                )
                imaginary = (
                    workspace[tau_imag_start + left] - workspace[tau_imag_start + right]
                )
                difference = sqrt(real * real + imaginary * imaginary)
                if difference > defect:
                    defect = difference
        score = defect / maximum
        accepted: uint64 = 1
        if score >= best_score:
            accepted = 0
        y00 = workspace[tau_imag_start]
        if y00 <= 0.0:
            accepted = 0
        y01 = (workspace[tau_imag_start + 1] + workspace[tau_imag_start + genus]) / 2.0
        y11 = workspace[tau_imag_start + genus + 1]
        determinant2 = y00 * y11 - y01 * y01
        if determinant2 <= 0.0:
            accepted = 0
        if genus == 3:
            y02 = (
                workspace[tau_imag_start + 2] + workspace[tau_imag_start + 2 * genus]
            ) / 2.0
            y12 = (
                workspace[tau_imag_start + genus + 2]
                + workspace[tau_imag_start + 2 * genus + 1]
            ) / 2.0
            y22 = workspace[tau_imag_start + 2 * genus + 2]
            determinant3 = (
                y00 * (y11 * y22 - y12 * y12)
                - y01 * (y01 * y22 - y12 * y02)
                + y02 * (y01 * y12 - y11 * y02)
            )
            if determinant3 <= 0.0:
                accepted = 0
        if accepted == 1:
            output[0] = float(mask)
            best_score = score
    return best_score


def _float64_period_sign_mask(edges: list[list[Any]], genus: int) -> int | None:
    """Select the positive near-symmetric sign pattern in binary64.

    This is only a preselector.  The chosen pattern is reconstructed and
    validated with the arbitrary-precision Riemann gates below; a failed
    preselection falls back to the exhaustive arbitrary-precision search.
    """
    edge_data = []
    for edge in range(2 * genus):
        for row in range(genus):
            edge_data.extend(
                [
                    runtime.parse_float(str(mp.re(edges[edge][row]))),
                    runtime.parse_float(str(mp.im(edges[edge][row]))),
                ]
            )
    kernel = _period_sign_mask_float64_kernel
    mask_count = 1 << (2 * genus - 1)
    sign_data = []
    for mask in range(mask_count):
        sign_data.append(1.0)
        for edge in range(1, 2 * genus):
            sign_data.append(-1.0 if mask & (1 << (edge - 1)) else 1.0)
    packed_edges = kernel_float64_buffer(kernel, edge_data)
    packed_signs = kernel_float64_buffer(kernel, sign_data)
    workspace = kernel_float64_zeros(kernel, 10 * genus * genus)
    output = kernel_float64_zeros(kernel, 1)
    kernel(packed_edges, packed_signs, workspace, output, genus, mask_count)
    mask = int(output[0])
    return None if mask == 64 else mask


def _periods_from_edges(
    edges: list[list[Any]], genus: int, force_exhaustive: bool = False
) -> dict[str, Any]:
    best: dict[str, Any] | None = None
    base_a = mp.matrix(genus, genus)
    for column in range(genus):
        for row in range(genus):
            base_a[row, column] = 2 * edges[2 * column][row]
    try:
        inverse_a = base_a**-1
    except ZeroDivisionError as caught:
        raise HyperellipticPeriodCapabilityError(
            "riemann_form_singular",
            "the chain-cycle A-period matrix is singular",
        ) from caught
    preferred_mask = (
        None if force_exhaustive else _float64_period_sign_mask(edges, genus)
    )
    masks = (
        [preferred_mask]
        if preferred_mask is not None
        else list(range(1 << (2 * genus - 1)))
    )
    if preferred_mask is not None:
        _CACHE_STATS["float64_sign_selections"] += 1
    elif not force_exhaustive:
        _CACHE_STATS["sign_selection_fallbacks"] += 1
    # A simultaneous sign change is immaterial, so fix the first edge sign.
    for mask in masks:
        signs = [1]
        for index in range(1, 2 * genus):
            signs.append(-1 if mask & (1 << (index - 1)) else 1)
        b_matrix = mp.matrix(genus, genus)
        for column in range(genus):
            for row in range(genus):
                b_matrix[row, column] = 2 * sum(
                    signs[2 * item + 1] * edges[2 * item + 1][row]
                    for item in range(column, genus)
                )
        tau = mp.matrix(genus, genus)
        for row in range(genus):
            for column in range(genus):
                tau[row, column] = signs[2 * row] * sum(
                    inverse_a[row, index] * b_matrix[index, column]
                    for index in range(genus)
                )
        symmetry_defect = max(
            abs(tau[row, column] - tau[column, row])
            for row in range(genus)
            for column in range(genus)
        )
        score = symmetry_defect / max(mp.mpf(1), _matrix_maximum(tau))
        if best is not None and score >= best["symmetry_relative_defect"]:
            continue
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
        candidate = {
            "tau": tau,
            "signs": signs,
            "symmetry_defect": symmetry_defect,
            "symmetry_relative_defect": score,
            "minimum_eigenvalue": minimum_eigenvalue,
        }
        if best is None or score < best["symmetry_relative_defect"]:
            best = candidate
    if best is None:
        if preferred_mask is not None:
            _CACHE_STATS["sign_selection_fallbacks"] += 1
            # Binary64 selected a pattern which failed the full-precision
            # positivity check; retry every sign in arbitrary precision.
            return _periods_from_edges(edges, genus, True)
        raise HyperellipticPeriodCapabilityError(
            "riemann_form_not_positive",
            "no square-root continuation produced a positive Riemann matrix",
        )
    a_matrix = mp.matrix(genus, genus)
    b_matrix = mp.matrix(genus, genus)
    for column in range(genus):
        for row in range(genus):
            a_matrix[row, column] = best["signs"][2 * column] * base_a[row, column]
            b_matrix[row, column] = 2 * sum(
                best["signs"][2 * item + 1] * edges[2 * item + 1][row]
                for item in range(column, genus)
            )
    best["a"] = a_matrix
    best["b"] = b_matrix
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


@native
def _conjugation_action_float64_kernel(
    period_data: Float64Buffer,
    workspace: Float64Buffer,
    output: Float64Buffer,
    genus: uint64,
) -> float:
    """Solve `B^-1 diag(1,-1) B` as one packed binary64 preselection.

    This kernel does not certify integrality.  Its rounded output is always
    checked against the arbitrary-precision period matrix by
    `_conjugation_action`, including the involution and anti-symplectic gates.
    """
    dimension = 2 * genus
    width = 2 * dimension
    for row in range(dimension):
        sign = 1.0
        period_row = row
        component: uint64 = 0
        if row >= genus:
            sign = -1.0
            period_row = row - genus
            component = 1
        for column in range(dimension):
            source = 2 * (period_row * dimension + column) + component
            value = period_data[source]
            workspace[row * width + column] = value
            workspace[row * width + dimension + column] = sign * value

    minimum_pivot = 1.0e300
    for column in range(dimension):
        pivot = column
        pivot_norm = 0.0
        for row in range(column, dimension):
            value = workspace[row * width + column]
            norm = value * value
            if norm > pivot_norm:
                pivot = row
                pivot_norm = norm
        if pivot_norm == 0.0:
            return 0.0
        pivot_size = sqrt(pivot_norm)
        if pivot_size < minimum_pivot:
            minimum_pivot = pivot_size
        if pivot != column:
            for entry in range(width):
                left = column * width + entry
                right = pivot * width + entry
                temporary = workspace[left]
                workspace[left] = workspace[right]
                workspace[right] = temporary
        pivot_value = workspace[column * width + column]
        for entry in range(width):
            index = column * width + entry
            workspace[index] /= pivot_value
        for row in range(dimension):
            if row != column:
                factor = workspace[row * width + column]
                for entry in range(width):
                    workspace[row * width + entry] -= (
                        factor * workspace[column * width + entry]
                    )

    for row in range(dimension):
        for column in range(dimension):
            output[row * dimension + column] = workspace[
                row * width + dimension + column
            ]
    return minimum_pivot


def _float64_conjugation_preselection(
    period_matrix: Any, genus: int
) -> list[list[int]] | None:
    """Return a packed binary64 candidate for full-precision validation."""
    dimension = 2 * genus
    period_data = []
    for row in range(genus):
        for column in range(dimension):
            period_data.extend(
                [
                    runtime.parse_float(str(mp.re(period_matrix[row, column]))),
                    runtime.parse_float(str(mp.im(period_matrix[row, column]))),
                ]
            )
    kernel = _conjugation_action_float64_kernel
    packed_periods = kernel_float64_buffer(kernel, period_data)
    workspace = kernel_float64_zeros(kernel, 2 * dimension * dimension)
    output = kernel_float64_zeros(kernel, dimension * dimension)
    minimum_pivot = kernel(packed_periods, workspace, output, genus)
    if not isfinite(minimum_pivot) or minimum_pivot <= 1.0e-14:
        return None
    if any(not isfinite(output[index]) for index in range(dimension * dimension)):
        return None
    return [
        [int(mp.nint(output[row * dimension + column])) for column in range(dimension)]
        for row in range(dimension)
    ]


def _conjugation_action(
    period_matrix: Any,
    genus: int,
    tolerance: Any,
    preferred: list[list[int]] | None = None,
) -> dict[str, Any]:
    dimension = 2 * genus
    if preferred is None:
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
    else:
        integral = [list(row) for row in preferred]
        if len(integral) != dimension or any(len(row) != dimension for row in integral):
            raise ValueError("a preferred conjugation action has the wrong shape")
        defect = max(
            abs(
                mp.conj(period_matrix[row, column])
                - sum(
                    period_matrix[row, index] * integral[index][column]
                    for index in range(dimension)
                )
            )
            for row in range(genus)
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
    allow_float64: bool = True,
    preferred_conjugation: list[list[int]] | None = None,
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
        quadrature_attempts = []
        periods = None
        internal_tolerance = mp.mpf(0)
        use_float64 = bool(allow_float64)
        use_arb = True
        quadrature_engine = "mpmath"
        quadrature_evidence_bits = bits
        for _attempt in range(6):
            quadrature_engine = "mpmath"
            fallback_reason = None
            edges: list[list[Any]] | None = None
            arb_diagnostics: dict[str, Any] | None = None
            if use_float64:
                try:
                    edges = _edge_integrals_float64(
                        roots,
                        leading,
                        genus,
                        effective_panels,
                        effective_order,
                    )
                    if any(
                        not isfinite(float(mp.re(value)))
                        or not isfinite(float(mp.im(value)))
                        for edge_values in edges
                        for value in edge_values
                    ):
                        raise ArithmeticError(
                            "binary64 period quadrature produced a non-finite value"
                        )
                    quadrature_engine = (
                        "packed-float64-native"
                        if is_compiled(_period_edge_batch_float64)
                        else "packed-float64-dynamic"
                    )
                    _CACHE_STATS["float64_quadratures"] += 1
                except (
                    ArithmeticError,
                    OverflowError,
                    RuntimeError,
                    TypeError,
                    ValueError,
                    ZeroDivisionError,
                ) as caught:
                    use_float64 = False
                    _CACHE_STATS["float64_fallbacks"] += 1
                    fallback_reason = (
                        "packed_float64_exception:"
                        + type(caught).__name__
                        + ":"
                        + str(caught)
                    )
            if not use_float64 and use_arb:
                try:
                    arb_result = _edge_integrals_arb(
                        roots,
                        leading,
                        genus,
                        effective_panels,
                        effective_order,
                        bits,
                    )
                    if arb_result is None:
                        use_arb = False
                    else:
                        edges, arb_diagnostics = arb_result
                        quadrature_engine = "arb-acb-gauss-legendre"
                        quadrature_evidence_bits = int(
                            arb_diagnostics["arithmetic_accuracy_bits"]
                        )
                        _CACHE_STATS["arb_quadratures"] += 1
                except (
                    ArithmeticError,
                    OverflowError,
                    ValueError,
                    ZeroDivisionError,
                ) as caught:
                    use_arb = False
                    _CACHE_STATS["arb_fallbacks"] += 1
                    fallback_reason = (
                        "arb_acb_exception:" + type(caught).__name__ + ":" + str(caught)
                    )
            if not use_float64 and edges is None:
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
                quadrature_evidence_bits = bits
            if edges is None:
                raise AssertionError("period quadrature did not produce edge integrals")
            periods = _periods_from_edges(edges, genus)
            scale = max(mp.mpf(1), _matrix_maximum(periods["period_matrix"]))
            validation_bits = max(24, min(100, bits // 2))
            if quadrature_engine.startswith("packed-float64-"):
                # The packed kernel is intentionally binary64.  Its Riemann
                # gate must not demand more than the representation can
                # express; the outer independent panel/precision refinement
                # still enforces the requested result, and higher-precision
                # refinement runs leave this binary64 path.
                validation_bits = min(validation_bits, 44)
            internal_tolerance = mp.power(2, -validation_bits) * scale
            quadrature_attempts.append(
                {
                    "order": effective_order,
                    "panels": effective_panels,
                    "engine": quadrature_engine,
                    "representation_bits": (
                        53
                        if quadrature_engine.startswith("packed-float64-")
                        else int(arb_diagnostics["work_precision_bits"])
                        if arb_diagnostics is not None
                        else bits
                    ),
                    "riemann_target_bits": validation_bits,
                    "riemann_achieved_bits": _stable_bits(
                        periods["symmetry_relative_defect"],
                        (
                            53
                            if quadrature_engine.startswith("packed-float64-")
                            else bits
                        ),
                    ),
                    "fallback_reason": fallback_reason,
                    "arithmetic_accuracy_bits": (
                        None
                        if arb_diagnostics is None
                        else int(arb_diagnostics["arithmetic_accuracy_bits"])
                    ),
                    "sample_evaluations": (
                        2 * genus * effective_panels * effective_order
                        if arb_diagnostics is None
                        else int(arb_diagnostics["sample_evaluations"])
                    ),
                    "riemann_relative_defect": str(periods["symmetry_relative_defect"]),
                    "tolerance": str(internal_tolerance),
                }
            )
            if periods["symmetry_relative_defect"] <= internal_tolerance:
                break
            if use_float64:
                # A bad square-root chart is visible in the Riemann defect.
                # Retry at the same numerical parameters with arbitrary-
                # precision branch continuation before increasing the work.
                use_float64 = False
                _CACHE_STATS["float64_fallbacks"] += 1
                quadrature_attempts[-1]["fallback_reason"] = (
                    "riemann_defect_exceeded_binary64_gate"
                )
                continue
            if quadrature_engine == "arb-acb-gauss-legendre":
                # Preserve the ordinary implementation as a capability and
                # branch-chart fallback.  A native result that misses the
                # Riemann gate is never repaired or silently published.
                use_arb = False
                _CACHE_STATS["arb_fallbacks"] += 1
                quadrature_attempts[-1]["fallback_reason"] = (
                    "riemann_defect_exceeded_arb_gate"
                )
                continue
            effective_panels *= 2
            effective_order = min(64, 2 * effective_order)
        if periods is None or periods["symmetry_relative_defect"] > internal_tolerance:
            raise HyperellipticPeriodCapabilityError(
                "riemann_relation_not_isolated",
                "the Riemann symmetry relation did not stabilize after adaptive quadrature refinement",
                {"attempts": quadrature_attempts},
            )
        conjugation_preselected = False
        action_preference = preferred_conjugation
        if action_preference is None:
            action_preference = _float64_conjugation_preselection(
                periods["period_matrix"], genus
            )
            conjugation_preselected = action_preference is not None
        if preferred_conjugation is None and action_preference is not None:
            try:
                action = _conjugation_action(
                    periods["period_matrix"],
                    genus,
                    128 * internal_tolerance,
                    action_preference,
                )
            except HyperellipticPeriodCapabilityError:
                conjugation_preselected = False
                action = _conjugation_action(
                    periods["period_matrix"],
                    genus,
                    128 * internal_tolerance,
                    None,
                )
        else:
            action = _conjugation_action(
                periods["period_matrix"],
                genus,
                128 * internal_tolerance,
                action_preference,
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
            "quadrature_attempts": quadrature_attempts,
            "quadrature_evidence_bits": (
                44
                if quadrature_engine.startswith("packed-float64-")
                else int(quadrature_evidence_bits)
            ),
            "conjugation_action_reused": preferred_conjugation is not None,
            "conjugation_action_preselected": conjugation_preselected,
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


def _stable_bits(relative_error: Any, cap: int) -> int:
    if relative_error <= 0:
        return int(cap)
    bits = int(mp.floor(-mp.log(relative_error, 2)))
    return max(0, min(int(cap), bits))


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
    scale = max(
        mp.mpf(1),
        _matrix_maximum(period_matrix),
        abs(run["lattice"]["model_period"]),
    )
    periods_relative = run["periods"]["symmetry_relative_defect"]
    achieved_stability_bits = min(
        _stable_bits(difference / scale, bits),
        _stable_bits(periods_relative, bits),
        int(run["quadrature_evidence_bits"]),
    )
    return {
        "model_key": _model_key(curve),
        "genus": genus,
        "requested_precision_bits": requested_bits,
        "work_precision_bits": bits,
        "achieved_stability_bits": achieved_stability_bits,
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
            periods_relative, requested_bits
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
) -> tuple[Any, bool]:
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
            requested_bits <= 44,
            None if previous is None else previous["action"]["matrix"],
        )
        order = tuple(run["geometry"]["order"])
        refinement_runs.append(
            {
                "work_precision_bits": work_bits,
                "quadrature_order": int(run["quadrature_order"]),
                "quadrature_panels": int(run["panels"]),
                "quadrature_evidence_bits": int(run["quadrature_evidence_bits"]),
                "conjugation_action_reused": bool(run["conjugation_action_reused"]),
                "requested_quadrature_order": quadrature_order,
                "requested_quadrature_panels": panels,
                "relative_branch_clearance": _real_text(
                    run["relative_branch_clearance"], requested_bits
                ),
                "quadrature_attempts": _clone_data(run["quadrature_attempts"]),
                "branch_order": list(order),
                "topology_cache_hit": bool(run["geometry"]["topology_cache_hit"]),
                "model_real_period": _real_text(
                    run["lattice"]["model_period"], requested_bits
                ),
            }
        )
        previous_evidence_bits = (
            0 if previous is None else int(previous["quadrature_evidence_bits"])
        )
        if (
            previous is not None
            and order == previous_order
            and min(previous_evidence_bits, int(run["quadrature_evidence_bits"]))
            >= requested_bits
        ):
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
                    prepared = _PreparedModelData(result)
                    _MODEL_PERIOD_CACHE[cache_key] = prepared
                    return (prepared, False)
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
        for node, weight in zip(nodes, weights, strict=True):
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
        return (_clone_data(_ABEL_CACHE[key]), True)
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
                    _ABEL_CACHE[key] = _clone_data(result)
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
        if determinant == 0:
            raise ValueError("the Neron differential determinant must be nonzero")
    if determinant is not None and provenance is None:
        raise ValueError("a supplied Neron normalization requires provenance")
    normalized_provenance = _validated_provenance(provenance)
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
        "provenance": normalized_provenance,
    }


def _mp_matrix_from_pairs(rows: Any) -> Any:
    row_count = len(rows)
    column_count = 0 if row_count == 0 else len(rows[0])
    answer = mp.matrix(row_count, column_count)
    for row in range(row_count):
        for column in range(column_count):
            real, imaginary = rows[row][column]
            answer[row, column] = mp.mpc(mp.mpf(real), mp.mpf(imaginary))
    return answer


def _anti_symplectic_action(action: list[list[int]], genus: int) -> bool:
    dimension = 2 * genus
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
        [action[column][row] for column in range(dimension)] for row in range(dimension)
    ]
    transformed = _integer_matrix_product(
        _integer_matrix_product(transpose, intersection), action
    )
    return transformed == [[-value for value in row] for row in intersection]


class AbelJacobiResult:
    """A chosen refinement-stable lift in `C^g` of an Abel--Jacobi image."""

    def __init__(
        self,
        curve: Any,
        points: list[Any],
        data: dict[str, Any],
        period_result: HyperellipticPeriodResult,
        cache_hit: bool,
    ) -> None:
        self.__curve = curve
        self.__points = tuple(points)
        self.__data_payload = _sealed_payload(data)
        self.__period_result = period_result
        self.__precision_bits = int(data["precision_bits"])
        self.__genus = int(data["genus"])
        self.__cache_hit = bool(cache_hit)

    @property
    def _curve(self) -> Any:
        return self.__curve

    @property
    def _points(self) -> tuple[Any, ...]:
        return self.__points

    @property
    def _data(self) -> dict[str, Any]:
        return _payload_data(self.__data_payload)

    @property
    def period_result(self) -> HyperellipticPeriodResult:
        return self.__period_result

    @property
    def precision_bits(self) -> int:
        return self.__precision_bits

    @property
    def genus(self) -> int:
        return self.__genus

    @property
    def cache_hit(self) -> bool:
        return self.__cache_hit

    @property
    def rigorous(self) -> bool:
        return False

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

    def internal_consistency(self) -> dict[str, Any]:
        """Recompute and bind the stored lift; this is not a rigor certificate."""
        checks: dict[str, bool] = {}
        error = None
        try:
            checks["curve_model_bound"] = (
                self._data["model_key"] == _model_key(self._curve)
                and self._data["model_key"]
                == self.period_result._model_data["model_key"]
                and self.genus == self.period_result.genus
            )
            checks["period_precision_sufficient"] = (
                self.precision_bits <= self.period_result.achieved_stability_bits
            )
            support = [_point_key(point) for point in self._points]
            checks["support_bound"] = support == self._data["support"]
            checks["basepoint_bound"] = self._data["basepoint"] == "infinity"
            checks["refinement_stable"] = mp.mpf(
                self._data["refinement_difference"]
            ) <= mp.mpf(self._data["refinement_tolerance"])
            runs = self._data["refinement_runs"]
            final = runs[-1]
            recomputed = _abel_run(
                self._curve,
                list(self._points),
                int(final["work_precision_bits"]),
                int(final["quadrature_panels"]),
                int(final["quadrature_order"]),
            )
            checks["path_bound"] = (
                tuple(recomputed["branch_order"]) == tuple(self._data["branch_order"])
                and list(recomputed["directions"]) == list(self._data["ray_directions"])
                and all(
                    clearance == mp.inf or clearance > 0
                    for clearance in recomputed["clearances"]
                )
            )
            clearance_bound = True
            for recomputed_clearance, stored_clearance in zip(
                recomputed["clearances"],
                self._data["ray_clearances"],
                strict=True,
            ):
                if recomputed_clearance == mp.inf:
                    clearance_bound = clearance_bound and stored_clearance == "infinity"
                else:
                    stored_value = mp.mpf(stored_clearance)
                    clearance_bound = clearance_bound and abs(
                        recomputed_clearance - stored_value
                    ) <= mp.mpf(self._data["refinement_tolerance"]) * max(
                        mp.mpf(1), abs(stored_value)
                    )
            checks["path_clearance_recomputed"] = clearance_bound
            stored = [
                mp.mpc(mp.mpf(real), mp.mpf(imaginary))
                for real, imaginary in self.vector_pairs()
            ]
            difference = max(
                [mp.mpf(0)]
                + [
                    abs(recomputed["vector"][index] - stored[index])
                    for index in range(self.genus)
                ]
            )
            checks["vector_recomputed"] = difference <= 4 * mp.mpf(
                self._data["refinement_tolerance"]
            )
        except Exception as caught:
            error = type(caught).__name__ + ": " + str(caught)
        consistent = error is None and all(checks.values())
        return {
            **checks,
            "internal_consistency": consistent,
            "certificate_status": "nonrigorous_internal_consistency_only",
            "error": error,
            "rigorous": False,
            "verified": consistent,
        }

    verify = internal_consistency

    def diagnostics(self) -> dict[str, Any]:
        return _clone_data(
            {
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
        )

    def to_dict(self) -> dict[str, Any]:
        return _clone_data(
            {
                "schema": PERIOD_SCHEMA + "/abel-jacobi-v1",
                **dict(self._data),
                "period_model_key": self.period_result._model_data["model_key"],
                "cache_hit": self.cache_hit,
            }
        )


class HyperellipticPeriodResult:
    """A refinement-stable model period and optional supplied Neron scaling."""

    def __init__(
        self,
        curve: Any,
        model_data: Any,
        normalization_data: dict[str, Any],
        cache_hit: bool,
    ) -> None:
        self.__curve = curve
        if isinstance(model_data, _PreparedModelData):
            self.__model_payload = model_data.payload
            requested_precision_bits = model_data.requested_precision_bits
            achieved_stability_bits = model_data.achieved_stability_bits
            genus = model_data.genus
        else:
            self.__model_payload = _sealed_payload(model_data)
            requested_precision_bits = int(model_data["requested_precision_bits"])
            achieved_stability_bits = int(model_data["achieved_stability_bits"])
            genus = int(model_data["genus"])
        self.__normalization_payload = _sealed_payload(normalization_data)
        self.__cache_hit = bool(cache_hit)
        self.__precision_bits = requested_precision_bits
        self.__achieved_stability_bits = achieved_stability_bits
        self.__genus = genus
        self.__normalization_status = str(normalization_data["status"])

    @property
    def _curve(self) -> Any:
        return self.__curve

    @property
    def _model_data(self) -> dict[str, Any]:
        return _payload_data(self.__model_payload)

    @property
    def _normalization(self) -> dict[str, Any]:
        return _payload_data(self.__normalization_payload)

    @property
    def cache_hit(self) -> bool:
        return self.__cache_hit

    @property
    def rigorous(self) -> bool:
        return False

    @property
    def arithmetic_balls_rigorous(self) -> bool:
        return False

    @property
    def precision_bits(self) -> int:
        return self.__precision_bits

    @property
    def achieved_stability_bits(self) -> int:
        return self.__achieved_stability_bits

    @property
    def genus(self) -> int:
        return self.__genus

    @property
    def normalization_status(self) -> str:
        return self.__normalization_status

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
        return self.model_period() * field(abs(numerator)) / field(denominator)

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

    def internal_consistency(self) -> dict[str, Any]:
        """Recompute structural identities; this is not an analytic enclosure."""
        checks: dict[str, bool] = {}
        error = None
        try:
            checks["curve_model_bound"] = self._model_data["model_key"] == _model_key(
                self._curve
            )
            completed, coefficients = _completed_model(self._curve)
            del completed
            checks["completed_model_bound"] = [
                _exact_text(value) for value in coefficients
            ] == self._model_data["completed_coefficients"]
            action = self._model_data["conjugation_matrix"]
            dimension = 2 * self.genus
            identity = [
                [1 if row == column else 0 for column in range(dimension)]
                for row in range(dimension)
            ]
            checks["exact_conjugation_involution"] = (
                _integer_matrix_product(action, action) == identity
            )
            checks["anti_symplectic_conjugation"] = _anti_symplectic_action(
                action, self.genus
            )
            work_bits = int(self._model_data["work_precision_bits"])
            with mp.workprec(work_bits):
                periods = _mp_matrix_from_pairs(self._model_data["period_matrix"])
                a_matrix = periods[:, : self.genus]
                b_matrix = periods[:, self.genus :]
                tau = a_matrix**-1 * b_matrix
                stored_tau = _mp_matrix_from_pairs(self._model_data["siegel_matrix"])
                tolerance = 8 * mp.mpf(self._model_data["refinement_tolerance"])
                checks["tau_recomputed"] = (
                    _maximum_matrix_difference(tau, stored_tau) <= tolerance
                )
                symmetry = max(
                    abs(tau[row, column] - tau[column, row])
                    for row in range(self.genus)
                    for column in range(self.genus)
                )
                imaginary_symmetric = mp.matrix(
                    [
                        [
                            mp.im((tau[row, column] + tau[column, row]) / 2)
                            for column in range(self.genus)
                        ]
                        for row in range(self.genus)
                    ]
                )
                minimum = min(mp.eigsy(imaginary_symmetric, eigvals_only=True))
                checks["riemann_relations"] = symmetry <= tolerance and minimum > 0
                lattice = _real_lattice_data(
                    periods,
                    action,
                    self.genus,
                    16 * tolerance,
                )
                checks["fixed_anti_lattices_recomputed"] = (
                    lattice["fixed_basis"]
                    == self._model_data["real_invariant_lattice_basis"]
                    and lattice["anti_basis"]
                    == self._model_data["real_anti_invariant_lattice_basis"]
                    and lattice["component_coordinates"]
                    == self._model_data["real_component_coordinates"]
                    and lattice["component_count"] == self.real_components()
                )
                stored_period = mp.mpf(self._model_data["model_real_period"])
                period_scale = max(mp.mpf(1), abs(stored_period))
                checks["model_period_recomputed"] = (
                    abs(lattice["model_period"] - stored_period)
                    <= tolerance * period_scale
                )
            checks["refinement_stable"] = mp.mpf(
                self._model_data["refinement_difference"]
            ) <= mp.mpf(self._model_data["refinement_tolerance"])
            checks["achieved_stability_recorded"] = (
                0 < self.achieved_stability_bits <= work_bits
            )
            checks["positive_real_components"] = self.real_components() > 0
        except Exception as caught:
            error = type(caught).__name__ + ": " + str(caught)
        consistent = error is None and all(checks.values())
        return {
            **checks,
            "internal_consistency": consistent,
            "certificate_status": "nonrigorous_internal_consistency_only",
            "error": error,
            "rigorous": False,
            "verified": consistent,
        }

    verify = internal_consistency

    def diagnostics(self) -> dict[str, Any]:
        return _clone_data(
            {
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
                "requested_precision_bits": self.precision_bits,
                "work_precision_bits": self._model_data["work_precision_bits"],
                "achieved_stability_bits": self.achieved_stability_bits,
                "analytic_error_status": self._model_data["analytic_error_status"],
                "cache_hit": self.cache_hit,
                "rigorous": False,
            }
        )

    def to_dict(self) -> dict[str, Any]:
        model = dict(self._model_data)
        determinant = self._normalization["determinant_parts"]
        neron_period = None
        if determinant is not None:
            neron_period = str(self.neron_period())
        return _clone_data(
            {
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
        )


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
    elif requested_bits > min(
        period_result.precision_bits,
        period_result.achieved_stability_bits,
    ):
        raise HyperellipticPeriodCapabilityError(
            "period_precision_too_low",
            "Abel--Jacobi precision cannot exceed the achieved stability of the supplied period lattice",
            {
                "requested_precision_bits": requested_bits,
                "period_precision_bits": period_result.precision_bits,
                "period_achieved_stability_bits": period_result.achieved_stability_bits,
            },
        )
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
    return AbelJacobiResult(curve, points, data, period_result, cache_hit)


def clear_period_cache() -> None:
    """Clear branch geometry and completed model-period caches."""
    _TOPOLOGY_CACHE.clear()
    _GEOMETRY_CACHE.clear()
    _MODEL_PERIOD_CACHE.clear()
    _ABEL_CACHE.clear()
    _GAUSS_CACHE.clear()
    _FLOAT64_GAUSS_CACHE.clear()
    _FLOAT64_SAMPLE_CACHE.clear()
    for key in _CACHE_STATS:
        _CACHE_STATS[key] = 0


def period_cache_info() -> dict[str, int]:
    """Return deterministic cache sizes and hit/computation counters."""
    return {
        "topology_entries": len(_TOPOLOGY_CACHE),
        "geometry_entries": len(_GEOMETRY_CACHE),
        "model_entries": len(_MODEL_PERIOD_CACHE),
        "abel_entries": len(_ABEL_CACHE),
        "gauss_rule_entries": len(_GAUSS_CACHE),
        "float64_gauss_rule_entries": len(_FLOAT64_GAUSS_CACHE),
        "float64_sample_entries": len(_FLOAT64_SAMPLE_CACHE),
        "topology_hits": int(_CACHE_STATS["topology_hits"]),
        "topology_replans": int(_CACHE_STATS["topology_replans"]),
        "angular_path_hits": int(_CACHE_STATS["angular_path_hits"]),
        "exhaustive_path_fallbacks": int(_CACHE_STATS["exhaustive_path_fallbacks"]),
        "geometry_hits": int(_CACHE_STATS["geometry_hits"]),
        "model_hits": int(_CACHE_STATS["model_hits"]),
        "abel_hits": int(_CACHE_STATS["abel_hits"]),
        "computations": int(_CACHE_STATS["computations"]),
        "float64_quadratures": int(_CACHE_STATS["float64_quadratures"]),
        "float64_fallbacks": int(_CACHE_STATS["float64_fallbacks"]),
        "arb_quadratures": int(_CACHE_STATS["arb_quadratures"]),
        "arb_fallbacks": int(_CACHE_STATS["arb_fallbacks"]),
        "float64_sign_selections": int(_CACHE_STATS["float64_sign_selections"]),
        "sign_selection_fallbacks": int(_CACHE_STATS["sign_selection_fallbacks"]),
    }
