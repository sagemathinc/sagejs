#!/usr/bin/env node
"use strict";

const { spawn, execFileSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = path.resolve(__dirname, "../../..");

function option(name, fallback) {
  const prefix = `--${name}=`;
  const argument = process.argv.slice(2).find((value) => value.startsWith(prefix));
  return argument === undefined ? fallback : argument.slice(prefix.length);
}

function positiveInteger(name, fallback) {
  const value = Number(option(name, String(fallback)));
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`--${name} must be a positive integer`);
  }
  return value;
}

function sha256(filename) {
  return crypto.createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
}

function processTreeRss(rootPid) {
  if (process.platform !== "linux") return null;
  const rows = [];
  for (const entry of fs.readdirSync("/proc")) {
    if (!/^\d+$/.test(entry)) continue;
    try {
      const status = fs.readFileSync(`/proc/${entry}/status`, "utf8");
      rows.push({
        pid: Number(entry),
        parent: Number(status.match(/^PPid:\s+(\d+)/m)?.[1]),
        rssKib: Number(status.match(/^VmRSS:\s+(\d+)\s+kB/m)?.[1]),
      });
    } catch (_error) {
      // Processes can exit while /proc is being sampled.
    }
  }
  const descendants = new Set([rootPid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) {
      if (descendants.has(row.parent) && !descendants.has(row.pid)) {
        descendants.add(row.pid);
        changed = true;
      }
    }
  }
  return rows
    .filter((row) => descendants.has(row.pid) && Number.isFinite(row.rssKib))
    .reduce((sum, row) => sum + row.rssKib * 1024, 0);
}

function runSampled(command, args, extraEnvironment = {}) {
  return new Promise((resolve, reject) => {
    const started = process.hrtime.bigint();
    const child = spawn(command, args, {
      cwd: root,
      env: { ...process.env, ...extraEnvironment },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let peakRssBytes = processTreeRss(child.pid);
    const timer = setInterval(() => {
      const observed = processTreeRss(child.pid);
      if (observed !== null) peakRssBytes = Math.max(peakRssBytes ?? 0, observed);
    }, 20);
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearInterval(timer);
      reject(error);
    });
    child.on("close", (code, signal) => {
      clearInterval(timer);
      if (code !== 0) {
        reject(new Error(`${command} exited ${code ?? signal}\n${stdout}\n${stderr}`));
        return;
      }
      resolve({
        stdout,
        stderr,
        wall_seconds: Number(process.hrtime.bigint() - started) / 1e9,
        peak_process_tree_rss_bytes: peakRssBytes,
      });
    });
  });
}

function divideByLinear(coefficients, rootValue) {
  const degree = coefficients.length - 1;
  const quotient = Array(degree).fill(0);
  quotient[degree - 1] = coefficients[degree];
  for (let index = degree - 1; index >= 1; index -= 1) {
    quotient[index - 1] = coefficients[index] + rootValue * quotient[index];
  }
  if (coefficients[0] + rootValue * quotient[0] !== 0) {
    throw new Error(`polynomial is not divisible by x-${rootValue}`);
  }
  return quotient;
}

function parseMagma(stdout) {
  const line = stdout.split(/\r?\n/).find((value) => value.startsWith("HILBERT_BENCH "));
  const pattern = /^HILBERT_BENCH level=(\d+) root=(\d+) cusp_dimension=(\d+) construction_cpu=([0-9.]+) t2_cpu=([0-9.]+) t3_cpu=([0-9.]+) warm_iterations=(\d+) warm_t2_batch_cpu=([0-9.]+)$/;
  const match = line?.match(pattern);
  if (match === undefined || match === null) throw new Error(`cannot parse Magma output: ${line}`);
  const record = {
    level_norm: Number(match[1]),
    omega_residue: Number(match[2]),
    cusp_dimension: Number(match[3]),
    construction_cpu_seconds: Number(match[4]),
    first_t2_cpu_seconds: Number(match[5]),
    first_t3_cpu_seconds: Number(match[6]),
    warm_iterations: Number(match[7]),
    warm_t2_batch_cpu_seconds: Number(match[8]),
    t2_cuspidal_charpoly: [],
    t3_cuspidal_charpoly: [],
  };
  const coefficientPattern = /^HILBERT_BENCH_COEFF level=(\d+) index=(\d+) position=(\d+) value=(-?\d+)$/;
  for (const value of stdout.split(/\r?\n/)) {
    if (!value.startsWith("HILBERT_BENCH_COEFF ")) continue;
    const coefficient = value.match(coefficientPattern);
    if (coefficient === null) throw new Error(`cannot parse Magma coefficient: ${value}`);
    const target = coefficient[2] === "2" ? record.t2_cuspidal_charpoly : record.t3_cuspidal_charpoly;
    if (Number(coefficient[3]) !== target.length + 1) throw new Error(`unordered coefficient: ${value}`);
    target.push(Number(coefficient[4]));
  }
  return record;
}

function equalArrays(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function main() {
  const repeat = positiveInteger("repeat", 3);
  const warmIterations = positiveInteger("warm-iterations", 1000);
  const fixtures = new Map([
    [31, 19],
    [389, 238],
    [809, 467],
    [2011, 736],
  ]);
  const levels = option("levels", "31,389,809,2011").split(",").map(Number);
  if (levels.some((level) => !fixtures.has(level))) throw new Error("unknown level fixture");
  const sageScript = path.join(__dirname, "hilbert-sqrt5.cjs");
  const magmaScript = path.join(__dirname, "magma-hilbert-sqrt5-benchmark.m");
  const magma = option("magma", process.env.MAGMA ?? "magma");
  const records = [];
  let sagePeak = 0;
  let magmaPeak = 0;
  for (const level of levels) {
    const samples = [];
    let ambientDimension = null;
    for (let sample = 1; sample <= repeat; sample += 1) {
      const sageRun = await runSampled(process.execPath, [
        sageScript,
        "--repeat=1",
        `--levels=${level}`,
      ]);
      const sagePayload = JSON.parse(sageRun.stdout);
      const sage = sagePayload.records[0];
      ambientDimension = sage.dimension;
      const magmaRun = await runSampled(magma, ["-b", magmaScript], {
        MESTRE_HILBERT_LEVEL: String(level),
        MESTRE_HILBERT_ROOT: String(fixtures.get(level)),
        MESTRE_HILBERT_WARM_ITERATIONS: String(warmIterations),
      });
      const magmaRecord = parseMagma(magmaRun.stdout);
      const expected2 = divideByLinear(sage.t2_charpoly_coefficients, 5);
      const expected3 = divideByLinear(sage.t3_charpoly_coefficients, 10);
      if (
        sage.dimension !== magmaRecord.cusp_dimension + 1 ||
        !equalArrays(expected2, magmaRecord.t2_cuspidal_charpoly) ||
        !equalArrays(expected3, magmaRecord.t3_cuspidal_charpoly)
      ) {
        throw new Error(`exact Sage.js/Magma mismatch at level ${level}`);
      }
      sagePeak = Math.max(sagePeak, sageRun.peak_process_tree_rss_bytes ?? 0);
      magmaPeak = Math.max(magmaPeak, magmaRun.peak_process_tree_rss_bytes ?? 0);
      samples.push({
        sample,
        sagejs: {
          process_wall_seconds: sageRun.wall_seconds,
          peak_process_tree_rss_bytes: sageRun.peak_process_tree_rss_bytes,
          construction_seconds: sage.construction_median_ms / 1000,
          first_t2_seconds: sage.first_t2_median_ms / 1000,
          construction_plus_first_t2_seconds:
            sage.module_and_first_t2_median_ms / 1000,
        },
        magma: {
          process_wall_seconds: magmaRun.wall_seconds,
          peak_process_tree_rss_bytes: magmaRun.peak_process_tree_rss_bytes,
          construction_cpu_seconds: magmaRecord.construction_cpu_seconds,
          first_t2_cpu_seconds: magmaRecord.first_t2_cpu_seconds,
          construction_plus_first_t2_cpu_seconds:
            magmaRecord.construction_cpu_seconds + magmaRecord.first_t2_cpu_seconds,
          warm_t2_cpu_seconds:
            magmaRecord.warm_t2_batch_cpu_seconds / magmaRecord.warm_iterations,
        },
      });
    }
    records.push({
      level_norm: level,
      omega_residue: fixtures.get(level),
      ambient_dimension: ambientDimension,
      exact_agreement: true,
      samples,
    });
  }
  const receipt = {
    schema: "sagejs.mestre-hilbert-sqrt5-competitive-receipt.v1",
    recorded_at: new Date().toISOString(),
    source_commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
    host: {
      platform: process.platform,
      arch: process.arch,
      node: process.version,
      cpus: os.cpus().length,
      model: os.cpus()[0]?.model ?? null,
      total_memory_bytes: os.totalmem(),
    },
    contract: {
      levels,
      repeat,
      equal_contract_timing: "public module construction plus first T2",
      sample_isolation: "fresh Sage.js and Magma process for every level and sample",
      exact_comparison: "Magma cuspidal T2/T3 characteristic polynomials equal Sage.js ambient polynomials after removing the Eisenstein factors x-5 and x-10",
      magma_cpu_timer_resolution_seconds: 0.01,
      magma_warm_iterations: warmIterations,
    },
    sources: {
      sage_benchmark: path.relative(root, sageScript),
      sage_benchmark_sha256: sha256(sageScript),
      magma_benchmark: path.relative(root, magmaScript),
      magma_benchmark_sha256: sha256(magmaScript),
    },
    peak_process_tree_rss_bytes: { sagejs: sagePeak, magma: magmaPeak },
    records,
    exact_agreement: true,
  };
  const output = option("output", "");
  if (output !== "") fs.writeFileSync(path.resolve(output), `${JSON.stringify(receipt, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
