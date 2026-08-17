"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

const oracle = JSON.parse(
  readFileSync(
    join(
      __dirname,
      "..",
      "docs",
      "sage-compatibility",
      "plotting",
      "oracle",
      "plot-curves.json",
    ),
    "utf8",
  ),
);

function oracleCase(id) {
  const value = oracle.cases.find((item) => item.id === id);
  assert.ok(value, `missing Sage oracle case ${id}`);
  return value;
}

async function main() {
  const session = await createSage();
  try {
    const constantOracle = oracleCase("constant").layers[0];
    const constant = await session.evaluate(
      "plot(3, (x,0,1), plot_points=3, adaptive_recursion=0, randomize=False)",
    );
    assert.equal(constant.display?.data.data.length, 1);
    assert.deepEqual(constant.display?.data.data[0].x, constantOracle.x);
    assert.deepEqual(constant.display?.data.data[0].y, constantOracle.y);

    const invalid = await session.evaluate(
      "bad=plot(1/x,(x,-1,1),plot_points=3,adaptive_recursion=0,randomize=False); bad",
    );
    assert.equal(invalid.display?.data.data.length, 0);
    assert.equal(
      (
        await session.evaluate(
          "[d['code'] for d in bad.spec().to_dict()['diagnostics']]",
        )
      ).repr,
      "['PLOT_DATA_PARTIAL_NONFINITE', 'PLOT_DATA_ALL_NONFINITE']",
    );

    const excludedOracle = oracleCase("explicit-exclusion").layers;
    const excluded = await session.evaluate(
      "plot(1/x,(x,-1,1),plot_points=5,adaptive_recursion=0," +
        "randomize=False,exclude=[0])",
    );
    assert.equal(excluded.display?.data.data.length, 2);
    for (let index = 0; index < excludedOracle.length; index += 1) {
      assert.deepEqual(excluded.display?.data.data[index].x, excludedOracle[index].x);
      assert.deepEqual(excluded.display?.data.data[index].y, excludedOracle[index].y);
    }

    const poleOracle = oracleCase("detected-poles").layer_summaries;
    const detectedPoles = await session.evaluate(
      "plot(tan(x),(x,-2,2),plot_points=10,adaptive_recursion=5," +
        "randomize=False,detect_poles=True)",
    );
    assert.equal(detectedPoles.display?.data.data.length, poleOracle.length);
    for (let index = 0; index < poleOracle.length; index += 1) {
      const trace = detectedPoles.display?.data.data[index];
      assert.equal(trace.x.length, poleOracle[index].count);
      assert.equal(trace.x[0], poleOracle[index].xmin);
      assert.equal(trace.x.at(-1), poleOracle[index].xmax);
    }

    const endpointOracle = oracleCase("undefined-left-endpoint").layers[0];
    const endpoint = await session.evaluate(
      "plot(log(x),(x,0,1),plot_points=3,adaptive_recursion=0,randomize=False)",
    );
    assert.deepEqual(endpoint.display?.data.data[0].x, endpointOracle.x);
    assert.deepEqual(endpoint.display?.data.data[0].y, endpointOracle.y);

    const fillAxisOracle = oracleCase("fill-to-axis").layers;
    const fillAxis = await session.evaluate(
      "plot(x^2,(x,-1,1),plot_points=3,adaptive_recursion=0," +
        "randomize=False,fill=True,fillcolor='red',fillalpha=.2)",
    );
    assert.equal(fillAxis.display?.data.data[0].fill, "toself");
    assert.deepEqual(fillAxis.display?.data.data[0].x, fillAxisOracle[0].x);
    assert.deepEqual(fillAxis.display?.data.data[0].y, fillAxisOracle[0].y);
    assert.equal(fillAxis.display?.data.data[0].fillcolor, "red");
    assert.equal(fillAxis.display?.data.data[0].opacity, 0.2);
    assert.deepEqual(fillAxis.display?.data.data[1].x, fillAxisOracle[1].x);
    assert.deepEqual(fillAxis.display?.data.data[1].y, fillAxisOracle[1].y);

    const fillBetweenOracle = oracleCase("fill-between-curves").layers;
    const fillBetween = await session.evaluate(
      "plot(x^2,(x,0,1),plot_points=3,adaptive_recursion=0," +
        "randomize=False,fill=x,fillcolor='green',fillalpha=.25)",
    );
    assert.deepEqual(fillBetween.display?.data.data[0].x, fillBetweenOracle[0].x);
    assert.deepEqual(fillBetween.display?.data.data[0].y, fillBetweenOracle[0].y);
    assert.equal(fillBetween.display?.data.data[0].fillcolor, "green");
    assert.equal(fillBetween.display?.data.data[0].opacity, 0.25);

    const symbolic = await session.evaluate(
      "plot(x^2,(x,0,1),plot_points=3,adaptive_recursion=0,randomize=False)",
    );
    const callable = await session.evaluate(
      "plot(lambda t:t^2,(0,1),plot_points=3,adaptive_recursion=0,randomize=False)",
    );
    assert.deepEqual(callable.display?.data.data[0].x, symbolic.display?.data.data[0].x);
    assert.deepEqual(callable.display?.data.data[0].y, symbolic.display?.data.data[0].y);

    const smallImaginary = await session.evaluate(
      "plot(x+1e-9*I,(x,0,1),plot_points=3,adaptive_recursion=0," +
        "randomize=False,imaginary_tolerance=1e-8)",
    );
    assert.deepEqual(
      smallImaginary.display?.data.data[0].y,
      oracleCase("symbolic-small-imaginary-part").layers[0].y,
    );
    const largeImaginary = await session.evaluate(
      "large_imag=plot(x+1e-7*I,(x,0,1),plot_points=3," +
        "adaptive_recursion=0,randomize=False,imaginary_tolerance=1e-8); large_imag",
    );
    assert.equal(largeImaginary.display?.data.data.length, 0);

    assert.equal(
      (
        await session.evaluate(
          "generate_plot_points(lambda t:t^2,(0,1),plot_points=2," +
            "adaptive_recursion=0,randomize=False,initial_points=[.25,.75])",
        )
      ).repr,
      "[(0.0, 0.0), (0.25, 0.0625), (0.75, 0.5625), (1.0, 1.0)]",
    );
    assert.equal(
      (
        await session.evaluate(
          "generate_plot_points(lambda t:t^2,(0,1),plot_points=2," +
            "adaptive_recursion=0,randomize=False,initial_points=[-1,.5,2])",
        )
      ).repr,
      "[(-1.0, 1.0), (0.0, 0.0), (0.5, 0.25), (1.0, 1.0), (2.0, 4.0)]",
    );

    const empty = await session.evaluate(
      "empty_curves=plot([],(x,0,1),plot_points=3," +
        "adaptive_recursion=0,randomize=False); empty_curves",
    );
    assert.equal(empty.display?.data.data.length, 0);

    const layered = await session.evaluate(
      "layered=line([(0,0),(1,1)],zorder=9,legend_label='high')+" +
        "line([(0,1),(1,0)],zorder=2,legend_label='low'); layered",
    );
    assert.deepEqual(
      layered.display?.data.data.map((trace) => trace.name),
      ["high", "low"],
    );
    assert.deepEqual(
      layered.display?.data.data.map((trace) => trace.zorder),
      [9, 2],
    );
    assert.equal("legendrank" in layered.display?.data.data[0], false);

    assert.equal(
      (
        await session.evaluate(
          "curve_spec=plot(x^2,(x,0,1),plot_points=3," +
            "adaptive_recursion=0,randomize=False); " +
            "curve_spec.spec().to_dict()['provenance']['sampling']['plot_points']",
        )
      ).repr,
      "3",
    );
    assert.equal(
      (
        await session.evaluate(
          "curve_spec.spec().to_dict()['layers'][0]['source_intent']['constructor']",
        )
      ).repr,
      "'plot'",
    );

    await assert.rejects(
      session.evaluate("plot(x,(x,0,1),definitely_not_a_plot_option=1)"),
      /option 'definitely_not_a_plot_option' not valid/,
    );
    await assert.rejects(
      session.evaluate("plot(x,(x,0,1),marker='o')"),
      /option 'marker'.*not yet supported/,
    );
    await assert.rejects(
      session.evaluate("plot(x,(x,0,1),plot_points=101,sample_limit=100)"),
      /sampling safety limit/,
    );
  } finally {
    await session.close();
  }
}

test(
  "Sage curve sampling, segmentation, diagnostics, and lowering",
  { timeout: 60_000 },
  main,
);
