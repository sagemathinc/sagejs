"use strict";
const assert = require("node:assert/strict");
const path = require("node:path");
const {spawnSync} = require("node:child_process");
const compilerRoot = process.argv[4] && !process.argv[4].startsWith("--") ? process.argv[4] : path.join(__dirname,"../..");
const {compileKernel} = require(path.resolve(compilerRoot, "tools/native-kernel/compiler.cjs"));
(async () => {
  const mixed = process.argv.includes("--mixed");
  const functionName = mixed ? "pari_prepared_mixed_norm" : "pari_prepared_real_norm";
  const oracle = spawnSync("python3", [path.join(__dirname, "check_multiply_precision.py"),
    process.argv[2], process.argv[3], mixed ? "--mixed-json" : "--norm-json"],
    {encoding: "utf8", timeout: 30000, maxBuffer: 1024 * 1024});
  assert.equal(oracle.status, 0, oracle.stderr);
  const rows = JSON.parse(oracle.stdout);
  const python = spawnSync("python3", ["-c", `
import sys,json
sys.path.insert(0,${JSON.stringify(path.resolve(__dirname, "../../src/lib"))})
sys.path.insert(0,${JSON.stringify(__dirname)})
from short_product import ${functionName} as operation
for row in json.load(sys.stdin):
    r = list(map(int,row)); offset = ${mixed ? 2 : 1}
    counts = r[:offset]; n = counts[0] + ${mixed ? "2*counts[1]" : "0"}
    values = r[offset:offset+3*n]
    actual = operation(values[0::3],values[1::3],values[2::3],*counts)
    assert actual == tuple(r[offset+3*n:]), (r,actual)
print("CPython ${functionName} matches PARI")
`], {input: JSON.stringify(rows), encoding: "utf8", timeout: 30000});
  assert.equal(python.status, 0, python.stderr);
  console.log(python.stdout.trim());
  const built = await compileKernel({sourcePath: path.join(__dirname, "short_product.py")});
  const mod = require(built.modulePath);
  for (const row of rows) {
    const data = row.map(BigInt), offset = mixed ? 2 : 1;
    const counts = data.slice(0,offset), n = Number(counts[0] + (mixed ? 2n*counts[1] : 0n));
    const values = data.slice(offset, offset + 3*n), expected = data.slice(offset + 3*n);
    const args = [0,1,2].map(offset => values.filter((_,i) => i%3===offset));
    args.push(...counts);
    for (const f of [mod[functionName].javascript, mod[functionName].gmp, mod[functionName].tagged])
      assert.deepEqual(f(...args), expected);
  }
  console.log(`${rows.length} ${functionName} results match PARI in generated JS, forced GMP and tagged`);
})().catch(error => { console.error(error); process.exitCode = 1; });
