// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

const root = join(__dirname, "..");

test("small modular scalars use exact machine residues with BigInt fallback", async (t) => {
  const session = await createSage();
  t.after(() => session.close());

  const result = await session.evaluate(String.raw`
import sagejs.runtime as runtime


def expect_failure(function, exception, fragment):
    try:
        function()
    except exception as error:
        assert fragment in str(error), str(error)
        return
    raise AssertionError("operation unexpectedly succeeded")


small_prime = 94906249
large_prime = 94906297
small_field = GF(small_prime)
large_field = GF(large_prime)
assert runtime.jstype(small_field(1)._value) == "number"
assert runtime.jstype(large_field(1)._value) == "bigint"

machine_ring = Zmod(94906266)
bigint_ring = Zmod(94906267)
assert runtime.jstype(machine_ring(1)._value) == "number"
assert runtime.jstype(bigint_ring(1)._value) == "bigint"

# Exercise the exact Number ceiling.  Both rings must produce the same
# mathematical answers even though they deliberately use different storage.
for ring in (machine_ring, bigint_ring):
    modulus = int(ring.order())
    minus_one = ring(modulus - 1)
    assert int(minus_one * minus_one) == 1
    assert int(minus_one * minus_one + minus_one) == 0
    assert int(-minus_one) == 1
    assert int(minus_one / minus_one) == 1
    assert int(minus_one**12345) == modulus - 1

field = GF(65521)
state = 1
for index in range(128):
    state = (state * 48271 + 17) % 65521
    other = (state * 73 + 29) % 65521
    if other == 0:
        other = 1
    left = field(state)
    right = field(other)
    assert int(left + right) == (state + other) % 65521
    assert int(left - right) == (state - other) % 65521
    assert int(left * right) == (state * other) % 65521
    assert (left / right) * right == left
    assert int(left**17) == pow(state, 17, 65521)

# Coercion and ordinary Python dispatch must remain outside the guarded path.
assert field(7) + 3 == field(10)
assert 3 + field(7) == field(10)
assert field(7) * 3 == field(21)
assert 3 * field(7) == field(21)


class Addable:
    def __init__(self, value):
        self.value = value

    def __add__(self, other):
        return self.value + other.value


assert Addable(4) + Addable(9) == 13
expect_failure(lambda: field(1) + GF(101)(1), TypeError, "coercion")

# Removing Object.freeze from the allocation hot path must not weaken Python
# immutability, including deletion followed by replacement.
value = field(37)
expect_failure(lambda: setattr(value, "_value", 2), AttributeError, "immutable")
expect_failure(lambda: setattr(value, "note", 2), AttributeError, "immutable")
expect_failure(lambda: delattr(value, "_value"), AttributeError, "immutable")
assert int(value) == 37

# Exercise consumers which previously assumed every residue was a BigInt.
assert sum(field(index) for index in range(100)) == field(sum(range(100)))
matrix_value = matrix(field, 3, 3, [1, 2, 3, 4, 5, 6, 7, 8, 10])
assert int(matrix_value.det()) == 65518
assert matrix_value * matrix_value.inverse() == identity_matrix(field, 3)
assert matrix_value.charpoly()(matrix_value).is_zero()
polynomial_ring = PolynomialRing(field, "x")
x = polynomial_ring.gen()
polynomial = (x + field(7)) * (x**2 + field(11) * x + field(13))
assert polynomial(field(19)) == (field(19) + 7) * (
    field(19) ** 2 + 11 * field(19) + 13
)
assert field(7).is_unit()
assert field(7).multiplicative_order() == 6552
assert field(4).sqrt() ** 2 == field(4)
assert Zmod(35)(12).is_unit()
assert not Zmod(35)(14).is_unit()
assert Zmod(101)(51).rational_reconstruction() == QQ(1, 2)

keyed = {field(17): "seventeen"}
assert keyed[field(17)] == "seventeen"
print("FINITE_FIELD_MACHINE_RESIDUES_OK")
`);

  assert.equal(result.stdout.trim(), "FINITE_FIELD_MACHINE_RESIDUES_OK");
});

test("closed-scalar compiler guards stay native and branch directly", () => {
  const generated = readFileSync(
    join(root, "dist", "runtime-cache", "runtime-bootstrap-sage.js"),
    "utf8",
  );
  const start = generated.indexOf("function ρσ_fast_closed_binary(");
  assert.notEqual(start, -1);
  const stop = generated.indexOf("\n};", start);
  assert.notEqual(stop, -1);
  const body = generated.slice(start, stop);
  assert.match(body, /typeof left === "object"/);
  assert.match(body, /parent === right\._parent/);
  for (const operation of ["add", "sub", "mul", "truediv"]) {
    assert.match(body, new RegExp(`case "${operation}"`));
    assert.match(body, new RegExp(`left\\._${operation}_\\(right\\)`));
  }
  assert.doesNotMatch(body, /ρσ_bool|Reflect\.get|ρσ_resolve_callable/);
});
