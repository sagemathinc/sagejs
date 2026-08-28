// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

const lmfdb = JSON.parse(
  readFileSync(
    path.join(__dirname, "fixtures/mestre-lmfdb-level-37.json"),
    "utf8",
  ),
);

test(
  "Mestre's identity reconstructs both level-37 rational newforms",
  { timeout: 120_000 },
  async () => {
    const expected = Object.fromEntries(
      lmfdb.newforms.map((form) => [
        form.hecke_eigenvalues["2"],
        form.hecke_eigenvalues,
      ]),
    );
    const session = await createSage();
    try {
      const result = await session.evaluate(`
S = SupersingularModule(37)
expected = ${JSON.stringify(expected)}
rows = []
for a2 in [-2,0]:
    packet = S.rational_eigenpacket(a2, check_primes=(3,5))
    expansion = packet.q_expansion(10)
    field = S.finite_field()
    for ell in [2,3,5,7]:
        assert expansion[ell] == field(expected[str(a2)][str(ell)])
    assert expansion[4] == expansion[2]**2 - field(2)
    assert expansion[6] == expansion[2] * expansion[3]
    assert expansion[8] == expansion[2] * expansion[4] - field(2)*expansion[2]
    assert expansion[9] == expansion[3]**2 - field(3)
    assert expansion.relation_denominator() != field(0)
    assert expansion.q_expansion() is expansion
    assert list(expansion.polynomial()) == list(expansion.coefficients())
    rows.append((
        a2,
        list(packet.vector()),
        packet.eigenvalues(),
        [str(expansion[i]) for i in range(10)],
    ))
rows
`);
      assert.equal(
        result.repr,
        "[(-2, [0, 1, -1], ((2, -2), (3, -3), (5, -2)), " +
          "['0', '1', '35', '34', '2', '35', '6', '36', '0', '6']), " +
          "(0, [2, -1, -1], ((2, 0), (3, 1), (5, 0)), " +
          "['0', '1', '0', '1', '35', '0', '0', '36', '0', '35'])]",
      );
    } finally {
      await session.close();
    }
  },
);

test(
  "rational eigenpackets and Mestre series reject ambiguous or unbounded data",
  { timeout: 120_000 },
  async () => {
    const session = await createSage();
    try {
      const result = await session.evaluate(`
S = SupersingularModule(37)
packet = S.rational_eigenpacket(-2)
for operation in [
    lambda: S.rational_eigenpacket(3),
    lambda: S.rational_eigenpacket(1),
    lambda: packet.q_expansion(1),
    lambda: packet.q_expansion(11, max_series_terms=10),
]:
    try:
        operation()
    except (ValueError, MemoryError):
        pass
    else:
        raise AssertionError("an invalid Mestre request was accepted")
coefficients = packet.q_expansion(8).coefficients()
try:
    coefficients[0] = S.finite_field()(1)
except TypeError:
    pass
else:
    raise AssertionError("Mestre coefficients were mutable")
True
`);
      assert.equal(result.repr, "True");
    } finally {
      await session.close();
    }
  },
);
