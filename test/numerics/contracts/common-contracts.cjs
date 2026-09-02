#!/usr/bin/env node
// sagejs-test-tier: integration
// sagejs-test-portable: true
"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const Ajv2020 = require("ajv/dist/2020").default;

const root = join(__dirname, "..", "..", "..");
const {
  loadLiveDiagnostics,
  loadLiveSurface,
  validateSupportingDocuments,
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

function commonSchemaValidators() {
  const ajv = new Ajv2020({
    allErrors: true,
    allowUnionTypes: true,
    strict: true,
  });
  const schemas = {};
  for (const name of ["diagnostic", "trace", "problem", "plan", "result"]) {
    const schema = JSON.parse(readFileSync(
      join(root, "docs/numerical-computing", `${name}.schema.json`),
      "utf8",
    ));
    schemas[name] = schema;
    ajv.addSchema(schema);
  }
  return {
    schemas,
    validators: Object.fromEntries(
      Object.entries(schemas).map(([name, schema]) => [name, ajv.getSchema(schema.$id)]),
    ),
  };
}

function assertSchemaValid(validator, value, label) {
  assert.equal(
    validator(value),
    true,
    `${label} violates its Draft 2020-12 schema: ${JSON.stringify(validator.errors)}`,
  );
}

function assertSchemaInvalid(validator, value, label) {
  assert.equal(validator(value), false, `${label} unexpectedly passed its schema`);
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

  const targetless = structuredClone(live);
  const implemented = targetless.capability_operations.find(
    (item) => item.status === "implemented",
  );
  implemented.implementation_targets = { platforms: [], runtimes: [] };
  assert.throws(
    () => validateSurface(targetless, targetless),
    /implemented capability operation has no targets/,
  );

  const unsupportedWithMethod = structuredClone(live);
  const unsupported = unsupportedWithMethod.capability_operations.find(
    (item) => item.status === "unsupported",
  );
  unsupported.methods = ["invented"];
  assert.throws(
    () => validateSurface(unsupportedWithMethod, unsupportedWithMethod),
    /must be classified, methodless, and actionable/,
  );

  const unsupportedWithoutAlternative = structuredClone(live);
  delete unsupportedWithoutAlternative.capability_operations.find(
    (item) => item.status === "unsupported",
  ).alternative;
  assert.throws(
    () => validateSurface(
      unsupportedWithoutAlternative,
      unsupportedWithoutAlternative,
    ),
    /must be classified, methodless, and actionable/,
  );

  assert.equal(runPython(String.raw`
from sagejs.numerics.capabilities import _normalize_method_record
try:
    _normalize_method_record({"backend": "ordinary-python"})
except ValueError as error:
    assert "nonempty implementation target" in str(error)
    print("rejected")
`), "rejected");

  const diagnostics = loadLiveDiagnostics();
  validateSupportingDocuments(diagnostics);
  assert.throws(
    () => validateSupportingDocuments(diagnostics.slice(1)),
    /diagnostic ledger is stale/,
  );
});

test("problem, result, and trace schemas cover every emitted common record", () => {
  const { schemas, validators } = commonSchemaValidators();
  const { diagnostic, problem, result, plan, trace } = schemas;
  assert.equal(problem.properties.trace_policy.$ref, "trace.schema.json#/$defs/policy");
  assert.equal(trace.$id, "https://sagejs.org/schemas/trace.schema.json");
  assert.equal(
    diagnostic.$id,
    "https://sagejs.org/schemas/diagnostic.schema.json",
  );
  assert.ok(problem.properties.constraints);
  const runtimeKinds = JSON.parse(runPython(String.raw`
from sagejs.numerics.model import FUNCTION_RECORD_KINDS
print(json.dumps(list(FUNCTION_RECORD_KINDS)))
`));
  assert.deepEqual(problem.$defs.callback.properties.kind.enum, runtimeKinds);
  assert.ok(problem.$defs.ode_resource_budget.properties.max_workspace_bytes);
  assert.ok(result.properties.provenance.properties.execution_binding_status.enum
    .includes("external_execution_unobserved"));

  const emitted = JSON.parse(runPython(String.raw`
from sagejs.numerics.model import (
    NumericalPlan, NumericalProblem, NumericalResult, NumericalValidation,
    ResourceBudget,
)
from sagejs.numerics.roots import find_root
from sagejs.numerics.approximation import interpolate
from sagejs.numerics.integration import integrate
from sagejs.numerics.linear_algebra import solve
from sagejs.numerics.diagnostics import NumericalDiagnostic
from sagejs.numerics.trace import NumericalTrace, TracePolicy

budget = ResourceBudget(
    max_iterations=4,
    max_evaluations=8,
    max_trace_events=4,
    max_trace_bytes=2048,
)
policy = TracePolicy("debug", max_events=4, max_bytes=2048)
problem = NumericalProblem(
    "test", "schema_witness", resource_budget=budget, trace_policy=policy
)
plan = NumericalPlan(
    problem,
    method="witness",
    backend="ordinary-python",
    reason="schema witness",
    capability={},
    diagnostics=[NumericalDiagnostic("backend_fallback")],
)
trace = NumericalTrace(policy)
trace.append(
    "finish", iteration=1, evaluation=2, accepted=True,
    data={"residual": 0.0},
    diagnostics=[NumericalDiagnostic("stagnation")],
    important=True, force=True,
)
validation = NumericalValidation(
    "validated_approximate", True, residual=0.0, error_estimate=0.0
)
result = NumericalResult(
    problem,
    plan,
    success=True,
    status="converged",
    validation=validation,
    iterations=1,
    evaluations=2,
    trace=trace,
    diagnostics=[NumericalDiagnostic("backend_fallback")],
)
truncated_trace = NumericalTrace(TracePolicy("iterations", max_events=2, max_bytes=2048))
for index in range(8):
    truncated_trace.append("iteration", iteration=index, data={"index": index})
failure = find_root(lambda x: x*x + 1.0, -1.0, 1.0, method="brent")
representative_results = [
    interpolate([-1.0, 0.0, 1.0], [1.0, 0.0, 1.0]),
    integrate(lambda x: x*x, 0.0, 1.0),
    solve([[3.0, 1.0], [1.0, 2.0]], [7.0, 5.0]),
]
print(json.dumps({
    "problem": problem.to_dict(),
    "plan": plan.to_dict(),
    "trace": trace.to_dict(),
    "result": result.to_dict(),
    "truncated_trace": truncated_trace.to_dict(),
    "failure": failure.to_dict(),
    "representative_results": [item.to_dict() for item in representative_results],
}))
`));
  assertSchemaValid(validators.problem, emitted.problem, "problem");
  assertSchemaValid(validators.plan, emitted.plan, "plan");
  assertSchemaValid(validators.trace, emitted.trace, "trace");
  assertSchemaValid(validators.result, emitted.result, "result");
  assertSchemaValid(
    validators.trace,
    emitted.truncated_trace,
    "truncated trace",
  );
  assertSchemaValid(validators.result, emitted.failure, "root failure result");
  for (const [index, representative] of emitted.representative_results.entries()) {
    assertSchemaValid(
      validators.problem,
      representative.reproducibility.problem,
      `representative problem ${index}`,
    );
    assertSchemaValid(
      validators.plan,
      representative.reproducibility.plan,
      `representative plan ${index}`,
    );
    assertSchemaValid(
      validators.trace,
      representative.trace,
      `representative trace ${index}`,
    );
    assertSchemaValid(validators.result, representative, `representative result ${index}`);
  }
  assertSchemaValid(
    validators.diagnostic,
    emitted.plan.diagnostics[0],
    "plan.diagnostics[0]",
  );
  assertSchemaValid(
    validators.diagnostic,
    emitted.trace.events[0].diagnostics[0],
    "trace.events[0].diagnostics[0]",
  );
  assertSchemaValid(
    validators.diagnostic,
    emitted.result.diagnostics[0],
    "result.diagnostics[0]",
  );
  assertSchemaValid(
    validators.diagnostic,
    emitted.truncated_trace.diagnostics[0],
    "trace.diagnostics[0]",
  );
  assert.equal(typeof emitted.result.success, "boolean");
  assert.equal(typeof emitted.result.validation.passed, "boolean");
  assert.ok(emitted.trace.events[0].iteration >= 0);
  assert.ok(emitted.trace.events[0].evaluation >= 0);
  assert.ok(emitted.problem.resource_budget.max_trace_events >=
    problem.$defs.resource_budget.properties.max_trace_events.minimum);
  assert.ok(emitted.problem.resource_budget.max_trace_bytes >=
    problem.$defs.resource_budget.properties.max_trace_bytes.minimum);

  const unknownDiagnostic = structuredClone(emitted.result);
  unknownDiagnostic.diagnostics[0].code = "invented_diagnostic";
  assertSchemaInvalid(validators.result, unknownDiagnostic, "unknown diagnostic code");

  const malformedEvent = structuredClone(emitted.trace);
  malformedEvent.events[0].accepted = "yes";
  assertSchemaInvalid(validators.trace, malformedEvent, "malformed trace event");

  const contradictoryResult = structuredClone(emitted.result);
  contradictoryResult.status = "backend_failure";
  assertSchemaInvalid(
    validators.result,
    contradictoryResult,
    "successful backend failure",
  );

  const malformedProblem = structuredClone(emitted.problem);
  malformedProblem.resource_budget.max_iterations = 0;
  assertSchemaInvalid(validators.problem, malformedProblem, "zero iteration budget");
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
    NumericalConstraint,
    NumericalPlan,
    NumericalProblem,
    NumericalResult,
    NumericalValidation,
    ResourceBudget,
)
from sagejs.numerics._json import canonical_json
from sagejs.numerics.trace import NumericalTrace, TraceEvent, TracePolicy

registry = capabilities()
assert registry["schema_version"] == 3
assert "sweeps.parameter_sweep" in registry["operation_index"]
budget_contract = registry["resource_budget_contract"]
assert budget_contract["not_common_fields"]["max_callback_depth"] == "unsupported_common_contract"
assert budget_contract["not_common_fields"]["max_memory_bytes"] == "domain_specific_only"
ode_budget = budget_contract["domain_specific"]["ode.initial_value_problem"]
assert "max_workspace_bytes" in ode_budget
assert "max_validation_evaluations" in ode_budget
sweep = registry["operation_index"]["sweeps.parameter_sweep"]["capability"]
assert "max_memory_bytes" in sweep["resource_budgets"]["cooperative"]
for entry in registry["operation_index"].values():
    capability = entry["capability"]
    methods = capability.get("methods", {})
    surface = capability["surface"]
    assert isinstance(methods, dict)
    if surface["status"] == "unsupported":
        assert surface["classification"] == "unsupported"
        assert methods == {}
        assert surface["reason"]
        assert surface["alternative"]
        continue
    assert methods
    for method in methods.values():
        targets = method.get("implementation_targets", {})
        assert targets.get("platforms") or targets.get("runtimes")
        assert not any(str(item).startswith("sagejs-") for item in targets.get("runtimes", []))

for qualified in (
    "roots.fixed_point_iteration",
    "integration.composite_quadrature",
    "integration.multidimensional_integral",
    "linear_algebra.nullspace",
    "linear_algebra.pseudoinverse",
    "optimization.nonlinear_constrained_minimize",
    "ode.boundary_value_problem",
    "spectral.digital_filter",
    "spectral.sparse_singular_value_decomposition",
    "spectral.window_function",
):
    surface = registry["operation_index"][qualified]["capability"]["surface"]
    assert surface["classification"] == "unsupported"
    assert surface["status"] == "unsupported"
    assert surface["methods"] == []
    assert surface["reason"]
    assert surface["alternative"]

for method in registry["domains"]["roots"]["operations"]["scalar_root"]["methods"].values():
    assert "cpython" in method["implementation_targets"]["runtimes"]

from sagejs.numerics.capabilities import _normalize_method_record, _operation_classification
try:
    _operation_classification({})
    raise AssertionError("an unclassified operation was accepted")
except ValueError:
    pass

invalid_capability_records = (
    {"platforms": "linux-x64"},
    {"runtimes": "node"},
    {"implementation_targets": []},
    {"implementation_targets": {"platforms": [], "runtimes": [], "extra": []}},
    {
        "receipt_qualification": {
            "status": "receipt_qualified",
            "platforms": ["unknown-platform"],
            "runtimes": ["node"],
            "receipt_sha256": ["a" * 64],
        }
    },
    {
        "receipt_qualification": {
            "status": "receipt_qualified",
            "platforms": ["linux-x64"],
            "runtimes": ["node"],
            "receipt_sha256": ["not-a-digest"],
        }
    },
    {
        "receipt_qualification": {
            "status": "unqualified_in_public_registry",
            "platforms": ["linux-x64"],
            "runtimes": [],
            "receipt_sha256": [],
        }
    },
    {
        "platforms": ["node", "linux-x64"],
        "receipt_qualification": {
            "status": "receipt_qualified",
            "platforms": ["linux-x64"],
            "runtimes": ["node"],
            "receipt_sha256": ["a" * 64],
        },
    },
    {
        "implementation_targets": {
            "platforms": ["linux-x64"],
            "runtimes": ["node"],
        },
        "receipt_qualification": {
            "status": "receipt_qualified",
            "platforms": ["macos-arm64"],
            "runtimes": ["browser"],
            "receipt_sha256": ["b" * 64],
        },
    },
)
for invalid_record in invalid_capability_records:
    try:
        _normalize_method_record(invalid_record)
        raise AssertionError("malformed capability evidence was accepted")
    except (TypeError, ValueError):
        pass

unqualified_method = _normalize_method_record({
    "platforms": ["node", "linux-x64"],
    "implementation_targets": {
        "platforms": ["macos-arm64"],
        "runtimes": ["cpython"],
    },
})
assert unqualified_method["implementation_targets"] == {
    "platforms": ["linux-x64", "macos-arm64"],
    "runtimes": ["cpython", "node"],
}
assert unqualified_method["receipt_qualification"] == {
    "status": "unqualified_in_public_registry",
    "platforms": [],
    "runtimes": [],
    "receipt_sha256": [],
}

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
assert problem.to_dict()["derivative"] == {"kind": "none", "replayable": True}
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
        "source_digest": digest_a,
        "artifact_sha256": digest_b,
        "qualification_receipt_sha256": digest_c,
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

unobserved = NumericalResult(
    problem,
    plan,
    success=True,
    status="converged",
    value=1.0,
    validation=NumericalValidation("validated_approximate", True),
).to_dict()
assert unobserved["provenance"]["execution_binding_status"] == "external_execution_unobserved"

try:
    NumericalResult(
        problem,
        plan,
        success=True,
        status="converged",
        value=1.0,
        validation=NumericalValidation("validated_approximate", True),
        provenance={
            "implementation_kind": "external_library_wasm",
            "artifact_sha256": "d" * 64,
            "qualification_receipt_sha256": digest_c,
        },
    ).to_dict()
    raise AssertionError("mismatched observed artifact was accepted")
except ValueError:
    pass

nested = NumericalProblem(
    "test",
    "immutable",
    function_record={
        "kind": "sampled_data",
        "replayable": True,
        "samples": [{"x": [1.0], "y": [2.0]}],
    },
    numeric_type="complex-binary64",
    variables=[{"name": "z", "shape": [2]}],
    bounds={"box": {"lower": [0.0], "upper": [1.0]}},
    initial_data={"points": [[0.5]]},
    source_intent={"source": {"tokens": ["z"]}},
)
nested_digest = nested.digest
nested.function_record["samples"][0]["x"].append(9.0)
nested.bounds["box"]["lower"].append(-1.0)
nested.initial_data["points"][0].append(0.75)
nested.source_intent["source"]["tokens"].append("mutated")
nested.to_dict()["variables"][0]["shape"].append(3)
assert nested.digest == nested_digest
complex_plan = NumericalPlan(
    nested,
    method="witness",
    backend="ordinary-python",
    reason="numeric type witness",
    capability={},
)
assert complex_plan.to_dict()["numeric_type"] == "complex-binary64"
complex_result = NumericalResult(
    nested,
    complex_plan,
    success=True,
    status="converged",
    validation=NumericalValidation("validated_approximate", True),
).to_dict()
assert complex_result["precision"] == {"kind": "complex-binary64", "bits": 53}

derivative_not_replayable = NumericalProblem(
    "test",
    "derivative_replayability",
    function_record={"kind": "expression", "replayable": True},
    derivative_record={"kind": "opaque_callback", "replayable": False},
)
assert derivative_not_replayable.replayable is False

absent_callbacks = NumericalProblem("test", "absent_callbacks")
assert absent_callbacks.function_record == {"kind": "none", "replayable": True}
assert absent_callbacks.to_dict()["derivative"] == {
    "kind": "none", "replayable": True,
}
assert absent_callbacks.replayable is True

live_expression_callbacks = NumericalProblem(
    "test",
    "live_expression_callbacks",
    function=lambda value: value,
    derivative=lambda value: 1.0,
    function_record={
        "kind": "expression", "replayable": True, "expression": "x",
    },
    derivative_record={
        "kind": "source", "replayable": True, "source": "lambda x: 1.0",
    },
)
assert live_expression_callbacks.replayable is True

for callback_bypass in (
    lambda: NumericalProblem(
        "test", "function_none_bypass", function=lambda value: value,
        function_record={"kind": "none", "replayable": True},
    ),
    lambda: NumericalProblem(
        "test", "derivative_none_bypass", derivative=lambda value: 1.0,
        derivative_record={"kind": "none", "replayable": True},
    ),
    lambda: NumericalProblem(
        "test", "opaque_replayable_bypass", function=lambda value: value,
        function_record={"kind": "opaque_callback", "replayable": True},
    ),
    lambda: NumericalProblem(
        "test", "explicit_replayable_bypass", derivative=lambda value: 1.0,
        derivative_record={"kind": "explicit_callback", "replayable": True},
    ),
):
    try:
        callback_bypass()
        raise AssertionError("an inconsistent live callback record was accepted")
    except ValueError:
        pass

constraint = NumericalConstraint("inequality", lambda value: value[0], tolerance=1e-8)
constrained = NumericalProblem(
    "test",
    "constrained",
    function_record={"kind": "none", "replayable": True},
    constraints=[constraint],
)
assert constrained.to_dict()["constraints"][0]["sense"] == "greater_equal"

other = NumericalProblem("test", "other")
other_plan = NumericalPlan(
    other,
    method="other",
    backend="ordinary-python",
    reason="different problem",
    capability={},
)
for constructor in (
    lambda: NumericalResult(
        nested, other_plan, success=False, status="invalid_problem",
        validation=NumericalValidation("indeterminate", False),
    ),
    lambda: NumericalResult(
        nested, complex_plan, success=True, status="converged",
        validation=NumericalValidation("indeterminate", False),
    ),
    lambda: NumericalResult(
        nested, complex_plan, success=False, status="maximum_iterations",
        validation=NumericalValidation("indeterminate", False), iterations=-1,
    ),
    lambda: NumericalResult(
        nested, complex_plan, success=False, status="maximum_elapsed_time",
        validation=NumericalValidation("indeterminate", False), elapsed_ms=-0.1,
    ),
):
    try:
        constructor()
        raise AssertionError("an inconsistent result contract was accepted")
    except ValueError:
        pass

budget = ResourceBudget(
    max_iterations=2,
    max_evaluations=3,
    max_trace_events=2,
    max_trace_bytes=1024,
)
budget_policy = TracePolicy("debug", max_events=2, max_bytes=1024)
budget_problem = NumericalProblem(
    "test",
    "budgeted",
    resource_budget=budget,
    trace_policy=budget_policy,
)
budget_plan = NumericalPlan(
    budget_problem,
    method="budgeted",
    backend="ordinary-python",
    reason="adversarial contract witness",
    capability={},
)
failed_validation = NumericalValidation("indeterminate", False)
for constructor in (
    lambda: ResourceBudget(max_trace_events=1),
    lambda: ResourceBudget(max_trace_bytes=1023),
    lambda: NumericalProblem(
        "test",
        "bad_trace_budget",
        resource_budget=budget,
        trace_policy=TracePolicy("debug", max_events=3, max_bytes=1024),
    ),
    lambda: NumericalPlan(
        budget_problem, method="", backend="ordinary-python", reason="reason",
        capability={},
    ),
    lambda: NumericalPlan(
        budget_problem, method="method", backend="", reason="reason",
        capability={},
    ),
    lambda: NumericalPlan(
        budget_problem, method="method", backend="ordinary-python", reason="",
        capability={},
    ),
    lambda: NumericalValidation("indeterminate", "false"),
    lambda: NumericalValidation("indeterminate", False, residual="0"),
    lambda: NumericalValidation("indeterminate", False, residual=-1.0),
    lambda: TraceEvent(0, "iteration", iteration=-1),
    lambda: TraceEvent(0, "evaluation", evaluation=True),
    lambda: TraceEvent(0, "candidate", accepted="yes"),
    lambda: TraceEvent(0, "candidate", important=1),
    lambda: NumericalTrace(budget_policy).append("finish", force=1),
    lambda: NumericalResult(
        budget_problem, budget_plan, success="false", status="backend_failure",
        validation=failed_validation,
    ),
    lambda: NumericalResult(
        budget_problem, budget_plan, success=True, status="backend_failure",
        validation=NumericalValidation("validated_approximate", True),
    ),
    lambda: NumericalResult(
        budget_problem, budget_plan, success=False, status="maximum_iterations",
        validation=failed_validation, iterations=3,
    ),
    lambda: NumericalResult(
        budget_problem, budget_plan, success=False, status="maximum_evaluations",
        validation=failed_validation, evaluations=4,
    ),
    lambda: NumericalResult(
        budget_problem, budget_plan, success=False, status="backend_failure",
        validation=failed_validation,
        trace=NumericalTrace(TracePolicy("summary", max_events=2, max_bytes=1024)),
    ),
):
    try:
        constructor()
        raise AssertionError("an invalid common numerical record was accepted")
    except (TypeError, ValueError):
        pass

oversized = NumericalTrace(budget_policy)
oversized.append(
    "debug",
    data={"payload": "x" * 5000},
    important=True,
    force=True,
)
oversized_record = oversized.to_dict()
assert oversized_record["truncated"] is True
assert oversized_record["retained_events"] == 0
assert oversized_record["dropped_events"] == 1
assert len(canonical_json(oversized_record["events"]).encode("utf-8")) <= 1024

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
