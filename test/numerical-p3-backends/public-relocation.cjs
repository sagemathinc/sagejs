#!/usr/bin/env node
// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { execFileSync, spawnSync } = require("node:child_process");
const {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");

const { runPnpm } = require("../../scripts/pnpm-invocation.cjs");

const root = join(__dirname, "../..");

test("a packed and relocated npm package executes public cminpack", {
  timeout: 180_000,
}, () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-cminpack-npm-"));
  try {
    const archiveDirectory = join(temporary, "archive");
    mkdirSync(archiveDirectory);
    runPnpm(["pack", "--pack-destination", archiveDirectory], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, SAGEJS_SKIP_PREPACK: "1" },
    });
    const archive = join(
      archiveDirectory,
      readdirSync(archiveDirectory).find((name) => name.endsWith(".tgz")),
    );
    const listing = execFileSync("tar", ["-tzf", archive], { encoding: "utf8" });
    assert.match(listing, /package\/dist\/numerical\/backend\.cjs/);
    assert.match(listing, /package\/dist\/numerical\/cminpack\.wasm/);

    const consumer = join(temporary, "consumer");
    mkdirSync(consumer);
    writeFileSync(join(consumer, "package.json"), `${JSON.stringify({
      private: true,
      dependencies: { "@sagemath/sagejs": `file:${archive}` },
    }, null, 2)}\n`);
    runPnpm(["install", "--ignore-scripts", "--no-optional"], {
      cwd: consumer,
      stdio: "ignore",
    });
    const installed = join(
      consumer,
      "node_modules",
      "@sagemath",
      "sagejs",
      "bin",
      "sagejs-source.cjs",
    );
    const source = [
      "from sagejs.numerics.optimization import least_squares",
      "answer = least_squares(lambda p: [p[0]-2.0], [20.0], method='cminpack-lmdif')",
      "print(answer.method)",
      "print(answer.backend)",
      "print(answer.success and answer.validation.passed)",
      "print(abs(answer.value[0]-2.0) < 1.0e-10)",
      "",
    ].join("\n");
    const result = spawnSync(process.execPath, [installed, "--python", "-"], {
      cwd: consumer,
      input: source,
      encoding: "utf8",
      env: { ...process.env, SAGEJS_NATIVE_DISABLE: "1" },
      timeout: 120_000,
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(
      result.stdout.trim(),
      "cminpack-lmdif\ncminpack-wasm\nTrue\nTrue",
    );
    const installedManifest = JSON.parse(readFileSync(
      join(consumer, "node_modules", "@sagemath", "sagejs", "package.json"),
      "utf8",
    ));
    assert.equal(installedManifest.name, "@sagemath/sagejs");

    const installedWasm = join(
      consumer,
      "node_modules",
      "@sagemath",
      "sagejs",
      "dist",
      "numerical",
      "cminpack.wasm",
    );
    renameSync(installedWasm, `${installedWasm}.missing`);
    const missing = spawnSync(process.execPath, [installed, "--python", "-"], {
      cwd: consumer,
      input: [
        "from sagejs.numerics.optimization import least_squares",
        "answer = least_squares(lambda p: [p[0]-2.0], [20.0], method='cminpack-lmdif')",
        "print(answer.status)",
        "print(answer.success)",
        "print(answer.domain_payload['stop_reason'])",
        "",
      ].join("\n"),
      encoding: "utf8",
      env: { ...process.env, SAGEJS_NATIVE_DISABLE: "1" },
      timeout: 120_000,
    });
    assert.equal(missing.status, 0, missing.stderr || missing.stdout);
    assert.equal(
      missing.stdout.trim(),
      "backend_failure\nFalse\ncminpack_backend_unavailable",
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
