#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");

const root = resolve(__dirname, "..");
const sagejs = resolve(root, "bin", "sagejs");
const serialization = require("../dist/tools/serialization.js");

function run(source, environment = {}) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-arbitrary-prime-public-"));
  try {
    const program = join(directory, "check.py");
    writeFileSync(program, source);
    const result = spawnSync(sagejs, [program], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        SAGEJS_FORBID_POLYNOMIAL_NAPI: "1",
        ...environment,
      },
      timeout: 180_000,
    });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.doesNotMatch(result.stderr, /forbidden legacy mathematical N-API/);
    assert.doesNotMatch(result.stdout, /Inconsistent indentation/);
    return result.stdout.trim();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const behavior = String.raw`
import sagejs._baselib.polynomial as polynomial_module
from sagejs.ffi.flint import (
    FlintByteRegion,
    fmpz_mod_polynomial_deserialize,
    fmpz_mod_polynomial_length,
)

for p in [2**89 - 1, 2**127 - 1, 2**521 - 1]:
    R = PolynomialRing(GF(p), "x")
    x = R.gen()
    f = (p - 3)*x**4 + 5*x + 11
    g = x**2 + 7*x + 9
    assert polynomial_module._packed_polynomial_kind(R.base_ring()) == "GF_ARB"
    assert f._has_fmpz_mod_polynomial_resource()
    assert f.coefficients(sparse=False) == [GF(p)(11), GF(p)(5), GF(p)(0), GF(p)(0), GF(p)(p - 3)]
    assert (f + g)._has_fmpz_mod_polynomial_resource()
    assert (f*g)._has_fmpz_mod_polynomial_resource()
    assert (f + g) - g == f
    quotient, remainder = (f*g).quo_rem(f)
    assert quotient._has_fmpz_mod_polynomial_resource()
    assert remainder._has_fmpz_mod_polynomial_resource()
    assert quotient == g and remainder == 0
    assert (f*g) // f == g
    gcd, left, right = f.xgcd(g)
    assert left*f + right*g == gcd
    assert f(123456789) == sum(
        coefficient * GF(p)(123456789)**index
        for index, coefficient in enumerate(f.coefficients(sparse=False))
    )
    assert str(f) == str(p - 3) + "*x^4 + 5*x + 11"
    assert not R(0).is_irreducible()
    assert not R(7).is_irreducible()
    assert x.is_irreducible()
    assert not ((x - 1)*(x + 2)).is_irreducible()

    repeated = (x - 7)**4 * (x + 11)**2
    roots = repeated.roots()
    assert len(roots) == 2
    assert any(root == GF(p)(7) and multiplicity == 4 for root, multiplicity in roots)
    assert any(root == GF(p)(p - 11) and multiplicity == 2 for root, multiplicity in roots)
    target = GF(p)(13) * (x - 1)**2 * (x + 2)**3
    factorization = target.factor()
    assert factorization.value() == target
    assert factorization.unit() == GF(p)(13)
    assert sorted(exponent for _factor, exponent in factorization) == [2, 3]

    encoded = dumps(f)
    assert encoded == dumps(f)
    restored = loads(encoded)
    assert restored == f
    assert restored.parent() is R
    assert restored.parent().variable_name() == "x"
    assert restored._has_fmpz_mod_polynomial_resource()

# Parent adoption rejects a mismatched modulus and deterministically closes the
# rejected child instead of leaking it.
p = 2**89 - 1
q = 2**127 - 1
R = PolynomialRing(GF(p), "x")
S = PolynomialRing(GF(q), "y")
payload = R.gen()._packed_arbitrary_prime_polynomial()
region = FlintByteRegion.from_bytes(payload)
foreign = fmpz_mod_polynomial_deserialize(region)
region.close()
try:
    S._from_fmpz_mod_polynomial_resource(foreign)
except ValueError:
    pass
else:
    raise AssertionError("mismatched arbitrary-prime resource was adopted")
print("PUBLIC_ARBITRARY_PRIME_POLYNOMIAL_OK")
`;

for (const environment of [{}, { SAGEJS_NATIVE_DISABLE: "1" }]) {
  assert.match(run(behavior, environment), /PUBLIC_ARBITRARY_PRIME_POLYNOMIAL_OK$/);
}

// This is an honest capability boundary, not a dynamic-native toggle. Before
// this slice, >word-size GF(p)[x] construction failed here; absent generated
// resources continue to reject it until portable aggregate Wasm lowering is
// implemented.
const absent = String.raw`
import sagejs._baselib.polynomial as polynomial_module
polynomial_module._generated_flint_resources_available_cache = False
p = 2**89 - 1
R = PolynomialRing(GF(p), "z")
assert polynomial_module._packed_polynomial_kind(R.base_ring()) == "legacy"
R.gen()
`;
const absentDirectory = mkdtempSync(join(tmpdir(), "sagejs-arbitrary-prime-absent-"));
try {
  const absentProgram = join(absentDirectory, "absent.py");
  writeFileSync(absentProgram, absent);
  const failure = spawnSync(sagejs, [absentProgram], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, SAGEJS_FORBID_POLYNOMIAL_NAPI: "0" },
    timeout: 30_000,
  });
  assert.notEqual(failure.status, 0);
  assert.match(failure.stderr, /BigInt does not fit in an unsigned FLINT word/);
} finally {
  rmSync(absentDirectory, { recursive: true, force: true });
}

function u64(value) {
  const output = [];
  let remaining = BigInt(value);
  for (let index = 0; index < 8; index += 1) {
    output.push(Number(remaining & 255n));
    remaining >>= 8n;
  }
  return output;
}

function unsigned(value) {
  let remaining = BigInt(value);
  const bytes = [];
  do {
    bytes.push(Number(remaining & 255n));
    remaining >>= 8n;
  } while (remaining !== 0n);
  return [...u64(bytes.length), ...bytes];
}

function payload(modulus, coefficients) {
  return Uint8Array.from([
    83, 74, 77, 80, 1, 0, 0, 0,
    ...unsigned(modulus),
    ...u64(coefficients.length),
    ...coefficients.flatMap(unsigned),
  ]);
}

// The stable SagePack codec transfers one canonical resource payload and its
// portable decoder validates it before asking the mathematical parent to
// construct an answer.
const modulus = (1n << 89n) - 1n;
const base = { _kind: "GF", _order: modulus };
const parent = {
  _construction: { kind: "polynomial", base, variable: "z", sparse: true },
  base_ring() { return base; },
  _from_coefficients(coefficients) { return coefficients; },
};
const canonical = payload(modulus, [11n, 5n, modulus - 3n]);
const value = {
  _parent: parent,
  _packed_arbitrary_prime_polynomial() { return canonical; },
  coefficients() { throw new Error("resource codec materialized coefficients"); },
};
let transferred;
const wire = serialization.sageArithmeticElementCodec.encode(value, {
  encode: (item) => item,
  buffer: () => { throw new Error("nested packet encoding is not used"); },
  transferable: (bytes) => { transferred = bytes; return bytes; },
});
assert.equal(wire.coefficientEncoding, "fmpz-mod-poly-le-v1");
assert.equal(wire.coefficients, transferred);
assert.deepEqual([...wire.coefficients], [...canonical]);

function decode(bytes, decodeParent = parent) {
  return serialization.sageArithmeticElementCodec.decode(null, {
    decode: () => ({ ...wire, parent: decodeParent, coefficients: bytes }),
  });
}
assert.deepEqual(decode(canonical), [11n, 5n, modulus - 3n]);
const wrongMagic = canonical.slice();
wrongMagic[0] = 0;
assert.throws(() => decode(wrongMagic), /serialization magic/);
assert.throws(() => decode(canonical.subarray(0, canonical.length - 1)), /length|truncated/);
assert.throws(() => decode(Uint8Array.from([...canonical, 0])), /trailing bytes/);
assert.throws(
  () => decode(payload(modulus, [11n, 0n])),
  /trailing zero coefficient/,
);
assert.throws(
  () => decode(payload(modulus, [modulus])),
  /outside its field/,
);
const otherBase = { _kind: "GF", _order: (1n << 127n) - 1n };
const otherParent = {
  _construction: { kind: "polynomial", base: otherBase, variable: "z", sparse: true },
  base_ring() { return otherBase; },
  _from_coefficients(coefficients) { return coefficients; },
};
assert.throws(() => decode(canonical, otherParent), /modulus does not match/);

console.log("public arbitrary-prime polynomial tests passed");
