#!/usr/bin/env node
// sagejs-test-tier: specialized
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const {
  existsSync,
  lstatSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { pathToFileURL } = require("node:url");

const root = resolve(__dirname, "..");
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function regularFiles(directory, prefix = "") {
  const files = [];
  for (const entry of readdirSync(join(directory, prefix), {
    withFileTypes: true,
  })) {
    const relativeName = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...regularFiles(directory, relativeName));
    } else {
      assert.equal(entry.isFile(), true, `unexpected package entry ${relativeName}`);
      assert.equal(
        lstatSync(join(directory, relativeName)).isSymbolicLink(),
        false,
        `unexpected package link ${relativeName}`,
      );
      files.push(relativeName);
    }
  }
  return files;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    encoding: "utf8",
    env: options.env ?? process.env,
    timeout: options.timeout ?? 300_000,
  });
  if (result.error) throw result.error;
  assert.equal(
    result.status,
    0,
    `${command} ${args.join(" ")} failed\n${result.stdout}\n${result.stderr}`,
  );
  return result;
}

function main() {
  const productionManifest = join(
    root,
    "packages",
    "flint-wasm",
    "dist",
    "production-manifest.json",
  );
  assert.ok(
    existsSync(productionManifest),
    "build the production browser artifact with `pnpm build:wasm` before " +
      "qualifying its npm package",
  );

  const temporary = mkdtempSync(join(tmpdir(), "sagejs-wasm-npm-"));
  try {
    const archive = join(temporary, "sagejs.tgz");
    run(pnpm, ["pack", "--out", archive], {
      env: { ...process.env, SAGEJS_SKIP_PREPACK: "1" },
    });

    const manifest = {
      private: true,
      dependencies: {
        "@sagemath/sagejs": pathToFileURL(archive).href,
      },
    };
    writeFileSync(
      join(temporary, "package.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    run(
      pnpm,
      ["install", "--ignore-scripts", "--config.optional=false"],
      { cwd: temporary },
    );

    const installedRoot = join(
      temporary,
      "node_modules",
      "@sagemath",
      "sagejs",
    );
    const installedWasmDist = join(
      installedRoot,
      "packages",
      "flint-wasm",
      "dist",
    );
    const artifact = JSON.parse(
      readFileSync(join(installedWasmDist, "production-manifest.json"), "utf8"),
    );
    const expectedDistFiles = new Set([
      ...artifact.assets.map(({ path }) => path),
      "production-manifest.json",
      "build-receipt.json",
      ...(existsSync(join(installedWasmDist, "documentation.json"))
        ? ["documentation.json"]
        : []),
    ]);
    assert.deepEqual(
      regularFiles(installedWasmDist).sort(),
      [...expectedDistFiles].sort(),
      "the npm package must contain exactly the authenticated browser " +
        "artifact plus its receipt and optional non-executable DocSpec catalog",
    );
    const command = join(installedRoot, "bin", "sagejs");
    const verify = run(process.execPath, [command, "--wasm", "--verify-only"], {
      cwd: temporary,
    });
    assert.match(
      verify.stdout,
      /^WebAssembly production artifact valid: sha256:[0-9a-f]{64}\s*$/,
    );

    const evaluation = run(
      process.execPath,
      [command, "--wasm", "-c", "2 + 3"],
      { cwd: temporary, timeout: 180_000 },
    );
    assert.equal(evaluation.stderr, "");
    assert.equal(evaluation.stdout.trim(), "5");

    const moduleSmoke = join(temporary, "wasm-smoke.mjs");
    writeFileSync(
      moduleSmoke,
      `import { createSage } from "@sagemath/sagejs/wasm/node";\n` +
        `const sage = await createSage();\n` +
        `const result = await sage.evaluateJSON("{'answer': 6 * 7}");\n` +
        `process.stdout.write(JSON.stringify(result));\n` +
        `await sage.close();\n`,
    );
    const embedded = run(process.execPath, [moduleSmoke], {
      cwd: temporary,
      timeout: 180_000,
    });
    assert.equal(embedded.stderr, "");
    assert.deepEqual(JSON.parse(embedded.stdout), { answer: 42 });

    const packedManifest = JSON.parse(
      readFileSync(join(installedRoot, "package.json"), "utf8"),
    );
    assert.equal(packedManifest.name, "@sagemath/sagejs");
    process.stdout.write(
      "Fresh packed npm installation authenticated and executed the " +
        "production browser WebAssembly artifact.\n",
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

if (require.main === module) main();

module.exports = { main };
