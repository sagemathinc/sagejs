"""Deterministic JSON materialization for semantic plot specifications."""

from __future__ import annotations

import json
import math
from collections.abc import Mapping, Sequence
from typing import Any, TypeAlias

JSONScalar: TypeAlias = None | bool | int | float | str
JSONValue: TypeAlias = JSONScalar | list["JSONValue"] | dict[str, "JSONValue"]


def _path_key(path: str, key: str) -> str:
    return path + "." + key


def materialize_json(value: Any, path: str = "$") -> JSONValue:
    """Return a detached, deterministic, JSON-safe form of `value`.

    Mapping keys are sorted and must be strings. Tuples and other non-string
    sequences become lists. Non-finite floating-point values become `None`,
    which is Plotly's portable representation for a missing datum and a gap in
    a line. Other objects are rejected instead of being stringified silently.
    """
    if value is None or isinstance(value, (bool, int, str)):
        return value
    if isinstance(value, float):
        if math.isfinite(value):
            return value
        return None
    if isinstance(value, Mapping):
        keys: list[str] = []
        for key in value:
            if not isinstance(key, str):
                raise TypeError(path + " must contain only string mapping keys")
            keys.append(key)
        keys.sort()
        output: dict[str, JSONValue] = {}
        for key in keys:
            output[key] = materialize_json(value[key], _path_key(path, key))
        return output
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        sequence: list[JSONValue] = []
        for index in range(len(value)):
            sequence.append(
                materialize_json(value[index], path + "[" + str(index) + "]")
            )
        return sequence
    raise TypeError(path + " contains a non-JSON value of type " + type(value).__name__)


def materialize_object(value: Any, path: str) -> dict[str, JSONValue]:
    """Materialize `value` and require a JSON object."""
    answer = materialize_json({} if value is None else value, path)
    if not isinstance(answer, dict):
        raise TypeError(path + " must be a mapping")
    return answer


def materialize_array(value: Any, path: str) -> list[JSONValue]:
    """Materialize `value` and require a JSON array."""
    answer = materialize_json([] if value is None else value, path)
    if not isinstance(answer, list):
        raise TypeError(path + " must be a sequence")
    return answer


def canonical_json(value: Any) -> str:
    """Serialize `value` as stable compact JSON with lexically sorted keys."""
    return json.dumps(
        materialize_json(value),
        allow_nan=False,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    )
