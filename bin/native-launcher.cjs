"use strict";

const { spawn } = require("node:child_process");
const { existsSync, realpathSync } = require("node:fs");
const { basename, dirname, join, parse, resolve, sep } = require("node:path");

const PLATFORM_PACKAGES = Object.freeze({
  "linux-x64": "@sagemath/sagejs-linux-x64",
  "linux-arm64": "@sagemath/sagejs-linux-arm64",
  "darwin-arm64": "@sagemath/sagejs-darwin-arm64",
  "win32-x64": "@sagemath/sagejs-win32-x64",
});

function nativePackageFor(platform = process.platform, arch = process.arch) {
  return PLATFORM_PACKAGES[`${platform}-${arch}`];
}

function requestedExecutable() {
  const requested = process.env.SAGEJS_EXECUTABLE_NAME || basename(process.argv[1]);
  return requested.toLowerCase().startsWith("sagepython")
    ? "sagepython"
    : "sagejs";
}

function isPublishedInstallation(packageRoot = resolve(__dirname, "..")) {
  const { root } = parse(packageRoot);
  return resolve(packageRoot)
    .slice(root.length)
    .split(sep)
    .includes("node_modules");
}

function inspectNativeExecutable(options = {}) {
  const packageName = nativePackageFor(options.platform, options.arch);
  if (!packageName) return { status: "unsupported" };
  const resolve = options.resolve || require.resolve;
  const exists = options.exists || existsSync;
  const realpath = options.realpath || realpathSync;
  let packageJson;
  try {
    packageJson = resolve(`${packageName}/package.json`);
  } catch (error) {
    return { status: "missing-package", packageName, error };
  }
  const executable = join(
    realpath(dirname(packageJson)),
    "bin",
    `${options.executable || requestedExecutable()}${
      (options.platform || process.platform) === "win32" ? ".exe" : ""
    }`,
  );
  return exists(executable)
    ? { status: "available", packageName, executable }
    : { status: "missing-executable", packageName, executable };
}

function findNativeExecutable(options = {}) {
  const result = inspectNativeExecutable(options);
  return result.status === "available" ? result.executable : undefined;
}

function missingNativeMessage(result, options = {}) {
  const platform = options.platform || process.platform;
  const arch = options.arch || process.arch;
  const detail = result.status === "missing-package"
    ? `package ${result.packageName} is not installed`
    : `package ${result.packageName} is incomplete; missing ${result.executable}`;
  return (
    `Sage.js cannot start its native ${platform}/${arch} runtime: ${detail}.\n` +
    "Reinstall @sagemath/sagejs with optional dependencies enabled. " +
    `You may also install ${result.packageName} explicitly.\n` +
    "Developers running a source checkout may set SAGEJS_USE_SOURCE=1."
  );
}

function launchNativeIfInstalled(options = {}) {
  if (process.env.SAGEJS_USE_SOURCE === "1") return false;
  const result = inspectNativeExecutable(options);
  if (result.status === "unsupported") return false;
  if (result.status !== "available") {
    if (!(options.published ?? isPublishedInstallation())) return false;
    console.error(missingNativeMessage(result, options));
    process.exitCode = 1;
    return true;
  }
  const { executable, packageName } = result;

  const child = spawn(executable, process.argv.slice(2), {
    stdio: "inherit",
    env: process.env,
  });
  child.on("error", (error) => {
    console.error(
      `Unable to launch ${executable}: ${error.message}\n` +
        `Reinstall @sagemath/sagejs or ${packageName}.`,
    );
    process.exitCode = 1;
  });
  const signalHandlers = new Map();
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    const handler = () => {
      if (!child.killed) child.kill(signal);
    };
    signalHandlers.set(signal, handler);
    process.on(signal, handler);
  }
  child.on("exit", (code, signal) => {
    if (signal && process.platform !== "win32") {
      for (const [name, handler] of signalHandlers) {
        process.removeListener(name, handler);
      }
      process.kill(process.pid, signal);
      return;
    }
    process.exitCode = code ?? 1;
  });
  return true;
}

module.exports = {
  PLATFORM_PACKAGES,
  findNativeExecutable,
  inspectNativeExecutable,
  isPublishedInstallation,
  launchNativeIfInstalled,
  missingNativeMessage,
  nativePackageFor,
  requestedExecutable,
};
