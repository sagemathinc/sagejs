"use strict";

const { execFileSync, spawnSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const { hostname, loadavg, platform, arch, cpus } = require("node:os");
const { join } = require("node:path");
const { performance } = require("node:perf_hooks");

const { createSage } = require("../../dist/tools/kernel.js");

function option(name, fallback) {
  const prefix = `--${name}=`;
  const argument = process.argv.find((value) => value.startsWith(prefix));
  return argument === undefined ? fallback : argument.slice(prefix.length);
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function summarize(values) {
  const center = median(values);
  return {
    samples_ms: values.map((value) => Number(value.toFixed(3))),
    minimum_ms: Number(Math.min(...values).toFixed(3)),
    median_ms: Number(center.toFixed(3)),
    maximum_ms: Number(Math.max(...values).toFixed(3)),
    mad_ms: Number(
      median(values.map((value) => Math.abs(value - center))).toFixed(3),
    ),
  };
}

function executable(command) {
  try {
    return execFileSync("sh", ["-c", `command -v ${command}`], {
      encoding: "utf8",
    }).trim();
  } catch (_error) {
    return null;
  }
}

function polynomial(coefficients) {
  return coefficients
    .map((coefficient, exponent) => `(${coefficient})*x^${exponent}`)
    .join("+");
}

function pariRows(gp, cases, samples, batchCalls) {
  if (gp === null) return { available: false, reason: "gp not found", rows: [] };
  const commands = ["default(realbitprecision,64);", "x='x;"];
  for (const row of cases) {
    const f = polynomial(row.model.f);
    const h = polynomial(row.model.h);
    const model = row.model.h.some((value) => value !== "0")
      ? `[${f},${h}]`
      : f;
    commands.push(
      `v=hyperellperiods(${model},2);` +
        `if(abs(v-(${row.expected}))>1e-15*abs(${row.expected}),` +
        `error("PARI period missed pinned corpus for ${row.id}"));`,
    );
    commands.push(
      `for(i=1,${samples},t=getwalltime();v=hyperellperiods(${model},2);` +
        `print("ROW|${row.id}|",getwalltime()-t,"|",v));`,
    );
    commands.push(`times=vector(${batchCalls});batch_t=getwalltime();`);
    commands.push(
      `for(i=1,${batchCalls},t=getwalltime();v=hyperellperiods(${model},2);` +
        `times[i]=getwalltime()-t);batch_total=getwalltime()-batch_t;`,
    );
    commands.push(
      `print("BATCH|${row.id}|",batch_total,"|",v);` +
        `for(i=1,${batchCalls},print("BATCHCALL|${row.id}|",times[i]));`,
    );
  }
  commands.push("quit();");
  const completed = spawnSync(gp, ["-fq"], {
    input: commands.join("\n"),
    encoding: "utf8",
    timeout: 300_000,
  });
  if (completed.status !== 0) {
    return {
      available: false,
      executable: gp,
      reason: (completed.stderr || completed.stdout || "PARI failed").trim(),
      rows: [],
    };
  }
  const grouped = new Map();
  const batches = new Map();
  for (const line of completed.stdout.split(/\r?\n/u)) {
    if (line.startsWith("ROW|")) {
      const [, id, milliseconds, value] = line.split("|");
      if (!grouped.has(id)) grouped.set(id, { times: [], value });
      grouped.get(id).times.push(Number(milliseconds));
    } else if (line.startsWith("BATCH|")) {
      const [, id, milliseconds, value] = line.split("|");
      batches.set(id, {
        totalMs: Number(milliseconds),
        value,
        times: [],
      });
    } else if (line.startsWith("BATCHCALL|")) {
      const [, id, milliseconds] = line.split("|");
      batches.get(id)?.times.push(Number(milliseconds));
    }
  }
  return {
    available: true,
    executable: gp,
    rows: [...grouped].map(([id, row]) => {
      const batch = batches.get(id);
      return {
        id,
        repeated_recompute: {
          ...summarize(row.times),
          result: row.value,
        },
        resident_batch_recompute: {
          calls: batchCalls,
          ...summarize(batch.times),
          total_ms: batch.totalMs,
          per_call_from_total_ms: Number(
            (batch.totalMs / batchCalls).toFixed(6),
          ),
          result: batch.value,
        },
      };
    }),
  };
}

async function main() {
  const samples = Number(option("samples", "3"));
  const batchCalls = Number(option("batch-calls", "100"));
  if (!Number.isInteger(samples) || samples < 1 || samples > 20) {
    throw new Error("--samples must be an integer from 1 through 20");
  }
  if (!Number.isInteger(batchCalls) || batchCalls < 10 || batchCalls > 1000) {
    throw new Error("--batch-calls must be an integer from 10 through 1000");
  }
  const corpus = JSON.parse(
    readFileSync(
      join(__dirname, "../../test/hyperelliptic-bsd-oracles/corpus.json"),
      "utf8",
    ),
  );
  const cases = [corpus.pari_genus2[0], corpus.pari_genus3_periods[0]].map(
    ({ id, model, real_period }) => ({ id, model, expected: real_period }),
  );
  const session = await createSage();
  const rows = [];
  try {
    await session.evaluate(
      [
        "import time",
        "from sagejs.hyperelliptic_curves.periods import clear_period_cache, real_period",
        "R=PolynomialRing(QQ,'x')",
        "def qr(t):",
        "    p=t.split('/')",
        "    return QQ(int(p[0])) if len(p)==1 else QQ(int(p[0]))/QQ(int(p[1]))",
        `period_cases=${JSON.stringify(cases)}`,
        "curves=[HyperellipticCurve(R([qr(v) for v in row['model']['f']]),R([qr(v) for v in row['model']['h']])) for row in period_cases]",
        "def period_batch(curve,count):",
        "    elapsed=[]",
        "    batch_started=time.perf_counter()",
        "    for _index in range(count):",
        "        period_started=time.perf_counter()",
        "        value=real_period(curve,prec=64,use_cache=False)",
        "        value.model_period()",
        "        elapsed.append((time.perf_counter()-period_started)*1000)",
        "    return [(time.perf_counter()-batch_started)*1000]+elapsed",
        "True",
      ].join("\n"),
      { timeout: 300_000 },
    );
    for (let caseIndex = 0; caseIndex < cases.length; caseIndex += 1) {
      const timings = [];
      const objectColdTimings = [];
      const transportTimings = [];
      let representation = null;
      const validated = await session.evaluate(
        `clear_period_cache(); p=real_period(curves[${caseIndex}],prec=64,use_cache=False); expected=RealField(64)(period_cases[${caseIndex}]['expected']); assert abs(p.model_period()-expected)/expected<RealField(64)('1e-15'); diagnostics=p.diagnostics(); (str(p.model_period()),p.achieved_stability_bits,tuple(tuple(a['engine'] for a in r['quadrature_attempts']) for r in diagnostics['refinement_runs']),diagnostics['complete_arb_refinement_runs'],diagnostics['complete_arb_stage_timings_ms'])`,
        { timeout: 300_000 },
      );
      representation = validated.repr;
      for (let sample = 0; sample < samples; sample += 1) {
        const started = performance.now();
        const result = await session.evaluate(
          `clear_period_cache(); period_started=time.perf_counter(); p=real_period(curves[${caseIndex}],prec=64,use_cache=False); (time.perf_counter()-period_started)*1000`,
          { timeout: 300_000 },
        );
        transportTimings.push(performance.now() - started);
        timings.push(Number(result.repr));
        const objectCold = await session.evaluate(
          `fresh=HyperellipticCurve(R([qr(v) for v in period_cases[${caseIndex}]['model']['f']]),R([qr(v) for v in period_cases[${caseIndex}]['model']['h']])); period_started=time.perf_counter(); p=real_period(fresh,prec=64,use_cache=False); p.model_period(); (time.perf_counter()-period_started)*1000`,
          { timeout: 300_000 },
        );
        objectColdTimings.push(Number(objectCold.repr));
      }
      const batchResult = await session.evaluate(
        `period_batch(curves[${caseIndex}],${batchCalls})`,
        { timeout: 300_000 },
      );
      const batchValues = JSON.parse(batchResult.repr);
      const batchTotal = Number(batchValues[0]);
      const batchTimings = batchValues.slice(1).map(Number);
      rows.push({
        id: cases[caseIndex].id,
        object_cold: summarize(objectColdTimings),
        repeated_recompute: {
          ...summarize(timings),
          transport: summarize(transportTimings),
          result: representation,
        },
        resident_batch_recompute: {
          calls: batchCalls,
          ...summarize(batchTimings),
          total_ms: Number(batchTotal.toFixed(3)),
          per_call_from_total_ms: Number(
            (batchTotal / batchCalls).toFixed(6),
          ),
        },
        expected: cases[caseIndex].expected,
      });
    }
  } finally {
    await session.close();
  }
  const gpOption = option("gp", process.env.PARI_GP || "gp");
  const gp = gpOption.includes("/") ? gpOption : executable(gpOption);
  process.stdout.write(
    `${JSON.stringify(
      {
        schema: "sagejs.hyperelliptic/period-pari-competitive-v1",
        recorded_at: new Date().toISOString(),
        host: {
          hostname: hostname(),
          platform: platform(),
          architecture: arch(),
          node: process.version,
          cpu: cpus()[0]?.model ?? null,
          load_average: loadavg(),
        },
        contract: {
          precision_bits: 64,
          initial_panels:
            "adaptive default 3; the bounded genus-3 path raises its minimum to 4 before refinement",
          sagejs:
            "resident process; object-cold and repeated recompute are separate; public result cache disabled; wall time measured inside Sage.js",
          sagejs_transport:
            "Node/kernel request wall time is recorded separately and excluded from arithmetic comparison",
          pari: "resident GP process, hyperellperiods(model,2); single-call and 100-call batch totals are separate",
          result_oracle: "pinned PARI 2.18.1-alpha decimal corpus",
          rigorous: false,
          bench_1_required_for_acceptance: true,
        },
        samples,
        batch_calls: batchCalls,
        sagejs: { rows },
        pari: pariRows(gp, cases, samples, batchCalls),
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
