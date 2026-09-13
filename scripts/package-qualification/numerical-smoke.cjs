"use strict";

const assert = require("node:assert/strict");

const MARKER = "__SAGEJS_PACKAGE_NUMERICAL_SMOKE__";

function numericalSmokeSource() {
  return String.raw`
import json
from sagejs.numerics.roots import find_root
from sagejs.numerics.optimization import least_squares, minimize

root = find_root(lambda x: x*x - 2.0, 1.0, 2.0, method="brent")
least = least_squares(
    lambda point: [point[0] - 2.0],
    [20.0],
    method="cminpack-lmdif",
)
minimum = minimize(
    lambda point: (point[0] - 2.0)**2 + (point[1] + 1.0)**2,
    [5.0, 5.0],
    bounds=[[-10.0, 10.0], [-10.0, 10.0]],
    method="nlopt-nelder-mead",
)
assert root.success and root.validation.passed
assert abs(root.value - 2.0**0.5) < 1.0e-10
assert least.success and least.validation.passed
assert least.backend == "cminpack-wasm"
assert abs(least.value[0] - 2.0) < 1.0e-10
assert minimum.success and minimum.validation.passed
assert minimum.backend == "nlopt-mit-wasm"
assert max(abs(minimum.value[0] - 2.0), abs(minimum.value[1] + 1.0)) < 1.0e-6
print(${JSON.stringify(MARKER)} + json.dumps({
    "root": root.method,
    "least_squares": least.method,
    "minimize": minimum.method,
    "truth_levels": [
        root.validation.truth_level,
        least.validation.truth_level,
        minimum.validation.truth_level,
    ],
}, sort_keys=True, separators=(",", ":")))
`;
}

function parseNumericalSmoke(result) {
  assert.equal(
    result.status,
    0,
    `numerical smoke failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
  const line = result.stdout
    .split(/\r?\n/)
    .find((candidate) => candidate.startsWith(MARKER));
  assert.ok(line, `missing numerical smoke marker in:\n${result.stdout}`);
  const payload = JSON.parse(line.slice(MARKER.length));
  assert.deepEqual(payload, {
    least_squares: "cminpack-lmdif",
    minimize: "nlopt-nelder-mead",
    root: "brent",
    truth_levels: [
      "validated_approximate",
      "validated_approximate",
      "heuristic",
    ],
  });
  return payload;
}

module.exports = { MARKER, numericalSmokeSource, parseNumericalSmoke };
