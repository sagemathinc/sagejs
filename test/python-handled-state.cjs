// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { createSage } = require("../dist/tools/kernel.js");

const fixture = readFileSync(join(__dirname, "fixtures/python-handled-state.py"), "utf8");
const cases = [...fixture.matchAll(/^def (test_\w+)\(\):/gm)].map(match => match[1]);
const python = process.env.SAGEJS_PYTHON ?? "python3";

for (const name of cases) {
  test(`handled state agrees with CPython: ${name}`, async () => {
    const source = `${fixture}\n${name}()\nprint("${name}: ok")\n`;
    const oracle = spawnSync(python, ["-c", source], { encoding: "utf8" });
    assert.equal(oracle.status, 0, oracle.stderr || String(oracle.error));
    for (const mode of ["python", "sage"]) {
      const session = await createSage({ mode });
      try {
        const result = await session.evaluate(source);
        assert.equal(result.stdout.trim(), oracle.stdout.trim(), mode);
      } finally {
        await session.close();
      }
    }
  });
}

test("reusable sessions keep independent suspended handlers across evaluations", async () => {
  const first = await createSage({ mode: "python" });
  const second = await createSage({ mode: "python" });
  try {
    for (const [session, label] of [[first, "first"], [second, "second"]]) {
      await session.evaluate(`
import sys
owned = ValueError('${label}')
def generator():
    try:
        raise owned
    except ValueError:
        yield 1
        assert sys.exception() is owned
        yield 2
g = generator()
assert next(g) == 1
assert sys.exception() is None
`);
    }
    for (const [session, label] of [[second, "second"], [first, "first"]]) {
      const result = await session.evaluate(`
assert str(owned) == '${label}'
assert next(g) == 2
assert sys.exception() is None
g.close()
assert sys.exception() is None
print('${label}: ok')
`);
      assert.equal(result.stdout.trim(), `${label}: ok`);
    }
  } finally {
    await first.close();
    await second.close();
  }
});

test("raw native next remains bindable through Python attribute lookup", async () => {
  for (const mode of ["python", "sage"]) {
    const session = await createSage({ mode });
    try {
      const result = await session.evaluate(`
import sys
def generator():
    try:
        raise ValueError('owned')
    except ValueError as error:
        yield 1
        assert sys.exception() is error
        yield 2
g = generator()
assert g.next().value == 1
assert sys.exception() is None
resume = g.next
assert resume().value == 2
assert sys.exception() is None
assert resume().done
assert sys.exception() is None
print('raw-next-ok')
`);
      assert.equal(result.stdout.trim(), "raw-next-ok");
    } finally { await session.close(); }
  }
});
