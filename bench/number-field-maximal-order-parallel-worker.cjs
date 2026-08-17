#!/usr/bin/env node
"use strict";

const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { createSage } = require("../dist/tools/kernel.js");

const fixture = JSON.parse(
  readFileSync(
    join(__dirname, "..", "test", "fixtures", "number-field-maximal-order-corpus.json"),
    "utf8",
  ),
);
const ids = ["pari-round4-vector-001", "pari-round4-vector-002"];

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

(async () => {
  const cases = [];
  for (const id of ids) {
    const entry = fixture.cases.find((candidate) => candidate.id === id);
    const native = await measureNative(entry);
    const sequential = await measureLocal(entry, false);
    const parallel = await measureLocal(entry, true);
    cases.push({
      id,
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
    });
  }
  process.stdout.write(
    `${JSON.stringify(
      {
        schema: "sagejs.benchmark/number-field-public-parallel-worker-v1",
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
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
