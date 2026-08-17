#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { createSage } = require("../dist/tools/kernel.js");

const check = process.argv.includes("--check");
const nativeDisabled = process.argv.includes("--native-disabled");

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

function parseMeasurement(repr) {
  const match = /^\(([^)]+)\)$/.exec(repr);
  assert.ok(match, `unexpected curve benchmark result: ${repr}`);
  const values = match[1].split(",").map((value) => Number(value.trim()));
  assert.equal(values.length, 7, `unexpected curve benchmark arity: ${repr}`);
  assert.ok(values.every(Number.isFinite), `non-finite curve benchmark: ${repr}`);
  return {
    setupMs: values[0],
    samplingMs: values[1],
    specMs: values[2],
    loweringMs: values[3],
    sampledPoints: values[4],
    layers: values[5],
    loweredPoints: values[6],
  };
}

async function run() {
  const previousDisable = process.env.SAGEJS_NATIVE_DISABLE;
  if (nativeDisabled) process.env.SAGEJS_NATIVE_DISABLE = "1";
  else delete process.env.SAGEJS_NATIVE_DISABLE;
  const session = await createSage();
  try {
    await session.evaluate(String.raw`
import sagejs.runtime as _curve_bench_runtime

def _curve_bench_measure(point_count):
    started = _curve_bench_runtime.wall_time()
    prepared, ranges, variables = setup_for_eval_on_grid(
        sin, [(x, 0, 1)], plot_points=point_count, return_vars=True
    )
    setup_ms = (_curve_bench_runtime.wall_time() - started) * 1000

    started = _curve_bench_runtime.wall_time()
    sampled = generate_plot_points(
        prepared,
        (0, 1),
        plot_points=point_count,
        adaptive_recursion=0,
        randomize=False,
    )
    sampling_ms = (_curve_bench_runtime.wall_time() - started) * 1000

    graph = plot(
        sin(x),
        (x, 0, 1),
        plot_points=point_count,
        adaptive_recursion=0,
        randomize=False,
    )
    started = _curve_bench_runtime.wall_time()
    specification = graph.spec().to_dict()
    spec_ms = (_curve_bench_runtime.wall_time() - started) * 1000

    started = _curve_bench_runtime.wall_time()
    figure = graph.plotly()
    lowering_ms = (_curve_bench_runtime.wall_time() - started) * 1000
    return (
        setup_ms,
        sampling_ms,
        spec_ms,
        lowering_ms,
        len(sampled),
        len(specification['layers']),
        len(figure.data[0].x),
    )
`);

    // Warm compiler/module paths without including them in the measurements.
    await session.evaluate("_curve_bench_measure(100)");
    const cases = [
      { points: 10_000, repeats: 5 },
      { points: 100_000, repeats: 3 },
    ];
    const results = [];
    for (const benchmarkCase of cases) {
      const samples = [];
      for (let index = 0; index < benchmarkCase.repeats; index += 1) {
        samples.push(
          parseMeasurement(
            (await session.evaluate(
              `_curve_bench_measure(${benchmarkCase.points})`,
            )).repr,
          ),
        );
      }
      for (const sample of samples) {
        assert.equal(sample.sampledPoints, benchmarkCase.points);
        assert.equal(sample.layers, 1);
        assert.equal(sample.loweredPoints, benchmarkCase.points);
      }
      results.push({
        points: benchmarkCase.points,
        repeats: benchmarkCase.repeats,
        medianMs: {
          setup: median(samples.map((sample) => sample.setupMs)),
          sampling: median(samples.map((sample) => sample.samplingMs)),
          spec: median(samples.map((sample) => sample.specMs)),
          lowering: median(samples.map((sample) => sample.loweringMs)),
        },
        samples,
      });
    }

    await assert.rejects(
      session.evaluate(
        "plot(x,(x,0,1),plot_points=1000001,randomize=False)",
      ),
      /sampling safety limit/,
    );

    if (check) {
      const budgets = {
        10000: { setup: 500, sampling: 1500, spec: 1500, lowering: 1500 },
        100000: { setup: 1000, sampling: 8000, spec: 8000, lowering: 8000 },
      };
      for (const result of results) {
        const budget = budgets[result.points];
        for (const phase of Object.keys(budget)) {
          assert.ok(
            result.medianMs[phase] <= budget[phase],
            `${result.points}-point ${phase} took ${result.medianMs[phase]}ms; ` +
              `budget ${budget[phase]}ms`,
          );
        }
      }
    }

    process.stdout.write(
      JSON.stringify(
        {
          schema: "sagejs.benchmark/graphics-curve-sampling-v1",
          mode: nativeDisabled ? "dynamic-native-disabled" : "compiled-native",
          phases: ["setup", "sampling", "spec", "lowering"],
          guard: { maximumEvaluations: 1_000_000, verified: true },
          results,
        },
        null,
        2,
      ) + "\n",
    );
  } finally {
    await session.close();
    if (previousDisable === undefined) delete process.env.SAGEJS_NATIVE_DISABLE;
    else process.env.SAGEJS_NATIVE_DISABLE = previousDisable;
  }
}

run().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
