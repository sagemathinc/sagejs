#!/usr/bin/env node
// sagejs-test-tier: integration
// sagejs-test-portable: true
"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const root = join(__dirname, "..", "..", "..");

function run(executable, args) {
  const result = spawnSync(executable, args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, SAGEJS_NATIVE_DISABLE: "1" },
    timeout: 240_000,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

const witness = String.raw`
import base64, collections.abc, hashlib, json, math, re, sys, typing
sys.path.insert(0, ${JSON.stringify(join(root, "src/lib"))})

from sagejs.numerics.frontends import FRONTEND_LANGUAGES, UnsupportedFrontendError, create_frontend_registry

registry = create_frontend_registry()
cases = [
    ("sage", "find_root", (lambda x: math.cos(x)-x, [0, 1]), {"expression": "cos(x)-x", "options": {"method": "brent"}}),
    ("sage", "solve", ([[3, 1], [1, 2]], [9, 8]), {}),
    ("matlab", "lsqminnorm", ([[1, 0], [0, 1], [1, 1]], [1, 2, 3]), {}),
    ("sage", "eigh", ([[2, 1], [1, 2]],), {}),
    ("sage", "eig", ([[0, -1], [1, 0]],), {}),
    ("sage", "svd", ([[1, 2], [3, 4]],), {}),
    ("sage", "fft", ([1, 2, 3],), {}),
    ("matlab", "conv", ([1, 2], [3, 4]), {}),
    ("sage", "interpolate", ([0, 1, 2], [1, 2, 5]), {}),
    ("sage", "cubic_spline", ([0, 1, 2], [1, 2, 5]), {}),
    ("wolfram", "NIntegrate", (lambda x: x*x, 0, 1), {"expression": "x^2"}),
    ("matlab", "fminbnd", (lambda x: (x-2)**2, 0, 4), {"expression": "(x-2)^2"}),
    ("sage", "minimize", (lambda p: (p[0]-1)**2, [0]), {"expression": "(x0-1)^2"}),
    ("matlab", "fsolve", (lambda p: [p[0]**2-2], [1]), {"expression": ["x0^2-2"]}),
    ("sage", "nonlinear_least_squares", (lambda p: [p[0]-2], [0]), {"expression": ["x0-2"]}),
    ("matlab", "polyfit", ([0, 1, 2], [1, 3, 5]), {}),
    ("matlab", "ode45", (lambda t, y: [y[0]], [0, 0.25], [1]), {"expression": ["y0"]}),
    ("wolfram", "SageJSDescribe", ([1, 2, 3, 4],), {}),
    ("sage", "one_sample_t_test", ([1, 2, 4, 5], 2), {}),
    ("wolfram", "TwoSampleTTest", ([1, 2, 4], [2, 3, 5]), {}),
    ("sage", "linear_regression", ([0, 1, 2, 3], [1, 3, 5, 7]), {}),
    ("sage", "run_parameter_sweep", ([1, 2, 3], lambda p, c: p*p), {"expression": "parameter^2"}),
]

expected_cells = 0
executed_cells = 0
for source_language, name, arguments, options in cases:
    intent = registry.lower(source_language, name, *arguments, **options)
    adapter = registry.adapter(intent.operation_ref)
    expected_cells += len(adapter.emitters)
    for target in FRONTEND_LANGUAGES:
        if target not in adapter.emitters:
            continue
        source = registry.emit(intent, target)
        parsed = registry.parse(source, target, intent.operation_ref)
        assert parsed.digest == intent.digest, (intent.operation, target)
        # Parsing expression syntax creates a bounded IR-backed callback, so
        # the reconstructed intent itself—not the original live callback—is
        # executable through the shared numerical backend.
        result = registry.execute(parsed)
        assert result.success, (intent.operation, target, result.status)
        assert result.frontend_intent.digest == intent.digest
        executed_cells += 1

assert expected_cells == 63
assert executed_cells == expected_cells

# Prove that the trailer is not trusted as semantics. Re-sign two edited Sage
# bodies while retaining the original semantic record: both must still fail.
linear = registry.lower("sage", "solve", [[3, 1], [1, 2]], [9, 8])
source = registry.emit(linear, "sage")
assert "right = [9, 8].';" in registry.emit(linear, "matlab")
least_squares = registry.lower(
    "matlab", "lsqminnorm", [[1, 0], [0, 1], [1, 1]], [1, 2, 3]
)
assert "right = [1, 2, 3].';" in registry.emit(least_squares, "matlab")
convolution = registry.lower("matlab", "conv", [1, 2], [3, 4])
matlab_convolution = registry.emit(convolution, "matlab")
assert "left = [1, 2];" in matlab_convolution
assert "right = [3, 4];" in matlab_convolution
assert "right = [3, 4].';" not in matlab_convolution
integral = registry.lower(
    "wolfram", "NIntegrate", lambda x: x*x, 0, 1, expression="x^2"
)
matlab_integral = registry.emit(integral, "matlab")
assert "callback = @(x) x .^ 2;" in matlab_integral
assert "result = integral(callback, lower, upper);" in matlab_integral
assert "function =" not in matlab_integral
body, payload = source.rsplit("\n# sagejs-intent-v1:", 1)
envelope = json.loads(base64.urlsafe_b64decode(payload.encode("ascii")))

def resigned(changed):
    record = dict(envelope)
    record["body_sha256"] = hashlib.sha256(changed.encode("utf-8")).hexdigest()
    encoded = base64.urlsafe_b64encode(
        json.dumps(record, separators=(",", ":"), sort_keys=True).encode("utf-8")
    ).decode("ascii")
    return changed + "\n# sagejs-intent-v1:" + encoded

for changed in (
    body.replace("right = [9, 8]", "right = [9, 7]"),
    body.replace("result = solve(matrix, right)", "result = solve(right, matrix)"),
):
    try:
        registry.parse(resigned(changed), "sage", linear.operation_ref)
        raise AssertionError("re-signed semantic edit unexpectedly round-tripped")
    except UnsupportedFrontendError as error:
        assert error.diagnostic.code == "semantic_mismatch"

# MATLAB's row-vector syntax cannot distinguish a canonical one-row matrix
# from a vector. The emitter must reject that value instead of publishing a
# lossy output-only program.
one_row = registry.lower("sage", "solve", [[2, 0]], [4])
try:
    registry.emit(one_row, "matlab")
    raise AssertionError("lossy one-row MATLAB matrix unexpectedly emitted")
except UnsupportedFrontendError as error:
    assert error.diagnostic.code == "unsupported_target"

# Whole-valued floats and signed zero retain their canonical scalar type and
# sign through every value syntax.
for value in (1.0, -0.0):
    floating = registry.lower("sage", "fft", [value, 2.5])
    for target in registry.adapter(floating.operation_ref).emitters:
        parsed = registry.parse(
            registry.emit(floating, target), target, floating.operation_ref
        )
        assert parsed.digest == floating.digest

print("63 emitted numerical programs parsed and executed")
`;

test("all advertised outward programs genuinely parse and execute", () => {
  const executable = process.env.PYTHON ||
    (process.platform === "win32" ? "python" : "python3");
  assert.equal(
    run(executable, ["-I", "-c", witness]),
    "63 emitted numerical programs parsed and executed",
  );
});

test("the public audit partitions every operation/language cell", () => {
  const ledger = JSON.parse(readFileSync(
    join(
      root,
      "docs",
      "numerical-computing",
      "multilingual-roundtrip",
      "audit.json",
    ),
    "utf8",
  ));
  assert.equal(ledger.schema_version, 1);
  assert.deepEqual(ledger.languages, [
    "sage",
    "python-scipy",
    "matlab",
    "wolfram",
  ]);
  assert.equal(ledger.operations.length, 22);
  let roundTrips = 0;
  for (const operation of ledger.operations) {
    const cells = [
      ...operation.executable_round_trip,
      ...operation.output_only,
      ...operation.unsupported,
    ];
    assert.deepEqual([...cells].sort(), [...ledger.languages].sort());
    assert.equal(new Set(cells).size, ledger.languages.length);
    assert.deepEqual(operation.output_only, []);
    roundTrips += operation.executable_round_trip.length;
  }
  assert.equal(roundTrips, 63);
});
