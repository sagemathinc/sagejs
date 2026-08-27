"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");

const root = join(__dirname, "..");

function runSource(source, timeout = 360_000) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-quartic-scalar-"));
  try {
    const filename = join(directory, "test.py");
    writeFileSync(filename, source, "utf8");
    const executable =
      process.platform === "win32"
        ? process.execPath
        : join(root, "bin", "sagejs");
    const arguments_ =
      process.platform === "win32"
        ? [join(root, "bin", "sagejs-source.cjs"), "--python", filename]
        : ["--python", filename];
    const result = spawnSync(executable, arguments_, {
      cwd: root,
      encoding: "utf8",
      timeout,
      killSignal: "SIGKILL",
      maxBuffer: 16 * 1024 * 1024,
      env: { ...process.env, SAGEJS_USE_SOURCE: "1" },
    });
    assert.equal(
      result.status,
      0,
      result.error?.message || result.stderr || result.stdout,
    );
    return result.stdout.trim();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("quartic scalar projections retain exact resumable saturation state", () => {
  const output = runSource(String.raw`
import sagejs.number_fields.class_group_factor_base as factor_base_module
import sagejs.number_fields.class_group_maps as class_group_maps
import sagejs.number_fields.class_unit_analytic as analytic_module
import sagejs.number_fields.class_unit_context as context_module
import sagejs.number_fields.class_unit_groups as class_unit_module
import sagejs.number_fields.maximal_order as maximal_order_module

R = PolynomialRing(QQ, "x")
x = R.gen()
cases = (
    ("complex-h2", x**4 - x**3 + 3*x**2 + 2*x + 1, 2),
    ("mixed-h2", x**4 - 2*x**3 - x**2 - 3*x + 1, 2),
    ("real-h2", x**4 - 4*x**3 - 5*x**2 + 5*x + 4, 2),
    ("complex-h4", x**4 - 4*x**3 + 4*x**2 - x + 6, 4),
)

for proof in (False, True):
    for index, (_label, polynomial, expected) in enumerate(cases):
        K = NumberField(polynomial, "a" + str(int(proof)) + str(index))
        K.maximal_order()
        builds = [0]
        original_build = factor_base_module.build_factor_base
        def counted_build(plan):
            builds[0] += 1
            return original_build(plan)
        factor_base_module.build_factor_base = counted_build
        try:
            assert class_unit_module.quartic_class_number_projection(
                K, proof=proof
            ) == expected
        finally:
            factor_base_module.build_factor_base = original_build
        assert builds[0] == 1, ("module-builds", proof, index, builds[0])
        key = class_unit_module._class_number_projection_cache_key(
            proof, class_unit_module.ClassUnitEngineLimits()
        )
        projection = class_unit_module._cached_class_number_projection(K, key, proof)
        assert projection is not None and projection.matches(K, proof)
        engine = projection._engine
        resources = engine._resource_usage
        assert resources["quartic_factor_base_seed_uses"] == 1
        assert resources["class_number_post_saturation_projections"] in (0, 1)
        assert resources["deferred_saturation_certificate_constructions"] == 0
        attempts = resources["relation_attempts"]
        relations = resources["relations"]
        assert engine._context_saturation_record() is None

        completed = class_unit_module.class_unit_context(
            K, proof=proof, algorithm="auto"
        )
        assert completed.complete and completed.class_number() == expected
        assert completed.proof_status == "exact-unconditional"
        assert completed.context is engine.context
        assert resources["relation_attempts"] == attempts
        assert resources["relations"] == relations
        assert resources["deferred_saturation_certificate_constructions"] == 1
        assert completed.saturation_record.verify(K, K.maximal_order())
        assert completed.class_group().order() == expected

# The public scalar method publishes the same resumable projection, and the
# subsequent public class-group observation consumes it without rebuilding the
# factor base or taking another relation-search step.
for proof in (False, True):
    K = NumberField(
        x**4 - 2*x**3 - x**2 - 3*x + 1,
        "public" + str(int(proof)),
    )
    builds = [0]
    original_build = factor_base_module.build_factor_base
    def counted_public_build(plan):
        builds[0] += 1
        return original_build(plan)
    factor_base_module.build_factor_base = counted_public_build
    try:
        assert K.class_number(proof=proof) == 2
        key = class_unit_module._class_number_projection_cache_key(
            proof, class_unit_module.ClassUnitEngineLimits()
        )
        projection = class_unit_module._cached_class_number_projection(K, key, proof)
        assert projection is not None and projection.matches(K, proof)
        resources = projection._engine._resource_usage
        attempts = resources["relation_attempts"]
        relations = resources["relations"]
        scalar_builds = builds[0]
        group = K.class_group(proof=proof)
    finally:
        factor_base_module.build_factor_base = original_build
    assert scalar_builds == 1, ("public-scalar-builds", proof, scalar_builds)
    # The public adapter may independently rebuild the theorem's factor-base
    # presentation during proof replay, but it does not launch a second search.
    assert builds[0] <= 2, ("public-total-builds", proof, builds[0])
    assert group.order() == 2 and group.invariants() == (2,)
    assert group.verify()
    assert resources["relation_attempts"] == attempts
    assert resources["relations"] == relations

# A reusable public adapter consumes the saturation record's already-canonical
# body.  It never reconstructs that payload from exact unit objects, while the
# returned group still performs the ordinary full saturation replay.  A
# changed retained body is a failed hint and the reservation remains retryable.
K = NumberField(x**4 - 2*x**3 - x**2 - 3*x + 1, "payload")
result = class_unit_module.class_unit_context(K, proof=False, algorithm="auto")
assert result.complete and result.class_number() == 2
record = result.saturation_record
assert not hasattr(record, "_producer_artifacts")
body_builds = [0]
original_body_dict = record._body_dict
def counted_body_dict():
    body_builds[0] += 1
    return original_body_dict()
record._body_dict = counted_body_dict
live = result.context._live_artifacts
transaction = result.context._begin_live_public_class_group_projection(
    context_module._LIVE_CLASS_UNIT_CONTEXT_TOKEN, result
)
assert transaction == ("reserved", None)
original_body = record._canonical_body_json
record._canonical_body_json = "{}"
try:
    assert result.context._consume_live_public_saturation_payload(
        context_module._LIVE_CLASS_UNIT_CONTEXT_TOKEN, result
    ) is None
finally:
    record._canonical_body_json = original_body
    assert result.context._finish_live_public_class_group_projection(
        context_module._LIVE_CLASS_UNIT_CONTEXT_TOKEN, commit=False
    )
assert not live.public_class_group_projection_reserved
assert not live.public_saturation_payload_issued
assert not live.public_generation_payload_issued
assert live.public_class_group_projection_source is None

# Generation replay authenticates the current ordered relation batch against
# the producer's immutable digest.  A changed live record must fail before
# publication even when the retained serialized evidence itself is unchanged.
collector = live.collector
relation = collector.records[0]
original_provenance = dict(relation.provenance)
relation.provenance["mutated-after-admission"] = True
try:
    class_unit_module.class_group(K, proof=False)
    raise AssertionError("a changed live relation batch was accepted")
except ArithmeticError as error:
    assert "adapted public class group failed proof replay" in str(error)
finally:
    relation.provenance.clear()
    relation.provenance.update(original_provenance)
assert live.public_class_group_projection is None
assert not live.public_class_group_projection_reserved
assert not live.public_saturation_payload_issued
assert not live.public_generation_payload_issued
assert live.public_class_group_projection_source is None

# Relation/presentation subtrees are likewise construction hints.  A changed
# retained presentation must fail the ordinary conditional proof replay and
# leave the one-shot transaction cleanly retryable.
generation_payload = live.generation_artifact.evidence
original_backend = generation_payload["presentation"]["backend"]
generation_payload["presentation"]["backend"] = "mutated"
try:
    class_unit_module.class_group(K, proof=False)
    raise AssertionError("a changed retained generation payload was accepted")
except ArithmeticError as error:
    assert "adapted public class group failed proof replay" in str(error)
finally:
    generation_payload["presentation"]["backend"] = original_backend
assert live.public_class_group_projection is None
assert not live.public_class_group_projection_reserved
assert not live.public_saturation_payload_issued
assert not live.public_generation_payload_issued
assert live.public_class_group_projection_source is None

# The retained primitive tree is only a construction hint.  Changing it while
# leaving the canonical producer record intact reaches the final independent
# replay, fails there, rolls the transaction back, and cannot publish a group.
body_payload = record._canonical_body_payload
original_reason = body_payload["reason"]
body_payload["reason"] = "mutated retained saturation payload"
try:
    class_unit_module.class_group(K, proof=False)
    raise AssertionError("a changed retained saturation payload was accepted")
except ArithmeticError as error:
    assert "adapted public class group failed proof replay" in str(error)
finally:
    body_payload["reason"] = original_reason
assert live.public_class_group_projection is None
assert not live.public_class_group_projection_reserved
assert not live.public_saturation_payload_issued
assert not live.public_generation_payload_issued
assert live.public_class_group_projection_source is None

# Replacing the context-side receipt consumer disables the live transaction.
# The standard adapter therefore takes its ordinary full-verification path and
# cannot publish anything through a forged True result.
original_construction_consumer = (
    result.context._consume_live_public_class_group_construction
)
result.context._consume_live_public_class_group_construction = (
    lambda *_args: True
)
try:
    interposed = class_unit_module.class_group(K, proof=False)
    assert interposed.order() == 2 and interposed.verify()
finally:
    result.context._consume_live_public_class_group_construction = (
        original_construction_consumer
    )
assert live.public_class_group_projection is None
assert not live.public_class_group_projection_reserved
assert not live.public_class_group_construction_issued

before_live_publication = body_builds[0]
live_relation_replays = [0]
live_presentation_replays = [0]
original_relation_replay = class_group_maps.IdealClassGroup._verify_relations
original_presentation_replay = (
    class_group_maps.IdealClassGroup._verify_presentation_evidence
)
def counted_live_relation_replay(self):
    live_relation_replays[0] += 1
    return original_relation_replay(self)
def counted_live_presentation_replay(self):
    live_presentation_replays[0] += 1
    return original_presentation_replay(self)
class_group_maps.IdealClassGroup._verify_relations = counted_live_relation_replay
class_group_maps.IdealClassGroup._verify_presentation_evidence = (
    counted_live_presentation_replay
)
try:
    group = class_unit_module.class_group(K, proof=False)
finally:
    class_group_maps.IdealClassGroup._verify_relations = original_relation_replay
    class_group_maps.IdealClassGroup._verify_presentation_evidence = (
        original_presentation_replay
    )
assert group.order() == 2
assert live_relation_replays[0] == 0 and live_presentation_replays[0] == 0
assert group.verify()
# The one call belongs to the final independent public verifier.  The adapter
# construction itself consumed the retained canonical body instead of calling
# its serializer a second time.
assert body_builds[0] == before_live_publication + 1, (
    "live-body-builds", body_builds[0]
)
before_cold_publication = body_builds[0]
relation_replays = [0]
presentation_replays = [0]
original_relation_replay = class_group_maps.IdealClassGroup._verify_relations
original_presentation_replay = (
    class_group_maps.IdealClassGroup._verify_presentation_evidence
)
def counted_relation_replay(self):
    relation_replays[0] += 1
    return original_relation_replay(self)
def counted_presentation_replay(self):
    presentation_replays[0] += 1
    return original_presentation_replay(self)
class_group_maps.IdealClassGroup._verify_relations = counted_relation_replay
class_group_maps.IdealClassGroup._verify_presentation_evidence = (
    counted_presentation_replay
)
try:
    cold = class_group_maps.class_group_from_engine_result(result)
    assert cold.order() == 2
    assert relation_replays[0] == 1 and presentation_replays[0] == 1
    assert cold.verify()
    assert relation_replays[0] == 2 and presentation_replays[0] == 2
finally:
    class_group_maps.IdealClassGroup._verify_relations = original_relation_replay
    class_group_maps.IdealClassGroup._verify_presentation_evidence = (
        original_presentation_replay
    )
assert body_builds[0] == before_cold_publication + 3, (
    "cold-body-builds", body_builds[0]
)

# The quartic continuation first spends the already-authenticated relation
# context against a nontrivial global index.  Here one bounded batch of twelve
# exact relations shrinks the class lattice from order four to two, so no
# unit-saturation certificate is constructed at all.
K = NumberField(x**4 + 5*x**2 - 70*x - 190, "attempt_summary")
assert class_unit_module.quartic_class_number_projection(K, proof=False) == 2
result = class_unit_module.class_unit_context(K, proof=False, algorithm="auto")
record = result.saturation_record
unit_attempts = [
    attempt for attempt in record.attempts
    if attempt["schema"] == "sagejs.number-fields/unit-saturation-attempt-v1"
]
assert unit_attempts == []
class_attempts = [
    attempt for attempt in record.attempts
    if attempt["schema"] == "sagejs.number-fields/class-saturation-attempt-v1"
]
assert len(class_attempts) == 1
assert class_attempts[0]["relations_admitted"] == 12
assert class_attempts[0]["class_order_before"] == 4
assert class_attempts[0]["class_order_after"] == 2
assert class_attempts[0]["class_lattice_enlarged"]
resources = result.diagnostics["resources"]
assert resources["quartic_class_number_relation_saturation_first_uses"] == 1
assert not hasattr(record, "_producer_artifacts")
assert record.verify(K, K.maximal_order())

# A class-number-one scalar stops after the exact live principal-witness
# checks.  It defers certificate construction/replay, serves either proof
# policy from the same unconditional state, and materializes on demand.
K = NumberField(x**4 + 2, "trivial")
assert class_unit_module.quartic_class_number_projection(K, proof=False) == 1
key = class_unit_module._class_number_projection_cache_key(
    False, class_unit_module.ClassUnitEngineLimits()
)
projection = class_unit_module._cached_class_number_projection(K, key, False)
assert projection is not None and projection.matches(K, True)
resources = projection._engine._resource_usage
assert resources["deferred_minkowski_certificate_constructions"] == 0
assert class_unit_module.quartic_class_number_projection(K, proof=True) == 1
assert resources["deferred_minkowski_certificate_constructions"] == 0
bounded = class_unit_module.quartic_class_number_one_projection_result(K, True)
assert bounded.complete and bounded.order() == 1
assert bounded.certificate.verify(max_elements=1)
assert resources["deferred_minkowski_certificate_constructions"] == 1

# Its public class-group continuation reuses the retained scalar certificate.
K = NumberField(x**4 + 2, "public_trivial")
assert K.class_number(proof=False) == 1
projection = class_unit_module._cached_class_number_projection(K, key, True)
assert projection is not None and projection.matches(K, True)
assert projection._engine._resource_usage[
    "deferred_minkowski_certificate_constructions"
] == 0
group = K.class_group(proof=True)
assert group.order() == 1 and group.invariants() == () and group.verify()
assert projection._engine._resource_usage[
    "deferred_minkowski_certificate_constructions"
] == 1

# Caller-side scalar/snapshot rewrites cannot replace the context-owned seal.
K = NumberField(x**4 + 2, "hostile_trivial")
assert class_unit_module.quartic_class_number_projection(K, proof=False) == 1
projection = class_unit_module._cached_class_number_projection(K, key, False)
try:
    projection.__dict__["class_number"] = 2
    projection.__dict__["_authentication_snapshot"] = projection.authority_snapshot()
except (AttributeError, TypeError):
    pass
assert projection.class_number == 1
content_hash = projection._arithmetic.stable_hash()
try:
    projection._arithmetic.__dict__["_content_sha256"] = "0" * 64
except (AttributeError, TypeError):
    pass
assert projection._arithmetic.stable_hash() == content_hash
projection._engine.context._live_artifacts.minkowski_class_number_one_snapshot = (
    "forged",
)
assert not class_unit_module.quartic_class_number_projection_pending(K, False)
assert class_unit_module.quartic_class_number_projection(K, proof=False) == 1

# Rewriting the caller-visible state and its own snapshot cannot rewrite the
# independent context-owned issuance snapshot.  The hint is declined and a
# fresh exact scalar computation replaces it.
K = NumberField(x**4 - x**3 + 3*x**2 + 2*x + 1, "hostile")
engine = class_unit_module.ClassUnitGroupEngine(
    K, proof=False, algorithm="minkowski"
)
initial_projection = engine.run(class_number_only=True)
assert isinstance(initial_projection, class_unit_module._ClassNumberProjection)
continuation = initial_projection._continuation
values = engine._adaptive_saturation(
    continuation[1],
    continuation[2],
    continuation[3],
    continuation[4],
    continuation[5],
    continuation[6],
    continuation[7],
    continuation[8],
    plan=continuation[0],
    proof_status=continuation[9],
    defer_record=True,
)
old_projection = engine._issue_class_number_projection(
    continuation[0],
    continuation[1],
    values[0],
    values[1],
    values[2],
    values[3],
    values[4],
    values[5],
    continuation[8],
    continuation[9],
    values[6],
)
assert old_projection.class_number == 2
assert engine._resource_usage["class_number_post_saturation_projections"] == 1
key = class_unit_module._class_number_projection_cache_key(
    False, class_unit_module.ClassUnitEngineLimits()
)
class_unit_module._retain_class_number_projection(
    K, old_projection, class_unit_module.ClassUnitEngineLimits()
)
state = old_projection._continuation[-1]
state.attempts = state.attempts + ({"forged": True},)
state._snapshot = state.authority_snapshot()
assert not class_unit_module.quartic_class_number_projection_pending(K, False)
assert class_unit_module.quartic_class_number_projection(K, proof=False) == 2
new_projection = class_unit_module._cached_class_number_projection(K, key, False)
assert new_projection is not None and new_projection is not old_projection

# The quartic scalar path screens the bounded integral-order box with one exact
# multiplication table.  Its determinant selects exactly the norm-one field
# elements, and the table is rebuilt independently of the shared mutable cache.
K = NumberField(x**4 + 2, "norm_screen_control")
O = K.maximal_order()
basis = tuple(O.basis())
cached_tables = list(maximal_order_module._order_multiplication_table_cache)
maximal_order_module._order_multiplication_table_cache[:] = [
    (O, tuple(tuple(tuple(0 for _row in range(4)) for _column in range(4))
              for _left in range(4)))
]
try:
    multiplication_table = (
        analytic_module._exact_quartic_order_multiplication_table(O)
    )
finally:
    maximal_order_module._order_multiplication_table_cache[:] = cached_tables
expected_candidates = []
forms = tuple(
    tuple(multiplication_table[left][column][row] for left in range(4))
    for row in range(4)
    for column in range(4)
)
for coordinates in analytic_module._coordinate_vectors(1, 4):
    value = K.zero()
    for coefficient, basis_element in zip(coordinates, basis, strict=True):
        value += coefficient * basis_element
    c0, c1, c2, c3 = coordinates
    entries = tuple(
        c0 * form[0] + c1 * form[1] + c2 * form[2] + c3 * form[3]
        for form in forms
    )
    norm = value.norm()
    assert norm._denominator == 1
    assert analytic_module._quartic_determinant(entries) == norm._numerator
    if abs(norm) == 1:
        expected_candidates.append(coordinates)
assert analytic_module._quartic_unit_coordinate_candidates(
    multiplication_table, 1, None
) == tuple(expected_candidates)

# On the higher-discriminant example, only the rare norm-one survivors reach
# the expensive conjugate-based exact-unit verifier.
K = NumberField(x**4 + 5*x**2 - 70*x - 190, "norm_screen")
exact_unit_calls = [0]
original_exact_unit = analytic_module._exact_unit
def counted_exact_unit(field, order, value):
    exact_unit_calls[0] += 1
    return original_exact_unit(field, order, value)
analytic_module._exact_unit = counted_exact_unit
try:
    assert K.class_number(proof=False) == 2
finally:
    analytic_module._exact_unit = original_exact_unit
assert exact_unit_calls[0] <= 16, exact_unit_calls[0]

# Cancellation-bearing engines are non-reusable and never publish a scalar
# projection through this cache-only optimization boundary.
K = NumberField(x**4 - 2*x**3 - x**2 - 3*x + 1, "cancelled")
engine = class_unit_module.ClassUnitGroupEngine(
    K, proof=False, algorithm="auto", cancelled=lambda: True
)
try:
    engine.run(class_number_only=True)
    raise AssertionError("the cancelled quartic scalar engine continued")
except RuntimeError as error:
    assert "cancelled" in str(error)
assert not getattr(K, "_class_number_projection_cache", None)

print("quartic-class-number-projection-ok")
`);
  assert.equal(output, "quartic-class-number-projection-ok");
});
