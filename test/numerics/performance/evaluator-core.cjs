// sagejs-test-tier: native
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawnSync } = require("node:child_process");
const { compileKernel } = require("../../../tools/native-kernel/compiler.cjs");
const { pythonPrefix } = require("../../../bench/numerics/performance/run.cjs");
const { removeLoadedNativeCache } = require("../../helpers/native-cache-cleanup.cjs");
const { buildWasmProductionPacks } = require("../../../tools/native-kernel/wasm-production-pack.cjs");
const { wasmKernelToolchain, inspectToolchain } = require("../../../packages/wasm-toolchain/scripts/toolchain.cjs");
const { pathToFileURL } = require("node:url");
const root = path.resolve(__dirname, "../../..");
const sourcePath = path.join(root, "src/lib/sagejs/numerics/_evaluation_core.py");

test("ordinary Sage.js evaluator retains its same-source dynamic fallback", async () => {
  const previous = process.env.SAGEJS_NATIVE_DISABLE;
  process.env.SAGEJS_NATIVE_DISABLE = "1";
  let sage;
  try {
    sage = await require(path.join(root, "dist/tools/kernel.js")).createSage({ mode: "python" });
    const result = await sage.evaluate(fs.readFileSync(sourcePath, "utf8") + `
from sagejs.native import is_compiled
assert not is_compiled(evaluate_program)
output = [13.0]
assert evaluate_program([1,7,0,6], [0,0,0,1], [0,0,0,2], [2.0], [3.0], [0.0]*4, output, 4) == 0.0
assert output == [7.0]
assert evaluate_program([9], [0], [0], [], [], [0.0], output, 1) == 1.0
assert output == [7.0]
print("dynamic evaluator passed")
`);
    assert.equal(result.stdout, "dynamic evaluator passed\n");
  } finally {
    if (sage) await require("../../../bench/numerics/performance/run.cjs").closeSession(sage);
    if (previous === undefined) delete process.env.SAGEJS_NATIVE_DISABLE;
    else process.env.SAGEJS_NATIVE_DISABLE = previous;
  }
});

test("mixed binary64 control buffers are read-only and source isolated", async () => {
  const { lowerSource } = require("../../../tools/native-kernel/ir.cjs");
  const { generateHostCore } = require("../../../tools/native-kernel/c-backend.cjs");
  const ir = await lowerSource(fs.readFileSync(sourcePath, "utf8"), sourcePath);
  const generated = generateHostCore(ir);
  assert.equal(generated.audit.isolated, true);
  assert.equal(generated.audit.hostCallbacks, 0);
  assert.deepEqual(ir.functions[0].analysis.effects.mutates, ["output", "scratch"]);
  await assert.rejects(lowerSource(`
from sagejs.native import native, UInt64Buffer
@native
def forbidden(words: UInt64Buffer) -> float:
    words[0] = 1
    return 0.0
`, "readonly-control.py"), /buffer assignment requires|buffer writes|buffer assignment|Float64/);
});

function cases() {
  const rows = [];
  const scalar = value => Object.is(value, -0) ? "-0" : String(value);
  function add(opcodes, left, right, constants, inputs, status, value) {
    rows.push({ opcodes: opcodes.map(String), left: left.map(String), right: right.map(String),
      constants: constants.map(scalar), inputs: inputs.map(scalar), count: opcodes.length,
      status, value: scalar(value) });
  }
  add([1,7,0,6], [0,0,0,1], [0,0,0,2], [2], [3], 0, 7);
  for (const [op, a, b, result] of [[5,2,3,5],[6,2,3,-1],[7,2,3,6],[8,6,3,2]]) {
    add([0,0,op],[0,1,0],[0,0,1],[a,b],[],0,result);
  }
  for (const [op, a, result] of [[2,3,-3],[3,-3,3],[4,9,3]]) {
    add([0,op],[0,0],[0,0],[a],[],0,result);
  }
  add([0,4],[0,0],[0,0],[-1],[],2,13);
  add([0,0,8],[0,1,0],[0,0,1],[1,0],[],2,13);
  add([0,0,7],[0,1,0],[0,0,1],[1e308,1e308],[],3,13);
  for (const value of ["nan", "inf", "-inf"]) add([0],[0],[0],[value],[],3,13);
  add([9],[0],[0],[],[],1,13);
  add([2],[0],[0],[],[],1,13);
  add([1],["18446744073709551615"],[0],[],[1],1,13);
  add([0],[1],[0],[1],[],1,13);
  add([0,5],[0,0],[0,1],[1],[],1,13);
  add([],[],[],[],[],1,13);
  add([0],[],[0],[1],[],1,13);
  add([0],[0],[],[1],[],1,13);
  add([0],[0],[0],[-0],[],0,-0);
  add([0,2],[0,0],[0,0],[0],[],0,-0);
  add([0,4],[0,0],[0,0],[-0],[],0,-0);
  add([0,3],[0,0],[0,0],[-0],[],0,0);
  add([0,0,8],[0,1,0],[0,0,1],[5e-324,2],[],0,0);
  // Deterministic exact arithmetic cases, with independent integer results.
  for (let i=0;i<128;i++) add([1,7,0,6],[0,0,0,1],[0,0,0,2],[2],[i-64],0,(i-64)**2-2);
  return rows;
}
const number = text => text === "nan" ? NaN : text === "inf" ? Infinity : text === "-inf" ? -Infinity : Number(text);

test("bounded expression core agrees with CPython, native and generated JavaScript", async () => {
  const rows = cases();
  const program = pythonPrefix(root) + `
import json, sys, math
from sagejs.numerics._evaluation_core import evaluate_program
rows = json.loads(sys.argv[1])
for row in rows:
    output = [13.0]
    status = evaluate_program([int(x) for x in row['opcodes']], [int(x) for x in row['left']],
        [int(x) for x in row['right']], [float(x) for x in row['constants']],
        [float(x) for x in row['inputs']], [0.0] * row['count'], output, row['count'])
    assert status == row['status'], row
    assert output[0] == float(row['value']), row
    if output[0] == 0.0:
        assert math.copysign(1.0, output[0]) == math.copysign(1.0, float(row['value'])), row
print('passed')
`;
  const python = spawnSync(process.env.PYTHON || (process.platform === "win32" ? "python" : "python3"),
    ["-I", "-c", program, JSON.stringify(rows)], { encoding: "utf8", timeout: 120000 });
  assert.equal(python.status, 0, python.stderr);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-evaluator-core-"));
  try {
    const artifact = await compileKernel({ sourcePath, cacheRoot: directory });
    const core = require(artifact.modulePath).evaluate_program;
    assert.equal(core.nativeAvailable, true);
    const implementations = [core, core.javascript];
    if (inspectToolchain({ root }).ready) {
      const manifestPath = path.join(directory, "manifest.json");
      fs.writeFileSync(manifestPath, JSON.stringify({ kernels: [{
        id: "numerical-evaluator-production", source: "src/lib/sagejs/numerics/_evaluation_core.py",
        functions: ["evaluate_program"], fallback: "same-source", oracles: ["CPython"],
      }] }));
      const toolchain = wasmKernelToolchain({ root });
      for (const name of ["gmpPrefix", "flintPrefix", "mpfrPrefix", "mpcPrefix"]) toolchain[name] = path.join(directory, "absent", name);
      const manifest = await buildWasmProductionPacks({ root, manifestPath, outputRoot: directory, toolchain, isolateFloat64: true });
      assert.deepEqual(manifest.packs[0].toolchain.archives, []);
      const { instantiateWasmKernelPacks } = await import(pathToFileURL(path.join(root, "tools/native-kernel/wasm-pack-loader.mjs")));
      const resolver = await instantiateWasmKernelPacks({ manifest,
        load: pack => fs.readFileSync(path.join(directory, pack.asset)),
        host(_pack, module) {
          const imports = {};
          for (const item of WebAssembly.Module.imports(module)) {
            assert.equal(item.module, "wasi_snapshot_preview1");
            imports[item.module] ??= {};
            imports[item.module][item.name] = () => { throw new Error("unexpected host callback"); };
          }
          return imports;
        },
      });
      implementations.push(resolver.resolve("sagejs/numerics/_evaluation_core.py", "evaluate_program"));
    }
    for (const run of implementations) for (const row of rows) {
      const output = new Float64Array([13]);
      const args = [row.opcodes,row.left,row.right].map(a => BigUint64Array.from(a, BigInt));
      const status = run(...args, Float64Array.from(row.constants, number), Float64Array.from(row.inputs, number),
        new Float64Array(row.count), output, BigInt(row.count));
      assert.equal(status, row.status, JSON.stringify(row));
      assert.equal(output[0], number(row.value), JSON.stringify(row));
    }
  } finally { removeLoadedNativeCache(directory); }
});
