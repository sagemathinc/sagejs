#!/usr/bin/env node

"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { existsSync, readFileSync, writeFileSync } = require("node:fs");
const { arch, hostname, platform } = require("node:os");
const { join, resolve } = require("node:path");
const { performance } = require("node:perf_hooks");
const { spawnSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const { WASI } = require("node:wasi");

const root = resolve(
  process.env.SAGEJS_ROOT ?? resolve(__dirname, "..", "..", ".."),
);

function options(argv) {
  const answer = { expectedCommit: undefined, output: undefined, repeat: 5 };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--expected-commit") {
      answer.expectedCommit = argv[++index];
    } else if (argument === "--output") {
      answer.output = resolve(argv[++index]);
    } else if (argument === "--repeat") {
      answer.repeat = Number(argv[++index]);
    } else {
      throw new Error(`unknown argument ${argument}`);
    }
  }
  if (!answer.expectedCommit || !answer.output) {
    throw new Error("--expected-commit and --output are required");
  }
  if (!Number.isSafeInteger(answer.repeat) || answer.repeat <= 0) {
    throw new Error("--repeat must be a positive safe integer");
  }
  return answer;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function command(commandName, args, { timeout = 1_200_000 } = {}) {
  const started = performance.now();
  const result = spawnSync(commandName, args, {
    cwd: root,
    encoding: "utf8",
    env: process.env,
    maxBuffer: 64 * 1024 * 1024,
    timeout,
  });
  return {
    command: [commandName, ...args],
    elapsed_ms: performance.now() - started,
    exit_code: result.status,
    signal: result.signal,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error?.message ?? null,
  };
}

function requiredCommand(commandName, args, options) {
  const result = command(commandName, args, options);
  assert.equal(
    result.exit_code,
    0,
    `${result.command.join(" ")}\n${result.stdout}\n${result.stderr}`,
  );
  return result;
}

function git(...args) {
  return requiredCommand("git", ["-C", root, ...args], { timeout: 30_000 })
    .stdout.trim();
}

function statistics(samples) {
  const ordered = [...samples].sort((left, right) => left - right);
  const median = ordered[Math.floor(ordered.length / 2)];
  const deviations = ordered
    .map((value) => Math.abs(value - median))
    .sort((left, right) => left - right);
  return {
    count: ordered.length,
    min: ordered[0],
    median,
    max: ordered.at(-1),
    mad: deviations[Math.floor(deviations.length / 2)],
  };
}

function rollingDigest(values) {
  const mask = (1n << 64n) - 1n;
  let digest = 0n;
  for (const value of values) {
    digest = (digest * 1315423911n + BigInt(value)) & mask;
  }
  return digest.toString();
}

function exactArrayDigest(values) {
  return sha256(JSON.stringify(Array.from(values, (value) => value.toString())));
}

async function wasmReceipt(repeat) {
  const packageRoot = join(root, "packages", "flint-wasm");
  const manifestPath = join(packageRoot, "dist", "native-kernels", "index.json");
  if (!existsSync(manifestPath)) {
    return {
      status: "unavailable",
      reason: "authenticated production Wasm artifact was not installed",
    };
  }
  const manifestBytes = readFileSync(manifestPath);
  const manifest = JSON.parse(manifestBytes);
  const loaderUrl = pathToFileURL(
    join(packageRoot, "dist", "wasm-pack-loader.mjs"),
  ).href;
  const { instantiateWasmKernelPacks } = await import(loaderUrl);
  const loadStarted = performance.now();
  const runtime = await instantiateWasmKernelPacks({
    manifest,
    load(pack) {
      return readFileSync(
        join(packageRoot, "dist", "native-kernels", pack.asset),
      );
    },
    host() {
      const wasi = new WASI({ version: "preview1", returnOnExit: true });
      return {
        imports: { wasi_snapshot_preview1: wasi.wasiImport },
        initialize(instance) {
          wasi.initialize(instance);
        },
      };
    },
  });
  const loadMs = performance.now() - loadStarted;
  const add = runtime.function(
    "sagejs/hyperelliptic_curves/jacobian_kernels.py",
    "packed_cantor_add_batch",
  );
  const project = runtime.function(
    "sagejs/hyperelliptic_curves/jacobian_kummer_native.py",
    "genus2_kummer_project_batch",
  );
  for (const fn of [add, project]) {
    assert.equal(fn.nativeAvailable, true);
    assert.equal(fn.executionTarget, "wasm");
    assert.equal(fn.sourceTransparent, true);
  }

  const rows = [];
  for (const genus of [2, 3]) {
    const count = 1000;
    const model = new BigUint64Array(12);
    model[0] = 1n;
    model[1] = genus === 2 ? 1n : 2n;
    model[genus === 2 ? 5 : 7] = 1n;
    const identity = [1n, 0n, 1n, 0n, 0n, 1n, 0n, 0n];
    const rightRow =
      genus === 2
        ? [1n, 1008n, 1n, 0n, 0n, 149n, 0n, 0n]
        : [1n, 1008n, 1n, 0n, 0n, 1007n, 0n, 0n];
    const left = new BigUint64Array(count * 8);
    const right = new BigUint64Array(count * 8);
    for (let index = 0; index < count; index += 1) {
      left.set(identity, index * 8);
      right.set(rightRow, index * 8);
    }
    const output = new BigUint64Array(count * 8);
    const statuses = new BigUint64Array(count);
    const invoke = () => {
      assert.equal(
        add(
          output,
          statuses,
          model,
          left,
          right,
          BigInt(count),
          BigInt(genus),
          1009n,
        ),
        true,
      );
    };
    for (let warmup = 0; warmup < 10; warmup += 1) invoke();
    const samples = [];
    for (let sample = 0; sample < repeat; sample += 1) {
      const started = performance.now();
      invoke();
      samples.push(performance.now() - started);
    }
    rows.push({
      genus,
      items: count,
      wall_ms: statistics(samples),
      exact_sha256: exactArrayDigest(output),
      status_sha256: exactArrayDigest(statuses),
      standalone_rolling_digest: rollingDigest(output),
    });
  }

  const projectCount = 4096;
  const projectInput = new BigUint64Array(projectCount * 8);
  const projectRow = [1n, 0n, 1n, 0n, 0n, 1n, 0n, 0n];
  for (let index = 0; index < projectCount; index += 1) {
    projectInput.set(projectRow, index * 8);
  }
  const projectOutput = new BigUint64Array(projectCount * 4);
  const projectStatuses = new BigUint64Array(projectCount);
  const f = new BigUint64Array([1n, 1n, 0n, 0n, 0n, 1n, 0n, 0n]);
  const h = new BigUint64Array(4);
  const invokeProject = () => {
    assert.equal(
      project(
        projectOutput,
        projectStatuses,
        projectInput,
        f,
        h,
        BigInt(projectCount),
        19n,
      ),
      true,
    );
  };
  for (let warmup = 0; warmup < 10; warmup += 1) invokeProject();
  const projectSamples = [];
  for (let sample = 0; sample < repeat; sample += 1) {
    const started = performance.now();
    invokeProject();
    projectSamples.push(performance.now() - started);
  }

  const shortOutput = new BigUint64Array(8).fill(99n);
  let boundsError = null;
  let boundsResult;
  try {
    boundsResult = add(
      shortOutput,
      new BigUint64Array(2),
      new BigUint64Array(12),
      new BigUint64Array(16),
      new BigUint64Array(16),
      2n,
      2n,
      3n,
    );
  } catch (error) {
    boundsError = { name: error.name, message: error.message };
  }
  assert.equal(boundsResult, false);
  assert.deepEqual(Array.from(shortOutput), Array(8).fill(99n));

  const cli = join(packageRoot, "node-cli.mjs");
  const verify = requiredCommand(process.execPath, [cli, "--verify-only"], {
    timeout: 120_000,
  });
  const timedOut = command(
    process.execPath,
    [cli, "--timeout", "100", "-c", "while True: pass"],
    { timeout: 120_000 },
  );
  assert.notEqual(
    timedOut.exit_code,
    0,
    "Wasm cancellation unexpectedly succeeded",
  );
  const recovery = requiredCommand(
    process.execPath,
    [cli, "--timeout", "120000", "-c", "print(6*7)"],
    { timeout: 180_000 },
  );
  assert.equal(recovery.stdout.trim(), "42");
  const productionTest = command(
    process.execPath,
    [
      "--test",
      join(packageRoot, "test", "hyperelliptic-production-kernels.test.mjs"),
    ],
    { timeout: 300_000 },
  );

  return {
    status: "available",
    manifest_sha256: sha256(manifestBytes),
    artifact_id: manifest.artifactId ?? null,
    pack_count: manifest.kernels.length,
    load_ms: loadMs,
    process_rss_bytes: process.memoryUsage().rss,
    cantor: rows,
    kummer_project: {
      items: projectCount,
      wall_ms: statistics(projectSamples),
      exact_sha256: exactArrayDigest(projectOutput),
      status_sha256: exactArrayDigest(projectStatuses),
    },
    resource_bounds: {
      result: boundsResult,
      error: boundsError,
      short_output_unchanged: true,
    },
    package_verification: {
      elapsed_ms: verify.elapsed_ms,
      stdout_sha256: sha256(verify.stdout),
      stderr: verify.stderr.trim(),
    },
    cancellation: {
      elapsed_ms: timedOut.elapsed_ms,
      exit_code: timedOut.exit_code,
      signal: timedOut.signal,
      stdout: timedOut.stdout.trim(),
      stderr: timedOut.stderr.trim(),
      recovery_elapsed_ms: recovery.elapsed_ms,
      recovery_stdout: recovery.stdout.trim(),
    },
    package_load_test: {
      status: productionTest.exit_code === 0 ? "passed" : "failed",
      exit_code: productionTest.exit_code,
      signal: productionTest.signal,
      error: productionTest.error,
      elapsed_ms: productionTest.elapsed_ms,
      stdout_sha256: sha256(productionTest.stdout),
      stdout: productionTest.stdout.trim(),
      stderr: productionTest.stderr.trim(),
    },
  };
}

function standaloneReceipt() {
  if (platform() === "win32") {
    return {
      status: "unavailable",
      reason:
        "the checked-in standalone harness currently has a POSIX static-archive linker contract; Windows native kernels remain covered separately",
    };
  }
  if (platform() === "darwin") {
    return {
      status: "unavailable",
      reason:
        "the checked-in standalone harness emits GNU/ELF --gc-sections and --exclude-libs linker flags rejected by native Mach-O ld; macOS native kernels remain covered separately",
    };
  }
  const result = requiredCommand(
    process.execPath,
    [join(root, "bench", "hyperelliptic", "benchmark-public-jacobian.cjs")],
    { timeout: 1_800_000 },
  );
  const value = JSON.parse(result.stdout.trim().split("\n").at(-1));
  return {
    status: "available",
    elapsed_ms: result.elapsed_ms,
    stdout_sha256: sha256(result.stdout),
    value,
  };
}

async function main() {
  const config = options(process.argv.slice(2));
  const commit = git("rev-parse", "HEAD");
  assert.equal(commit, git("rev-parse", `${config.expectedCommit}^{commit}`));
  const status = git("status", "--short");
  assert.equal(status, "", `source checkout is dirty:\n${status}`);
  const started = new Date().toISOString();
  const receipt = {
    schema: "sagejs.hyperelliptic-phase10-portable-extras.v1",
    started_at: started,
    repository: {
      commit,
      status,
      harness_sha256: sha256(readFileSync(__filename)),
    },
    host: {
      hostname: hostname(),
      platform: platform(),
      architecture: arch(),
      node: process.version,
    },
    configuration: { repeat: config.repeat },
    standalone: standaloneReceipt(),
    wasm: await wasmReceipt(config.repeat),
    finished_at: new Date().toISOString(),
  };
  if (
    receipt.standalone.status === "available" &&
    receipt.wasm.status === "available"
  ) {
    for (const row of receipt.wasm.cantor) {
      const standalone = receipt.standalone.value.standalone.rows.find(
        (candidate) => candidate.genus === row.genus,
      );
      assert(standalone, `missing genus-${row.genus} standalone row`);
      assert.equal(row.standalone_rolling_digest, standalone.digest);
      row.wasm_to_standalone_ratio =
        row.wall_ms.median / (standalone.standalone_core_median_ns / 1e6);
    }
  }
  writeFileSync(config.output, `${JSON.stringify(receipt, null, 2)}\n`);
  process.stdout.write(`${config.output}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});
