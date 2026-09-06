#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { runPnpm } = require("../pnpm-invocation.cjs");
const root = path.resolve(__dirname, "../..");
fs.mkdirSync(path.join(root, "build/release/npm"), { recursive: true });
runPnpm(["pack", "--out", "build/release/npm/sagejs.tgz"], {
  cwd: root, env: { ...process.env, SAGEJS_SKIP_PREPACK: "1" }, stdio: "inherit",
});
const unpacked = fs.mkdtempSync(path.join(root, "build/public-root-check-"));
execFileSync("tar", ["-xzf", "build/release/npm/sagejs.tgz", "-C", unpacked], { cwd: root, stdio: "inherit" });
execFileSync(process.execPath, ["packages/flint-wasm/scripts/browser-wasm-release-artifact.cjs",
  "--dist", "packages/flint-wasm/dist", "--compare", path.join(unpacked, "package/packages/flint-wasm/dist")],
{ cwd: root, stdio: "inherit" });
// Preserve the comparison directory for inspection; it is ignored and is not
// included in the canonical artifact or qualification identity.
