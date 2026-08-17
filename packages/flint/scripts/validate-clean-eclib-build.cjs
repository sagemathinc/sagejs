#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const { existsSync } = require("node:fs");
const { join, resolve } = require("node:path");

const packageRoot = resolve(__dirname, "..");
const nativeRoot = join(packageRoot, ".native");
const addonBuild = join(packageRoot, "build");
const addon = join(addonBuild, "Release", "sagejs_flint.node");

function run(command, arguments_, options = {}) {
  process.stdout.write(`+ ${command} ${arguments_.join(" ")}\n`);
  const result = spawnSync(command, arguments_, {
    cwd: options.cwd || packageRoot,
    encoding: options.capture ? "utf8" : undefined,
    env: options.env || process.env,
    stdio: options.capture ? "pipe" : "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (options.capture) {
      process.stderr.write(result.stdout || "");
      process.stderr.write(result.stderr || "");
    }
    throw new Error(`${command} exited with status ${result.status}`);
  }
  return options.capture ? `${result.stdout || ""}${result.stderr || ""}` : "";
}

function findWindowsInspector() {
  for (const candidate of ["dumpbin.exe", "llvm-readobj.exe"]) {
    const found = spawnSync("where.exe", [candidate], { encoding: "utf8" });
    if (found.status === 0) return candidate;
  }
  throw new Error("dumpbin.exe or llvm-readobj.exe is required to inspect imports");
}

function importedLibraries() {
  if (process.platform === "linux") return run("ldd", [addon], { capture: true });
  if (process.platform === "darwin") {
    return run("otool", ["-L", addon], { capture: true });
  }
  if (process.platform === "win32") {
    const inspector = findWindowsInspector();
    return inspector === "dumpbin.exe"
      ? run(inspector, ["/dependents", addon], { capture: true })
      : run(inspector, ["--coff-imports", addon], { capture: true });
  }
  throw new Error(`unsupported clean-build platform ${process.platform}`);
}

function main() {
  if (existsSync(nativeRoot) || existsSync(addonBuild)) {
    throw new Error(
      "clean validation requires a fresh worktree with no packages/flint/.native " +
      "or packages/flint/build directory",
    );
  }
  for (const name of ["SAGEJS_FLINT_PREFIX", "VCPKG_ROOT"]) {
    if (process.env[name]) {
      throw new Error(`${name} must be unset for cache-independent validation`);
    }
  }

  const environment = {
    ...process.env,
    SAGEJS_NATIVE_PREBUILT: "0",
    // vcpkg otherwise restores user-level binary archives even when its
    // managed checkout and install prefix are both brand new.
    VCPKG_BINARY_SOURCES: "clear",
  };
  run(process.execPath, [join(__dirname, "build.cjs")], { env: environment });
  run(process.execPath, ["--test", "test/eclib-rank.cjs"], {
    env: environment,
  });

  const imports = importedLibraries();
  process.stdout.write(imports);
  if (/(?:^|[\\/\s])(?:lib)?(?:pari|ntl)(?:[.\\/\s-]|$)/im.test(imports)) {
    throw new Error("the clean addon unexpectedly imports PARI or NTL");
  }
  process.stdout.write(
    `Clean eclib build validated on ${process.platform}/${process.arch}\n`,
  );
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
}
