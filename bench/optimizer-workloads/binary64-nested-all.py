"""Authenticated scalar/vector grid workload for nested binary64 reductions.

The public entry points below intentionally exercise the ordinary
`sample_scalar_grid` and `sample_vector_grid` implementations.  The guarded
helper is feasibility scaffolding for the campaign runner; neither public
entry point selects it, and it is not a production compiler route.
"""

from __future__ import annotations

import hashlib
import json
import math
from typing import Any, Callable

from sagejs.plotting.grid_sampling import (
    sample_scalar_grid as _public_sample_scalar_grid,
)
from sagejs.plotting.grid_sampling import (
    sample_vector_grid as _public_sample_vector_grid,
)


SCALAR_PLOT_POINTS = 400
VECTOR_PLOT_POINTS = 100


def _scalar_field(x_value: float, y_value: float) -> float:
    # With the standard integer-spaced grid, every result is an integral
    # Python float.  Sage.js therefore exercises its authenticated boxed-float
    # representation rather than accidentally accepting a JavaScript integer.
    return float(x_value + 2.0 * y_value)


def _vector_u(x_value: float, _y_value: float) -> float:
    # The quarter offset keeps this component in the primitive-float
    # representation while the second component below is boxed.
    return float(x_value + 0.25)


def _vector_v(_x_value: float, _y_value: float) -> float:
    return 0.0


def campaign1_scalar_grid(
    sampler: Callable[..., dict[str, Any]] = _public_sample_scalar_grid,
    plot_points: int = SCALAR_PLOT_POINTS,
) -> dict[str, Any]:
    return sampler(
        _scalar_field,
        (0.0, float(plot_points - 1)),
        (0.0, float(plot_points - 1)),
        plot_points=(plot_points, plot_points),
        max_samples=plot_points * plot_points,
    )


def campaign1_vector_grid(
    sampler: Callable[..., dict[str, Any]] = _public_sample_vector_grid,
    plot_points: int = VECTOR_PLOT_POINTS,
) -> dict[str, Any]:
    return sampler(
        (_vector_u, _vector_v),
        (0.0, float(plot_points - 1)),
        (0.0, float(plot_points - 1)),
        plot_points=(plot_points, plot_points),
        max_samples=plot_points * plot_points,
    )


def campaign1_complete_output_digest(output: dict[str, Any]) -> str:
    """Hash every published field using one cross-runtime JSON contract."""
    payload = json.dumps(
        output,
        allow_nan=False,
        separators=(",", ":"),
        sort_keys=True,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


# BEGIN CAMPAIGN1 CHECKED NESTED BINARY64 ALL
def _campaign1_original_nested_all(
    values: list[list[Any]],
    current_all: Callable[[Any], bool],
    current_isfinite: Callable[[Any], bool],
    fixed_pair: bool,
) -> bool:
    """The untouched dynamic expression used whenever a guard rejects."""
    if fixed_pair:
        return current_all(
            current_isfinite(pair[0]) and current_isfinite(pair[1])
            for row in values
            for pair in row
        )
    return current_all(current_isfinite(value) for row in values for value in row)


def _campaign1_original_float_matrix(
    values: list[list[Any]],
    current_float: Callable[[Any], float],
) -> list[list[float]]:
    """The untouched scalar float-materialization fallback expression."""
    return [[current_float(value) for value in row] for row in values]


def _campaign1_dense_own_array(
    value: Any,
    expected_prototype: Any,
) -> bool:
    import sagejs.runtime as runtime

    if (
        not runtime.array.isArray(value)
        or runtime.object.getPrototypeOf(value) is not expected_prototype
    ):
        return False
    for index in range(len(value)):
        descriptor = runtime.object.getOwnPropertyDescriptor(value, index)
        if runtime.jstype(descriptor) == "undefined" or not runtime.object.hasOwn(
            descriptor, "value"
        ):
            return False
    return True


def _campaign1_strict_float_unbox(value: Any) -> float | None:
    """Unbox only Sage.js values already proven to be Python binary64."""
    import sagejs.runtime as runtime

    if (
        runtime.reflect.get(runtime.number.prototype, "valueOf")
        is not _CAMPAIGN1_NUMBER_VALUE_OF
    ):
        return None
    if runtime.jstype(value) == "number":
        return None if runtime.number.isSafeInteger(value) else value
    if (
        value is None
        or runtime.jstype(value) != "object"
        or runtime.object.getPrototypeOf(value) is not _CAMPAIGN1_BOXED_FLOAT_PROTOTYPE
        or not runtime.object.isFrozen(value)
    ):
        return None
    try:
        return runtime.reflect.apply(_CAMPAIGN1_NUMBER_VALUE_OF, value, [])
    except Exception:
        return None


def _campaign1_checked_nested_binary64_all(
    values: list[list[Any]],
    current_all: Callable[[Any], bool],
    current_isfinite: Callable[[Any], bool],
    fixed_pair: bool,
) -> bool:
    """Checked V8 feasibility target; a rejection calls the original once."""
    import sagejs.runtime as runtime

    if (
        current_all is not _CAMPAIGN1_EXPECTED_ALL
        or current_isfinite is not _CAMPAIGN1_EXPECTED_ISFINITE
        or (fixed_pair is not True and fixed_pair is not False)
    ):
        return _campaign1_original_nested_all(
            values, current_all, current_isfinite, fixed_pair
        )
    answer = runtime.reflect.apply(
        _CAMPAIGN1_V8_NESTED_ALL,
        None,
        [
            values,
            fixed_pair,
            _CAMPAIGN1_LIST_PROTOTYPE,
            _CAMPAIGN1_PAIR_PROTOTYPE,
            _CAMPAIGN1_BOXED_FLOAT_PROTOTYPE,
            _CAMPAIGN1_NUMBER_VALUE_OF,
            _CAMPAIGN1_V8_REJECT,
        ],
    )
    if answer is _CAMPAIGN1_V8_REJECT:
        return _campaign1_original_nested_all(
            values, current_all, current_isfinite, fixed_pair
        )
    return answer


def _campaign1_checked_binary64_float_matrix(
    values: list[list[Any]],
    current_float: Callable[[Any], float],
) -> list[list[float]]:
    """Adjacent checked target retained as measured negative evidence."""
    import sagejs.runtime as runtime

    if current_float is not _CAMPAIGN1_EXPECTED_FLOAT or not _campaign1_dense_own_array(
        values, _CAMPAIGN1_LIST_PROTOTYPE
    ):
        return _campaign1_original_float_matrix(values, current_float)
    visited = 0
    for row in values:
        if not _campaign1_dense_own_array(row, _CAMPAIGN1_LIST_PROTOTYPE):
            return _campaign1_original_float_matrix(values, current_float)
        for value in row:
            visited += 1
            if visited % 1024 == 0:
                runtime.check_interrupt()
            if _campaign1_strict_float_unbox(value) is None:
                return _campaign1_original_float_matrix(values, current_float)
    # `float(exact_float)` returns that float unchanged.  Fresh outer and row
    # lists retain the public comprehension's allocation/publication contract.
    return [[value for value in row] for row in values]


def _campaign1_bind_checked_target() -> None:
    """Capture the immutable identities required by the feasibility guard."""
    import sagejs.runtime as runtime

    global _CAMPAIGN1_BOXED_FLOAT_PROTOTYPE
    global _CAMPAIGN1_EXPECTED_ALL
    global _CAMPAIGN1_EXPECTED_FLOAT
    global _CAMPAIGN1_EXPECTED_ISFINITE
    global _CAMPAIGN1_LIST_PROTOTYPE
    global _CAMPAIGN1_NUMBER_VALUE_OF
    global _CAMPAIGN1_PAIR_PROTOTYPE
    global _CAMPAIGN1_V8_NESTED_ALL
    global _CAMPAIGN1_V8_REJECT

    _CAMPAIGN1_EXPECTED_ALL = all
    _CAMPAIGN1_EXPECTED_FLOAT = float
    _CAMPAIGN1_EXPECTED_ISFINITE = math.isfinite
    _CAMPAIGN1_LIST_PROTOTYPE = runtime.object.getPrototypeOf([])
    _CAMPAIGN1_PAIR_PROTOTYPE = runtime.object.getPrototypeOf((0.0, 0.0))
    _CAMPAIGN1_BOXED_FLOAT_PROTOTYPE = runtime.object.getPrototypeOf(float(0.0))
    _CAMPAIGN1_NUMBER_VALUE_OF = runtime.reflect.get(
        runtime.number.prototype, "valueOf"
    )
    _CAMPAIGN1_V8_REJECT = runtime.object.freeze(runtime.object.create(None))
    _CAMPAIGN1_V8_NESTED_ALL = runtime.dynamic_eval(
        """(function campaign1CheckedNestedBinary64All(
            values,
            fixedPair,
            listPrototype,
            pairPrototype,
            boxedFloatPrototype,
            numberValueOf,
            reject
        ) {
            function denseOwnArray(value, prototype) {
                if (!Array.isArray(value) ||
                    Object.getPrototypeOf(value) !== prototype) return false;
                for (let index = 0; index < value.length; index += 1) {
                    const descriptor = Object.getOwnPropertyDescriptor(value, index);
                    if (!descriptor ||
                        !Object.prototype.hasOwnProperty.call(descriptor, "value")) {
                        return false;
                    }
                }
                return true;
            }
            function strictFloatUnbox(value) {
                if (Number.prototype.valueOf !== numberValueOf) return reject;
                if (typeof value === "number") {
                    return Number.isSafeInteger(value) ? reject : value;
                }
                if (value === null || typeof value !== "object" ||
                    Object.getPrototypeOf(value) !== boxedFloatPrototype ||
                    !Object.isFrozen(value)) return reject;
                try {
                    return Reflect.apply(numberValueOf, value, []);
                } catch (_error) {
                    return reject;
                }
            }
            if (!denseOwnArray(values, listPrototype)) return reject;
            let visited = 0;
            for (let rowIndex = 0; rowIndex < values.length; rowIndex += 1) {
                const row = values[rowIndex];
                if (!denseOwnArray(row, listPrototype)) return reject;
                for (let index = 0; index < row.length; index += 1) {
                    visited += 1;
                    if (visited % 1024 === 0) ρσ_check_interrupt();
                    const value = row[index];
                    if (fixedPair) {
                        if (!denseOwnArray(value, pairPrototype) ||
                            value.length !== 2 || !Object.isFrozen(value)) {
                            return reject;
                        }
                        const first = strictFloatUnbox(value[0]);
                        if (first === reject) return reject;
                        if (!Number.isFinite(first)) return false;
                        const second = strictFloatUnbox(value[1]);
                        if (second === reject) return reject;
                        if (!Number.isFinite(second)) return false;
                    } else {
                        const scalar = strictFloatUnbox(value);
                        if (scalar === reject) return reject;
                        if (!Number.isFinite(scalar)) return false;
                    }
                }
            }
            return true;
        })""",
        {},
        "campaign1-binary64-nested-all-v8",
    )["completion"]


_campaign1_bind_checked_target()
# END CAMPAIGN1 CHECKED NESTED BINARY64 ALL


def __profile_prepare__() -> None:
    # Resolve all imports, create both strict-float representations, and warm
    # both public routes before the profiler seals the prepared closure.
    campaign1_scalar_grid(plot_points=8)
    campaign1_vector_grid(plot_points=4)


def __profile_run__() -> tuple[Any, ...]:
    scalar = campaign1_scalar_grid()
    vector = campaign1_vector_grid()
    return (
        scalar["shape"],
        scalar["z"][0][0],
        scalar["z"][-1][-1],
        scalar["sampling"],
        vector["shape"],
        vector["u"][0][0],
        vector["u"][-1][-1],
        vector["maximum_magnitude"],
        vector["sampling"],
    )
