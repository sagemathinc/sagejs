#!/usr/bin/env node
// sagejs-test-tier: integration
// sagejs-test-portable: true
"use strict";

const assert = require("node:assert/strict");
const {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const root = join(__dirname, "..", "..", "..");

function run(executable, args) {
  const result = spawnSync(executable, args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, SAGEJS_NATIVE_DISABLE: "1" },
    timeout: 120_000,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

const witness = String.raw`
import collections.abc, hashlib, json, math, re, sys, typing
sys.path.insert(0, ${JSON.stringify(join(root, "src/lib"))})

from sagejs.numerics.frontends import (
    FRONTEND_LANGUAGES,
    SCALAR_ROOT,
    FrontendDiagnostic,
    FrontendRegistry,
    NumericalFrontendIntent,
    OperationAdapter,
    OperationRef,
    UnsupportedFrontendError,
    create_frontend_registry,
    emit_code,
    execute_scalar_root_intent,
    expression_record,
    intent_from_root_problem,
    matlab_fzero_intent,
    parse_code,
    render_expression,
)

intent = matlab_fzero_intent(
    lambda x: math.cos(x) - x,
    [0, 1],
    {"Method": "brent", "TolX": 1e-12},
    expression="cos(x) - x",
)
assert intent.operation == "scalar_root"
assert intent.replayable
assert intent.to_dict()["operation"] == {
    "domain": "roots", "name": "scalar_root", "version": 1
}
assert NumericalFrontendIntent.from_dict(intent.to_dict()).digest == intent.digest

registry = create_frontend_registry()
for language in FRONTEND_LANGUAGES:
    source = registry.emit(intent, language)
    reconstructed = registry.parse(source, language, SCALAR_ROOT)
    assert reconstructed.digest == intent.digest, (language, source)

answer = registry.execute(intent)
assert answer.success and abs(answer.value - 0.7390851332151607) < 1e-14
source_intent = answer.problem.source_intent["source"]["frontend_intent"]
assert source_intent["operation"]["name"] == "scalar_root"
assert intent_from_root_problem(answer.problem, answer.method).digest == intent.digest

tree = expression_record("Exp[-x] + Sin[x]^2", language="wolfram")
assert render_expression(tree, "python-scipy") == "np.exp(-x) + np.sin(x) ** 2"
assert render_expression(tree, "matlab") == "exp(-x) + sin(x) ^ 2"
assert render_expression(expression_record("e^x", language="sage"), "matlab") == "exp(1) ^ x"

opaque = matlab_fzero_intent(lambda x: x, [0])
try:
    emit_code(opaque, "wolfram")
    raise AssertionError("opaque callback unexpectedly emitted")
except UnsupportedFrontendError as error:
    assert error.diagnostic.code == "non_replayable_intent"

try:
    registry.lower("matlab", "ode45", lambda x: x, [0, 1])
    raise AssertionError("unregistered operation unexpectedly lowered")
except UnsupportedFrontendError as error:
    assert error.diagnostic.code == "unsupported_operation"
    assert error.diagnostic.to_dict()["language"] == "matlab"

# A later numerical domain registers locally; no shared registry is edited.
operation = OperationRef("test-domain", "sample_operation", 1)
def lower_sample(value):
    return NumericalFrontendIntent(
        operation,
        operands={"value": value},
        source_language="matlab",
        source_name="sample",
    )
adapter = OperationAdapter(
    operation,
    aliases={"matlab": ("sample",)},
    lowerers={"matlab": lower_sample},
    emitters={"sage": lambda record: "sample(" + str(record.operands["value"]) + ")"},
)
local = FrontendRegistry((adapter,))
sample = local.lower("matlab", "sample", 7)
assert local.emit(sample, "sage") == "sample(7)"
assert len(create_frontend_registry().operations()) == 1

print("multilingual numerical frontend witness passed")
`;

test("canonical intent and four-language round trips agree in CPython", () => {
  const executable = process.env.PYTHON ||
    (process.platform === "win32" ? "python" : "python3");
  assert.equal(
    run(executable, ["-I", "-c", witness]),
    "multilingual numerical frontend witness passed",
  );
});

test("canonical intent and code generation run in Sage.js", () => {
  const executable = process.env.SAGEJS_TEST_BINARY || join(root, "bin/sagejs");
  const directory = mkdtempSync(join(tmpdir(), "sagejs-multilingual-"));
  const filename = join(directory, "witness.py");
  try {
    writeFileSync(filename, witness);
    assert.equal(
      run(process.execPath, [executable, "--python", filename]),
      "multilingual numerical frontend witness passed",
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("offline reference fixtures are provenance-complete and non-executable", () => {
  const fixture = JSON.parse(
    readFileSync(
      join(__dirname, "fixtures", "scalar-root-references.json"),
      "utf8",
    ),
  );
  assert.equal(fixture.schema_version, 1);
  assert.deepEqual(
    fixture.references.map(({ system }) => system),
    ["sage", "python-scipy", "matlab", "wolfram"],
  );
  for (const reference of fixture.references) {
    assert.match(reference.source_url, /^https:\/\//);
    assert.equal(reference.redistribution, "facts-and-original-fixtures-only");
    assert.equal(reference.vendor_output_included, false);
  }
  assert.equal(fixture.cases.length, 3);
});

test("the documented intent schema accepts the checked fixture shape", () => {
  const schema = JSON.parse(
    readFileSync(
      join(
        root,
        "docs",
        "numerical-computing",
        "multilingual",
        "intent.schema.json",
      ),
      "utf8",
    ),
  );
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.ok(schema.required.includes("operation"));
  assert.equal(schema.properties.schema_version.const, 1);
});
