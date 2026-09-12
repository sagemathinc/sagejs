"""Deterministic JSON materialization for numerical computation records."""

from __future__ import annotations

import json
import math
from collections.abc import Mapping, Sequence
from typing import Any, TypeAlias

JSONScalar: TypeAlias = None | bool | int | float | str
JSONValue: TypeAlias = JSONScalar | list["JSONValue"] | dict[str, "JSONValue"]


def materialize_json(value: Any, path: str = "$") -> JSONValue:
    """Return a detached JSON-safe representation of `value`.

    Numerical records reject non-finite scalars instead of silently converting
    them to JSON extensions. Algorithms must classify such values before a
    result is serialized.
    """
    if value is None or isinstance(value, (bool, int, str)):
        return value
    if isinstance(value, float):
        if not math.isfinite(value):
            raise ValueError(path + " contains a non-finite float")
        return value
    if isinstance(value, Mapping):
        keys: list[str] = []
        for key in value:
            if not isinstance(key, str):
                raise TypeError(path + " must contain only string mapping keys")
            keys.append(key)
        keys.sort()
        answer: dict[str, JSONValue] = {}
        plain_path = type(path) is str
        for key in keys:
            item = value[key]
            kind = type(item)
            if (
                plain_path
                and type(key) is str
                and (
                    item is None
                    or kind is float
                    or kind is int
                    or kind is bool
                    or kind is str
                )
            ):
                if item is not None and kind is float and not math.isfinite(item):
                    raise ValueError(path + "." + key + " contains a non-finite float")
                answer[key] = item
            else:
                answer[key] = materialize_json(item, path + "." + key)
        return answer
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        answer_list: list[JSONValue] = []
        plain_path = type(path) is str
        for index in range(len(value)):
            item = value[index]
            kind = type(item)
            # Exact scalar leaves need neither recursive dispatch nor a path
            # string unless invalid. Subclasses and custom paths retain the
            # general validator and its observable operations.
            if plain_path and (
                item is None
                or kind is float
                or kind is int
                or kind is bool
                or kind is str
            ):
                if item is not None and kind is float and not math.isfinite(item):
                    raise ValueError(
                        path + "[" + str(index) + "] contains a non-finite float"
                    )
                answer_list.append(item)
            else:
                answer_list.append(
                    materialize_json(item, path + "[" + str(index) + "]")
                )
        return answer_list
    raise TypeError(path + " contains a non-JSON value of type " + type(value).__name__)


def materialize_object(value: Any, path: str) -> dict[str, JSONValue]:
    answer = materialize_json({} if value is None else value, path)
    if not isinstance(answer, dict):
        raise TypeError(path + " must be a mapping")
    return answer


def materialize_array(value: Any, path: str) -> list[JSONValue]:
    answer = materialize_json([] if value is None else value, path)
    if not isinstance(answer, list):
        raise TypeError(path + " must be a sequence")
    return answer


def canonical_json(value: Any) -> str:
    return json.dumps(
        materialize_json(value),
        allow_nan=False,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    )
