#!/usr/bin/env node
"use strict";

const { execFileSync, spawnSync } = require("node:child_process");
const os = require("node:os");
const { resolve } = require("node:path");

const { createSage } = require("../../dist/tools/kernel.js");

const root = resolve(__dirname, "../..");
const oracle = "0.55175981952139493925311708933354526634108654109670";
const targetIndex = process.argv.indexOf("--targets");
const targets = (targetIndex < 0 ? "64" : process.argv[targetIndex + 1])
  .split(",")
  .map(Number);
const repeatIndex = process.argv.indexOf("--repeat");
const repetitions = repeatIndex < 0 ? 5 : Number(process.argv[repeatIndex + 1]);
const runMagma = process.argv.includes("--magma");
const magma = process.env.MAGMA ?? "/home/user/bin/magma";

if (targets.some((value) => !Number.isInteger(value) || value < 8)) {
  throw new Error("--targets must be a comma-separated list of positive bit counts");
}
if (!Number.isInteger(repetitions) || repetitions < 1) {
  throw new Error("--repeat must be positive");
}

function gitCommit() {
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
}

function unquote(text) {
  if (text.length >= 2 && text[0] === "'" && text.at(-1) === "'") {
    return text.slice(1, -1);
  }
  throw new Error(`expected a Python string result, got ${text}`);
}

async function sageRows() {
  const session = await createSage();
  try {
    await session.evaluate(
      [
        "import time",
        "from sagejs.hyperelliptic_curves.genus2_heights import HeightContext, canonical_height, height_pairing, regulator",
        "height_bench_R = PolynomialRing(QQ, 'x')",
        "height_bench_x = height_bench_R.gen()",
        "height_bench_C = HyperellipticCurve(height_bench_x**5-height_bench_x+1)",
        "height_bench_J = height_bench_C.jacobian()",
        "height_bench_P = height_bench_J([height_bench_x,1])",
        "height_bench_Q = height_bench_J([height_bench_x-1,1])",
      ].join("\n"),
    );
    const rows = [];
    for (const target of targets) {
      const result = await session.evaluate(
        [
          `height_bench_context = HeightContext(height_bench_J)`,
          `height_bench_started = time.perf_counter()`,
          `height_bench_height = canonical_height(height_bench_P, precision=${target}, target_bits=${target}, algorithm='local', context=height_bench_context)`,
          `height_bench_cold = 1000*(time.perf_counter()-height_bench_started)`,
          `assert height_bench_height.rigorous`,
          `assert height_bench_height.diagnostics['achieved_enclosure_width_bits'] >= ${target}`,
          `assert height_bench_height.ball.contains('${oracle}')`,
          `height_bench_started = time.perf_counter()`,
          `for height_bench_index in range(${repetitions}):`,
          `    height_bench_warm = canonical_height(height_bench_P, precision=${target}, target_bits=${target}, algorithm='local', context=height_bench_context)`,
          `height_bench_warm_ms = 1000*(time.perf_counter()-height_bench_started)/${repetitions}`,
          `str(${target})+'|'+str(height_bench_height.steps)+'|'+str(height_bench_height.diagnostics['working_precision_bits'])+'|'+str(height_bench_height.diagnostics['achieved_enclosure_width_bits'])+'|'+str(height_bench_cold)+'|'+str(height_bench_warm_ms)+'|'+str(height_bench_height.ball.lower)+'|'+str(height_bench_height.ball.upper)+'|'+str(height_bench_context.diagnostics()['finite_correction_cache_hits'])+'|'+str(height_bench_context.diagnostics()['archimedean_correction_cache_hits'])`,
        ].join("\n"),
        { timeout: 900_000 },
      );
      const fields = unquote(result.repr).split("|");
      rows.push({
        targetBits: Number(fields[0]),
        steps: Number(fields[1]),
        workingPrecisionBits: Number(fields[2]),
        achievedEnclosureWidthBits: Number(fields[3]),
        objectColdMilliseconds: Number(fields[4]),
        warmMilliseconds: Number(fields[5]),
        enclosure: { lower: fields[6], upper: fields[7], rigorous: true },
        finiteCacheHits: Number(fields[8]),
        archimedeanCacheHits: Number(fields[9]),
      });
    }

    const target = targets[0];
    const batchResult = await session.evaluate(
      [
        "height_bench_batch_context = HeightContext(height_bench_J)",
        "height_bench_started = time.perf_counter()",
        `height_bench_pairing = height_pairing([height_bench_P,height_bench_Q], precision=${target}, target_bits=${target}, algorithm='local', context=height_bench_batch_context)`,
        "height_bench_pair_cold = 1000*(time.perf_counter()-height_bench_started)",
        "height_bench_started = time.perf_counter()",
        `for height_bench_index in range(${repetitions}):`,
        `    height_bench_pair_warm = height_pairing([height_bench_P,height_bench_Q], precision=${target}, target_bits=${target}, algorithm='local', context=height_bench_batch_context)`,
        `height_bench_pair_warm_ms = 1000*(time.perf_counter()-height_bench_started)/${repetitions}`,
        "height_bench_started = time.perf_counter()",
        `height_bench_regulator = regulator([height_bench_P,height_bench_Q], precision=${target}, target_bits=${target}, algorithm='local', context=height_bench_batch_context)`,
        "height_bench_reg_warm = 1000*(time.perf_counter()-height_bench_started)",
        "assert height_bench_pairing.rigorous and height_bench_regulator.rigorous",
        "str(height_bench_pair_cold)+'|'+str(height_bench_pair_warm_ms)+'|'+str(height_bench_reg_warm)+'|'+str(height_bench_regulator.ball.lower)+'|'+str(height_bench_regulator.ball.upper)",
      ].join("\n"),
      { timeout: 900_000 },
    );
    const fields = unquote(batchResult.repr).split("|");
    return {
      rows,
      rank2: {
        targetBits: target,
        pairingObjectColdMilliseconds: Number(fields[0]),
        pairingWarmMilliseconds: Number(fields[1]),
        regulatorWarmMilliseconds: Number(fields[2]),
        regulatorEnclosure: { lower: fields[3], upper: fields[4], rigorous: true },
      },
    };
  } finally {
    await session.close();
  }
}

function magmaRows() {
  const lines = [
    "Qx<x>:=PolynomialRing(Rationals());",
    "C:=HyperellipticCurve(x^5-x+1); J:=Jacobian(C);",
    "P:=J![x,1]; Q:=J![x-1,1];",
  ];
  for (const target of targets) {
    const decimalDigits = Math.ceil(target * Math.LOG10E * Math.log(2)) + 10;
    lines.push(
      `t:=Realtime(); h:=CanonicalHeight(P : Precision:=${decimalDigits}); cold:=1000*Realtime(t);`,
      `t:=Realtime(); for i in [1..${repetitions}] do hw:=CanonicalHeight(P : Precision:=${decimalDigits}); end for; warm:=1000*Realtime(t)/${repetitions};`,
      `printf "H|${target}|%o|%o|%.60o\\n",cold,warm,h;`,
    );
  }
  const target = targets[0];
  const decimalDigits = Math.ceil(target * Math.LOG10E * Math.log(2)) + 10;
  lines.push(
    `t:=Realtime(); pair:=HeightPairingMatrix([P,Q] : Precision:=${decimalDigits}); paircold:=1000*Realtime(t);`,
    `t:=Realtime(); for i in [1..${repetitions}] do pairw:=HeightPairingMatrix([P,Q] : Precision:=${decimalDigits}); end for; pairwarm:=1000*Realtime(t)/${repetitions};`,
    `t:=Realtime(); reg:=Regulator([P,Q] : Precision:=${decimalDigits}); regwarm:=1000*Realtime(t);`,
    `printf "B|${target}|%o|%o|%o|%.60o\\n",paircold,pairwarm,regwarm,reg;`,
    "quit;",
  );
  const execution = spawnSync(magma, ["-b"], {
    input: lines.join("\n"),
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (execution.status !== 0) {
    throw new Error(execution.stderr || execution.stdout);
  }
  const rows = [];
  let rank2 = null;
  for (const line of execution.stdout.split(/\r?\n/)) {
    const fields = line.split("|");
    if (fields[0] === "H") {
      rows.push({
        targetBits: Number(fields[1]),
        objectColdMilliseconds: Number(fields[2]),
        warmMilliseconds: Number(fields[3]),
        value: fields[4],
      });
    } else if (fields[0] === "B") {
      rank2 = {
        targetBits: Number(fields[1]),
        pairingObjectColdMilliseconds: Number(fields[2]),
        pairingWarmMilliseconds: Number(fields[3]),
        regulatorWarmMilliseconds: Number(fields[4]),
        regulator: fields[5],
      };
    }
  }
  return { executable: magma, version: "2.18-5", rows, rank2 };
}

async function main() {
  const report = {
    schema: "sagejs.hyperelliptic/genus2-height-competitive-benchmark-v1",
    commit: gitCommit(),
    host: {
      hostname: os.hostname(),
      platform: process.platform,
      architecture: process.arch,
      node: process.version,
      cpus: os.cpus().length,
      loadAverage: os.loadavg(),
    },
    contract: {
      curve: "y^2=x^5-x+1",
      pointP: "[x,1]",
      pointQ: "[x-1,1]",
      normalization: "Cassels-Flynn 2Theta principal polarization",
      oracle,
      targets,
      repetitions,
      modes: ["resident object cold", "resident prepared-context warm"],
    },
    sagejs: await sageRows(),
    magma: runMagma ? magmaRows() : { available: false, reason: "pass --magma" },
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
