// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { join } = require("node:path");
const test = require("node:test");
const { spawnSagejsSync } = require("./helpers/sagejs-cli.cjs");

function run(source) {
  const root = join(__dirname, "..");
  const result = spawnSagejsSync(root, ["--python", "-"], {
    cwd: root, encoding: "utf8", input: source, timeout: 600000,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

test("conditional terminal reuse authenticates leaves without dropping BF", () => {
  assert.equal(run(String.raw`
import sagejs.number_fields.class_unit_groups as engine_module
R = PolynomialRing(QQ, "x")
x = R.gen()
K = NumberField(x**5+x**3-x**2+4*x+1, "a")
conditional = K.class_unit_group(proof=False)
assert conditional.complete and conditional.class_number() == 4
assert conditional.proof_status == "exact-relations-conditional-grh"
assert K.class_unit_group(proof=False) is conditional
group = conditional.class_group()
unit_group = conditional.unit_group()
live = conditional.context._live_artifacts
snapshot = live.terminal_semantic_snapshot
stages = tuple(stage.to_dict() for stage in conditional.stages)
saturation = conditional.saturation_record.to_dict()
limits = engine_module.ClassUnitEngineLimits()

# Rejected BF upgrades must never consume the lease or run a proof suffix.
original_suffix = engine_module.ClassUnitGroupEngine._unconditional_proof_pass
def forbidden_suffix(self, group):
    raise AssertionError("BF upgrade reached the Minkowski suffix")
engine_module.ClassUnitGroupEngine._unconditional_proof_pass = forbidden_suffix
try:
    for attempt in range(2):
        try:
            K.class_unit_group(proof=True)
            raise AssertionError("conditional BF terminal upgraded")
        except NotImplementedError as error:
            assert "unconditional analytic unit completeness" in str(error)
        assert not live.terminal_upgrade_reserved
        assert not live.terminal_upgrade_issued
        assert K.class_unit_group(proof=False) is conditional
finally:
    engine_module.ClassUnitGroupEngine._unconditional_proof_pass = original_suffix
assert conditional.class_group() is group
assert conditional.unit_group() is unit_group
assert tuple(stage.to_dict() for stage in conditional.stages) == stages
assert conditional.saturation_record.to_dict() == saturation
assert live._capture_terminal_semantics() == snapshot
public = K.class_group(proof=False)
assert public.proof_status == "exact-relations-conditional-grh"
assert public.invariants() == (4,) and public.verify()
assert public.verify_proof_payload(public.proof_payload())

# Authenticate mutable leaves directly, not via an upgrade that rejects all BF.
old_generators = unit_group.generators
unit_group.generators = ()
try:
    live._capture_terminal_semantics()
    raise AssertionError("replaced generators remained authenticated")
except ValueError:
    pass
unit_group.generators = old_generators
old_regulator = unit_group.regulator_enclosure
unit_group.regulator_enclosure = None
try:
    live._capture_terminal_semantics()
    raise AssertionError("missing regulator remained authenticated")
except ValueError:
    pass
unit_group.regulator_enclosure = old_regulator
old_status = old_regulator.status
old_regulator.status = "tampered"
assert live._capture_terminal_semantics() != snapshot
old_regulator.status = old_status
old_lower = old_regulator.ball.lower
old_regulator.ball.lower = old_regulator.ball.upper
assert live._capture_terminal_semantics() != snapshot
old_regulator.ball.lower = old_lower
validation_view = conditional.saturation_record.analytic_validation
validation_view["upper_index"] = 999
assert conditional.saturation_record.analytic_validation["upper_index"] == 1
try:
    conditional.saturation_record.analytic_validation = validation_view
    raise AssertionError("saturation authority was replaceable")
except (AttributeError, TypeError):
    pass
try:
    conditional.units()[0]._factors = ()
    raise AssertionError("factored unit contents were mutable")
except (AttributeError, TypeError):
    pass
factor = conditional.conditional_factor_base[0]
old_basis = factor._basis_rows
factor._basis_rows = K.maximal_order().ideal(1)._basis_rows
assert live._capture_terminal_semantics() != snapshot
factor._basis_rows = old_basis
assert live._capture_terminal_semantics() == snapshot
assert K.class_unit_group(proof=False) is conditional

# Checkpoint byte policy still bypasses the ordinary conditional cache.
scoped = K.class_unit_group(proof=False, max_checkpoint_bytes=1)
assert scoped is not conditional
assert scoped.context.limits.max_checkpoint_bytes == 1
assert K.class_unit_group(proof=False) is conditional
print("conditional-terminal-reuse-ok")
`), "conditional-terminal-reuse-ok");
});

test("conditional C4 terminals retain independently replayable torsion evidence", () => {
  assert.equal(run(String.raw`
import json
import sagejs.number_fields.units as units_module
R = PolynomialRing(QQ, "x")
x = R.gen()
K = NumberField(x**5+x**3-x**2+4*x+1, "a")
conditional = K.class_unit_group(proof=False)
assert conditional.complete and conditional.class_number() == 4
torsion = conditional.unit_group().torsion
assert torsion.verify(force_replay=True)
live = conditional.context._live_artifacts
snapshot = live.terminal_semantic_snapshot
original_order = torsion.order
torsion.order = 999
assert live._capture_terminal_semantics() != snapshot
assert not torsion.verify(force_replay=True)
torsion.order = original_order
original_kind = torsion.certificate.kind
torsion.certificate.kind = "embedding-box-exhaustion"
assert live._capture_terminal_semantics() != snapshot
assert not torsion.verify(force_replay=True)
torsion.certificate.kind = original_kind
assert torsion.verify(force_replay=True)

payload = json.loads(json.dumps(torsion.certificate.to_dict()))
detached = units_module.RootsOfUnityCertificate.from_dict(K, payload)
assert detached is not torsion.certificate
assert detached.verify(torsion, force_replay=True)
original = torsion.certificate
torsion.certificate = detached
assert not live._terminal_identity_matches()
torsion.certificate = original
assert live._capture_terminal_semantics() == snapshot
assert live._terminal_identity_matches()
assert K.class_unit_group(proof=False) is conditional
assert conditional.proof_status == "exact-relations-conditional-grh"
assert torsion.verify(force_replay=True)
print("conditional-torsion-replay-ok")
`), "conditional-torsion-replay-ok");
});
