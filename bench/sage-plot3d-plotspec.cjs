"use strict";

const { performance } = require("node:perf_hooks");

const { createSage } = require("../dist/tools/kernel.js");

async function timed(session, source) {
  const started = performance.now();
  const result = await session.evaluate(source);
  return { milliseconds: performance.now() - started, repr: result.repr };
}

async function main() {
  const session = await createSage();
  try {
    const construction = await timed(
      session,
      "large_surface = plot3d(lambda x,y: sin(x)*cos(y), " +
        "(0,6.28),(0,6.28),plot_points=(300,300))",
    );
    const display = await timed(
      session,
      "len(large_surface.plotly()['data'][0]['z'])",
    );
    const semantic = await timed(session, "large_spec = large_surface.spec()");
    const inspection = await session.evaluate(
      "(large_spec.layers[0].metadata['resource']['sample_count'],large_spec.bounds())",
    );
    const semanticCeilingMs = 8000;
    if (semantic.milliseconds > semanticCeilingMs) {
      throw new Error(
        `PlotSpec materialization took ${semantic.milliseconds.toFixed(1)}ms; ` +
          `ceiling is ${semanticCeilingMs}ms`,
      );
    }
    const report = {
      workload: "300x300 finite rectangular surface (90,000 samples)",
      construction_ms: construction.milliseconds,
      unchanged_plotly_ms: display.milliseconds,
      plotspec_ms: semantic.milliseconds,
      plotspec_ceiling_ms: semanticCeilingMs,
      plotly_rows: display.repr,
      plotspec_result: inspection.repr,
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
    };
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await session.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
