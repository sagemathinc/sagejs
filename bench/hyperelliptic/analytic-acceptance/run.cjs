#!/usr/bin/env node
"use strict";

const { execFileSync, spawnSync } = require("node:child_process");
const {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const {
  arch,
  cpus,
  freemem,
  hostname,
  loadavg,
  platform,
  release,
  totalmem,
} = require("node:os");
const { dirname, relative, resolve } = require("node:path");
const { performance } = require("node:perf_hooks");

const { inspectBuildReceipt } = require("../../../scripts/build-receipt.cjs");
const {
  IMPLEMENTATION_BASE,
  PINNED_GP,
  PINNED_PARi_SOURCE_SHA256,
  ROOT,
  SCHEMA,
  acceptanceGates,
  bracketedPariRows,
  sha256,
  sourceIdentity,
  validateReceipt,
} = require("./contract.cjs");
const { collectEvidence } = require("./evidence.cjs");

const BENCHMARK = resolve(ROOT, "bench/hyperelliptic/benchmark-analytic-competitive.cjs");

function parseArguments(argv = process.argv.slice(2)) {
  const answer = {
    mode: "diagnostic",
    output: null,
    samples: null,
    precisionBits: 64,
    gp: process.env.PARI_GP || PINNED_GP,
    declaredHost: process.env.SAGEJS_BENCH_HOST || null,
    maximumLoad: 0.5,
    maximumWallSeconds: 1200,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--acceptance") answer.mode = "acceptance";
    else if (value === "--diagnostic") answer.mode = "diagnostic";
    else if (value === "--output") answer.output = resolve(argv[++index]);
    else if (value === "--samples") answer.samples = Number(argv[++index]);
    else if (value === "--precision") answer.precisionBits = Number(argv[++index]);
    else if (value === "--gp") answer.gp = resolve(argv[++index]);
    else if (value === "--declared-host") answer.declaredHost = argv[++index];
    else if (value === "--maximum-load") answer.maximumLoad = Number(argv[++index]);
    else if (value === "--maximum-wall-seconds") {
      answer.maximumWallSeconds = Number(argv[++index]);
    } else {
      throw new Error(`unknown argument ${value}`);
    }
  }
  if (answer.output === null) throw new Error("--output is required");
  if (answer.samples === null) answer.samples = answer.mode === "acceptance" ? 5 : 1;
  if (!Number.isInteger(answer.samples) || answer.samples < 1 || answer.samples > 20) {
    throw new Error("--samples must be an integer from 1 through 20");
  }
  if (answer.mode === "acceptance" && answer.samples < 5) {
    throw new Error("--acceptance requires at least five samples");
  }
  if (answer.precisionBits !== 64) {
    throw new Error("the Phase-9 acceptance contract is fixed at 64 bits");
  }
  if (!Number.isFinite(answer.maximumLoad) || answer.maximumLoad < 0) {
    throw new Error("--maximum-load must be a finite nonnegative number");
  }
  if (
    !Number.isFinite(answer.maximumWallSeconds) ||
    answer.maximumWallSeconds < 60 ||
    answer.maximumWallSeconds > 3600
  ) {
    throw new Error("--maximum-wall-seconds must be from 60 through 3600");
  }
  return answer;
}

function command(commandValue, args = [], options = {}) {
  return spawnSync(commandValue, args, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
    ...options,
  });
}

function checked(commandValue, args = [], options = {}) {
  const result = command(commandValue, args, options);
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${commandValue} ${args.join(" ")} failed (${result.status}):\n${result.stderr}\n${result.stdout}`,
    );
  }
  return result;
}

function shell(source) {
  const result = command("bash", ["-lc", source]);
  return {
    command: source,
    status: result.status,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
}

function hostSnapshot(declaredHost, maximumLoad) {
  const loads = loadavg();
  const commands = [
    shell("uptime"),
    shell("uname -a"),
    shell("lscpu"),
    shell("free -b"),
    shell("ps -eo pid,ppid,comm,%cpu,%mem,rss --sort=-%cpu | head -25"),
    shell(
      'for f in /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor; do test -r "$f" && printf "%s=" "$f" && cat "$f"; done',
    ),
  ];
  return {
    captured_at_utc: new Date().toISOString(),
    declared_host: declaredHost,
    hostname: hostname(),
    platform: platform(),
    release: release(),
    architecture: arch(),
    cpu: cpus()[0]?.model ?? null,
    logical_cpus: cpus().length,
    total_memory_bytes: totalmem(),
    free_memory_bytes: freemem(),
    node: process.version,
    load_average: loads,
    noise_policy: {
      maximum_one_minute_load: maximumLoad,
      observed_one_minute_load: loads[0],
      passed: loads[0] <= maximumLoad,
      manual_process_review_required: true,
    },
    commands,
    algorithm_environment: Object.fromEntries(
      Object.entries(process.env)
        .filter(([key]) => /^(OMP|OPENBLAS|MKL|FLINT|PARI|SAGEJS|NODE_OPTIONS)/u.test(key))
        .sort(),
    ),
  };
}

function git(...args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
}

function gpProvisioning(gp) {
  if (!existsSync(gp)) throw new Error(`the pinned GP executable is missing: ${gp}`);
  const versionOutput = checked(gp, ["--version"], { timeout: 30_000 }).stdout.trim();
  const match = /Version\s+([0-9.]+\s+\([^)]+\))/u.exec(versionOutput);
  const version = match?.[1] ?? versionOutput.split(/\r?\n/u)[0];
  return {
    version,
    version_output: versionOutput,
    executable: gp,
    executable_sha256: sha256(readFileSync(gp)),
    source_url: "https://pari.math.u-bordeaux.fr/pub/pari/testing/pari-2.18.1.alpha.tar.gz",
    source_sha256: PINNED_PARi_SOURCE_SHA256,
    configure: "--with-gmp --with-readline --graphic=none",
    host_tuned: false,
    threading: "resident single-thread GP",
  };
}

function parseJsonOutput(result, label) {
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${label} failed (${result.status}):\n${result.stderr}\n${result.stdout}`);
  }
  const text = result.stdout.trim();
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} emitted invalid JSON: ${error.message}\n${text.slice(0, 2000)}`);
  }
}

function runCompetitive({ gp, samples, precisionBits, pariOnly, timeout }) {
  const args = [
    BENCHMARK,
    `--samples=${samples}`,
    `--precision=${precisionBits}`,
    `--gp=${gp}`,
    "--lseries-only",
  ];
  if (pariOnly) args.push("--pari-only");
  return parseJsonOutput(
    command(process.execPath, args, {
      timeout,
      env: {
        ...process.env,
        OMP_NUM_THREADS: "1",
        OPENBLAS_NUM_THREADS: "1",
        MKL_NUM_THREADS: "1",
        PARI_MT_NTHREADS: "1",
      },
    }),
    pariOnly ? "PARI bracket" : "analytic competitive benchmark",
  );
}

function atomicWrite(filename, value) {
  mkdirSync(dirname(filename), { recursive: true });
  const temporary = `${filename}.tmp-${process.pid}`;
  try {
    writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
    renameSync(temporary, filename);
  } finally {
    rmSync(temporary, { force: true });
  }
}

async function run(options) {
  const started = performance.now();
  const sourceStatus = git("status", "--short");
  const sourceCommit = git("rev-parse", "HEAD");
  const implementationBaseIsAncestor =
    command("git", ["merge-base", "--is-ancestor", IMPLEMENTATION_BASE, sourceCommit]).status === 0;
  const buildInspection = inspectBuildReceipt(ROOT);
  if (sourceStatus !== "") throw new Error("acceptance harness requires a clean worktree");
  if (!implementationBaseIsAncestor) {
    throw new Error(`measured source does not descend from ${IMPLEMENTATION_BASE}`);
  }
  if (!buildInspection.current) {
    throw new Error(`pnpm build is required: ${buildInspection.reason}`);
  }
  const host = hostSnapshot(options.declaredHost, options.maximumLoad);
  if (options.mode === "acceptance") {
    if (options.declaredHost !== "bench-1") {
      throw new Error("set SAGEJS_BENCH_HOST=bench-1 or pass --declared-host bench-1");
    }
    if (host.platform !== "linux" || host.architecture !== "x64") {
      throw new Error("the primary Phase-9 acceptance host must be Linux x64");
    }
    if (host.node !== "v22.22.2") {
      throw new Error(`the acceptance Node version must be v22.22.2, not ${host.node}`);
    }
    if (!host.noise_policy.passed) {
      throw new Error(
        `bench-1 one-minute load ${host.load_average[0]} exceeds ${options.maximumLoad}`,
      );
    }
  }
  const provisioning = { pari: gpProvisioning(options.gp) };
  if (provisioning.pari.version !== "2.18.1 (alpha)") {
    throw new Error(`unexpected PARI version: ${provisioning.pari.version}`);
  }
  const timeout = options.maximumWallSeconds * 1000;
  const pariBefore = runCompetitive({
    gp: options.gp,
    samples: options.samples,
    precisionBits: options.precisionBits,
    pariOnly: true,
    timeout,
  });
  const competitive = runCompetitive({
    gp: options.gp,
    samples: options.samples,
    precisionBits: options.precisionBits,
    pariOnly: false,
    timeout,
  });
  const bracketedRows = bracketedPariRows([pariBefore, competitive]);
  const evidence = await collectEvidence({ precisionBits: options.precisionBits });
  const gates = acceptanceGates(
    competitive,
    bracketedRows,
    evidence,
    options.precisionBits,
  );
  const receipt = {
    schema: SCHEMA,
    mode: options.mode,
    recorded_at_utc: new Date().toISOString(),
    source: {
      commit: sourceCommit,
      status: sourceStatus,
      implementation_base_commit: IMPLEMENTATION_BASE,
      implementation_base_is_ancestor: implementationBaseIsAncestor,
      build_receipt_preflight: buildInspection,
      inputs: sourceIdentity(ROOT),
    },
    host,
    postflight: hostSnapshot(options.declaredHost, options.maximumLoad),
    provisioning,
    configuration: {
      samples: options.samples,
      precision_bits: options.precisionBits,
      lseries_only: true,
      maximum_wall_seconds: options.maximumWallSeconds,
      sagejs_threads: 1,
      pari_threads: 1,
      bounded_direct_arb_diagnostic_workers: [1, 4],
      family_workers: [1, 2],
    },
    timing_contract: {
      competitive_order: "resident PARI bracket, Sage.js then resident PARI",
      initialization:
        "100 true fresh isolated prefix-plan/LFunctionInit misses per sample; exact coefficients and one curve-independent universal table are warm",
      cache_hits:
        "same-LFunction and prefix-owned prepared hits are retained as separate non-gating rows",
      cold_table:
        "process/object-cold order-4 universal table construction is separate and never included in a cache-hit claim",
      derivatives:
        "orders 0 through 4 compare native universal weights with the ordinary inverse-Mellin route after exact coefficients are warm",
      numerical_status:
        "Arb arithmetic balls are rigorous; interpolation, contour truncation, and the outer analytic result remain explicitly nonrigorous and refinement-checked",
    },
    pari_bracket: {
      order: "PARI-Sage.js-PARI",
      resident_processes: 2,
      rows: bracketedRows,
    },
    competitive,
    evidence,
    gates,
    harness_wall_ms: Number((performance.now() - started).toFixed(3)),
  };
  receipt.validation = validateReceipt(receipt);
  atomicWrite(options.output, receipt);
  return receipt;
}

async function main() {
  const options = parseArguments();
  const receipt = await run(options);
  const relativeOutput = relative(ROOT, options.output) || options.output;
  process.stdout.write(
    `${receipt.validation.passed ? "PASS" : "FAIL"} ${receipt.schema} ` +
      `${receipt.mode} ${relativeOutput} ${receipt.harness_wall_ms}ms\n`,
  );
  if (options.mode === "acceptance" && !receipt.validation.passed) {
    for (const failure of receipt.validation.failures) process.stderr.write(`- ${failure}\n`);
    process.exitCode = 2;
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  atomicWrite,
  hostSnapshot,
  parseArguments,
  run,
  runCompetitive,
};
