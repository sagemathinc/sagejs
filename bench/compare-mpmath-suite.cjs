#!/usr/bin/env node
"use strict";

const { existsSync, mkdirSync, readFileSync } = require("node:fs");
const { homedir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");
const manifest = JSON.parse(readFileSync(
  join(root, "upstream-tests", "python-packages", "manifest.json"),
  "utf8",
));
const mpmath = manifest.packages.find((entry) => entry.name === "mpmath");
const python = process.env.PYTHON || "python3";
const pypy = process.env.PYPY || "pypy3";
const samples = Number(process.env.SAGEJS_MPMATH_SUITE_SAMPLES || 3);
const json = process.argv.includes("--json");
if (!Number.isInteger(samples) || samples < 1) {
  throw new Error("SAGEJS_MPMATH_SUITE_SAMPLES must be a positive integer");
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...options.env },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(result.stdout || "");
    process.stderr.write(result.stderr || "");
    throw new Error(`${command} exited with status ${result.status}`);
  }
  return result.stdout;
}

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

function sitePackagesPath() {
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
  if (!existsSync(receipt)) {
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
  }
  return target;
}

function parseOutput(output) {
  const tests = new Map();
  const modules = new Map();
  let summary;
  for (const line of output.trim().split("\n")) {
    const fields = line.split("\t");
    if (fields[0] === "TEST") {
      tests.set(`${fields[1]}.${fields[2]}`, {
        module: fields[1],
        test: fields[2],
        passed: fields[3] === "PASS",
        seconds: Number(fields[4]),
        detail: fields.slice(5).join("\t"),
      });
    } else if (fields[0] === "MODULE") {
      modules.set(fields[1], {
        passed: Number(fields[2]),
        failed: Number(fields[3]),
        importSeconds: Number(fields[4]),
        testSeconds: Number(fields[5]),
      });
    } else if (fields[0] === "SUMMARY") {
      summary = {
        passed: Number(fields[1]),
        failed: Number(fields[2]),
        seconds: Number(fields[3]),
      };
    }
  }
  if (!summary) throw new Error(`unexpected suite output: ${output}`);
  return { tests, modules, summary };
}

const sitePackages = sitePackagesPath();
const suite = join(root, "bench", "mpmath-upstream-suite.py");
const implementations = [
  {
    name: "CPython",
    command: python,
    args: [suite],
    env: { PYTHONPATH: sitePackages },
  },
];
const pypyProbe = spawnSync(pypy, ["--version"], { encoding: "utf8" });
if (!pypyProbe.error && pypyProbe.status === 0) {
  implementations.push({
    name: "PyPy",
    command: pypy,
    args: [suite],
    env: { PYTHONPATH: sitePackages },
  });
}
implementations.push({
  name: "Sage.js",
  command: process.execPath,
  args: [join(root, "bin", "sagejs-source.cjs"), "--python", suite],
  env: { SAGEJS_SITE_PACKAGES: sitePackages },
});

for (const implementation of implementations) {
  implementation.env.MPMATH_NOGMPY = "Y";
  implementation.discovery = parseOutput(run(
    implementation.command,
    implementation.args,
    { env: implementation.env },
  ));
}

const allTestNames = [...implementations[0].discovery.tests.keys()];
const commonTests = allTestNames.filter((name) =>
  implementations.every((implementation) =>
    implementation.discovery.tests.get(name)?.passed
  )
);

for (const implementation of implementations) {
  const moduleSamples = new Map();
  const totalSamples = [];
  for (let sample = 0; sample < samples; sample += 1) {
    const measured = parseOutput(run(
      implementation.command,
      implementation.args,
      { env: implementation.env },
    ));
    const failedCommon = commonTests.filter((name) =>
      !measured.tests.get(name)?.passed
    );
    if (failedCommon.length) {
      throw new Error(
        `${implementation.name} failed common tests: ${failedCommon.join(", ")}`,
      );
    }
    let totalCommonSeconds = 0;
    const sampleModuleSeconds = new Map();
    for (const name of commonTests) {
      const result = measured.tests.get(name);
      totalCommonSeconds += result.seconds;
      sampleModuleSeconds.set(
        result.module,
        (sampleModuleSeconds.get(result.module) || 0) + result.seconds,
      );
    }
    totalSamples.push(totalCommonSeconds);
    for (const [moduleName, seconds] of sampleModuleSeconds) {
      if (!moduleSamples.has(moduleName)) moduleSamples.set(moduleName, []);
      moduleSamples.get(moduleName).push(seconds);
    }
  }
  implementation.commonSeconds = median(totalSamples);
  implementation.moduleSeconds = Object.fromEntries(
    [...moduleSamples].map(([name, values]) => [name, median(values)]),
  );
}

const moduleNames = [...implementations[0].discovery.modules.keys()];
const moduleRows = moduleNames.map((moduleName) => {
  const tests = commonTests.filter((name) => name.startsWith(`${moduleName}.`));
  return {
    module: moduleName.replace(/^test_/, ""),
    tests: tests.length,
    timings: Object.fromEntries(implementations.map((implementation) => [
      implementation.name,
      implementation.moduleSeconds[moduleName],
    ])),
  };
});
const report = {
  generatedAt: new Date().toISOString(),
  package: `${mpmath.name}==${mpmath.version}`,
  samples,
  discoveredTests: allTestNames.length,
  commonPassingTests: commonTests.length,
  compatibility: implementations.map((implementation) => ({
    runtime: implementation.name,
    ...implementation.discovery.summary,
    failures: [...implementation.discovery.tests]
      .filter(([, result]) => !result.passed)
      .map(([name, result]) => ({ name, detail: result.detail })),
  })),
  moduleRows,
};

if (json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`${report.package}: upstream suite compatibility (pure-Python backend)`);
  for (const row of report.compatibility) {
    console.log(
      `  ${row.runtime.padEnd(10)} ${String(row.passed).padStart(3)}/` +
      `${row.passed + row.failed} passed`,
    );
  }
  console.log(`\n${commonTests.length} tests pass on every runtime; median of ${samples} fresh processes`);
  console.log(
    "area".padEnd(16),
    "tests".padStart(5),
    ...implementations.map((implementation) =>
      implementation.name.padStart(11)
    ),
    "Sage/CP".padStart(10),
  );
  console.log("-".repeat(16 + 6 + 12 * implementations.length + 11));
  for (const row of moduleRows) {
    const cpython = row.timings.CPython;
    const sagejs = row.timings["Sage.js"];
    console.log(
      row.module.padEnd(16),
      String(row.tests).padStart(5),
      ...implementations.map((implementation) =>
        `${(row.timings[implementation.name] * 1000).toFixed(1)} ms`.padStart(11)
      ),
      `${(sagejs / cpython).toFixed(1)}x`.padStart(10),
    );
  }
  console.log(
    "\nDiscovery includes failures; timing includes only the identical common " +
    "passing tests and excludes process startup from each module row.",
  );
}
