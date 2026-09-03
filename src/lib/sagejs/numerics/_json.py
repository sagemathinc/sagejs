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
        for key in keys:
            answer[key] = materialize_json(value[key], path + "." + key)
        return answer
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        answer_list: list[JSONValue] = []
        for index in range(len(value)):
            answer_list.append(
                materialize_json(value[index], path + "[" + str(index) + "]")
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
