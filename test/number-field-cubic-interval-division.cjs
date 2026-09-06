// sagejs-test-tier: specialized
"use strict";
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const test = require("node:test");
const { compileKernel } = require("../tools/native-kernel/compiler.cjs");
const { pythonExecutable } = require("../tools/python-executable.cjs");

const floor = (n, d) => n >= 0n ? n / d : -((-n + d - 1n) / d);
const ceil = (n, d) => -floor(-n, d);
const minimum = values => values.reduce((a, b) => a < b ? a : b);
const maximum = values => values.reduce((a, b) => a > b ? a : b);

// Independent four-corner rational oracle, not the optimized sign branches.
function oracle(a, b, c, d, s) {
  if (c <= 0n || d < c) return [1n, 0n];
  const corners = [[a*s,c], [a*s,d], [b*s,c], [b*s,d]];
  return [minimum(corners.map(([n,v]) => floor(n,v))),
    maximum(corners.map(([n,v]) => ceil(n,v)))];
}

test("direct cubic interval division gives sharp outward bounds across backends", {
  timeout: 240_000,
}, async t => {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-cubic-interval-division-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const sourcePath = resolve(__dirname, "../src/lib/sagejs/number_fields/cubic_class_number_native.py");
  const compiled = await compileKernel({ sourcePath, cacheRoot: directory,
    functions: ["_cubic_dyadic_divide_positive"] });
  const f = require(compiled.modulePath)._cubic_dyadic_divide_positive;
  const implementations = [f.javascript, f.tagged, f.gmp, f];
  implementations.forEach(impl => assert.equal(typeof impl, "function"));
  const cases = [];
  let tighter = 0;
  function check(args) {
    const expected = oracle(...args);
    for (const impl of implementations) assert.deepEqual(impl(...args).map(BigInt), expected, args.join(","));
    const [a,b,c,d,s] = args;
    if (c > 0n && d >= c) {
      // Reconstruct the former reciprocal-then-product enclosure independently.
      const r = floor(s*s,d), u = ceil(s*s,c);
      const products = [a*r,a*u,b*r,b*u];
      const old = [floor(minimum(products),s),ceil(maximum(products),s)];
      assert.ok(old[0] <= expected[0] && expected[1] <= old[1]);
      if (old[0] < expected[0] || expected[1] < old[1]) tighter++;
    }
    cases.push([args.map(String),expected.map(String)]);
  }
  for (let a=-8n;a<=8n;a++) for (let b=a;b<=8n;b++)
    for (let c=1n;c<=7n;c++) for (let d=c;d<=7n;d++)
      for (const s of [1n,2n,17n,1n<<64n]) check([a,b,c,d,s]);
  let seed = 20260906n;
  const random = bits => {
    let value = 0n;
    for (let k=0;k<bits;k+=32) {
      seed = (1664525n*seed+1013904223n)&0xffffffffn;
      value = (value<<32n)|seed;
    }
    return value;
  };
  for (let i=0;i<2000;i++) {
    const bits = [64,128,256,512,1024][i%5];
    const x=random(bits)*(i%2?1n:-1n), y=random(bits)*(i%3?1n:-1n);
    const c=random(bits)+1n, d=c+random(bits);
    check([x<y?x:y,x<y?y:x,c,d,1n<<BigInt([0,16,64,192][i%4])]);
  }
  for (const [c,d] of [[0n,1n],[-1n,1n],[2n,1n]]) check([-3n,5n,c,d,17n]);
  const python = spawnSync(pythonExecutable(), ["-c", String.raw`
import ast, json, pathlib, sys
from fractions import Fraction
tree = ast.parse(pathlib.Path(sys.argv[1]).read_text())
names = {'_cubic_dyadic_ceiling_quotient', '_cubic_dyadic_divide_positive'}
tree.body = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in names]
assert len(tree.body) == len(names)
for node in tree.body:
    node.decorator_list = []
namespace = {}
exec(compile(tree, sys.argv[1], 'exec'), namespace)
for values, expected in json.load(sys.stdin):
    a,b,c,d,s = map(int, values)
    actual = namespace['_cubic_dyadic_divide_positive'](a,b,c,d,s)
    assert list(actual) == list(map(int, expected))
    if c > 0 and d >= c:
        corners = [Fraction(x*s,y) for x in (a,b) for y in (c,d)]
        assert actual == (min(corners).__floor__(), max(corners).__ceil__())
`, sourcePath], { input: JSON.stringify(cases), encoding: "utf8", timeout: 60_000 });
  assert.equal(python.status, 0, `${python.error || ""}\n${python.stderr}`);
  t.diagnostic(`${cases.length} cases per backend and CPython; ${tighter} strictly tighter than reciprocal rounding`);
});
