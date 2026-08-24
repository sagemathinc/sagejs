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
cubic_module.bounded_cubic_minkowski_class_number = (
    lambda field, **kwargs: forged_result
)
try:
    K_forged.class_number(proof=True)
    raise AssertionError("a directly constructed cubic result entered the cache")
except ArithmeticError as error:
    assert "invalid exact evidence" in str(error) or "lost authentication" in str(error)
cubic_module.bounded_cubic_minkowski_class_number = original_producer
assert K_forged._bounded_cubic_class_number_artifact is None

# Cache reads consume the scalar sealed at the exact producer boundary.  The
# public result wrapper is diagnostic data, so mutating it cannot alter or
# invalidate the already certified class number.
artifact.diagnostics["quotient_order"] = 4
try:
    artifact.certificate._class_number = 4
    raise AssertionError("a frozen cubic certificate accepted mutation")
except AttributeError as error:
    assert "read-only" in str(error)
assert K.class_number(proof=True) == 3
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
def incomplete(field, **kwargs):
    return cubic_module.CubicClassNumberResult(
        field, False, "forced bounded exhaustion", 1
    )
cubic_module.bounded_cubic_minkowski_class_number = incomplete
K_fallback = NumberField(x**3 + 3*x + 1, "f")
try:
    K_fallback.class_number(proof=False)
    raise AssertionError("bounded noncompletion was accepted as a class number")
except AssertionError as error:
    assert "coupled class/unit path" in str(error)
assert K_fallback._bounded_cubic_class_number_artifact is None
print("cubic-class-number-fast-ok")
`, 180_000);
  assert.equal(output, "cubic-class-number-fast-ok");
});

test("completed cubic class numbers seed the shared class-unit context", () => {
  const output = runPublic(String.raw`
import sagejs.number_fields.cubic_class_number as cubic_module

R = PolynomialRing(QQ, "x")
x = R.gen()
K = NumberField(x**3 - x**2 - 6*x - 12, "c")
assert K.class_number(proof=False) == 3
artifact = K._bounded_cubic_class_number_artifact
assert artifact.complete and artifact.proof_status == "exact-unconditional"
assert len(K._class_unit_engine_cache) == 0

# The scalar request retains the exact packed producer stage.  It does not
# construct ordinary ideals merely in case another API will need them.
seed = cubic_module.authenticated_cubic_relation_seed(artifact, K)
assert seed is not None
assert len(seed.factor_base) == 5
assert all(
    isinstance(record, cubic_module.PackedCubicFactorRecord)
    for record in seed.factor_base
)
assert len(artifact._packed_factor_records) == 5
assert len(seed.relation_candidates) == 8
assert len(seed.selected_relation_candidates) == 3

# The bounded linear selector preserves canonical first-occurrence ordering
# for retained rows, repeated coordinates, and a previously unseen row pair.
selector = cubic_module._select_cubic_dependency_candidates
selected_fixture = (
    ((1, 0), (1, 0, 0), 2),
    ((2, 0), (0, 1, 0), 3),
)
candidate_fixture = (
    ((1, 0), (1, 0, 0), 2),
    ((9, 0), (1, 1, 0), 5),
    ((1, 0), (2, 0, 0), 2),
    ((9, 0), (2, 1, 0), 5),
    ((9, 0), (2, 1, 0), 5),
    ((2, 0), (0, 2, 0), 3),
)
assert selector(selected_fixture, candidate_fixture, 0) == ()
assert selector(selected_fixture, candidate_fixture, 1) == candidate_fixture[2:3]
assert selector(selected_fixture, candidate_fixture, 2) == (
    candidate_fixture[2], candidate_fixture[5]
)
assert selector(selected_fixture, candidate_fixture, 3) == (
    candidate_fixture[2],
    candidate_fixture[5],
    candidate_fixture[1],
    candidate_fixture[3],
)

# The lazy continuation itself remains an exact admission boundary.  Every
# retained record replays over the materialized prime ideals, and a corrupted
# proposal merely removes the optimization instead of entering the context.
materialized = cubic_module.materialize_authenticated_cubic_relation_seed(
    seed, K, include_unit_dependencies=True
)
assert materialized is not None
assert materialized.dependency_candidates == 1
assert materialized.dependency_relations == 1
assert materialized.dependency_coefficient_bound == 4
assert len(materialized.collector.records) == 6
assert materialized.presentation.verify()
assert all(
    record.verify(K.maximal_order(), materialized.factor_base)["certified"]
    for record in materialized.collector.records
)
original_dependency_selector = cubic_module._select_cubic_dependency_candidates
def corrupted_dependency(*args, **kwargs):
    return (((1, 0, 0, 0, 0), (0, 0, 0), 2),)
cubic_module._select_cubic_dependency_candidates = corrupted_dependency
try:
    rejected_hint = cubic_module.materialize_authenticated_cubic_relation_seed(
        seed, K, include_unit_dependencies=True
    )
finally:
    cubic_module._select_cubic_dependency_candidates = original_dependency_selector
assert rejected_hint is not None
assert rejected_hint.dependency_relations == 0
assert len(rejected_hint.collector.records) == 5

# A later coupled request materializes that exact stage once, transfers its
# authenticated collector into the ClassUnitGroupContext, and resumes only
# the missing unit-relation work.
result = K.class_unit_group(proof=False)
assert result.complete and result.class_number() == 3
assert result.proof_status == "exact-unconditional"
assert result.unit_group().unit_rank == 1
resources = result.diagnostics["resources"]
assert resources["cubic_factor_base_seed_uses"] == 1
assert resources["cubic_relation_seed_uses"] == 1
assert resources["cubic_relation_seed_relations"] == 6
assert resources["cubic_relation_seed_materializations"] == 1
assert resources["cubic_relation_seed_dependency_candidates"] == 1
assert resources["cubic_relation_seed_dependency_relations"] == 1
assert resources["relation_attempts"] == 0
assert resources["relations"] == 6
assert resources["generation_verification_live_authentication_hits"] == 1
assert resources["class_group_live_authentication_hits"] == 1
live = result.context.live_diagnostics()
assert live["sealed"] and live["reusable"]
assert live["factor_base_validation_available"]
assert live["factor_base_size"] == 5
assert live["relation_count"] == len(result.conditional_relation_records)
assert len(artifact._packed_factor_records) == 5

# When an attached factor-base generator already proves the class quotient
# trivial, scalar discovery skips the coefficient box entirely.  The later
# unit request enumerates a duplicate row lazily and still avoids LLL search.
M = NumberField(x**3 + 2*x + 1, "m")
assert M.class_number(proof=False) == 1
artifact59 = M._bounded_cubic_class_number_artifact
seed59 = cubic_module.authenticated_cubic_relation_seed(artifact59, M)
assert seed59 is not None
assert seed59.relation_candidates == ()
assert seed59.selected_relation_candidates == ()
assert len(seed59.collector.records) == 1
assert seed59.collector.records[0].provenance["algorithm"] == (
    "packed-cubic-attached-prime-generator"
)
materialized59 = cubic_module.materialize_authenticated_cubic_relation_seed(
    seed59, M, include_unit_dependencies=True
)
assert materialized59 is not None
assert materialized59.dependency_relations == 1
result59 = M.class_unit_group(proof=False)
assert result59.complete and result59.class_number() == 1
resources59 = result59.diagnostics["resources"]
assert resources59["relation_attempts"] == 0
assert resources59["cubic_relation_seed_dependency_relations"] == 1

# The retained prefix is only an optimization authority.  Mutation makes it
# unavailable; restoring the exact producer state restores the live hint.
T = NumberField(x**3 - x**2 - 6*x - 12, "t")
assert T.class_number(proof=False) == 3
forged = T._bounded_cubic_class_number_artifact
forged_seed = cubic_module.authenticated_cubic_relation_seed(forged, T)
assert forged_seed is not None
packed = forged_seed.factor_records[0]
retained_norm = packed.norm_value
packed.norm_value += 1
assert cubic_module.authenticated_cubic_relation_seed(forged, T) is None
packed.norm_value = retained_norm
assert cubic_module.authenticated_cubic_relation_seed(forged, T) is not None
retained_candidates = forged_seed.relation_candidates
forged_seed.__dict__["relation_candidates"] = ()
assert cubic_module.authenticated_cubic_relation_seed(forged, T) is None
forged_seed.__dict__["relation_candidates"] = retained_candidates
assert cubic_module.authenticated_cubic_relation_seed(forged, T) is not None

# Engine consumption validates the canonical live prefix once.  The internal
# materializer receives that same authority instead of serializing it again.
A = NumberField(x**3 - x**2 - 6*x - 12, "auth")
assert A.class_number(proof=False) == 3
snapshot_calls = 0
original_snapshot = cubic_module._cubic_relation_seed_snapshot
def counted_snapshot(*args, **kwargs):
    global snapshot_calls
    snapshot_calls += 1
    return original_snapshot(*args, **kwargs)
cubic_module._cubic_relation_seed_snapshot = counted_snapshot
try:
    assert A.class_unit_group(proof=False).complete
finally:
    cubic_module._cubic_relation_seed_snapshot = original_snapshot
assert snapshot_calls == 1

print("completed-cubic-context-seed-ok")
`, 180_000);
  assert.equal(output, "completed-cubic-context-seed-ok");
});

test("public cubic fallback resumes its authenticated exact relation prefix", () => {
  const output = runPublic(String.raw`
import sagejs.number_fields.cubic_class_number as cubic_module
import sagejs.number_fields.class_unit_groups as class_unit_module
import sagejs.number_fields.class_unit_context as context_module
import sagejs.number_fields.class_unit_analytic as analytic_module

analytic_replays = 0
analytic_body_replays = 0
original_compute_unit_index_proof = analytic_module._compute_unit_index_proof
original_authenticated_body_matches = (
    analytic_module.UnitSaturationIndexCertificate._authenticated_body_matches
)
def counted_compute_unit_index_proof(*args, **kwargs):
    global analytic_replays
    analytic_replays += 1
    return original_compute_unit_index_proof(*args, **kwargs)
def counted_authenticated_body_matches(self):
    global analytic_body_replays
    analytic_body_replays += 1
    return original_authenticated_body_matches(self)
analytic_module._compute_unit_index_proof = counted_compute_unit_index_proof
analytic_module.UnitSaturationIndexCertificate._authenticated_body_matches = (
    counted_authenticated_body_matches
)

R = PolynomialRing(QQ, "x")
x = R.gen()
K = NumberField(x**3 + 4*x - 1, "s")
assert K.class_number(proof=True) == 2
artifact = K._bounded_cubic_class_number_artifact
assert not artifact.complete
assert artifact.diagnostics["context_relation_prefix_bound"] is True
# The uninterrupted public request transfers the exact live collector into
# its ClassUnitGroupContext.  It must not also serialize the old cubic seed.
assert cubic_module.authenticated_cubic_relation_seed(artifact, K) is None
assert len(artifact.relation_records) == 4
artifact_search = artifact.diagnostics["relation_search"]
assert artifact_search["integral_sieve_dependency_candidates"] == 1
assert artifact_search["integral_sieve_dependency_relations"] == 1
assert artifact.relation_records[-1].provenance["algorithm"] == (
    "packed-cubic-unit-dependency-seed"
)
assert len(K._class_unit_engine_cache) == 0
projection = list(K._class_number_projection_cache.values())[-1]
assert projection.class_number == 2
try:
    projection.class_number = 99
    raise AssertionError("a cached class-number projection was mutable")
except AttributeError:
    pass
result = K.class_unit_group(proof=True)
assert projection._completed is result
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
assert resources["generation_verification_calls"] == 1
assert resources["generation_verification_live_authentication_hits"] == 1
assert resources["generation_context_artifact_reuses"] == 0
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
retained_group_order = group._presentation.order
group._presentation.order = retained_group_order + 1
assert not group.verify()
group._presentation.order = retained_group_order
assert group.verify()
record = result.saturation_record
assert "_live_authentication" not in record.__dict__
assert not result.context.live_diagnostics()[
    "saturation_live_authority_available"
]
assert analytic_replays == 0
assert analytic_body_replays == 0
assert record.verify(K, K.maximal_order())
assert analytic_replays == 1
assert analytic_body_replays == 1
analytic_module._compute_unit_index_proof = original_compute_unit_index_proof
analytic_module.UnitSaturationIndexCertificate._authenticated_body_matches = (
    original_authenticated_body_matches
)

# Serialized record payloads remain isolated even though the live producer
# avoids an eager second copy of the nested analytic certificate.
serialized_record = record.to_dict()
serialized_record["reason"] += " (payload mutation)"
serialized_record["analytic_certificate"]["generation_evidence"]["bound"] += 1
assert serialized_record != record.to_dict()
assert record.reason == "rigorous hR index-one validation after bounded saturation"

# The authority is only a live optimization hint.  Any mutation invalidates
# it, and the public verifier still fails closed against the content hash.
record.reason += " (mutated)"
assert not record.verify(K, K.maximal_order())

# A mutated live prefix is only a failed optimization hint.  It cannot enter
# the engine, and the independent exact computation still returns the answer.
T = NumberField(x**3 + 4*x - 1, "t")
forged = cubic_module.bounded_cubic_minkowski_class_number(T)
# A standalone producer has no receiving context.  It retains the fully
# authenticated replay seed used by detached and later cached consumers.
assert cubic_module.authenticated_cubic_relation_seed(forged, T) is not None

# Timing diagnostics are not proof state and do not invalidate the prefix.
# Every mathematical component is still snapshotted without repeatedly
# serializing the same ideals and matrices.
forged.diagnostics["phase_timings"]["total"] += 1
assert cubic_module.authenticated_cubic_relation_seed(forged, T) is not None
forged.diagnostics["phase_timings"]["total"] -= 1

# Mutating proof-bearing diagnostics, a relation, the presentation, or the
# search cursor invalidates the authority.  Restoring the exact state restores
# only the optimization hint; detached evidence remains independently replayed.
forged.diagnostics["quotient_order"] = 99
assert cubic_module.authenticated_cubic_relation_seed(forged, T) is None
forged.diagnostics["quotient_order"] = forged.presentation.order
factor_record = forged._live_relation_seed.factor_records[0]
retained_factor_norm = factor_record.norm
factor_record.norm = retained_factor_norm + 1
assert cubic_module.authenticated_cubic_relation_seed(forged, T) is None
factor_record.norm = retained_factor_norm
relation = forged.relation_records[0]
retained_row = relation.row
relation.row = (retained_row[0] + 1,) + retained_row[1:]
assert cubic_module.authenticated_cubic_relation_seed(forged, T) is None
relation.row = retained_row
presentation = forged.presentation
retained_order = presentation.order
presentation.order = retained_order + 1
assert cubic_module.authenticated_cubic_relation_seed(forged, T) is None
presentation.order = retained_order
seed = forged._live_relation_seed
seed.search_state.candidates_tested += 1
assert cubic_module.authenticated_cubic_relation_seed(forged, T) is None
seed.search_state.candidates_tested -= 1
assert cubic_module.authenticated_cubic_relation_seed(forged, T) is not None
retained_pivots = dict(seed.collector.rank_screen._pivots)
seed.collector.rank_screen._pivots.clear()
assert cubic_module.authenticated_cubic_relation_seed(forged, T) is None
seed.collector.rank_screen._pivots.update(retained_pivots)
assert cubic_module.authenticated_cubic_relation_seed(forged, T) is not None
forged.diagnostics["quotient_order"] = 99
T._bounded_cubic_class_number_artifact = forged
assert T.class_number(proof=False) == 2
cold_projection = list(T._class_number_projection_cache.values())[-1]
cold_result = T.class_unit_group(proof=False)
assert cold_projection._completed is cold_result
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
original_live_verifier = (
    context_module.ClassUnitGroupContext._verify_live_class_group_construction
)
original_saturation_validator = (
    class_unit_module._standard_live_saturation_record_is_valid
)
context_module.ClassUnitGroupContext._verify_live_class_group_construction = (
    lambda self, token, group: False
)
class_unit_module._standard_live_saturation_record_is_valid = (
    lambda record, field, order: False
)
try:
    V = NumberField(x**3 + 4*x - 1, "v")
    assert V.class_number(proof=False) == 2
    replayed = V.class_unit_group(proof=False)
    replay_resources = replayed.diagnostics["resources"]
    assert replay_resources["class_group_live_authentication_requests"] == 1
    assert replay_resources["class_group_live_authentication_hits"] == 0
    assert replay_resources["class_group_live_authentication_fallback_replays"] == 1
    assert replay_resources["saturation_live_authentication_hits"] == 0
    assert replay_resources["saturation_live_authentication_fallback_replays"] == 1
    assert replayed.class_group().verify()
    assert not replayed.saturation_record._live_authentication_available
finally:
    context_module.ClassUnitGroupContext._verify_live_class_group_construction = (
        original_live_verifier
    )
    class_unit_module._standard_live_saturation_record_is_valid = (
        original_saturation_validator
    )
print("cubic-relation-seed-ok")
`, 180_000);
  assert.equal(output, "cubic-relation-seed-ok");
});

test("cubic fallback retains a packed duplicate pair before unit saturation", () => {
  const output = runPublic(String.raw`
import sagejs.number_fields.class_unit_analytic as analytic_module
import sagejs.number_fields.class_group_factor_base as factor_base_module
import sagejs.number_fields.class_unit_groups as class_unit_module

R = PolynomialRing(QQ, "x")
x = R.gen()
K = NumberField(x**3 - x**2 + 9*x - 21, "a")

# LMFDB 3.1.2856.1 needed a targeted saturation batch when the packed cubic
# relation sieve retained only the minimal class-presentation support.  Once
# the bounded class proof fails, the producer may retain both generators of a
# duplicate valuation row from its packed candidates (and widen the box only
# if the primary candidates have none).  The resulting unit quotient is
# fundamental here, so neither LLL relation saturation nor the much more
# expensive bounded p-th-root search should run.
original_saturate_unit_lattice = analytic_module.saturate_unit_lattice
original_descriptor_scan = factor_base_module._eligible_descriptors
unit_root_searches = 0
def forbidden_unit_root_search(*args, **kwargs):
    global unit_root_searches
    unit_root_searches += 1
    raise AssertionError("unnecessary unit-root saturation search")
analytic_module.saturate_unit_lattice = forbidden_unit_root_search
def forbidden_descriptor_scan(*args, **kwargs):
    raise AssertionError("a tiny packed factor base must not be decomposed twice")
factor_base_module._eligible_descriptors = forbidden_descriptor_scan
try:
    assert K.class_number(proof=False) == 7
finally:
    analytic_module.saturate_unit_lattice = original_saturate_unit_lattice
    factor_base_module._eligible_descriptors = original_descriptor_scan

assert unit_root_searches == 0
result = K.class_unit_group(proof=False)
assert result.complete
assert result.proof_status == "exact-unconditional"
assert result.saturation_record.complete
assert result.saturation_record.verify()
resources = result.diagnostics["resources"]
artifact = K._bounded_cubic_class_number_artifact
artifact_search = artifact.diagnostics["relation_search"]
context = result.context
assert context is not None
assert context.proof_state.label == "exact-unconditional"
assert context.factor_base == result.conditional_factor_base
assert context.relations == result.conditional_relation_records
assert context.matrix_state is result.conditional_presentation_evidence
live_context = context.live_diagnostics()
assert live_context["reusable"] and live_context["sealed"]
assert live_context["factor_base_size"] == len(result.conditional_factor_base)
assert live_context["relation_count"] == len(result.conditional_relation_records)
assert live_context["has_presentation"]
assert live_context["has_analytic_workspace"]
assert live_context["has_analytic_proof"]
assert live_context["has_generation_authority"]
assert live_context["generation_artifact_producer_authenticated"]
assert not live_context["generation_verification_active"]
assert live_context["generation_verification_entries"] >= 1
assert live_context["has_saturation_record"]
assert live_context["has_class_group"] and live_context["has_unit_group"]
detached_context = context.to_dict()
assert detached_context["schema"] == "sagejs.number-fields.class-unit-context.v1"
assert len(detached_context["factor_base"]) == len(result.conditional_factor_base)
assert len(detached_context["relations"]) == len(
    result.conditional_relation_records
)
assert detached_context["matrix_state"] == (
    result.conditional_presentation_evidence.to_dict()
)
assert "_live_artifacts" not in detached_context
assert artifact_search["integral_sieve_dependency_candidates"] == 2
assert artifact_search["integral_sieve_dependency_relations"] == 2
assert artifact_search["integral_sieve_dependency_validated_batch"] == 1
assert artifact_search["integral_sieve_dependency_coefficient_bound"] == 2
assert artifact.relation_records[-1].provenance["coefficient_bound"] == 2
assert resources["cubic_relation_seed_uses"] == 1
assert resources["cubic_relation_seed_relations"] == 9
assert resources["saturation_rounds"] == 0
assert resources["relation_attempts"] == 0
assert resources["relation_candidates"] == 0
assert resources["relation_witness_logarithm_requests"] == 0
assert resources["dependency_unit_eager_candidates"] == 0
assert resources["dependency_unit_materializations"] == 0
assert resources["dependency_unit_steering_basis_hits"] == 1
assert resources["relation_dependency_unit_object_cache_hits"] == 1
assert resources["unit_live_relation_authority_hits"] == 1
assert resources["generation_live_relation_payload_hits"] >= 1
assert resources["relation_witness_decode_requests"] <= 3 * resources["relations"]
assert result.saturation_record.attempts == ()

# The live payload projection may share normalized nested containers only until
# the analytic certificate captures its canonical bytes.  A later mutation of
# the retained producer record must therefore invalidate, never silently alter,
# the proof; restoring the exact state restores detached replay.
artifact.relation_records[0].provenance["post-certificate-mutation"] = True
assert not result.saturation_record.verify()
del artifact.relation_records[0].provenance["post-certificate-mutation"]
assert result.saturation_record.verify()

# Progress callbacks remain an interposition boundary.  They retain both the
# issuance and consumption snapshots instead of using the synchronous token.
replay_calls = [0]
original_replay = class_unit_module.ClassUnitSaturationRecord.verify
def counted_replay(record, *args, **kwargs):
    replay_calls[0] += 1
    return original_replay(record, *args, **kwargs)
class_unit_module.ClassUnitSaturationRecord.verify = counted_replay
try:
    events = []
    callback_result = class_unit_module.compute_class_unit_group(
        K, proof=False, progress=events.append
    )
finally:
    class_unit_module.ClassUnitSaturationRecord.verify = original_replay
assert callback_result.complete
assert callback_result.diagnostics["resources"][
    "generation_live_relation_payload_hits"
] == 0
callback_context = callback_result.context.live_diagnostics()
assert not callback_context["reusable"] and callback_context["sealed"]
assert callback_context["relation_count"] == len(
    callback_result.conditional_relation_records
)
assert not callback_context["saturation_live_authority_available"]
assert callback_result.diagnostics["resources"][
    "saturation_live_authentication_hits"
] == 0
assert callback_result.diagnostics["resources"][
    "saturation_live_authentication_fallback_replays"
] == 1
assert replay_calls[0] >= 1
assert events

# The completed unconditional computation also satisfies proof=True without a
# second relation or analytic pass.
assert K.class_number(proof=True) == 7
print("cubic-packed-fundamental-unit-ok")
`, 180_000);
  assert.equal(output, "cubic-packed-fundamental-unit-ok");
});

test("default cubic fallback reuses only measured-size Minkowski prefixes", () => {
  const output = runPublic(String.raw`
import sagejs.number_fields.cubic_class_number as cubic_module

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
assert len(K._class_unit_engine_cache) == 0
projection = list(K._class_number_projection_cache.values())[-1]
result = K.class_unit_group(proof=False)
assert projection._completed is result
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
# authenticated replay costs more than rebuilding its smaller BDF base for a
# conditional request.
L = NumberField(x**3 - x**2 + 7*x + 8, "b")
assert L.class_number(proof=False) == 6
large_artifact = L._bounded_cubic_class_number_artifact
assert len(large_artifact.factor_base) == 0
assert len(large_artifact.relation_records) == 0
assert large_artifact.diagnostics["factor_base_size"] == 10
assert not large_artifact.diagnostics["factor_base_materialized"]
assert large_artifact.diagnostics["relation_seed_size_policy_exceeded"]
assert len(L._class_unit_engine_cache) == 0
large_projection = list(L._class_number_projection_cache.values())[-1]
large_result = L.class_unit_group(proof=False)
assert large_projection._completed is large_result
large_resources = large_result.diagnostics["resources"]
assert large_result.proof_status == "exact-relations-conditional-grh"
assert large_resources["cubic_factor_base_seed_uses"] == 0
assert large_resources["cubic_relation_seed_uses"] == 0
assert large_resources["cubic_specialized_seed_skips"] == 1
assert large_resources["cubic_packed_factor_base_uses"] == 1
assert large_resources["cubic_relation_packed_factor_base_uses"] == 1
assert large_resources["cubic_verified_factor_base_collector_uses"] == 1
assert large_resources["cubic_integral_sieve_uses"] == 1
assert large_resources["cubic_integral_sieve_candidates"] == 27
assert large_resources["cubic_integral_sieve_relations"] == 5
assert large_resources["cubic_integral_sieve_dependency_relations"] == 1
assert large_resources["cubic_integral_sieve_validated_batch_uses"] == 1
assert large_resources["relation_exact_rank_one_units"] == 1
assert large_resources["unit_logarithm_requests"] == 0
assert large_resources["relation_attempts"] == 0
assert large_resources["relation_candidates"] == 0
assert large_resources["class_group_generator_reconstruction_calls"] == 1
assert large_resources["class_group_generator_power_requests"] >= 1
assert large_result.context.live_diagnostics()["packed_factor_base_size"] == 7
assert L.class_number(proof=False) == 6
assert L._bounded_cubic_class_number_artifact is large_artifact

# Missing producer authority falls back to the unchanged packed containment
# replay; it must not change the conditional answer or proof label.
saved_validate_batch = cubic_module._validated_cubic_integral_relation_batch
cubic_module._validated_cubic_integral_relation_batch = lambda *args, **kwargs: None
try:
    Q = NumberField(x**3 - x**2 + 7*x + 8, "q")
    assert Q.class_number(proof=False) == 6
finally:
    cubic_module._validated_cubic_integral_relation_batch = saved_validate_batch
fallback_projection = list(Q._class_number_projection_cache.values())[-1]
fallback_result = Q.class_unit_group(proof=False)
assert fallback_projection._completed is fallback_result
assert fallback_result.complete
assert fallback_result.proof_status == "exact-relations-conditional-grh"
assert fallback_result.diagnostics["resources"][
    "cubic_integral_sieve_validated_batch_uses"
] == 0

# For proof=True, the same ten-prime Minkowski prefix is much cheaper than
# discovering a conditional BDF presentation and then expressing every
# Minkowski prime in it during a separate unconditional proof pass.
P = L
assert P.class_number(proof=True) == 6
assert P._bounded_cubic_class_number_artifact is not large_artifact
proof_projection = P._class_number_projection_cache[
    next(key for key in P._class_number_projection_cache if key[0] is True)
]
proof_result = P.class_unit_group(proof=True)
assert proof_projection._completed is proof_result
proof_resources = proof_result.diagnostics["resources"]
assert proof_result.proof_status == "exact-unconditional"
assert proof_result.diagnostics["factor_base_bound"] == 17
assert proof_result.diagnostics["factor_base_size"] == 10
assert proof_result.diagnostics["unconditional_prime_records"] == ()
assert proof_resources["cubic_factor_base_seed_uses"] == 1
assert proof_resources["cubic_relation_seed_uses"] == 1
assert proof_resources["cubic_relation_seed_relations"] == 11
assert proof_resources["relation_attempts"] == 0
assert proof_resources["relation_candidates"] == 0
assert proof_resources["class_group_generator_reconstruction_calls"] == 1
assert proof_resources["class_group_generator_power_requests"] >= 1
assert proof_result.saturation_record.complete
assert proof_result.saturation_record.verify()

# LMFDB 3.1.5448.1 has no duplicate valuation row in the primary coefficient
# box.  The one bounded coefficient-4 fallback finds an exact pair whose unit
# quotient is fundamental, so the coupled engine again needs no LLL search.
W = NumberField(x**3 - x**2 - 14*x + 30, "c")
assert W.class_number(proof=False) == 8
widened_artifact = W._bounded_cubic_class_number_artifact
widened_search = widened_artifact.diagnostics["relation_search"]
assert widened_search["integral_sieve_dependency_candidates"] == 2
assert widened_search["integral_sieve_dependency_relations"] == 2
assert widened_search["integral_sieve_dependency_validated_batch"] == 1
assert widened_search["integral_sieve_dependency_coefficient_bound"] == 4
assert len(widened_artifact.relation_records) == 9
widened_projection = list(W._class_number_projection_cache.values())[-1]
widened_result = W.class_unit_group(proof=False)
assert widened_projection._completed is widened_result
widened_resources = widened_result.diagnostics["resources"]
assert widened_result.proof_status == "exact-unconditional"
assert widened_resources["cubic_relation_seed_relations"] == 9
assert widened_resources["relation_attempts"] == 0
assert widened_resources["relation_candidates"] == 0
assert widened_resources["unit_principal_authority_hits"] == 1
assert widened_resources["unit_principal_authority_fallbacks"] == 0
assert widened_result.context.live_diagnostics()["authenticated_dependency_units"] == 1

# Filtering the widened box by repeated absolute norm changes only the amount
# of packed valuation work: it retains exactly every candidate that could
# share a factor-base row, plus explicitly requested selected-row norms.
wide = cubic_module._packed_cubic_relation_candidates(
    W.maximal_order(),
    widened_result.conditional_factor_base,
    maximum_candidates=128,
    coefficient_bound=4,
    cancelled=None,
)
assert wide is not None
counts = {}
for _row, _coordinates, norm in wide:
    counts[norm] = counts.get(norm, 0) + 1
unique_norm = next(norm for norm in counts if counts[norm] == 1)
filtered = cubic_module._packed_cubic_relation_candidates(
    W.maximal_order(),
    widened_result.conditional_factor_base,
    maximum_candidates=128,
    coefficient_bound=4,
    duplicate_row_norms=(unique_norm,),
    cancelled=None,
)
assert filtered == tuple(
    entry for entry in wide if counts[entry[2]] > 1 or entry[2] == unique_norm
)
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
