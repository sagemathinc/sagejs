"use strict";

const { execFileSync, spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const { hostname, loadavg, platform, arch, cpus, totalmem } = require("node:os");
const { performance } = require("node:perf_hooks");

const { createSage } = require("../../dist/tools/kernel.js");

function option(name, fallback) {
  const prefix = `--${name}=`;
  const argument = process.argv.find((value) => value.startsWith(prefix));
  return argument === undefined ? fallback : argument.slice(prefix.length);
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function summary(samples) {
  const center = median(samples);
  return {
    samples_ms: samples.map((value) => Number(value.toFixed(3))),
    minimum_ms: Number(Math.min(...samples).toFixed(3)),
    median_ms: Number(center.toFixed(3)),
    maximum_ms: Number(Math.max(...samples).toFixed(3)),
    mad_ms: Number(
      median(samples.map((value) => Math.abs(value - center))).toFixed(3),
    ),
  };
}

async function sageMeasurement(session, stage, source, samples, warmups = 0) {
  let result;
  for (let index = 0; index < warmups; index += 1) {
    result = await session.evaluate(source, { timeout: 300_000 });
  }
  const timings = [];
  for (let index = 0; index < samples; index += 1) {
    const started = performance.now();
    result = await session.evaluate(source, { timeout: 300_000 });
    timings.push(performance.now() - started);
  }
  const representation = result.repr;
  return {
    system: "sagejs",
    stage,
    ...summary(timings),
    result: representation,
    result_sha256: createHash("sha256").update(representation).digest("hex"),
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

function pariMeasurements(gp, samples) {
  if (gp === null) {
    return {
      available: false,
      reason: "gp executable not found; set PARI_GP or --gp=/absolute/path/gp",
      rows: [],
    };
  }
  const script = String.raw`
default(realbitprecision, 64);
x='x;
samples=${samples};
for(sample=1,samples,t=getwalltime();v=hyperellperiods(x^5-x+1,2);print("ROW|period_genus2_model_cold|",getwalltime()-t,"|",v));
for(sample=1,samples,t=getwalltime();v=hyperellperiods([x^7-x+1,x^2],2);print("ROW|period_genus3_generalized_cold|",getwalltime()-t,"|",v));
L=lfungenus2([x,x^3-x+1]);
for(sample=1,samples,t=getwalltime();LI=lfuninit(L,[1,0,0],4);print("ROW|lfunction_init_order4_64bit|",getwalltime()-t,"|",lfun(LI,1)));
LI=lfuninit(L,[1,0,0],4);
for(sample=1,samples,t=getwalltime();for(repetition=1,100,v=lfun(LI,1));print("ROW|prepared_central_value_100|",getwalltime()-t,"|",v));
quit();
`;
  const completed = spawnSync(gp, ["-fq"], {
    input: script,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    timeout: 300_000,
  });
  if (completed.status !== 0) {
    return {
      available: false,
      executable: gp,
      reason: (completed.stderr || completed.stdout || "PARI/GP failed").trim(),
      rows: [],
    };
  }
  const grouped = new Map();
  for (const line of completed.stdout.split(/\r?\n/u)) {
    if (!line.startsWith("ROW|")) continue;
    const first = line.indexOf("|", 4);
    const second = line.indexOf("|", first + 1);
    const stage = line.slice(4, first);
    const milliseconds = Number(line.slice(first + 1, second));
    const result = line.slice(second + 1);
    if (!grouped.has(stage)) grouped.set(stage, { timings: [], result });
    grouped.get(stage).timings.push(milliseconds);
  }
  const rows = [...grouped].map(([stage, value]) => ({
    system: "pari-gp",
    stage,
    ...summary(value.timings),
    result: value.result,
    result_sha256: createHash("sha256").update(value.result).digest("hex"),
  }));
  return { available: rows.length > 0, executable: gp, rows };
}

async function main() {
  const samples = Number(option("samples", "3"));
  if (!Number.isInteger(samples) || samples < 1 || samples > 20) {
    throw new Error("--samples must be an integer from 1 through 20");
  }
  const gpOption = option("gp", process.env.PARI_GP || "gp");
  const gp = gpOption.includes("/") ? gpOption : executable(gpOption);
  if (process.argv.includes("--pari-only")) {
    process.stdout.write(
      `${JSON.stringify(
        {
          schema: "sagejs.hyperelliptic/analytic-competitive-benchmark-v1",
          recorded_at: new Date().toISOString(),
          samples,
          host: {
            hostname: hostname(),
            platform: platform(),
            architecture: arch(),
            node: process.version,
            logical_cpus: cpus().length,
            cpu_model: cpus()[0]?.model ?? null,
            total_memory_bytes: totalmem(),
            load_average: loadavg(),
          },
          timing_contract: {
            unit: "milliseconds",
            pari: "one resident GP process; getwalltime around each public operation",
            pari_realbitprecision: 64,
            pari_lfuninit: "central domain [1,0,0], derivative order 4",
            cache_hits_are_separate: true,
            rigorous_claim: false,
          },
          sagejs: { available: false, reason: "--pari-only", rows: [] },
          pari: pariMeasurements(gp, samples),
        },
        null,
        2,
      )}\n`,
    );
    return;
  }
  const sessionStarted = performance.now();
  const session = await createSage();
  const processColdMs = performance.now() - sessionStarted;
  const rows = [];
  try {
    await session.evaluate(
      [
        "from sagejs.hyperelliptic_curves.lseries import GlobalCoefficientPrefix, HyperellipticLSeries",
        "from sagejs.hyperelliptic_curves.periods import clear_period_cache, real_period",
        "import sagejs.hyperelliptic_curves.periods as period_module",
        "from mpmath import mp",
        "R = PolynomialRing(QQ, 'x')",
        "x = R.gen()",
        "C = HyperellipticCurve(x, x**3-x+1)",
        "C_period2 = HyperellipticCurve(x**5-x+1)",
        "C_period3 = HyperellipticCurve(x**7-x+1, x**2)",
        "C.global_reduction()",
        "True",
      ].join("\n"),
      { timeout: 300_000 },
    );
    rows.push(
      await sageMeasurement(
        session,
        "period_genus2_model_cold",
        "clear_period_cache(); P2=real_period(C_period2,prec=64,use_cache=False); (P2.real_components(),str(P2.model_period()))",
        samples,
      ),
    );
    rows.push(
      await sageMeasurement(
        session,
        "period_genus3_geometry_96bit_cold",
        "clear_period_cache(); completed3,coefficients3=period_module._completed_model(C_period3); bench_geometry=period_module._branch_geometry(C_period3,completed3,96); tuple(bench_geometry['order'])",
        samples,
      ),
    );
    await session.evaluate(
      [
        "with mp.workprec(96):",
        "    bench_roots=bench_geometry['ordered_points']",
        "    bench_leading=period_module._mp_exact(coefficients3[-1])",
        "    bench_edges=period_module._edge_integrals_float64(bench_roots,bench_leading,3,4,16)",
        "True",
      ].join("\n"),
      { timeout: 300_000 },
    );
    rows.push(
      await sageMeasurement(
        session,
        "period_genus3_packed_quadrature_100",
        "tuple(period_module._edge_integrals_float64(bench_roots,bench_leading,3,4,16) for _index in range(100))[-1][0][0]",
        samples,
        1,
      ),
    );
    rows.push(
      await sageMeasurement(
        session,
        "period_genus3_matrix_assembly_10",
        "tuple(period_module._periods_from_edges(bench_edges,3) for _index in range(10))[-1]['symmetry_relative_defect']",
        samples,
        1,
      ),
    );
    rows.push(
      await sageMeasurement(
        session,
        "period_genus3_generalized_cold",
        "clear_period_cache(); P3=real_period(C_period3,prec=64,use_cache=False); (P3.real_components(),str(P3.model_period()))",
        samples,
      ),
    );
    await session.evaluate(
      "clear_period_cache(); cached_period=real_period(C_period3,prec=64)",
      { timeout: 300_000 },
    );
    rows.push(
      await sageMeasurement(
        session,
        "period_genus3_cache_hit_100",
        "tuple(real_period(C_period3,prec=64).cache_hit for _index in range(100))[-1]",
        samples,
      ),
    );
    rows.push(
      await sageMeasurement(
        session,
        "coefficient_prefix_5000_cold",
        "prefix=GlobalCoefficientPrefix(C); values=prefix.through(5000); stream=prefix.diagnostics()['coefficient_stream'] if hasattr(prefix,'diagnostics') else 'unreported'; (len(values),stream,sum(values[:21]))",
        samples,
      ),
    );
    await session.evaluate(
      "prepared_prefix=GlobalCoefficientPrefix(C); prepared_prefix.through(5000)",
      { timeout: 300_000 },
    );
    rows.push(
      await sageMeasurement(
        session,
        "lfunction_init_order4_64bit_coefficients_warm",
        "prepared_L=HyperellipticLSeries(C,prepared_prefix); prepared_I=prepared_L.init(prec=64,max_order=4,algorithm='native'); str(prepared_I.central_value())",
        samples,
      ),
    );
    await session.evaluate(
      "warm_L=HyperellipticLSeries(C,prepared_prefix); warm_I=warm_L.init(prec=64,max_order=4,algorithm='native')",
      { timeout: 300_000 },
    );
    rows.push(
      await sageMeasurement(
        session,
        "prepared_central_value_100",
        "tuple(warm_I.central_value() for _index in range(100))[-1]",
        samples,
        1,
      ),
    );
    rows.push(
      await sageMeasurement(
        session,
        "prepared_central_jet_order2_from_order4_100",
        "tuple(warm_L.central_jet(2,prec=64,algorithm='native') for _index in range(100))[-1]",
        samples,
        1,
      ),
    );
    rows.push(
      await sageMeasurement(
        session,
        "general_values_batch5_64bit_object_cold",
        "batch_L=HyperellipticLSeries(C,prepared_prefix); batch_I=batch_L.init(prec=64,max_order=4,algorithm='native'); tuple(batch_I.values([1,1.25,1.5,1.75,2]))",
        samples,
      ),
    );
    await session.evaluate("warm_I.values([1,1.25,1.5,1.75,2])", {
      timeout: 300_000,
    });
    rows.push(
      await sageMeasurement(
        session,
        "general_values_batch5_cache_hit_100",
        "tuple(warm_I.values([1,1.25,1.5,1.75,2]) for _index in range(100))[-1]",
        samples,
        1,
      ),
    );
  } finally {
    await session.close();
  }
  const pari = pariMeasurements(gp, samples);
  const receipt = {
    schema: "sagejs.hyperelliptic/analytic-competitive-benchmark-v1",
    commit: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    recorded_at: new Date().toISOString(),
    samples,
    host: {
      hostname: hostname(),
      platform: platform(),
      architecture: arch(),
      node: process.version,
      logical_cpus: cpus().length,
      cpu_model: cpus()[0]?.model ?? null,
      total_memory_bytes: totalmem(),
      load_average: loadavg(),
    },
    timing_contract: {
      unit: "milliseconds",
      sagejs: "resident process; public result materialization included",
      pari: "one resident GP process; getwalltime around each public operation",
      matched_precision_bits: 64,
      pari_lfuninit: "central domain [1,0,0], derivative order 4",
      process_cold_ms: Number(processColdMs.toFixed(3)),
      cache_hits_are_separate: true,
      rigorous_claim: false,
    },
    sagejs: { rows },
    pari,
  };
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
