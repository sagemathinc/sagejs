#!/usr/bin/env node
"use strict";

const {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} = require("node:fs");
const { homedir } = require("node:os");
const { join, resolve } = require("node:path");
const { performance } = require("node:perf_hooks");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");
const manifest = JSON.parse(readFileSync(
  join(root, "upstream-tests", "python-packages", "manifest.json"),
  "utf8",
));
const mpmath = manifest.packages.find((entry) => entry.name === "mpmath");
const python = process.env.PYTHON || "python3";
const pypy = process.env.PYPY || "pypy3";
const json = process.argv.includes("--json");

function run(command, args, options = {}) {
  const started = performance.now();
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...options.env },
  });
  const wallSeconds = (performance.now() - started) / 1000;
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(result.stdout || "");
    process.stderr.write(result.stderr || "");
    throw new Error(`${command} exited with status ${result.status}`);
  }
  return { ...result, wallSeconds };
}

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

function prepareSitePackages() {
  if (process.env.SAGEJS_MPMATH_SITE_PACKAGES) {
    return resolve(process.env.SAGEJS_MPMATH_SITE_PACKAGES);
  }
  const cacheBase = process.env.XDG_CACHE_HOME || join(homedir(), ".cache");
  const target = join(
    cacheBase,
    "sagejs",
    "benchmarks",
    `${mpmath.name}-${mpmath.version}`,
    "site-packages",
  );
  const receipt = join(target, ".sagejs-installed", `${mpmath.name}.json`);
  if (existsSync(receipt)) {
    const installed = JSON.parse(readFileSync(receipt, "utf8"));
    if (
      installed.version === mpmath.version &&
      installed.sha256 === mpmath.sha256
    ) return target;
  }
  mkdirSync(target, { recursive: true });
  run(process.execPath, [
    join(root, "bin", "sagejs-source.cjs"),
    "pip",
    "--target",
    target,
    "--no-deps",
    "install",
    `${mpmath.name}==${mpmath.version}`,
  ]);
  return target;
}

const sitePackages = prepareSitePackages();
const importProgram = join(sitePackages, ".sagejs-mpmath-import.py");
writeFileSync(importProgram, "import mpmath\n");
const workload = join(root, "bench", "mpmath-workload.py");
const basicOpsTests = join(root, "bench", "mpmath-test-basic-ops.py");
const implementations = [
  {
    name: "CPython",
    command: python,
    args: (program) => [program],
    env: { PYTHONPATH: sitePackages },
  },
];

const pypyProbe = spawnSync(pypy, ["--version"], { encoding: "utf8" });
if (!pypyProbe.error && pypyProbe.status === 0) {
  implementations.push({
    name: "PyPy",
    command: pypy,
    args: (program) => [program],
    env: { PYTHONPATH: sitePackages },
  });
}

implementations.push(
  {
    name: "Sage.js",
    command: process.execPath,
    args: (program) => [join(root, "bin", "sagejs-source.cjs"), "--python", program],
    env: { SAGEJS_SITE_PACKAGES: sitePackages },
  },
);

const rows = [];
for (const implementation of implementations) {
  // Exclude one-time wheel installation and Sage.js source translation from
  // the steady cold-process comparison. The timed Sage.js runs still start a
  // new process and execute every imported module from its validated cache.
  run(
    implementation.command,
    implementation.args(importProgram),
    { env: implementation.env },
  );
  const importSamples = [];
  for (let sample = 0; sample < 5; sample += 1) {
    importSamples.push(run(
      implementation.command,
      implementation.args(importProgram),
      { env: implementation.env },
    ).wallSeconds);
  }
  const totalSamples = [];
  let result;
  for (let sample = 0; sample < 3; sample += 1) {
    result = run(
      implementation.command,
      implementation.args(workload),
      { env: implementation.env },
    );
    totalSamples.push(result.wallSeconds);
  }
  const match = result.stdout.trim().match(/^RESULT\s+(\S+)\s+(\S+)$/);
  if (!match) throw new Error(`unexpected ${implementation.name} output: ${result.stdout}`);
  const basicResult = run(
    implementation.command,
    implementation.args(basicOpsTests),
    { env: implementation.env },
  );
  const basicMatch = basicResult.stdout.trim().match(
    /^RESULT\s+(\d+)\s+(\d+)\s+(\S+)$/,
  );
  if (!basicMatch) {
    throw new Error(
      `unexpected ${implementation.name} basic-test output: ${basicResult.stdout}`,
    );
  }
  rows.push({
    runtime: implementation.name,
    digest: match[1],
    warmSeconds: Number(match[2]),
    coldImportSeconds: median(importSamples),
    coldWorkloadSeconds: median(totalSamples),
    basicTestsPassed: Number(basicMatch[1]),
    basicTestsFailed: Number(basicMatch[2]),
    basicTestSeconds: Number(basicMatch[3]),
    basicTestProcessSeconds: basicResult.wallSeconds,
  });
}

const correct = rows.every(
  (row) => row.digest === rows[0].digest &&
    row.basicTestsPassed === 23 && row.basicTestsFailed === 0,
);
const report = {
  generatedAt: new Date().toISOString(),
  package: `${mpmath.name}==${mpmath.version}`,
  workload: "80-digit mpf harmonic-cubic accumulation plus sqrt, exp, and zeta",
  correct,
  rows,
};

if (json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`${report.package}: ${report.workload}`);
  console.log("runtime".padEnd(12), "cold import".padStart(12), "cold total".padStart(12), "warm compute".padStart(14));
  console.log("-".repeat(54));
  for (const row of rows) {
    console.log(
      row.runtime.padEnd(12),
      `${(row.coldImportSeconds * 1000).toFixed(1)} ms`.padStart(12),
      `${(row.coldWorkloadSeconds * 1000).toFixed(1)} ms`.padStart(12),
      `${(row.warmSeconds * 1000).toFixed(2)} ms`.padStart(14),
    );
  }
  console.log(`\nmatching 60-digit result: ${correct ? "PASS" : "FAIL"}`);
  console.log("\nunmodified upstream mpmath basic operations (23 tests)");
  console.log("runtime".padEnd(12), "test loop".padStart(12), "whole process".padStart(14));
  console.log("-".repeat(40));
  for (const row of rows) {
    console.log(
      row.runtime.padEnd(12),
      `${(row.basicTestSeconds * 1000).toFixed(1)} ms`.padStart(12),
      `${(row.basicTestProcessSeconds * 1000).toFixed(1)} ms`.padStart(14),
    );
  }
  console.log(
    "Wheel setup and one-time translation are excluded; cold columns include process startup.",
  );
}

if (!correct) process.exitCode = 1;
