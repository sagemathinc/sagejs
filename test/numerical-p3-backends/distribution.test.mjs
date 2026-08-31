// sagejs-test-tier: specialized

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { test } from "node:test";

import { buildSync } from "esbuild";

const packageRoot = new URL("../../packages/flint-wasm/numerical/", import.meta.url);
const indexPath = new URL("index.mjs", packageRoot);
const artifactPath = new URL("build/cminpack.wasm", packageRoot);
const portableSmokePath = new URL("./portable-smoke.mjs", import.meta.url);

function verifyReceipt(output, expectedSea) {
  const receipt = JSON.parse(output);
  assert.equal(receipt.artifact_sha256,
    "f8ce5abcca0128be5e61a3b3d31b983207dad1117d61a7642fae336c3268e855");
  assert.equal(receipt.result.backendConverged, true);
  assert.deepEqual(receipt.result.value, [1, 1]);
  assert.equal(receipt.residual_norm, 0);
  assert.equal(receipt.lifecycle.liveAllocations, 0);
  assert.equal(receipt.lifecycle.liveBytes, 0);
  if (expectedSea != null) assert.equal(receipt.sea, expectedSea);
}

test("the resource remains functional after package-style relocation", () => {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-numerical-relocated-"));
  try {
    cpSync(indexPath, join(directory, "index.mjs"));
    cpSync(artifactPath, join(directory, "cminpack.wasm"));
    cpSync(portableSmokePath, join(directory, "portable-smoke.mjs"));
    verifyReceipt(execFileSync(process.execPath, [join(directory, "portable-smoke.mjs")], {
      encoding: "utf8",
    }));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("the exact resource executes from real Node SEA assets", {
  skip: process.platform === "darwin" || process.platform === "win32"
    ? "this focused builder smoke is signed/platform-qualified by release integration"
    : false,
}, () => {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-numerical-sea-"));
  const executable = join(directory, "numerical-sea");
  const entry = join(directory, "entry.mjs");
  const bundle = join(directory, "bundle.cjs");
  const config = join(directory, "sea-config.json");
  try {
    writeFileSync(entry, `
import { createHash } from "node:crypto";
import { getAsset, isSea } from "node:sea";
import { createCminpackBackend } from ${JSON.stringify(indexPath.pathname)};
(async () => {
  const bytes = new Uint8Array(getAsset("numerical/cminpack.wasm"));
  const solver = await createCminpackBackend(bytes);
  const result = solver.leastSquares({
    method: "cminpack-lmder", initial: [-1.2, 1], residualCount: 2,
    residual: ([x, y]) => [10 * (y - x * x), 1 - x],
    jacobian: ([x]) => [[-20 * x, 10], [-1, 0]],
  });
  const residual_norm = Math.hypot(
    10 * (result.value[1] - result.value[0] ** 2), 1 - result.value[0],
  );
  process.stdout.write(JSON.stringify({
    schema: "sagejs.numerical-p3-sea-smoke/v1", sea: isSea(),
    artifact_sha256: createHash("sha256").update(bytes).digest("hex"),
    result, residual_norm, lifecycle: solver.inspect(),
  }));
})().catch((error) => { console.error(error); process.exitCode = 1; });
`);
    buildSync({
      entryPoints: [entry],
      outfile: bundle,
      bundle: true,
      platform: "node",
      format: "cjs",
      target: "node22",
    });
    writeFileSync(config, `${JSON.stringify({
      main: bundle,
      output: executable,
      disableExperimentalSEAWarning: true,
      useSnapshot: false,
      useCodeCache: true,
      assets: {
        "numerical/cminpack.wasm": artifactPath.pathname,
      },
    }, null, 2)}\n`);
    execFileSync(process.execPath, ["--build-sea", config], { stdio: "pipe" });
    chmodSync(executable, 0o755);
    verifyReceipt(execFileSync(executable, [], { encoding: "utf8" }), true);
    assert.equal(basename(executable), "numerical-sea");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
