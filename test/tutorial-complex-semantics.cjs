// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

test("reusable module cells fall through missing globals to builtins", async (t) => {
  const session = await createSage({ mode: "python" });
  t.after(() => session.close());

  assert.equal((await session.evaluate("len = len([1, 2, 3])\nlen")).repr, "3");

  await session.evaluate("del len");
  assert.equal((await session.evaluate("len([1, 2])")).repr, "2");

  await session.evaluate("len: int");
  assert.equal((await session.evaluate("len([1])")).repr, "1");

  await assert.rejects(
    session.evaluate("missing_name = missing_name"),
    /missing_name|NameError|referenced before assignment/,
  );
});

test("Sage symbolic i can be reset and rebound to the complex field", async (t) => {
  const session = await createSage();
  t.after(() => session.close());

  assert.equal((await session.evaluate("i")).repr, "I");
  assert.equal((await session.evaluate("i in QQ")).repr, "False");
  await session.evaluate("reset('i')");
  await session.evaluate("i = CC(i)");
  assert.equal((await session.evaluate("i == CC.0")).repr, "True");
  await session.evaluate("a, b = 4/3, 2/3");
  await session.evaluate("z = a + b*i");
  assert.equal(
    (await session.evaluate("z")).repr,
    "1.33333333333333 + 0.666666666666667*I",
  );
  assert.equal((await session.evaluate("z.imag()")).repr, "0.666666666666667");
  assert.equal((await session.evaluate("z.real() == a")).repr, "True");
});

test("guided-tour desolve form is symbolically equivalent", async (t) => {
  const session = await createSage();
  t.after(() => session.close());

  await session.evaluate("t = var('t')");
  await session.evaluate("x = function('x')(t)");
  await session.evaluate("DE = diff(x, t) + x - 1");
  assert.equal((await session.evaluate("desolve(DE, [x,t])")).repr, "_C/e^t + 1");
  assert.equal(
    (
      await session.evaluate(
        "var('_C'); ((_C/e^t + 1)*e^t - (_C + e^t)).simplify()",
      )
    ).repr,
    "0",
  );
});
