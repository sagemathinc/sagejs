"""Exact finite leaves avoid paths, without changing materialization semantics."""

import math
from collections.abc import Mapping, Sequence

from sagejs.numerics import _json
from sagejs.numerics._json import canonical_json, materialize_json

# Construct signed zero at runtime to isolate the materializer's behavior.
values = [0.0, float("-0.0"), 5e-324, -5e-324, 1e308, -1e308, 1.5]
shared = {"values": values}
source = {"z": shared, "a": [shared, None, True, 3, "β"]}
result = materialize_json(source)
assert result == source, "JSON corpus line 13"
assert list(result) == ["a", "z"], "JSON corpus line 14"
assert result is not source, "JSON corpus line 15"
assert result["z"] is not shared, "JSON corpus line 16"
assert result["a"][0] is not result["z"], "JSON corpus line 17"
assert result["z"]["values"] is not values, "JSON corpus line 18"
# repr inspects the retained sign. The existing dynamic math.copysign wrapper
# incorrectly ignores negative zero, so it is not an independent sign oracle.
assert repr(result["z"]["values"][1]) == "-0.0", "retained zero sign"
result["z"]["values"][0] = 9.0
assert values[0] == 0.0 and result["a"][0]["values"][0] == 0.0, "JSON corpus line 23"


def failure(value, exception, message):
    try:
        materialize_json(value, "$root")
    except exception as error:
        assert str(error) == message, str(error)
    else:
        raise AssertionError("invalid JSON accepted")


for bad in (float("inf"), float("-inf"), float("nan")):
    failure(
        {"a": [1.0, {"b": bad}]}, ValueError, "$root.a[1].b contains a non-finite float"
    )
    failure([1.0, bad], ValueError, "$root[1] contains a non-finite float")
failure({1: 2.0}, TypeError, "$root must contain only string mapping keys")
failure([b"a"], TypeError, "$root[0] contains a non-JSON value of type bytes")

finite_checks = []
# The session and the precompiled numerical module must share the public
# dependency. Patching a private copy would hide a browser import regression.
assert _json.math is math, "canonical math dependency"
original_isfinite = math.isfinite


def counted_isfinite(value):
    finite_checks.append(value)
    return original_isfinite(value)


math.isfinite = counted_isfinite
try:
    assert materialize_json({"x": [1.0, 2.0]}) == {"x": [1.0, 2.0]}, (
        "JSON corpus line 54"
    )
    failure([float("inf")], ValueError, "$root[0] contains a non-finite float")
    assert finite_checks == [1.0, 2.0, float("inf")], repr(finite_checks)
finally:
    math.isfinite = original_isfinite


class TaggedFloat(float):
    pass


# Exact-type specialization must not replace the existing subclass predicate.
# CPython accepts these subclasses. Current Sage.js math.isfinite rejects
# them; retain that explicit underlying limitation, rather than silently
# coercing a subclass in the new leaf path. If that predicate gains support,
# the same witness automatically requires the supported identity semantics.
for tagged in (TaggedFloat(1.25), TaggedFloat("inf")):
    try:
        finite = math.isfinite(tagged)
    except TypeError as error:
        failure([tagged], TypeError, str(error))
    else:
        if finite:
            assert materialize_json([tagged])[0] is tagged, "JSON corpus line 77"
        else:
            failure([tagged], ValueError, "$root[0] contains a non-finite float")

events = []


class ObservedMapping(Mapping):
    def __iter__(self):
        events.append("iter")
        return iter(["z", "a"])

    def __len__(self):
        return 2

    def __getitem__(self, key):
        events.append(key)
        return 2.0 if key == "z" else 1.0


assert materialize_json(ObservedMapping()) == {"a": 1.0, "z": 2.0}, (
    "JSON corpus line 97"
)
assert events == ["iter", "a", "z"], "JSON corpus line 98"
events.clear()


class ObservedSequence(Sequence):
    def __len__(self):
        events.append("len")
        return 3

    def __getitem__(self, index):
        events.append(index)
        return [1.0, -0.0, None][index]


assert materialize_json(ObservedSequence()) == [1.0, -0.0, None], "JSON corpus line 112"
assert events == ["len", 0, 1, 2], "JSON corpus line 113"

# An explicitly supplied diagnostic-path object can have observable addition;
# only ordinary string paths may skip eager path construction.
events.clear()


class ObservedPath:
    def __add__(self, suffix):
        events.append(suffix)
        return "$root" + suffix


assert materialize_json([1.0], ObservedPath()) == [1.0], "JSON corpus line 126"
assert events == ["["], "custom sequence diagnostic path"
events.clear()
assert materialize_json({"x": 1.0}, ObservedPath()) == {"x": 1.0}, (
    "JSON corpus line 129"
)
assert events == ["."], "custom mapping diagnostic path"
assert canonical_json({"z": [1.0, 2.0], "a": "β"}) == '{"a":"β","z":[1.0,2.0]}', (
    "JSON corpus line 131"
)
print("JSON leaves passed")
