// sagejs-test-tier: specialized
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { compileKernel } = require("../tools/native-kernel/compiler.cjs");

const root = resolve(__dirname, "..");
// A parallel test lane may validate a coordinator's uncommitted extraction
// without copying it into the tracked mathematical source in either worktree.
const productionPath = resolve(process.env.SAGEJS_CUBIC_MATERIALIZE_SOURCE ||
  join(root, "src/lib/sagejs/number_fields/cubic_class_number_native.py"));
const fixturePath = join(__dirname, "fixtures/cubic-materialize-unit.py");

function run(command, args, timeout = 180000, env = process.env) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", timeout, env });
  assert.equal(result.status, 0, String(result.error || "") + "\n" + result.stdout + result.stderr);
  return result.stdout;
}

function pythonCommand() {
  const candidates = process.platform === "win32"
    ? [["py", "-3"], ["python"], ["python3"]]
    : [["python3"], ["python"]];
  return candidates.find(([exe, ...args]) =>
    spawnSync(exe, [...args, "--version"], { encoding: "utf8" }).status === 0);
}

function expandedFixture() {
  const source = readFileSync(productionPath, "utf8");
  const name = "_cubic_materialize_dependency_unit";
  const start = source.indexOf("def " + name + "(");
  assert(start >= 0, "production source must contain the extracted materializer");
  const end = source.indexOf("\n\n@native\n", start);
  assert(end > start);
  const helper = source.slice(start, end);
  const reconstructionStart = source.indexOf("def _cubic_reconstruct_archimedean_unit(");
  const signatureEnd = source.indexOf(") -> tuple[int, int, int, int]:", reconstructionStart);
  assert(signatureEnd > reconstructionStart);
  const unavailable = source.slice(reconstructionStart,
    signatureEnd + ") -> tuple[int, int, int, int]:".length)
    .replace("def _cubic_reconstruct_archimedean_unit(", "def _materialize_reconstruction_unavailable(") +
    "\n    return (0, 0, 0, 0)\n";
  assert.equal(helper.split("_cubic_reconstruct_archimedean_unit(").length, 2);
  const forcedProduct = helper.replace("def " + name + "(", "def _materialize_product_only(")
    .replace("_cubic_reconstruct_archimedean_unit(", "_materialize_reconstruction_unavailable(");
  return source + "\n" + unavailable + "\n" + forcedProduct + "\n" +
    readFileSync(fixturePath, "utf8").replace(/^from sagejs\.(?:ffi\.flint|native) import .*\n/gm, "");
}

test("unit materialization extraction preserves arithmetic modulo explicit fatal guards", (t) => {
  const command = pythonCommand();
  if (!command) return t.skip("CPython is needed for AST review and Decimal oracle");
  const [exe, ...args] = command;
  const program = String.raw`
import ast, copy, decimal, hashlib, json, subprocess, sys
current = ast.parse(open(sys.argv[1]).read())
original = subprocess.run([
    "git", "show", "a6f177736c9d5e14ff67fee7eb47b3603109ed7d:src/lib/sagejs/number_fields/cubic_class_number_native.py"
], text=True, capture_output=True)
helper = next(n for n in current.body if isinstance(n, ast.FunctionDef)
              and n.name == "_cubic_materialize_dependency_unit")
assert isinstance(helper.body[0], ast.Expr) and isinstance(helper.body[0].value, ast.Constant)
guard = helper.body[1]
expected = ast.parse("if analytic_scale <= 0 or dependency_log_scale < analytic_scale or dependency_log_scale % analytic_scale != 0:\n    return (False, 0, 0, 0, 0, 0)").body[0]
assert ast.dump(guard, include_attributes=False) == ast.dump(expected, include_attributes=False)
assert isinstance(helper.body[-1], ast.Return)
assert isinstance(helper.body[-1].value, ast.Tuple)
assert [ast.unparse(v) for v in helper.body[-1].value.elts] == [
    "True", "proof_unit_zero", "proof_unit_one", "proof_unit_two",
    "proof_regulator_lower", "proof_regulator_upper"]
class Normalize(ast.NodeTransformer):
    def visit_Return(self, node):
        if isinstance(node.value, ast.Tuple):
            assert [ast.literal_eval(v) for v in node.value.elts] == [False,0,0,0,0,0]
            node.value = ast.Constant(value=False)
        return node
    def visit_AnnAssign(self, node):
        if isinstance(node.target, ast.Name) and node.target.id == "relation_index":
            assert ast.unparse(node.annotation) == "uint64"
            return ast.Assign(targets=[node.target], value=node.value)
        return node
    def visit_Assign(self, node):
        if isinstance(node.targets[0], ast.Subscript) and ast.unparse(node.targets[0]) == "output[63]":
            assert ast.literal_eval(node.value) == 44
            node.value = ast.Constant(value=43)
        return node
local_index = helper.body[2]
assert isinstance(local_index, ast.AnnAssign)
assert ast.unparse(local_index.target) == "relation_index"
assert ast.unparse(local_index.annotation) == "uint64"
assert ast.literal_eval(local_index.value) == 0
normalized = Normalize().visit(ast.Module(body=copy.deepcopy(helper.body[3:-1]), type_ignores=[]))
# Pin the reviewed original body without requiring historical objects in a
# shallow CI checkout. Canonical fields avoid version-specific ast.dump layout.
def canonical(n):
    if isinstance(n, ast.AST):
        return {"kind": type(n).__name__, **{k: canonical(v) for k,v in ast.iter_fields(n)}}
    if isinstance(n, list):
        return [canonical(v) for v in n]
    return n
def digest(n):
    return hashlib.sha256(json.dumps(canonical(n), sort_keys=True, separators=(",", ":")).encode()).hexdigest()
expected_digest = "e2671c84ef24424f483fb9a518447a285d9a075738043912ab7f62da83bd4358"
assert digest(normalized) == expected_digest
if original.returncode == 0:
    old = ast.parse(original.stdout)
    old_root = next(n for n in old.body if isinstance(n, ast.FunctionDef)
                    and n.name == "certified_complex_cubic_class_group_v1")
    blocks = [n for n in ast.walk(old_root) if isinstance(n, ast.If)
              and isinstance(n.test, ast.Name) and n.test.id == "dependency_scan_active"
              and n.body and isinstance(n.body[0], ast.Assign)
              and isinstance(n.body[0].targets[0], ast.Name)
              and n.body[0].targets[0].id == "dependency_scale_quotient"]
    assert len(blocks) == 1
    assert digest(ast.Module(body=blocks[0].body, type_ignores=[])) == expected_digest
# Independent high precision scalar oracle, unrelated to Arb or native helpers.
decimal.getcontext().prec = 110
a = decimal.Decimal("1.3")
for _ in range(20):
    a -= (a*a*a-a-1)/(3*a*a-1)
scaled_log = a.ln() * decimal.Decimal(2)**64
print(json.dumps({"ast_equivalent_except_guards": True,
                 "log_alpha_floor_scale64": str(int(scaled_log))}))
`;
  const result = JSON.parse(run(exe, [...args, "-c", program, productionPath]));
  assert.equal(result.ast_equivalent_except_guards, true);
  assert.equal(result.log_alpha_floor_scale64, "5187216581171745042");
});

function arithmeticWitness(modulePath) {
  const assert = require("node:assert/strict");
  const fn = require(modulePath).materialize_unit_schedule;
  const coefficients = [-1n, -1n, 0n, 1n];
  const table = [1,0,0, 0,1,0, 0,0,1, 0,1,0, 0,0,1, 1,1,0,
    0,0,1, 1,1,0, 0,1,1].map(BigInt);
  const norm = [1,0,-1,1,2,1,1,0,-1,-3].map(BigInt);
  // Independent schoolbook multiplication modulo a^3-a-1, rather than the
  // production multiplication helper, authenticates the fixture's exact data.
  const multiply = (left, right) => {
    const product = Array(5).fill(0n);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      product[i + j] += left[i] * right[j];
    }
    for (let degree = 4; degree >= 3; degree--) {
      product[degree - 3] += product[degree];
      product[degree - 2] += product[degree];
    }
    return product.slice(0,3);
  };
  const basis = [[1n,0n,0n], [0n,1n,0n], [0n,0n,1n]];
  assert.deepEqual(basis.flatMap((left) => basis.flatMap((right) => multiply(left, right))), table);
  assert.deepEqual(multiply([0n,1n,0n], [-1n,0n,1n]), [1n,0n,0n]);
  const exactNorm = (value) => {
    const [a,b,c] = basis.map((element) => multiply(value, element));
    return a[0]*(b[1]*c[2]-b[2]*c[1]) - b[0]*(a[1]*c[2]-a[2]*c[1]) +
      c[0]*(a[1]*b[2]-a[2]*b[1]);
  };
  for (let a = -2n; a <= 2n; a++) for (let b = -2n; b <= 2n; b++) {
    for (let c = -2n; c <= 2n; c++) {
      const terms = [a*a*a,a*a*b,a*b*b,b*b*b,a*a*c,a*c*c,c*c*c,b*b*c,b*c*c,a*b*c];
      assert.equal(terms.reduce((sum, term, index) => sum + term * norm[index], 0n),
        exactNorm([a,b,c]));
    }
  }
  const packed = [coefficients, table, norm].map((values) => fn.packIntegerBuffer(values, 16));
  const cases = [
    [2n, 1n, 0], [2n, 1n << 32n, 0], [(1n << 80n) + 13n, 1n, 0],
    [-(1n << 255n) + 11n, 1n, 0],
    [2n, 1n, 1], [2n, 1n << 32n, 1], [(1n << 80n) + 13n, 1n, 1],
    [-(1n << 255n) + 11n, 1n, 1],
    ...[2,3,4,5,6,7,8].map((mode) => [2n, 1n, mode]),
  ];
  const implementations = [fn.javascript, fn.gmp, fn.fmpz];
  let reference = null;
  for (const implementation of implementations) {
    const results = [];
    for (const [factor, scaleQuotient, mode] of cases) {
      const steps = 3;
      const out = fn.createIntegerBuffer(64 + 12 * steps, 16);
      assert.equal(implementation(...packed, out, factor, scaleQuotient, mode, steps), true,
        JSON.stringify({mode, factor: String(factor), out: out.toArray().map(String)}));
      const entries = out.toArray().slice(64);
      for (let step = 0; step < steps; step++) {
        const row = entries.slice(12 * step, 12 * step + 12);
        const poison = -791n - BigInt(step);
        assert(row[6] <= 5187216581171745042n && row[7] >= 5187216581171745043n,
          "actual regulator interval must contain independent Decimal log(alpha)");
        if (mode <= 1) {
          assert.deepEqual(row.slice(0,4), [1n,0n,1n,0n]);
          assert.deepEqual(row.slice(4,6), row.slice(6,8));
          assert.equal(row[8], mode === 0 ? 435n : 436n);
          assert.equal(row[11], mode === 0 ? 1n : 0n);
        } else {
          assert.deepEqual(row.slice(0,6), [0n,0n,0n,0n,0n,0n]);
          assert.equal(row[10], 44n, "materialization failure is fatal, never phase43");
          if (mode <= 4) {
            assert.equal(row[8], poison);
            assert.equal(row[11], poison);
          } else if (mode === 5) {
            assert.equal(row[8], 437n);
            assert.equal(row[9], 4097n);
          } else if (mode === 6) {
            assert.equal(row[8], 438n);
            assert.equal(row[9], 20480n);
          } else assert.equal(row[8], 436n);
        }
      }
      results.push(entries);
      packed.forEach((buffer, index) => assert.deepEqual(buffer.toArray(),
        [coefficients, table, norm][index]));
    }
    if (reference === null) reference = results;
    else assert.deepEqual(results, reference);
  }
  console.log("actual-materialize-unit-ok: 15 cases x 3 reused steps x dynamic/GMP/fmpz");
}

test("actual dependency unit materialization agrees in dynamic GMP and fmpz", {
  timeout: 240000,
}, async (t) => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-cubic-materialize-unit-"));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  const sourcePath = join(temporary, "materialize.py");
  writeFileSync(sourcePath, expandedFixture());
  const compiled = await compileKernel({ sourcePath,
    functions: ["materialize_unit_schedule"], cacheRoot: join(temporary, "cache") });
  for (const name of ["_cubic_materialize_dependency_unit", "_cubic_regulator_bounds",
    "_cubic_reconstruct_archimedean_unit", "_cubic_matrix_power_coordinates",
    "_cubic_matrix_exact_quotient_coordinates", "_cubic_norm_form_value"]) {
    assert(compiled.ir.functions.some((fn) => fn.name === name));
  }
  assert(compiled.ir.functions.every((fn) => fn.analysis.backend.kind === "fmpz"));
  assert.equal(compiled.ir.functions.find((fn) => fn.name === "materialize_unit_schedule")
    .analysis.liveExactWorkspace.scopes.length, 1);
  assert.equal(compiled.ir.functions.find((fn) => fn.name === "_cubic_materialize_dependency_unit")
    .analysis.liveExactWorkspace?.scopes.length || 0, 0);
  assert.doesNotMatch(readFileSync(compiled.coreSourcePath, "utf8"), /\bnapi_|\bPyObject\b/);
  assert.match(run(process.execPath, ["-e", "(" + arithmeticWitness.toString() + ")(" +
    JSON.stringify(compiled.modulePath) + ")"]), /actual-materialize-unit-ok/);
});
