// sagejs-test-tier: unit
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

test("browser Sage cells reuse only stable code with distinct literal pools", () => {
  const source = readFileSync(new URL("../compiler-worker.mjs", import.meta.url), "utf8");
  const context = vm.createContext({ structuredClone });
  vm.runInContext(
    source.slice(source.indexOf("let numericLiteralPoolCounter"),
      source.indexOf("function serializeError")),
    context,
  );
  vm.runInContext(
    source.slice(source.indexOf("function optimizationReport"),
      source.indexOf("async function fetchText")),
    context,
  );
  vm.runInContext(
    source.slice(source.indexOf("function compilerContext"),
      source.indexOf("async function foreignModule")),
    context,
  );

  let parses = 0;
  const frontend = {
    parse(_source, options) {
      parses += 1;
      return {
        classes: options.classes ?? {},
        intrinsic_modules: {},
        scoped_flags: options.scoped_flags,
        exports: [],
        imports: {},
        optimization_ir: {
          schema: "sagejs.optimizing-mathematics/v1",
          passes: [], contracts: [], regions: [],
        },
        print() {},
      };
    },
  };
  context.compiler = {
    OutputStream: class {
      constructor(options) { this.options = options; }
      get() {
        return `let ${this.options.numeric_literal_pool_prefix}value = 1;`;
      }
    },
  };
  context.baselib = "";
  context.repeatedCell = undefined;
  context.runtimeModuleNames = [];
  context.configuredOptimizationLevel = undefined;
  context.toplevel = {
    classes: {}, intrinsic_modules: {},
    scoped_flags: {
      dict_literals: true, overload_getitem: true,
      bound_methods: true, sequential_definitions: true,
    },
  };

  const compile = (cell, language = "sage", allowRepeatCache = true) =>
    context.compileWithFrontend(cell, "<browser>", frontend,
      language, allowRepeatCache);
  const sourceCell = "x = x + 1\nx";
  const outputs = Array.from({ length: 5 }, () => compile(sourceCell));
  assert.equal(parses, 2);
  assert.equal(new Set(outputs.map(({ javascript }) => javascript)).size, 5);
  assert.deepEqual(outputs.map(({ javascript }) =>
    javascript.match(/ρσ_browser_\d+_/)[0]),
  ["ρσ_browser_0_", "ρσ_browser_1_", "ρσ_browser_2_",
    "ρσ_browser_3_", "ρσ_browser_4_"]);
  assert.notEqual(outputs[2].optimization, outputs[3].optimization);

  context.toplevel.classes.C = { changed: true };
  compile(sourceCell);
  assert.equal(parses, 3, "a changed compiler context must invalidate reuse");
  compile("y = x");
  compile(sourceCell);
  assert.equal(parses, 5, "another cell must invalidate reuse");
  compile("class C: pass");
  compile("class C: pass");
  compile("pass", "python");
  compile("pass", "python");
  compile(sourceCell, "sage", false);
  assert.equal(parses, 10,
    "definitions, Python mode, and noninteractive compilations stay uncached");
});
