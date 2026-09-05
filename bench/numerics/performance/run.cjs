#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const {
  digestPath, digestTrackedPath, repositoryIdentity, sha256,
} = require("../../../scripts/numerical-computing/common.cjs");

const ROOT = path.resolve(__dirname, "../../..");
const CASES = [
  "trace-32", "trace-128", "trace-256", "root-brent", "root-bisection",
  "bounded-minimum", "nelder-mead-2", "bfgs-20", "least-squares-exponential",
  "ode-classroom", "ode-oscillator", "describe-20000", "dense-solve-16",
  "integrate-sine", "interpolate-32", "fft-256",
];
const LEVELS = ["none", "summary", "iterations"];

function parseArguments(args) {
  const options = {
    root: ROOT, runtime: "sagejs", cases: [...CASES], levels: ["summary"],
    warmups: 3, samples: 7, timeout: 600000, output: null,
  };
  for (let i = 0; i < args.length; i += 2) {
    if (!args[i].startsWith("--")) throw new Error(`expected an option: ${args[i]}`);
    const key = args[i].replace(/^--/, "");
    const value = args[i + 1];
    if (!Object.hasOwn(options, key) || value === undefined) {
      throw new Error(`unknown or incomplete option: ${args[i]}`);
    }
    if (["warmups", "samples", "timeout"].includes(key)) {
      if (!/^\d+$/.test(value)) throw new Error(`${key} must be an integer`);
      options[key] = Number(value);
      if (!Number.isSafeInteger(options[key]) || options[key] < (key === "warmups" ? 0 : 1)) {
        throw new Error(`${key} is outside its supported range`);
      }
    } else if (["cases", "levels"].includes(key)) {
      options[key] = value.split(",");
      const allowed = key === "cases" ? CASES : LEVELS;
      if (new Set(options[key]).size !== options[key].length ||
          options[key].some((item) => !allowed.includes(item))) {
        throw new Error(`invalid or duplicate ${key}`);
      }
    } else options[key] = value;
  }
  if (!["sagejs", "cpython"].includes(options.runtime)) throw new Error("invalid runtime");
  options.root = path.resolve(options.root);
  if (options.output) options.output = path.resolve(options.output);
  return options;
}

function sourceIdentity(root) {
  return {
    repository: repositoryIdentity(root),
    numerics: digestTrackedPath(root, "src/lib/sagejs/numerics"),
    compiler_runtime: digestTrackedPath(root, "src/baselib"),
  };
}

function parseRecord(text) {
  const marked = text.split(/\r?\n/).filter((line) => line.startsWith("__NUMERICAL_PERF__"));
  assert.equal(marked.length, 1, "expected exactly one performance record");
  return JSON.parse(marked[0].slice("__NUMERICAL_PERF__".length));
}

function callSource(name, level, options) {
  return `print("__NUMERICAL_PERF__" + json.dumps(measure(${JSON.stringify(name)}, ` +
    `${JSON.stringify(level)}, ${options.warmups}, ${options.samples}), sort_keys=True))`;
}

function pythonPrefix(root) {
  // Import host support before the Sage.js library path can shadow stdlib
  // modules. The numerical source itself is identical in both runtimes.
  return "import collections.abc, hashlib, json, math, sys, time, typing\n" +
    `sys.path.insert(0, ${JSON.stringify(path.join(root, "src/lib"))})\n`;
}

function save(options, report) {
  if (!options.output) return;
  fs.mkdirSync(path.dirname(options.output), { recursive: true });
  fs.writeFileSync(options.output, `${JSON.stringify(report, null, 2)}\n`);
}

async function main(args = process.argv.slice(2)) {
  const options = parseArguments(args);
  // Every numerical case in this tranche measures the documented dynamic path.
  // Explicit compiled/library variants will be separate corpus entries.
  process.env.SAGEJS_NATIVE_DISABLE = "1";
  const sourceFile = path.join(__dirname, "workloads.py");
  const source = fs.readFileSync(sourceFile, "utf8");
  const before = sourceIdentity(options.root);
  if (!before.repository.clean) throw new Error("commit the candidate before collecting evidence");
  const report = {
    schema: "sagejs.numerics.performance/v1",
    classification: "provisional-single-run",
    collected_at: new Date().toISOString(),
    source: before,
    collector_sha256: sha256(fs.readFileSync(__filename)),
    workload_sha256: sha256(source),
    host: { platform: process.platform, architecture: process.arch,
      cpu: os.cpus()[0]?.model, node: process.version, load_average: os.loadavg() },
    policy: { ...options, root: undefined, output: undefined,
      native_disabled: true, timed_scope: "public solve including validation and result construction",
      extra_assertions_outside_timing: true, trace_collection_separate_cases: true,
      sample_qualified: options.samples >= 7 && options.warmups >= 3,
      memory_scope: "Node process snapshots only; not isolated peaks",
      unresolved: ["paired quiet-host confirmation", "phase profiles", "cold import isolation",
        "browser and four-platform coverage", "SciPy comparison", "native/library route variants"] },
    memory_before: process.memoryUsage(),
    records: [],
    complete: false,
  };
  let session;
  if (options.runtime === "sagejs") {
    const { inspectBuildReceipt } = require(path.join(options.root, "scripts/build-receipt.cjs"));
    const build = inspectBuildReceipt(options.root);
    if (!build.current) throw new Error(`run pnpm build first: ${build.reason}`);
    report.build = { completed_at: build.completedAt, dist: digestPath(options.root, "dist") };
    const { createSage } = require(path.join(options.root, "dist/tools/kernel.js"));
    const start = performance.now();
    session = await createSage({ mode: "python" });
    report.session_startup_ms = performance.now() - start;
  } else {
    const python = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");
    const version = spawnSync(python, ["--version"], { encoding: "utf8", timeout: 10000 });
    if (version.error) throw version.error;
    assert.equal(version.status, 0, version.stderr);
    report.host.python = version.stdout.trim();
  }
  try {
    if (session) {
      const loaded = await session.evaluate(`import json\n${source}`, {
        language: "python", timeout: options.timeout,
      });
      if (loaded.error) throw new Error(JSON.stringify(loaded.error));
    }
    for (const name of options.cases) for (const level of options.levels) {
      process.stderr.write(`[numerical-perf] ${options.runtime} ${name}/${level}\n`);
      const call = callSource(name, level, options);
      const start = performance.now();
      let output;
      if (session) {
        const result = await session.evaluate(call, { language: "python", timeout: options.timeout });
        if (result.error) throw new Error(JSON.stringify(result.error));
        output = result.stdout;
      } else {
        const python = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");
        const prefix = pythonPrefix(options.root);
        const result = spawnSync(python, ["-I", "-c", `${prefix}${source}\n${call}`], {
          encoding: "utf8", cwd: options.root, timeout: options.timeout,
          maxBuffer: 8 * 1024 * 1024,
        });
        if (result.error) throw result.error;
        assert.equal(result.status, 0, result.stderr || result.stdout);
        output = result.stdout;
      }
      const record = parseRecord(output);
      assert.equal(record.case, name);
      assert.equal(record.trace, level);
      assert.equal(record.durations_ms.length, options.samples);
      assert.ok(record.durations_ms.every((value) => Number.isFinite(value) && value >= 0));
      assert.equal(record.observation.success, true);
      record.batch_wall_ms = performance.now() - start;
      report.records.push(record);
      save(options, report);
      process.stderr.write(`[numerical-perf] ${record.median_ms.toFixed(3)} ms median\n`);
    }
    assert.deepEqual(sourceIdentity(options.root), before, "source changed during collection");
    report.memory_after = process.memoryUsage();
    report.complete = true;
    save(options, report);
    if (!options.output) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    if (session) await session.close();
  }
  return report;
}

if (require.main === module) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
module.exports = { CASES, LEVELS, parseArguments, parseRecord, pythonPrefix, callSource, main };
