#!/usr/bin/env node
"use strict";
// A file entry point avoids PowerShell 5 stripping quotes from Node -e code.
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { targetForHost } = require("../package-qualification/runtime.cjs");
const configuration = JSON.parse(Buffer.from(process.argv[2], "base64").toString());
if (targetForHost() !== configuration.target) throw new Error("wrong host target");
if (path.resolve(__dirname, "../..") !== path.resolve(configuration.root)) throw new Error("wrong host checkout");
if (!/^[0-9a-f]{40}$/.test(configuration.candidate)) throw new Error("invalid candidate");
const args = ["exec", "node", "scripts/release/runner.cjs", "--candidate", configuration.candidate];
if (configuration.stage) {
  if (!/^[a-z,-]+$/.test(configuration.stage)) throw new Error("invalid stages");
  args.push("--stage", configuration.stage);
}
const result = spawnSync(process.platform === "win32" ? "pnpm.cmd" : "pnpm", args, {
  cwd: configuration.root, env: { ...process.env, ...configuration.env },
  stdio: "inherit", shell: process.platform === "win32",
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
