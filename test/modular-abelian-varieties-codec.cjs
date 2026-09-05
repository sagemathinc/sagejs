// sagejs-test-tier: portable
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const serialization = require("../dist/tools/serialization.js");

test("canonical homology map decoding binds endpoints and matrix", () => {
  // Capture the registered production codec; plain stand-ins let this contract
  // run without constructing native modular-symbol resources.
  const codecs = [];
  const original = serialization.registerCodec;
  serialization.registerCodec = (codec) => { codecs.push(codec); return () => {}; };
  try {
    require("../dist/tools/serialization-codecs/modular-forms.js")
      .registerModularFormsCodecs();
  } finally {
    serialization.registerCodec = original;
  }
  const codec = codecs.find((entry) => entry.type === "sage.modular_forms.operator");
  assert.ok(codec);
  const implementation = require.resolve("../dist/tools/serialization-codecs/modular-abelian-varieties.js");
  assert.equal(require.cache[implementation], undefined,
    "registering ordinary modular-form codecs must not load abelian-variety codecs");
  const value = (id) => ({
    _kind: "ModularAbelianVariety",
    __eq__(other) { return other?.id === id; },
    id,
  });
  const domain = value("domain"), codomain = value("codomain"), matrix = value("matrix");
  const canonical = {
    domain: () => domain, codomain: () => codomain, matrix: () => matrix,
  };
  codomain.quotient_map = () => canonical;
  domain.inclusion_map = () => canonical;
  const data = { kind: "ModularAbelianVarietyMap", domain, codomain, matrix, quotient: true };
  const decode = (changes = {}) => codec.decode(null, {
    decode: () => ({ ...data, ...changes }),
  });
  assert.equal(decode(), canonical);
  assert.ok(require.cache[implementation]);
  assert.equal(decode({ quotient: false }), canonical);
  assert.throws(() => decode({ matrix: value("doubled") }), /matrix differs/);
  assert.throws(() => decode({ matrix: undefined }), /invalid canonical/);
  assert.throws(() => decode({ domain: value("other-domain") }), /domain differs/);
  assert.throws(() => decode({ quotient: 1 }), /invalid canonical/);
  const other = value("other-codomain");
  other.quotient_map = () => canonical;
  assert.throws(() => decode({ codomain: other }), /codomain differs/);
});
