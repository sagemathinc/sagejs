#!/usr/bin/env node
"use strict";

const { execFileSync, spawn } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createSage } = require("../../../dist/tools/kernel.js");

const root = path.resolve(__dirname, "../../..");

function option(name, fallback) {
  const prefix = `--${name}=`;
  const value = process.argv.slice(2).find((item) => item.startsWith(prefix));
  return value === undefined ? fallback : value.slice(prefix.length);
}

function sha256(filename) {
  return crypto.createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
}

function processTreeRssBytes(rootPid) {
  if (process.platform !== "linux") return null;
  const children = new Map();
  for (const entry of fs.readdirSync("/proc")) {
    if (!/^\d+$/.test(entry)) continue;
    try {
      const stat = fs.readFileSync(`/proc/${entry}/stat`, "utf8");
      const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
      const parent = Number(fields[1]);
      const list = children.get(parent) ?? [];
      list.push(Number(entry));
      children.set(parent, list);
    } catch (_error) {
      // A process may exit between listing /proc and reading its status.
    }
  }
  let total = 0;
  const pending = [rootPid];
  const seen = new Set();
  while (pending.length !== 0) {
    const pid = pending.pop();
    if (seen.has(pid)) continue;
    seen.add(pid);
    try {
      const status = fs.readFileSync(`/proc/${pid}/status`, "utf8");
      const match = status.match(/^VmRSS:\s*(\d+)\s*kB$/m);
      if (match !== null) total += Number(match[1]) * 1024;
    } catch (_error) {
      // The process exited after the tree snapshot.
    }
    pending.push(...(children.get(pid) ?? []));
  }
  return total;
}

function run(command, args, env = {}) {
  const started = process.hrtime.bigint();
  const child = spawn(command, args, {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  let peakRssBytes = processTreeRssBytes(child.pid);
  const sampler = setInterval(() => {
    const current = processTreeRssBytes(child.pid);
    if (current !== null) peakRssBytes = Math.max(peakRssBytes ?? 0, current);
  }, 20);
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
    if (stdout.length > 16 * 1024 * 1024) child.kill("SIGTERM");
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
    if (stderr.length > 16 * 1024 * 1024) child.kill("SIGTERM");
  });
  return new Promise((resolve, reject) => {
    child.once("error", (error) => {
      clearInterval(sampler);
      reject(error);
    });
    child.once("close", (status, signal) => {
      clearInterval(sampler);
      const wallSeconds = Number(process.hrtime.bigint() - started) / 1e9;
      if (status !== 0) {
        reject(
          new Error(
            `${command} exited ${status ?? signal}\n${stdout}\n${stderr}`,
          ),
        );
        return;
      }
      resolve({ stdout, stderr, wallSeconds, peakRssBytes });
    });
  });
}

function parseMagma(text) {
  const records = [];
  for (const line of text.split(/\r?\n/)) {
    let match = line.match(
      /^BRANDT D=(\d+) N=(\d+) ell=(\d+) dimension=(\d+) construction=([0-9.eE+-]+) first=([0-9.eE+-]+) count=(\d+)$/,
    );
    if (match !== null) {
      records.push({
        D: Number(match[1]),
        N: Number(match[2]),
        ell: Number(match[3]),
        dimension: Number(match[4]),
        construction_cpu_seconds: Number(match[5]),
        first_operator_cpu_seconds: Number(match[6]),
        coefficient_count: Number(match[7]),
        charpoly_coefficients: [],
      });
      continue;
    }
    match = line.match(
      /^COEFF D=(\d+) N=(\d+) ell=(\d+) index=(\d+) value=(-?\d+)$/,
    );
    if (match !== null) {
      const record = records.find(
        (item) =>
          item.D === Number(match[1]) &&
          item.N === Number(match[2]) &&
          item.ell === Number(match[3]),
      );
      if (
        record === undefined ||
        Number(match[4]) !== record.charpoly_coefficients.length + 1
      ) {
        throw new Error(`orphaned Magma coefficient: ${line}`);
      }
      record.charpoly_coefficients.push(Number(match[5]));
    }
  }
  for (const record of records) {
    if (record.charpoly_coefficients.length !== record.coefficient_count) {
      throw new Error(`incomplete Magma polynomial at (${record.D},${record.N})`);
    }
    delete record.coefficient_count;
  }
  return records;
}

function normalizedSagejsRecord(record) {
  return {
    D: Number(record.D),
    N: Number(record.N),
    ell: Number(record.ell),
    dimension: Number(record.dimension),
    class_count: Number(record.class_count),
    standalone_order_seconds: Number(record.standalone_order_seconds),
    construction_seconds: Number(record.construction_seconds),
    first_operator_seconds: Number(record.first_operator_seconds),
    cached_operator_seconds: Number(record.cached_operator_seconds),
    charpoly_seconds: Number(record.charpoly_seconds),
    mass: record.mass,
    weights: record.weights.map(Number),
    row_sums: record.row_sums.map(Number),
    matrix_rows: record.matrix_rows.map((row) => row.map(Number)),
    pairing_rows: record.pairing_rows.map((row) => row.map(Number)),
    charpoly_coefficients: record.charpoly_coefficients.map(Number),
    mass_verified: record.mass_verified,
  };
}

async function sagejsRecords(cases) {
  const session = await createSage();
  try {
    const source = [
      "import json, time",
      "from sagejs.quaternion_algebras import QuaternionAlgebra",
      `cases=${JSON.stringify(cases)}`,
      "records=[]",
      "for D,N,ell in cases:",
      "    started=time.perf_counter()",
      "    standalone_order=QuaternionAlgebra(D).order_with_level(N)",
      "    standalone_order_seconds=time.perf_counter()-started",
      "    started=time.perf_counter()",
      "    B=BrandtModule(D,N,realization='ideal-classes',use_cache=False)",
      "    construction=time.perf_counter()-started",
      "    started=time.perf_counter()",
      "    T=B.hecke_matrix(ell)",
      "    first=time.perf_counter()-started",
      "    started=time.perf_counter()",
      "    cached=B.hecke_matrix(ell)",
      "    cached_seconds=time.perf_counter()-started",
      "    if cached != T: raise ArithmeticError('cached operator changed')",
      "    started=time.perf_counter()",
      "    polynomial=T.charpoly()",
      "    charpoly_seconds=time.perf_counter()-started",
      "    records.append({'D':D,'N':N,'ell':ell,'dimension':B.dimension(),",
      "      'class_count':len(B.right_ideals()),'construction_seconds':str(construction),",
      "      'standalone_order_seconds':str(standalone_order_seconds),",
      "      'first_operator_seconds':str(first),'cached_operator_seconds':str(cached_seconds),",
      "      'charpoly_seconds':str(charpoly_seconds),'mass':str(B.mass()),",
      "      'weights':[str(w) for w in B.monodromy_weights()],",
      "      'row_sums':[str(sum(row)) for row in T.rows()],",
      "      'matrix_rows':[[str(a) for a in row] for row in T.rows()],",
      "      'pairing_rows':[[str(a) for a in row] for row in B.pairing_matrix().rows()],",
      "      'charpoly_coefficients':[str(a) for a in polynomial.list()],",
      "      'mass_verified':B.mass_certificate().verify()})",
      "json.dumps(records)",
    ].join("\n");
    const result = await session.evaluate(source);
    return JSON.parse(result.repr.slice(1, -1)).map(normalizedSagejsRecord);
  } finally {
    await session.close();
  }
}

function digestRows(rows) {
  return crypto.createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}

function finalizedSagejsRecord(record) {
  const result = { ...record };
  result.operator_sha256 = digestRows(result.matrix_rows);
  result.pairing_sha256 = digestRows(result.pairing_rows);
  delete result.matrix_rows;
  delete result.pairing_rows;
  return result;
}

function exactRows(records) {
  return records.map((record) => ({
    D: record.D,
    N: record.N,
    ell: record.ell,
    dimension: record.dimension,
    charpoly_coefficients: record.charpoly_coefficients,
  }));
}

async function main() {
  const workerCases = option("sagejs-worker", "");
  if (workerCases !== "") {
    const cases = workerCases
      .split(",")
      .map((item) => item.split(":").map(Number));
    const records = (await sagejsRecords(cases)).map(finalizedSagejsRecord);
    process.stdout.write(`SAGEJS_RECORDS ${JSON.stringify(records)}\n`);
    return;
  }
  const casesText = option("cases", "11:2:3,37:2:3");
  const cases = casesText.split(",").map((item) => item.split(":").map(Number));
  if (
    cases.some(
      (item) =>
        item.length !== 3 || item.some((value) => !Number.isSafeInteger(value)),
    )
  ) {
    throw new Error("--cases must be comma-separated D:N:ell triples");
  }
  const sageExecutable = option("sage", "/home/user/sagelite/sage");
  const magmaExecutable = option("magma", "/home/user/magma-2.18/bin/magma");
  const environment = { BRANDT_IDEAL_CASES: casesText };
  const sageScript = path.join(__dirname, "sage-oracle.py");
  const magmaScript = path.join(__dirname, "magma-oracle.m");

  const sagejsRun = await run(process.execPath, [
    __filename,
    `--sagejs-worker=${casesText}`,
  ]);
  const sagejsPayload = sagejsRun.stdout
    .split(/\r?\n/)
    .find((line) => line.startsWith("SAGEJS_RECORDS "));
  if (sagejsPayload === undefined) {
    throw new Error("Sage.js worker emitted no JSON payload");
  }
  const sagejs = JSON.parse(sagejsPayload.slice("SAGEJS_RECORDS ".length));
  const sageRun = await run(sageExecutable, [sageScript], environment);
  const magmaRun = await run(magmaExecutable, ["-b", magmaScript], environment);
  const sagePayload = sageRun.stdout
    .split(/\r?\n/)
    .find((line) => line.trimStart().startsWith("{"));
  if (sagePayload === undefined) {
    throw new Error("SageMath oracle emitted no JSON payload");
  }
  const sage = JSON.parse(sagePayload).records;
  const magma = parseMagma(magmaRun.stdout);
  const reference = JSON.stringify(exactRows(sagejs));
  if (
    JSON.stringify(exactRows(sage)) !== reference ||
    JSON.stringify(exactRows(magma)) !== reference
  ) {
    throw new Error("Sage.js, SageMath, and Magma exact rows disagree");
  }

  const receipt = {
    schema: "sagejs.brandt-ideal-classes-competitive-receipt.v1",
    recorded_at: new Date().toISOString(),
    source_commit: execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).trim(),
    host: {
      platform: process.platform,
      arch: process.arch,
      node: process.version,
      cpu_model: os.cpus()[0]?.model ?? null,
      cpu_count: os.cpus().length,
      total_memory_bytes: os.totalmem(),
    },
    contract: {
      cases,
      work: "construct genuine right ideal classes, then the first full good-prime Hecke matrix",
      correctness: "dimension and complete characteristic polynomial agree exactly",
      timing:
        "one descriptive process-cold run per system; Sage.js records resident construction, first/cached operator, and characteristic-polynomial stages; no competitiveness gate",
    },
    sources: {
      runner: path.relative(root, __filename),
      runner_sha256: sha256(__filename),
      sage_oracle: path.relative(root, sageScript),
      sage_oracle_sha256: sha256(sageScript),
      magma_oracle: path.relative(root, magmaScript),
      magma_oracle_sha256: sha256(magmaScript),
    },
    sagejs: {
      executable: process.execPath,
      process_cold_wall_seconds: sagejsRun.wallSeconds,
      peak_rss_bytes: sagejsRun.peakRssBytes,
      stdout_sha256: crypto.createHash("sha256").update(sagejsRun.stdout).digest("hex"),
      stderr_sha256: crypto.createHash("sha256").update(sagejsRun.stderr).digest("hex"),
      records: sagejs,
    },
    sagemath: {
      executable: sageExecutable,
      process_cold_wall_seconds: sageRun.wallSeconds,
      peak_rss_bytes: sageRun.peakRssBytes,
      stdout_sha256: crypto.createHash("sha256").update(sageRun.stdout).digest("hex"),
      stderr_sha256: crypto.createHash("sha256").update(sageRun.stderr).digest("hex"),
      records: sage,
    },
    magma: {
      executable: magmaExecutable,
      process_cold_wall_seconds: magmaRun.wallSeconds,
      peak_rss_bytes: magmaRun.peakRssBytes,
      stdout_sha256: crypto.createHash("sha256").update(magmaRun.stdout).digest("hex"),
      stderr_sha256: crypto.createHash("sha256").update(magmaRun.stderr).digest("hex"),
      records: magma,
    },
    exact_agreement: true,
  };
  const output = option("output", "");
  const serialized = `${JSON.stringify(receipt, null, 2)}\n`;
  if (output !== "") fs.writeFileSync(path.resolve(output), serialized);
  process.stdout.write(serialized);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
