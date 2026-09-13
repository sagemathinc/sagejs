#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { identity } = require("./runner.cjs");
const { targetForHost } = require("../package-qualification/runtime.cjs");
const root = path.resolve(__dirname, "../..");
const [candidate, subject] = process.argv.slice(2);
identity(root, candidate);
if (!["node", "npm", "sea"].includes(subject)) throw new Error("invalid numerical subject");
const target = targetForHost();
const output = `build/numerical-qualification/platform/${target}`;
// Retrying a failed subject must not destroy successful sibling receipts or
// pass existing immutable files to a collector requiring fresh output.
for (const name of [`${target}-${subject}`, ...(subject === "node" ? [`${target}-soak.evidence.json`] : [])]) {
  const old = path.join(root, output, name);
  if (!fs.existsSync(old)) continue;
  if (fs.lstatSync(old).isSymbolicLink()) throw new Error("refusing linked qualification output");
  const history = path.join(root, "build/release-runner", candidate, `previous-${Date.now()}-${name}`);
  fs.mkdirSync(path.dirname(history), { recursive: true });
  fs.renameSync(old, history);
}
process.env.SAGEJS_QUALIFICATION_SCIPY_PREFIX = path.join(root, "build/numerical-scipy/prefix");
process.env.SAGEJS_QUALIFICATION_SCIPY_PROVENANCE = path.join(root, "build/numerical-scipy/provenance.json");
require("../numerical-computing/qualification/collect-platform.cjs").main([
  "--candidate", candidate, "--subjects", subject, "--output", output,
  "--root-archive", "build/release/npm/sagejs.tgz",
  "--platform-archive", `build/release/npm/sagejs-${target}.tgz`,
  "--sea-executable", `build/sea/sagejs${target === "windows-x64" ? ".exe" : ""}`,
]);
