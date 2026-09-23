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
const {
  buildNumericalRuntimeAdapters,
  installNumericalProduct,
  numericalRuntimeRequired,
  validateInstalledNumericalProduct,
} = require("./numerical-product.cjs");
const { inspectToolchain } = require(
  "../packages/wasm-toolchain/scripts/toolchain.cjs"
);

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
  ["Reconcile installed native addons and adapters", 20],
  ["Publish the production native-kernel pack", 30],
  ["Build the lazy cminpack and NLopt numerical reactors", 2],
];

function commandText(command, arguments_) {
  return [command, ...arguments_].join(" ");
}

function buildEnvironment(environment = process.env) {
  return { ...environment, SAGEJS_USE_SOURCE: "1" };
}

function run(command, arguments_) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, arguments_, {
      cwd: root,
      // Build scripts may invoke the public launcher indirectly. Keep those
      // descendants on this checkout instead of an installed native runtime.
      env: buildEnvironment(),
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

function sourceCliArguments(...args) {
  return [join(root, "bin", "sagejs-source.cjs"), ...args];
}

function compilerSummary(output) {
  const lines = nonemptyLines(output);
  const passes = lines.filter((line) => line.startsWith("Compiler built in"));
  const reachedFixedPoint = lines.includes(
    "Compiler is built with the up-to-date version of itself",
  );
  if (!reachedFixedPoint) {
    throw new Error(
      "self-hosted compiler did not report an up-to-date fixed point",
    );
  }
  if (passes.length === 0) {
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

function validateSelfHostedCompiler(
  createCompiler = require(join(dist, "tools", "compiler.js")).default,
) {
  if (typeof createCompiler !== "function") {
    throw new Error("self-hosted compiler wrapper omitted its factory");
  }
  const compiler = createCompiler();
  if (typeof compiler.get_compiler_version !== "function") {
    throw new Error("self-hosted compiler omitted get_compiler_version");
  }
  const version = compiler.get_compiler_version();
  if (typeof version !== "string" || version.length === 0) {
    throw new Error("self-hosted compiler has no version");
  }
  return version;
}

function ffiSummary(output) {
  const lines = nonemptyLines(output);
  const declarations = lines.filter((line) => line.endsWith(".ffi.json")).length;
  const generated = lines.length - declarations;
  return `Synchronized ${declarations} FFI declarations and ${generated} generated adapters.`;
}

function adapterSummary(output) {
  const lines = nonemptyLines(output);
  const current = lines.filter((line) =>
    /(?:addon|adapter) is current\.$/.test(line)
  ).length;
  const rebuilt = lines.filter((line) => /^(?:Built|Rebuilt) /.test(line)).length;
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

async function reconcileInstalledNative() {
  const flintAdapter = join(
    root,
    "packages",
    "flint",
    "build",
    "generated-ffi",
    "sagejs_flint_ffi.node",
  );
  const hadFlintAdapter = existsSync(flintAdapter);
  const addon = await run(process.execPath, [
    join(root, "packages", "flint", "scripts", "build-addon.cjs"),
    "--reconcile-installed",
  ]);
  const restoredFlintAdapter = hadFlintAdapter && !existsSync(flintAdapter)
    ? await run(process.execPath, [
        join(root, "scripts", "build-ffi-host-adapter.cjs"),
        "flint",
      ])
    : "";
  const adapters = await run(process.execPath, [
    join(root, "scripts", "build-ffi-host-adapter.cjs"),
    "--reconcile-installed",
  ]);
  return adapterSummary(`${addon}\n${restoredFlintAdapter}\n${adapters}`);
}

async function publishProductionNative() {
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
}

async function buildLazyNumericalReactors({
  environment = process.env,
  buildAdapters = buildNumericalRuntimeAdapters,
  inspect = () => inspectToolchain({ root }),
  install = installNumericalProduct,
  runCommand = run,
  validate = validateInstalledNumericalProduct,
} = {}) {
  const productRoot = environment.SAGEJS_NUMERICAL_PRODUCT_ROOT;
  if (productRoot) {
    const product = install({ root, inputDirectory: productRoot });
    return `Installed source-bound numerical product ${product.identity}.`;
  }
  const inspection = inspect();
  if (!inspection.ready) {
    if (numericalRuntimeRequired(environment)) {
      throw new Error(
        "the numerical runtime is required, but neither an authenticated product " +
          "nor a prepared reproducible Wasm toolchain is available",
      );
    }
    buildAdapters(root);
    return "Skipped optional numerical reactors: the reproducible Wasm toolchain is not prepared.";
  }
  const output = await runCommand(process.execPath, [
    join(root, "packages", "flint-wasm", "numerical", "scripts", "build-all.cjs"),
  ]);
  validate(root);
  return nonemptyLines(output).at(-1) ?? "Lazy numerical reactors built.";
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
        `[build] REUSE: successful build from ${status.completedAt}; artifact inputs ` +
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
    const optimizerDevelopmentOutput = join(
      dist,
      "tools",
      "optimizer-development",
    );
    mkdirSync(optimizerDevelopmentOutput, { recursive: true });
    for (const filename of ["common.cjs", "identity.cjs"]) {
      cpSync(
        join(root, "tools", "optimizer-development", filename),
        join(optimizerDevelopmentOutput, filename),
      );
    }
    return "TypeScript runtime compiled.";
  });

  await runStage(1, async () => {
    const output = await run(process.execPath, [
      join(root, "scripts", "build-vendor.cjs"),
    ]);
    return nonemptyLines(output).at(-1) ?? "Vendored frontends bundled.";
  });

  await runStage(2, async () => {
    // Build orchestration must use this checkout's source runtime. The public
    // launcher may dispatch to an installed native executable, which cannot
    // converge the compiler artifact in this workspace.
    const output = await run(
      process.execPath,
      sourceCliArguments("self", "--complete"),
    );
    validateSelfHostedCompiler();
    return compilerSummary(output);
  });

  // Declarations are authoritative. Generate their deterministic lowering before
  // module caches consume the safe Python wrappers, then reconcile every optional
  // host adapter that is already installed.
  await runStage(3, async () => {
    const ffi = await run(
      process.execPath,
      sourceCliArguments("ffi", "generate"),
    );
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
    return reconcileInstalledNative();
  });

  await runStage(6, async () => {
    return publishProductionNative();
  });

  await runStage(7, async () => {
    return buildLazyNumericalReactors();
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
  buildEnvironment,
  buildLazyNumericalReactors,
  compilerSummary,
  ffiSummary,
  kernelSummary,
  main,
  publishProductionNative,
  reconcileInstalledNative,
  sourceCliArguments,
  stages,
  validateSelfHostedCompiler,
};
