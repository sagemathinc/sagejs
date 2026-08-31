#!/usr/bin/env node
// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const root = join(__dirname, "..");

function run(executable, args, options = {}) {
  const result = spawnSync(executable, args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, SAGEJS_NATIVE_DISABLE: "1" },
    timeout: 120_000,
    ...options,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function runSagejs(source) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-numerics-"));
  const filename = join(directory, "witness.py");
  try {
    writeFileSync(filename, source);
    const executable = process.env.SAGEJS_TEST_BINARY || join(root, "bin/sagejs");
    return run(process.execPath, [executable, "--python", filename]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function runCPython(source) {
  const executable = process.env.PYTHON ||
    (process.platform === "win32" ? "python" : "python3");
  const prefix = String.raw`
import collections.abc, hashlib, json, math, sys, typing
sys.path.insert(0, ${JSON.stringify(join(root, "src/lib"))})
`;
  return run(executable, ["-I", "-c", prefix + source]);
}

const witness = String.raw`
import json
import math
from sagejs.numerics import (
    NumericalDiagnostic,
    TracePolicy,
    capabilities,
    diagnostic_registry,
    find_root,
    plan,
    root_problem,
)

assert capabilities()["schema_version"] == 1
assert {item["code"] for item in diagnostic_registry()} >= {
    "invalid_bracket", "validation_failed", "trace_truncated"
}

calls = [0]
def counted(x):
    calls[0] += 1
    return math.cos(x) - x

problem = root_problem(
    counted, 0, 1, expression="math.cos(x) - x", trace="iterations"
)
root_plan = plan(problem)
assert root_plan.method == "brent"
assert calls[0] == 0

answer = find_root(
    counted, 0, 1, expression="math.cos(x) - x", trace="iterations"
)
assert answer.success and answer.status == "converged"
assert answer.method == "brent" and answer.backend == "ordinary-python"
assert abs(answer.value - 0.7390851332151607) < 1e-14
assert answer.residual is not None and answer.residual < 1e-12
assert answer.validation.truth_level == "validated_approximate"
assert answer.trace.events[0].kind == "start"
assert answer.trace.events[-1].kind == "finish"
assert len(answer.plot().layers) == 3
assert len(answer.animate().frames) >= 2
assert "fzero" in answer.code("matlab")
assert "FindRoot" in answer.code("wolfram")
assert json.loads(answer.to_json())["problem_digest"] == problem.digest

verified = answer.verify()
assert verified.success and verified.method == "bisection"
refined = answer.refine(1e-14)
assert refined.success and abs(refined.value - answer.value) < 1e-12

for method, options in (
    ("bisection", {}),
    ("brent", {}),
    ("secant", {"x0": 1.0, "x1": 2.0}),
    ("newton", {"x0": 1.0, "derivative": lambda x: 2.0*x}),
):
    if method in ("bisection", "brent"):
        result = find_root(lambda x: x*x - 2.0, 1.0, 2.0, method=method)
    else:
        result = find_root(lambda x: x*x - 2.0, method=method, **options)
    assert result.success and abs(result.value - math.sqrt(2.0)) < 1e-11

endpoint = find_root(lambda x: x, 0.0, 1.0, method="brent")
assert endpoint.success and endpoint.status == "exact_root" and endpoint.value == 0.0

multiple = find_root(
    lambda x: (x - 1.0)**3,
    x0=1.5,
    derivative=lambda x: 3.0*(x - 1.0)**2,
    method="newton",
    maxiter=100,
)
assert multiple.success and abs(multiple.value - 1.0) < 1e-4

invalid = find_root(lambda x: x*x + 1.0, -1.0, 1.0, method="brent")
assert not invalid.success and invalid.status == "invalid_bracket"
assert "invalid_bracket" in {item.code for item in invalid.diagnostics}

discontinuous = find_root(
    lambda x: -1.0 if x < 0.0 else 1.0,
    -1.0,
    1.0,
    method="brent",
)
assert not discontinuous.success
assert not discontinuous.validation.passed
assert "validation_failed" in {item.code for item in discontinuous.diagnostics}

nonfinite = find_root(
    lambda x: float("inf") if x == 0.0 else x,
    -1.0,
    1.0,
    method="bisection",
)
assert not nonfinite.success and nonfinite.status == "nonfinite_evaluation"

zero_derivative = find_root(
    lambda x: x*x + 1.0,
    x0=0.0,
    derivative=lambda x: 2.0*x,
    method="newton",
)
assert not zero_derivative.success and zero_derivative.status == "zero_derivative"

cancelled = find_root(
    lambda x: x*x - 2.0,
    1.0,
    2.0,
    method="bisection",
    cancel=lambda: True,
)
assert not cancelled.success and cancelled.status == "cancelled"

truncated = find_root(
    lambda x: x*x - 2.0,
    1.0,
    2.0,
    method="bisection",
    max_trace_events=4,
)
assert truncated.trace.truncated
assert len(truncated.trace.events) <= 4
assert json.loads(truncated.trace.to_json())["diagnostics"][0]["code"] == "trace_truncated"

print("root numerical laboratory passed")
`;

test("root contracts and algorithms agree in CPython", () => {
  assert.equal(runCPython(witness), "root numerical laboratory passed");
});

test("root contracts and algorithms run in Sage.js", () => {
  assert.equal(runSagejs(witness), "root numerical laboratory passed");
});

test("documented schemas and exhaustive surface remain versioned", () => {
  for (const name of ["problem", "plan", "result", "trace"]) {
    const schema = JSON.parse(
      readFileSync(
        join(root, "docs/numerical-computing", `${name}.schema.json`),
        "utf8",
      ),
    );
    assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
    assert.equal(schema.type, "object");
    assert.ok(schema.required.includes("schema_version"));
  }
  const surface = JSON.parse(
    readFileSync(
      join(root, "docs/numerical-computing/surface.json"),
      "utf8",
    ),
  );
  assert.equal(surface.operations.find(({ id }) => id === "scalar_root").status, "implemented");
  run(process.execPath, [join(root, "scripts/check-numerical-surface.cjs")]);
});

test("Sage scalar view and rich result share one root engine", async () => {
  const { createSage } = require("../dist/tools/kernel.js");
  const session = await createSage();
  try {
    assert.ok(
      Math.abs(
        Number((await session.evaluate("(x^2-2).find_root(1,2)")).repr) -
          Math.SQRT2,
      ) < 1e-11,
    );
    const record = await session.evaluate(
      "r=numerical_root(x^2-2,1,2)\n(r.status,r.success,r.method,r.validation.truth_level)",
    );
    assert.equal(record.repr, "('converged', True, 'brent', 'validated_approximate')");
  } finally {
    await session.close();
  }
});

test("MATLAB fzero and Wolfram FindRoot lower to the canonical engine", async () => {
  const { createSage } = require("../dist/tools/kernel.js");
  const session = await createSage();
  try {
    const matlab = await session.evaluate("fzero(@(x) x^2 - 2, [1 2])", {
      language: "matlab",
    });
    assert.ok(Math.abs(Number(matlab.repr) - Math.SQRT2) < 1e-11);
    const wolfram = await session.evaluate(
      "FindRoot[Cos[x] == x, {x, 0, 1}]",
      { language: "wolfram" },
    );
    assert.match(wolfram.repr, /^\{x -> 0\.73908513321515/);
  } finally {
    await session.close();
  }
});
