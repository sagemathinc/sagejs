#!/usr/bin/env node
"use strict";

const { spawn } = require("node:child_process");
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
      const parent = Number(status.match(/^PPid:\s+(\d+)/m)?.[1]);
      const rssKib = Number(status.match(/^VmRSS:\s+(\d+)\s+kB/m)?.[1]);
      rows.push({ pid: Number(entry), parent, rssKib });
    } catch (_error) {
      // A process can exit between listing and reading its status.
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

function runSampled(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const started = process.hrtime.bigint();
    const child = spawn(command, args, {
      cwd: root,
      env: { ...process.env, ...(options.env ?? {}) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let peakRssBytes = processTreeRss(child.pid);
    const timer = setInterval(() => {
      const observed = processTreeRss(child.pid);
      if (observed !== null) {
        peakRssBytes = Math.max(peakRssBytes ?? 0, observed);
      }
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
      const wallSeconds = Number(process.hrtime.bigint() - started) / 1e9;
      if (code !== 0) {
        reject(
          new Error(
            `${command} exited ${code ?? signal}\n${stdout}\n${stderr}`,
          ),
        );
        return;
      }
      resolve({ stdout, stderr, wallSeconds, peakRssBytes });
    });
  });
}

function parseMagma(stdout) {
  const records = [];
  const pattern = /^MESTRE p=(\d+) mode=([^ ]+) sample=(\d+) dimension=(\d+) construction_cpu=([0-9.]+) first_cpu=([0-9.]+) warm_cpu=([0-9.eE+-]+) warm_iterations=(\d+) warm_batch_cpu=([0-9.]+) trace=(-?\d+) row_sum=(-?\d+) charpoly_count=(\d+)$/;
  const coefficientPattern = /^COEFF p=(\d+) mode=([^ ]+) sample=(\d+) index=(\d+) value=(-?\d+)$/;
  for (const line of stdout.split(/\r?\n/)) {
    if (line.startsWith("MESTRE ")) {
      const match = line.match(pattern);
      if (match === null) throw new Error(`cannot parse Magma record: ${line}`);
      records.push({
        prime: Number(match[1]),
        mode: match[2],
        sample: Number(match[3]),
        dimension: Number(match[4]),
        construction_cpu_seconds: Number(match[5]),
        first_t2_cpu_seconds: Number(match[6]),
        warm_t2_cpu_seconds: Number(match[9]) / Number(match[8]),
        warm_iterations: Number(match[8]),
        warm_t2_batch_cpu_seconds: Number(match[9]),
        trace: Number(match[10]),
        row_sum: Number(match[11]),
        charpoly_count: Number(match[12]),
        charpoly_coefficients: [],
      });
      continue;
    }
    if (line.startsWith("COEFF ")) {
      const match = line.match(coefficientPattern);
      if (match === null) throw new Error(`cannot parse Magma coefficient: ${line}`);
      const record = records.find(
        (item) =>
          item.prime === Number(match[1]) &&
          item.mode === match[2] &&
          item.sample === Number(match[3]),
      );
      if (record === undefined || Number(match[4]) !== record.charpoly_coefficients.length + 1) {
        throw new Error(`orphaned Magma coefficient: ${line}`);
      }
      record.charpoly_coefficients.push(Number(match[5]));
    }
  }
  for (const record of records) {
    if (record.charpoly_coefficients.length !== record.charpoly_count) {
      throw new Error(`incomplete Magma characteristic polynomial at p=${record.prime}`);
    }
    delete record.charpoly_count;
  }
  return records;
}

function verifyExactAgreement(sageRecords, magmaRecords, repeat) {
  for (const sageRecord of sageRecords) {
    for (const mode of ["gram-theta", "neighboring-ideals"]) {
      const matches = magmaRecords.filter(
        (record) => record.prime === sageRecord.prime && record.mode === mode,
      );
      if (matches.length !== repeat) {
        throw new Error(`missing ${mode} Magma samples at p=${sageRecord.prime}`);
      }
      for (const match of matches) {
        if (match.dimension !== sageRecord.samples[0].dimension) {
          throw new Error(`Magma dimension mismatch at p=${sageRecord.prime}`);
        }
        if (match.row_sum !== sageRecord.samples[0].row_sum) {
          throw new Error(`Magma row-sum mismatch at p=${sageRecord.prime}`);
        }
        const expected = sageRecord.samples[0].exact_coefficients;
        if (
          expected !== null &&
          JSON.stringify(match.charpoly_coefficients) !== JSON.stringify(expected)
        ) {
          throw new Error(`Magma characteristic polynomial mismatch at p=${sageRecord.prime}`);
        }
      }
    }
  }
}

async function main() {
  const repeat = positiveInteger("repeat", 3);
  const primes = option("primes", "37,389")
    .split(",")
    .map((value) => Number(value));
  if (primes.some((value) => !Number.isSafeInteger(value) || value < 5)) {
    throw new Error("--primes must contain integers at least five");
  }
  const magma = option("magma", process.env.MAGMA ?? "magma");
  const magmaScript = path.join(__dirname, "magma-brandt-benchmark.m");
  const sageScript = path.join(__dirname, "classical.cjs");
  const sageRun = await runSampled(process.execPath, [
    sageScript,
    `--repeat=${repeat}`,
    `--primes=${primes.join(",")}`,
  ]);
  const sage = JSON.parse(sageRun.stdout);
  const magmaRun = await runSampled(magma, ["-b", magmaScript], {
    env: {
      MESTRE_BENCH_PRIMES: primes.join(","),
      MESTRE_BENCH_REPEAT: String(repeat),
      MESTRE_BENCH_WARM_ITERATIONS: "100000",
    },
  });
  const magmaRecords = parseMagma(magmaRun.stdout);
  verifyExactAgreement(sage.records, magmaRecords, repeat);

  const receipt = {
    schema: "sagejs.mestre-classical-competitive-receipt.v1",
    recorded_at: new Date().toISOString(),
    source_commit: require("node:child_process")
      .execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" })
      .trim(),
    host: {
      platform: process.platform,
      arch: process.arch,
      node: process.version,
      cpus: os.cpus().length,
      model: os.cpus()[0]?.model ?? null,
      total_memory_bytes: os.totalmem(),
    },
    contract: {
      primes,
      repeat,
      magma_modes: ["gram-theta", "neighboring-ideals"],
      magma_cpu_timer_resolution_seconds: 0.01,
      magma_warm_iterations: 100000,
      orientation: "basis-independent invariants; Magma acts on row vectors",
    },
    sources: {
      sage_benchmark: path.relative(root, sageScript),
      sage_benchmark_sha256: sha256(sageScript),
      magma_benchmark: path.relative(root, magmaScript),
      magma_benchmark_sha256: sha256(magmaScript),
    },
    sagejs: {
      wall_seconds: sageRun.wallSeconds,
      peak_process_tree_rss_bytes: sageRun.peakRssBytes,
      stderr_sha256: crypto.createHash("sha256").update(sageRun.stderr).digest("hex"),
      payload: sage,
    },
    magma: {
      executable: magma,
      wall_seconds: magmaRun.wallSeconds,
      peak_process_tree_rss_bytes: magmaRun.peakRssBytes,
      stdout_sha256: crypto.createHash("sha256").update(magmaRun.stdout).digest("hex"),
      stderr_sha256: crypto.createHash("sha256").update(magmaRun.stderr).digest("hex"),
      records: magmaRecords,
    },
    exact_agreement: true,
  };
  const output = option("output", "");
  if (output !== "") {
    fs.writeFileSync(path.resolve(output), `${JSON.stringify(receipt, null, 2)}\n`);
  }
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
