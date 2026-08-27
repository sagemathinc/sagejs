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
  for (const required of [
    "package/packages/flint-wasm/auto-receipt-policy.mjs",
    "package/packages/flint/src/hyperelliptic/smalljac.c",
    "package/bench/hyperelliptic/cross-platform/run.cjs",
    "package/bench/hyperelliptic/cross-platform/results/policy-a9d83f82/evidence-index.json",
  ]) {
    assert.ok(
      rootContents.split("\n").includes(required),
      `root package is missing receipt-policy input ${required}`,
    );
  }

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
  const embeddingOutput = execFileSync(
    process.execPath,
    [
      "-e",
      [
        'const { createSage } = require("@sagemath/sagejs/kernel");',
        "(async () => {",
        "  const sage = await createSage();",
        '  const result = await sage.evaluate("sum([1..100])");',
        "  console.log(result.repr);",
        "  await sage.close();",
        "})().catch((error) => { console.error(error); process.exitCode = 1; });",
      ].join("\n"),
    ],
    { cwd: temporaryRoot, encoding: "utf8" },
  );
  assert.equal(embeddingOutput.trim(), "5050");
  const executable = join(temporaryRoot, "node_modules", ".bin", "sagejs");
  const output = execFileSync(executable, ["--jupyter-kernel-self-test"], {
    cwd: temporaryRoot,
    encoding: "utf8",
  });
  assert.equal(output.trim(), "Sage.js Jupyter SEA runtime passed.");
  console.log("Native npm dispatcher and documented kernel export tests passed");
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
