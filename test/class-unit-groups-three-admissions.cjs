// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");
const test = require("node:test");

const root = join(__dirname, "..");

function run(source, timeout = 120_000) {
  const executable =
    process.platform === "win32"
      ? process.execPath
      : join(root, "bin", "sagejs");
  const arguments_ =
    process.platform === "win32"
      ? [join(root, "bin", "sagejs-source.cjs"), "--python"]
      : ["--python"];
  const result = spawnSync(executable, arguments_, {
    cwd: root,
    encoding: "utf8",
    input: source,
    timeout,
    env: { ...process.env, SAGEJS_USE_SOURCE: "1" },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

test("three-admission policy is signature-based and preserves exact outputs", () => {
  const output = run(String.raw`
from sagejs.number_fields.class_unit_analytic import RationalEndpoint
from sagejs.number_fields.class_unit_groups import (
    _initial_relation_admissions_per_ideal,
)

assert _initial_relation_admissions_per_ideal((3, 0), 4) == 1
assert _initial_relation_admissions_per_ideal((1, 1), 4) == 1
assert _initial_relation_admissions_per_ideal((2, 1), 0) == 2
assert _initial_relation_admissions_per_ideal((0, 2), 4) == 2
assert _initial_relation_admissions_per_ideal((2, 1), 4) == 2
assert _initial_relation_admissions_per_ideal((4, 0), 4) == 2
assert _initial_relation_admissions_per_ideal((1, 2), 4) == 3
assert _initial_relation_admissions_per_ideal((3, 1), 4) == 2
assert _initial_relation_admissions_per_ideal((5, 0), 4) == 2
assert _initial_relation_admissions_per_ideal((2, 2), 4) == 2
assert _initial_relation_admissions_per_ideal((1, 3), 4) == 2

R = PolynomialRing(QQ, "x")
x = R.gen()

quartic = NumberField(x**4 - x - 1, "a")
_quartic_order = quartic.maximal_order()
quartic_result = quartic.class_unit_group(
    proof=False, max_relation_attempts=64
)
assert quartic_result.complete
assert quartic_result.class_group().invariants() == ()
quartic_units = quartic_result.unit_group()
assert quartic_units.unit_rank == 2
assert quartic_units.torsion.order == 2
quartic_regulator = quartic_result.regulator()
assert RationalEndpoint(7563986649191381111, 2 * 10**19) <= (
    quartic_regulator.lower
)
assert quartic_regulator.upper <= RationalEndpoint(
    7563986649191381113, 2 * 10**19
)
quartic_resources = quartic_result.diagnostics["resources"]
assert quartic_resources["initial_relations_per_ideal"] == 2
assert quartic_resources["relation_attempts"] == 1
assert quartic_resources["relation_candidates"] == 7
assert quartic_resources["relations"] == 2

c4 = NumberField(x**5 + x**3 - x**2 + 4*x + 1, "b")
_c4_order = c4.maximal_order()
c4_result = c4.class_unit_group(proof=False, max_relation_attempts=64)
assert c4_result.complete
assert c4_result.class_group().invariants() == (4,)
c4_units = c4_result.unit_group()
assert c4_units.unit_rank == 2
assert c4_units.torsion.order == 2
c4_regulator = c4_result.regulator()
assert RationalEndpoint(11338080961483051, 2 * 10**15) <= c4_regulator.lower
assert c4_regulator.upper <= RationalEndpoint(
    11338080961483053, 2 * 10**15
)
c4_resources = c4_result.diagnostics["resources"]
assert c4_resources["initial_relations_per_ideal"] == 3
assert c4_resources["relation_attempts"] == 4
assert c4_resources["relation_candidates"] == 12
assert c4_resources["relations"] == 13
assert c4_resources["presentation_extractions"] == 2

limited = NumberField(x**5 + x**3 - x**2 + 4*x + 1, "c")
_limited_order = limited.maximal_order()
limited_events = []
limited_result = limited.class_unit_group(
    proof=False,
    max_relation_attempts=64,
    max_relations=2,
    progress=limited_events.append,
)
assert not limited_result.complete
assert limited_result.diagnostics["resources"]["relations"] <= 2
assert all(
    event["resources"].get("relations", 0) <= 2
    for event in limited_events
    if isinstance(event, dict) and "resources" in event
)
print("three-admission-exact-ok")
`);
  assert.equal(output, "three-admission-exact-ok");
});

test("three-admission checkpoints resume transactionally and reject tampering", () => {
  const output = run(String.raw`
import copy

R = PolynomialRing(QQ, "x")
x = R.gen()
K = NumberField(x**5 + x**3 - x**2 + 4*x + 1, "a")
_order = K.maximal_order()
payloads = []
cancelled = [False]

def progress(event):
    if not isinstance(event, dict) or event.get("event") != "relation-search":
        return
    resources = event["resources"]
    if resources.get("relation_attempts", 0) > 0:
        cancelled[0] = True

interrupted = K.class_unit_group(
    proof=False,
    max_relation_attempts=64,
    checkpoint=payloads.append,
    progress=progress,
    cancelled=lambda: cancelled[0],
)
assert not interrupted.complete
assert interrupted.reason == "class/unit computation cancelled"
assert cancelled[0] and payloads
checkpoint = payloads[-1]
assert checkpoint["content_sha256"]

resumed = K.class_unit_group(
    proof=False,
    max_relation_attempts=64,
    resume_from=checkpoint,
    cancelled=lambda: False,
)
assert resumed.complete
K._class_unit_engine_cache = {}
uninterrupted = K.class_unit_group(
    proof=False,
    max_relation_attempts=64,
    cancelled=lambda: False,
)
assert uninterrupted.complete
assert resumed.class_group().invariants() == uninterrupted.class_group().invariants()
assert tuple(unit.to_dict() for unit in resumed.units()) == tuple(
    unit.to_dict() for unit in uninterrupted.units()
)
assert resumed.regulator().to_dict() == uninterrupted.regulator().to_dict()
assert resumed.saturation_record.to_dict() == (
    uninterrupted.saturation_record.to_dict()
)
resumed_resources = resumed.diagnostics["resources"]
uninterrupted_resources = uninterrupted.diagnostics["resources"]
for key in (
    "initial_relations_per_ideal",
    "relation_attempts",
    "relation_candidates",
    "relations",
    "presentation_extractions",
):
    assert resumed_resources[key] == uninterrupted_resources[key]
resumed_stage = tuple(
    stage for stage in resumed.stages if stage.name == "relations"
)[-1]
uninterrupted_stage = tuple(
    stage for stage in uninterrupted.stages if stage.name == "relations"
)[-1]
assert resumed_stage.details["search_state"] == (
    uninterrupted_stage.details["search_state"]
)

tampered = copy.deepcopy(checkpoint)
tampered["content_sha256"] = "0" * 64
try:
    K.class_unit_group(
        proof=False,
        max_relation_attempts=64,
        resume_from=tampered,
        cancelled=lambda: False,
    )
    raise AssertionError("a hash-tampered p3 checkpoint was accepted")
except ValueError:
    pass
print("three-admission-checkpoint-ok")
`);
  assert.equal(output, "three-admission-checkpoint-ok");
});
