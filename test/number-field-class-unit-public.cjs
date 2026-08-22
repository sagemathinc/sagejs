"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");
const {
  compareRationals,
  decimalRoundingCell,
  rationalFromText,
  regulatorOverlapsRoundedDecimal,
  regulatorWidthIsSmall,
} = require("../bench/class-unit-groups/run-live-high-degree-sagejs.cjs");

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

test("live high-degree harness interprets rounded regulator decimals exactly", () => {
  const target = rationalFromText("0.740631472629114333933568746575");
  const lower = rationalFromText(
    "252023830522375276431101801533304089015/340282366920938463463374607431768211456",
  );
  const upper = rationalFromText(
    "252023830522375276431101801533304089457/340282366920938463463374607431768211456",
  );
  assert.ok(compareRationals(lower, target) <= 0);
  assert.ok(compareRationals(target, upper) > 0);
  assert.ok(
    regulatorOverlapsRoundedDecimal(
      lower,
      upper,
      "0.740631472629114333933568746575",
    ),
  );
  assert.ok(regulatorWidthIsSmall(lower, upper, target));
});

test("rounded decimal regulator cells include exact half-ulp boundaries", () => {
  const [lower, upper] = decimalRoundingCell("1.00");
  assert.equal(compareRationals(lower, [199n, 200n]), 0);
  assert.equal(compareRationals(upper, [201n, 200n]), 0);
  assert.ok(regulatorOverlapsRoundedDecimal(lower, lower, "1.00"));
  assert.ok(regulatorOverlapsRoundedDecimal(upper, upper, "1.00"));
  assert.ok(!regulatorOverlapsRoundedDecimal([994n, 1000n], [994n, 1000n], "1.00"));
  assert.ok(!regulatorOverlapsRoundedDecimal([1006n, 1000n], [1006n, 1000n], "1.00"));
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

test("public cubic class number uses cached unconditional Minkowski evidence", () => {
  const output = runPublic(String.raw`
cubic_module = __import__(
    "sagejs.number_fields.cubic_class_number", fromlist=["cubic_class_number"]
)
class_unit_module = __import__(
    "sagejs.number_fields.class_unit_groups", fromlist=["class_unit_groups"]
)
units_module = __import__("sagejs.number_fields.units", fromlist=["units"])
analytic_module = __import__(
    "sagejs.number_fields.class_unit_analytic", fromlist=["class_unit_analytic"]
)

def forbidden(*args, **kwargs):
    raise AssertionError("the coupled class/unit path was touched")

class_unit_module.class_number = forbidden
units_module.bounded_unit_subgroup = forbidden
analytic_module.regulator_from_factored_units = forbidden
analytic_module.ZetaLogResidueWorkspace = forbidden

certificate_verify = cubic_module.CubicMinkowskiClassNumberCertificate.verify
certificate_verify_calls = []
def observed_certificate_verify(self, *args, **kwargs):
    certificate_verify_calls.append(self.stable_hash())
    return certificate_verify(self, *args, **kwargs)
cubic_module.CubicMinkowskiClassNumberCertificate.verify = observed_certificate_verify

R = PolynomialRing(QQ, "x")
x = R.gen()
K = NumberField(x**3 - x**2 - 6*x - 12, "c")
assert K.class_number(proof=True) == 3
artifact = K._bounded_cubic_class_number_artifact
assert artifact.complete
assert artifact.proof_status == "exact-unconditional"
assert artifact.certificate.proof_status == "exact-unconditional"
assert certificate_verify_calls == []
assert artifact.diagnostics["quotient_order"] == 3

# The stronger unconditional artifact satisfies proof=False from the field
# cache even when the producer itself is made unavailable.
cubic_module.bounded_cubic_minkowski_class_number = forbidden
assert K.class_number(proof=False) == 3
assert K._bounded_cubic_class_number_artifact is artifact
assert certificate_verify_calls == []

# Exported constructors cannot mint the private live authority, even from a
# byte-for-byte copy of valid evidence.  A live seal also cannot be moved from
# its producer result onto the forged result.
K_forged = NumberField(x**3 - x**2 - 6*x - 12, "g")
source_certificate = artifact.certificate
forged_certificate = cubic_module.CubicMinkowskiClassNumberCertificate(
    K_forged,
    plan=source_certificate.plan,
    factor_base=source_certificate.factor_base,
    relations=source_certificate.relations,
    presentation=source_certificate.presentation,
    obstructions=source_certificate.obstructions,
    caps=source_certificate.caps,
)
forged_result = cubic_module.CubicClassNumberResult(
    K_forged,
    True,
    source_certificate.source,
    artifact.minkowski_bound,
    certificate=forged_certificate,
    factor_base=artifact.factor_base,
    relation_records=artifact.relation_records,
    presentation=artifact.presentation,
    diagnostics=artifact.diagnostics,
)
assert not cubic_module.authenticated_cubic_class_number_result_matches(
    forged_result, K_forged
)
forged_result._live_authentication = artifact._live_authentication
assert not cubic_module.authenticated_cubic_class_number_result_matches(
    forged_result, K_forged
)
original_producer = cubic_module.bounded_cubic_minkowski_class_number
cubic_module.bounded_cubic_minkowski_class_number = lambda field: forged_result
try:
    K_forged.class_number(proof=True)
    raise AssertionError("a directly constructed cubic result entered the cache")
except ArithmeticError as error:
    assert "invalid exact evidence" in str(error) or "lost authentication" in str(error)
cubic_module.bounded_cubic_minkowski_class_number = original_producer
assert not hasattr(K_forged, "_bounded_cubic_class_number_artifact")

# Cache reads rebind the immutable source snapshot and fail after mutation.
artifact.diagnostics["quotient_order"] = 4
try:
    K.class_number(proof=True)
    raise AssertionError("mutated live cubic evidence remained authenticated")
except ArithmeticError as error:
    assert "lost authentication" in str(error)
artifact.diagnostics["quotient_order"] = 3
assert K.class_number(proof=True) == 3

# Explicit algorithms and resource policies retain the existing coupled
# dispatch rather than silently consuming the auto/no-limits shortcut.
for options in ({"algorithm": "minkowski"}, {"max_relations": 1}):
    try:
        K.class_number(**options)
        raise AssertionError("an explicit class-number policy bypassed dispatch")
    except AssertionError as error:
        assert "coupled class/unit path" in str(error)

# Bounded noncompletion is only a routing hint: it falls through rather than
# supplying an upper bound as a class number.
def incomplete(field):
    return cubic_module.CubicClassNumberResult(
        field, False, "forced bounded exhaustion", 1
    )
cubic_module.bounded_cubic_minkowski_class_number = incomplete
class_unit_module.class_number = lambda *args, **kwargs: 7
K_fallback = NumberField(x**3 + 3*x + 1, "f")
assert K_fallback.class_number(proof=False) == 7
assert not hasattr(K_fallback, "_bounded_cubic_class_number_artifact")
print("cubic-class-number-fast-ok")
`, 180_000);
  assert.equal(output, "cubic-class-number-fast-ok");
});

test("public cubic fallback resumes its authenticated exact relation prefix", () => {
  const output = runPublic(String.raw`
import sagejs.number_fields.cubic_class_number as cubic_module
import sagejs.number_fields.class_unit_groups as class_unit_module
import sagejs.number_fields.class_unit_analytic as analytic_module

analytic_replays = 0
original_compute_unit_index_proof = analytic_module._compute_unit_index_proof
def counted_compute_unit_index_proof(*args, **kwargs):
    global analytic_replays
    analytic_replays += 1
    return original_compute_unit_index_proof(*args, **kwargs)
analytic_module._compute_unit_index_proof = counted_compute_unit_index_proof

R = PolynomialRing(QQ, "x")
x = R.gen()
K = NumberField(x**3 + 4*x - 1, "s")
assert K.class_number(proof=True) == 2
artifact = K._bounded_cubic_class_number_artifact
assert not artifact.complete
assert len(artifact.relation_records) == 4
artifact_search = artifact.diagnostics["relation_search"]
assert artifact_search["integral_sieve_dependency_candidates"] == 1
assert artifact_search["integral_sieve_dependency_relations"] == 1
assert artifact.relation_records[-1].provenance["algorithm"] == (
    "packed-cubic-unit-dependency-seed"
)
result = list(K._class_unit_engine_cache.values())[-1]
resources = result.diagnostics["resources"]
assert result.proof_status == "exact-unconditional"
assert result.diagnostics["factor_base_bound"] == 4
assert result.diagnostics["factor_base_size"] == 3
assert resources["cubic_relation_seed_uses"] == 1
assert resources["cubic_relation_seed_relations"] == 4
assert resources["cubic_factor_base_seed_uses"] == 1
assert resources["cubic_specialized_seed_skips"] == 1
assert resources["relation_attempts"] == 0
assert resources["relation_candidates"] == 0
assert resources["presentation_extractions"] == 0
assert resources["saturation_live_authentication_requests"] == 1
assert resources["saturation_live_authentication_hits"] == 1
assert resources["saturation_live_authentication_fallback_replays"] == 0
assert resources["class_group_live_authentication_requests"] == 1
assert resources["class_group_live_authentication_hits"] == 1
assert resources["class_group_live_authentication_fallback_replays"] == 0
assert result.diagnostics["relations"] == 4
group = result.class_group()
assert group.verify()
retained_generator_rows = group._generator_rows
group._generator_rows = ((retained_generator_rows[0][0] + 1,) + retained_generator_rows[0][1:],)
assert not group.verify()
group._generator_rows = retained_generator_rows
assert group.verify()
record = result.saturation_record
assert "_live_authentication" not in record.__dict__
assert not class_unit_module._authenticated_live_saturation_record_matches(
    record, K, K.maximal_order()
)
assert analytic_replays == 0
assert record.verify(K, K.maximal_order())
assert analytic_replays == 1
analytic_module._compute_unit_index_proof = original_compute_unit_index_proof

# The authority is only a live optimization hint.  Any mutation invalidates
# it, and the public verifier still fails closed against the content hash.
record.reason += " (mutated)"
assert not class_unit_module._authenticated_live_saturation_record_matches(
    record, K, K.maximal_order()
)
assert not record.verify(K, K.maximal_order())

# A mutated live prefix is only a failed optimization hint.  It cannot enter
# the engine, and the independent exact computation still returns the answer.
T = NumberField(x**3 + 4*x - 1, "t")
forged = cubic_module.bounded_cubic_minkowski_class_number(T)
assert cubic_module.authenticated_cubic_relation_seed(forged, T) is not None
forged.diagnostics["quotient_order"] = 99
assert cubic_module.authenticated_cubic_relation_seed(forged, T) is None
T._bounded_cubic_class_number_artifact = forged
assert T.class_number(proof=False) == 2
cold_result = list(T._class_unit_engine_cache.values())[-1]
assert cold_result.diagnostics["resources"]["cubic_relation_seed_uses"] == 0
assert cold_result.diagnostics["resources"]["cubic_factor_base_seed_uses"] == 0
assert cold_result.diagnostics["resources"]["cubic_specialized_seed_skips"] == 0

# A valid prefix remains useful under an explicit engine policy, but the
# narrow direct factor-base shortcut is reserved for the exact default caps.
U = NumberField(x**3 + 4*x - 1, "u")
valid_limited = cubic_module.bounded_cubic_minkowski_class_number(U)
assert cubic_module.authenticated_cubic_relation_seed(valid_limited, U) is not None
U._bounded_cubic_class_number_artifact = valid_limited
limited_result = U.class_unit_group(proof=False, max_relations=1024)
assert limited_result.complete and limited_result.class_number() == 2
assert limited_result.diagnostics["resources"]["cubic_factor_base_seed_uses"] == 0

# A failed live construction hint falls back to the unchanged full map replay.
original_live_verifier = class_unit_module._EngineClassGroup._verify_live_construction
class_unit_module._EngineClassGroup._verify_live_construction = lambda self, token: False
try:
    V = NumberField(x**3 + 4*x - 1, "v")
    assert V.class_number(proof=False) == 2
    replayed = V.class_unit_group(proof=False)
    replay_resources = replayed.diagnostics["resources"]
    assert replay_resources["class_group_live_authentication_requests"] == 1
    assert replay_resources["class_group_live_authentication_hits"] == 0
    assert replay_resources["class_group_live_authentication_fallback_replays"] == 1
    assert replayed.class_group().verify()
finally:
    class_unit_module._EngineClassGroup._verify_live_construction = original_live_verifier
print("cubic-relation-seed-ok")
`, 180_000);
  assert.equal(output, "cubic-relation-seed-ok");
});

test("cubic saturation enlarges exact relations before searching for unit roots", () => {
  const output = runPublic(String.raw`
import sagejs.number_fields.class_unit_analytic as analytic_module

R = PolynomialRing(QQ, "x")
x = R.gen()
K = NumberField(x**3 - x**2 + 9*x - 21, "a")

# LMFDB 3.1.2856.1 starts with a rigorous hR index bound greater than one.
# Its authenticated cubic relation prefix can close that index by exact
# targeted p-relation batches.  The much more expensive bounded p-th-root
# search is therefore only a fallback and must not run on this path.
original_saturate_unit_lattice = analytic_module.saturate_unit_lattice
unit_root_searches = 0
def forbidden_unit_root_search(*args, **kwargs):
    global unit_root_searches
    unit_root_searches += 1
    raise AssertionError("unnecessary unit-root saturation search")
analytic_module.saturate_unit_lattice = forbidden_unit_root_search
try:
    assert K.class_number(proof=False) == 7
finally:
    analytic_module.saturate_unit_lattice = original_saturate_unit_lattice

assert unit_root_searches == 0
result = K.class_unit_group(proof=False)
assert result.complete
assert result.proof_status == "exact-unconditional"
assert result.saturation_record.complete
assert result.saturation_record.verify()
resources = result.diagnostics["resources"]
assert resources["cubic_relation_seed_uses"] == 1
assert resources["cubic_relation_seed_relations"] == 7
assert resources["saturation_rounds"] == 3
assert resources["relation_attempts"] == 6
assert resources["relation_candidates"] == 12
assert [attempt["prime"] for attempt in result.saturation_record.attempts] == [2, 3, 2]
assert all(
    attempt["relations_admitted"] == 4
    for attempt in result.saturation_record.attempts
)

# The completed unconditional computation also satisfies proof=True without a
# second relation or analytic pass.
assert K.class_number(proof=True) == 7
print("cubic-relation-first-saturation-ok")
`, 180_000);
  assert.equal(output, "cubic-relation-first-saturation-ok");
});

test("default cubic fallback reuses only measured-size Minkowski prefixes", () => {
  const output = runPublic(String.raw`
R = PolynomialRing(QQ, "x")
x = R.gen()

# LMFDB 3.1.1563.1 has a seven-prime Minkowski base.  Reusing its exact
# prefix plus one exact duplicate-row unit dependency makes the coupled result
# unconditional without a separate BDF discovery/proof pass or LLL search.
K = NumberField(x**3 - x**2 + 7*x - 6, "a")
assert K.class_number(proof=False) == 5
artifact = K._bounded_cubic_class_number_artifact
assert len(artifact.factor_base) == 7
assert len(artifact.relation_records) == 8
result = list(K._class_unit_engine_cache.values())[-1]
resources = result.diagnostics["resources"]
assert result.proof_status == "exact-unconditional"
assert result.diagnostics["factor_base_bound"] == 11
assert result.diagnostics["factor_base_size"] == 7
assert resources["cubic_factor_base_seed_uses"] == 1
assert resources["cubic_relation_seed_uses"] == 1
assert resources["cubic_relation_seed_relations"] == 8
assert resources["relation_attempts"] == 0
assert resources["relation_candidates"] == 0

# LMFDB 3.1.4027.2 needs ten primes in the unconditional producer.  That
# prefix is valid, but deliberately outside the live reuse policy: measured
# authenticated replay costs more than rebuilding its smaller BDF base.
L = NumberField(x**3 - x**2 + 7*x + 8, "b")
assert L.class_number(proof=False) == 6
large_artifact = L._bounded_cubic_class_number_artifact
assert len(large_artifact.factor_base) == 10
large_result = list(L._class_unit_engine_cache.values())[-1]
large_resources = large_result.diagnostics["resources"]
assert large_result.proof_status == "exact-relations-conditional-grh"
assert large_resources["cubic_factor_base_seed_uses"] == 0
assert large_resources["cubic_relation_seed_uses"] == 0
print("cubic-relation-seed-policy-ok")
`, 180_000);
  assert.equal(output, "cubic-relation-seed-policy-ok");
});

test("isomorphic cubic computations reuse only live analytic snapshots", () => {
  const output = runPublic(String.raw`
import sagejs.number_fields.class_unit_analytic as analytic

R = PolynomialRing(QQ, "x")
x = R.gen()
K1 = NumberField(x**3 + 4*x - 1, "first")
K2 = NumberField(x**3 + 4*x - 1, "second")
assert K1.class_number(proof=False) == 2
first = K1.class_unit_group(proof=False)
first_live_workspace = first.saturation_record._analytic_certificate._workspace
first_finite = next(iter(first_live_workspace._finite_terms.values()))[0]
first_finite.lower = analytic.RationalEndpoint(999)
assert K2.class_number(proof=False) == 2
second = K2.class_unit_group(proof=False)

first_workspace = first.diagnostics["analytic_workspace"]
second_workspace = second.diagnostics["analytic_workspace"]
assert first_workspace["shared_workspace_cache_hits"] == 0
assert second_workspace["shared_workspace_cache_hits"] == 1
assert second_workspace["provider_calls"] == 0
assert second_workspace["records_decoded"] == 0
second_live_workspace = second.saturation_record._analytic_certificate._workspace
assert all(
    ball.lower != analytic.RationalEndpoint(999)
    for ball, _diagnostics in second_live_workspace._finite_terms.values()
)
assert first.class_number() == second.class_number() == 2
assert first.regulator().to_dict() == second.regulator().to_dict()

# A detached certificate never inherits this process-local performance hint.
certificate = second.saturation_record._analytic_certificate
detached = analytic.UnitSaturationIndexCertificate.from_dict(certificate.to_dict())
assert detached.workspace_diagnostics() is None

# Replacing the private cache entry with unissued data is only a failed hint.
cache_key = analytic._shared_zeta_workspace_key(
    int(K2.discriminant()), 3, K2.maximal_order().splitting_records
)
analytic._shared_zeta_workspace_snapshots[cache_key] = ()
K3 = NumberField(x**3 + 4*x - 1, "third")
assert K3.class_number(proof=False) == 2
third = K3.class_unit_group(proof=False)
assert third.diagnostics["analytic_workspace"]["shared_workspace_cache_hits"] == 0
assert third.diagnostics["analytic_workspace"]["provider_calls"] > 0
print("shared-live-analytic-ok")
`, 180_000);
  assert.equal(output, "shared-live-analytic-ok");
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
