"use strict";

const { cpSync, existsSync, mkdirSync, rmSync } = require("node:fs");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = join(__dirname, "..");
const dist = join(root, "dist");

function parseArguments(input) {
  const arguments_ = new Set(input);
  arguments_.delete("--");
  const withoutProductionNativeKernels = arguments_.delete(
    "--without-production-native-kernels",
  );
  if (arguments_.size !== 0) {
    throw new Error(`unknown build option: ${[...arguments_].join(", ")}`);
  }
  return { withoutProductionNativeKernels };
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `Build step failed (status=${result.status ?? "none"}, signal=${result.signal ?? "none"}): ` +
        `${command} ${args.join(" ")}`,
    );
  }
}

function main(inputArguments = process.argv.slice(2)) {
  const { withoutProductionNativeKernels } = parseArguments(inputArguments);

  rmSync(dist, { recursive: true, force: true });
  mkdirSync(join(dist, "compiler"), { recursive: true });
  cpSync(join(root, "bootstrap"), join(dist, "compiler"), { recursive: true });

  run(process.execPath, [
    join(root, "node_modules", "typescript", "bin", "tsc"),
    "--project",
    join(root, "tsconfig.json"),
  ]);
  cpSync(
    join(root, "tools", "kernel.d.ts"),
    join(dist, "tools", "kernel.d.ts"),
  );
  run(process.execPath, [join(root, "scripts", "build-vendor.cjs")]);
  run(process.execPath, [join(root, "bin", "sagejs"), "self", "--complete"]);
  // Declarations are authoritative. Generate their deterministic lowering before
  // module caches consume the safe Python wrappers, then reconcile every optional
  // host adapter that is already installed. Reconciliation resolves the native
  // content key but neither provisions an absent foreign library nor republishes
  // a matching warm artifact.
  run(process.execPath, [join(root, "bin", "sagejs"), "ffi", "generate"]);
  run(process.execPath, [join(root, "scripts", "build-task-runtime.cjs")]);
  run(process.execPath, [join(root, "scripts", "build-module-cache.cjs")]);
  run(process.execPath, [join(root, "scripts", "build-runtime-cache.cjs")]);
  run(process.execPath, [
    join(root, "scripts", "build-ffi-host-adapter.cjs"),
    "--reconcile-installed",
  ]);

  const generatedFlintAdapter = join(
    root,
    "packages",
    "flint",
    "build",
    "generated-ffi",
    "sagejs_flint_ffi.node",
  );
  const generatedFflasAdapter = join(
    root,
    "packages",
    "fflas",
    "build",
    "generated-ffi",
    "sagejs_fflas_ffi.node",
  );
  if (withoutProductionNativeKernels) {
    process.stdout.write(
      "Deferred production native kernels until all native providers are built.\n",
    );
  } else if (
    existsSync(generatedFlintAdapter) &&
    existsSync(generatedFflasAdapter)
  ) {
    run(process.execPath, [
      join(root, "scripts", "build-production-native-kernels.cjs"),
    ]);
  } else {
    process.stdout.write(
      "Skipping production native kernels because the generated FLINT and " +
        "FFLAS adapters are not both available; run `pnpm bootstrap` for a " +
        "complete native runtime.\n",
    );
  }
}

module.exports = { parseArguments };

if (require.main === module) {
  main();
}
