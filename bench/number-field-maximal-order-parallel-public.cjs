#!/usr/bin/env node
"use strict";

const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { spawn } = require("node:child_process");
const { createSage } = require("../dist/tools/kernel.js");

const fixture = JSON.parse(
  readFileSync(
    join(__dirname, "..", "test", "fixtures", "number-field-maximal-order-corpus.json"),
    "utf8",
  ),
);
const caseId = process.env.SAGEJS_NF_PARALLEL_PUBLIC_CASE ?? "pari-round4-vector-001";
const sampleCount = Number(process.env.SAGEJS_NF_PARALLEL_PUBLIC_SAMPLES ?? 3);

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function evaluateWithPeakRss(source) {
  const session = await createSage();
  const baselineRss = process.memoryUsage().rss;
  let peakRss = baselineRss;
  const sampler = setInterval(() => {
    peakRss = Math.max(peakRss, process.memoryUsage().rss);
  }, 10);
  const started = process.hrtime.bigint();
  try {
    const result = await session.evaluate(source);
    peakRss = Math.max(peakRss, process.memoryUsage().rss);
    const record = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
    record.host_wall_micros = Number(process.hrtime.bigint() - started) / 1000;
    record.process_baseline_rss_bytes = baselineRss;
    record.process_peak_rss_bytes = peakRss;
    record.process_peak_rss_delta_bytes = peakRss - baselineRss;
    return record;
  } finally {
    clearInterval(sampler);
    await session.close();
  }
}

async function measure(entry, mode) {
  const parallel = mode === "parallel";
  if (!parallel && mode !== "sequential") throw new Error(`unknown mode ${mode}`);
  const source = [
    "import json, time",
    "import sagejs.number_fields.maximal_order_engine as engine",
    "import sagejs.number_fields.local_parallel_worker as worker_module",
    "from sagejs.number_fields.local_parallel_worker import public_worker_capability",
    `source_coefficients = [${entry.polynomial.coefficients.join(",")}]`,
    `parallel_requested = ${parallel ? "True" : "False"}`,
    "R.<x> = QQ[]",
    "native = engine.native_order_from_polynomial",
    "decision = worker_module.public_worker_decision",
    "def unavailable(coefficients, primes):",
    "    raise RuntimeError('benchmark-forced native unavailability')",
    "def configured_decision(jobs, **options):",
    "    options['memory_budget_bytes'] = 4 * 1024 * 1024 * 1024",
    "    options['worker_capability'] = parallel_requested",
    "    return decision(jobs, **options)",
    "engine.native_order_from_polynomial = unavailable",
    "worker_module.public_worker_decision = configured_decision",
    "try:",
    "    K.<a> = NumberField(R(source_coefficients))",
    "    started = time.perf_counter_ns()",
    "    O = K.maximal_order(trace=True)",
    "    total_micros = (time.perf_counter_ns() - started) // 1000",
    "finally:",
    "    engine.native_order_from_polynomial = native",
    "    worker_module.public_worker_decision = decision",
    "events = O.maximal_order_trace()['events']",
    "native_event = [event for event in events if event['stage'] == 'native-local-orders'][-1]",
    "schedule_event = [event for event in events if event['stage'] == 'local-schedule'][-1]",
    "schedule = schedule_event['details']['schedule']",
    "gate = schedule_event['details']['parallel_decision']",
    "branch_micros = sorted([(event['details']['prime'], event['duration_ns'] // 1000) for event in events if event['stage'] in ('round2-local-order', 'selected-local-order', 'arbitrary-prime-local-order')])",
    "report = {'total_micros':total_micros, 'basis':repr(O.basis()), 'discriminant':str(engine._exact_integer(O.discriminant())), 'index':str(O.maximality_certificate()['index']), 'native_state':native_event['state'], 'native_message':native_event['details']['message'], 'mode':schedule[1], 'workers':schedule[2], 'schedule_reason':schedule[6], 'worker_capability':public_worker_capability(), 'gate_selected':gate['selected'], 'gate_reason':gate['reason'], 'after_native_fallback':gate['after_native_fallback'], 'useful_job_count':gate['useful_job_count'], 'predicted_total_micros':gate['predicted_total_micros'], 'predicted_critical_path_micros':gate['predicted_critical_path_micros'], 'predicted_peak_rss_bytes':gate['predicted_peak_rss_bytes'], 'memory_budget_bytes':gate['memory_budget_bytes'], 'resources':schedule_event['details']['resources'], 'branch_micros':branch_micros, 'cached_during_measurement':False}",
    "print(json.dumps(report))",
    "None",
  ].join("\n");
  return evaluateWithPeakRss(source);
}

function freshProcess(mode) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [__filename, "--measure", caseId, mode], {
      cwd: join(__dirname, ".."),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code !== 0) {
        reject(new Error(`${mode} measurement failed: ${stderr}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout.trim().split(/\r?\n/).at(-1)));
      } catch (error) {
        reject(new Error(`${mode} measurement returned invalid JSON`, { cause: error }));
      }
    });
  });
}

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

function compact(record) {
  return {
    ...record,
    basis_sha256: digest(record.basis),
    basis: undefined,
  };
}

async function main() {
  const requestedId = process.argv[3] ?? caseId;
  const entry = fixture.cases.find((candidate) => candidate.id === requestedId);
  if (!entry) throw new Error(`unknown corpus case ${requestedId}`);
  if (process.argv[2] === "--measure") {
    process.stdout.write(`${JSON.stringify(await measure(entry, process.argv[4]))}\n`);
    return;
  }
  if (!Number.isInteger(sampleCount) || sampleCount < 3) {
    throw new Error("SAGEJS_NF_PARALLEL_PUBLIC_SAMPLES must be at least 3");
  }
  const sequential = [];
  const parallel = [];
  for (let sample = 0; sample < sampleCount; sample += 1) {
    sequential.push(await freshProcess("sequential"));
    parallel.push(await freshProcess("parallel"));
  }
  const equivalent = [...sequential, ...parallel].every(
    (record) =>
      record.basis === sequential[0].basis &&
      record.discriminant === sequential[0].discriminant &&
      record.index === sequential[0].index,
  );
  const sequentialMedian = median(sequential.map((record) => record.total_micros));
  const parallelMedian = median(parallel.map((record) => record.total_micros));
  process.stdout.write(
    `${JSON.stringify(
      {
        schema: "sagejs.benchmark/number-field-maximal-order-parallel-public-v1",
        case_id: requestedId,
        boundary:
          "fresh public NumberField.maximal_order(trace=True), after deliberate native resource unavailability",
        sample_policy: `${sampleCount} alternating fresh Node/Sage.js processes per mode; median`,
        rss_scope: "whole fresh Node process, sampled every 10ms",
        exact_equivalent: equivalent,
        sequential: sequential.map(compact),
        parallel: parallel.map(compact),
        medians: {
          sequential_total_micros: sequentialMedian,
          parallel_total_micros: parallelMedian,
          speedup: sequentialMedian / parallelMedian,
          sequential_peak_rss_bytes: median(
            sequential.map((record) => record.process_peak_rss_bytes),
          ),
          parallel_peak_rss_bytes: median(
            parallel.map((record) => record.process_peak_rss_bytes),
          ),
        },
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
