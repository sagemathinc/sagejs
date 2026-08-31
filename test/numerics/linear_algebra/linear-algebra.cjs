#!/usr/bin/env node
// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const root = join(__dirname, "..", "..", "..");

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
  const directory = mkdtempSync(join(tmpdir(), "sagejs-linear-algebra-"));
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

function validateAgainstSchema(value, schema, path = "$") {
  if (Object.hasOwn(schema, "const")) {
    assert.deepEqual(value, schema.const, `${path} violates const`);
  }
  if (schema.enum) assert.ok(schema.enum.includes(value), `${path} violates enum`);
  if (schema.type === "object") {
    assert.ok(value && typeof value === "object" && !Array.isArray(value), `${path} must be an object`);
    for (const name of schema.required || []) {
      assert.ok(Object.hasOwn(value, name), `${path}.${name} is required`);
    }
    for (const [name, item] of Object.entries(value)) {
      if (schema.properties && Object.hasOwn(schema.properties, name)) {
        validateAgainstSchema(item, schema.properties[name], `${path}.${name}`);
      } else if (schema.additionalProperties === false) {
        assert.fail(`${path}.${name} is not allowed`);
      }
    }
  } else if (schema.type === "array") {
    assert.ok(Array.isArray(value), `${path} must be an array`);
    if (schema.minItems !== undefined) assert.ok(value.length >= schema.minItems);
    for (let index = 0; index < value.length; index += 1) {
      validateAgainstSchema(value[index], schema.items || {}, `${path}[${index}]`);
    }
  } else if (schema.type === "string") {
    assert.equal(typeof value, "string", `${path} must be a string`);
    if (schema.minLength !== undefined) assert.ok(value.length >= schema.minLength);
  } else if (schema.type === "number") {
    assert.equal(typeof value, "number", `${path} must be a number`);
    assert.ok(Number.isFinite(value), `${path} must be finite`);
    if (schema.exclusiveMinimum !== undefined) assert.ok(value > schema.exclusiveMinimum);
  }
}

const witness = String.raw`
import json
import math
from sagejs.plotting import PlotAnimation, PlotSpec
from sagejs.numerics import NumericalProblem
from sagejs.numerics.linear_algebra import (
    DenseMatrix,
    DenseVector,
    capabilities,
    cholesky,
    condition_number,
    determinant,
    independent_residual,
    inverse,
    least_squares,
    lu,
    matrix_rank,
    plan,
    qr,
    solve,
    supports,
    validate_least_squares,
    validate_lu,
)

def close(left, right, tolerance):
    if isinstance(left, list):
        assert isinstance(right, list) and len(left) == len(right)
        for lvalue, rvalue in zip(left, right):
            close(lvalue, rvalue, tolerance)
    else:
        assert abs(float(left) - float(right)) <= tolerance, (left, right)

matrix = DenseMatrix.from_rows([[3, 1], [1, 2]])
assert matrix.shape == (2, 2)
assert matrix.entries == (3.0, 1.0, 1.0, 2.0)
assert matrix.to_dict()["layout"] == "row_major"
assert DenseVector([3, 4]).norm_two() == 5.0
assert DenseVector([1e-200]).norm_two() == 1e-200
assert DenseVector([1e200]).norm_two() == 1e200
assert matrix.transpose().to_rows() == matrix.to_rows()

capability_record = capabilities()
assert capability_record["schema_version"] == 1
assert capability_record["domain"] == "linear_algebra"
assert sorted(capability_record["operations"]) == [
    "cholesky_factorization",
    "condition_number",
    "determinant",
    "least_squares",
    "linear_solve",
    "lu_factorization",
    "matrix_inverse",
    "matrix_rank",
    "qr_factorization",
]
assert list(capabilities("linear_solve")["operations"]) == ["linear_solve"]
assert capabilities("not-an-operation")["operations"] == {}
capability_record["operations"]["linear_solve"]["methods"]["partial_pivot_lu"]["requires"].append("mutation")
assert "mutation" not in capabilities()["operations"]["linear_solve"]["methods"]["partial_pivot_lu"]["requires"]

planner_calls = [0]
def forbidden_planner_callback(*args):
    planner_calls[0] += 1
    raise AssertionError("planning evaluated a callback")

planning_cases = (
    ("lu_factorization", [3, 2], "partial_pivot_lu", {}),
    ("qr_factorization", [3, 2], "householder_qr", {}),
    ("cholesky_factorization", [3, 3], "cholesky", {}),
    ("linear_solve", [3, 3], "partial_pivot_lu", {}),
    ("least_squares", [3, 2], "column_pivoted_householder_qr", {}),
    ("least_squares", [2, 3], "column_pivoted_householder_qr_of_transpose", {}),
    ("matrix_rank", [3, 2], "one_sided_jacobi", {}),
    ("condition_number", [3, 2], "one_sided_jacobi", {}),
    ("determinant", [3, 3], "partial_pivot_lu", {}),
    ("matrix_inverse", [3, 3], "partial_pivot_lu", {}),
    ("linear_solve", [3, 3], "cholesky", {"assume": "positive_definite"}),
    ("qr_factorization", [3, 2], "column_pivoted_householder_qr", {"pivoted": True}),
)
for operation, shape, expected_method, metadata in planning_cases:
    planning_problem = NumericalProblem(
        "linear_algebra",
        operation,
        function=forbidden_planner_callback,
        numeric_type="binary64",
        variables=[{"name": "A", "shape": shape}],
        method="auto",
        metadata=metadata,
    )
    assert supports(planning_problem)
    planned = plan(planning_problem)
    assert planned.method == expected_method
    assert planned.backend == "ordinary-python"
    planned_record = planned.to_dict()
    assert planned_record["capability"]["source_transparent"] is True
    assert planned_record["expected_resources"]["shape"] == shape
assert planner_calls == [0]
detached_plan_record = planned.to_dict()
detached_plan_record["capability"]["requires"].append("mutation")
assert "mutation" not in plan(planning_problem).to_dict()["capability"]["requires"]
assert planner_calls == [0]

nonsquare_solve_problem = NumericalProblem(
    "linear_algebra",
    "linear_solve",
    numeric_type="binary64",
    variables=[{"name": "A", "shape": [2, 3]}],
    method="auto",
)
assert not supports(nonsquare_solve_problem)
assert not supports(planning_problem, method="not-a-method")
fractional_shape_problem = NumericalProblem(
    "linear_algebra",
    "matrix_rank",
    numeric_type="binary64",
    variables=[{"name": "A", "shape": [2.5, 3]}],
    method="auto",
)
assert not supports(fractional_shape_problem)
wide_least_squares_problem = NumericalProblem(
    "linear_algebra",
    "least_squares",
    numeric_type="binary64",
    variables=[{"name": "A", "shape": [2, 3]}],
    method="auto",
)
assert not supports(
    wide_least_squares_problem, method="column_pivoted_householder_qr"
)
try:
    plan(wide_least_squares_problem, method="column_pivoted_householder_qr")
except ValueError as error:
    assert "least-squares shape" in str(error)
else:
    raise AssertionError("planning accepted a tall-only method for a wide problem")

extreme_qr_solve = solve([[1e308]], [1e308], method="qr")
assert extreme_qr_solve.success
assert extreme_qr_solve.value == [1.0]

lu_result = lu([[0, 2, 3], [4, 5, 6], [7, 8, 10]], trace="iterations")
assert lu_result.success and lu_result.validation.passed
assert lu_result.factorization.to_dict()["identity"] == "A = P * L * U"
assert lu_result.factorization.swaps >= 1
assert "rank_estimate" not in lu_result.factorization.to_dict()
assert json.loads(lu_result.to_json())["domain_payload"]["factorization"]["kind"] == "lu"

lu_explanation = lu_result.explanation()
assert lu_explanation["schema_version"] == 1
assert lu_explanation["shape"] == [3, 3]
assert lu_explanation["outcome"] == {
    "success": True,
    "status": "converged",
    "failure_code": None,
    "failure_details": None,
}
assert lu_explanation["factorization"]["identity"] == "A = P * L * U"
assert "upper" not in lu_explanation["factorization"]
assert lu_explanation["validation"]["independent"] is True
assert lu_explanation["validation"]["evidence_kind"] == "independent_postcheck"
assert "validation passed" in lu_result.explain()

factor_plot = lu_result.plot("factorization")
assert isinstance(factor_plot, PlotSpec)
assert factor_plot.provenance["metadata"]["view"] == "factorization"
assert "diagonal profile" in factor_plot.alt_text()
assert factor_plot.validate() == ()
json.loads(factor_plot.to_json())

extreme_threshold_plot = lu(
    [[1e-308, 1e308], [0.0, 1e-308]]
).plot("factorization")
assert extreme_threshold_plot.validate() == ()
json.loads(extreme_threshold_plot.to_json())

factor_animation = lu_result.animate(max_frames=3)
assert isinstance(factor_animation, PlotAnimation)
assert len(factor_animation.frames) == 3
factor_animation_record = factor_animation.to_dict()
assert factor_animation_record["metadata"]["source"] == "retained_bounded_numerical_trace"
assert factor_animation_record["metadata"]["view"] == "factorization"
assert all(frame.state.validate() == () for frame in factor_animation.frames)
assert all(len(frame.state.alt_text()) >= 40 for frame in factor_animation.frames)
json.loads(factor_animation.to_json())

bad_lu_check = validate_lu(
    DenseMatrix.from_rows([[1, 0, 0], [0, 1, 0], [0, 0, 2]]),
    lu_result.factorization,
)
assert not bad_lu_check.passed

tall_qr = qr([[1, 2], [3, 4], [1, 1]])
assert tall_qr.success
assert tall_qr.factorization.q().shape == (3, 2)
assert tall_qr.factorization.r().shape == (2, 2)
assert tall_qr.factorization.q(complete=True).shape == (3, 3)
assert tall_qr.factorization.r(complete=True).shape == (3, 2)

wide_qr = qr([[1, 2, 3], [4, 5, 7]], pivoted=True)
assert wide_qr.success and wide_qr.factorization.q().shape == (2, 2)
assert wide_qr.factorization.r().shape == (2, 3)
assert wide_qr.factorization.to_dict()["identity"] == "A * P = Q * R"

chol = cholesky([[4, 2], [2, 3]])
assert chol.success and chol.validation.passed
assert chol.factorization.lower().entry(0, 1) == 0.0
assert cholesky([[1e-300]]).success

for method, options in (
    ("lu", {}),
    ("qr", {}),
    ("cholesky", {}),
    ("auto", {"assume": "positive_definite"}),
):
    answer = solve([[3, 1], [1, 2]], [9, 8], method=method, **options)
    assert answer.success and answer.status == "converged"
    close(answer.value, [2.0, 3.0], 1e-13)
    assert answer.validation.truth_level == "validated_approximate"

multiple = solve(
    [[4, 1], [2, 3]],
    [[6, 1], [8, 7]],
)
assert multiple.success
close(multiple.value, [[1.0, -0.4], [2.0, 2.6]], 1e-14)

refinement_matrix = [
    [2.7885359691576745, -9.49978489554666, -4.499413632617615],
    [-5.5357852370235445, 4.729424283280249, 3.533989748458225],
    [7.843591354096908, -8.261223347411677, -1.561563606294591],
]
refinement_right = [
    26.752113888947807,
    25.823734998854537,
    -27.440931113276115,
]
refined = solve(
    refinement_matrix,
    refinement_right,
    tolerance=2e-17,
    max_refinement=3,
    trace="iterations",
)
assert refined.success and refined.iterations >= 1
measurements = refined.to_dict()["measurements"]
assert measurements["final_backward_error"] < measurements["initial_backward_error"]
assert any(
    event.kind == "iteration" and event.data.get("phase") == "iterative_refinement"
    for event in refined.trace.events
)
convergence_plot = refined.plot("convergence")
assert isinstance(convergence_plot, PlotSpec)
assert "retained bounded trace events" in convergence_plot.alt_text()
assert convergence_plot.validate() == ()
convergence_animation = refined.animate("convergence", max_frames=3)
assert 2 <= len(convergence_animation.frames) <= 3
assert convergence_animation.to_dict()["metadata"]["view"] == "convergence"

tall = least_squares([[1, 1], [1, 2], [1, 3]], [1, 2, 2])
assert tall.success
close(tall.value, [2.0 / 3.0, 0.5], 1e-14)
assert tall.validation.to_dict()["checks"][0]["kind"] == "least_squares_stationarity"

wide = least_squares([[1, 0, 0], [0, 1, 0]], [2, 3])
assert wide.success
close(wide.value, [2.0, 3.0, 0.0], 1e-14)

coupled_wide = least_squares([[1, 0, 1], [0, 1, 1]], [1, 1])
assert coupled_wide.success
close(coupled_wide.value, [1 / 3, 1 / 3, 2 / 3], 1e-14)
assert coupled_wide.method == "column_pivoted_householder_qr_of_transpose"
coupled_payload = coupled_wide.to_dict()["domain_payload"]
assert coupled_payload["factorized_operand"] == "A.T"
assert coupled_payload["factorization"]["identity"] == "A.T * P = Q * R"
nonminimum = validate_least_squares(
    DenseMatrix.from_rows([[1, 0, 1]]),
    DenseMatrix.from_rows([[1], [0], [0]]),
    DenseMatrix.from_rows([[1]]),
    tolerance=1e-12,
    condition_estimate=1.0,
)
assert not nonminimum.passed
assert not nonminimum.to_dict()["checks"][2]["passed"]

rank = matrix_rank([[1, 2], [2, 4]], trace="iterations")
assert rank.success and rank.value == 1
condition = condition_number([[3, 1], [1, 2]])
assert condition.success and abs(condition.value - 2.618033988749895) < 1e-13
condition_plot = condition.plot()
assert isinstance(condition_plot, PlotSpec)
assert condition_plot.provenance["metadata"]["view"] == "conditioning"
assert "Relative singular-value profile" in condition_plot.alt_text()
assert condition_plot.validate() == ()
assert condition.explanation()["validation"]["independent"] is False
assert condition.explanation()["validation"]["evidence_kind"] == "algorithm_diagnostic"
infinite_condition = condition_number([[1, 2], [2, 4]])
assert infinite_condition.success and infinite_condition.value is None
assert "ill_conditioned" in {item.code for item in infinite_condition.diagnostics}

limited_diagnostics = solve([[3, 1], [1, 2]], [9, 8], max_sweeps=1)
assert limited_diagnostics.success
assert "maximum_iterations" in {item.code for item in limited_diagnostics.diagnostics}
indeterminate_rank = least_squares(
    [[1, 1], [1, 2], [1, 3]], [1, 2, 2], max_sweeps=1
)
assert not indeterminate_rank.success
assert indeterminate_rank.failure_code == "rank_diagnostic_indeterminate"

det = determinant([[1, 2], [3, 4]])
assert det.success and abs(det.value + 2.0) < 1e-14
assert det.to_dict()["domain_payload"]["sign"] == -1
underflow = determinant(
    [[1e-200, 0, 0, 0], [0, 1e-200, 0, 0], [0, 0, 1e-200, 0], [0, 0, 0, 1e-200]]
)
assert underflow.success and underflow.value == 0.0
assert not underflow.to_dict()["domain_payload"]["ordinary_value_representable"]
assert "loss_of_significance" in {item.code for item in underflow.diagnostics}

inv = inverse([[4, 7], [2, 6]])
assert inv.success
close(inv.value, [[0.6, -0.7], [-0.2, 0.4]], 1e-14)
assert len(inv.validation.to_dict()["checks"]) == 2

with open("test/numerics/linear_algebra/corpus.json", encoding="utf-8") as corpus_file:
    corpus = json.load(corpus_file)
assert corpus["schema_version"] == 1
for case in corpus["cases"]:
    operation = case["operation"]
    if operation == "solve":
        result = solve(case["matrix"], case["right"])
    elif operation == "least_squares":
        result = least_squares(case["matrix"], case["right"])
    elif operation == "rank":
        result = matrix_rank(case["matrix"])
    elif operation == "condition":
        result = condition_number(case["matrix"])
    elif operation == "qr":
        result = qr(case["matrix"])
    elif operation == "determinant":
        result = determinant(case["matrix"])
    elif operation == "inverse":
        result = inverse(case["matrix"])
    else:
        result = cholesky(case["matrix"])
    json.loads(result.to_json())
    if case["category"] == "failure":
        assert not result.success
        assert result.failure_code == case["failure_code"], case["id"]
    else:
        assert result.success, case["id"]
        if "expected" in case:
            close(result.value, case["expected"], case.get("absolute_tolerance", 0.0))
        if "condition_reference" in case:
            observed = condition_number(case["matrix"])
            relative = abs(observed.value - case["condition_reference"]) / case["condition_reference"]
            assert relative <= case["condition_relative_tolerance"]
        if case["id"] == "determinant-overflow-json-safe":
            assert result.value is None
            assert not result.to_dict()["domain_payload"]["ordinary_value_representable"]

with open(
    "docs/numerical-computing/linear-algebra/visualization-examples.json",
    encoding="utf-8",
) as examples_file:
    visualization_examples = json.load(examples_file)
assert visualization_examples["schema_version"] == 1
for example in visualization_examples["examples"]:
    if example["operation"] == "lu":
        visual_result = lu(example["matrix"], trace=example["trace"])
    elif example["operation"] == "condition_number":
        visual_result = condition_number(example["matrix"], trace=example["trace"])
    else:
        visual_result = cholesky(example["matrix"], trace=example["trace"])
    assert visual_result.success is example["expected_success"], example["id"]
    assert visual_result.status == example["expected_status"], example["id"]
    if "expected_failure_code" in example:
        assert visual_result.failure_code == example["expected_failure_code"]
    example_plot = visual_result.plot(example["view"])
    assert example["alt_text_contains"] in example_plot.alt_text()
    assert example_plot.validate() == ()
    if "expected_animation_view" in example:
        example_animation = visual_result.animate(max_frames=4)
        assert example_animation.to_dict()["metadata"]["view"] == example["expected_animation_view"]
        assert 2 <= len(example_animation.frames) <= 4

# Scaling and row permutation preserve the solve.
base = solve([[3, 1], [1, 2]], [9, 8])
scaled = solve([[3e-9, 1e-9], [1e-9, 2e-9]], [9e-9, 8e-9])
permuted = solve([[1, 2], [3, 1]], [8, 9])
close(base.value, scaled.value, 1e-12)
close(base.value, permuted.value, 1e-12)

cancelled = solve([[3, 1], [1, 2]], [9, 8], cancel=lambda: True)
assert not cancelled.success and cancelled.status == "cancelled"
assert cancelled.failure_code == "cancelled"

budget_matrix = [
    [4.0 if row == column else 0.1 for column in range(8)]
    for row in range(8)
]
budget_right = [1.0] * 8
cancel_operations = (
    lambda callback: lu(budget_matrix, cancel=callback),
    lambda callback: qr(budget_matrix, cancel=callback),
    lambda callback: cholesky(budget_matrix, cancel=callback),
    lambda callback: least_squares(budget_matrix, budget_right, cancel=callback),
    lambda callback: matrix_rank(budget_matrix, cancel=callback),
    lambda callback: condition_number(budget_matrix, cancel=callback),
    lambda callback: determinant(budget_matrix, cancel=callback),
    lambda callback: inverse(budget_matrix, cancel=callback),
)
for operation in cancel_operations:
    calls = [0]
    def cancel_inside_loop():
        calls[0] += 1
        return calls[0] >= 5
    interrupted = operation(cancel_inside_loop)
    assert not interrupted.success and interrupted.failure_code == "cancelled"
    assert calls[0] == 5

def broken_cancel():
    raise RuntimeError("cancel callback failed")

callback_failure = solve([[1.0]], [1.0], cancel=broken_cancel)
assert not callback_failure.success
assert callback_failure.failure_code == "cancellation_callback_error"

failed_cholesky = cholesky([[2.0, 1.0], [0.0, 2.0]])
assert not failed_cholesky.success
failure_explanation = failed_cholesky.explanation()
assert failure_explanation["outcome"]["failure_code"] == "not_symmetric"
assert failure_explanation["outcome"]["failure_details"]["row"] == 1
assert failure_explanation["validation"]["independent"] is False
assert len(failure_explanation["guidance"]) == 1
assert "Classified failure: not_symmetric" in failed_cholesky.explain()
failure_plot = failed_cholesky.plot()
assert isinstance(failure_plot, PlotSpec)
assert failure_plot.provenance["metadata"]["view"] == "validation"
assert "did not pass" in failure_plot.alt_text()
assert failure_plot.validate() == ()

try:
    failed_cholesky.animate()
except ValueError as error:
    assert "trace='iterations'" in str(error)
else:
    raise AssertionError("failure without iterative evidence produced an animation")

nonfinite_lu_update = lu([[1e308, 1e308], [1e308, -1e308]])
assert not nonfinite_lu_update.success
assert nonfinite_lu_update.failure_code == "nonfinite_intermediate"

for nonrepresentable_solve in (
    solve([[1e-308]], [1e308]),
    solve([[1e-308]], [1e308], method="qr"),
    solve([[1e-308]], [1e308], assume="positive_definite"),
    least_squares([[1e-308]], [1e308]),
):
    assert not nonrepresentable_solve.success
    assert nonrepresentable_solve.failure_code == "nonfinite_intermediate"

exhausted_inverse = inverse(
    [[1, 2, 3], [2, 4, 6], [3, 6, 9]], max_sweeps=1
)
assert not exhausted_inverse.success
assert exhausted_inverse.failure_code == "rank_deficient"

truncated = solve(
    refinement_matrix,
    refinement_right,
    tolerance=2e-17,
    max_refinement=3,
    trace="iterations",
    max_trace_events=4,
)
assert truncated.success and truncated.trace.truncated
assert len(truncated.trace.events) <= 4
assert json.loads(truncated.trace.to_json())["diagnostics"][0]["code"] == "trace_truncated"

bounded_factor_trace = lu(budget_matrix, trace="iterations", max_trace_events=4)
assert bounded_factor_trace.success and bounded_factor_trace.trace.truncated
bounded_animation = bounded_factor_trace.animate(max_frames=64)
assert len(bounded_animation.frames) <= 4
assert bounded_animation.to_dict()["metadata"]["trace_truncated"] is True

for invalid in (
    lambda: DenseMatrix.from_rows([[1, 2], [3]]),
    lambda: DenseMatrix.from_rows([[1, float("nan")]]),
    lambda: DenseVector([float("inf")]),
):
    try:
        invalid()
    except (TypeError, ValueError):
        pass
    else:
        raise AssertionError("invalid storage input was accepted")

residual = independent_residual(
    DenseMatrix.from_rows([[3, 1], [1, 2]]),
    DenseMatrix.from_rows([[2], [3]]),
    DenseMatrix.from_rows([[9], [8]]),
)
assert residual.entries == (0.0, 0.0)

print("validated numerical linear algebra passed")
`;

test("dense linear algebra agrees with the corpus in CPython", () => {
  assert.equal(runCPython(witness), "validated numerical linear algebra passed");
});

test("the same dense linear algebra source runs in Sage.js", () => {
  assert.equal(runSagejs(witness), "validated numerical linear algebra passed");
});

test("the backend-neutral corpus and schema remain exhaustive", () => {
  const corpus = JSON.parse(
    readFileSync(join(__dirname, "corpus.json"), "utf8"),
  );
  const schema = JSON.parse(
    readFileSync(join(__dirname, "corpus.schema.json"), "utf8"),
  );
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  validateAgainstSchema(corpus, schema);
  assert.equal(corpus.schema_version, 1);
  assert.equal(corpus.oracle_provenance.numpy, "2.5.1");
  assert.equal(corpus.oracle_provenance.scipy, "1.18.0");
  assert.ok(corpus.cases.length >= 20);
  assert.equal(new Set(corpus.cases.map(({ id }) => id)).size, corpus.cases.length);
  assert.ok(corpus.cases.some(({ category }) => category === "conditioned_stress"));
  assert.ok(corpus.cases.filter(({ category }) => category === "metamorphic").length >= 3);
  assert.ok(corpus.cases.filter(({ category }) => category === "failure").length >= 4);
  for (const item of corpus.cases) {
    assert.ok(schema.properties.cases.items.properties.operation.enum.includes(item.operation));
  }
});
