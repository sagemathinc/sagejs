"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");

const root = join(__dirname, "..");
function sagejsInvocation(args) {
  if (process.env.SAGEJS_TEST_EXECUTABLE) {
    return [process.env.SAGEJS_TEST_EXECUTABLE, args];
  }
  if (process.platform === "win32") {
    return [process.execPath, [join(root, "bin", "sagejs-source.cjs"), ...args]];
  }
  return [join(root, "bin", "sagejs"), args];
}
const fixture = JSON.parse(
  readFileSync(join(__dirname, "fixtures", "number-field-class-unit-oracles.json"), "utf8"),
);
const highDegreeFixture = JSON.parse(
  readFileSync(
    join(__dirname, "fixtures", "number-field-class-unit-high-degree-oracles.json"),
    "utf8",
  ),
);

function oracleRecord(id) {
  return fixture.oracle_baseline.oracles.sage_pari.records.find(
    (entry) => entry.id === id,
  );
}

function runPublic(source, timeout) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-class-unit-public-"));
  try {
    const filename = join(directory, "acceptance.py");
    writeFileSync(filename, source, "utf8");
    const [executable, arguments_] = sagejsInvocation(["--python", filename]);
    const result = spawnSync(executable, arguments_, {
      cwd: root,
      encoding: "utf8",
      timeout,
      killSignal: "SIGKILL",
      maxBuffer: 16 * 1024 * 1024,
    });
    assert.equal(result.status, 0, result.error?.message || result.stderr || result.stdout);
    return result.stdout.trim();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("offline class/unit corpus fixes the public acceptance targets", () => {
  assert.equal(fixture.schema_version, 1);
  assert.equal(fixture.cases.length, 16);
  const quadratic = oracleRecord("real-quadratic-discriminant-12");
  const quintic = oracleRecord("quintic-discriminant-380452-c4");
  assert.deepEqual(quadratic.signature, [2, 0]);
  assert.equal(quadratic.field_discriminant, "12");
  assert.deepEqual(quadratic.proof_modes.unconditional.class_group.invariant_factors, []);
  assert.deepEqual(quintic.signature, [1, 2]);
  assert.equal(quintic.field_discriminant, "380452");
  for (const record of [quadratic, quintic]) {
    assert.equal(
      record.proof_modes.conditional_grh.proof_status,
      "exact-relations-conditional-grh",
    );
    assert.equal(record.proof_modes.unconditional.proof_status, "exact-unconditional");
  }
  assert.deepEqual(quintic.proof_modes.unconditional.class_group.invariant_factors, ["4"]);
  assert.equal(quintic.proof_modes.unconditional.unit_group.rank, 2);
});

test("offline high-degree corpus records independent exact agreement", () => {
  assert.equal(highDegreeFixture.schema_version, 1);
  assert.deepEqual(
    highDegreeFixture.cases.map((entry) => entry.degree),
    [6, 7, 8, 9, 10],
  );
  for (const entry of highDegreeFixture.cases) {
    assert.equal(entry.polynomial_family, "x^n-x-1");
    assert.equal(entry.equation_discriminant, entry.field_discriminant);
    assert.equal(entry.equation_order_index, "1");
    assert.deepEqual(entry.class_group.invariant_factors, []);
    assert.equal(entry.class_group.order, "1");
    assert.equal(entry.unit_group.rank, entry.signature[0] + entry.signature[1] - 1);
    assert.equal(entry.unit_group.torsion_order, "2");
    assert.ok(entry.prime_splitting.length > 0);
  }
  assert.deepEqual(highDegreeFixture.oracle_agreement, ["sage_pari", "magma", "hecke"]);
});

test("public quadratic class/unit context preserves proof and analytic contracts", () => {
  const output = runPublic(String.raw`
R = PolynomialRing(QQ, "x")
x = R.gen()
K = NumberField(x**2 + 4*x + 1, "a")
expected = [(False, "exact-unconditional"), (True, "exact-unconditional")]
for proof, status in expected:
    result = K.class_unit_group(proof=proof)
    assert result.complete and result.proof_status == status
    C = result.class_group()
    U = result.unit_group()
    regulator = result.regulator()
    assert C.invariants() == () and C.order() == 1 and C.verify()
    assert U.complete and U.unit_rank == 1 and U.torsion.order == 2
    assert len(result.units()) == 1
    unit = result.units()[0]
    assert unit.norm() == 1
    assert unit.principal_ideal() == K.maximal_order().ideal(unit.evaluate())
    assert len(unit.stable_hash()) == 64 and unit.to_dict()["content_sha256"] == unit.stable_hash()
    assert regulator.rigorous and regulator.full_rank_certified
    assert regulator.precision_bits >= 100 and regulator.lower < regulator.upper
assert K.class_unit_group(proof=False) is K.class_unit_group(proof=False)
assert K.class_unit_group(proof=True) is K.class_unit_group(proof=True)
assert K.class_unit_group(proof=False) is not K.class_unit_group(proof=True)
print("quadratic-public-ok")
`, 180_000);
  assert.equal(output, "quadratic-public-ok");
});

test("public cubic regulators honor rigorous requested precision", () => {
  const output = runPublic(String.raw`
R = PolynomialRing(QQ, "x")
x = R.gen()
K = NumberField(x**3 - x - 1, "b")
for precision in (100, 200):
    regulator = K.regulator(precision)
    assert regulator.rigorous and regulator.full_rank_certified
    assert regulator.precision_bits >= precision
    assert regulator.lower < regulator.upper
result = K.class_unit_group()
assert result.complete and result.proof_status == "exact-unconditional"
assert result.unit_group().unit_rank == 1
assert result.regulator().rigorous
assert result.regulator().precision_bits >= 100
print("cubic-regulator-ok")
`, 180_000);
  assert.equal(output, "cubic-regulator-ok");
});

test(
  "public motivating quintic replays conditional and unconditional class maps",
  { skip: process.env.SAGEJS_SLOW_CLASS_UNIT !== "1" },
  () => {
    const output = runPublic(String.raw`
R = PolynomialRing(QQ, "x")
x = R.gen()
K = NumberField(x**5 + x**3 - x**2 + 4*x + 1, "a")
for proof, status in [(False, "exact-relations-conditional-grh"), (True, "exact-unconditional")]:
    result = K.class_unit_group(proof=proof)
    assert result.complete and result.proof_status == status
    C = result.class_group()
    U = result.unit_group()
    assert C.invariants() == (4,) and C.order() == 4 and C.verify()
    generator = C.gen(0)
    ideal = generator.ideal()
    coordinates, witness = C.discrete_log(ideal)
    assert coordinates == (1,) and C(ideal) == generator
    assert generator.order() == 4 and not C.is_principal(ideal, proof=proof)
    assert witness.verify_principal_ideal(ideal / generator.ideal())
    assert U.complete and U.unit_rank == 2 and U.torsion.order == 2
    assert len(result.units()) == 2 and all(unit.norm() in (-1, 1) for unit in result.units())
    regulator = result.regulator()
    assert regulator.rigorous and regulator.precision_bits >= 100
print("quintic-public-ok")
`, 900_000);
    assert.equal(output, "quintic-public-ok");
  },
);
