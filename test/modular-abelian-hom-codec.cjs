// sagejs-test-tier: unit
// sagejs-test-portable: true
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const codec = require("../dist/tools/serialization-codecs/modular-abelian-varieties.js");

test("Hom decoding recomputes the complete lattice and binds endpoints", () => {
  const basis = { __eq__: x => x === basis };
  const codomain = {};
  const parent = { basis_matrix: () => basis };
  const domain = { Hom: B => { assert.equal(B, codomain); return parent; } };
  const data = { kind: "ModularAbelianHomSpace", domain, codomain, basis };
  assert.equal(codec.decodeModularAbelianParent(data), parent);
  assert.throws(() => codec.decodeModularAbelianParent({...data, basis: {}}), /Hom lattice/);
  assert.throws(() => codec.decodeModularAbelianParent({...data, basis: undefined}), /Hom lattice/);
  assert.throws(() => codec.decodeModularAbelianParent({...data, codomain: {}}));
});
