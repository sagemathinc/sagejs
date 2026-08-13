#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const root = resolve(__dirname, "..");

function runSage(source, environment = {}) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-forced-fq-scalar-"));
  try {
    const script = join(directory, "check.py");
    writeFileSync(script, source);
    const result = spawnSync(
      process.execPath,
      [join(root, "bin/sagejs"), "--python", script],
      {
        cwd: root,
        encoding: "utf8",
        env: { ...process.env, ...environment },
        timeout: 120_000,
      },
    );
    if (result.error) throw result.error;
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    return result.stdout.trim().split("\n").at(-1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const semantics = String.raw`
from sagejs.polynomial_algorithms.extension_scalar_resource import (
    ForcedGeneratedFqElement,
    ForcedGeneratedFqField,
    decode_coordinate_bytes,
    deserialize_element_payload,
    stable_element_hash,
)

field = ForcedGeneratedFqField(3, 2, (1, 0, 1), "a")
other_field = ForcedGeneratedFqField(3, 2, (1, 0, 1), "a")
resources = []

def keep(value):
    resources.append(value)
    return value

a = keep(field.element((1, 2)))
b = keep(field.element((2, 1)))
zero = keep(field.zero())
one = keep(field.one())
assert isinstance(a, ForcedGeneratedFqElement)
assert not hasattr(a, "_native")
assert a.coordinates() == (1, 2)
assert zero.is_zero() and not zero.is_one()
assert one.is_one() and not one.is_zero()

assert keep(a + b).coordinates() == (0, 0)
assert keep(a - b).coordinates() == (2, 1)
assert keep(a * b).coordinates() == (0, 2)
assert keep(-a).coordinates() == (2, 1)
inverse = keep(a.inverse())
assert inverse.coordinates() == (2, 2)
assert keep(a * inverse).is_one()
assert keep(a / b).coordinates() == (2, 0)
assert keep(a ** -3).coordinates() == (2, 1)
huge = (1 << 100) + 17
assert keep(a ** huge) == keep(a ** (huge % 8))
negative_huge = -((1 << 100) + 17)
assert keep(a ** negative_huge) == keep(a ** (negative_huge % 8))

for operation in [lambda: zero.inverse(), lambda: zero ** -1, lambda: a / zero]:
    try:
        operation()
    except ZeroDivisionError:
        pass
    else:
        raise AssertionError("zero division was accepted")
incompatible = keep(other_field.element((1, 2)))
try:
    a + incompatible
except TypeError:
    pass
else:
    raise AssertionError("distinct generated contexts were mixed")

payload = a.serialize()
assert payload == ((3, 2, (1, 0, 1), "a"), (1, 2))
assert deserialize_element_payload(payload) == payload
assert hash(a) == stable_element_hash(payload)
round_trip = keep(field.deserialize(payload))
assert round_trip == a and hash(round_trip) == hash(a)
rebuilt_field, rebuilt = ForcedGeneratedFqField.reconstruct(payload)
resources.append(rebuilt)
assert rebuilt.serialize() == payload
assert hash(rebuilt) == hash(a)
assert rebuilt != a

field.close()
assert field.closed
assert a.coordinates() == (1, 2)
after_close = keep(-a)
assert after_close.coordinates() == (2, 1)
try:
    field.element((0, 0))
except RuntimeError:
    pass
else:
    raise AssertionError("closed public context accepted a new dependent")

for resource in reversed(resources):
    resource.close()
    resource.close()
rebuilt_field.close()
rebuilt_field.close()
other_field.close()
other_field.close()
field.close()
print("forced-generated-fq-scalar-ok")
`;

test("forced generated finite-extension scalars are a complete owner slice", () => {
  assert.equal(runSage(semantics), "forced-generated-fq-scalar-ok");
  assert.equal(
    runSage(semantics, { SAGEJS_NATIVE_DISABLE: "1" }),
    "forced-generated-fq-scalar-ok",
  );
});

test("scalar payload validation remains ordinary CPython", () => {
  const source = [
    "import sys",
    `sys.path.append(${JSON.stringify(join(root, "src/lib"))})`,
    "from sagejs.polynomial_algorithms.extension_scalar_contract import canonical_element_payload, decode_coordinate_bytes, deserialize_element_payload, stable_element_hash",
    "payload = canonical_element_payload((3, 2, (1, 0, 1), 'a'), (1, 2))",
    "assert deserialize_element_payload(payload) == payload",
    "assert stable_element_hash(payload) == 1322546476",
    "try:",
    "    deserialize_element_payload(((3, 2, (1, 0, 1), 'a'), (1, 3)))",
    "except ValueError:",
    "    pass",
    "else:",
    "    raise AssertionError('noncanonical coordinate accepted')",
    "encoded = b'SJFE' + bytes((1, 0, 0, 0)) + (2).to_bytes(8, 'little') + (1).to_bytes(8, 'little') + (2).to_bytes(8, 'little')",
    "assert decode_coordinate_bytes(encoded, 2) == (1, 2)",
    "for malformed in (b'BAD!' + encoded[4:], encoded[:4] + bytes((2,)) + encoded[5:], encoded[:-1]):",
    "    try:",
    "        decode_coordinate_bytes(malformed, 2)",
    "    except ValueError:",
    "        pass",
    "    else:",
    "        raise AssertionError('malformed SJFE payload accepted')",
  ].join("\n");
  const result = spawnSync("python3", ["-c", source], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});

test("SJFE coordinate transfer is versioned and fails closed", () => {
  const modulePath = join(
    root,
    "src/lib/sagejs/polynomial_algorithms/extension_scalar_resource.py",
  );
  const source = require("node:fs").readFileSync(modulePath, "utf8");
  assert.match(source, /ASCII "SJFE"/);
  assert.match(source, /version 1/);
  assert.match(source, /little-endian uint64 coordinates/);
  assert.match(source, /fails\s+loudly/);
  assert.doesNotMatch(source, /flint_backend|fqFromBigInt|_native\b/);
});
