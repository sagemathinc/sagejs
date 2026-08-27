"use strict";

const { execFileSync, spawnSync } = require("node:child_process");
const { hostname, loadavg, platform, arch, cpus } = require("node:os");
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

function parseMagma(magma, samples) {
  if (magma === null) {
    return { available: false, reason: "Magma not found" };
  }
  const script = `
major, minor, patch := GetVersion();
printf "VERSION|%o|%o|%o\\n", major, minor, patch;
Q<xq> := PolynomialRing(Rationals());
fq := 17/60*xq^5 - 10/3*xq^4 + 173/12*xq^3 - 139/6*xq^2 + 74/5*xq + 1;
xs := [0,0,1,1,2,2,3,3,4,4,5,5];
ys := [1,-1,2,-2,3,-3,5,-5,7,-7,10,-10];
assert &and[ Evaluate(fq, xs[i]) eq ys[i]^2 : i in [1..12] ];
CC := ComplexField(20);
P<x> := PolynomialRing(CC);
f := &+[ CC!Coefficient(fq, i)*x^i : i in [0..Degree(fq)] ];
prepare_started := Realtime();
A := AnalyticJacobian(f);
prepare_ms := 1000*Realtime(prepare_started);
batch_started := Realtime();
values := [ ToAnalyticJacobian(CC!xs[i], CC!ys[i], A) : i in [1..12] ];
object_cold_ms := 1000*Realtime(batch_started);
assert &and[ &and[ Abs(values[i][j,1] + values[i+1][j,1]) lt 1e-18 : j in [1..2] ] : i in [1,3,5,7,9,11] ];
printf "PREP|%o|%o\\n", prepare_ms, object_cold_ms;
for sample in [1..${samples}] do
    batch_started := Realtime();
    values := [ ToAnalyticJacobian(CC!xs[i], CC!ys[i], A) : i in [1..12] ];
    elapsed_ms := 1000*Realtime(batch_started);
    assert &and[ &and[ Abs(values[i][j,1] + values[i+1][j,1]) lt 1e-18 : j in [1..2] ] : i in [1,3,5,7,9,11] ];
    printf "ROW|%o|%o\\n", sample, elapsed_ms;
end for;
for i in [1..12] do
    for j in [1..2] do
        printf "VALUE|%o|%o|%o|%o\\n", i, j, Real(values[i][j,1]), Imaginary(values[i][j,1]);
    end for;
end for;
quit;
`;
  const completed = spawnSync(magma, ["-b"], {
    input: script,
    encoding: "utf8",
    timeout: 300_000,
  });
  if (completed.status !== 0) {
    return {
      available: false,
      executable: magma,
      reason: (completed.stderr || completed.stdout || "Magma failed").trim(),
    };
  }
  const times = [];
  const values = [];
  let preparationMs = null;
  let objectColdMs = null;
  let version = null;
  for (const line of completed.stdout.split(/\r?\n/u)) {
    const fields = line.split("|");
    if (fields[0] === "VERSION") {
      version = fields.slice(1).join(".");
    } else if (fields[0] === "PREP") {
      preparationMs = Number(fields[1]);
      objectColdMs = Number(fields[2]);
    } else if (fields[0] === "ROW") {
      times.push(Number(fields[2]));
    } else if (fields[0] === "VALUE") {
      values.push({
        point: Number(fields[1]),
        differential: Number(fields[2]),
        real: fields[3],
        imaginary: fields[4],
      });
    }
  }
  if (
    times.length !== samples ||
    values.length !== 24 ||
    version === null ||
    preparationMs === null ||
    objectColdMs === null
  ) {
    return {
      available: false,
      executable: magma,
      reason: `incomplete Magma output: ${completed.stdout}`,
    };
  }
  return {
    available: true,
    executable: magma,
    version,
    analytic_jacobian_preparation_ms: preparationMs,
    prepared_object_cold_batch_ms: objectColdMs,
    separate_calls_sharing_prepared_jacobian: {
      calls_per_batch: 12,
      ...summarize(times),
      per_call_from_median_ms: Number((median(times) / 12).toFixed(6)),
    },
    final_values: values,
    validation: {
      exact_rational_points_on_curve: true,
      conjugate_pair_sums_below_1e_18: true,
    },
  };
}

async function sageRows(samples) {
  const session = await createSage();
  try {
    await session.evaluate(
      [
        "import time",
        "import json",
        "from mpmath import mp",
        "from sagejs.hyperelliptic_curves.periods import abel_jacobi_batch, clear_period_cache, real_period",
        "R=PolynomialRing(QQ,'x')",
        "x=R.gen()",
        "f=QQ(17)/60*x**5-QQ(10)/3*x**4+QQ(173)/12*x**3-QQ(139)/6*x**2+QQ(74)/5*x+1",
        "C=HyperellipticCurve(f)",
        "heights=[1,2,3,5,7,10]",
        "points=[C([index,sign*height]) for index,height in enumerate(heights) for sign in (1,-1)]",
        "assert all(point.xy()[1]**2==f(point.xy()[0]) for point in points)",
        "clear_period_cache()",
        "periods=real_period(C,prec=64,use_cache=False)",
        "def timed_abel_batch():",
        "    started=time.perf_counter()",
        "    answer=abel_jacobi_batch(C,points,period_result=periods,prec=64,max_refinements=3,use_cache=False)",
        "    return answer,(time.perf_counter()-started)*1000",
        "True",
      ].join("\n"),
      { timeout: 300_000 },
    );
    const coldTransportStarted = performance.now();
    const cold = await session.evaluate(
      "batch,cold_ms=timed_abel_batch(); cold_ms",
      { timeout: 300_000 },
    );
    const coldTransportMs = performance.now() - coldTransportStarted;
    const times = [];
    const transportTimes = [];
    for (let sample = 0; sample < samples; sample += 1) {
      const transportStarted = performance.now();
      const result = await session.evaluate("batch,elapsed=timed_abel_batch(); elapsed", {
        timeout: 300_000,
      });
      transportTimes.push(performance.now() - transportStarted);
      times.push(Number(result.repr));
    }
    const evidence = await session.evaluate(
      [
        "vectors=[[[float(value.real()),float(value.imag())] for value in item.vector()] for item in batch]",
        "pair_error=max(abs(batch[2*pair].vector()[entry]+batch[2*pair+1].vector()[entry]) for pair in range(6) for entry in range(2))",
        "diagnostics=batch[0].diagnostics()",
        "verified=batch[0].verify()['verified'] and batch[-1].verify()['verified']",
        "print(json.dumps([vectors,float(pair_error),diagnostics['native_achieved_stability_bits'],diagnostics['native_arithmetic_accuracy_bits'],[[run['work_precision_bits'],run['quadrature_panels'],run['quadrature_order'],run['stage_timings_ms']] for run in diagnostics['refinement_runs']],diagnostics['native_stage_timings_ms'],verified]))",
      ].join(";"),
      { timeout: 300_000 },
    );
    const [
      vectors,
      pairError,
      achievedStabilityBits,
      arithmeticAccuracyBits,
      refinementRuns,
      stageTimings,
      verified,
    ] = JSON.parse(evidence.stdout.trim());
    if (!verified || pairError >= 2 ** -60) {
      throw new Error(`Sage.js Abel--Jacobi validation failed: ${evidence.repr}`);
    }
    return {
      prepared_object_cold_batch_ms: Number(Number(cold.repr).toFixed(3)),
      prepared_object_cold_transport_ms: Number(coldTransportMs.toFixed(3)),
      one_boundary_batches_sharing_period_plan: {
        points_per_batch: 12,
        ...summarize(times),
        transport: summarize(transportTimes),
        per_point_from_median_ms: Number((median(times) / 12).toFixed(6)),
      },
      final_vectors: vectors,
      evidence: {
        exact_rational_points_on_curve: true,
        conjugate_pair_maximum_error: pairError,
        achieved_stability_bits: achievedStabilityBits,
        arithmetic_accuracy_bits: arithmeticAccuracyBits,
        refinement_runs: refinementRuns,
        stage_timings_ms: stageTimings,
        ordinary_source_replay_verified: verified,
      },
    };
  } finally {
    await session.close();
  }
}

async function main() {
  const samples = Number(option("samples", "5"));
  if (!Number.isInteger(samples) || samples < 3 || samples > 20) {
    throw new Error("--samples must be an integer from 3 through 20");
  }
  const magmaOption = option("magma", process.env.MAGMA || "magma");
  const magma = magmaOption.includes("/")
    ? magmaOption
    : executable(magmaOption);
  const sagejs = await sageRows(samples);
  const magmaResult = parseMagma(magma, samples);
  const sageMedian = sagejs.one_boundary_batches_sharing_period_plan.median_ms;
  const magmaMedian = magmaResult.available
    ? magmaResult.separate_calls_sharing_prepared_jacobian.median_ms
    : null;
  const speedup = magmaMedian === null ? null : magmaMedian / sageMedian;
  process.stdout.write(
    `${JSON.stringify(
      {
        schema: "sagejs.hyperelliptic/abel-jacobi-magma-competitive-v1",
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
          curve:
            "y^2=17/60*x^5-10/3*x^4+173/12*x^3-139/6*x^2+74/5*x+1",
          points:
            "the 12 ordered affine points (x,+/-y), x=0..5, y=1,2,3,5,7,10",
          basepoint: "the unique point at infinity on the odd-degree model",
          target_precision:
            "Sage.js 64 bits; Magma 20 decimal digits (at least 64 bits, the nearest supported AnalyticJacobian input precision)",
          preparation:
            "Sage.js real_period and Magma AnalyticJacobian are prepared outside the compared rows",
          sagejs:
            "one public abel_jacobi_batch call for all 12 points, result cache disabled; elapsed wall time measured inside the resident Sage.js process",
          magma:
            "12 separate ToAnalyticJacobian calls sharing one prepared AnalyticJacobian; elapsed wall time measured inside one resident Magma process",
          output_validation:
            "exact rational point equations plus conjugate-pair cancellation; numeric vectors are retained but not directly equated because the programs choose different homology bases",
          pari:
            "no comparable public generic hyperelliptic Abel--Jacobi point-map API",
          rigorous: false,
          bench_1_required_for_acceptance: true,
        },
        samples,
        sagejs,
        magma: magmaResult,
        comparison: {
          magma_separate_calls_over_sagejs_batch: speedup,
          exit_criterion_passed: speedup !== null && speedup > 1,
        },
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
