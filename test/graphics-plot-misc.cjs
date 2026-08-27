// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

async function repr(session, source) {
  return (await session.evaluate(source)).repr;
}

test("Sage-compatible plot misc utilities", async () => {
  const session = await createSage();
  try {
    assert.equal(
      await repr(
        session,
        [
          "from sage.plot.misc import (FastCallablePlotWrapper,",
          "    get_matplotlib_linestyle, setup_for_eval_on_grid,",
          "    unify_arguments)",
          "FastCallablePlotWrapper",
        ].join("\n"),
      ),
      "<class 'sage.plot.misc.FastCallablePlotWrapper'>",
    );

    assert.equal(
      await repr(
        session,
        "[get_matplotlib_linestyle(s, 'short') for s in ['solid', 'dashed', 'dotted', 'dashdot', 'None']]",
      ),
      "['-', '--', ':', '-.', '']",
    );
    assert.equal(
      await repr(
        session,
        "[get_matplotlib_linestyle(s, 'long') for s in ['-', '--', ':', '-.', '']]",
      ),
      "['solid', 'dashed', 'dotted', 'dashdot', 'None']",
    );
    assert.equal(
      await repr(
        session,
        "[get_matplotlib_linestyle('defaultdashed', 'long'), get_matplotlib_linestyle('steps-predotted', 'long')]",
      ),
      "['--', 'steps-pre:']",
    );
    await assert.rejects(
      session.evaluate("get_matplotlib_linestyle('isthissage', 'long')"),
      /WARNING: Unrecognized linestyle 'isthissage'/,
    );

    await session.evaluate(
      [
        "x,y,z=var('x y z')",
        "f(x,y)=x+y-z",
        "g(x,y)=x+y",
        "h(y)=-y",
      ].join("\n"),
    );
    assert.equal(
      await repr(
        session,
        "a,b=unify_arguments((f,g,h)); ([str(v) for v in a],[str(v) for v in b])",
      ),
      "(['x', 'y', 'z'], ['z'])",
    );
    assert.equal(
      await repr(
        session,
        "a,b=unify_arguments(x+y); ([str(v) for v in a],[str(v) for v in b])",
      ),
      "(['x', 'y'], ['x', 'y'])",
    );

    await session.evaluate(
      "p,r,v=setup_for_eval_on_grid(x+y,[(x,-1,1),(y,-1,1)],plot_points=[4,9],return_vars=True)",
    );
    assert.equal(await repr(session, "p(float(0.25),float(0.25))"), "0.5");
    assert.equal(
      await repr(session, "r"),
      "[(-1.0, 1.0, 0.6666666666666666), (-1.0, 1.0, 0.25)]",
    );
    assert.equal(
      await repr(session, "[str(t) for t in v]"),
      "['x', 'y']",
    );

    await session.evaluate(
      "m,mr=setup_for_eval_on_grid([lambda q:q^2,cos],[(-1,1)],plot_points=9)",
    );
    assert.equal(
      await repr(
        session,
        "[m[0](float(0.25)),m[1](float(0.25)),mr]",
      ),
      "[0.0625, 0.9689124217106447, [(-1.0, 1.0, 0.25)]]",
    );
    assert.equal(
      await repr(
        session,
        "setup_for_eval_on_grid(5,[(0,2)],plot_points=3)[0](float(0.25))",
      ),
      "5.0",
    );

    const invalidGridCases = [
      [
        "setup_for_eval_on_grid(x+y,[(x,-1,1),(y,-1,1)],plot_points=[4,9,10])",
        /plot_points must be either an integer or a list of integers/,
      ],
      [
        "setup_for_eval_on_grid(x+y,[(1,-1),(y,-1,1)])",
        /Some variable ranges specify variables while others do not/,
      ],
      [
        "setup_for_eval_on_grid(x+y,[(x,1,-1),(x,-1,1)])",
        /range variables should be distinct/,
      ],
      [
        "setup_for_eval_on_grid(x+y,[(x,1,1),(y,-1,1)])",
        /plot start point and end point must be different/,
      ],
    ];
    for (const [source, pattern] of invalidGridCases) {
      await assert.rejects(session.evaluate(source), pattern);
    }

    assert.equal(
      await repr(
        session,
        "w=FastCallablePlotWrapper(lambda q: complex(2,q),1e-8); [w(1e-9),w(1e-7)]",
      ),
      "[2.0, NaN]",
    );
    assert.equal(
      await repr(
        session,
        "def bad(q):\n    raise ValueError('bad')\nw=FastCallablePlotWrapper(bad,1e-8)\nw(1)",
      ),
      "NaN",
    );
  } finally {
    await session.close();
  }
});
