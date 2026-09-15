// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

test("modular dictionary keys use their canonical identity", async (t) => {
  const session = await createSage({ mode: "python" });
  t.after(() => session.close());

  const result = await session.evaluate(String.raw`
order = 22974332779312916308087541215025543130953873335484909873
ring = Zmod(2 * order + 1)
base = ring(3)

# Count semantic equality calls. Fresh equal elements from one parent have a
# shared canonical dictionary identity and must not scan the table.
original_eq = FiniteFieldElement.__eq__
equality_calls = [0]


def observed_eq(self, other):
    equality_calls[0] += 1
    return original_eq(self, other)


FiniteFieldElement.__eq__ = observed_eq
mapping = {}
current = ring(1)
for index in range(2048):
    mapping[current] = index
    current *= base
assert len(mapping) == 2048
assert mapping[base**2047] == 2047
assert equality_calls == [0], equality_calls
FiniteFieldElement.__eq__ = original_eq

# Preserve Python's original-key identity and cross-type equality behavior.
stored = ring(1)
mapping = {stored: "modular"}
mapping[ring(1)] = "fresh"
assert len(mapping) == 1
assert list(mapping.keys())[0] is stored
assert mapping[1] == "fresh"
mapping[1] = "integer"
assert len(mapping) == 1
assert list(mapping.keys())[0] is stored
assert mapping[ring(1)] == "integer"
stored_mapping = mapping

# The mixed-key indexes survive copying and every mutating removal path.
copied = mapping.copy()
assert copied[1] == "integer"
assert copied.setdefault(ring(1), "unused") == "integer"
assert copied.pop(ring(1)) == "integer"
assert copied == {}

mapping = {1: "integer-first"}
mapping[ring(1)] = "modular-update"
assert len(mapping) == 1
assert list(mapping.keys())[0] == 1
assert mapping[ring(1)] == "modular-update"
mapping.clear()
mapping[ring(2)] = "after-clear"
assert mapping[2] == "after-clear"
assert mapping.popitem()[1] == "after-clear"
mapping[3] = "ordinary-again"
assert mapping[3] == "ordinary-again"

# Canonical identities are scoped to the parent; equal residues in unrelated
# modular rings must remain distinct when their mathematical equality is false.
other = Zmod(7)(1)
assert stored != other
stored_mapping[other] = "other"
assert len(stored_mapping) == 2
assert stored_mapping[stored] == "integer"
assert stored_mapping[other] == "other"
print("MODULAR_DICTIONARY_KEYS_OK")
`);

  assert.equal(result.stdout.trim(), "MODULAR_DICTIONARY_KEYS_OK");
});
