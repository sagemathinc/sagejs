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

test("a packed and relocated npm package executes public NLopt", {
  timeout: 180_000,
}, () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-nlopt-npm-"));
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
    assert.match(listing, /package\/dist\/numerical\/nlopt-backend\.cjs/);
    assert.match(listing, /package\/dist\/numerical\/nlopt-methods\.wasm/);

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
    const installedRoot = join(
      consumer, "node_modules", "@sagemath", "sagejs",
    );
    const installed = join(installedRoot, "bin", "sagejs-source.cjs");
    const source = [
      "from sagejs.numerics.optimization import minimize",
      "answer = minimize(lambda p: (p[0]-2.0)**2, [20.0], method='nlopt-nelder-mead')",
      "print(answer.method)",
      "print(answer.backend)",
      "print(answer.success and answer.validation.passed)",
      "print(abs(answer.value[0]-2.0) < 1.0e-6)",
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
      "nlopt-nelder-mead\nnlopt-mit-wasm\nTrue\nTrue",
    );

    const installedWasm = join(
      installedRoot, "dist", "numerical", "nlopt-methods.wasm",
    );
    const originalWasm = readFileSync(installedWasm);
    const tamperedWasm = Buffer.from(originalWasm);
    tamperedWasm[Math.floor(tamperedWasm.byteLength / 2)] ^= 1;
    writeFileSync(installedWasm, tamperedWasm);
    const tampered = spawnSync(process.execPath, [installed, "--python", "-"], {
      cwd: consumer,
      input: [
        "from sagejs.numerics.optimization import minimize",
        "answer = minimize(lambda p: (p[0]-2.0)**2, [20.0], method='nlopt-nelder-mead')",
        "print(answer.status)",
        "print(answer.success)",
        "print(answer.domain_payload['stop_reason'])",
        "",
      ].join("\n"),
      encoding: "utf8",
      env: { ...process.env, SAGEJS_NATIVE_DISABLE: "1" },
      timeout: 120_000,
    });
    assert.equal(tampered.status, 0, tampered.stderr || tampered.stdout);
    assert.equal(
      tampered.stdout.trim(),
      "backend_failure\nFalse\nnlopt_backend_unavailable",
    );
    writeFileSync(installedWasm, originalWasm);
    renameSync(installedWasm, `${installedWasm}.missing`);
    const missing = spawnSync(process.execPath, [installed, "--python", "-"], {
      cwd: consumer,
      input: [
        "from sagejs.numerics.optimization import minimize",
        "answer = minimize(lambda p: (p[0]-2.0)**2, [20.0], method='nlopt-nelder-mead')",
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
      "backend_failure\nFalse\nnlopt_backend_unavailable",
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
