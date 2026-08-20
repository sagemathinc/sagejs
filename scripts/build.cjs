#!/usr/bin/env node
"use strict";

const { spawn } = require("node:child_process");
const { cpSync, existsSync, mkdirSync, rmSync } = require("node:fs");
const { join } = require("node:path");

const {
  inspectBuildReceipt,
  receiptRelativePath,
  writeBuildReceipt,
} = require("./build-receipt.cjs");
const { formatDuration } = require("./run-test-tier.cjs");

const root = join(__dirname, "..");
const dist = join(root, "dist");
const verbose =
  process.argv.includes("--verbose") ||
  process.env.SAGEJS_BUILD_VERBOSE === "1";
const ifNeeded = process.argv.includes("--if-needed");
const heartbeatMilliseconds =
  Number(process.env.SAGEJS_BUILD_HEARTBEAT_SECONDS || 15) * 1000;

const stages = [
  ["Compile the TypeScript runtime", 15],
  ["Bundle vendored language frontends", 5],
  ["Converge the self-hosted compiler", 55],
  ["Generate FFI and task-runtime boundaries", 10],
  ["Precompile Python modules and Node runtimes", 190],
  ["Reconcile installed native adapters", 15],
  ["Publish the production native-kernel pack", 30],
];

function commandText(command, arguments_) {
  return [command, ...arguments_].join(" ");
}

function run(command, arguments_) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, arguments_, {
      cwd: root,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const chunks = [];
    const collect = (stream, data) => {
      chunks.push({ stream, data: Buffer.from(data) });
      if (verbose) {
        (stream === "stderr" ? process.stderr : process.stdout).write(data);
      }
    };
    child.stdout.on("data", (data) => collect("stdout", data));
    child.stderr.on("data", (data) => collect("stderr", data));
    child.once("error", rejectPromise);
    child.once("exit", (status, signal) => {
      const output = chunks.map(({ data }) => data.toString("utf8")).join("");
      if ((status ?? 1) !== 0) {
        if (!verbose) {
          process.stderr.write("[build] detailed output from failed command:\n");
          for (const { stream, data } of chunks) {
            (stream === "stderr" ? process.stderr : process.stdout).write(data);
          }
        }
        rejectPromise(
          new Error(
            `Build command failed (status=${status ?? "none"}, signal=${signal ?? "none"}): ` +
              commandText(command, arguments_),
          ),
        );
        return;
      }
      resolvePromise(output);
    });
  });
}

function nonemptyLines(output) {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function compilerSummary(output) {
  const lines = nonemptyLines(output);
  const passes = lines.filter((line) => line.startsWith("Compiler built in"));
  if (
    passes.length === 0 &&
    lines.some((line) => line.includes("up-to-date version"))
  ) {
    return "Self-hosted compiler was already converged.";
  }
  const timings = passes
    .map((line) => line.match(/([0-9.]+) seconds/)?.[1])
    .filter(Boolean)
    .map((value) => `${value}s`)
    .join(" + ");
  return (
    `Self-hosted compiler converged in ${passes.length} pass${passes.length === 1 ? "" : "es"}` +
    `${timings ? ` (${timings})` : ""}.`
  );
}

function ffiSummary(output) {
  const lines = nonemptyLines(output);
  const declarations = lines.filter((line) => line.endsWith(".ffi.json")).length;
  const generated = lines.length - declarations;
  return `Synchronized ${declarations} FFI declarations and ${generated} generated adapters.`;
}

function adapterSummary(output) {
  const lines = nonemptyLines(output);
  const current = lines.filter((line) => /adapter is current\.$/.test(line)).length;
  const rebuilt = lines.filter((line) => line.startsWith("Built ")).length;
  const absent = lines.filter((line) => line.startsWith("Skipped ")).length;
  return `Native adapters: ${current} current, ${rebuilt} rebuilt, ${absent} optional/absent.`;
}

function kernelSummary(output) {
  const lines = nonemptyLines(output);
  const reused = lines.filter((line) => line.startsWith("cached ")).length;
  const built = lines.filter((line) => line.startsWith("built ")).length;
  const published = lines.find((line) => line.startsWith("Published "));
  return (
    `${reused + built} kernel families: ${reused} reused, ${built} rebuilt. ` +
    (published ?? "Production native pack published.")
  );
}

async function runStage(index, action) {
  const [label, expectedSeconds] = stages[index];
  const started = Date.now();
  process.stdout.write(
    `\n[build] [${index + 1}/${stages.length}] ${label} ` +
      `(expected about ${formatDuration(expectedSeconds * 1000)})\n`,
  );
  const heartbeat = setInterval(() => {
    process.stdout.write(
      `[build] still running ${index + 1}/${stages.length} (${label}); ` +
        `${formatDuration(Date.now() - started)} in this stage\n`,
    );
  }, heartbeatMilliseconds);
  heartbeat.unref();
  try {
    const summary = await action();
    const later = stages
      .slice(index + 1)
      .reduce((sum, stage) => sum + stage[1], 0);
    if (summary) process.stdout.write(`[build] ${summary}\n`);
    process.stdout.write(
      `[build] PASS ${index + 1}/${stages.length}: ${label} ` +
        `(${formatDuration(Date.now() - started)}); approximately ` +
        `${formatDuration(later * 1000)} remaining\n`,
    );
  } finally {
    clearInterval(heartbeat);
  }
}

async function main() {
  if (ifNeeded) {
    const status = inspectBuildReceipt(root);
    if (status.current) {
      process.stdout.write(
        `[build] REUSE: successful build from ${status.completedAt}; exact inputs ` +
          `and required outputs still match.\n`,
      );
      return 0;
    }
    process.stdout.write(`[build] REBUILD: ${status.reason}.\n`);
  }

  const started = Date.now();
  const expectedMilliseconds =
    stages.reduce((sum, stage) => sum + stage[1], 0) * 1000;
  process.stdout.write(
    `\nSage.js build\n` +
      `  stages:   ${stages.length}\n` +
      `  expected: about ${formatDuration(expectedMilliseconds)} on a warm Linux developer build\n` +
      `  output:   one progress summary per stage; use SAGEJS_BUILD_VERBOSE=1 for child logs\n` +
      `  compiler: source changes can require two self-hosting passes to reach a fixed point\n`,
  );

  rmSync(dist, { recursive: true, force: true });
  mkdirSync(join(dist, "compiler"), { recursive: true });
  cpSync(join(root, "bootstrap"), join(dist, "compiler"), { recursive: true });

  await runStage(0, async () => {
    await run(process.execPath, [
      join(root, "node_modules", "typescript", "bin", "tsc"),
      "--project",
      join(root, "tsconfig.json"),
    ]);
    cpSync(
      join(root, "tools", "kernel.d.ts"),
      join(dist, "tools", "kernel.d.ts"),
    );
    return "TypeScript runtime compiled.";
  });

  await runStage(1, async () => {
    const output = await run(process.execPath, [
      join(root, "scripts", "build-vendor.cjs"),
    ]);
    return nonemptyLines(output).at(-1) ?? "Vendored frontends bundled.";
  });

  await runStage(2, async () => {
    const output = await run(process.execPath, [
      join(root, "bin", "sagejs"),
      "self",
      "--complete",
    ]);
    return compilerSummary(output);
  });

  // Declarations are authoritative. Generate their deterministic lowering before
  // module caches consume the safe Python wrappers, then reconcile every optional
  // host adapter that is already installed.
  await runStage(3, async () => {
    const ffi = await run(process.execPath, [
      join(root, "bin", "sagejs"),
      "ffi",
      "generate",
    ]);
    const task = await run(process.execPath, [
      join(root, "scripts", "build-task-runtime.cjs"),
    ]);
    return `${ffiSummary(ffi)} ${nonemptyLines(task).at(-1) ?? "Task runtime built."}`;
  });

  await runStage(4, async () => {
    const modules = await run(process.execPath, [
      join(root, "scripts", "build-module-cache.cjs"),
    ]);
    const runtimes = await run(process.execPath, [
      join(root, "scripts", "build-runtime-cache.cjs"),
    ]);
    return [...nonemptyLines(modules), ...nonemptyLines(runtimes)].join(" ");
  });

  await runStage(5, async () => {
    const output = await run(process.execPath, [
      join(root, "scripts", "build-ffi-host-adapter.cjs"),
      "--reconcile-installed",
    ]);
    return adapterSummary(output);
  });

  await runStage(6, async () => {
    const generatedFlintAdapter = join(
      root,
      "packages",
      "flint",
      "build",
      "generated-ffi",
      "sagejs_flint_ffi.node",
    );
    if (existsSync(generatedFlintAdapter)) {
      const output = await run(process.execPath, [
        join(root, "scripts", "build-production-native-kernels.cjs"),
      ]);
      return kernelSummary(output);
    }
    return "Skipped production kernels: the optional generated FLINT adapter is absent.";
  });

  writeBuildReceipt({ root, durationMilliseconds: Date.now() - started });
  process.stdout.write(
    `\n[build] PASS: complete in ${formatDuration(Date.now() - started)}; ` +
      `wrote ${receiptRelativePath} for safe reuse by pnpm test.\n`,
  );
  return 0;
}

if (require.main === module) {
  main().then(
    (status) => {
      process.exitCode = status;
    },
    (error) => {
      process.stderr.write(`[build] FAILED: ${error.stack || error}\n`);
      process.exitCode = 1;
    },
  );
}

module.exports = {
  adapterSummary,
  compilerSummary,
  ffiSummary,
  kernelSummary,
  main,
  stages,
};
