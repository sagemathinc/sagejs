#!/usr/bin/env node
"use strict";

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
const defaultIds = ["pari-round4-vector-001", "pari-round4-vector-002"];
const ids = process.env.SAGEJS_NF_PARALLEL_CASES
  ? process.env.SAGEJS_NF_PARALLEL_CASES.split(",").filter(Boolean)
  : defaultIds;

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

function commonSource(coefficients) {
  return [
    "import json, time",
    "from sagejs.number_fields.maximal_order_engine import _exact_integer",
    `source_coefficients = [${coefficients.join(",")}]`,
    "R.<x> = QQ[]",
  ];
}

async function measureNative(entry) {
  return evaluateWithPeakRss(
    [
      ...commonSource(entry.polynomial.coefficients),
      "K.<a> = NumberField(R(source_coefficients))",
      "started = time.perf_counter_ns()",
      "O = K.maximal_order(trace=True)",
      "total_micros = (time.perf_counter_ns() - started) // 1000",
      "events = O.maximal_order_trace()['events']",
      "report = {'total_micros':total_micros, 'basis':repr(O.basis()), 'discriminant':str(_exact_integer(O.discriminant())), 'index':str(O.maximality_certificate()['index']), 'stages':[(event['stage'], event['duration_ns']//1000) for event in events]}",
      "print(json.dumps(report))",
      "None",
    ].join("\n"),
  );
}

async function measureLocal(entry, workerCapability) {
  return evaluateWithPeakRss(
    [
      ...commonSource(entry.polynomial.coefficients),
      "from sagejs.number_fields.discriminant_components import decompose_discriminant",
      "from sagejs.number_fields.local_parallel import local_result_contract",
      "from sagejs.number_fields.local_parallel_worker import run_public_local_jobs",
      "from sagejs.number_fields.maximal_order_certification import certify_global_order, make_local_maximality_witness",
      "from sagejs.number_fields.maximal_order_engine import _CertificateAdapter, _basis_from_order, _cache_discriminant_from_basis, _index_from_discriminants, _integral_polynomial_data, _local_selection_plan, _merge_orders, _order_from_basis, _proven_prime_components, _valuation",
      `worker_capability = ${workerCapability ? "True" : "False"}`,
      "K.<a> = NumberField(R(source_coefficients))",
      "started = time.perf_counter_ns()",
      "coefficients, scale = _integral_polynomial_data(K)",
      "equation_order = K.equation_order()",
      "equation_discriminant = _exact_integer(equation_order.discriminant())",
      "stage = time.perf_counter_ns()",
      "decomposition = decompose_discriminant(coefficients, equation_discriminant)",
      "decomposition_micros = (time.perf_counter_ns() - stage) // 1000",
      "primes = _proven_prime_components(decomposition, None)",
      "stage = time.perf_counter_ns()",
      "jobs, decisions, ignored = _local_selection_plan(coefficients, equation_discriminant, primes, 'auto', worker_capability=worker_capability)",
      "selection_micros = (time.perf_counter_ns() - stage) // 1000",
      "stage = time.perf_counter_ns()",
      "local_run = run_public_local_jobs(jobs, worker_capability=worker_capability)",
      "worker_micros = (time.perf_counter_ns() - stage) // 1000",
      "stage = time.perf_counter_ns()",
      "order = equation_order",
      "for payload in local_run[2]:",
      "    contract = local_result_contract(payload)",
      "    local_discriminant = equation_discriminant // (contract.index * contract.index)",
      "    local_order = _order_from_basis(K, contract.basis, scale, local_discriminant)",
      "    order = _merge_orders(K, order, local_order)",
      "    current_basis = _basis_from_order(order, scale)",
      "    _cache_discriminant_from_basis(order, current_basis, equation_discriminant)",
      "merge_micros = (time.perf_counter_ns() - stage) // 1000",
      "order_discriminant = _exact_integer(order.discriminant())",
      "index = _index_from_discriminants(equation_discriminant, order_discriminant)",
      "witnesses = []",
      "for record in decomposition['components']:",
      "    if record['state'] == 'proven-prime' and _valuation(equation_discriminant, int(record['base'])) >= 2:",
      "        prime = int(record['base'])",
      "        witnesses.append(make_local_maximality_witness(prime, 'round2', _valuation(equation_discriminant, prime), _valuation(order_discriminant, prime), _valuation(index, prime), {'check':'independent-round2-fixed-point'}))",
      "stage = time.perf_counter_ns()",
      "adapter = _CertificateAdapter(coefficients, scale, equation_discriminant, {}, primes)",
      "adapter.bind_candidate(order)",
      "certificate = certify_global_order(adapter, order, decomposition, witnesses)",
      "certification_micros = (time.perf_counter_ns() - stage) // 1000",
      "total_micros = (time.perf_counter_ns() - started) // 1000",
      "report = {'total_micros':total_micros, 'decomposition_micros':decomposition_micros, 'selection_micros':selection_micros, 'worker_micros':worker_micros, 'merge_micros':merge_micros, 'certification_micros':certification_micros, 'mode':local_run[1][1], 'workers':local_run[1][2], 'schedule_reason':local_run[1][6], 'prime_count':len(primes), 'basis':repr(order.basis()), 'discriminant':str(order_discriminant), 'index':str(index), 'certificate_index':str(certificate['index']), 'resources':local_run[4]}",
      "print(json.dumps(report))",
      "None",
    ].join("\n"),
  );
}

async function inspectDecision(entry) {
  return evaluateWithPeakRss(
    [
      ...commonSource(entry.polynomial.coefficients),
      "from sagejs.number_fields.discriminant_components import decompose_discriminant",
      "from sagejs.number_fields.local_parallel_worker import public_worker_decision, public_worker_capability",
      "from sagejs.number_fields.maximal_order_engine import _integral_polynomial_data, _local_selection_plan, _proven_prime_components",
      "K.<a> = NumberField(R(source_coefficients))",
      "coefficients, scale = _integral_polynomial_data(K)",
      "equation_discriminant = _exact_integer(K.equation_order().discriminant())",
      "decomposition = decompose_discriminant(coefficients, equation_discriminant)",
      "primes = _proven_prime_components(decomposition, None)",
      "jobs, decisions, ignored = _local_selection_plan(coefficients, equation_discriminant, primes, 'auto', worker_capability=True)",
      "gate = public_worker_decision(jobs, after_native_fallback=True, memory_budget_bytes=4 * 1024 * 1024 * 1024)",
      "report = {'worker_capability':public_worker_capability(), 'prime_count':len(primes), 'job_predicted_micros':[job[4] for job in jobs], 'job_predicted_peak_bytes':[job[5] for job in jobs], 'selected':gate['selected'], 'reason':gate['reason'], 'workers':gate['candidate_schedule'][2], 'predicted_total_micros':gate['predicted_total_micros'], 'predicted_critical_path_micros':gate['predicted_critical_path_micros'], 'predicted_savings_micros':gate['predicted_savings_micros'], 'required_setup_margin_micros':gate['required_setup_margin_micros'], 'useful_job_count':gate['useful_job_count'], 'fixed_runtime_peak_rss_bytes':gate['fixed_runtime_peak_rss_bytes'], 'wire_and_branch_peak_bytes':gate['wire_and_branch_peak_bytes'], 'predicted_peak_rss_bytes':gate['predicted_peak_rss_bytes'], 'memory_budget_source':gate['memory_budget_source'], 'benchmark':gate['benchmark']}",
      "print(json.dumps(report))",
      "None",
    ].join("\n"),
  );
}

function measureFreshProcess(id, mode) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [__filename, "--measure", id, mode], {
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
        reject(new Error(`measurement ${id}/${mode} failed: ${stderr}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout.trim().split(/\r?\n/).at(-1)));
      } catch (error) {
        reject(
          new Error(
            `measurement ${id}/${mode} returned invalid JSON: ${stdout}\n${stderr}`,
            { cause: error },
          ),
        );
      }
    });
  });
}

async function runMeasurement(id, mode) {
  const entry = fixture.cases.find((candidate) => candidate.id === id);
  if (!entry) throw new Error(`unknown corpus case ${id}`);
  if (mode === "native") return measureNative(entry);
  if (mode === "sequential") return measureLocal(entry, false);
  if (mode === "parallel") return measureLocal(entry, true);
  if (mode === "decision") return inspectDecision(entry);
  throw new Error(`unknown measurement mode ${mode}`);
}

async function main() {
  if (process.argv[2] === "--measure") {
    const measurement = await runMeasurement(process.argv[3], process.argv[4]);
    process.stdout.write(`${JSON.stringify(measurement)}\n`);
    return;
  }
  const cases = [];
  for (const id of ids) {
    const decision = await measureFreshProcess(id, "decision");
    const native = await measureFreshProcess(id, "native");
    const sequential = await measureFreshProcess(id, "sequential");
    const parallel = await measureFreshProcess(id, "parallel");
    cases.push({
      id,
      decision,
      native,
      sequential_local: sequential,
      parallel_local: parallel,
      equivalent:
        native.basis === sequential.basis &&
        sequential.basis === parallel.basis &&
        native.discriminant === sequential.discriminant &&
        sequential.discriminant === parallel.discriminant &&
        native.index === sequential.index &&
        sequential.index === parallel.index,
      fallback_speedup: sequential.total_micros / parallel.total_micros,
      parallel_fallback_won: parallel.total_micros < sequential.total_micros,
      native_first_won:
        native.total_micros < sequential.total_micros &&
        native.total_micros < parallel.total_micros,
      parallel_peak_rss_ratio:
        parallel.process_peak_rss_bytes / sequential.process_peak_rss_bytes,
    });
  }
  process.stdout.write(
    `${JSON.stringify(
      {
        schema: "sagejs.benchmark/number-field-public-parallel-worker-v2",
        boundary:
          "fresh field through decomposition, pointer-free local workers, deterministic merge, and independent global certification",
        rss_scope:
          "whole Node process including Sage evaluator and worker threads, sampled every 10ms",
        cases,
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
