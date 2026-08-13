"use strict";

const { existsSync } = require("node:fs");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

const defaultMacosDeploymentTarget = "13.0";

function macosDeploymentTarget(environment = process.env) {
  const value = environment.MACOSX_DEPLOYMENT_TARGET ||
    defaultMacosDeploymentTarget;
  if (!/^[0-9]+(?:\.[0-9]+){1,2}$/.test(value)) {
    throw new Error(
      `MACOSX_DEPLOYMENT_TARGET must be a macOS version, got ${JSON.stringify(value)}`,
    );
  }
  return value;
}

function macosSdkPath() {
  const result = spawnSync(
    "xcrun",
    ["--sdk", "macosx", "--show-sdk-path"],
    { encoding: "utf8" },
  );
  if (result.error || result.status !== 0) {
    throw new Error(
      "unable to locate the macOS SDK: " +
        (result.error?.message || result.stderr?.trim() || result.status),
    );
  }
  return result.stdout.trim();
}

function firstExisting(candidates, description) {
  const path = candidates.find((candidate) => existsSync(candidate));
  if (path === undefined) {
    throw new Error(`${description} is unavailable in the active macOS SDK`);
  }
  return path;
}

function appleAccelerateSdkInputs() {
  const sdk = macosSdkPath();
  const framework = join(
    sdk,
    "System",
    "Library",
    "Frameworks",
    "Accelerate.framework",
  );
  return Object.freeze({
    sdk,
    stub: firstExisting([
      join(framework, "Accelerate.tbd"),
      join(framework, "Versions", "A", "Accelerate.tbd"),
    ], "Apple Accelerate linker stub"),
    cblasHeader: firstExisting([
      join(
        framework,
        "Versions",
        "A",
        "Frameworks",
        "vecLib.framework",
        "Versions",
        "A",
        "Headers",
        "cblas.h",
      ),
    ], "Apple Accelerate CBLAS header"),
  });
}

function fflasMathBuildProfile(profile, platform = process.platform) {
  if (platform !== "darwin") return profile;
  const selected = structuredClone(profile);
  delete selected.dependencies?.openblas;
  delete selected.buildOptions?.openblas;
  return selected;
}

function main(arguments_ = process.argv.slice(2)) {
  if (
    arguments_.length !== 1 ||
    arguments_[0] !== "--deployment-target"
  ) {
    throw new Error("usage: node scripts/darwin-native.cjs --deployment-target");
  }
  process.stdout.write(`${macosDeploymentTarget()}\n`);
}

if (require.main === module) main();

module.exports = {
  appleAccelerateSdkInputs,
  defaultMacosDeploymentTarget,
  fflasMathBuildProfile,
  macosDeploymentTarget,
  main,
};
