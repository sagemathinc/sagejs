import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { WASI } from "node:wasi";
import test from "node:test";

import { instantiateWasmKernelPacks } from "../../../tools/native-kernel/wasm-pack-loader.mjs";

const packageRoot = new URL("..", import.meta.url);
const repositoryRoot = new URL("../../..", import.meta.url);
const outputRoot = new URL("dist/native-kernels/", packageRoot);

test("the basis-only stable HNF kernel executes the former crash matrix in Wasm", async () => {
  const manifest = JSON.parse(readFileSync(new URL("index.json", outputRoot), "utf8"));
  const runtime = await instantiateWasmKernelPacks({
    manifest,
    load(pack) {
      return readFileSync(new URL(pack.asset, outputRoot));
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
  const fixture = JSON.parse(readFileSync(new URL(
    "test/fixtures/number-field-class-group-stable-hnf-37x8.json",
    repositoryRoot,
  ), "utf8"));
  const sourceRows = [...fixture.initial, ...fixture.candidates];
  const source = sourceRows.flat().map(BigInt);
  const metadata = Array(7).fill(0n);
  const basis = Array(source.length).fill(0n);
  const selected = Array(fixture.candidates.length).fill(0n);
  const kernel = runtime.function(
    "sagejs/kernels/matrix/class_group_hnf.py",
    "stable_exact_relation_hnf_select_v1",
  );
  const status = kernel(
    metadata,
    basis,
    selected,
    source,
    BigInt(sourceRows.length),
    BigInt(fixture.initial.length),
    BigInt(fixture.columns),
    128n,
    1_000_000n,
    16_777_216n,
    16_777_216n,
  );
  assert.equal(status, 1n);
  assert.deepEqual(metadata.slice(0, 5).map(Number), [
    fixture.expected.rank,
    fixture.initial.length + fixture.expected.selected_candidate_indices.length,
    fixture.expected.selected_candidate_indices.length,
    fixture.expected.deletion_trials,
    fixture.expected.hnf_calls,
  ]);
  assert.equal(metadata[6], 1n);
  assert.deepEqual(
    selected.flatMap((value, index) => value === 1n ? [index] : []),
    fixture.expected.selected_candidate_indices,
  );
  assert.deepEqual(
    basis.map(Number),
    fixture.expected.basis.flat().concat(
      Array((sourceRows.length - fixture.expected.rank) * fixture.columns).fill(0),
    ),
  );
});
