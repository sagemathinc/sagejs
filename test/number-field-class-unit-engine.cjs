"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");

const root = join(__dirname, "..");
const executable =
  process.env.SAGEJS_TEST_EXECUTABLE || join(root, "bin", "sagejs");
const fixture = JSON.parse(
  readFileSync(
    join(__dirname, "fixtures", "number-field-class-unit-engine.json"),
    "utf8",
  ),
);

function run(source) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-class-unit-engine-"));
  try {
    const moduleSource = readFileSync(
      join(
        root,
        "src",
        "lib",
        "sagejs",
        "number_fields",
        "class_unit_groups.py",
      ),
      "utf8",
    ).replace("from __future__ import annotations\n", "");
    const filename = join(directory, "test.py");
    writeFileSync(filename, `${moduleSource}\n${source}`, "utf8");
    const result = spawnSync(executable, ["--python", filename], {
      cwd: root,
      encoding: "utf8",
      timeout: 120_000,
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return result.stdout.trim();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("specialized exact fields return coupled unconditional results", () => {
  const cases = fixture.cases.slice(0, 2);
  const output = run(String.raw`
R = PolynomialRing(QQ, "x")
x = R.gen()
cases = [
    (x - 1, (), 0),
    (x**3 - x - 1, (), 1),
]
answer = []
for polynomial, invariants, unit_rank in cases:
    K = NumberField(polynomial, "a")
    result = class_unit_context(K)
    assert result.complete
    assert result.proof_status == EXACT_UNCONDITIONAL
    assert result.class_group().invariants() == invariants
    assert result.class_number() == 1
    assert result.unit_group().complete
    assert result.unit_group().unit_rank == unit_rank
    assert class_number(K) == 1
    assert class_group(K).invariants() == invariants
    assert len(units(K)) == unit_rank
    assert class_unit_context(K) is result
    answer.append((result.proof_status, result.class_number(), unit_rank))
print(answer)
`);
  assert.equal(
    output,
    `[(\'${cases[0].proof_status}\', 1, 0), ` +
      `(\'${cases[1].proof_status}\', 1, 1)]`,
  );
});

test("missing general producers and cancellation remain explicitly incomplete", () => {
  const output = run(String.raw`
class MissingComponents:
    context = None
    factored = None
    factor_base = None
    relations = None
    matrix = None
    analytic = None
    def missing(self):
        return ("factor_base", "relations", "matrix", "analytic")

R = PolynomialRing(QQ, "x")
x = R.gen()
K = NumberField(x**5 + x**3 - x**2 + 4*x + 1, "a")
missing = compute_class_unit_group(K, components=MissingComponents())
cancelled = compute_class_unit_group(K, cancelled=lambda: True)
assert not missing.complete
assert missing.proof_status == INCOMPLETE_RESOURCE_LIMIT
assert "not installed" in missing.reason
assert missing.tentative_invariants == ()
try:
    missing.class_group()
    raise AssertionError("an incomplete result exposed a class group")
except ValueError:
    pass
assert not cancelled.complete
assert cancelled.reason == "class/unit computation cancelled"
print((missing.proof_status, cancelled.proof_status))
`);
  assert.equal(
    output,
    "('incomplete-resource-limit', 'incomplete-resource-limit')",
  );
});

test("quintic oracle metadata fixes the deterministic proof target", () => {
  const target = fixture.cases[2];
  assert.deepEqual(target.coefficients, [1, 4, -1, 1, 0, 1]);
  assert.equal(target.discriminant, 380452);
  assert.deepEqual(target.signature, [1, 2]);
  assert.equal(target.minkowski_bound, 38);
  assert.equal(target.legacy_coarse_bound, 43);
  assert.deepEqual(target.class_invariants, [4]);
  assert.equal(target.proof_status, "exact-unconditional");
});

test("SNF-backed C4 ideal maps use exact ambient relation coordinates", () => {
  const output = run(String.raw`
class FakeIdeal:
    def __init__(self, exponent):
        self.exponent = exponent
    def __mul__(self, other):
        return FakeIdeal(self.exponent + other.exponent)
    def __pow__(self, exponent):
        return FakeIdeal(self.exponent * exponent)
    def __eq__(self, other):
        return isinstance(other, FakeIdeal) and self.exponent == other.exponent

class FakeOrder:
    def ideal(self, value):
        return FakeIdeal(0)

class FakePresentation:
    invariants = (4,)
    invariant_positions = (0,)
    smith_right_inverse = ((1,),)
    rank = 1
    diagonal = (4,)
    def smith_coordinates(self, row):
        return tuple(row)
    def class_coordinates(self, row):
        return (row[0] % 4,)
    def lift_class_coordinates(self, coordinates):
        return (coordinates[0] % 4,)
    def relation_combination(self, index):
        assert index == 0
        return (1,)
    def verify(self):
        return True

P = FakeIdeal(1)
C = _EngineClassGroup(
    FakeOrder(),
    (4,),
    (P,),
    ((1,),),
    FakePresentation(),
    (P,),
    (object(),),
    lambda coefficients: tuple(coefficients),
    lambda ideal, factor_base: (ideal.exponent,),
    lambda ideal, factor_base: ((-ideal.exponent,), object()),
    lambda relation_witness, reduction_witness: relation_witness,
    EXACT_UNCONDITIONAL,
    "Minkowski",
)
assert C.invariants() == (4,)
assert C.order() == 4
assert C(P) == C.gen(0)
assert C(P**4).is_one()
assert C.gen(0).ideal() == P
assert C.gen(0).order() == 4
assert C.verify()
print("C4")
`);
  assert.equal(output, "C4");
});

test("resource limits reject invalid or nonintegral policies", () => {
  const output = run(String.raw`
for value in (0, -1, 1.5, True):
    try:
        ClassUnitEngineLimits(max_relations=value)
        raise AssertionError("an invalid resource limit was accepted")
    except (TypeError, ValueError):
        pass
limits = ClassUnitEngineLimits(max_relations=17, max_relation_attempts=9)
assert limits.to_dict()["max_relations"] == 17
assert limits.to_dict()["max_relation_attempts"] == 9
print("ok")
`);
  assert.equal(output, "ok");
});

test("phase timings, progress, and resource diagnostics are observable", () => {
  const output = run(String.raw`
R = PolynomialRing(QQ, "x")
x = R.gen()
K = NumberField(x - 1, "a")
events = []
result = class_unit_context(K, progress=events.append)
assert result.complete
assert result.diagnostics["elapsed_seconds"] >= 0
assert result.diagnostics["phase_timings"]["specialized"] >= 0
assert result.diagnostics["phase_timings"]["total"] >= 0
assert "limits" in result.diagnostics
assert "resources" in result.diagnostics
assert any(event["event"] == "stage" for event in events)
assert all(event["elapsed_seconds"] >= 0 for event in events)
print("observable")
`);
  assert.equal(output, "observable");
});

test("one-large-prime partials combine through exact relation replay", () => {
  const output = run(String.raw`
relations = __import__(
    "sagejs.number_fields.class_group_relations",
    fromlist=["class_group_relations"],
)

class Components:
    context = None
    factored = None
    factor_base = object()
    relations = relations
    matrix = object()
    analytic = object()
    def missing(self):
        return ()

R = PolynomialRing(QQ, "x")
x = R.gen()
K = NumberField(x - 1, "a")
O = K.maximal_order()
P2 = O.factor_rational_prime(2)[0][0]
collector = relations.ExactRelationCollector(O, (P2,))
engine = ClassUnitGroupEngine(K, algorithm="buchmann-hecke", components=Components())
one = O.ideal(1)
first = engine._try_large_prime_partial(
    collector,
    relations.FactoredPrincipalWitness.from_element(K(3)),
    one,
    (0,),
    {"sequence": 0},
    7,
)
second = engine._try_large_prime_partial(
    collector,
    relations.FactoredPrincipalWitness.from_element(K(6)),
    P2,
    (1,),
    {"sequence": 1},
    7,
)
assert first is None
assert second is not None
assert second.record.row == (-1,)
assert second.record.verify(O, (P2,))["certified"]
assert second.record.provenance["algorithm"] == "one-large-prime-match"
assert engine._resource_usage["partial_matches"] == 1
assert len(engine._partials) == 0
print("matched")
`);
  assert.equal(output, "matched");
});

test("checkpoint controllers receive stages, diagnostics, saves, and cancellation", () => {
  const output = run(String.raw`
class Controller:
    def __init__(self):
        self.stages = []
        self.payloads = []
        self.saves = []
        self.cancel = False
    def stage(self, name, state, details=None):
        self.stages.append((name, state, details))
    def capture(self, payload):
        self.payloads.append(payload)
    def save(self, payload=None, force=False):
        self.saves.append(force)
        return "checkpoint"
    def check_cancelled(self, stage="", details=None):
        if self.cancel:
            raise RuntimeError("class/unit computation cancelled")

R = PolynomialRing(QQ, "x")
x = R.gen()
K = NumberField(x - 1, "a")
controller = Controller()
result = compute_class_unit_group(K, checkpoint_controller=controller)
assert result.complete
assert controller.stages[-1][0:2] == ("terminal", "complete")
assert any("diagnostics" in payload for payload in controller.payloads)
assert controller.saves[-1] is True
cancelled = Controller()
cancelled.cancel = True
incomplete = compute_class_unit_group(K, checkpoint_controller=cancelled)
assert not incomplete.complete
assert incomplete.reason == "class/unit computation cancelled"
assert cancelled.saves[-1] is True
print("checkpointed")
`);
  assert.equal(output, "checkpointed");
});

test("public checkpoint entry saves, authenticates, and resumes", () => {
  const output = run(String.raw`
R = PolynomialRing(QQ, "x")
x = R.gen()
K = NumberField(x - 1, "a")
payloads = []
first = compute_class_unit_group(K, checkpoint=payloads.append)
assert first.complete
assert len(payloads) >= 1
checkpoint = payloads[-1]
assert checkpoint["content_sha256"]
resumed = compute_class_unit_group(K, resume_from=checkpoint)
assert resumed.complete
assert resumed.class_number() == first.class_number()
assert resumed.diagnostics["phase_timings"]["total"] >= 0
cancelled_payloads = []
cancelled = compute_class_unit_group(
    K,
    cancelled=lambda: True,
    checkpoint=cancelled_payloads.append,
)
assert not cancelled.complete
assert cancelled.reason == "class/unit computation cancelled"
assert cancelled_payloads[-1]["diagnostics"]["stage"] == "terminal"
print("resumed")
`);
  assert.equal(output, "resumed");
});

test("relation search starts with deterministic targeted prime ideals", () => {
  const output = run(String.raw`
relations = __import__(
    "sagejs.number_fields.class_group_relations",
    fromlist=["class_group_relations"],
)
matrix = __import__(
    "sagejs.number_fields.class_group_matrix",
    fromlist=["class_group_matrix"],
)

class Components:
    context = None
    factored = None
    factor_base = object()
    relations = relations
    matrix = matrix
    analytic = object()
    def missing(self):
        return ()

R = PolynomialRing(QQ, "x")
x = R.gen()
K = NumberField(x - 1, "a")
O = K.maximal_order()
P2 = O.factor_rational_prime(2)[0][0]
events = []
limits = ClassUnitEngineLimits(
    max_relation_attempts=4,
    max_candidates_per_ideal=8,
    max_relations=16,
)
engine = ClassUnitGroupEngine(
    K,
    algorithm="buchmann-hecke",
    components=Components(),
    limits=limits,
    progress=events.append,
)
collector, presentation = engine._relations((P2,), 0)
assert presentation.rank == 1
assert len(presentation.dependency_transforms) >= 2
relation_events = [event for event in events if event["event"] == "relation-search"]
assert relation_events[0]["strategy"] == "single-prime-sweep"
assert relation_events[0]["search_state"]["ideals_tested"] == 1
assert engine._resource_usage["relation_attempts"] <= 4
assert all(record.verify(O, (P2,))["certified"] for record in collector.records)
print("targeted")
`);
  assert.equal(output, "targeted");
});

test("explicit Minkowski mode selects an unconditional discovery base", () => {
  const output = run(String.raw`
class ProbeComponents:
    context = None
    factored = None
    factor_base = object()
    relations = object()
    matrix = object()
    analytic = object()
    def missing(self):
        return ()

class ProbeEngine(ClassUnitGroupEngine):
    def _factor_base(self, *, proof, record_stage=True):
        self.discovery_proof = proof
        raise ValueError("factor-base probe complete")

R = PolynomialRing(QQ, "x")
x = R.gen()
K = NumberField(x**5 + x**3 - x**2 + 4*x + 1, "a")
observed = []
for algorithm, expected in (
    ("auto", False),
    ("buchmann-hecke", False),
    ("minkowski", True),
):
    engine = ProbeEngine(K, algorithm=algorithm, components=ProbeComponents())
    result = engine.run()
    assert not result.complete
    assert result.reason == "factor-base probe complete"
    assert engine.discovery_proof is expected
    observed.append((algorithm, expected))
print(observed)
`);
  assert.equal(
    output,
    "[('auto', False), ('buchmann-hecke', False), ('minkowski', True)]",
  );
});

test("public class_group preserves specialized groups without presentations", () => {
  const output = run(String.raw`
R = PolynomialRing(QQ, "x")
x = R.gen()
K = NumberField(x - 1, "a")
result = class_unit_context(K)
raw = result.class_group()
public = class_group(K)
assert public is raw
assert public.invariants() == ()
assert public.order() == 1
print("specialized")
`);
  assert.equal(output, "specialized");
});
