// sagejs-test-tier: unit
// sagejs-test-platform: true
"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const { createSage } = require("../dist/tools/kernel.js");

const cases = [
  ["primitive numeric truth", String.raw`
"""Numeric truth differs from JavaScript for NaN, but not signed zero."""

import math


def conditional(value):
    if value:
        return True
    return False


for spelling in ("nan", "+nan", "-nan", "NaN", "inf", "-inf", "1.5", "-1.5"):
    value = float(spelling)
    assert bool(value) is True
    assert conditional(value) is True
    assert (not value) is False
    assert (value and "truthy") == "truthy"

for value in (
    math.nan,
    math.inf - math.inf,
    math.inf / math.inf,
    float("nan") * 0.0,
):
    assert bool(value) is True
    assert conditional(value) is True
    assert bool([value]) is True
    assert bool({"value": value}) is True
    assert any([0.0, value]) is True
    assert all([value, 1.0]) is True
    assert all([value, 0.0]) is False
    assert bool(value == value) is False
    assert bool(value != value) is True
    assert bool(value < 0.0) is False
    assert bool(value >= 0.0) is False

for spelling in ("0", "-0", "0.0", "-0.0"):
    value = float(spelling)
    assert bool(value) is False
    assert conditional(value) is False
    assert (not value) is True
    assert (value or "falsey") == "falsey"

for value, expected in (
    (False, False),
    (True, True),
    (0, False),
    (1, True),
    (-1, True),
    (2**100, True),
    ("", False),
    ("nan", True),
    (None, False),
):
    assert bool(value) is expected


class ComparisonResult:
    def __eq__(self, other):
        return float("nan")


assert bool(ComparisonResult() == object()) is True

calls = []


class CustomTruth:
    def __bool__(self):
        calls.append("called")
        return False


assert bool(CustomTruth()) is False
assert calls == ["called"]


class InvalidCustomTruth:
    def __bool__(self):
        return float("nan")


try:
    bool(InvalidCustomTruth())
except TypeError:
    pass
else:
    raise AssertionError("NaN returned by __bool__ must not be accepted")
print("numeric-truth-ok")
`, "numeric-truth-ok"],
  ["custom float-subclass truth", String.raw`
"""Subclass protocols must not be bypassed by a numeric representation path."""

events = []


class FalseFloat(float):
    def __bool__(self):
        events.append("false-hook")
        return False


class TrueFloat(float):
    def __bool__(self):
        events.append("true-hook")
        return True


for spelling in ("nan", "0.0", "-0.0", "1.5", "inf", "-inf"):
    events.clear()
    assert bool(FalseFloat(spelling)) is False
    assert bool(TrueFloat(spelling)) is True
    assert events == ["false-hook", "true-hook"]

original_error = ValueError("float truth hook failed")


class RaisingFloat(float):
    def __bool__(self):
        raise original_error


try:
    bool(RaisingFloat("nan"))
except ValueError as error:
    assert error is original_error
else:
    raise AssertionError("float subclass exception swallowed")


class InvalidFloat(float):
    def __bool__(self):
        return 1


try:
    bool(InvalidFloat("nan"))
except TypeError:
    pass
else:
    raise AssertionError("nonboolean __bool__ result accepted")


print('custom-float-truth-ok')
`, "custom-float-truth-ok"],
];
for (const mode of ["python", "sage"]) {
  for (const [name, source, expected] of cases) {
    test(`${name} (${mode})`, async t => {
      const session = await createSage({ mode });
      t.after(() => session.close());
      const result = await session.evaluate(source);
      assert.equal(result.stdout.trim(), expected);
    });
  }
}
