#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");

const rootArchive = resolve(process.argv[2] || "build/release/npm/sagejs.tgz");
const nativeArchive = resolve(
  process.argv[3] || "build/release/npm/sagejs-linux-x64.tgz",
);
const temporaryRoot = mkdtempSync(join(tmpdir(), "sagejs-npm-test-"));
try {
  const manifest = {
    private: true,
    dependencies: {
      "@sagemath/sagejs": `file:${rootArchive}`,
      "@sagemath/sagejs-linux-x64": `file:${nativeArchive}`,
    },
  };
  writeFileSync(
    join(temporaryRoot, "package.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  const pnpmEntrypoint = process.env.npm_execpath;
  const command = pnpmEntrypoint ? process.execPath : "pnpm";
  const arguments_ = pnpmEntrypoint
    ? [pnpmEntrypoint, "install", "--ignore-scripts"]
    : ["install", "--ignore-scripts"];
  execFileSync(command, arguments_, { cwd: temporaryRoot, stdio: "inherit" });
  const executable = join(temporaryRoot, "node_modules", ".bin", "sagejs");
  const output = execFileSync(executable, ["--jupyter-kernel-self-test"], {
    cwd: temporaryRoot,
    encoding: "utf8",
  });
  assert.equal(output.trim(), "Sage.js Jupyter SEA runtime passed.");
  console.log("Native npm dispatcher test passed");
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
