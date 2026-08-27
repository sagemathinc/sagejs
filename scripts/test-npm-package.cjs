#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");

const { runPnpm } = require("./pnpm-invocation.cjs");

const root = resolve(__dirname, "..");
const rootArchive = resolve(process.argv[2] || "build/release/npm/sagejs.tgz");
const nativeArchive = resolve(
  process.argv[3] || "build/release/npm/sagejs-linux-x64.tgz",
);
const temporaryRoot = mkdtempSync(join(tmpdir(), "sagejs-npm-test-"));
try {
  const rootContents = execFileSync("tar", ["-tzf", rootArchive], {
    encoding: "utf8",
  });
  assert.doesNotMatch(rootContents, /\.sagejs-native-kernels\//);
  assert.doesNotMatch(rootContents, /package\/dist\/native-kernels\//);

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
  writeFileSync(
    join(temporaryRoot, "pnpm-workspace.yaml"),
    `overrides:\n  "@sagemath/sagejs-linux-x64": "file:${nativeArchive}"\n`,
  );
  runPnpm(["install", "--ignore-scripts"], {
    cwd: temporaryRoot,
    stdio: "inherit",
  });
  const expectedVersion = require(join(root, "package.json")).version;
  const installedManifest = JSON.parse(
    readFileSync(
      join(temporaryRoot, "node_modules", "@sagemath", "sagejs", "package.json"),
      "utf8",
    ),
  );
  assert.equal(installedManifest.version, expectedVersion);
  const commonJsOutput = execFileSync(
    process.execPath,
    [
      "-e",
      [
        'const api = require("@sagemath/sagejs");',
        'const kernel = require("@sagemath/sagejs/kernel");',
        'if (typeof api.createCompiler !== "function") throw new Error("missing createCompiler");',
        'if (api.createSage !== kernel.createSage) throw new Error("kernel export disagrees with package root");',
        'try { require.resolve("@sagemath/sagejs-flint"); throw new Error("private FLINT workspace leaked"); }',
        'catch (error) { if (error.code !== "MODULE_NOT_FOUND") throw error; }',
        "(async () => {",
        "  const sage = await api.createSage();",
        '  const result = await sage.evaluate("factor(370309)");',
        "  console.log(result.repr);",
        '  console.log((await sage.evaluate("version()")).repr);',
        '  console.log((await sage.evaluate("version(True)[\\"schema\\"]")).repr);',
        "  await sage.close();",
        "})().catch((error) => { console.error(error); process.exitCode = 1; });",
      ].join("\n"),
    ],
    { cwd: temporaryRoot, encoding: "utf8" },
  );
  assert.equal(
    commonJsOutput.trim(),
    [
      "67 * 5527",
      `'Sage.js v${expectedVersion} [linux-x64], Release Date: ` +
        `${require(join(root, "sagejs-version.json")).release_date}'`,
      "'sagejs.version/v1'",
    ].join("\n"),
  );
  const esmOutput = execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      [
        'import { createSage } from "@sagemath/sagejs";',
        "const sage = await createSage();",
        'console.log((await sage.evaluate("number_of_partitions(10)")).repr);',
        "await sage.close();",
      ].join("\n"),
    ],
    { cwd: temporaryRoot, encoding: "utf8" },
  );
  assert.equal(esmOutput.trim(), "42");
  const executable = join(temporaryRoot, "node_modules", ".bin", "sagejs");
  const output = execFileSync(executable, ["--jupyter-kernel-self-test"], {
    cwd: temporaryRoot,
    encoding: "utf8",
  });
  assert.equal(output.trim(), "Sage.js Jupyter SEA runtime passed.");
  console.log("Isolated CommonJS, ESM, native mathematics, and CLI npm tests passed");
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
