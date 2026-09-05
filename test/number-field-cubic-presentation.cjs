// sagejs-test-tier: specialized
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const test = require("node:test");
const { compileKernel } = require("../tools/native-kernel/compiler.cjs");
const { generateHostCore } = require("../tools/native-kernel/c-backend.cjs");
const { lowerSource } = require("../tools/native-kernel/ir.cjs");
const { createNativeImportResolver } = require("../tools/native-kernel/native-imports.cjs");
const { pythonExecutable } = require("../tools/python-executable.cjs");

const root = resolve(__dirname, "..");
const productionPath = join(root,
  "src/lib/sagejs/number_fields/cubic_class_number_native.py");
const fixturePath = join(root, "test/fixtures/cubic-presentation.py");
const helperNames = [
  "_cubic_prepare_full_relation_presentation",
  "_cubic_finish_full_relation_presentation",
  "_cubic_publish_trivial_relation_presentation",
  "_cubic_publish_relation_factor_rows",
  "_cubic_publish_relation_rows",
];

function expandedFixture() {
  const production = readFileSync(productionPath, "utf8");
  const helpers = helperNames.map((name) => {
    const start = production.indexOf(`\ndef ${name}(`) + 1;
    assert.ok(start > 0, name);
    const end = production.slice(start + 1).search(/\n(?:@native\n)?def /);
    assert.ok(end > 0, name);
    return production.slice(start, start + 1 + end);
  }).join("\n\n");
  const constants = ["_ROW_SCRATCH_OFFSET", "_POWER_OFFSET", "_CUBIC_MAX_POWERS",
    "_CUBIC_PROOF_TRIVIAL_MINKOWSKI", "_CUBIC_PROOF_TRIVIAL_GRH"]
    .map((name) => {
      const declaration = production.match(new RegExp(`^${name} = [^\\n]+`, "m"));
      assert.ok(declaration, name);
      return declaration[0];
    }).join("\n");
  return readFileSync(fixturePath, "utf8").replace(
    /from sagejs\.number_fields\.cubic_class_number_native import \([\s\S]*?\)\n/,
    `${constants}\n\n${helpers}\n`);
}

test("CPython retains presentation failure distinctions and lazy ownership", () => {
  // Inject malformed foreign results only to reach defensive branches which
  // a correct FLINT reduction cannot produce. The arithmetic test below uses
  // actual FLINT in every backend and never uses these failure doubles.
  const run = spawnSync(pythonExecutable(), ["-", productionPath], {
    encoding: "utf8", timeout: 30_000, input: String.raw`
import ast
import sys

with open(sys.argv[1]) as stream:
    module = ast.parse(stream.read())
names = {"_cubic_prepare_full_relation_presentation", "_cubic_finish_full_relation_presentation"}
namespace = {"_ROW_SCRATCH_OFFSET": 7880}
for node in module.body:
    if isinstance(node, ast.FunctionDef) and node.name in names:
        exec("from __future__ import annotations\n" + ast.unparse(node), namespace)

class Matrix:
    def __init__(self, rows=5, columns=3):
        self.values = [[0] * columns for _ in range(rows)]
    def __getitem__(self, key):
        row, column = key
        return self.values[row][column]
    def __setitem__(self, key, value):
        row, column = key
        self.values[row][column] = value

source, online, copied, hermite, smith = (Matrix() for _ in range(5))
output, workspace = [0] * 64, [0] * 8192
prepare = namespace["_cubic_prepare_full_relation_presentation"]
finish = namespace["_cubic_finish_full_relation_presentation"]
hnf_rows = [[2, 0], [0, 3], [0, 0]]
smith_diagonal = [1, 6]
def hnf(result, source, rows, columns):
    for row in range(rows):
        for column in range(columns):
            result[row, column] = hnf_rows[row][column]
    return True
def snf(result, source, rows, columns):
    for index, value in enumerate(smith_diagonal):
        result[index, index] = value
    return True
namespace.update(fmpz_matrix_hnf_prefix_into=hnf, fmpz_matrix_snf_prefix_into=snf)
args = (source, online, copied, hermite, output)
assert prepare(*args, 1, 2, False, False) == (0, 0)
assert prepare(*args, 1, 2, False, True) == (-1, 0)
assert prepare(*args, 0, 0, False, False) == (-1, 0)
assert prepare(*args, 3, 2, False, True) == (1, 2)
assert finish(workspace, copied, smith, output, 3, 2) == (1, 6, 1)
assert workspace[7880] == 6
hnf_rows[1] = [0, 0]
assert prepare(*args, 3, 2, False, False) == (0, 1)
assert prepare(*args, 3, 2, False, True) == (-1, 1)
online[0, 0] = 2
assert prepare(*args, 3, 2, True, False) == (0, 1)
assert prepare(*args, 3, 2, True, True) == (-1, 1)
hnf_rows[1], hnf_rows[2] = [0, 3], [1, 1]
assert prepare(*args, 3, 2, False, False) == (-1, 3)
for diagonal in ([0, 6], [2, 3]):
    smith_diagonal = diagonal
    assert finish(workspace, copied, smith, output, 3, 2) == (-1, 0, 0)
smith_diagonal = [-2, -6]
assert finish(workspace, copied, smith, output, 3, 2) == (1, 12, 2)
namespace["fmpz_matrix_hnf_prefix_into"] = lambda *args: False
namespace["fmpz_matrix_snf_prefix_into"] = lambda *args: False
assert prepare(*args, 3, 2, False, False) == (-1, 0)
assert finish(workspace, copied, smith, output, 3, 2) == (-1, 0, 0)

# Preserve the real rank-before-Smith allocation barrier in the root, rather
# than just testing a wrapper that allocates every scratch owner eagerly.
root = next(node for node in module.body if isinstance(node, ast.FunctionDef)
            and node.name == "certified_complex_cubic_class_group_v1")
arena = next(node for node in root.body if isinstance(node, ast.With))
statements = [ast.unparse(node) for node in arena.body]
prepare_at = next(i for i, text in enumerate(statements)
                  if "= _cubic_prepare_full_relation_presentation(" in text)
smith_at = next(i for i, text in enumerate(statements)
                if text.startswith("relation_smith = arena.foreign_resource("))
finish_at = next(i for i, text in enumerate(statements)
                 if "= _cubic_finish_full_relation_presentation(" in text)
assert prepare_at < smith_at < finish_at
assert statements[prepare_at + 1] == "if presentation_status != 1:\n    return False"
assert statements[finish_at + 1] == "if presentation_status != 1:\n    return False"
assert "relation_count, factor_count" in statements[smith_at]
assert "modular_workspace[_CUBIC_MODULAR_RANK_OFFSET] == factor_count" in statements[prepare_at - 1]
assert "online_relation_status == 2" in statements[prepare_at - 1]
print("actual CPython helpers, contradiction guards, and lazy Smith allocation pass")
`,
  });
  assert.equal(run.status, 0, `${run.error || ""}\n${run.stdout}${run.stderr}`);
});

test("actual presentation helpers remain private inside the full fmpz closure", {
  timeout: 120_000,
}, async () => {
  const source = readFileSync(productionPath, "utf8");
  const ir = await lowerSource(source, productionPath, {
    functions: ["certified_complex_cubic_class_group_v1"],
    resolveNativeImport: createNativeImportResolver({root, lowerSource,
      initialSourcePath: productionPath}),
  });
  for (const fn of ir.functions) {
    assert.equal(fn.analysis.backend.kind, "fmpz", fn.name);
  }
  for (const name of helperNames.slice(0, 3)) {
    const fn = ir.functions.find((entry) => entry.name === name);
    assert.ok(fn, name);
    assert.equal(fn.hostCallable, false, name);
    assert.equal(fn.analysis.liveExactWorkspace?.scopes.length || 0, 0, name);
    assert.ok(ir.callGraph.certified_complex_cubic_class_group_v1.includes(name));
  }
  const core = generateHostCore(ir);
  for (const name of helperNames.slice(0, 3)) {
    assert.match(core.source, new RegExp(`\\bfmpz_native_${name}\\(`));
    assert.doesNotMatch(core.header, new RegExp(`\\bsagejs_kernel_${name}\\(`));
  }
});

test("real HNF, Smith and trivial publication agree in JavaScript, GMP and fmpz", {
  timeout: 240_000,
}, async (t) => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-cubic-presentation-"));
  t.after(() => rmSync(temporary, {recursive: true, force: true}));
  const actualFixture = join(temporary, "presentation.py");
  writeFileSync(actualFixture, expandedFixture());
  const compiled = await compileKernel({sourcePath: actualFixture,
    cacheRoot: join(temporary, "cache")});
  const run = spawnSync(process.execPath, ["-e", String.raw`
const assert = require("node:assert/strict");
const {presentation_schedule: schedule, presentation_publication: publish} = require(process.argv[1]);
const rows = [[0,0,0],[0,2,0],[0,4,0],[1,0,0],[0,0,3],[1,2,3],[0,1,0],[0,0,1]];
for (const scale of [1n, -3n, (1n << 80n) + 13n, -(1n << 255n) + 11n]) {
  const absolute = scale < 0n ? -scale : scale;
  const data = rows.flat().map((entry) => BigInt(entry) * scale);
  const prefixes = new BigUint64Array([5n,8n,5n,8n]);
  for (const reuse of [false, true]) for (const impl of [schedule.javascript, schedule.gmp, schedule.fmpz]) {
    const input = schedule.packIntegerBuffer(data, 32);
    const output = schedule.createIntegerBuffer(64, 32);
    assert.equal(impl(input, prefixes, output, schedule.createIntegerBuffer(64, 32),
      3n, reuse, true, 3 << 20, 3 << 20), true);
    const expected = [];
    for (const prefix of [5,8,5,8]) {
      // At five rows the quotient is Z/s + Z/s + Z/(6s).
      // At eight rows it is (Z/s)^3. This follows directly from the
      // independent coordinate generators; no competitor result is used.
      const diagonal = prefix === 5 ? [absolute, absolute, 6n * absolute]
        : [absolute, absolute, absolute];
      const invariants = diagonal.filter((entry) => entry > 1n);
      expected.push(1n,3n,1n,diagonal.reduce((a,b) => a*b, 1n), BigInt(invariants.length),
        ...invariants,...Array(8-invariants.length).fill(0n),1n,1n,BigInt(reuse ? 3 : prefix));
    }
    assert.deepEqual(output.toArray(), expected);
    assert.deepEqual(input.toArray(), data);
    assert.throws(() => impl(input, prefixes, output, schedule.createIntegerBuffer(64, 32),
      3n, reuse, true, 0n, 3 << 20), /memory|budget|capacity|range/i);
    assert.equal(impl(input, prefixes, output, schedule.createIntegerBuffer(64, 32),
      3n, reuse, true, 3 << 20, 3 << 20), true);
  }
}

// Rank deficiency is resumable only without an independent full-rank claim.
// Counts of zero and one decline before a zero-sized FLINT window is made.
for (const reuse of [false,true]) for (const full of [false,true]) {
  for (const impl of [schedule.javascript,schedule.gmp,schedule.fmpz]) {
    const output = schedule.createIntegerBuffer(48, 8);
    const input = schedule.packIntegerBuffer([2n,0n,4n,0n,6n,0n], 8);
    assert.equal(impl(input,new BigUint64Array([0n,1n,3n]),output,
      schedule.createIntegerBuffer(64,8),2n,reuse,full,3 << 20,3 << 20),true);
    const expected = [];
    for (const count of [0,1,3]) expected.push(full ? -1n : 0n, count < 2 ? 0n : 1n,
      -911n,0n,0n,...Array(8).fill(0n),1n,1n,BigInt(count < 2 ? 0 : reuse ? 2 : count));
    assert.deepEqual(output.toArray(),expected);
  }
}

// Nine nontrivial invariants exceed publication capacity: not NEED_RELATIONS.
for (const impl of [schedule.javascript,schedule.gmp,schedule.fmpz]) {
  const diagonal = Array.from({length:44*9},(_,i) =>
    Math.floor(i/9) < 9 && Math.floor(i/9) === i%9 ? 2n : 0n);
  const output = schedule.createIntegerBuffer(48,8);
  assert.equal(impl(schedule.packIntegerBuffer(diagonal,8),new BigUint64Array([9n,44n,9n]),output,
    schedule.createIntegerBuffer(64,8),9n,false,true,3 << 20,3 << 20),true);
  assert.deepEqual(output.toArray(),[9,44,9].flatMap(count =>
    [1n,9n,-2n,0n,0n,...Array(8).fill(0n),1n,1n,BigInt(count)]));
}

for (const grh of [false,true]) for (const mode of [0n,1n]) {
  for (const impl of [publish.javascript,publish.gmp,publish.fmpz]) {
    const output = publish.packIntegerBuffer(Array(64).fill(-733n),8);
    const factors = publish.createIntegerBuffer(mode ? 18 : 1,8);
    const relationRows = publish.createIntegerBuffer(mode ? 6 : 1,8);
    const elements = publish.createIntegerBuffer(mode ? 9 : 1,8);
    assert.equal(impl(output,factors,relationRows,elements,mode,grh),true);
    const expected = Array(64).fill(0n);
    const fields = {0:2,1:1,19:4,20:17,21:2,22:1,23:3,24:1,25:1,28:-123,
      29:3,30:9,31:2,32:9,33:2,34:-1107,35:grh ? 3 : 2,50:8,51:3,52:3,53:3};
    for (const [index,value] of Object.entries(fields)) expected[Number(index)] = BigInt(value);
    assert.deepEqual(output.toArray(),expected);
    if (mode) {
      assert.deepEqual(factors.toArray(),[...Array.from({length:9},(_,i)=>BigInt(i+1)),
        ...Array.from({length:9},(_,i)=>BigInt(i+101))]);
      assert.deepEqual(relationRows.toArray(),[2n,0n,0n,3n,1n,1n]);
      assert.deepEqual(elements.toArray(),[1n,2n,3n,11n,12n,13n,21n,22n,23n]);
    }
    for (const bad of [0,1,2]) {
      const rejected = publish.packIntegerBuffer(Array(64).fill(-733n),8);
      const buffers = [18,6,9].map((length,index)=>publish.createIntegerBuffer(index===bad?1:length,8));
      assert.equal(impl(rejected,...buffers,1n,grh),false);
      assert.equal(rejected.toArray()[0],-733n);
    }
  }
}
`, compiled.modulePath], {cwd: root,encoding: "utf8",timeout: 180_000});
  assert.equal(run.status, 0, `${run.error || ""}\n${run.stdout}${run.stderr}`);
});
