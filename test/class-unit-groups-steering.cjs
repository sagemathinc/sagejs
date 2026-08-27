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

test("empty-factor-base unit steering completes a generic positive-rank engine", () => {
  const output = run(String.raw`
from sagejs.number_fields.class_unit_groups import (
    ClassUnitEngineLimits,
    ClassUnitGroupEngine,
)

R = PolynomialRing(QQ, "x")
x = R.gen()
K = NumberField(x**4 - x - 1, "a")
_order = K.maximal_order()
limits = ClassUnitEngineLimits(
    max_relation_attempts=8,
    exact_presentation_batch_size=1,
)
engine = ClassUnitGroupEngine(K, proof=False, limits=limits)
_plan, factor_base = engine._factor_base(proof=False)
assert factor_base == ()
collector, presentation = engine._relations(
    factor_base, 2, relations_per_ideal=1
)
assert presentation.rank == 0
assert engine._relation_unit_log_rank == 2
assert len(collector.records) == 2
steering = engine._resource_usage["relation_steering"]
assert steering["zero_width_extensions"] == 1
assert steering["norm_unit_candidates"] > 0
assert steering["unit_log_rank_rejects"] > 0
assert steering["candidate_commits"] == 2
for record in collector.records:
    assert record.verify(K.maximal_order(), factor_base)["certified"]
print("fb0-generic-ok")
`);
  assert.equal(output, "fb0-generic-ok");
});

test("quartic unit steering preserves exact class, torsion, and regulator checks", () => {
  const output = run(String.raw`
R = PolynomialRing(QQ, "x")
x = R.gen()
K = NumberField(x**4 - x - 1, "a")
_order = K.maximal_order()
result = K.class_unit_group(proof=False, max_relation_attempts=64)
assert result.complete
assert result.class_group().invariants() == ()
units = result.unit_group()
assert units.unit_rank == 2
assert units.torsion.order == 2
regulator = result.regulator()
assert regulator.rigorous and regulator.full_rank_certified
from sagejs.number_fields.class_unit_analytic import RationalEndpoint
rounded_lower = RationalEndpoint(7563986649191381111, 2 * 10**19)
rounded_upper = RationalEndpoint(7563986649191381113, 2 * 10**19)
assert rounded_lower <= regulator.lower <= regulator.upper <= rounded_upper
resources = result.diagnostics["resources"]
assert resources["relation_attempts"] <= 64
steering = resources["relation_steering"]
assert steering["norm_unit_candidates"] > 0
assert steering["candidate_commits"] == 2
assert steering["valuation_candidates"] == steering["norm_unit_candidates"]
print("quartic-ok")
`);
  assert.equal(output, "quartic-ok");
});

test("C4 control preserves exact class, unit, torsion, and regulator output", () => {
  const output = run(String.raw`
R = PolynomialRing(QQ, "x")
x = R.gen()
K = NumberField(x**5 + x**3 - x**2 + 4*x + 1, "a")
_order = K.maximal_order()
result = K.class_unit_group(proof=False, max_relation_attempts=64)
assert result.complete
assert result.class_group().invariants() == (4,)
units = result.unit_group()
assert units.unit_rank == 2
assert units.torsion.order == 2
regulator = result.regulator()
assert regulator.rigorous and regulator.full_rank_certified
from sagejs.number_fields.class_unit_analytic import RationalEndpoint
rounded_lower = RationalEndpoint(11338080961483051, 2 * 10**15)
rounded_upper = RationalEndpoint(11338080961483053, 2 * 10**15)
assert rounded_lower <= regulator.lower <= regulator.upper <= rounded_upper
resources = result.diagnostics["resources"]
assert resources["relation_attempts"] <= 12
print("c4-control-ok")
`);
  assert.equal(output, "c4-control-ok");
});

test("norm rejects precede relation valuation and cancellation leaves no cursor", () => {
  const output = run(String.raw`
from sagejs.number_fields.class_group_relations import (
    ExactRelationCollector,
    RelationSearchState,
    _RELATION_STEERING_CONTEXT_TOKEN,
    _RelationSteeringContext,
)
from sagejs.number_fields.class_unit_groups import ClassUnitGroupEngine

R = PolynomialRing(QQ, "x")
x = R.gen()
K = NumberField(x**4 - x - 1, "a")
O = K.maximal_order()
engine = ClassUnitGroupEngine(K, proof=False)
collector = ExactRelationCollector(O, ())
state = RelationSearchState(0)
steering = _RelationSteeringContext(
    collector, state, _producer_token=_RELATION_STEERING_CONTEXT_TOKEN
)

class Search:
    def __init__(self):
        self.collector = collector
        self.state = state
    def iter_short_elements(self, ideal):
        return (K(2),)

engine._search_relation_ideal(
    Search(), O.ideal(1), (), {}, 2, steering=steering, unit_rank=2
)
assert collector.records == []
diagnostics = steering.diagnostics()
assert diagnostics["norm_screen_requests"] == 1
assert diagnostics["norm_screen_rejects"] == 1
assert diagnostics["valuation_candidates"] == 0

cancelled = K.class_unit_group(proof=False, cancelled=lambda: True)
assert not cancelled.complete
assert cancelled.reason == "class/unit computation cancelled"
print("screen-cancel-ok")
`);
  assert.equal(output, "screen-cancel-ok");
});

test("steering checkpoint resume is deterministic and rejects tampering", () => {
  const output = run(String.raw`
import copy

R = PolynomialRing(QQ, "x")
x = R.gen()
K = NumberField(x**4 - x - 1, "a")
_order = K.maximal_order()
payloads = []
cancel_after_admission = [False]

def progress(event):
    if not isinstance(event, dict):
        return
    if event.get("event") != "relation-search":
        return
    steering = event["resources"].get("relation_steering", {})
    if steering.get("candidate_commits", 0) > 0:
        cancel_after_admission[0] = True

interrupted = K.class_unit_group(
    proof=False,
    max_relation_attempts=64,
    checkpoint=payloads.append,
    progress=progress,
    cancelled=lambda: cancel_after_admission[0],
)
assert not interrupted.complete
assert interrupted.reason == "class/unit computation cancelled"
assert cancel_after_admission[0]
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
assert resumed.saturation_record.to_dict() == uninterrupted.saturation_record.to_dict()
resumed_resources = resumed.diagnostics["resources"]
uninterrupted_resources = uninterrupted.diagnostics["resources"]
assert resumed_resources["relation_attempts"] == uninterrupted_resources[
    "relation_attempts"
]
assert resumed_resources["relation_candidates"] == uninterrupted_resources[
    "relation_candidates"
]
resumed_relation_stage = tuple(
    stage for stage in resumed.stages if stage.name == "relations"
)[-1]
uninterrupted_relation_stage = tuple(
    stage for stage in uninterrupted.stages if stage.name == "relations"
)[-1]
assert resumed_relation_stage.details["search_state"] == (
    uninterrupted_relation_stage.details["search_state"]
)
resumed_steering = resumed_resources["relation_steering"]
assert resumed_steering["dependency_row_count"] == 2
assert resumed_steering["dependency_transforms_selected"] == 2

tampered = copy.deepcopy(checkpoint)
tampered["content_sha256"] = "0" * 64
try:
    K.class_unit_group(
        proof=False,
        max_relation_attempts=64,
        resume_from=tampered,
        cancelled=lambda: False,
    )
    raise AssertionError("a hash-tampered steering checkpoint was accepted")
except ValueError:
    pass
print("checkpoint-steering-ok")
`);
  assert.equal(output, "checkpoint-steering-ok");
});
