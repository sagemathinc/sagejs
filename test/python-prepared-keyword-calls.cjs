// sagejs-test-tier: integration
"use strict";
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { pythonExecutable } = require("../tools/python-executable.cjs");
const fixture = readFileSync(join(__dirname, "fixtures/prepared-keyword-calls.py"), "utf8");
const cases = [...fixture.matchAll(/^def (test_\w+)\(\):/gm)].map(match => match[1]);

for (const name of cases) {
  const source = `${fixture}\n${name}()\nprint("${name}: ok")\n`;
  test(`CPython prepared keyword oracle: ${name}`, () => {
    const result = spawnSync(pythonExecutable(), ["-c", source], { encoding: "utf8", timeout: 30000 });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, "");
    assert.equal(result.stdout.replace(/\r\n/g, "\n"), `${name}: ok\n`);
  });
  for (const mode of ["python", "sage"]) {
    test(`${mode} prepared keyword oracle: ${name}`, async t => {
      // Resolve only when executing a runtime case: CPython-only design checks
      // must not silently borrow another checkout's dist artifacts.
      const { createSage } = require("../dist/tools/kernel.js");
      const session = await createSage({ mode });
      t.after(() => session.close());
      const result = await session.evaluate(source);
      assert.equal(result.stdout.replace(/\r\n/g, "\n"), `${name}: ok\n`);
      assert.equal(result.stderr ?? "", "");
    });
  }
}
