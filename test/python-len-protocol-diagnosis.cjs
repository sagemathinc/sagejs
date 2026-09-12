// sagejs-test-tier: specialized
"use strict";

// A reporting diagnostic, not a passing assertion of known Python incompatibilities.
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve, join } = require("node:path");
const { spawnSync } = require("node:child_process");
const { createContext, runInContext } = require("node:vm");
const { pythonExecutable } = require("../tools/python-executable.cjs");

async function main() {
  const root = resolve(process.env.SAGEJS_LEN_DIAGNOSIS_ROOT || join(__dirname, ".."));
  const fixture = readFileSync(join(__dirname, "fixtures/python-len-protocol-diagnosis.py"), "utf8");
  const oracle = spawnSync(pythonExecutable(), ["-c", "import sys, json\nassert sys.version_info[:2] == (3, 14)\n" +
    fixture + "\nprint(json.dumps(observations, ensure_ascii=True))\n"], { encoding: "utf8" });
  assert.equal(oracle.status, 0, oracle.stderr || String(oracle.error));
  const expected = JSON.parse(oracle.stdout);
  const compiler = require(join(root, "dist/tools/compiler.js")).default();
  const frontend = await require(join(root, "dist/tools/python/compiler-frontend.js"))
    .createPythonCompilerFrontend(compiler, "python");
  try {
    const ast = frontend.parse(fixture, { filename: "<len-protocol-diagnosis>" });
    const output = new compiler.OutputStream({
      baselib_plain: readFileSync(join(root, "dist/compiler/baselib-plain-pretty.js"), "utf8"),
      write_name: false, beautify: true, private_scope: false,
    });
    ast.print(output);
    const context = createContext({ console, require, Buffer, process, __sagejs_runtime_require__: require });
    runInContext(output.get(), context);
    const actual = JSON.parse(JSON.stringify(context.ρσ_modules.__main__.observations));
    assert.equal(actual.length, expected.length);
    const publicCases = expected.map((reference, index) => {
      assert.equal(actual[index][0], reference[0]);
      return { name: reference[0], cpython: reference.slice(1), sagejs: actual[index].slice(1),
        equal: JSON.stringify(reference) === JSON.stringify(actual[index]) };
    });
    const builtins = context.__sagejs_baselib_modules__["sagejs._baselib.builtins"];
    const hosts = [ ["plain-object", { a: 1, b: 2 }], ["null-prototype", Object.assign(Object.create(null), { a: 1 })],
      ["function", Object.assign(function(a, b) {}, { visible: 1 })], ["map", new Map([["a", 1]])],
      ["set", new Set([1, 2])], ["same-realm-map", runInContext('new Map([["a", 1]])', context)],
      ["same-realm-set", runInContext('new Set([1, 2])', context)],
      ["typed-array", new Uint16Array(3)], ["null", null],
      ["number", 3], ["raw-instance-len", { __len__() { return -1; } }] ];
    const hostCases = hosts.map(([name, value]) => {
      try { return { name, value: builtins.ρσ_len(value) }; }
      catch (error) { return { name, error: String(error) }; }
    });
    console.log(JSON.stringify({ artifactRoot: root, publicCases, hostCases }, null, 2));
  } finally { if (frontend.dispose) frontend.dispose(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
