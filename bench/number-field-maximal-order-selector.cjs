#!/usr/bin/env node
"use strict";

const { createSage } = require("../dist/tools/kernel.js");

const sampleArgument = process.argv.indexOf("--samples");
const samples = sampleArgument < 0 ? 5 : Number(process.argv[sampleArgument + 1]);
if (!Number.isInteger(samples) || samples < 1) {
  throw new Error("--samples must be a positive integer");
}

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

async function main() {
  const session = await createSage();
  try {
    const evaluated = await session.evaluate(
      [
        "import json",
        "import time",
        "from sagejs.number_fields.maximal_order_engine import inspect_maximal_order_selection",
        `samples = ${samples}`,
        "R.<x> = QQ[]",
        "cases = [('quadratic-p2', x^2 - 8), ('cubic-p2', x^3 + x^2 - 2*x + 8)]",
        "algorithms = ['auto', 'native', 'round2', 'polygon', 'round4', 'om-maxmin']",
        "rows = []",
        "for case_name, polynomial in cases:",
        "    reference = None",
        "    for algorithm in algorithms:",
        "        timings = []",
        "        for sample in range(samples):",
        "            K.<a> = NumberField(polynomial)",
        "            started = time.perf_counter_ns()",
        "            O = K.maximal_order(algorithm=algorithm, trace=True)",
        "            timings.append((time.perf_counter_ns() - started) // 1000)",
        "            canonical = (str(O.basis()), O.discriminant())",
        "            if reference is None:",
        "                reference = canonical",
        "            assert canonical == reference",
        "            assert O.is_maximal()",
        "        rows.append([case_name, algorithm, timings])",
        "degree = 64",
        "coefficients = [-2] + [0] * (degree - 1) + [1]",
        "primes = [2, 3, 5, 7]",
        "discriminant = 1",
        "for prime in primes:",
        "    discriminant = discriminant * prime^128",
        "selector_timings = []",
        "for sample in range(samples):",
        "    started = time.perf_counter_ns()",
        "    disabled = inspect_maximal_order_selection(coefficients, discriminant, primes, worker_capability=False, cpu_count=8)",
        "    selector_timings.append((time.perf_counter_ns() - started) // 1000)",
        "capable = inspect_maximal_order_selection(coefficients, discriminant, primes, worker_capability=True, cpu_count=8)",
        "print(json.dumps({'rows': rows, 'selector_timings': selector_timings, 'disabled_schedule': list(disabled['schedule']), 'capable_schedule': list(capable['schedule']), 'parallel_gate': disabled['parallel_gate']}))",
      ].join("\n"),
    );
    const payload = JSON.parse(evaluated.stdout.trim().split("\n").at(-1));
    const scheduleSummary = (schedule) => ({
      schema: schedule[0],
      mode: schedule[1],
      workers: schedule[2],
      job_count: schedule[3].length,
      predicted_micros: schedule[4],
      conservative_peak_bytes: schedule[5],
      reason: schedule[6],
      threshold_evidence: schedule[7],
    });
    const report = {
      schema: "sagejs.benchmark/number-field-maximal-order-selector-v1",
      samples,
      units: "microseconds",
      boundary:
        "fresh field through public certified maximal_order(trace=True), including selection and merge",
      arithmetic: payload.rows.map(([caseName, algorithm, timings]) => ({
        case: caseName,
        algorithm,
        median_micros: median(timings),
        timings,
      })),
      synthetic_many_prime_selector: {
        degree: 64,
        local_valuation: 128,
        prime_count: 4,
        median_micros: median(payload.selector_timings),
        timings: payload.selector_timings,
        current_public_schedule: scheduleSummary(payload.disabled_schedule),
        hypothetical_pointer_free_worker_schedule: scheduleSummary(
          payload.capable_schedule,
        ),
        public_corpus_gate: payload.parallel_gate,
      },
      interpretation:
        "Native remains the public auto choice. The Python local boundary stays sequential until a pointer-free arithmetic worker demonstrates the scheduler crossover.",
    };
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await session.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
