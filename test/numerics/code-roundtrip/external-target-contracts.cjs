#!/usr/bin/env node
// sagejs-test-tier: integration
// sagejs-test-portable: true
"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const {
  createTreeSitterParser,
  firstSyntaxError,
} = require("../../../dist/tools/foreign/tree-sitter.js");

const root = join(__dirname, "..", "..", "..");
const evidence = JSON.parse(readFileSync(
  join(
    root,
    "docs",
    "numerical-computing",
    "multilingual-roundtrip",
    "target-evidence.json",
  ),
  "utf8",
));

function runPython(source) {
  const executable = process.env.PYTHON ||
    (process.platform === "win32" ? "python" : "python3");
  const result = spawnSync(executable, ["-I", "-c", source], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, SAGEJS_NATIVE_DISABLE: "1" },
    timeout: 240_000,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

const witness = String.raw`
import base64, collections.abc, hashlib, json, math, re, sys, typing
sys.path.insert(0, ${JSON.stringify(join(root, "src/lib"))})

from sagejs.numerics.frontends import UnsupportedFrontendError, create_frontend_registry

registry = create_frontend_registry()
cases = [
    ("sage", "find_root", (lambda x: x*x-2, [1, 2]), {"expression": "x^2-2"}),
    ("sage", "solve", ([[3, 1], [1, 2]], [1+2j, 3-4j]), {}),
    ("sage", "linear_least_squares", ([[1, 0], [0, 1], [1, 1]], [1, 2, 3]), {}),
    ("sage", "fft", ([1, 2, 3],), {}),
    ("sage", "convolve", ([1, 2], [3, 4]), {}),
    ("sage", "integrate", (lambda x: x*x/(x+1)**2, 0, 1), {"expression": "x*x/(x+1)^2"}),
    ("sage", "minimize_scalar", (lambda x: (x-2)**2, 0, 4), {"expression": "(x-2)^2"}),
    ("sage", "minimize", (lambda p: (p[0]-1)**2+(p[1]+2)**2, [0, 0]), {"expression": "(x0-1)^2+(x1+2)^2"}),
    ("sage", "solve_nonlinear_system", (lambda p: [p[0]+p[1]-3, p[0]-p[1]-1], [1, 1]), {"expression": ["x0+x1-3", "x0-x1-1"]}),
    ("sage", "nonlinear_least_squares", (lambda p: [p[0]-2, p[1]+1], [0, 0]), {"expression": ["x0-2", "x1+1"]}),
    ("sage", "linear_fit", ([0, 1, 2], [1, 3, 5]), {}),
    ("sage", "solve_ivp", (lambda t, y: [y[1], -y[0]], [0, 1], [1, 0]), {"expression": ["y1", "-y0"]}),
    ("sage", "describe", ([1, 2, 3, 4],), {}),
]

programs = []
for source_language, name, arguments, options in cases:
    intent = registry.lower(source_language, name, *arguments, **options)
    adapter = registry.adapter(intent.operation_ref)
    for language in ("matlab", "wolfram"):
        if language not in adapter.emitters:
            continue
        source = registry.emit(intent, language)
        marker = "\n% sagejs-intent-v1:" if language == "matlab" else "\n(* sagejs-intent-v1:"
        body = source.split(marker, 1)[0]
        programs.append({
            "operation": intent.operation_ref.key,
            "language": language,
            "body": body,
        })

# User-selected callback identifiers must not turn into target keywords or
# Wolfram pattern syntax.
for language, parameter in (("matlab", "function"), ("matlab", "_x"), ("wolfram", "x_0"), ("wolfram", "Pi")):
    intent = registry.lower(
        "sage", "integrate", lambda x: x*x, 0, 1,
        expression=parameter + "^2", parameters=[parameter]
    )
    try:
        registry.emit(intent, language)
        raise AssertionError("unsafe target callback identifier unexpectedly emitted")
    except UnsupportedFrontendError as error:
        assert error.diagnostic.code == "unsupported_target"

for language, variable in (("matlab", "function"), ("wolfram", "x_0")):
    intent = registry.lower(
        "sage", "find_root", lambda x: x*x-2, [1, 2],
        expression=variable + "^2-2", variable=variable
    )
    try:
        registry.emit(intent, language)
        raise AssertionError("unsafe target root variable unexpectedly emitted")
    except UnsupportedFrontendError as error:
        assert error.diagnostic.code == "unsupported_target"

print(json.dumps(programs, sort_keys=True))
`;

const programs = runPython(witness);

function key(record) {
  return `${record.operation}|${record.language}`;
}

test("external-target evidence covers every advertised MATLAB/Wolfram emitter", () => {
  assert.equal(evidence.schema_version, 1);
  assert.equal(evidence.external_runtime_execution.matlab.status, "not_run");
  assert.equal(evidence.external_runtime_execution.wolfram.status, "not_run");
  assert.equal(evidence.external_runtime_execution.matlab.qualified, false);
  assert.equal(evidence.external_runtime_execution.wolfram.qualified, false);

  const emittedKeys = programs.map(key).sort();
  const evidenceKeys = evidence.programs.map(key).sort();
  assert.deepEqual(evidenceKeys, emittedKeys);
  assert.equal(new Set(evidenceKeys).size, evidenceKeys.length);
  assert.equal(evidenceKeys.length, 19);

  for (const record of evidence.programs) {
    assert.equal(record.vendor_runtime_executed, false, key(record));
    assert.equal(record.vendor_runtime_qualified, false, key(record));
    assert.ok(record.official_references.length > 0, key(record));
    assert.ok(record.result_convention.length > 0, key(record));
    assert.ok(record.shape_convention.length > 0, key(record));
  }
});

test("every advertised external-target body passes its vendored grammar", async () => {
  const parsers = {
    matlab: await createTreeSitterParser("tree-sitter-matlab.wasm"),
    wolfram: await createTreeSitterParser("tree-sitter-wolfram.wasm"),
  };
  try {
    for (const program of programs) {
      const tree = parsers[program.language].parse(program.body);
      try {
        const error = firstSyntaxError(tree.rootNode);
        assert.equal(
          error,
          undefined,
          `${key(program)} grammar error: ${error?.type} ${error?.text}`,
        );
      } finally {
        tree.delete();
      }
    }
  } finally {
    parsers.matlab.delete();
    parsers.wolfram.delete();
  }
});

test("golden target contracts enforce syntax, shape, callback, and result conventions", () => {
  const byKey = new Map(programs.map((program) => [key(program), program]));
  for (const record of evidence.programs) {
    const source = byKey.get(key(record))?.body;
    assert.equal(typeof source, "string", key(record));
    for (const fragment of record.required_source_fragments) {
      assert.ok(
        source.includes(fragment),
        `${key(record)} lacks ${fragment}\n--- emitted body ---\n${source}`,
      );
    }
    for (const fragment of record.forbidden_source_fragments) {
      assert.ok(!source.includes(fragment), `${key(record)} contains ${fragment}`);
    }
  }
});
