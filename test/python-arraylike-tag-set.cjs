// sagejs-test-tier: unit
// sagejs-test-platform: true
"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join, resolve } = require("node:path");
const { createContext, runInContext, runInNewContext } = require("node:vm");
const { performance } = require("node:perf_hooks");

const root = join(__dirname, "..");
// Optional read-only compiler seed supports pre-build source diagnostics.
const compilerRoot = resolve(process.env.SAGEJS_ARRAYLIKE_COMPILER_ROOT || root);
const tags = [
  "Int8Array", "Uint8Array", "Uint8ClampedArray", "Int16Array", "Uint16Array",
  "Int32Array", "Uint32Array", "Float32Array", "Float64Array", "BigInt64Array",
  "BigUint64Array", "HTMLCollection", "NodeList", "NamedNodeMap", "TouchList",
];

async function main() {
  const compiler = require(join(compilerRoot, "dist/tools/compiler.js")).default();
  const frontend = await require(join(compilerRoot, "dist/tools/python/compiler-frontend.js"))
    .createPythonCompilerFrontend(compiler, "python");
  try {
    const source = readFileSync(join(root, "src/baselib/builtins.py"), "utf8");
    const section = source.slice(source.indexOf("_BUILTINS_ARRAYLIKE_TAGS ="),
      source.indexOf("\n\ndef options_object"));
    assert.deepEqual([...section.matchAll(/"\[object ([^\]]+)\]"/g)].map(m => m[1]), tags);
    assert.match(section, /runtime\.reflect\.construct\(\s*runtime\.set_class,/);
    const baseline = "_BUILTINS_ARRAYLIKE_TAGS = " +
      JSON.stringify(tags.map(tag => `[object ${tag}]`)) + "\n\n" +
      section.slice(section.indexOf("def ρσ_arraylike"))
        .replace("_BUILTINS_ARRAYLIKE_TAGS.has(tag)", "tag in _BUILTINS_ARRAYLIKE_TAGS");
    function compile(body) {
      const ast = frontend.parse("import sagejs.runtime as runtime\n" + body,
        { filename: "<arraylike-source-oracle>" });
      const output = new compiler.OutputStream({
        baselib_plain: readFileSync(join(compilerRoot, "dist/compiler/baselib-plain-pretty.js"), "utf8"),
        write_name: false, beautify: true, private_scope: false,
      });
      ast.print(output);
      const context = createContext({ console, require, Buffer, process,
        __sagejs_runtime_require__: require });
      runInContext(output.get(), context);
      return { candidate: context.ρσ_modules.__main__.ρσ_arraylike,
        shipped: context.__sagejs_baselib_modules__["sagejs._baselib.builtins"].ρσ_arraylike };
    }
    const compiled = compile(section);
    const old = compile(baseline).candidate;
    const cases = [
      [null, false], [undefined, false], [[], true], ["", true], ["abc", true],
      [{}, false], [Object.create(null), false], [0, false], [1n, false],
      [false, false], [Symbol("x"), false], [() => {}, false],
      [new String("abc"), false], [new Set(), false], [new Map(), false],
      [new DataView(new ArrayBuffer(8)), false], [new ArrayBuffer(8), false],
      [Buffer.from([1, 2]), true], [runInNewContext("[]"), true],
    ];
    for (const name of tags.slice(0, 11)) {
      cases.push([new globalThis[name](2), true]);
      cases.push([runInNewContext(`new ${name}(2)`), true]);
    }
    for (const tag of [...tags, "Object", "Array", "String", "DataView", "Float16Array", "int8Array", ""]) {
      cases.push([{ [Symbol.toStringTag]: tag }, tags.includes(tag)]);
    }
    for (const fn of [old, compiled.candidate, compiled.shipped]) {
      for (const [value, expected] of cases) assert.equal(fn(value), expected);
      let reads = 0;
      const changing = { get [Symbol.toStringTag]() { return ++reads === 1 ? "NodeList" : "Object"; } };
      assert.equal(fn(changing), true);
      assert.equal(reads, 1);
      assert.equal(fn(changing), false);
      assert.equal(reads, 2);
      const error = new Error("tag getter failed");
      assert.throws(() => fn({ get [Symbol.toStringTag]() { throw error; } }), e => e === error);
      const array = [];
      Object.defineProperty(array, Symbol.toStringTag, { get() { throw error; } });
      assert.equal(fn(array), true);
      for (const tag of [undefined, null, 7, Symbol("x"), {}]) {
        assert.equal(fn({ [Symbol.toStringTag]: tag }), false);
      }
      const { proxy, revoke } = Proxy.revocable({}, {});
      revoke();
      assert.throws(() => fn(proxy), e => e.name === "TypeError");
    }
    console.log(`arraylike: ${cases.length} classifications and observable tag contracts passed (old/source/shipped)`);
    if (process.argv.includes("--benchmark")) {
      const workloads = { miss: {}, lateTag: { [Symbol.toStringTag]: "TouchList" },
        typedArray: new Float64Array(2), array: [], string: "abc" };
      const iterations = 30000;
      function time(fn, value) {
        let count = 0;
        const start = performance.now();
        for (let i = 0; i < iterations; i++) count += fn(value);
        return { ms: performance.now() - start, count };
      }
      const report = { node: process.version, platform: process.platform, arch: process.arch,
        cpu: require("node:os").cpus()[0].model, iterations, warmup: 3, pairs: 9, workloads: {} };
      for (const [name, value] of Object.entries(workloads)) {
        for (let i = 0; i < 3; i++) { time(old, value); time(compiled.candidate, value); }
        const samples = [];
        for (let i = 0; i < 9; i++) {
          const pair = {};
          for (const key of i % 2 ? ["new", "old"] : ["old", "new"]) {
            pair[key] = time(key === "old" ? old : compiled.candidate, value);
          }
          assert.equal(pair.old.count, pair.new.count);
          samples.push(pair);
        }
        report.workloads[name] = samples;
      }
      console.log(JSON.stringify(report));
    }
  } finally { frontend.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
