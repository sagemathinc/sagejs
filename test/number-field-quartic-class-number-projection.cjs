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
import sagejs.number_fields.class_unit_groups as class_unit_module

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
