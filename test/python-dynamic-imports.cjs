// sagejs-test-tier: unit
"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { runInNewContext } = require("node:vm");
const { createSage } = require("../dist/tools/kernel.js");

for (const path of ["sagejs/runtime.py", "sagejs_bootstrap.py", "compiler_bootstrap.py"]) {
  test(`dynamic registry primitive preserves canonical imports and laziness: ${path}`, () => {
    const source = readFileSync(join(__dirname, "../src/baselib", path), "utf8");
    const start = source.indexOf("def ρσ_dynamic_eval(");
    const body = source.slice(start).match(/return r"""%js ([\s\S]*?)"""/)[1];
    const module = { marker: {} };
    const registry = Object.create(null);
    registry.glob = module;
    let reads = 0;
    Object.defineProperty(registry, "unused", { get() { reads++; return {}; } });
    const privateRegistry = Object.create(registry);
    privateRegistry.__main__ = {};
    const context = {
      ρσ_modules: privateRegistry,
      globalThis: { ρσ_modules: registry },
      input_namespace: { prior: 7 },
      module_id: "test_dynamic",
      javascript: `if (!Object.prototype.hasOwnProperty.call(ρσ_modules, 'glob')) throw Error('missing');
        ρσ_modules.test_dynamic.answer = ρσ_modules.glob;`,
    };
    const result = runInNewContext(body, context);
    assert.equal(result.namespace.answer, module);
    assert.equal(result.namespace.prior, 7);
    assert.equal(reads, 0);
    assert.equal(registry.test_dynamic, undefined);
    assert.equal(context.input_namespace.answer, undefined);
  });
}

test("exec namespaces retain imported module identity without leaking local assignments", async (t) => {
  const sage = await createSage({ mode: "python" });
  t.after(() => sage.close());
  const result = await sage.evaluate([
    "import glob",
    "ns = {}",
    "exec('import glob\\nfrom glob import has_magic\\nanswer = has_magic(\"a*\")', ns)",
    "assert ns['glob'] is glob",
    "assert ns['answer'] is True",
    "assert 'answer' not in globals()",
    "assert 'has_magic' not in globals()",
    "True",
  ].join("\n"));
  assert.equal(result.repr, "True");
});
