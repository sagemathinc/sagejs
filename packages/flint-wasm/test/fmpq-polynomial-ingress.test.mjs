import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import { instantiateFlintFactor } from "../index.mjs";

const wasm = await fs.readFile(
  new URL("../dist/flint-factor.wasm", import.meta.url),
);
const flint = await instantiateFlintFactor(wasm);

test("production Wasm accurately omits native-only exact polynomial resources", () => {
  assert.equal(flint.ffiFmpzPolynomialFromByteRegion, undefined);
  assert.equal(flint.ffiFmpzPolynomialClose, undefined);
  assert.equal(flint.ffiFmpqPolynomialFromByteRegion, undefined);
  assert.equal(flint.ffiFmpqPolynomialClose, undefined);
  assert.ok(flintsResourceIds().includes("fmpz_mod_polynomial"));
  assert.ok(!flintsResourceIds().includes("fmpz_polynomial"));
  assert.ok(!flintsResourceIds().includes("fmpq_polynomial"));
});

function flintsResourceIds() {
  return flint.__sagejs_ffi_manifest__.resources;
}

test("packed exact polynomial fallback ships its synchronous helper", async () => {
  const config = JSON.parse(
    await fs.readFile(
      new URL("../../../scripts/precompiled-python-packages.json", import.meta.url),
      "utf8",
    ),
  );
  assert.ok(
    config.taskRuntimeImports.includes(
      "sagejs.polynomial_algorithms.structural_calculus",
    ),
  );
  assert.ok(config.taskRuntimeImports.includes("multiprocessing"));

  const bundle = JSON.parse(
    await fs.readFile(new URL("../dist/lazy-modules.json", import.meta.url), "utf8"),
  );
  assert.equal(bundle.schema, "sagejs.lazy-module-bundle/v1");
  assert.ok(bundle.modules["sagejs.polynomial_algorithms.structural_calculus"]);
  assert.ok(bundle.modules.multiprocessing);
});
