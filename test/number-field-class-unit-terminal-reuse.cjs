"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");
const test = require("node:test");

const root = join(__dirname, "..");
const sagejs =
  process.env.SAGEJS_TEST_EXECUTABLE ||
  join(root, "bin", process.platform === "win32" ? "sagejs.cmd" : "sagejs");

function run(source) {
  const result = spawnSync(sagejs, ["--python", "-"], {
    cwd: root,
    encoding: "utf8",
    input: source,
    timeout: 120_000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

test("reuses a verified public group and only the unconditional proof suffix", () => {
  const output = run(String.raw`
import time

R = PolynomialRing(QQ, "x")
x = R.gen()
K = NumberField(x**6 - x - 1, "a")

conditional = K.class_unit_group(proof=False)
assert conditional.complete
assert conditional.proof_status == "exact-relations-conditional-grh"
conditional_group = conditional.class_group()
conditional_units = conditional.unit_group()
conditional_stages = tuple(stage.name for stage in conditional.stages)

started = time.monotonic()
unconditional = K.class_unit_group(proof=True)
upgrade_seconds = time.monotonic() - started
assert unconditional.complete
assert unconditional.proof_status == "exact-unconditional"
assert unconditional.class_number() == conditional.class_number() == 1
assert unconditional.diagnostics["terminal_upgrade"] == {
    "schema": "sagejs.number-fields/class-unit-terminal-upgrade-v1",
    "reused_factor_base_size": 1,
    "reused_relation_count": 10,
    "reused_presentation": True,
    "reused_units": 3,
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
assert unconditional.class_group().proof_status == "exact-unconditional"
assert unconditional.unit_group().proof_status == "exact-unconditional"
assert unconditional.conditional_factor_base == conditional.conditional_factor_base
assert unconditional.conditional_relation_records == conditional.conditional_relation_records
assert unconditional.conditional_presentation_evidence is conditional.conditional_presentation_evidence
assert unconditional.saturation_record is conditional.saturation_record
for name in ("presentation", "generators", "saturation"):
    assert unconditional.proof_dependency_hashes[name] == conditional.proof_dependency_hashes[name]
# The relations dependency also binds the requested proof policy, so a
# conditional producer and its unconditional proof fork intentionally differ.
assert unconditional.proof_dependency_hashes["relations"] != conditional.proof_dependency_hashes["relations"]
names = tuple(stage.name for stage in unconditional.stages)
assert names[:len(conditional_stages) - 2] == conditional_stages[:-2]
assert names[-3:] == ("unconditional-proof", "proof", "terminal")

started = time.monotonic()
public0 = K.class_group(proof=False)
first_public_seconds = time.monotonic() - started
public0.user_marker = "retained mutation semantics"
started = time.monotonic()
public1 = K.class_group(proof=False)
cached_public_seconds = time.monotonic() - started
assert public1 is public0
assert public1.user_marker == "retained mutation semantics"
assert public1.verify()
assert cached_public_seconds < max(0.05, first_public_seconds / 10)

# Progress and changed resource policies bypass the public cache and cannot
# replace its verified default-policy object.
events = []
interposed = K.class_group(proof=False, progress=lambda event: events.append(event))
assert interposed is not public0
assert len(events) > 0
assert K.class_group(proof=False) is public0
limited0 = K.class_group(proof=False, max_relations=2049)
limited1 = K.class_group(proof=False, max_relations=2049)
assert limited0 is limited1
assert limited0 is not public0
assert K.class_group(proof=False) is public0

# Controller semantics never consult either terminal cache.
try:
    K.class_group(proof=False, cancelled=lambda: True)
    raise AssertionError("cancelled request reused a public terminal")
except ValueError as error:
    assert "incomplete" in str(error)

# A changed private terminal shell cannot authorize the proof-only suffix.
L = NumberField(x**6 - x - 1, "b")
changed = L.class_unit_group(proof=False)
changed.class_group().proof_status = "tampered"
cold_fallback = L.class_unit_group(proof=True)
assert cold_fallback.proof_status == "exact-unconditional"
assert cold_fallback.diagnostics.get("terminal_upgrade") is None
assert changed.proof_status == "exact-relations-conditional-grh"

print("terminal-reuse", upgrade_seconds, first_public_seconds, cached_public_seconds)
`);
  assert.match(output, /^terminal-reuse /);
});
