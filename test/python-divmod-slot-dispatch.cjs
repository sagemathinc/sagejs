// sagejs-test-tier: unit
// sagejs-test-platform: true
"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const { createContext, runInContext } = require("node:vm");
const Module = require("node:module");
const { pythonExecutable } = require("../tools/python-executable.cjs");

const root = join(__dirname, "..");
const seed = resolve(process.env.SAGEJS_DIVMOD_COMPILER_ROOT || root);
const source = readFileSync(join(root, "src/baselib/builtins.py"), "utf8");
const section = source.slice(source.indexOf("def _builtins_optional_attribute("),
  source.indexOf("\n\ndef ρσ_factor("));
assert.ok(section.startsWith("def _builtins_optional_attribute("));
const dependencies = [...new Set([...section.matchAll(/(_builtins_\w+|ρσ_\w+)/g)].map(m => m[1]))]
  .filter(name => !["_builtins_optional_attribute", "ρσ_divmod"].includes(name));
const candidate = "from __future__ import annotations\nimport sagejs.class_namespace\n" +
  "import sagejs.runtime as runtime\n" +
  "_source_builtins = runtime.reflect.get(runtime.reflect.get(runtime.global_object, '__sagejs_baselib_modules__'), 'sagejs._baselib.builtins')\n" +
  dependencies.map(name => `${name} = runtime.reflect.get(_source_builtins, '${name}')`).join("\n") +
  "\n" + section.replace("def ρσ_divmod(", "def _candidate_divmod(") + "\ndivmod = _candidate_divmod\n";

async function main() {
  if (process.argv.includes("--hotpaths")) {
    // Execute the unchanged existing tests with this exact source function
    // installed into each isolated session. No seed artifacts are modified.
    const kernel = require(join(seed, "dist/tools/kernel.js"));
    const filename = join(root, "test/python-runtime-hotpaths.cjs");
    const suite = new Module(filename, module);
    suite.filename = filename;
    suite.paths = module.paths;
    suite.require = name => name === "../dist/tools/kernel.js" ? {
      ...kernel, async createSage(options) {
        const session = await kernel.createSage(options);
        const result = await session.evaluate(candidate);
        assert.equal(result.stderr || "", "");
        return session;
      },
    } : require(name);
    suite._compile(readFileSync(filename, "utf8"), filename);
    return;
  }
  const fixture = readFileSync(join(root, "test/fixtures/python-divmod-slot-dispatch.py"), "utf8");
  const reference = spawnSync(pythonExecutable(), ["-c",
    "import sys\nassert sys.version_info[:2] == (3, 14)\n" + fixture +
    "\nprint('\\n'.join(observations))\n"], { encoding: "utf8" });
  assert.equal(reference.status, 0, reference.stderr || String(reference.error));
  const expected = reference.stdout.trim().split(/\r?\n/);
  const compiler = require(join(seed, "dist/tools/compiler.js")).default();
  const gaps = new Set(["metaclass", "floor-only"]);
  for (const mode of ["python", "sage"]) {
    const frontend = await require(join(seed, "dist/tools/python/compiler-frontend.js"))
      .createPythonCompilerFrontend(compiler, mode);
    try {
      const ast = frontend.parse(candidate + fixture, {
        filename: "<divmod-source-oracle>", libdir: join(seed, "src/lib"),
        strict_python_scopes: true, exact_integer_literals: true,
        scoped_flags: { dict_literals: true, overload_getitem: true,
          bound_methods: true, sequential_definitions: true },
      });
      const output = new compiler.OutputStream({
        baselib_plain: readFileSync(join(seed, "dist/compiler/baselib-plain-pretty.js"), "utf8"),
        write_name: false, private_scope: false, beautify: true,
        python_attributes: true, python_truthiness: true, python_tuples: true,
        exact_integers: true, rational_division: mode === "sage",
      });
      ast.print(output);
      const context = createContext({ require, process, Buffer, console, __sagejs_runtime_require__: require });
      runInContext(output.get(), context, { timeout: 30000 });
      const main = context.ρσ_modules.__main__;
      const actual = Array.from(main.observations);
      assert.equal(actual.length, expected.length);
      const unresolved = [];
      expected.forEach((line, index) => {
        const name = line.split(" ")[0];
        if (gaps.has(name)) {
          if (actual[index] !== line) unresolved.push({ name, expected: line, actual: actual[index] });
        } else assert.equal(actual[index], line, `${mode}: ${name}`);
      });
      console.log(`${mode}: ${expected.length - gaps.size} focused CPython cases passed.`);
      console.log(JSON.stringify({ mode, requiredUnresolvedGaps: unresolved }));
      if (process.env.SAGEJS_DIVMOD_REQUIRE_FULL_COMPAT === "1") assert.deepEqual(unresolved, []);
      const builtins = context.__sagejs_baselib_modules__["sagejs._baselib.builtins"];
      const numeric = [[7, 3], [-7, 3], [7, -3], [-7, -3], [0, 3],
        [1267650600228229401496703205376n, 7n], [-7.5, 2], [7.5, -2],
        [1, 0], [1.5, 0]];
      function result(fn, pair) {
        try { return ["value", builtins.ρσ_repr(fn(...pair))]; }
        catch (error) { return ["error", String(error)]; }
      }
      for (const pair of numeric) assert.deepEqual(result(main._candidate_divmod, pair),
        result(builtins.ρσ_divmod, pair), `${mode}: unchanged numeric fallback ${pair}`);
      console.log(`${mode}: ${numeric.length} numeric baseline-preservation controls passed.`);
      const docsSource = readFileSync(join(root, "src/lib/sagejs/_documentation_search.py"), "utf8");
      assert.ok(docsSource.includes("def _builtins_prototype_member("), "docs owns its inspection helper");
      assert.ok(!source.includes("def _builtins_prototype_member("), "core has no stale helper definition");
      assert.ok(!docsSource.includes("_core._builtins_prototype_member"), "no stale dynamic consumers");
      const docsAst = frontend.parse(docsSource + `
import sagejs.class_namespace
class DocumentationProbeBase:
    def visible(self):
        """A getter-free inherited documentation probe."""
        return 1
    @property
    def unsafe(self):
        raise ValueError('documentation evaluated a property')
class DocumentationProbeChild(DocumentationProbeBase):
    pass
`, { filename: "<documentation-owner-source-oracle>", libdir: join(seed, "src/lib"),
        scoped_flags: { dict_literals: true, overload_getitem: true,
          bound_methods: true, sequential_definitions: true } });
      const docsOutput = new compiler.OutputStream({
        baselib_plain: readFileSync(join(seed, "dist/compiler/baselib-plain-pretty.js"), "utf8"),
        write_name: false, private_scope: false, python_attributes: true,
        python_truthiness: true, python_tuples: true,
      });
      docsAst.print(docsOutput);
      const docsContext = createContext({ require, process, Buffer, console, __sagejs_runtime_require__: require });
      runInContext(docsOutput.get(), docsContext, { timeout: 30000 });
      const docs = docsContext.ρσ_modules.__main__;
      let getterCalls = 0;
      const parent = { inherited: 17, shadowed: 19 };
      const child = Object.create(parent);
      Object.defineProperty(child, "shadowed", { get() { getterCalls++; throw Error("getter invoked"); } });
      assert.equal(docs._builtins_prototype_member(child, "inherited"), 17);
      assert.equal(docs._builtins_prototype_member(child, "shadowed"), undefined);
      assert.equal(docs._builtins_prototype_member(child, "absent"), undefined);
      assert.equal(docs._builtins_prototype_member(null, "absent"), undefined);
      // JS undefined is the Python call ABI's missing-argument sentinel, not
      // a public value. Null above tests the supported empty prototype chain.
      assert.throws(() => docs._builtins_prototype_member(undefined, "absent"),
        /missing required argument: prototype/);
      const cls = docs.DocumentationProbeChild;
      // This helper deliberately reads data descriptors only. Compiled lazy
      // method getters are not executed by either the old or relocated helper.
      const visible = function () {};
      visible.__doc__ = "A getter-free inherited documentation probe.";
      Object.defineProperty(cls.prototype, "visible", {value: visible, configurable: true});
      Object.defineProperty(cls.prototype, "host_getter", { get() { getterCalls++; throw Error("host getter invoked"); } });
      const help = docs._builtins_class_help(cls, false);
      assert.match(help, /visible/);
      assert.match(help, /getter-free inherited documentation probe/);
      const printed = [];
      docsContext.__sagejs_baselib_modules__["sagejs._baselib.builtins"].ρσ_print = (...args) => printed.push(args.join(" "));
      docs._search_doc("DocumentationProbeChild");
      assert.match(printed.join("\n"), /DocumentationProbeChild.visible/);
      assert.equal(getterCalls, 0);
      console.log(`${mode}: relocated documentation source and getter-free lookup controls passed.`);
    } finally { frontend.close(); }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
