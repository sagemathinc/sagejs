import assert from "node:assert/strict";
import test from "node:test";

import {
  createDirichletGroupBackend,
  dirichletGroupWasmExports,
} from "../dirichlet-group.mjs";

function fixtureInstance({ vectorStatus = 2 } = {}) {
  const memory = new WebAssembly.Memory({ initial: 1 });
  const packed = new Uint32Array(memory.buffer, 64, 5);
  packed.set([0xffffffff, 0, 2, 2, 0]);
  let initialized = false;
  let character = false;
  let clears = 0;
  const exports = {
    memory,
    sagejs_wasm_dirichlet_group_begin(modulus) {
      initialized = modulus === 5n;
      return initialized ? 1 : 0;
    },
    sagejs_wasm_dirichlet_group_clear() {
      initialized = false;
      character = false;
      clears += 1;
    },
    sagejs_wasm_dirichlet_group_modulus: () => 5n,
    sagejs_wasm_dirichlet_group_size: () => 4n,
    sagejs_wasm_dirichlet_group_exponent: () => 4n,
    sagejs_wasm_dirichlet_group_number_primitive: () => 3n,
    sagejs_wasm_dirichlet_group_component_count: () => 1,
    sagejs_wasm_dirichlet_group_component_order: () => 4n,
    sagejs_wasm_dirichlet_group_generator: () => 2n,
    sagejs_wasm_dirichlet_character_begin(index) {
      character = initialized && index < 4n;
      return character ? 1 : 0;
    },
    sagejs_wasm_dirichlet_character_conrey_number: () => 4n,
    sagejs_wasm_dirichlet_character_conductor: () => 5n,
    sagejs_wasm_dirichlet_character_order: () => 2n,
    sagejs_wasm_dirichlet_character_is_even: () => 1,
    sagejs_wasm_dirichlet_character_is_principal: () => 0,
    sagejs_wasm_dirichlet_character_is_real: () => 1,
    sagejs_wasm_dirichlet_character_is_primitive: () => 1,
    sagejs_wasm_dirichlet_character_exponent_compute(residue) {
      if (!character || residue >= 5n) return 0;
      return residue === 0n ? 1 : 2;
    },
    sagejs_wasm_dirichlet_character_exponent_value: () => 2n,
    sagejs_wasm_dirichlet_character_exponents_compute: () => vectorStatus,
    sagejs_wasm_dirichlet_character_exponents: () => 64,
    sagejs_wasm_dirichlet_character_exponent_count: () => 5,
    sagejs_wasm_dirichlet_character_max_vector_entries: () => 1048576,
  };
  return {
    instance: { exports },
    clearCount: () => clears,
  };
}

test("browser Dirichlet backend exposes the complete public character bridge", () => {
  const fixture = fixtureInstance();
  const backend = createDirichletGroupBackend(fixture.instance);
  const group = backend.dirichletGroup(5n);

  assert.deepEqual(backend.dirichletGroupData(group), {
    modulus: 5n,
    size: 4n,
    exponent: 4n,
    numberPrimitive: 3n,
    orders: [4n],
    generators: [2n],
  });
  assert.deepEqual(backend.dirichletCharacterData(group, 2n), {
    conreyNumber: 4n,
    conductor: 5n,
    order: 2n,
    even: true,
    principal: false,
    real: true,
    primitive: true,
  });
  assert.equal(backend.dirichletCharacterExponent(group, 2n, 0n), null);
  assert.equal(backend.dirichletCharacterExponent(group, 2n, 2n), 2n);
  assert.deepEqual(
    backend.dirichletCharacterExponents(group, 2n),
    [null, 0n, 2n, 2n, 0n],
  );
  assert.equal(backend.isDirichletGroup(group), true);
  assert.equal(backend.dirichletGroupModulus(group), 5n);
  assert.equal(fixture.clearCount(), 5);
});

test("browser Dirichlet backend enforces ownership, ABI completeness, and limits", () => {
  const limited = fixtureInstance({ vectorStatus: 1 });
  const backend = createDirichletGroupBackend(limited.instance);
  const group = backend.dirichletGroup(5n);
  const other = createDirichletGroupBackend(fixtureInstance().instance);

  assert.throws(() => other.dirichletGroupData(group), /browser FLINT/);
  assert.throws(
    () => backend.dirichletCharacterExponents(group, 2n),
    /1048576-entry browser limit/,
  );
  assert.equal(limited.clearCount(), 1);

  const incomplete = fixtureInstance().instance;
  delete incomplete.exports.sagejs_wasm_dirichlet_character_conductor;
  assert.throws(
    () => createDirichletGroupBackend(incomplete),
    /missing sagejs_wasm_dirichlet_character_conductor/,
  );
  assert.ok(dirichletGroupWasmExports.includes("memory"));
});
