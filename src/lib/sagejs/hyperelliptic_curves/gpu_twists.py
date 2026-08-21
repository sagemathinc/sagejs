"""Optional WebGPU arithmetic for quadratic-twist candidate screening.

This module is intentionally only a packed floating-point boundary.  It does
not construct local data or central weights and it never labels a GPU result
as an Arb value.  The authoritative central-weight engine supplies the exact
coefficient rows and approximation-error budget; interesting or ambiguous
rows are recomputed on the CPU.
"""

from __future__ import annotations

import math
from typing import Any

import sagejs.runtime as runtime


class GpuTwistUnavailableError(RuntimeError):
    """The optional WebGPU twist-screening backend is unavailable."""


def _host_call(operation: str, *args: Any) -> Any:
    host = runtime.reflect.get(runtime.global_object, "__sagejs_host__")
    if host is runtime.undefined or host is None:
        raise GpuTwistUnavailableError("the Sage.js Node host is unavailable")
    result = runtime.reflect.apply(
        runtime.reflect.get(host, "call"), host, [operation, list(args)]
    )
    if not bool(runtime.reflect.get(result, "ok")):
        error = runtime.reflect.get(result, "error")
        message = runtime.reflect.get(error, "message")
        raise GpuTwistUnavailableError(str(message))
    return runtime.reflect.get(result, "value")


def _property(value: Any, name: str) -> Any:
    return runtime.reflect.get(value, name)


def gpu_twist_capabilities(timeout_ms: int = 30000) -> dict[str, Any]:
    """Return optional WebGPU device capabilities without raising on absence."""
    result = {
        "available": False,
        "backend": "webgpu",
        "numeric_format": "f32",
        "authoritative": False,
        "candidate_screen_only": True,
    }
    try:
        value = _host_call("webgpuTwistCapabilities", int(timeout_ms))
    except Exception as error:
        result["reason"] = str(error)
        return result
    available = bool(_property(value, "available"))
    result["available"] = available
    for source, target in (
        ("reason", "reason"),
        ("detail", "detail"),
        ("implementation", "implementation"),
        ("vendor", "vendor"),
        ("architecture", "architecture"),
        ("device", "device"),
        ("description", "description"),
        ("reduction", "reduction"),
    ):
        item = _property(value, source)
        if item is not runtime.undefined:
            result[target] = str(item)
    return result


def _checked_finite(value: Any, name: str) -> float:
    result = float(value)
    if not math.isfinite(result):
        raise ValueError(name + " must contain only finite numbers")
    return result


def gpu_twist_dot_products(
    coefficients: Any,
    characters: Any,
    weights: Any,
    *,
    weight_errors: Any = None,
    timeout_ms: int = 120000,
) -> dict[str, Any]:
    """Compute deterministic packed f32 twist dot products on WebGPU.

    `characters` has shape `(rows, terms)` and contains only `-1,0,1`.
    `weights` has shape `(rows, orders, terms)`.  The returned error bounds
    include input conversion and sequential f32 accumulation; optional
    absolute `weight_errors` of the same shape are added term by term.
    """
    coefficient_values = []
    for value in coefficients:
        converted = int(value)
        if isinstance(value, bool) or converted != value:
            raise ValueError("coefficients must contain exact integers")
        coefficient_values.append(converted)
    terms = len(coefficient_values)
    if terms < 1:
        raise ValueError("coefficients must be nonempty")
    character_rows = [list(row) for row in characters]
    weight_rows = [[list(order) for order in row] for row in weights]
    rows = len(character_rows)
    if rows < 1 or len(weight_rows) != rows:
        raise ValueError("characters and weights must have the same nonzero rows")
    orders = len(weight_rows[0])
    if orders < 1:
        raise ValueError("weights must contain at least one derivative order")
    flat_characters: list[float] = []
    flat_weights: list[float] = []
    absolute_sums: list[float] = []
    approximation_errors: list[float] = []
    if weight_errors is None:
        error_rows = [
            [[0.0 for _index in range(terms)] for _order in range(orders)]
            for _row in range(rows)
        ]
    else:
        error_rows = [[list(order) for order in row] for row in weight_errors]
        if len(error_rows) != rows:
            raise ValueError("weight_errors must have the same shape as weights")
    for row_index in range(rows):
        character_row = character_rows[row_index]
        if len(character_row) != terms or len(weight_rows[row_index]) != orders:
            raise ValueError("inconsistent twist-dot-product row shape")
        for character in character_row:
            value = int(character)
            if value != character or value not in (-1, 0, 1):
                raise ValueError("characters must contain only -1, 0, or 1")
            flat_characters.append(float(value))
        if len(error_rows[row_index]) != orders:
            raise ValueError("weight_errors must have the same shape as weights")
        for order_index in range(orders):
            weight_row = weight_rows[row_index][order_index]
            error_row = error_rows[row_index][order_index]
            if len(weight_row) != terms or len(error_row) != terms:
                raise ValueError("every weight row must match the coefficient length")
            absolute_sum = 0.0
            approximation_error = 0.0
            for index in range(terms):
                weight = _checked_finite(weight_row[index], "weights")
                error = _checked_finite(error_row[index], "weight_errors")
                if error < 0:
                    raise ValueError("weight_errors must be nonnegative")
                flat_weights.append(weight)
                character = int(character_row[index])
                coefficient = abs(coefficient_values[index])
                absolute_sum += coefficient * abs(weight) * abs(character)
                approximation_error += coefficient * error * abs(character)
            absolute_sums.append(absolute_sum)
            approximation_errors.append(approximation_error)
    capability = gpu_twist_capabilities(timeout_ms=min(timeout_ms, 30000))
    if not capability["available"]:
        raise GpuTwistUnavailableError(
            str(capability.get("reason", "no WebGPU adapter is available"))
        )
    response = _host_call(
        "webgpuTwistDotProducts",
        rows,
        orders,
        terms,
        coefficient_values,
        flat_characters,
        flat_weights,
        int(timeout_ms),
    )
    if not bool(_property(response, "available")):
        raise GpuTwistUnavailableError(str(_property(response, "reason")))
    flat_values = [float(value) for value in _property(response, "values")]
    if len(flat_values) != rows * orders:
        raise ArithmeticError("the WebGPU result has an invalid packed length")
    # IEEE-754 round-to-nearest unit roundoff.  This deliberately assumes one
    # multiplication for each factor and sequential additions, matching WGSL.
    unit = 2.0**-24
    operations = 3 * terms + 2
    if operations * unit >= 0.5:
        raise ValueError("the f32 error model does not cover this term count")
    gamma = operations * unit / (1 - operations * unit)
    error_values = [
        gamma * absolute_sums[index] + approximation_errors[index]
        for index in range(rows * orders)
    ]
    values = tuple(
        tuple(flat_values[row * orders + order] for order in range(orders))
        for row in range(rows)
    )
    errors = tuple(
        tuple(error_values[row * orders + order] for order in range(orders))
        for row in range(rows)
    )
    provenance = dict(capability)
    provenance.update(
        {
            "shader_sha256": str(_property(response, "shaderHash")),
            "rows": rows,
            "orders": orders,
            "terms": terms,
            "error_policy": "sequential-f32-gamma-plus-weight-error",
        }
    )
    return {
        "values": values,
        "absolute_error_bounds": errors,
        "provenance": provenance,
        "rigorous": False,
        "arithmetic_balls_rigorous": False,
        "candidate_screen_only": True,
    }


__all__ = [
    "GpuTwistUnavailableError",
    "gpu_twist_capabilities",
    "gpu_twist_dot_products",
]
