#!/usr/bin/env node
"use strict";

const { createHash } = require("node:crypto");
const { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } = require("node:fs");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const { buildSync } = require("esbuild");

const packageRoot = resolve(__dirname, "..");
const repositoryRoot = resolve(packageRoot, "../../..");
const nloptRoot = join(
  repositoryRoot,
  "src/lib/sagejs/numerics/optimization/backends/nlopt",
);
const nodeRuntimeDirectory = join(repositoryRoot, "dist/numerical");
const browserRuntimeDirectory = join(repositoryRoot, "packages/flint-wasm/dist");
const { inspectToolchain } = require(
  join(repositoryRoot, "packages/wasm-toolchain/scripts/toolchain.cjs"),
);
const { toolchainDigest } = require(
  join(repositoryRoot, "packages/wasm-toolchain/scripts/toolchain.cjs"),
);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map(
      (key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`,
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

function run(script, environment = process.env) {
  const result = spawnSync(process.execPath, [script], {
    cwd: repositoryRoot,
    env: environment,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${script} exited with ${result.status}`);
  }
}

const inspection = inspectToolchain({ root: repositoryRoot });
if (!inspection.ready) {
  for (const filename of [
    join(nodeRuntimeDirectory, "backend.cjs"),
    join(nodeRuntimeDirectory, "cminpack.wasm"),
    join(nodeRuntimeDirectory, "nlopt-backend.cjs"),
    join(nodeRuntimeDirectory, "nlopt-methods.wasm"),
    join(browserRuntimeDirectory, "numerical-backend.mjs"),
    join(browserRuntimeDirectory, "cminpack.wasm"),
    join(browserRuntimeDirectory, "nlopt-backend.mjs"),
    join(browserRuntimeDirectory, "nlopt-methods.wasm"),
  ]) rmSync(filename, { force: true });
  process.stdout.write(
    "Skipped optional numerical Wasm reactors: the pinned toolchain is not prepared.\n",
  );
  process.exit(0);
}

const canonicalIdentity = toolchainDigest(
  inspection.lock,
  undefined,
  inspection.lock.canonicalBuilder,
);
const cminpackEnvironment = inspection.platform === inspection.lock.canonicalBuilder
  ? process.env
  : { ...process.env, SAGEJS_NUMERICAL_CANDIDATE_BUILD: "1" };
run(join(packageRoot, "scripts/build.cjs"), cminpackEnvironment);

// The production manifest records the canonical Linux-x64 toolchain identity,
// while the prepared-toolchain identity intentionally includes the host SDK
// archive.  Non-canonical hosts must still reproduce exactly the canonical
// artifact, source closure, and ABI; they must not compare unlike host-cache
// identities or bypass production verification entirely.
const cminpackManifest = JSON.parse(readFileSync(
  join(packageRoot, "release/production-manifest.json"),
  "utf8",
));
const cminpackReport = JSON.parse(readFileSync(
  join(packageRoot, "build/build-report.json"),
  "utf8",
));
const cminpackArtifact = readFileSync(join(packageRoot, "build/cminpack.wasm"));
const cminpackAbi = sha256(Buffer.from(canonicalJson({
  imports: cminpackReport.artifact.imports,
  exports: cminpackReport.artifact.exports,
  memory: cminpackReport.artifact.memory,
})));
if (
  cminpackReport.toolchain.identity !== inspection.lockDigest ||
  cminpackManifest.toolchain.identity !== canonicalIdentity ||
  cminpackReport.toolchain.target !== cminpackManifest.toolchain.target ||
  cminpackReport.toolchain.floating_point_contract !==
    cminpackManifest.toolchain.floating_point_contract ||
  cminpackReport.source_closure.sha256 !== cminpackManifest.source_closure.sha256 ||
  cminpackReport.artifact.sha256 !== cminpackManifest.artifact.sha256 ||
  cminpackReport.artifact.bytes !== cminpackManifest.artifact.bytes ||
  sha256(cminpackArtifact) !== cminpackManifest.artifact.sha256 ||
  cminpackAbi !== cminpackManifest.abi.sha256
) {
  throw new Error(
    "the cminpack build does not reproduce its canonical production manifest",
  );
}
run(join(nloptRoot, "scripts/build.cjs"));
run(join(nloptRoot, "scripts/verify-release.cjs"));

const artifact = join(nloptRoot, "build/nlopt-methods.wasm");
if (!existsSync(artifact)) {
  throw new Error("the authenticated NLopt build did not publish nlopt-methods.wasm");
}
const manifest = JSON.parse(readFileSync(
  join(nloptRoot, "release/production-manifest.json"),
  "utf8",
));
const artifactBytes = readFileSync(artifact);
if (
  manifest?.artifact?.filename !== "nlopt-methods.wasm" ||
  manifest?.artifact?.bytes !== artifactBytes.byteLength ||
  manifest?.artifact?.sha256 !==
    createHash("sha256").update(artifactBytes).digest("hex")
) {
  throw new Error("the NLopt artifact differs from its production manifest");
}
mkdirSync(nodeRuntimeDirectory, { recursive: true });
mkdirSync(browserRuntimeDirectory, { recursive: true });
buildSync({
  entryPoints: [join(packageRoot, "nlopt-index.mjs")],
  outfile: join(nodeRuntimeDirectory, "nlopt-backend.cjs"),
  bundle: true,
  format: "cjs",
  platform: "node",
  target: ["node22"],
});
buildSync({
  entryPoints: [join(packageRoot, "nlopt-index.mjs")],
  outfile: join(browserRuntimeDirectory, "nlopt-backend.mjs"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["es2022"],
});
copyFileSync(artifact, join(nodeRuntimeDirectory, "nlopt-methods.wasm"));
copyFileSync(artifact, join(browserRuntimeDirectory, "nlopt-methods.wasm"));
