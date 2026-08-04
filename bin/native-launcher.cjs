"use strict";

const { spawn } = require("node:child_process");
const { existsSync, realpathSync } = require("node:fs");
const { basename, dirname, join } = require("node:path");

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

function findNativeExecutable(options = {}) {
  const packageName = nativePackageFor(options.platform, options.arch);
  if (!packageName) return undefined;
  const resolve = options.resolve || require.resolve;
  const exists = options.exists || existsSync;
  const realpath = options.realpath || realpathSync;
  try {
    const packageJson = resolve(`${packageName}/package.json`);
    const executable = join(
      realpath(dirname(packageJson)),
      "bin",
      `${options.executable || requestedExecutable()}${
        (options.platform || process.platform) === "win32" ? ".exe" : ""
      }`,
    );
    return exists(executable) ? executable : undefined;
  } catch (_error) {
    return undefined;
  }
}

function launchNativeIfInstalled() {
  if (process.env.SAGEJS_USE_SOURCE === "1") return false;
  const executable = findNativeExecutable();
  if (!executable) return false;

  const child = spawn(executable, process.argv.slice(2), {
    stdio: "inherit",
    env: process.env,
  });
  child.on("error", (error) => {
    console.error(`Unable to launch ${executable}: ${error.message}`);
    process.exitCode = 1;
  });
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(signal, () => {
      if (!child.killed) child.kill(signal);
    });
  }
  child.on("exit", (code, signal) => {
    if (signal && process.platform !== "win32") {
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
  launchNativeIfInstalled,
  nativePackageFor,
  requestedExecutable,
};
