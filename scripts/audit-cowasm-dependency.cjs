#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");

const root = resolve(__dirname, "..");
const filesResult = spawnSync("git", [
  "ls-files", "--cached", "--others", "--exclude-standard", "-z",
], { cwd: root, encoding: "utf8" });
if (filesResult.status !== 0) {
  throw new Error(filesResult.stderr || "unable to enumerate repository files");
}

const allowed = [
  /^\.agents\//,
  /^agents\/eliminate-cowasm-dependency-plan\.md$/,
  /^agents\/webassembly-production-parity-and-apps-plan\.md$/,
  /^architecture\/(?:native-boundaries|native-code|native-kernels|wasm-capabilities)\.json$/,
  /^bench\/cowasm\//,
  /^bench\/(?:compare-native-cowasm\.cjs|native_cowasm_workload\.py|JULIA-NATIVE-COMPARISON\.md|NATIVE-COMPILER\.md)$/,
  /^bench\/julia-math-comparison\.jl$/,
  /^(?:HACKING|IMPLEMENTATION|README|TESTING)\.md$/,
  /^licenses\/ODLYZKO-ZETA-NOTICE\.md$/,
  /^package\.json$/,
  /^packages\/wasm-toolchain\/(?:THIRD-PARTY-NOTICES\.md|patches\/sagejs_wasi_fenv_compat\.h)$/,
  /^scripts\/(?:audit-cowasm-dependency\.cjs|run-test-plan\.cjs)$/,
  /^test\/(?:cowasm-landscape|native-kernel)\.cjs$/,
  /^website\/benchmarks\.json$/,
];
const forbidden = /(?:@cowasm\/|SAGEJS_COWASM_ROOT|cowasm-(?:cc|c\+\+|ar|ranlib)|sagejs-cowasm-v1|\bwasi-js\b|CoWasm)/i;
const violations = [];
const files = filesResult.stdout.split("\0").filter(Boolean).sort();
for (const name of files) {
  let contents;
  try {
    contents = readFileSync(resolve(root, name), "utf8");
  } catch {
    continue;
  }
  const matches = [...contents.matchAll(new RegExp(forbidden.source, "gi"))];
  if (matches.length === 0 || allowed.some((pattern) => pattern.test(name))) continue;
  for (const match of matches) {
    const line = contents.slice(0, match.index).split("\n").length;
    violations.push(`${name}:${line}: ${match[0]}`);
  }
}

if (violations.length) {
  process.stderr.write(
    "Forbidden CoWasm build/runtime dependencies remain:\n" +
    violations.map((entry) => `- ${entry}`).join("\n") + "\n",
  );
  process.exitCode = 1;
} else {
  process.stdout.write(
    "CoWasm dependency audit passed; remaining references are benchmark provenance or migration history.\n",
  );
}
