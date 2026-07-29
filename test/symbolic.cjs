"use strict";

const assert = require("node:assert/strict");

const { createSage } = require("../dist/tools/kernel.js");

async function main() {
  const session = await createSage();
  try {
    assert.equal((await session.evaluate("x")).repr, "x");
    assert.equal((await session.evaluate("parent(x)")).repr, "Symbolic Ring");
    assert.equal(
      (await session.evaluate("type(x)")).repr,
      "<class 'sage.symbolic.expression.Expression'>",
    );
    assert.equal((await session.evaluate("f = sin(x^2)\nf")).repr, "sin(x^2)");
    assert.equal((await session.evaluate("f.subs(x=2)")).repr, "sin(4)");
    assert.equal(
      (await session.evaluate("f.derivative(x)")).repr,
      "2*x*cos(x^2)",
    );
    assert.equal(
      (await session.evaluate("fast_callable(f, vars=[x])(2)")).repr,
      "-0.7568024953079282",
    );
    assert.equal(
      (await session.evaluate("fast_callable(e^(x/2), vars=[x])(2)")).repr,
      String(Math.E),
    );
    assert.equal(
      (await session.evaluate("(x^2).integrate(x, 0, 1)")).repr,
      "1/3",
    );
    assert.ok(
      Math.abs(
        Number((await session.evaluate("(x^2 - 2).find_root(1, 2)")).repr) -
          Math.SQRT2,
      ) < 1e-10,
    );
    assert.equal((await session.evaluate("x + 1")).repr, "x + 1");
    assert.equal((await session.evaluate("QQ(1, 2)*x")).repr, "1/2*x");
    assert.equal((await session.evaluate("var('x y')")).repr, "(x, y)");
    assert.equal((await session.evaluate("pi")).repr, "pi");
    assert.equal((await session.evaluate("e")).repr, "e");
    assert.equal((await session.evaluate("log(8, 2)")).repr, "3");
    assert.equal((await session.evaluate("floor(log(17, 2))")).repr, "4");
    assert.equal(
      (await session.evaluate("float(pi)")).repr,
      "3.141592653589793",
    );

    const plotted = await session.evaluate(
      [
        "plot(sin(x^2), (x, 0, 2*pi),",
        "     plot_points=3, adaptive_recursion=0, randomize=False)",
      ].join("\n"),
    );
    assert.equal(plotted.display?.mime, "application/vnd.plotly.v1+json");
    assert.deepEqual(plotted.display?.data.data[0].x, [
      0,
      Math.PI,
      2 * Math.PI,
    ]);
    assert.deepEqual(plotted.display?.data.data[0].y, [
      0,
      Math.sin(Math.PI ** 2),
      Math.sin((2 * Math.PI) ** 2),
    ]);
  } finally {
    await session.close();
  }

  const pythonSession = await createSage({ mode: "python" });
  try {
    await assert.rejects(
      pythonSession.evaluate("x"),
      /x is not defined/,
    );
  } finally {
    await pythonSession.close();
  }

  console.log("Cortex-backed symbolic expression tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
