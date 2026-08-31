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
assert render_expression(
    expression_record("x != 0", language="python", parameters=("x",)),
    "matlab",
) == "x ~= 0"

for source, parameters in (
    ("x + unbound", ("x",)),
    ("sin(x, 1)", ("x",)),
    ("1e9999 * x", ("x",)),
):
    try:
        expression_record(source, language="sage", parameters=parameters)
        raise AssertionError("invalid numerical expression unexpectedly parsed")
    except UnsupportedFrontendError as error:
        assert error.diagnostic.code == "parse_failure"

opaque = matlab_fzero_intent(lambda x: x, [0])
try:
    emit_code(opaque, "wolfram")
    raise AssertionError("opaque callback unexpectedly emitted")
except UnsupportedFrontendError as error:
    assert error.diagnostic.code == "non_replayable_intent"

try:
    registry.lower("matlab", "definitely_not_numerical", 1)
    raise AssertionError("unknown operation unexpectedly lowered")
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
assert len(create_frontend_registry().operations()) == 22

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

const adversarialWitness = String.raw`
import base64, hashlib, json, sys
sys.path.insert(0, ${JSON.stringify(join(root, "src/lib"))})

from sagejs.numerics.frontends import (
    NumericalFrontendIntent,
    OperationRef,
    UnsupportedFrontendError,
)
from sagejs.numerics.frontends.portable import (
    attach_intent,
    parse_attached_intent,
    portable_value,
)

deep = 0
for _ in range(70):
    deep = [deep]
try:
    portable_value(deep)
    raise AssertionError("deep portable operand unexpectedly accepted")
except ValueError as error:
    assert "nesting depth" in str(error)

try:
    portable_value([0] * 100001)
    raise AssertionError("oversized portable operand unexpectedly accepted")
except ValueError as error:
    assert "node count" in str(error)

operation = OperationRef("test", "budget", 1)
intent = NumericalFrontendIntent(
    operation,
    operands={"value": 1},
    source_language="sage",
    source_name="budget",
)
try:
    attach_intent("x" * 2000001, intent, "sage")
    raise AssertionError("oversized emitted body unexpectedly accepted")
except ValueError as error:
    assert "byte budget" in str(error)

body = "result = 1"
semantic = intent.semantic_dict()
semantic["operands"] = {"value": deep}
envelope = {
    "body_sha256": hashlib.sha256(body.encode("utf-8")).hexdigest(),
    "semantic": semantic,
}
payload = base64.urlsafe_b64encode(
    json.dumps(envelope, separators=(",", ":"), sort_keys=True).encode("utf-8")
).decode("ascii")
try:
    parse_attached_intent(body + "\n# sagejs-intent-v1:" + payload, "sage", operation)
    raise AssertionError("deep numerical envelope unexpectedly parsed")
except UnsupportedFrontendError as error:
    assert error.diagnostic.code == "parse_failure"

print("multilingual frontend budgets passed")
`;

test("portable operands and emitted envelopes enforce resource budgets", () => {
  const executable = process.env.PYTHON ||
    (process.platform === "win32" ? "python" : "python3");
  assert.equal(
    run(executable, ["-I", "-c", adversarialWitness]),
    "multilingual frontend budgets passed",
  );
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

  const catalog = JSON.parse(
    readFileSync(
      join(__dirname, "fixtures", "catalog-references.json"),
      "utf8",
    ),
  );
  assert.equal(catalog.schema_version, 1);
  assert.ok(catalog.references.length >= 12);
  assert.deepEqual(
    [...new Set(catalog.references.map(({ system }) => system))].sort(),
    ["matlab", "python-scipy", "sage", "wolfram"],
  );
  for (const reference of catalog.references) {
    assert.match(reference.source_url, /^https:\/\//);
    assert.equal(reference.accessed, "2026-08-31");
    assert.equal(reference.redistribution, "facts-and-original-fixtures-only");
    assert.equal(reference.vendor_output_included, false);
  }
  assert.equal(catalog.original_cases.length, 3);
});

test("the support ledger classifies every foundational operation", () => {
  const ledger = JSON.parse(
    readFileSync(
      join(
        root,
        "docs",
        "numerical-computing",
        "multilingual",
        "support-matrix.json",
      ),
      "utf8",
    ),
  );
  assert.equal(ledger.schema_version, 1);
  assert.deepEqual(
    ledger.runtime_languages,
    ["sage", "python-scipy", "matlab", "wolfram"],
  );
  assert.equal(ledger.operations.length, 22);
  for (const operation of ledger.operations) {
    const classified = new Set([
      ...operation.emit,
      ...(operation.unsupported || []),
    ]);
    assert.deepEqual(
      [...classified].sort(),
      [...ledger.runtime_languages].sort(),
      operation.operation,
    );
  }
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
