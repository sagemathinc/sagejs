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
const {
  loadLiveSurface,
  validateSurface,
} = require("../../../scripts/check-numerical-surface.cjs");
const {
  SUBJECT_KINDS,
} = require("../../../scripts/numerical-computing/contracts.cjs");

function runPython(source) {
  const executable = process.env.PYTHON ||
    (process.platform === "win32" ? "python" : "python3");
  const prefix = String.raw`
import collections.abc, hashlib, json, math, sys, typing
sys.path.insert(0, ${JSON.stringify(join(root, "src/lib"))})
`;
  const result = spawnSync(executable, ["-I", "-c", prefix + source], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, SAGEJS_NATIVE_DISABLE: "1" },
    timeout: 180_000,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

test("the retained ledger is derived exhaustively from public registries", () => {
  const live = loadLiveSurface();
  validateSurface(structuredClone(live), live);

  const omitted = structuredClone(live);
  omitted.capability_operations.pop();
  assert.throws(() => validateSurface(omitted, live), /ledger is stale/);

  const misclassified = structuredClone(live);
  misclassified.frontend_operations[0].classification = "unsupported";
  assert.throws(() => validateSurface(misclassified, live), /ledger is stale/);
});

test("npm is a first-class qualification subject in code and schemas", () => {
  assert.ok(SUBJECT_KINDS.includes("npm"));
  const schemaPaths = [
    "capability-manifest.schema.json",
    "matrix-policy.schema.json",
    "run-receipt.schema.json",
  ];
  for (const filename of schemaPaths) {
    const text = readFileSync(
      join(root, "docs/numerical-computing/qualification", filename),
      "utf8",
    );
    assert.match(text, /"enum"\s*:\s*\[[^\]]*"npm"/s, filename);
  }
});

test("common records expose honest budgets, bindings, limitations, and code ownership", () => {
  const witness = String.raw`
from sagejs.numerics import capabilities
from sagejs.numerics.frontends import create_frontend_registry, matlab_fzero_intent
from sagejs.numerics.model import (
    NumericalPlan,
    NumericalProblem,
    NumericalResult,
    NumericalValidation,
    ResourceBudget,
)

registry = capabilities()
assert registry["schema_version"] == 3
assert "sweeps.parameter_sweep" in registry["operation_index"]
budget_contract = registry["resource_budget_contract"]
assert budget_contract["not_common_fields"]["max_callback_depth"] == "unsupported_common_contract"
assert budget_contract["not_common_fields"]["max_memory_bytes"] == "domain_specific_only"
sweep = registry["operation_index"]["sweeps.parameter_sweep"]["capability"]
assert "max_memory_bytes" in sweep["resource_budgets"]["cooperative"]

frontend = create_frontend_registry()
metadata = frontend.metadata()
assert len(metadata) == len(registry["frontend_index"])
first_key = metadata[0]["operation_key"]
metadata[0]["aliases"].clear()
assert frontend.metadata()[0]["operation_key"] == first_key
assert frontend.metadata()[0]["aliases"]

digest_a = "a" * 64
digest_b = "b" * 64
digest_c = "c" * 64
problem = NumericalProblem(
    "test",
    "external_operation",
    function_record={"kind": "none", "replayable": True},
)
plan = NumericalPlan(
    problem,
    method="external-method",
    backend="external-wasm",
    reason="explicit contract witness",
    capability={},
    execution_target={
        "implementation_kind": "external_library_wasm",
        "source_digest": digest_a,
        "artifact_sha256": digest_b,
        "qualification_receipt_sha256": digest_c,
    },
)
assert plan.execution_target["binding_status"] == "receipt_qualified"
result = NumericalResult(
    problem,
    plan,
    success=True,
    status="converged",
    value=1.0,
    validation=NumericalValidation("validated_approximate", True),
    provenance={
        "implementation": "external-wasm",
        "implementation_kind": "external_library_wasm",
    },
    limitations=["finite_precision"],
    domain_payload={"limitations": {"research_scale": "unsupported"}},
)
record = result.to_dict()
assert record["provenance"]["artifact_sha256"] == digest_b
assert record["provenance"]["execution_binding_status"] == "receipt_qualified"
assert [item["code"] for item in record["limitations"]] == [
    "finite_precision", "research_scale"
]

intent = matlab_fzero_intent(
    lambda x: math.cos(x) - x,
    [0.0, 1.0],
    {"Method": "brent"},
    expression="cos(x) - x",
)
wrapped = frontend.execute(intent)
assert "fzero" in wrapped.to_code("matlab")
try:
    wrapped.numerical_result.to_code("matlab")
    raise AssertionError("canonical result unexpectedly emitted frontend code")
except NotImplementedError as error:
    assert "FrontendExecutionResult" in str(error)

print("common numerical contracts passed")
`;
  assert.equal(runPython(witness), "common numerical contracts passed");
});
