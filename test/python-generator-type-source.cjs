// sagejs-test-tier: unit
"use strict";
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { Script } = require("node:vm");
const { test } = require("node:test");
const root = join(__dirname, "..");

test("both generator emitters publish the same canonical Python type", () => {
  for (const file of ["src/output/functions.py", "src/output/loops.py"]) {
    const source = readFileSync(join(root, file), "utf8");
    const lines = source.split("\n");
    const at = lines.findIndex(line => line.includes('if (typeof ρσ_generator_type === "function")'));
    assert.ok(at >= 0, file);
    const snippet = new Script(lines.slice(at, at + 2).join(" +\n")).runInNewContext();
    const result = (function* () { yield 1; })();
    // This host constructor cannot serve as isinstance's second argument.
    assert.equal(typeof result.constructor, "object");
    const canonical = function generatorType() {};
    new Script(snippet).runInNewContext({result, ρσ_generator_type: canonical});
    assert.equal(result.__python_type__, canonical);
    assert.equal(result.next().value, 1);
    // The immutable bootstrap may not have installed the type yet.
    new Script(snippet).runInNewContext({result: (function* () {})()});
  }
});

test("generator type uses existing explicit type identity without weakening validation", () => {
  const builtins = readFileSync(join(root, "src/baselib/builtins.py"), "utf8");
  const internal = readFileSync(join(root, "src/baselib/internal.py"), "utf8");
  assert.ok(builtins.includes("class ρσ_generator_type:"));
  assert.ok(builtins.includes("cannot create 'generator' instances"));
  assert.ok(builtins.includes('python_type = _builtins_get_member(value, "__python_type__")'));
  assert.ok(internal.includes('if candidate is _internal_get_member(value, "__python_type__"):'));
  assert.ok(internal.includes('if not _internal_type_is(runtime.jstype(candidate), "function"):'));
});

test("canonical generator class is included in the compiler-only baselib", () => {
  const selfSource = readFileSync(join(root, "tools/self.js"), "utf8");
  const moduleSelection = selfSource.match(/const COMPILER_BASELIB_MODULES = new Set\((\[[^]*?\])\);/);
  assert.ok(moduleSelection, "compiler-only module selection must remain explicit");
  const modules = new Script(moduleSelection[1]).runInNewContext();
  assert.ok(modules.includes("builtins.py"));
  // The canonical type lives in this selected module, not in optional types.py.
  const builtins = readFileSync(join(root, "src/baselib/builtins.py"), "utf8");
  assert.ok(builtins.includes("class ρσ_generator_type:"));
  assert.ok(readFileSync(join(root, "src/lib/types.py"), "utf8").includes(
    "GeneratorType = type((value for value in ()))",
  ));
});
