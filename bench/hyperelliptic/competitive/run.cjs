#!/usr/bin/env node
"use strict";

const { createHash } = require("node:crypto");
const { existsSync, readFileSync, realpathSync, writeFileSync } = require("node:fs");
const { arch, cpus, freemem, hostname, platform, release, totalmem } = require("node:os");
const { dirname, join, resolve } = require("node:path");
const { performance } = require("node:perf_hooks");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "../../..");
const defaultCases = join(__dirname, "cases-v1.json");

function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function command(commandValue, args = [], options = {}) {
  return spawnSync(commandValue, args, { cwd: root, encoding: "utf8", maxBuffer: 128 * 1024 * 1024, ...options });
}
function resolveExecutable(value) {
  if (value.includes("/")) return existsSync(value) ? realpathSync(value) : null;
  const result = command("bash", ["-lc", `command -v ${value}`]);
  return result.status === 0 && result.stdout.trim() ? realpathSync(result.stdout.trim()) : null;
}
function parseArguments() {
  const answer = { cases: defaultCases, output: null, backends: ["sagejs", "standalone", "wasm", "magma", "pari", "sagemath"], tier: "acceptance", repetitions: null, batchSize: null };
  for (let index = 2; index < process.argv.length; index += 1) {
    const value = process.argv[index];
    if (value === "--cases") answer.cases = resolve(process.argv[++index]);
    else if (value === "--output") answer.output = resolve(process.argv[++index]);
    else if (value === "--backends") answer.backends = process.argv[++index].split(",");
    else if (value === "--tier") answer.tier = process.argv[++index];
    else if (value === "--repetitions") answer.repetitions = Number(process.argv[++index]);
    else if (value === "--repeated-size") answer.batchSize = Number(process.argv[++index]);
    else throw new Error(`unknown argument ${value}`);
  }
  return answer;
}
function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
function summarize(values, divisor = 1) {
  if (!values?.length) return null;
  const scaled = values.map((value) => Number(value) / divisor); const center = median(scaled);
  return { median_ms: center, min_ms: Math.min(...scaled), max_ms: Math.max(...scaled), mad_ms: median(scaled.map((value) => Math.abs(value - center))), samples: scaled.length };
}
function normalizeResult(caseData, row) {
  if (row.status !== "ok") return null;
  const value = row.result;
  if (caseData.kind.startsWith("jacobian_")) return { u: value.u, v: value.v };
  if (caseData.kind === "real_period" || caseData.kind === "canonical_height") return { value: value.value };
  if (caseData.kind === "central_value" || caseData.kind === "lfunction_init") return { analytic_rank: value.analytic_rank, value: value.value };
  return value;
}
function validate(caseData, row) {
  if (row.status === "unsupported") return { passed: true, comparison: "explicit-unsupported", reason: row.reason };
  if (row.status !== "ok") return { passed: false, reason: row.reason ?? row.status };
  if (
    caseData.precision !== undefined
    && row.effective_pari_bit_precision !== undefined
    && row.effective_pari_bit_precision < caseData.precision
  ) {
    return {
      passed: false,
      reason: `effective PARI precision ${row.effective_pari_bit_precision} < requested ${caseData.precision}`,
    };
  }
  const expected = caseData.expected;
  const actual = row.result;
  if (caseData.kind === "real_period") {
    if (expected.value !== undefined && Math.abs(Number(actual.value) - Number(expected.value)) > Number(expected.absolute_tolerance)) return { passed: false, reason: "period outside tolerance" };
    if (expected.real_components !== undefined && actual.real_components !== undefined && actual.real_components !== expected.real_components) return { passed: false, reason: "real component mismatch" };
    return { passed: true, comparison: "absolute-tolerance" };
  }
  if (caseData.kind === "central_value" || caseData.kind === "lfunction_init") {
    if (actual.analytic_rank !== expected.analytic_rank || Math.abs(Number(actual.value) - Number(expected.value)) > Number(expected.absolute_tolerance)) return { passed: false, reason: "central value/rank mismatch" };
    return { passed: true, comparison: "absolute-tolerance" };
  }
  if (caseData.kind === "canonical_height") {
    if (expected.rigorous && actual.rigorous === false) return { passed: false, reason: "nonrigorous height" };
    if (expected.value !== undefined && Math.abs(Number(actual.value) - Number(expected.value)) > Number(expected.absolute_tolerance)) return { passed: false, reason: "height outside tolerance" };
    return { passed: true, comparison: expected.value === undefined ? "rigor-status" : "absolute-tolerance" };
  }
  if (caseData.kind.startsWith("jacobian_") && actual.infinity_weight !== undefined) {
    const expectedWeight = actual.u.length - 1;
    if (actual.infinity_weight !== expectedWeight) {
      return { passed: false, reason: `odd-degree infinity weight ${actual.infinity_weight} != deg(u) ${expectedWeight}` };
    }
  }
  const normalized = normalizeResult(caseData, row);
  if (stable(normalized) !== stable(expected)) return { passed: false, reason: `exact mismatch: ${stable(normalized)} != ${stable(expected)}` };
  return { passed: true, comparison: "exact" };
}
function runBackend(id, executable, runner, request, corpus, unavailableReason = "executable-not-installed") {
  if (!executable) return { backend: { id }, status: "unavailable", reason: unavailableReason, rows: corpus.cases.map((caseData) => ({ id: caseData.id, status: "unsupported", reason: `${id}: ${unavailableReason}` })) };
  const args = id === "sagemath" ? ["-python", runner] : [runner];
  const started = performance.now(); const cpu = process.cpuUsage();
  const result = command(executable, args, { input: `${JSON.stringify(request)}\n`, env: { ...process.env, MAGMA: process.env.MAGMA ?? "/home/user/bin/magma", GP: process.env.GP ?? "/home/user/.local/pari-2.18.1-alpha/bin/gp" }, timeout: request.timeout_ms });
  const processWall = performance.now() - started; const processCpu = process.cpuUsage(cpu);
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${id} runner failed (${result.status}): ${result.stderr}\n${result.stdout}`);
  const lines = result.stdout.trim().split(/\r?\n/).filter((line) => line.startsWith("{"));
  if (!lines.length) throw new Error(`${id} runner emitted no JSON: ${result.stdout}\n${result.stderr}`);
  const output = JSON.parse(lines.at(-1));
  if (output.schema.endsWith("error.v1")) throw new Error(`${id}: ${output.error}`);
  output.status = "ok"; output.process_cold_wall_ms = processWall;
  output.process_cpu_ms = { user: processCpu.user / 1000, system: processCpu.system / 1000 };
  output.executable_sha256 = sha256(readFileSync(executable)); output.runner_sha256 = sha256(readFileSync(runner));
  if (output.backend.executable && existsSync(output.backend.executable)) {
    output.backend.mathematical_executable_sha256 = sha256(readFileSync(realpathSync(output.backend.executable)));
  }
  output.rows = output.rows.map((row) => {
    const caseData = corpus.cases.find((item) => item.id === row.id);
    const check = validate(caseData, row);
    const divisor = row.repeated_warm_loop_size ?? 1;
    return { ...row, validation: check, statistics: { object_cold: summarize(row.object_cold_samples_ms), object_cold_cpu: summarize(row.object_cold_cpu_samples_ms), warm: summarize(row.warm_samples_ms), warm_cpu: summarize(row.warm_cpu_samples_ms), repeated_warm_loop: summarize(row.repeated_warm_loop_samples_ms), repeated_warm_loop_cpu: summarize(row.repeated_warm_loop_cpu_samples_ms), repeated_warm_per_item: summarize(row.repeated_warm_loop_samples_ms, divisor), repeated_warm_cpu_per_item: summarize(row.repeated_warm_loop_cpu_samples_ms, divisor) }, exact_result_sha256: row.result_mode === "exact" && check.passed ? sha256(stable(normalizeResult(caseData, row))) : null };
  });
  return output;
}
function preflight() {
  const shell = (text) => { const result = command("bash", ["-lc", text]); return { command: text, status: result.status, stdout: result.stdout.trim(), stderr: result.stderr.trim() }; };
  return {
    captured_at_utc: new Date().toISOString(), hostname: hostname(), platform: platform(), release: release(), architecture: arch(), cpu: cpus()[0]?.model, logical_cpus: cpus().length, total_memory_bytes: totalmem(), free_memory_bytes: freemem(), node: process.version,
    commands: [shell("uptime"), shell("uname -a"), shell("lscpu"), shell("free -b"), shell("ps -eo pid,ppid,comm,%cpu,%mem,rss --sort=-%cpu | head -25"), shell("for f in /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor; do test -r \"$f\" && printf '%s=' \"$f\" && cat \"$f\"; done")],
    algorithm_environment: Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(OMP|OPENBLAS|MKL|FLINT|PARI|SAGEJS|NODE_OPTIONS)/.test(key)).sort()),
  };
}
function main() {
  const options = parseArguments(); const corpus = JSON.parse(readFileSync(options.cases, "utf8"));
  const selectedCases = corpus.cases.filter((value) => options.tier === "all" || (value.tier ?? "acceptance") === options.tier || (options.tier === "acceptance" && (value.tier ?? "acceptance") === "smoke"));
  const request = { schema: "sagejs.hyperelliptic-competitive-request.v1", cases_path: options.cases, case_ids: selectedCases.map((value) => value.id), timeout_ms: 3_600_000, defaults: { ...(options.repetitions === null ? {} : { repetitions: options.repetitions }), ...(options.batchSize === null ? {} : { batch_size: options.batchSize }) } };
  const definitions = {
    sagejs: { executable: process.execPath, runner: join(__dirname, "sagejs-resident.cjs") },
    standalone: { executable: null, runner: null, reason: "no general public Cantor/period/L-function standalone core exists yet; packed smalljac is measured separately" },
    wasm: { executable: null, runner: null, reason: "no production competitive hyperelliptic Wasm artifact exists yet" },
    magma: { executable: resolveExecutable(process.env.MAGMA ?? "/home/user/bin/magma") ? process.execPath : null, runner: join(__dirname, "magma-resident.cjs") },
    pari: { executable: resolveExecutable(process.env.GP ?? "/home/user/.local/pari-2.18.1-alpha/bin/gp") ? process.execPath : null, runner: join(__dirname, "pari-resident.cjs") },
    sagemath: { executable: resolveExecutable(process.env.SAGE ?? "sage"), runner: join(__dirname, "sagemath-resident.py") },
  };
  const receipt = { schema: "sagejs.hyperelliptic-competitive-receipt.v1", generated_at_utc: new Date().toISOString(), source_commit: command("git", ["rev-parse", "HEAD"]).stdout.trim(), source_status: command("git", ["status", "--short"]).stdout.trim(), corpus: { path: options.cases.slice(root.length + 1), schema: corpus.schema, sha256: sha256(readFileSync(options.cases)), cases: selectedCases.length, tier: options.tier }, timing_contract: { process_cold: "runner process startup through one resident-suite response", object_cold: "new curve/Jacobian or initialized analytic object plus first operation", warm: "prepared object; warm_mode distinguishes arithmetic from cache hit", repeated_warm_loop: "serial repeated calls in one resident process; explicitly not a packed batch", statistics: "median/min/max/MAD; wall and CPU where backend exposes CPU" }, competitor_provisioning: { node: { version: process.version, official_binary: "node-v22.22.2-linux-x64.tar.xz", source_url: "https://nodejs.org/dist/v22.22.2/node-v22.22.2-linux-x64.tar.xz", source_sha256: "88fd1ce767091fd8d4a99fdb2356e98c819f93f3b1f8663853a2dee9b438068a" }, magma: { version: "2.18-5", executable: process.env.MAGMA ?? "/home/user/bin/magma", host_scope: "bench-1-only" }, pari: { version: "2.18.1-alpha", source_url: "https://pari.math.u-bordeaux.fr/pub/pari/testing/pari-2.18.1.alpha.tar.gz", source_sha256: "f046c222db92e3f02120e2f4e74a5b0e1e6faaa248ff90f10c51b2daa0b3599c", prefix: "/home/user/.local/pari-2.18.1-alpha", configure: "--with-gmp --with-readline --graphic=none", host_tuned: false, compiler: "gcc 13.3.0", kernel: "amd64 GMP-6.3.0 single-thread" }, sagemath: { status: definitions?.sagemath?.executable ? "available" : "unavailable", note: "No portable SageMath installation is present on bench-1; unavailable cells remain explicit." } }, host: preflight(), backends: [] };
  for (const id of options.backends) receipt.backends.push(runBackend(id, definitions[id]?.executable ?? null, definitions[id]?.runner, request, { ...corpus, cases: selectedCases }, definitions[id]?.reason));
  receipt.validation = { failed_rows: receipt.backends.flatMap((backend) => backend.rows ?? []).filter((row) => row.validation && !row.validation.passed).map((row) => row.id), exact_cross_backend: {} };
  for (const caseData of selectedCases) {
    const values = receipt.backends.flatMap((backend) => (backend.rows ?? []).filter((row) => row.id === caseData.id && row.exact_result_sha256).map((row) => ({ backend: backend.backend.id, sha256: row.exact_result_sha256 })));
    receipt.validation.exact_cross_backend[caseData.id] = { values, agree: new Set(values.map((value) => value.sha256)).size <= 1 };
  }
  if (receipt.validation.failed_rows.length) throw new Error(`result validation failed: ${receipt.validation.failed_rows.join(", ")}`);
  const serialized = `${JSON.stringify(receipt, null, 2)}\n`;
  if (options.output) writeFileSync(options.output, serialized); else process.stdout.write(serialized);
}
main();
