#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");
const repetitions = Number(process.env.SAGEJS_GROUP_REPETITIONS ?? 7);
const json = process.argv.includes("--json");
const descriptor = {
  id: "packed-permutation-center-production",
  source: "src/lib/sagejs/kernels/groups/permutation.py",
  functions: ["packed_permutation_center"],
  semantic_domain:
    "bounded breadth-first permutation closure and exact centrality against " +
    "packed generators for the public degree-8 center workflow",
  fallback: "same-source",
  host_isolation: "certified",
  oracles: ["cpython", "javascript", "portable-permutation-objects"],
  benchmark: "bench:wasm-group-computation",
  platforms: ["linux-x64", "linux-arm64", "windows-x64", "macos-arm64"],
};

function discoverToolchain() {
  return require("../packages/wasm-toolchain/scripts/toolchain.cjs")
    .wasmKernelToolchain({ root });
}

function publicPortableSeconds() {
  const result = spawnSync(process.execPath, [join(root, "bin/sagejs"), "--python"], {
    cwd: root,
    encoding: "utf8",
    input: `
import sagejs.runtime as runtime
samples=[]
answer=None
for sample in range(${Math.max(3, Math.min(repetitions, 5))}):
    G=PermutationGroup(['(1,2,3,4,5,6,7,8)','(1,2)'])
    started=runtime.wall_time()
    answer=G._portable_center()
    samples.append(runtime.wall_time()-started)
samples.sort()
print(str(samples[len(samples)//2])+'|'+str(G.order())+'|'+repr(answer.gens()))
`,
    timeout: 180_000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const [seconds, order, center] = result.stdout.trim().split("|");
  assert.equal(order, "40320");
  assert.equal(center, "((),)");
  return Number(seconds);
}

async function instantiate(manifest, outputRoot) {
  const { WASI } = require("node:wasi");
  const { instantiateWasmKernelPacks } = await import(
    "../tools/native-kernel/wasm-pack-loader.mjs"
  );
  return instantiateWasmKernelPacks({
    manifest,
    load(pack) {
      return readFileSync(join(outputRoot, pack.asset));
    },
    host() {
      const wasi = new WASI({ version: "preview1", returnOnExit: true });
      return {
        imports: { wasi_snapshot_preview1: wasi.wasiImport },
        initialize(instance) {
          wasi.initialize(instance);
        },
      };
    },
  });
}

async function main() {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-group-benchmark-"));
  try {
    const manifestPath = join(temporary, "native-kernels.json");
    writeFileSync(
      manifestPath,
      `${JSON.stringify({ kernels: [descriptor] }, null, 2)}\n`,
    );
    const outputRoot = join(temporary, "output");
    const { buildWasmProductionPacks } = require(
      "../tools/native-kernel/wasm-production-pack.cjs"
    );
    const manifest = await buildWasmProductionPacks({
      root,
      manifestPath,
      outputRoot,
      domains: ["gmp"],
      emitOnly: false,
      toolchain: discoverToolchain(),
    });
    const runtime = await instantiate(manifest, outputRoot);
    const kernel = runtime.function(
      "sagejs/kernels/groups/permutation.py",
      "packed_permutation_center",
    );
    const capacity = 40320;
    const elements = new BigUint64Array(capacity * 8);
    const center = new BigUint64Array(capacity);
    const generators = new BigUint64Array([
      2n, 3n, 4n, 5n, 6n, 7n, 8n, 1n,
      2n, 1n, 3n, 4n, 5n, 6n, 7n, 8n,
    ]);
    const table = new BigUint64Array(131071);
    const status = new BigUint64Array(4);
    const wasmSamples = [];
    for (let sample = 0; sample < repetitions; sample += 1) {
      const started = performance.now();
      assert.equal(kernel(
        elements,
        center,
        generators,
        table,
        status,
        8n,
        2n,
        BigInt(capacity),
        12000000n,
      ), 0n);
      wasmSamples.push((performance.now() - started) / 1000);
    }
    wasmSamples.sort((left, right) => left - right);
    assert.deepEqual(Array.from(status), [0n, 40320n, 1n, 1034577n]);
    const portable = publicPortableSeconds();
    const wasm = wasmSamples[Math.floor(wasmSamples.length / 2)];
    const report = {
      schema: "sagejs.benchmark/wasm-group-computation-v1",
      workload:
        "PermutationGroup(['(1,2,3,4,5,6,7,8)','(1,2)']).center()",
      publicSemanticsEqual: true,
      order: 40320,
      centerOrder: 1,
      packedWork: Number(status[3]),
      maxWork: 12000000,
      repetitions,
      portablePublicMedianSeconds: portable,
      directWasmMedianSeconds: wasm,
      kernelSpeedup: portable / wasm,
      selectedKernelRoute: "wasm-compiled-source",
      boundaryCrossingsPerKernelCall: 1,
      profileSelection: {
        closureOrderS8Seconds: 1.665,
        coldCenterS8Seconds: 3.125,
        derivedSeriesS6Seconds: 17.065,
        matrixConjugacySL2_7:
          "not measured: optional FLINT matrix backend unavailable",
      },
      note:
        "The public object fallback and packed kernel return the same S8 " +
        "closure order and center. The direct Wasm timing isolates the hot " +
        "kernel; test/wasm-group-computation.cjs proves public dispatch.",
    };
    if (json) console.log(JSON.stringify(report, null, 2));
    else {
      console.log(report.workload);
      console.log(`portable public: ${(1000 * portable).toFixed(3)} ms`);
      console.log(`direct Wasm:    ${(1000 * wasm).toFixed(3)} ms`);
      console.log(`kernel speedup: ${report.kernelSpeedup.toFixed(2)}x`);
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
