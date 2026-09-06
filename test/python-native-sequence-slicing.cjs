// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

test("the compiler lowers a full slice without allocating a slice object", () => {
  const compiled = spawnSync(
    process.execPath,
    ["bin/sagejs", "compile", "--python", "--omit-baselib", "--bare"],
    {
      cwd: require("node:path").join(__dirname, ".."),
      input: "answer = values[:]\n",
      encoding: "utf8",
    },
  );
  assert.equal(compiled.status, 0, compiled.stderr);
  assert.match(compiled.stdout, /ρσ_getslice_all\(/);
});

test("full-slice recognition does not capture a user class named slice", async (t) => {
  const session = await createSage({ mode: "python" });
  t.after(() => session.close());
  const result = await session.evaluate([
    "class slice:",
    "    def __new__(cls, start, stop, step):",
    "        return 1",
    "values = [10, 20]",
    "print(values[slice(None, None, None)])",
    "print(values[:])",
    "def slice(start, stop, step):",
    "    return 0",
    "print(values[slice(None, None, None)])",
    "print(values[:])",
  ].join("\n"));
  assert.equal(result.stdout.trim(), "20\n[10, 20]\n10\n[10, 20]");
});

test("native list and tuple slicing preserves Python values and result types", async (t) => {
  const session = await createSage({ mode: "python" });
  t.after(() => session.close());
  const result = await session.evaluate([
    "values = [0, 1, 2, 3, 4]",
    "frozen = (0, 1, 2, 3, 4)",
    "print(values[:], values[1:4], values[::-1], values[4:0:-2])",
    "print(frozen[:], frozen[1:4], frozen[::-1], frozen[4:0:-2])",
    "print(type(values[:]) is list, type(frozen[:]) is tuple)",
  ].join("\n"));
  assert.equal(result.stdout.trim(), [
    "[0, 1, 2, 3, 4] [1, 2, 3] [4, 3, 2, 1, 0] [4, 2]",
    "(0, 1, 2, 3, 4) (1, 2, 3) (4, 3, 2, 1, 0) (4, 2)",
    "True True",
  ].join("\n"));
});

test("native sequence slices accept exact BigInt-backed bounds", async (t) => {
  const session = await createSage({ mode: "python" });
  t.after(() => session.close());
  const result = await session.evaluate([
    "values = [0, 1, 2, 3, 4]",
    "start = (1 << 70) % 3",
    "stop = (1 << 70) % 5",
    "print(values[start:stop], tuple(values)[start:stop])",
    "print(values[-(1 << 70):(1 << 70)])",
    "print(values[::(1 << 70)], values[::-(1 << 70)])",
  ].join("\n"));
  assert.equal(
    result.stdout.trim(),
    "[1, 2, 3] (1, 2, 3)\n[0, 1, 2, 3, 4]\n[0] [4]",
  );
});

test("native slice fast path defers to concrete list subclass overrides", async (t) => {
  const session = await createSage({ mode: "python" });
  t.after(() => session.close());
  const result = await session.evaluate([
    "class Observed(list):",
    "    def __getitem__(self, key):",
    "        return ('override', key.start, key.stop, key.step)",
    "value = Observed([1, 2, 3])",
    "print(value[:], value[1::2])",
    "class Inherited(Observed):",
    "    pass",
    "print(Inherited([1, 2, 3])[:])",
    "class Plain(list):",
    "    pass",
    "plain = Plain([1, 2, 3])",
    "print(plain[:], type(plain[:]) is list)",
  ].join("\n"));
  assert.equal(result.stdout.trim(), [
    "('override', None, None, None) ('override', 1, None, 2)",
    "('override', None, None, None)",
    "[1, 2, 3] True",
  ].join("\n"));
});

test("slicing honors noncallable and dynamically replaced subclass methods", async (t) => {
  const session = await createSage({ mode: "python" });
  t.after(() => session.close());
  const result = await session.evaluate([
    "class Observed(list):",
    "    def __getitem__(self, key): return 'original'",
    "value = Observed([1, 2, 3])",
    "print(value[:])",
    "for disabled in (None, 42):",
    "    Observed.__getitem__ = disabled",
    "    try: print(value[:])",
    "    except TypeError: print('rejected')",
    "    try: print(value[1:])",
    "    except TypeError: print('rejected')",
    "Observed.__getitem__ = lambda self, key: 'replacement'",
    "print(value[:], value[1:])",
  ].join("\n"));
  assert.equal(result.stdout.trim(), [
    "original", "rejected", "rejected", "rejected", "rejected",
    "replacement replacement",
  ].join("\n"));
});
