// sagejs-test-tier: unit
"use strict";
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { pythonExecutable } = require("../tools/python-executable.cjs");
const { atCutoff, summarize } = require("../bench/class-unit-groups/cubic-analytic-schedule.cjs");

const source = `_CUBIC_ANALYTIC_THRESHOLD = 997
_CUBIC_ANALYTIC_REFINED_THRESHOLD = 1494
def certificate(x):
    return x < 2
`;

test("gcd-only source ablation rejects used coefficients and preserves scalar arithmetic", () => {
  const run = spawnSync(pythonExecutable(), ["-c", `
import importlib.util
from pathlib import Path
spec = importlib.util.spec_from_file_location("audit", "bench/class-unit-groups/cubic-gcd-only.py")
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
source = Path("src/lib/sagejs/number_fields/cubic_class_number_native.py").read_text()
candidate, calls = m.transform(source)
assert calls == 4
assert len(candidate.encode()) < len(source.encode())
assert m.check_arithmetic(source, candidate) == 79649
assert m.check_rejections() == 4
`], { cwd: require("node:path").resolve(__dirname, ".."), encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
});

test("cutoff copies change one declaration and remain CPython-parseable", () => {
  for (const cutoff of [72, 513, 765, 999, 1485]) {
    const changed = atCutoff(source, cutoff);
    assert.equal(changed.replace(`_CUBIC_ANALYTIC_THRESHOLD = ${cutoff}\n`,
      "_CUBIC_ANALYTIC_THRESHOLD = 997\n"), source);
    const run = spawnSync(pythonExecutable(), ["-c", "import ast,sys; ast.parse(sys.stdin.read())"],
      { input: changed, encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
  }
  for (const cutoff of [0, 68, 69, 512, 768, 997, 1493, 1494, 1495, 768.5, NaN, Infinity, "768"]) {
    assert.throws(() => atCutoff(source, cutoff), /cutoff/);
  }
  assert.throws(() => atCutoff(source.replace("1494", "1600"), 765), /refinement/);
  assert.throws(() => atCutoff(source + source, 765), /initial/);
});

test("exact scale audit separates finite-expression drift from tail inflation", () => {
  const run = spawnSync(pythonExecutable(), ["-c", `
import importlib.util
from fractions import Fraction as Q
spec = importlib.util.spec_from_file_location("audit", "bench/class-unit-groups/cubic-bf-scale-audit.py")
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
for polynomial, prime, degrees in [([0,0,0,1],2,[1]), ([0,-1,0,1],3,[1,1,1]), ([1,1,0,1],2,[3])]:
    assert m.residue_degrees(polynomial, prime) == degrees
for n in [1,2,7,110,997]:
    lo, hi = m.sqrt_bounds(m.point(n))
    assert lo*lo <= n <= hi*hi
assert m.log_bounds(1) == (0,0)
a = m.audit([-146,26,-1,1], -577416, 997)
assert a["displacement_exceeds_extra_tail"]
assert Q(a["finite_displacement"][0]) > Q(2,1000)
assert Q(a["extra_tail"][1]) < Q(4,10000)
b = m.audit([-146,26,-1,1], -577416, 999)
assert not b["displacement_exceeds_extra_tail"]
for interval in [b["finite_displacement"], b["extra_tail"]]:
    assert Q(interval[0]) <= 0 <= Q(interval[1])
    assert Q(interval[1])-Q(interval[0]) < Q(1,10**35)
`], { cwd: require("node:path").resolve(__dirname, ".."), encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
});

test("production BF planner rejects nonintegral ninth scales before workspace access", () => {
  const run = spawnSync(pythonExecutable(), ["-c", `
import ast, inspect, pathlib
source = pathlib.Path("src/lib/sagejs/number_fields/cubic_class_number_native.py").read_text()
tree = ast.parse(source)
constants = {}
for n in tree.body:
    if isinstance(n, ast.Assign) and isinstance(n.targets[0], ast.Name):
        if n.targets[0].id in ("_CUBIC_ANALYTIC_THRESHOLD", "_CUBIC_ANALYTIC_REFINED_THRESHOLD"):
            constants[n.targets[0].id] = ast.literal_eval(n.value)
assert constants == {"_CUBIC_ANALYTIC_THRESHOLD": 999, "_CUBIC_ANALYTIC_REFINED_THRESHOLD": 1494}
fn = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == "_cubic_prepare_bf_plan")
# Run the actual leading guard; no fake algebra or workspace implementation.
leading = []
for n in fn.body:
    leading.append(n)
    if isinstance(n, ast.If): break
fn.body = leading + [ast.Return(value=ast.Constant(value=True))]
fn.decorator_list = []
module = ast.fix_missing_locations(ast.Module(body=[ast.ImportFrom(module="__future__", names=[ast.alias(name="annotations")], level=0),fn], type_ignores=[]))
exec(compile(module,"actual-bf-guard.py","exec"),constants)
guard = constants[fn.name]
for x in [0,69,512,513,765,768,997,998,999,1493,1494,1495]:
    args = {name:None for name in inspect.signature(guard).parameters}
    args["analytic_threshold"] = x
    result = guard(**args)
    assert result is True if x in (999,1494) else result == (False,0,0)
`], { cwd: require("node:path").resolve(__dirname, ".."), encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
});

test("exact Theorem-7 specialization does not silently bless printed Corollary-8 constants", () => {
  const run = spawnSync(pythonExecutable(), ["-c", `
import importlib.util
from fractions import Fraction as Q
spec = importlib.util.spec_from_file_location("audit", "bench/class-unit-groups/cubic-bf-scale-audit.py")
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
r = m.audit_corollary_specialization()
assert r["exact_rational_audit"] and not r["certifies_class_groups"]
assert not r["corollary_counterexample"]
assert Q(r["constant"]["lower"]) > Q("3.35")
assert Q(r["real_place_coefficient"]["upper"]) < Q("0.619")
for key in ["constant", "degree_coefficient", "real_place_coefficient", "complex_cubic_constant"]:
    assert Q(r[key]["lower"]) <= Q(r[key]["upper"])
assert Q(r["constant"]["upper"]) < Q("5.35")
assert Q(r["degree_coefficient"]["lower"]) > Q("1.801")
assert Q(r["real_place_coefficient"]["lower"]) > Q("0.429")
`], { cwd: require("node:path").resolve(__dirname, ".."), encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
});

function report() {
  const output = Array(64).fill("0");
  output[1] = "3"; output[2] = "1"; output[3] = "3";
  output[23] = "13"; output[28] = "-12716"; output[36] = "997"; output[47] = "1";
  const row = { label: "synthetic", coefficients: ["1", "2", "3", "1"],
    h: "3", invariants: ["3"], accepted: true, output };
  return { public_receipt_qualified: false, independent_exact_replay: false,
    records: [{ name: "baseline", observations: [row] },
      { name: "cutoff_768", observations: [structuredClone(row)] }] };
}

test("summary distinguishes refinement, declines and malformed comparisons", () => {
  const r = report();
  r.records[1].observations[0].output[36] = "1494";
  let result = summarize(r)[1];
  assert.deepEqual(result.thresholds, { "1494": 1 });
  assert.deepEqual(result.discriminant_bits, { "14": { accepted: 1, refined: 1 } });
  assert.equal(result.changed_relation_counts, 0);
  r.records[1].observations[0].output[23] = "14";
  assert.equal(summarize(r)[1].changed_relation_counts, 1);
  r.records[1].observations[0].accepted = false;
  r.records[1].observations[0].error = "synthetic failure";
  result = summarize(r)[1];
  assert.equal(result.errors, 1);
  assert.deepEqual(result.losses, ["synthetic"]);
  const broken = report(); broken.records[1].observations[0].output[1] = "4";
  assert.throws(() => summarize(broken));
  const reordered = report(); reordered.records[1].observations[0].coefficients[0] = "2";
  assert.throws(() => summarize(reordered), /corpus order/);
});
