#!/usr/bin/env node
"use strict";

const { createHash } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { existsSync, readFileSync, writeFileSync } = require("node:fs");
const os = require("node:os");
const { join, resolve } = require("node:path");

const {
  PersistentLineProcess,
  commandVersion,
} = require("../../tools/number-field-maximal-order/process.cjs");

const root = resolve(__dirname, "../..");
const corpusPath = join(root, "test/fixtures/number-field-foundations/corpus.json");
const measurementPath = join(__dirname, "measurements.json");
const workers = join(__dirname, "workers");

function options(argv) {
  const answer = {
    systems: ["sagejs", "sage", "magma", "hecke"],
    samples: 3,
    warmups: 1,
    timeoutMs: 300_000,
    sage: "/home/user/sagelite/sage",
    magma: "/home/user/bin/magma",
    julia: "/home/user/.juliaup/bin/julia",
    juliaProject: "/home/user/.local/share/sagejs-benchmarks/number-fields-julia",
    update: false,
    allowDirty: false,
    output: null,
    workloads: null,
    includeSlow: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--update") answer.update = true;
    else if (argument === "--allow-dirty") answer.allowDirty = true;
    else if (argument === "--include-slow") answer.includeSlow = true;
    else if (argument === "--systems") answer.systems = argv[++index].split(",");
    else if (argument === "--samples") answer.samples = Number(argv[++index]);
    else if (argument === "--warmups") answer.warmups = Number(argv[++index]);
    else if (argument === "--timeout-ms") answer.timeoutMs = Number(argv[++index]);
    else if (argument === "--sage") answer.sage = argv[++index];
    else if (argument === "--magma") answer.magma = argv[++index];
    else if (argument === "--julia") answer.julia = argv[++index];
    else if (argument === "--julia-project") answer.juliaProject = argv[++index];
    else if (argument === "--output") answer.output = argv[++index];
    else if (argument === "--workloads") answer.workloads = argv[++index].split(",");
    else if (argument === "--help") {
      console.log(`Usage: node bench/number-field-foundations/run.cjs [options]

  --systems sagejs,sage,magma,hecke   persistent systems to compare
  --workloads ID,...      select workload ids
  --samples N             retained samples per workload (default 3)
  --warmups N             warmups per workload (default 1)
  --sage PATH             Sage executable
  --magma PATH            Magma executable
  --julia PATH            Julia executable
  --julia-project PATH    instantiated Oscar/Hecke environment
  --timeout-ms N          per-request timeout
  --output PATH           write the exact report JSON
  --include-slow          include multi-minute reference workloads
  --update                update reviewed answer digests
  --allow-dirty           development-only dirty-tree run`);
      process.exit(0);
    } else throw new Error(`unknown option ${argument}`);
  }
  if (!Number.isInteger(answer.samples) || answer.samples < 1) throw new Error("samples must be positive");
  if (!Number.isInteger(answer.warmups) || answer.warmups < 0) throw new Error("warmups must be nonnegative");
  return answer;
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(value) {
  return createHash("sha256")
    .update("sagejs-number-field-foundations-performance-v1\n")
    .update(canonical(value))
    .digest("hex");
}

function significant(value, digits) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`nonfinite analytic result ${value}`);
  return number === 0 ? "0" : number.toPrecision(digits);
}

function normalizeResult(workload, value) {
  if (["prime-stream", "coefficients"].includes(workload.operation)) return value;
  if (["quadratic-zeta-batch", "general-zeta-scalar"].includes(workload.operation)) {
    const digits = workload.resultDigits || (workload.operation === "general-zeta-scalar" ? 5 : 11);
    const points = workload.operation === "general-zeta-scalar" ? [value] : value;
    const normalized = points.map(([real, imaginary]) => [significant(real, digits), significant(imaginary, digits)]);
    return workload.operation === "general-zeta-scalar" ? normalized[0] : normalized;
  }
  if (workload.operation === "global-arithmetic") {
    return {
      unit_rank: value.unit_rank,
      unit_complete: value.unit_complete,
      class_complete: value.class_complete,
      class_number: value.class_number,
      regulator: significant(value.regulator, workload.resultDigits || 10),
    };
  }
  throw new Error(`no result normalizer for ${workload.operation}`);
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function sourceIdentity(allowDirty) {
  const revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const status = execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim();
  if (status && !allowDirty) throw new Error("performance reports require a clean source tree");
  return { revision, clean: !status };
}

function adapter(system, config) {
  if (system === "sagejs") {
    return new PersistentLineProcess({
      name: system,
      command: process.execPath,
      args: [join(workers, "sagejs.cjs")],
      cwd: root,
      readyPrefix: "@@NFFP_READY@@",
      resultPrefix: "@@NFFP_RESULT@@",
      startupTimeoutMs: 180_000,
    });
  }
  if (system === "sage") {
    return new PersistentLineProcess({
      name: system,
      command: config.sage,
      args: ["--python", join(workers, "sage_worker.py")],
      cwd: root,
      readyPrefix: "@@NFFP_READY@@",
      resultPrefix: "@@NFFP_RESULT@@",
      startupTimeoutMs: 60_000,
    });
  }
  if (system === "magma") {
    return new PersistentLineProcess({
      name: system,
      command: "python3",
      args: [join(workers, "magma_worker.py")],
      cwd: root,
      env: { ...process.env, SAGEJS_MAGMA: config.magma },
      readyPrefix: "@@NFFP_READY@@",
      resultPrefix: "@@NFFP_RESULT@@",
      startupTimeoutMs: 30_000,
    });
  }
  if (system === "hecke") {
    return new PersistentLineProcess({
      name: system,
      command: config.julia,
      args: [`--project=${config.juliaProject}`, join(workers, "hecke_worker.jl")],
      cwd: root,
      readyPrefix: "@@NFFP_READY@@",
      resultPrefix: "@@NFFP_RESULT@@",
      startupTimeoutMs: 180_000,
    });
  }
  throw new Error(`unsupported system ${system}; use sagejs, sage, magma, or hecke`);
}

async function run() {
  const config = options(process.argv.slice(2));
  const identity = sourceIdentity(config.allowDirty || config.update);
  const corpus = JSON.parse(readFileSync(corpusPath, "utf8"));
  const manifest = JSON.parse(readFileSync(measurementPath, "utf8"));
  const fields = new Map(corpus.fields.map((field) => [field.id, field]));
  let workloads = manifest.workloads;
  if (!config.includeSlow && !config.workloads) {
    workloads = workloads.filter((workload) => workload.default !== false);
  }
  if (config.workloads) {
    const wanted = new Set(config.workloads);
    workloads = workloads.filter((workload) => wanted.has(workload.id));
    if (workloads.length !== wanted.size) throw new Error("an unknown workload id was selected");
  }
  const adapters = new Map(config.systems.map((system) => [system, adapter(system, config)]));
  const availability = {};
  const records = [];
  try {
    for (const [system, worker] of adapters) availability[system] = await worker.start();
    for (const workload of workloads) {
      const field = fields.get(workload.field);
      if (!field) throw new Error(`${workload.id}: unknown field ${workload.field}`);
      let acceptedDigest = workload.expectedResultSha256;
      for (const [system, worker] of adapters) {
        if (availability[system].status !== "ok") {
          records.push({ workload: workload.id, system, status: "unavailable", reason: availability[system].reason });
          continue;
        }
        const request = {
          ...workload,
          coefficients: field.polynomial.coefficients,
          precision_bits: workload.precisionBits || 53,
          warmups: config.warmups,
          samples: config.samples,
          timeout_ms: config.timeoutMs,
        };
        const raw = await worker.request(JSON.stringify(request), { timeoutMs: config.timeoutMs });
        if (raw.status !== "ok") {
          records.push({ workload: workload.id, system, status: raw.status, reason: raw.reason, stderr: raw.stderr });
          continue;
        }
        const response = JSON.parse(raw.line);
        if (response.status !== "ok") {
          records.push({ workload: workload.id, system, ...response });
          continue;
        }
        const normalized = response.samples.map((sample) => normalizeResult(workload, sample.result));
        const resultDigests = normalized.map(digest);
        if (!resultDigests.every((value) => value === resultDigests[0])) {
          throw new Error(`${workload.id}/${system}: samples produced different results`);
        }
        if (acceptedDigest === null && config.update) acceptedDigest = resultDigests[0];
        if (acceptedDigest !== resultDigests[0]) {
          throw new Error(`${workload.id}/${system}: result digest ${resultDigests[0]} != ${acceptedDigest}`);
        }
        const timings = response.samples.map((sample) => Number(sample.timing_ms));
        records.push({
          workload: workload.id,
          operation: workload.operation,
          system,
          status: "ok",
          version: worker.version,
          startup_ms: worker.startupMs,
          request_wall_ms: raw.wall_ms,
          timing_repetitions: response.timing_repetitions || 1,
          samples_ms: timings,
          median_ms: median(timings),
          minimum_ms: Math.min(...timings),
          maximum_ms: Math.max(...timings),
          result_sha256: resultDigests[0],
        });
      }
      if (config.update) workload.expectedResultSha256 = acceptedDigest;
    }
  } finally {
    for (const worker of adapters.values()) worker.close();
  }
  if (config.update) writeFileSync(measurementPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const report = {
    schema: "sagejs.number-fields/foundations-performance-report-v1",
    generated_at: new Date().toISOString(),
    source: identity,
    host: {
      platform: process.platform,
      arch: process.arch,
      release: os.release(),
      cpus: os.cpus().map((cpu) => cpu.model),
      memory_bytes: os.totalmem(),
      node: process.version,
      sage_command: config.sage,
      sage_version: commandVersion(config.sage, ["--version"]),
      reference_availability: {
        magma: { command: config.magma, executable: existsSync(config.magma) },
        julia: commandVersion(config.julia, ["--version"]),
        hecke_oscar_project: {
          path: config.juliaProject,
          project: existsSync(join(config.juliaProject, "Project.toml")),
          manifest: existsSync(join(config.juliaProject, "Manifest.toml")),
        },
      },
    },
    policy: {
      samples: config.samples,
      warmups: config.warmups,
      adapter_processes_persistent: true,
      system_startup_excluded_from_sample_timings: true,
      magma_process_scope: "one process per workload request containing all warmups and samples",
    },
    records,
  };
  const output = `${JSON.stringify(report, null, 2)}\n`;
  if (config.output) writeFileSync(config.output, output);
  process.stdout.write(output);
}

run().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
