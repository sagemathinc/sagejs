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
const lmfdb67 = JSON.parse(
  readFileSync(
    path.join(__dirname, "fixtures/mestre-lmfdb-level-67.json"),
    "utf8",
  ),
);
const magma = JSON.parse(
  readFileSync(
    path.join(__dirname, "fixtures/mestre-brandt-magma-2.18-5.json"),
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
    sturm = packet.sturm_certificate()
    assert sturm.bound() == 6
    assert sturm.modular_symbols_dimension() == 2
    assert sturm.verify()
    assert sturm.structural_data()["coefficient_mode"] == "level-characteristic-residue"
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

test(
  "quadratic level-67 packets match Magma, LMFDB, and Mestre reduction",
  { timeout: 180_000 },
  async () => {
    const expected = lmfdb67.newforms.filter((form) => form.dimension === 2);
    const magma67 = magma.cases.find((entry) => entry.prime === 67);
    assert.ok(magma67?.algebraic_packet);
    const session = await createSage();
    try {
      const result = await session.evaluate(`
S = SupersingularModule(67)
R = PolynomialRing(QQ, "x")
expected = ${JSON.stringify(expected)}
rows = []
for record in expected:
    factor = R(record["t2_polynomial"])
    packet = S.algebraic_eigenpacket(
        factor, check_primes=(3,5,7,11), field_name="a"
    )
    assert packet.defining_factor() == factor
    assert packet.coefficient_field().degree() == 2
    expansion = packet.q_expansion(12)
    assert [str(value) for value in expansion.coefficients()] == record["q_expansion_in_a_through_11"]
    residues = []
    for root_index in [0,1]:
        residue = packet.mestre_residue_q_expansion(12, root_index=root_index)
        assert residue[0] == S.finite_field()(0)
        assert residue[1] == S.finite_field()(1)
        residues.append(tuple(str(value) for value in residue.coefficients()))
    assert residues[0] != residues[1]
    sturm = packet.sturm_certificate()
    assert sturm.bound() == 11
    assert sturm.modular_symbols_dimension() == 5
    assert sturm.verify()
    assert sturm.q_expansion().coefficients() == expansion.coefficients()
    rows.append((
        record["label"],
        str(packet.defining_factor()),
        tuple((ell, str(value)) for ell, value in packet.eigenvalues()),
        tuple(str(value) for value in expansion.coefficients()),
    ))
first = rows[0]
assert first[2] == tuple(
    (int(index), value)
    for index, value in ${JSON.stringify(
      Object.entries(magma67.algebraic_packet.hecke_eigenvalues),
    )}
)
rows
`);
      assert.match(result.repr, /67\.2\.a\.b/);
      assert.match(result.repr, /67\.2\.a\.c/);
      assert.match(result.repr, /x\^2 \+ 3\*x \+ 1/);
      assert.match(result.repr, /x\^2 \+ x - 1/);
    } finally {
      await session.close();
    }
  },
);

test(
  "algebraic packets fail closed on invalid factors and resource bounds",
  { timeout: 120_000 },
  async () => {
    const session = await createSage();
    try {
      const result = await session.evaluate(`
S = SupersingularModule(67)
R = PolynomialRing(QQ, "x")
x = R.gen()
packet = S.algebraic_eigenpacket(x^2 + 3*x + 1)
for operation in [
    lambda: S.algebraic_eigenpacket(x - 2),
    lambda: S.algebraic_eigenpacket(x^2 + 1),
    lambda: S.algebraic_eigenpacket((x^2 + 3*x + 1)^2),
    lambda: packet.q_expansion(1),
    lambda: packet.q_expansion(12, max_series_terms=11),
    lambda: packet.q_expansion(12, max_hecke_index=5),
    lambda: packet.mestre_residue_q_expansion(12, root_index=2),
]:
    try:
        operation()
    except (ValueError, MemoryError):
        pass
    else:
        raise AssertionError("an invalid algebraic packet request was accepted")
for values in [packet.coordinates(), packet.ambient_vector(), packet.eigenvalues()]:
    try:
        values[0] = values[0]
    except TypeError:
        pass
    else:
        raise AssertionError("algebraic packet data were mutable")
True
`);
      assert.equal(result.repr, "True");
    } finally {
      await session.close();
    }
  },
);

test(
  "level-389 Mestre reconstruction has an exact sparse-to-modular-symbol Sturm certificate",
  { timeout: 180_000 },
  async () => {
    const session = await createSage();
    try {
      const result = await session.evaluate(`
S = SupersingularModule(389)
packet = S.rational_eigenpacket(-2)
certificate = packet.sturm_certificate()
assert certificate.is_exact()
assert certificate.bound() == 65
assert certificate.modular_symbols_dimension() == 32
assert certificate.verify()
assert certificate.q_expansion().precision() == 66
assert certificate.checked_eigenvalues() == (
    (2,-2),(3,-2),(5,-3),(7,-5),(11,-4),(13,-3),(17,-6),(19,5),
    (23,-4),(29,-6),(31,4),(37,-8),(41,-3),(43,12),(47,-2),
    (53,-6),(59,3),(61,-8),
)
data = certificate.structural_data()
assert data["algorithm"] == "prime-level-weight-two-sturm-modular-symbols"
assert data["exact"]
(certificate.bound(), certificate.modular_symbols_dimension(), len(certificate.checked_eigenvalues()))
`);
      assert.equal(result.repr, "(65, 32, 18)");
    } finally {
      await session.close();
    }
  },
);
