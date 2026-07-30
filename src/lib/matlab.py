"""NumPy-backed operations for the experimental MATLAB frontend."""

from typing import Any

import numpy as np

ALL = object()


def colon(start: float, stop: float, step: float = 1) -> list[float]:
    if step == 0:
        raise ValueError("colon step must not be zero")
    count = int((stop - start) / step)
    if count < 0:
        return []
    return [start + index * step for index in range(count + 1)]


def mtimes(left: Any, right: Any) -> Any:
    if hasattr(left, "shape") and hasattr(right, "shape"):
        return left @ right
    return left * right


def times(left: Any, right: Any) -> Any:
    return left * right


def mrdivide(left: Any, right: Any) -> Any:
    return left / right


def rdivide(left: Any, right: Any) -> Any:
    return left / right


def mldivide(left: Any, right: Any) -> Any:
    raise NotImplementedError("MATLAB matrix left division is not implemented")


def ldivide(left: Any, right: Any) -> Any:
    return right / left


def mpower(value: Any, exponent: int) -> Any:
    if not hasattr(value, "shape"):
        return value ** exponent
    if exponent < 0:
        raise NotImplementedError("negative matrix powers are not implemented")
    if exponent == 0:
        size = value.shape[0]
        return np.array([
            [1 if row == column else 0 for column in range(size)]
            for row in range(size)
        ])
    result = value
    for _index in range(1, exponent):
        result = result @ value
    return result


def power(left: Any, right: Any) -> Any:
    return left ** right


def _integer_index(value: Any) -> int:
    index = int(value)
    if index != value:
        raise TypeError("MATLAB indices must be integers")
    if index < 1:
        raise IndexError("MATLAB indices start at 1")
    return index


def _linear_indices(value: Any, index_value: Any) -> tuple[int, ...]:
    index = _integer_index(index_value) - 1
    indices = []
    for dimension in value.shape:
        size = int(dimension)
        indices.append(index % size)
        index //= size
    if index:
        raise IndexError("MATLAB linear index is out of bounds")
    return tuple(indices)


def _selector_positions(
    value: Any,
    dimension: int,
) -> tuple[list[int], bool]:
    if value is ALL:
        return list(range(dimension)), False
    if hasattr(value, "tolist"):
        entries = value.tolist()
        if not isinstance(entries, list):
            entries = [entries]
            scalar = True
        else:
            scalar = False
    else:
        entries = [value]
        scalar = True
    positions = [_integer_index(entry) - 1 for entry in entries]
    for position in positions:
        if position >= dimension:
            raise IndexError("MATLAB index is out of bounds")
    return positions, scalar


def _select_nested(
    values: Any,
    selectors: list[tuple[list[int], bool]],
    depth: int = 0,
) -> Any:
    if depth == len(selectors):
        return values
    positions = selectors[depth][0]
    scalar = selectors[depth][1]
    selected = [
        _select_nested(values[position], selectors, depth + 1)
        for position in positions
    ]
    if scalar:
        return selected[0]
    return selected


def _scalar_indices(
    value: Any,
    items: tuple[Any, ...],
) -> tuple[int, ...]:
    if len(items) == 1:
        return _linear_indices(value, items[0])
    if len(items) != len(value.shape):
        raise NotImplementedError(
            "indexed access currently requires one selector per dimension")
    indices = []
    for dimension, item in zip(value.shape, items, strict=True):
        if item is ALL or hasattr(item, "tolist"):
            raise NotImplementedError(
                "indexed assignment currently requires scalar indices")
        positions, _scalar = _selector_positions(item, int(dimension))
        indices.append(positions[0])
    return tuple(indices)


def call_or_index(value: Any, *items: Any) -> Any:
    if callable(value):
        return value(*items)
    if len(items) == 1 and items[0] is not ALL and not hasattr(
        items[0], "tolist"
    ):
        return value.item(*_linear_indices(value, items[0]))
    if len(items) != len(value.shape):
        raise NotImplementedError(
            "indexed access currently requires one selector per dimension")
    selectors = [
        _selector_positions(item, int(dimension))
        for dimension, item in zip(value.shape, items, strict=True)
    ]
    if all(selector[1] for selector in selectors):
        indices = tuple(selector[0][0] for selector in selectors)
        return value.item(*indices)
    return _select_nested(value.tolist(), selectors)


def set_index(
    value: Any,
    new_value: Any,
    *items: Any,
) -> Any:
    value.__setitem__(_scalar_indices(value, items), new_value)
    return new_value
