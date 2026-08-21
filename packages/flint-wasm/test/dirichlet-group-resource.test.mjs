import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createDirichletGroupBackend } from "../dirichlet-group.mjs";
import { createWasiHost } from "../src/wasi-runtime.mjs";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function findArtifact() {
  return [
    process.env.SAGEJS_DIRICHLET_WASM,
    path.join(packageRoot, "dist", "flint-factor.wasm"),
  ]
    .filter(Boolean)
    .find((candidate) => fs.existsSync(candidate));
}

test("real FLINT Wasm preserves Sage Dirichlet indexing and character data", async (t) => {
  const artifact = findArtifact();
  if (artifact === undefined) {
    t.skip("the production FLINT Wasm artifact has not been built");
    return;
  }
  const module = await WebAssembly.compile(fs.readFileSync(artifact));
  const names = new Set(
    WebAssembly.Module.exports(module).map(({ name }) => name),
  );
  if (!names.has("sagejs_wasm_dirichlet_character_exponents_compute")) {
    t.skip("the integration lane has not linked the Dirichlet bridge");
    return;
  }

  const wasi = createWasiHost();
  const instance = await WebAssembly.instantiate(module, {
    wasi_snapshot_preview1: wasi.imports,
  });
  wasi.initialize(instance);
  const flint = createDirichletGroupBackend(instance);

  const group = flint.dirichletGroup(12n);
  assert.deepEqual(flint.dirichletGroupData(group), {
    modulus: 12n,
    size: 4n,
    exponent: 2n,
    numberPrimitive: 1n,
    orders: [2n, 2n],
    generators: [7n, 5n],
  });
  assert.deepEqual(flint.dirichletCharacterData(group, 1n), {
    conreyNumber: 7n,
    conductor: 4n,
    order: 2n,
    even: false,
    principal: false,
    real: true,
    primitive: false,
  });
  assert.equal(flint.dirichletCharacterExponent(group, 1n, 7n), 1n);
  assert.equal(flint.dirichletCharacterExponent(group, 1n, 5n), 0n);
  assert.equal(flint.dirichletCharacterExponent(group, 1n, 6n), null);
  assert.deepEqual(
    flint.dirichletCharacterExponents(group, 1n),
    [null, 0n, null, null, null, 0n, null, 1n, null, null, null, 1n],
  );

  const quadratic = flint.dirichletGroup(5n);
  assert.deepEqual(flint.dirichletCharacterData(quadratic, 2n), {
    conreyNumber: 4n,
    conductor: 5n,
    order: 2n,
    even: true,
    principal: false,
    real: true,
    primitive: true,
  });
  assert.deepEqual(
    flint.dirichletCharacterExponents(quadratic, 2n),
    [null, 0n, 2n, 2n, 0n],
  );
});

test("real FLINT Wasm rejects invalid Dirichlet inputs without retaining state", async (t) => {
  const artifact = findArtifact();
  if (artifact === undefined) {
    t.skip("the production FLINT Wasm artifact has not been built");
    return;
  }
  const module = await WebAssembly.compile(fs.readFileSync(artifact));
  if (!WebAssembly.Module.exports(module).some(
    ({ name }) => name === "sagejs_wasm_dirichlet_character_begin",
  )) {
    t.skip("the integration lane has not linked the Dirichlet bridge");
    return;
  }
  const wasi = createWasiHost();
  const instance = await WebAssembly.instantiate(module, {
    wasi_snapshot_preview1: wasi.imports,
  });
  wasi.initialize(instance);
  const flint = createDirichletGroupBackend(instance);
  const group = flint.dirichletGroup(12n);

  assert.throws(() => flint.dirichletGroup(12), /BigInt/);
  assert.throws(() => flint.dirichletGroup(0n), /unsigned browser FLINT word/);
  assert.throws(
    () => flint.dirichletCharacterData(group, 4n),
    /out of range/,
  );
  assert.throws(
    () => flint.dirichletCharacterExponent(group, 0n, 12n),
    /reduced/,
  );
  assert.throws(
    () => flint.dirichletGroupData(Object.freeze({ modulus: 12n })),
    /browser FLINT Dirichlet group/,
  );
  assert.equal(flint.dirichletGroupData(group).size, 4n);
});
