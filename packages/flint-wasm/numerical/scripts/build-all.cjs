#!/usr/bin/env node
"use strict";

const { createHash } = require("node:crypto");
const { copyFileSync, existsSync, mkdirSync, readFileSync } = require("node:fs");
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

function run(script) {
  const result = spawnSync(process.execPath, [script], {
    cwd: repositoryRoot,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${script} exited with ${result.status}`);
  }
}

run(join(packageRoot, "scripts/build.cjs"));
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
