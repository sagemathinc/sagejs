"""NumPy-backed operations for the experimental MATLAB frontend."""

from typing import Any

import numpy as np


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


def call_or_index(value: Any, *items: Any) -> Any:
    if callable(value):
        return value(*items)
    if len(items) != 1 or not isinstance(items[0], int):
        raise NotImplementedError(
            "the initial MATLAB frontend supports one integer index")
    index = items[0]
    if index < 1:
        raise IndexError("MATLAB indices start at 1")
    return value[index - 1]
