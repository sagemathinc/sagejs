// sagejs-test-tier: unit
// sagejs-test-platform: true
"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");
const { createSage } = require("../dist/tools/kernel.js");

for (const mode of ["python", "sage"]) {
  test(`function defaults are live Python slots (${mode})`, async (context) => {
    const session = await createSage({ mode });
    context.after(() => session.close());
    const result = await session.evaluate(readFileSync(
      join(__dirname, "fixtures/function-live-defaults.py"), "utf8",
    ));
    assert.equal(result.stderr ?? "", "");
    assert.equal(result.stdout.trim(), "live-function-defaults-ok");
  });

  test(`help preserves concise signatures after lazy inspect delegation (${mode})`, async (context) => {
    const session = await createSage({ mode });
    context.after(() => session.close());
    const result = await session.evaluate([
      "class Example:",
      "    def __init__(self, label: str='example'):",
      "        self.label = label",
      "    def value(self, n: int=2) -> int:",
      "        return n",
      "example = Example()",
      "help(example.value)",
      "help(Example)",
      "def live(a=1, *, x=2): pass",
      "help(live)",
      "live.__defaults__ = (3,)",
      "live.__kwdefaults__['x'] = 4",
      "help(live)",
    ].join("\n"));
    assert.equal(result.stderr ?? "", "");
    assert.match(result.stdout, /value\(n: int=2\) -> int/);
    assert.match(result.stdout, /class Example\(label: str='example'\)/);
    assert.match(result.stdout, /live\(a=1, \*, x=2\)/);
    assert.match(result.stdout, /live\(a=3, \*, x=4\)/);
  });
}
