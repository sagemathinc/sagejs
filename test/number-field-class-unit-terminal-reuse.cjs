// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
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

function run(source) {
  const [executable, arguments_] = sagejsInvocation(["--python", "-"]);
  const result = spawnSync(executable, arguments_, {
    cwd: root,
    encoding: "utf8",
    input: source,
    // This integration test intentionally performs several cold exact
    // class/unit computations in one interpreter.  Keep the subprocess bound
    // finite, but allow slower CI architectures to finish the proof replays.
    timeout: 300_000,
  });
  assert.equal(
    result.status,
    0,
    result.error?.message ||
      result.stderr ||
      result.stdout ||
      "sagejs subprocess failed without diagnostics",
  );
  return result.stdout.trim();
}

test("reuses only authenticated, independently cloned proof terminals", () => {
  const output = run(String.raw`
import time
import sagejs.number_fields.class_unit_groups as engine_module

R = PolynomialRing(QQ, "x")
x = R.gen()
K = NumberField(x**5 + x**3 - x**2 + 4*x + 1, "a")

started = time.monotonic()
conditional = K.class_unit_group(proof=False)
conditional_seconds = time.monotonic() - started
assert conditional.complete
assert conditional.proof_status == "exact-relations-conditional-grh"
conditional_group = conditional.class_group()
conditional_units = conditional.unit_group()
conditional_stages = tuple(stage.name for stage in conditional.stages)
conditional_factor_base_size = len(conditional.conditional_factor_base)
conditional_relation_count = len(conditional.conditional_relation_records)
conditional_unit_count = len(conditional.units())

started = time.monotonic()
unconditional = K.class_unit_group(proof=True)
upgrade_seconds = time.monotonic() - started
assert unconditional.complete
assert unconditional.proof_status == "exact-unconditional"
assert unconditional.class_number() == conditional.class_number() == 4
assert unconditional.diagnostics["terminal_upgrade"] == {
    "schema": "sagejs.number-fields/class-unit-terminal-upgrade-v1",
    "reused_factor_base_size": conditional_factor_base_size,
    "reused_relation_count": conditional_relation_count,
    "reused_presentation": True,
    "reused_units": conditional_unit_count,
    "reused_saturation": True,
    "rerun_relation_search": False,
    "rerun_analytic_index": False,
}
assert conditional.proof_status == "exact-relations-conditional-grh"
assert conditional.class_group() is conditional_group
assert conditional.unit_group() is conditional_units
assert conditional_group.proof_status == "exact-relations-conditional-grh"
assert conditional_units.proof_status == "exact-relations-conditional-grh"
assert tuple(stage.name for stage in conditional.stages) == conditional_stages
assert unconditional.class_group() is not conditional_group
assert unconditional.unit_group() is not conditional_units
assert unconditional.unit_group().torsion is not conditional_units.torsion
assert unconditional.regulator() is not conditional.regulator()
assert unconditional.saturation_record is not conditional.saturation_record
assert all(
    left is not right
    for left, right in zip(unconditional.units(), conditional.units())
)
assert tuple(unit.to_dict() for unit in unconditional.units()) == tuple(
    unit.to_dict() for unit in conditional.units()
)
assert unconditional.regulator().to_dict() == conditional.regulator().to_dict()
assert unconditional.saturation_record.to_dict() == conditional.saturation_record.to_dict()
assert unconditional.class_group().proof_status == "exact-unconditional"
assert unconditional.unit_group().proof_status == "exact-unconditional"
assert unconditional.conditional_factor_base == conditional.conditional_factor_base
assert unconditional.conditional_relation_records == conditional.conditional_relation_records
assert unconditional.conditional_presentation_evidence is conditional.conditional_presentation_evidence
for name in ("presentation", "generators", "saturation"):
    assert unconditional.proof_dependency_hashes[name] == conditional.proof_dependency_hashes[name]
assert unconditional.proof_dependency_hashes["relations"] != conditional.proof_dependency_hashes["relations"]
names = tuple(stage.name for stage in unconditional.stages)
assert names[:len(conditional_stages) - 2] == conditional_stages[:-2]
assert names[-3:] == ("unconditional-proof", "proof", "terminal")

# Later mutation of the conditional result cannot poison the unconditional clone.
unconditional_units_payload = tuple(unit.to_dict() for unit in unconditional.units())
unconditional_regulator_payload = unconditional.regulator().to_dict()
unconditional_saturation_payload = unconditional.saturation_record.to_dict()
conditional_units.torsion.order = 999
conditional_units.generators = ()
conditional.regulator().status = "tampered"
conditional.regulator().ball.lower = conditional.regulator().ball.upper
conditional.saturation_record.analytic_validation["lower_index"] = 999
assert unconditional.unit_group().torsion.order != 999
assert tuple(unit.to_dict() for unit in unconditional.units()) == unconditional_units_payload
assert unconditional.regulator().to_dict() == unconditional_regulator_payload
assert unconditional.saturation_record.to_dict() == unconditional_saturation_payload
assert K.class_unit_group(proof=True) is unconditional

# The public adapter independently verifies the cloned exact proof result.  Public
# object caching is deliberately not part of this terminal-reuse optimization.
public_unconditional = K.class_group(proof=True)
assert public_unconditional.proof_status == "exact-unconditional"
assert public_unconditional.verify()

# A cold proof=True run may select a different exact unit basis, but must prove
# the same class group and compatible rigorous regulator.
saved_engine_cache = K._class_unit_engine_cache
K._class_unit_engine_cache = {}
cold = K.class_unit_group(proof=True)
cold_public = K.class_group(proof=True)
K._class_unit_engine_cache = saved_engine_cache
assert cold.diagnostics.get("terminal_upgrade") is None
assert cold.proof_status == unconditional.proof_status
assert cold.class_number() == unconditional.class_number()
assert cold.class_group().invariants() == unconditional.class_group().invariants()
assert cold.unit_group().unit_rank == unconditional.unit_group().unit_rank
assert cold.unit_group().torsion.order == unconditional.unit_group().torsion.order
assert cold.regulator().rigorous and unconditional.regulator().rigorous
assert not (
    cold.regulator().upper < unconditional.regulator().lower
    or unconditional.regulator().upper < cold.regulator().lower
)
assert cold.saturation_record.complete and unconditional.saturation_record.complete
assert cold_public.proof_status == public_unconditional.proof_status
assert cold_public.invariants() == public_unconditional.invariants()
assert cold_public.order() == public_unconditional.order()
assert cold_public.verify()

# A checkpoint-byte policy is controller state, not part of the exact engine key.
# It bypasses both the cached context and the proof-upgrade lease.
checkpoint_scoped = K.class_unit_group(proof=False, max_checkpoint_bytes=1)
assert checkpoint_scoped is not conditional
assert checkpoint_scoped.context.limits.max_checkpoint_bytes == 1
assert K.class_unit_group(proof=False) is conditional

# Every mutable unit-side semantic leaf is covered by the private terminal
# snapshot.  Restoring the value restores eligibility; immutable unit contents
# reject mutation at the source representation.
M = NumberField(x**5 + x**3 - x**2 + 4*x + 1, "m")
mutable = M.class_unit_group(proof=False)
live = mutable.context._live_artifacts
snapshot = live.terminal_semantic_snapshot
unit_group = mutable.unit_group()
old_generators = unit_group.generators
unit_group.generators = ()
try:
    live._capture_terminal_semantics()
    raise AssertionError("replaced unit generators remained proof-upgrade eligible")
except ValueError:
    pass
unit_group.generators = old_generators
old_regulator = unit_group.regulator_enclosure
unit_group.regulator_enclosure = None
try:
    live._capture_terminal_semantics()
    raise AssertionError("a missing regulator remained proof-upgrade eligible")
except ValueError:
    pass
unit_group.regulator_enclosure = old_regulator
old_status = old_regulator.status
old_regulator.status = "tampered"
assert live._capture_terminal_semantics() != snapshot
old_regulator.status = old_status
validation_view = mutable.saturation_record.analytic_validation
validation_view["upper_index"] = 999
assert mutable.saturation_record.analytic_validation["upper_index"] == 1
assert live._capture_terminal_semantics() == snapshot
try:
    mutable.saturation_record.analytic_validation = validation_view
    raise AssertionError("saturation authority was unexpectedly replaceable")
except (AttributeError, TypeError):
    pass
try:
    mutable.units()[0]._factors = ()
    raise AssertionError("factored unit contents were unexpectedly mutable")
except (AttributeError, TypeError):
    pass
assert live._capture_terminal_semantics() == snapshot

# Hostile torsion mutation before issuance fails closed to a cold proof run.
L = NumberField(x**5 + x**3 - x**2 + 4*x + 1, "b")
changed = L.class_unit_group(proof=False)
changed.unit_group().torsion.order = 999
cold_fallback = L.class_unit_group(proof=True)
assert cold_fallback.proof_status == "exact-unconditional"
assert cold_fallback.diagnostics.get("terminal_upgrade") is None
assert cold_fallback.unit_group().torsion.order != 999

# A suffix exception releases the reservation, so an exact retry can reuse the
# same authenticated conditional terminal.  The lease is also reentrancy-safe.
T = NumberField(x**5 + x**3 - x**2 + 4*x + 1, "t")
retry_source = T.class_unit_group(proof=False)
limits = engine_module.ClassUnitEngineLimits()
original_proof_pass = engine_module.ClassUnitGroupEngine._unconditional_proof_pass
def induced_failure(self, group):
    raise RuntimeError("induced terminal suffix failure")
engine_module.ClassUnitGroupEngine._unconditional_proof_pass = induced_failure
try:
    engine_module._upgrade_cached_conditional_result(
        T, retry_source, algorithm="auto", limits=limits, seed=0
    )
    raise AssertionError("the induced proof suffix unexpectedly succeeded")
except RuntimeError as error:
    assert "induced terminal suffix failure" in str(error)
finally:
    engine_module.ClassUnitGroupEngine._unconditional_proof_pass = original_proof_pass
assert not retry_source.context._live_artifacts.terminal_upgrade_reserved
assert not retry_source.context._live_artifacts.terminal_upgrade_issued
retried = T.class_unit_group(proof=True)
assert retried.diagnostics.get("terminal_upgrade") is not None

# A retained prime ideal is an identity-bound shell around mutable exact HNF
# data.  Its complete canonical serialization is sealed before publication, so
# hostile lattice mutation rejects the terminal fork before the proof suffix.
F = NumberField(x**5 + x**3 - x**2 + 4*x + 1, "f")
factor_source = F.class_unit_group(proof=False)
assert factor_source.proof_status == "exact-relations-conditional-grh"
factor_live = factor_source.context._live_artifacts
factor = factor_source.conditional_factor_base[0]
original_basis = factor._basis_rows
factor._basis_rows = F.maximal_order().ideal(1)._basis_rows
proof_suffix_calls = 0
def forbidden_factor_suffix(self, group):
    global proof_suffix_calls
    proof_suffix_calls += 1
    raise AssertionError("tampered factor base reached the proof suffix")
engine_module.ClassUnitGroupEngine._unconditional_proof_pass = forbidden_factor_suffix
try:
    rejected = engine_module._upgrade_cached_conditional_result(
        F, factor_source, algorithm="auto", limits=limits, seed=0
    )
    assert rejected is None
finally:
    engine_module.ClassUnitGroupEngine._unconditional_proof_pass = original_proof_pass
    factor._basis_rows = original_basis
assert proof_suffix_calls == 0
assert not factor_live.terminal_upgrade_reserved
assert not factor_live.terminal_upgrade_issued

print("terminal-reuse", conditional_seconds, upgrade_seconds)
`);
  assert.match(output, /^terminal-reuse /);
});

test("reuses C4 quintic terminals with detached torsion authority", () => {
  const output = run(String.raw`
import json
import time

import sagejs.number_fields.factored_elements as factored_module
import sagejs.number_fields.class_unit_groups as engine_module
import sagejs.number_fields.units as units_module

R = PolynomialRing(QQ, "x")
x = R.gen()
K = NumberField(x**5 + x**3 - x**2 + 4*x + 1, "a")

started = time.monotonic()
conditional = K.class_unit_group(proof=False)
conditional_seconds = time.monotonic() - started
assert conditional.complete
assert conditional.proof_status == "exact-relations-conditional-grh"
assert conditional.class_number() == 4
assert conditional.class_group().invariants() == (4,)
conditional_relation_count = len(conditional.conditional_relation_records)
conditional_torsion = conditional.unit_group().torsion
assert conditional_torsion.verify(force_replay=True)
limits = engine_module.ClassUnitEngineLimits()
live = conditional.context._live_artifacts

# Hostile torsion and certificate mutations fail closed before the proof suffix.
original_order = conditional_torsion.order
conditional_torsion.order = 999
assert engine_module._upgrade_cached_conditional_result(
    K, conditional, algorithm="auto", limits=limits, seed=0
) is None
assert not live.terminal_upgrade_reserved
assert not live.terminal_upgrade_issued
conditional_torsion.order = original_order

original_kind = conditional_torsion.certificate.kind
conditional_torsion.certificate.kind = "embedding-box-exhaustion"
assert engine_module._upgrade_cached_conditional_result(
    K, conditional, algorithm="auto", limits=limits, seed=0
) is None
assert not live.terminal_upgrade_reserved
assert not live.terminal_upgrade_issued
conditional_torsion.certificate.kind = original_kind
assert conditional_torsion.verify(force_replay=True)

original_certificate = conditional_torsion.certificate
replacement_certificate = units_module.RootsOfUnityCertificate.from_dict(
    K, json.loads(json.dumps(original_certificate.to_dict()))
)
conditional_torsion.certificate = replacement_certificate
assert engine_module._upgrade_cached_conditional_result(
    K, conditional, algorithm="auto", limits=limits, seed=0
) is None
assert not live.terminal_upgrade_reserved
assert not live.terminal_upgrade_issued
conditional_torsion.certificate = original_certificate
assert conditional_torsion.verify(force_replay=True)

original_certificate_type = units_module.RootsOfUnityCertificate
class FailingCertificateDecoder:
    @classmethod
    def from_dict(cls, field, payload):
        raise RuntimeError("induced roots-of-unity replay failure")
units_module.RootsOfUnityCertificate = FailingCertificateDecoder
try:
    engine_module._upgrade_cached_conditional_result(
        K, conditional, algorithm="auto", limits=limits, seed=0
    )
    raise AssertionError("the induced certificate replay unexpectedly succeeded")
except RuntimeError as error:
    assert "induced roots-of-unity replay failure" in str(error)
finally:
    units_module.RootsOfUnityCertificate = original_certificate_type
assert not live.terminal_upgrade_reserved
assert not live.terminal_upgrade_issued
assert conditional_torsion.verify(force_replay=True)

proof_constructions = {"representative": 0, "principal": 0}
original_representative = engine_module._EngineClassGroup.representative_ideal
original_principal = factored_module.FactoredNumberFieldElement.principal_ideal
def counted_representative(self, coordinates):
    proof_constructions["representative"] += 1
    return original_representative(self, coordinates)
def counted_principal(self, order):
    proof_constructions["principal"] += 1
    return original_principal(self, order)
engine_module._EngineClassGroup.representative_ideal = counted_representative
factored_module.FactoredNumberFieldElement.principal_ideal = counted_principal
started = time.monotonic()
try:
    unconditional = K.class_unit_group(proof=True)
    upgrade_seconds = time.monotonic() - started
finally:
    engine_module._EngineClassGroup.representative_ideal = original_representative
    factored_module.FactoredNumberFieldElement.principal_ideal = original_principal
assert unconditional.complete
assert unconditional.proof_status == "exact-unconditional"
assert unconditional.class_number() == 4
assert unconditional.class_group().invariants() == (4,)
assert unconditional.diagnostics["terminal_upgrade"] == {
    "schema": "sagejs.number-fields/class-unit-terminal-upgrade-v1",
    "reused_factor_base_size": 6,
    "reused_relation_count": conditional_relation_count,
    "reused_presentation": True,
    "reused_units": 2,
    "reused_saturation": True,
    "rerun_relation_search": False,
    "rerun_analytic_index": False,
}
proof_prime_count = next(
    stage.details["prime_ideals"]
    for stage in unconditional.stages
    if stage.name == "unconditional-proof"
)
assert proof_prime_count == 12
assert proof_constructions == {
    "representative": proof_prime_count,
    "principal": proof_prime_count,
}
unconditional_torsion = unconditional.unit_group().torsion
assert unconditional_torsion is not conditional_torsion
assert unconditional_torsion.certificate is not conditional_torsion.certificate
assert unconditional_torsion.verify(force_replay=True)

certificate_payload = json.loads(
    json.dumps(unconditional_torsion.certificate.to_dict())
)
detached_certificate = units_module.RootsOfUnityCertificate.from_dict(
    K, certificate_payload
)
assert detached_certificate.verify(unconditional_torsion, force_replay=True)

# Mutating the conditional certificate after issuance cannot poison the exact clone.
conditional_torsion.certificate.kind = "embedding-box-exhaustion"
assert not conditional_torsion.verify(force_replay=True)
assert unconditional_torsion.verify(force_replay=True)
assert K.class_unit_group(proof=True) is unconditional

public_group = K.class_group(proof=True)
assert public_group.proof_status == "exact-unconditional"
assert public_group.order() == 4
assert public_group.invariants() == (4,)
assert public_group.verify()
public_payload = json.loads(json.dumps(public_group.proof_payload()))
assert public_group.verify_proof_payload(public_payload)

print("c4-terminal-reuse", conditional_seconds, upgrade_seconds)
`);
  assert.match(output, /^c4-terminal-reuse /);
});
