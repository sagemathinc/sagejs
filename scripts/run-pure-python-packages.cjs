#!/usr/bin/env node
"use strict";

const { mkdtempSync, readFileSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawn } = require("node:child_process");

const root = resolve(__dirname, "..");
const manifest = JSON.parse(readFileSync(
  join(root, "upstream-tests", "python-packages", "manifest.json"),
  "utf8",
));

function run(command, args, options = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env: { ...process.env, ...options.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (value) => stdout += value);
    child.stderr.on("data", (value) => stderr += value);
    child.on("error", reject);
    child.on("close", (status) => resolveRun({ status, stdout, stderr }));
  });
}

(async () => {
  const target = mkdtempSync(join(tmpdir(), "sagejs-pypi-corpus-"));
  const requested = manifest.packages.map(
    (entry) => `${entry.name}==${entry.version}`,
  );
  const installed = await run(process.execPath, [
    join(root, "bin", "sagejs-source.cjs"),
    "pip",
    "--target",
    target,
    "--no-deps",
    "install",
    ...requested,
  ]);
  if (installed.status !== 0) {
    process.stderr.write(installed.stderr || installed.stdout);
    process.exit(1);
  }

  let failures = 0;
  for (const entry of manifest.packages) {
    const receipt = JSON.parse(readFileSync(
      join(target, ".sagejs-installed", `${entry.name}.json`),
      "utf8",
    ));
    if (receipt.sha256 !== entry.sha256 || receipt.wheel !== entry.wheel) {
      console.error(`${entry.name}: wheel identity does not match manifest`);
      failures += 1;
      continue;
    }
    const program = join(target, `.sagejs-check-${entry.name}.py`);
    writeFileSync(program, entry.source);
    const result = await run(process.execPath, [
      join(root, "bin", "sagejs-source.cjs"),
      program,
    ], { env: { SAGEJS_SITE_PACKAGES: target } });
    const passed = result.status === 0 && result.stdout === entry.stdout;
    console.log(`${passed ? "PASS" : "FAIL"} ${entry.name} ${entry.version}`);
    if (!passed) {
      failures += 1;
      if (result.stdout !== entry.stdout) {
        console.error(`expected stdout: ${JSON.stringify(entry.stdout)}`);
        console.error(`actual stdout:   ${JSON.stringify(result.stdout)}`);
      }
      if (result.stderr) console.error(result.stderr.trimEnd());
    }
  }
  console.log(
    `${manifest.packages.length - failures}/${manifest.packages.length} ` +
      "pinned pure-Python package workflows passed",
  );
  process.exitCode = failures ? 1 : 0;
})().catch((error) => {
  console.error(error?.stack ?? error);
  process.exitCode = 1;
});
