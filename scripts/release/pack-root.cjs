#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { runPnpm } = require("../pnpm-invocation.cjs");
const root = path.resolve(__dirname, "../..");
const { requireClassGroupDistributionEligibility } = require("./class-group-distribution-eligibility.cjs");
requireClassGroupDistributionEligibility(root);
fs.mkdirSync(path.join(root, "build/release/npm"), { recursive: true });
runPnpm(["pack", "--out", "build/release/npm/sagejs.tgz"], {
  cwd: root, env: { ...process.env, SAGEJS_SKIP_PREPACK: "1" }, stdio: "inherit",
});
const archiveMembers = execFileSync("tar", ["-tzf", "build/release/npm/sagejs.tgz"], {
  cwd: root, encoding: "utf8",
}).split("\n");
for (const name of archiveMembers) {
  if (/class-group-core(?:-receipt)?\.(?:wasm|json)$/.test(name)) {
    throw new Error(`excluded class-group reactor leaked into public npm archive: ${name}`);
  }
}
const unpacked = fs.mkdtempSync(path.join(root, "build/public-root-check-"));
execFileSync("tar", ["-xzf", "build/release/npm/sagejs.tgz", "-C", unpacked], { cwd: root, stdio: "inherit" });
execFileSync(process.execPath, ["packages/flint-wasm/scripts/browser-wasm-release-artifact.cjs",
  "--dist", "packages/flint-wasm/dist", "--compare", path.join(unpacked, "package/packages/flint-wasm/dist")],
{ cwd: root, stdio: "inherit" });
// Preserve the comparison directory for inspection; it is ignored and is not
// included in the canonical artifact or qualification identity.
