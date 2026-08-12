#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const root = join(__dirname, "..");
const modulePath = join(
  root,
  "src/lib/sagejs/polynomial_algorithms/extension_resource_contract.py",
);
const moduleSource = readFileSync(modulePath, "utf8");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    timeout: 120_000,
    ...options,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}

function runSagejsContract(source) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-extension-contract-"));
  const filename = join(directory, "witness.py");
  try {
    writeFileSync(filename, `${moduleSource}\n${source}\n`);
    return run(process.execPath, [join(root, "bin/sagejs"), filename], {
      env: { ...process.env, SAGEJS_NATIVE_DISABLE: "1" },
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const contractWitness = String.raw`
def assert_raises(exception, operation):
    try:
        operation()
    except exception:
        return
    raise AssertionError("expected " + str(exception))

descriptor = extension_context_descriptor(3, 2, [1, 0, 1], "a")
assert descriptor == (3, 2, (1, 0, 1), "a")

# Equivalent metadata is not resource identity.  Separately owned contexts do
# not mix even if both were constructed from this descriptor.
context = object()
other_context = object()
require_context_identity(context, context)
assert_raises(TypeError, lambda: require_context_identity(context, other_context))

element_coordinates = [1, 2]
assert checked_element_coordinates(3, 2, element_coordinates) is element_coordinates

# Rows are coefficients low-to-high; columns are the 1,a power basis.  The last
# two coefficient rows are zero and therefore disappear from logical storage.
coordinates = [1, 1, 0, 0, 0, 2, 0, 0, 0, 0]
calls = []
sentinel = object()

def construct(actual_context, storage, coefficient_count):
    calls.append((actual_context, storage, coefficient_count))
    return sentinel

answer = construct_extension_polynomial(
    context, 3, 2, coordinates, 5, construct
)
assert answer is sentinel
assert calls == [(context, coordinates, 3)]

export_calls = []
canonical = coordinates[:6]

def export_coordinates(resource):
    export_calls.append(resource)
    return context, 3, canonical

count, exported = export_extension_polynomial(
    context, sentinel, 3, 2, export_coordinates
)
assert count == 3 and exported is canonical
assert export_calls == [sentinel]

zero_calls = []
zero = construct_extension_polynomial(
    context,
    3,
    2,
    [],
    0,
    lambda actual, storage, count: zero_calls.append(
        (actual, storage, count)
    ) or "zero",
)
assert zero == "zero" and zero_calls == [(context, [], 0)]

assert_raises(
    TypeError,
    lambda: export_extension_polynomial(
        context, sentinel, 3, 2, lambda _resource: (other_context, 3, canonical)
    ),
)
assert_raises(
    ValueError,
    lambda: export_extension_polynomial(
        context,
        sentinel,
        3,
        2,
        lambda _resource: (context, 4, canonical + [0, 0]),
    ),
)

for invalid in [True, 3.0, "3"]:
    assert_raises(
        TypeError,
        lambda invalid=invalid: extension_context_descriptor(
            invalid, 2, [1, 0, 1], "a"
        ),
    )
assert_raises(
    ValueError,
    lambda: extension_context_descriptor(3, 1, [1, 1], "a"),
)
assert_raises(
    ValueError,
    lambda: extension_context_descriptor(3, 2, [1, 0, 2], "a"),
)
assert_raises(
    ValueError,
    lambda: extension_context_descriptor(3, 2, [1, 3, 1], "a"),
)
assert_raises(
    TypeError,
    lambda: extension_context_descriptor(3, 2, [1, 0, 1], "not a name"),
)
assert_raises(
    ValueError,
    lambda: checked_polynomial_coordinates(
        3, 2, [1, 0, 2], 2, normalize_trailing_zeroes=True
    ),
)
assert_raises(
    ValueError,
    lambda: checked_polynomial_coordinates(
        3, 2, [1, 3], 1, normalize_trailing_zeroes=True
    ),
)
assert_raises(
    TypeError,
    lambda: checked_polynomial_coordinates(
        3, 2, [True, 0], 1, normalize_trailing_zeroes=True
    ),
)

print("extension-polynomial-resource-contract-ok")
`;

test("bulk extension-polynomial contract is CPython and Sage.js compatible", () => {
  const python = process.env.PYTHON ||
    (process.platform === "win32" ? "python" : "python3");
  const pythonSource = `import sys\nsys.path.insert(0, ${JSON.stringify(
    join(root, "src/lib"),
  )})\nfrom sagejs.polynomial_algorithms.extension_resource_contract import *\n${contractWitness}`;
  assert.equal(
    run(python, ["-I", "-c", pythonSource]),
    "extension-polynomial-resource-contract-ok",
  );
  assert.equal(
    runSagejsContract(contractWitness),
    "extension-polynomial-resource-contract-ok",
  );
});

const publicSemantics = String.raw`
import json
prime = GF(3)
modulus_ring = PolynomialRing(prime, "u")
u = modulus_ring.gen()
modulus = u**2 + 1
field = GF(9, "a", modulus=modulus)
a = field.gen()
same_field = GF(9, "a", modulus=modulus)
renamed_field = GF(9, "b", modulus=modulus)
other_modulus_ring = PolynomialRing(prime, "v")
v = other_modulus_ring.gen()
same_modulus = GF(9, "a", modulus=v**2 + 1)
ring = PolynomialRing(field, "x")
value = ring([a + 1, 0, 2*a, 0, 0])
try:
    value + PolynomialRing(renamed_field, "x")([renamed_field.gen() + 1])
    incompatible_rejected = False
except Exception:
    incompatible_rejected = True
print(json.dumps({
    "sameFieldIdentity": field is same_field,
    "sameNormalizedModulusIdentity": field is same_modulus,
    "renamedFieldIdentity": field is renamed_field,
    "coefficientStrings": [str(coefficient) for coefficient in value.list()],
    "degree": int(value.degree()),
    "zeroLength": len(ring(0).list()),
    "zeroDegree": int(ring(0).degree()),
    "incompatibleRejected": incompatible_rejected,
    "modulus": [str(coefficient) for coefficient in field.modulus().list()],
}))
`;

test("public extension-field semantics agree with SageMath", (t) => {
  const sagejs = JSON.parse(
    run(process.execPath, [join(root, "bin/sagejs"), "--python"], {
      input: publicSemantics,
    }),
  );
  assert.deepEqual(sagejs, {
    sameFieldIdentity: true,
    sameNormalizedModulusIdentity: true,
    renamedFieldIdentity: false,
    coefficientStrings: ["a + 1", "0", "2*a"],
    degree: 2,
    zeroLength: 0,
    zeroDegree: -1,
    incompatibleRejected: true,
    modulus: ["1", "0", "1"],
  });

  const sage = process.env.SAGE_BIN || "/home/user/sagelite/sage";
  if (!existsSync(sage)) {
    t.skip("SageMath oracle is unavailable");
    return;
  }
  const sageOutput = run(sage, ["-c", publicSemantics]);
  const oracle = JSON.parse(sageOutput.split(/\r?\n/).at(-1));
  assert.deepEqual(sagejs, oracle);
});
