"use strict";

const { mkdtempSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { performance } = require("node:perf_hooks");

const { createSage } = require("../../dist/tools/kernel.js");

async function measured(session, stage, source, timeout = 300_000) {
  const started = performance.now();
  const result = await session.evaluate(source, { timeout });
  return {
    stage,
    milliseconds: Number((performance.now() - started).toFixed(3)),
    result: result.repr,
  };
}

async function main() {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-cpu-twists-bench-"));
  const session = await createSage();
  try {
    const rows = [];
    rows.push(
      await measured(
        session,
        "construct",
        [
          "R = PolynomialRing(QQ, 'x')",
          "x = R.gen()",
          "C = HyperellipticCurve(x, x^3-x+1)",
          `cache = ${JSON.stringify(join(directory, "cache"))}`,
          "C.global_reduction()",
        ].join("\n"),
      ),
    );
    rows.push(
      await measured(
        session,
        "sequential_warm_exact_prefix",
        "S = C.quadratic_twists(-13,13,prec=16,max_order=0,algorithm='native',workers=1,cache_dir=cache); len(list(S))",
      ),
    );
    rows.push(
      await measured(
        session,
        "forced_multicore_4_cold_workers",
        "P = C.quadratic_twists(-13,13,prec=16,max_order=0,algorithm='native',workers=4,tile_size=8,cache_dir=cache); len(list(P))",
      ),
    );
    rows.push(
      await measured(
        session,
        "forced_multicore_4_second_scan",
        "Q = C.quadratic_twists(-13,13,prec=16,max_order=0,algorithm='native',workers=4,tile_size=8,cache_dir=cache); len(list(Q))",
      ),
    );
    rows.push(
      await measured(
        session,
        "forced_multicore_4_warm_values",
        "W = C.quadratic_twists(-13,13,prec=16,max_order=0,algorithm='native',workers=4,tile_size=8,cache_dir=cache); len(list(W))",
      ),
    );
    rows.push(
      await measured(
        session,
        "forced_multicore_4_warm_checkpoint_export",
        `W.export_jsonl(${JSON.stringify(join(directory, "twists.jsonl"))})`,
      ),
    );
    console.log(
      JSON.stringify(
        {
          schema: "sagejs.hyperelliptic-cpu-family-benchmark/v1",
          node: process.version,
          platform: process.platform,
          architecture: process.arch,
          curve: "y^2 + (x^3-x+1)y = x",
          interval: [-13, 13],
          precisionBits: 16,
          derivativeOrder: 0,
          rows,
        },
        null,
        2,
      ),
    );
  } finally {
    await session.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
