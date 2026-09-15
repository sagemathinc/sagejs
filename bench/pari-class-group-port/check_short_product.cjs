"use strict";
const assert = require("node:assert/strict");
const path = require("node:path");
const {spawnSync} = require("node:child_process");
const compilerRoot = process.argv[4] && !process.argv[4].startsWith("--") ? process.argv[4] : path.join(__dirname,"../..");
const {compileKernel} = require(path.resolve(compilerRoot, "tools/native-kernel/compiler.cjs"));
(async () => {
  const addition = process.argv.includes("--addition");
  const signed = process.argv.includes("--signed-addition");
  const functionName = signed ? "pari_signed_real_sum" : addition ? "pari_positive_real_sum" : "pari_short_product";
  const oracle = spawnSync("python3", [path.join(__dirname, signed ? "check_signed_add.py" : addition ? "check_add_precision.py" : "check_multiply_precision.py"),
    process.argv[2], process.argv[3], "--json"],
    {encoding: "utf8", timeout: 30000, maxBuffer: 1024 * 1024});
  assert.equal(oracle.status, 0, oracle.stderr);
  const rows = JSON.parse(oracle.stdout);
  const python = spawnSync("python3", ["-c", `
import sys,json
sys.path.insert(0,${JSON.stringify(path.resolve(__dirname, "../../src/lib"))})
sys.path.insert(0,${JSON.stringify(__dirname)})
from short_product import ${functionName} as operation
for row in json.load(sys.stdin):
    r = list(map(int,row))
    actual = operation(*r[:6])
    assert actual == tuple(r[6:]), (r,actual)
print("CPython ${functionName} matches all prepared records")
`], {input: JSON.stringify(rows), encoding: "utf8", timeout: 30000});
  assert.equal(python.status, 0, python.stderr);
  console.log(python.stdout.trim());
  const built = await compileKernel({sourcePath: path.join(__dirname, "short_product.py")});
  const mod = require(built.modulePath), raw = require(built.addonPath);
  for (const row of rows) {
    const data = row.map(BigInt), args = data.slice(0, 6), expected = data.slice(6);
    for (const f of [mod[functionName], mod[functionName].javascript, raw[functionName]])
      assert.deepEqual(f(...args), expected);
  }
  console.log(`${rows.length} ${functionName} results match PARI in generated JS and forced native`);
})().catch(error => { console.error(error); process.exitCode = 1; });
