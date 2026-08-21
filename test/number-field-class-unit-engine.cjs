"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
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
    const [executable, arguments_] = sagejsInvocation(["--python", filename]);
    const result = spawnSync(executable, arguments_, {
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

class FakeSparseRow:
    def dense(self):
        return (4,)

class FakeRelation:
    def __init__(self, row=(4,), certified=True):
        self.row = row
        self.certified = certified
    def verify(
        self, order, factor_base, *, reconstructor=None, admission_verifier=None
    ):
        del admission_verifier
        reconstruction_calls.append(reconstructor)
        return {"certified": self.certified}

class FakePresentation:
    invariants = (4,)
    invariant_positions = (0,)
    smith_right_inverse = ((1,),)
    rank = 1
    diagonal = (4,)
    relation_rows = (FakeSparseRow(),)
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
reconstruction_cache = object()
reconstruction_calls = []
C = _EngineClassGroup(
    FakeOrder(),
    (4,),
    (P,),
    ((1,),),
    FakePresentation(),
    (P,),
    (FakeRelation(),),
    lambda coefficients: tuple(coefficients),
    lambda ideal, factor_base: (ideal.exponent,),
    lambda ideal, factor_base: ((-ideal.exponent,), object()),
    lambda relation_witness, reduction_witness: relation_witness,
    EXACT_UNCONDITIONAL,
    "Minkowski",
    reconstruction_cache,
)
assert C.invariants() == (4,)
assert C.order() == 4
assert C(P) == C.gen(0)
assert C(P**4).is_one()
assert C.gen(0).ideal() == P
assert C.gen(0).order() == 4
assert C.verify()
assert reconstruction_calls == [reconstruction_cache]
result = ClassUnitComputation(
    object(),
    proof_status=EXACT_UNCONDITIONAL,
    complete=True,
    reason="test",
    algorithm="test",
    stages=(),
    class_group=C,
    unit_group=object(),
)
assert result.conditional_relation_records == C._relations
assert result.conditional_presentation_evidence is C._presentation
assert result.conditional_factor_base == C._factor_base
C._relations = (FakeRelation((5,)),)
assert not C.verify()
C._relations = (FakeRelation(certified=False),)
assert not C.verify()
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

test("saturation diagnostics never duplicate the authenticated proof payload", () => {
  const output = run(String.raw`
class FakeCertificate:
    def workspace_diagnostics(self):
        return {
            "provider_calls": 7,
            "regulator_cache_hits": 3,
            "finite_term_cache_hits": 4,
            "certificate_construction_calls": 1,
            "certificate_replay_calls": 2,
            "unbounded_provenance": "x" * 1000000,
        }

class HugeProofRecord:
    complete = True
    rigorous = True
    index_bound = 2
    remaining_index_bound = 1
    content_sha256 = "a" * 64
    _analytic_certificate = FakeCertificate()
    def to_dict(self):
        raise AssertionError("diagnostics serialized the full proof payload")

summary = _saturation_diagnostic_summary(HugeProofRecord())
encoded = json.dumps(summary, sort_keys=True)
assert len(encoded.encode("utf-8")) < 1024
assert summary["schema"] == (
    "sagejs.number-fields/class-unit-saturation-summary-v1"
)
assert summary["status"] == "complete"
assert summary["index_bound"] == 2
assert summary["remaining_index_bound"] == 1
assert summary["content_sha256"] == "a" * 64
assert "unbounded_provenance" not in summary["certificate_workspace"]
print("compact-saturation-diagnostics")
`);
  assert.equal(output, "compact-saturation-diagnostics");
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

test("live exact principal-ideal replay caches remain bounded and mutation-safe", () => {
  const output = run(String.raw`
relations = __import__(
    "sagejs.number_fields.class_group_relations",
    fromlist=["class_group_relations"],
)
factored = __import__(
    "sagejs.number_fields.factored_elements",
    fromlist=["factored_elements"],
)
R = PolynomialRing(QQ, "x")
x = R.gen()
K = NumberField(x - 1, "a")
O = K.maximal_order()
P2 = O.factor_rational_prime(2)[0][0]

unit = factored.FactoredNumberFieldElement.from_element(K, K(2))
first = unit.principal_ideal(O)
second = unit.principal_ideal(O)
assert first == second and first is second
assert len(unit._principal_ideal_cache) == 1

collector = relations.ExactRelationCollector(O, (P2,))
admission = collector.admit_witness(
    relations.FactoredPrincipalWitness.from_element(K(2))
)
record = admission.record
detached = relations.RelationRecord.from_dict(record.to_dict())
calls = [0]
original = relations.FactoredPrincipalWitness.principal_ideal
def counting(self, order=None):
    calls[0] += 1
    return original(self, order)
relations.FactoredPrincipalWitness.principal_ideal = counting
assert detached.verify(O, (P2,))["certified"]
assert calls[0] == 1
assert len(record._principal_ideal_cache) == 1
assert len(detached._principal_ideal_cache) == 1

assert record.verify(O, (P2,))["certified"]
assert calls[0] == 1
record.witness["factors"][0]["exponent"] = 2
assert not record.verify(O, (P2,))["certified"]
assert calls[0] == 2
relations.FactoredPrincipalWitness.principal_ideal = original
assert len(record._principal_ideal_cache) == 2
print("bounded-principal-cache")
`);
  assert.equal(output, "bounded-principal-cache");
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
collector, presentation = engine._relations((P2,), 0, minimum_dependencies=2)
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

test("relation search continues past dependency count until unit log rank is full", () => {
  const output = run(String.raw`
class FakeRecord:
    row = (1,)

class FakeCollector:
    def __init__(self, order, factor_base):
        self.order = order
        self.factor_base = tuple(factor_base)
        self.records = []

class FakeState:
    def __init__(self):
        self.ideals_tested = 0
        self.candidates_tested = 0
        self.relations_admitted = 0
    def to_dict(self):
        return {
            "ideals_tested": self.ideals_tested,
            "candidates_tested": self.candidates_tested,
            "relations_admitted": self.relations_admitted,
        }

class FakeSearch:
    def __init__(self, collector, **options):
        self.collector = collector
        self.state = options.get("state") or FakeState()
        self.max_candidates_per_ideal = options["max_candidates_per_ideal"]
        self.random_terms = options["random_terms"]
        self.coefficient_bound = options["coefficient_bound"]

class FakeRelations:
    ExactRelationCollector = FakeCollector
    LLLRelationSearch = FakeSearch
    class RelationSearchState:
        @classmethod
        def from_dict(cls, payload):
            raise AssertionError("no restored state expected")
    @staticmethod
    def initial_rational_prime_relations(collector):
        for _index in range(5):
            collector.records.append(FakeRecord())

class FakePresentation:
    def __init__(self, relation_count):
        self.rank = 1
        self.order = 1
        self.invariants = ()
        self.dependency_transforms = tuple(range(relation_count - 1))

class FakeMatrix:
    @staticmethod
    def extract_relation_presentation(rows, columns, require_full_rank=False):
        assert columns == 1
        return FakePresentation(len(rows))

class FakePrimeNorm:
    _numerator = 2

class FakePrime:
    def norm(self):
        return FakePrimeNorm()

class Components:
    context = None
    factored = None
    factor_base = object()
    relations = FakeRelations
    matrix = FakeMatrix
    analytic = object()
    def missing(self):
        return ()

class AdaptiveProbe(ClassUnitGroupEngine):
    def _unit_logarithmic_rank(self, records, presentation, unit_rank):
        return 1 if len(records) == 5 else 2
    def _relation_ideal(self, search, factor_base, attempt, coefficient_bound):
        return object(), (1,), "adaptive-probe"
    def _search_relation_ideal(
        self,
        search,
        ideal,
        source_row,
        provenance,
        large_prime_bound,
        stop_after=2,
    ):
        search.state.ideals_tested += 1
        search.state.candidates_tested += 1
        search.state.relations_admitted += 1
        search.collector.records.append(FakeRecord())
        return 1

R = PolynomialRing(QQ, "x")
x = R.gen()
K = NumberField(x - 1, "a")
engine = AdaptiveProbe(
    K,
    algorithm="buchmann-hecke",
    components=Components(),
    limits=ClassUnitEngineLimits(max_relation_attempts=3, max_relations=12),
)
collector, presentation = engine._relations((FakePrime(),), 2)
assert len(presentation.dependency_transforms) == 5
assert engine._resource_usage["relation_attempts"] == 1
assert engine._relation_unit_log_rank == 2
stage = engine.stages[-1]
assert stage.name == "relations" and stage.state == "complete"
assert stage.details["unit_log_rank"] == 2
assert stage.details["unit_rank_target"] == 2
assert stage.details["dependency_target"] == 2
assert _floating_matrix_rank(((1.0, 2.0), (2.0, 4.0))) == 1
assert _floating_matrix_rank(((1.0, 2.0), (2.0, 5.0))) == 2
print("adaptive-unit-rank")
`);
  assert.equal(output, "adaptive-unit-rank");
});

test("exact presentations are deferred across safe relation batches", () => {
  const output = run(String.raw`
class FakeRecord:
    row = (1,)

class FakeCollector:
    def __init__(self, order, factor_base):
        self.records = []
        self.factor_base = tuple(factor_base)

class FakeState:
    def __init__(self):
        self.ideals_tested = 0
        self.candidates_tested = 0
        self.relations_admitted = 0
    def to_dict(self):
        return {
            "ideals_tested": self.ideals_tested,
            "candidates_tested": self.candidates_tested,
            "relations_admitted": self.relations_admitted,
        }

class FakeSearch:
    def __init__(self, collector, **options):
        self.collector = collector
        self.state = options.get("state") or FakeState()
        self.max_candidates_per_ideal = options["max_candidates_per_ideal"]
        self.random_terms = options["random_terms"]
        self.coefficient_bound = options["coefficient_bound"]

class FakeRelations:
    ExactRelationCollector = FakeCollector
    LLLRelationSearch = FakeSearch
    class RelationSearchState:
        @classmethod
        def from_dict(cls, payload):
            raise AssertionError("no restored state expected")
    @staticmethod
    def initial_rational_prime_relations(collector):
        collector.records.append(FakeRecord())

class FakePresentation:
    def __init__(self, count):
        self.rank = 1
        self.order = 1
        self.invariants = ()
        self.dependency_transforms = tuple(range(max(0, count - 1)))

class FakeMatrix:
    calls = 0
    @classmethod
    def extract_relation_presentation(cls, rows, columns, require_full_rank=False):
        cls.calls += 1
        return FakePresentation(len(rows))

class FakeNorm:
    _numerator = 2

class FakePrime:
    def norm(self):
        return FakeNorm()

class Components:
    context = None
    factored = None
    factor_base = object()
    relations = FakeRelations
    matrix = FakeMatrix
    analytic = object()
    def missing(self):
        return ()

class BatchProbe(ClassUnitGroupEngine):
    def _unit_logarithmic_rank(self, records, presentation, unit_rank):
        return 0
    def _relation_ideal(self, search, factor_base, attempt, coefficient_bound):
        return object(), (1,), "batch-probe"
    def _search_relation_ideal(self, search, *args, **kwargs):
        search.state.ideals_tested += 1
        search.state.candidates_tested += 1
        search.state.relations_admitted += 1
        search.collector.records.append(FakeRecord())
        return 1

R = PolynomialRing(QQ, "x")
x = R.gen()
K = NumberField(x - 1, "a")
engine = BatchProbe(
    K,
    algorithm="buchmann-hecke",
    components=Components(),
    limits=ClassUnitEngineLimits(
        max_relation_attempts=8,
        max_relations=16,
        exact_presentation_batch_size=3,
    ),
)
collector, presentation = engine._relations(
    (FakePrime(),), 0, minimum_dependencies=5
)
assert len(collector.records) == 7
assert len(presentation.dependency_transforms) == 6
assert FakeMatrix.calls == 3
assert engine._resource_usage["presentation_extractions"] == 3
print("batched")
`);
  assert.equal(output, "batched");
});

test("live generation authority memo detaches after computation", () => {
  const output = run(String.raw`
counts = {
    "factor_base": 0,
    "presentation": 0,
    "relations": 0,
    "detached_relations": 0,
}

class FakePrime:
    def to_dict(self):
        return {"schema": "fake-prime-v1", "prime": 2}

prime = FakePrime()

class FakeFactorBaseRecord:
    prime_ideal = prime

class FakeFactorBase:
    @staticmethod
    def build_factor_base(plan):
        counts["factor_base"] += 1
        return (FakeFactorBaseRecord(),)

class FakeRelation:
    row = (1,)
    def to_dict(self):
        return {"schema": "fake-relation-v1", "row": [1]}
    def verify(
        self, order, factor_base, *, reconstructor=None, admission_verifier=None
    ):
        del admission_verifier
        if reconstructor is None:
            counts["detached_relations"] += 1
        else:
            reconstruct = (
                reconstructor
                if callable(reconstructor)
                else reconstructor.reconstruct_factor_base_ideal
            )
            for reconstruction_row in ((1,), (1,), (1,)):
                reconstruct(reconstruction_row)
        counts["relations"] += 1
        return {"certified": tuple(factor_base) == (prime,)}

class FakeCollector:
    def __init__(self):
        self.records = (FakeRelation(),)
        self._rows = {}
        self._row_requests = 0
        self._row_hits = 0
    def reconstruct_factor_base_ideal(self, row):
        self._row_requests += 1
        key = tuple(row)
        if key in self._rows:
            self._row_hits += 1
            return self._rows[key]
        answer = ("ideal", key)
        self._rows[key] = answer
        return answer
    def reconstruction_diagnostics(self):
        return {
            "row_requests": self._row_requests,
            "row_hits": self._row_hits,
        }

class FakePresentation:
    order = 1
    def to_dict(self):
        return {"schema": "fake-presentation-v1", "order": 1}
    def verify(self):
        counts["presentation"] += 1
        return True

class FakePlan:
    theorem = "BDF factor-base theorem"
    assumptions = ("GRH",)
    bound = 17

class Components:
    context = None
    factored = object()
    factor_base = FakeFactorBase
    relations = object()
    matrix = object()
    analytic = object()
    def missing(self):
        return ()

R = PolynomialRing(QQ, "x")
x = R.gen()
K = NumberField(x - 1, "a")
engine = ClassUnitGroupEngine(
    K, algorithm="buchmann-hecke", components=Components()
)
collector = FakeCollector()
evidence, verifier = engine._generation_authority(
    FakePlan(), (prime,), collector, FakePresentation(),
    EXACT_RELATIONS_CONDITIONAL_GRH,
)
assert counts == {
    "factor_base": 1,
    "presentation": 1,
    "relations": 1,
    "detached_relations": 0,
}
assert engine._resource_usage["generation_reconstruction_calls"] == 3
assert engine._resource_usage["generation_reconstruction_cache_hits"] == 2
for _index in range(2):
    assert verifier(
        K, K.maximal_order(), (), 1, evidence,
        EXACT_RELATIONS_CONDITIONAL_GRH,
    )
assert counts == {
    "factor_base": 1,
    "presentation": 1,
    "relations": 1,
    "detached_relations": 0,
}
assert engine._resource_usage["generation_reconstruction_calls"] == 3
assert engine._resource_usage["generation_reconstruction_cache_hits"] == 2
assert engine._resource_usage["generation_verification_cache_hits"] == 2
engine._generation_verification_cache_active = False
assert verifier(
    K, K.maximal_order(), (), 1, evidence,
    EXACT_RELATIONS_CONDITIONAL_GRH,
)
assert counts == {
    "factor_base": 2,
    "presentation": 2,
    "relations": 2,
    "detached_relations": 0,
}
assert engine._resource_usage["generation_reconstruction_calls"] == 6
assert engine._resource_usage["generation_reconstruction_cache_hits"] == 5
assert engine._resource_usage["generation_verification_full_replays"] == 2
# The detached proof path does not inherit the live collector callback.
assert FakeRelation().verify(K.maximal_order(), (prime,))["certified"]
assert counts["detached_relations"] == 1
assert engine._resource_usage["generation_reconstruction_calls"] == 6
print("generation-memo")
`);
  assert.equal(output, "generation-memo");
});

test("forced nontrivial hR index uses replayed p-saturation evidence", () => {
  const output = run(String.raw`
class FakeUnit:
    def __init__(self, name, logarithm):
        self.name = name
        self.logarithm = logarithm
    def principal_ideal(self, order):
        return order.ideal(1)
    def archimedean_logarithms(self, prec):
        return (self.logarithm, -self.logarithm)
    def to_dict(self):
        return {"schema": "fake-unit-v1", "name": self.name}
    def __eq__(self, other):
        return isinstance(other, FakeUnit) and self.name == other.name

class FakeIndex:
    def __init__(self, bound):
        self.lower_index = bound
        self.upper_index = bound
        self.index_one = bound == 1
        self.rigorous = True

class FakeCertificate(FakeIndex):
    def __init__(self, bound):
        FakeIndex.__init__(self, bound)
        self.index_bound = bound
    def to_dict(self):
        return {"schema": "fake-index-certificate-v1", "index_bound": self.upper_index}
    def verify(self, field, order, units, generation_verifier=None):
        return callable(generation_verifier)

class FakeRegulator:
    precision_bits = 128
    rigorous = True

class FakeTorsion:
    order = 2

class SaturationResult:
    rigorous = True
    complete = True
    saturated = True
    remaining_index_bound = 1
    reason = "exact p-th-root identity enlarged the unit lattice"
    def __init__(self, units):
        self.units = units
    def verify(self, field, order, original_units):
        return tuple(original_units) == (FakeUnit("old", 2.0),)
    def to_dict(self):
        return {
            "schema": "fake-saturation-v1",
            "rigorous": True,
            "complete": True,
            "remaining_index_bound": 1,
        }

class FakeAnalytic:
    @staticmethod
    def certify_unit_saturation_index(field, order, units, **options):
        assert options["class_number"] == 1
        assert options["generation_verifier"](
            field, order, units, 1, options["generation_evidence"],
            options["proof_status"],
        )
        return FakeCertificate(1 if units[0].name == "new" else 2)
    @staticmethod
    def saturate_unit_lattice(field, order, units, index_bound, **options):
        assert index_bound.upper_index == 2
        assert "index_bound_is_rigorous" not in options
        assert options["precision_bits"] == 128
        return SaturationResult((FakeUnit("new", 1.0),))
    @staticmethod
    def verify_saturation_record(
        field, order, units, payload, *, generation_verifier=None, workspace=None
    ):
        assert generation_verifier is not None
        assert workspace is None
        assert payload["schema"] == "fake-saturation-v1"
        return True

class Components:
    context = None
    factored = None
    factor_base = object()
    relations = object()
    matrix = object()
    analytic = FakeAnalytic
    def missing(self):
        return ()

class FakePresentation:
    dependency_transforms = ()
    invariants = ()

class FakeCollector:
    records = []

class SaturationProbe(ClassUnitGroupEngine):
    def _analytic_index(self, presentation, units, unit_rank):
        bound = 1 if units[0].name == "new" else 2
        return FakeTorsion(), FakeRegulator(), FakeIndex(bound)

R = PolynomialRing(QQ, "x")
x = R.gen()
K = NumberField(x - 1, "a")
engine = SaturationProbe(
    K, algorithm="buchmann-hecke", components=Components()
)
old = (FakeUnit("old", 2.0),)
values = engine._adaptive_saturation(
    (), FakeCollector(), FakePresentation(), old,
    FakeTorsion(), FakeRegulator(), FakeIndex(2), 1,
)
units, index, record = values[2], values[5], values[6]
assert units == (FakeUnit("new", 1.0),)
assert index.index_one
assert record.complete and record.saturated and record.rigorous
assert record.index_bound == 2 and record.required_primes == (2,)
assert record._analytic_certificate.index_bound == record.remaining_index_bound
assert record.verify(K, K.maximal_order(), old)
forged = ClassUnitSaturationRecord(
    K,
    K.maximal_order(),
    units,
    units,
    index_bound=1,
    required_primes=(),
    remaining_index_bound=1,
    attempts=(),
    analytic_validation={
        "lower_index": 1,
        "upper_index": 1,
        "index_one": True,
        "rigorous": True,
    },
)
assert not forged.complete and not forged.verify()
record.analytic_validation["lower_index"] = 2
assert not record.verify()
assert engine._resource_usage["saturation_rounds"] == 1
assert engine.stages[-1].name == "saturation"
assert engine.stages[-1].state == "complete"
print("p-saturated")
`);
  assert.equal(output, "p-saturated");
});

test("engine replays real analytic saturation from a nontrivial hR index", () => {
  const output = run(String.raw`
R = PolynomialRing(QQ, "x")
x = R.gen()
K = NumberField(x**2 - 5, "a")
a = K.gen()
epsilon = (a + 1) / 2
engine = ClassUnitGroupEngine(
    K,
    algorithm="buchmann-hecke",
    limits=ClassUnitEngineLimits(
        precision_bits=96,
        max_precision_bits=256,
        max_analytic_prime_bound=20000,
    ),
)
Factored = engine.components.factored.FactoredNumberFieldElement
initial_units = (Factored.from_element(K, epsilon**2),)
torsion = _optional_module("sagejs.number_fields.units").roots_of_unity(K)
class Presentation:
    order = 1

_torsion, _regulator, initial_index = engine._analytic_index(
    Presentation(), initial_units, 1
)
assert initial_index.rigorous
assert initial_index.lower_index == 2 and initial_index.upper_index == 2
generation_evidence = {
    "schema": "test.engine-generation-authority.v1",
    "class_number": 1,
}
def verify_generation(field, order, units, class_number, evidence, status):
    return (
        field is K
        and order is engine.order
        and int(class_number) == 1
        and evidence == generation_evidence
        and status == EXACT_RELATIONS_CONDITIONAL_GRH
    )

before_saturation = engine._analytic_workspace.diagnostics()
updated, artifact, attempt = engine._try_unit_saturation(
    initial_units,
    torsion,
    initial_index,
    1,
    1,
    generation_evidence,
    verify_generation,
    EXACT_RELATIONS_CONDITIONAL_GRH,
)
assert attempt["accepted"] and artifact is not None
assert artifact.complete and artifact.remaining_index_bound == 1
after_saturation = engine._analytic_workspace.diagnostics()
assert after_saturation["provider_calls"] == before_saturation["provider_calls"]
assert after_saturation["regulator_cache_hits"] > (
    before_saturation["regulator_cache_hits"]
)
assert after_saturation["finite_term_cache_hits"] > (
    before_saturation["finite_term_cache_hits"]
)
assert after_saturation["certificate_construction_calls"] == (
    before_saturation["certificate_construction_calls"] + 1
)
assert after_saturation["certificate_replay_calls"] >= (
    before_saturation["certificate_replay_calls"] + 2
)
detached = engine.components.analytic.UnitSaturationIndexCertificate.from_dict(
    artifact.global_index_certificate
)
assert detached.workspace_diagnostics() is None
assert engine._diagnostics()["analytic_workspace"] == after_saturation
assert len(updated) == 1 and updated[0].evaluate()**2 == epsilon**2
print("real-saturation-replay")
`);
  assert.equal(output, "real-saturation-replay");
});

test("missing saturation producer exhausts bounded retries honestly", () => {
  const output = run(String.raw`
class FakeUnit:
    def principal_ideal(self, order):
        return order.ideal(1)
    def archimedean_logarithms(self, prec):
        return (1.0, -1.0)
    def to_dict(self):
        return {"schema": "fake-unit-v1"}

class FakeIndex:
    lower_index = 2
    upper_index = 2
    index_one = False
    rigorous = True

class FakeRegulator:
    precision_bits = 128
    rigorous = True

class FakePresentation:
    dependency_transforms = ()
    invariants = ()

class FakeCollector:
    records = []

class Components:
    context = None
    factored = None
    factor_base = object()
    relations = object()
    matrix = object()
    analytic = object()
    def missing(self):
        return ()

class BoundedProbe(ClassUnitGroupEngine):
    def _relations(self, factor_base, unit_rank, **options):
        return options["collector"], options["presentation"]

R = PolynomialRing(QQ, "x")
x = R.gen()
K = NumberField(x - 1, "a")
engine = BoundedProbe(
    K,
    algorithm="buchmann-hecke",
    components=Components(),
    limits=ClassUnitEngineLimits(max_saturation_rounds=1),
)
values = engine._adaptive_saturation(
    (), FakeCollector(), FakePresentation(), (FakeUnit(),), object(),
    FakeRegulator(), FakeIndex(), 1,
)
record = values[6]
assert not record.complete and not record.verify()
assert record.remaining_index_bound == 2
assert record.attempts[0]["producer"] == "unavailable"
assert "no exact unit p-saturation producer" in record.attempts[0]["reason"]
assert engine.stages[-1].state == "bounded"
print("honest-incomplete")
`);
  assert.equal(output, "honest-incomplete");
});

test("a forced class index triggers targeted exact p-relation saturation", () => {
  const output = run(String.raw`
class FakeIndex:
    def __init__(self, bound):
        self.lower_index = bound
        self.upper_index = bound
        self.index_one = bound == 1
        self.rigorous = True

class FakeRegulator:
    precision_bits = 128
    rigorous = True

class FakeTorsion:
    order = 2

class FakePresentation:
    invariants = ()
    dependency_transforms = ()
    def __init__(self, order):
        self.order = order

class FakeCollector:
    def __init__(self):
        self.records = []

class FakeCertificate:
    def __init__(self, index_bound):
        self.index_bound = index_bound
    def to_dict(self):
        return {
            "schema": "fake-final-index-certificate-v1",
            "index_bound": self.index_bound,
        }
    def verify(self, field, order, units, generation_verifier=None):
        return callable(generation_verifier)

class FakeAnalytic:
    @staticmethod
    def certify_unit_saturation_index(field, order, units, **options):
        return FakeCertificate(options["class_number"])

class Components:
    context = None
    factored = None
    factor_base = object()
    relations = object()
    matrix = object()
    analytic = FakeAnalytic
    def missing(self):
        return ()

class ClassSaturationProbe(ClassUnitGroupEngine):
    def _relations(self, factor_base, unit_rank, **options):
        assert options["saturation_prime"] == 2
        collector = options["collector"]
        collector.records.append(object())
        return collector, FakePresentation(1)
    def _analytic_index(self, presentation, units, unit_rank):
        return FakeTorsion(), FakeRegulator(), FakeIndex(presentation.order)

R = PolynomialRing(QQ, "x")
x = R.gen()
K = NumberField(x - 1, "a")
engine = ClassSaturationProbe(
    K,
    algorithm="buchmann-hecke",
    components=Components(),
    limits=ClassUnitEngineLimits(max_saturation_rounds=1),
)
collector = FakeCollector()
values = engine._adaptive_saturation(
    (), collector, FakePresentation(2), (), FakeTorsion(),
    FakeRegulator(), FakeIndex(2), 0,
)
presentation, index, record = values[1], values[5], values[6]
assert presentation.order == 1 and index.index_one
assert record.complete and record.remaining_index_bound == 1
class_attempt = [
    attempt for attempt in record.attempts
    if attempt["schema"] == "sagejs.number-fields/class-saturation-attempt-v1"
][0]
assert class_attempt["prime"] == 2
assert class_attempt["relations_admitted"] == 1
assert class_attempt["class_lattice_enlarged"]
assert class_attempt["accepted"]
print("class-p-saturated")
`);
  assert.equal(output, "class-p-saturated");
});

test("Minkowski partitions resume after a durably checkpointed cancellation", () => {
  const output = run(String.raw`
from sagejs.number_fields.class_unit_context import (
    MinkowskiProofProgress,
    MinkowskiProofProgressRecord,
)

class FakeNorm:
    _denominator = 1
    def __init__(self, value):
        self._numerator = value

class FakeIdeal:
    def __init__(self, index):
        self.index = index
    def norm(self):
        return FakeNorm(self.index + 2)
    def to_dict(self):
        return {
            "schema": "fake-prime-v1",
            "field_order_fingerprint": {"field": "proof-resume"},
            "basis": [[[self.index + 2, 1]]],
            "index": self.index,
        }
    def __truediv__(self, representative):
        return ("quotient", self.index, representative.index)

class FakeWitness:
    def __init__(self, index):
        self.index = index
    def principal_ideal(self, order):
        return ("quotient", self.index, self.index)
    def to_dict(self):
        return {"schema": "fake-witness-v1", "index": self.index}

class FakeFactored:
    @classmethod
    def from_dict(cls, field, payload):
        assert payload["schema"] == "fake-witness-v1"
        return FakeWitness(int(payload["index"]))

class FakeFactoredModule:
    FactoredNumberFieldElement = FakeFactored

class FakeContext:
    MinkowskiProofProgress = MinkowskiProofProgress
    MinkowskiProofProgressRecord = MinkowskiProofProgressRecord

class Components:
    context = FakeContext
    factored = FakeFactoredModule
    factor_base = object()
    relations = object()
    matrix = object()
    analytic = object()
    def missing(self):
        return ()

class FakePlan:
    assumptions = ()
    theorem = "Minkowski"
    bound = 17

class FakeGroup:
    def __init__(self, calls):
        self.calls = calls
    def discrete_log(self, ideal):
        self.calls.append(ideal.index)
        return (ideal.index,), FakeWitness(ideal.index)
    def representative_ideal(self, coordinates):
        return FakeIdeal(int(coordinates[0]))

class Controller:
    def __init__(self):
        self.stored = None
        self.cancel_after_next_prime = True
    def restore_minkowski_proof_progress(self, **options):
        if self.stored is None:
            return None
        progress = MinkowskiProofProgress.from_dict(
            self.stored,
            record_decoder=options.get("record_decoder"),
            record_verifier=options.get("record_verifier"),
        )
        assert progress.matches_plan(
            options["bound"],
            options["prime_fingerprints"],
            partition_count=options["partition_count"],
            theorem=options["theorem"],
            dependency_hashes=options["dependency_hashes"],
        )
        return progress
    def begin_minkowski_proof(self, bound, fingerprints, **options):
        progress = MinkowskiProofProgress.create(bound, fingerprints, **options)
        self.stored = progress.to_dict()
        return progress
    def checkpoint_minkowski_proof_prime(self, progress, index, record, **options):
        updated = progress.record(index, record)
        self.stored = updated.to_dict()
        if self.cancel_after_next_prime:
            self.cancel_after_next_prime = False
            raise RuntimeError("class/unit computation cancelled")
        return updated
    def check_cancelled(self, stage="", details=None):
        return None
    def capture(self, payload):
        return None
    def save(self, force=False):
        return "fake-checkpoint"
    def stage(self, name, state, details=None):
        return None

class ProofProbe(ClassUnitGroupEngine):
    def _factor_base(self, *, proof, record_stage=True):
        assert proof and not record_stage
        return FakePlan(), tuple(FakeIdeal(index) for index in range(4))

R = PolynomialRing(QQ, "x")
x = R.gen()
K = NumberField(x - 1, "a")
controller = Controller()
calls = []
limits = ClassUnitEngineLimits(proof_partition_count=2)
dependencies = {
    "relations": "1" * 64,
    "presentation": "2" * 64,
    "generators": "3" * 64,
    "saturation": "4" * 64,
}
first = ProofProbe(
    K,
    algorithm="buchmann-hecke",
    components=Components(),
    limits=limits,
    checkpoint_controller=controller,
)
first._proof_dependency_hashes = dependencies
try:
    first._unconditional_proof_pass(FakeGroup(calls))
    raise AssertionError("the first proof pass did not cancel")
except RuntimeError as error:
    assert str(error) == "class/unit computation cancelled"
assert sum(len(part["records"]) for part in controller.stored["partitions"]) == 1

second = ProofProbe(
    K,
    algorithm="buchmann-hecke",
    components=Components(),
    limits=limits,
    checkpoint_controller=controller,
)
second._proof_dependency_hashes = dependencies
records = second._unconditional_proof_pass(FakeGroup(calls))
assert [record["index"] for record in records] == [0, 1, 2, 3]
assert calls == [0, 2, 1, 3]
assert second._proof_progress.complete
assert second._proof_progress.bound == (17, 1)
assert second._proof_progress.theorem == "Minkowski ideal-class theorem"
assert second._proof_progress.dependency_hashes == dependencies
print("proof-resumed")
`);
  assert.equal(output, "proof-resumed");
});

test("checkpoint identity rejects changed engine limits and proof policy", () => {
  const output = run(String.raw`
R = PolynomialRing(QQ, "x")
x = R.gen()
K = NumberField(x - 1, "a")
payloads = []
limits = ClassUnitEngineLimits(max_relations=31, proof_partition_count=2)
engine = ClassUnitGroupEngine(
    K,
    proof=False,
    algorithm="buchmann-hecke",
    limits=limits,
    checkpoint=lambda payload: payloads.append(payload),
)
engine._checkpoint_save(force=True)
payload = payloads[-1]
assert payload["limits"]["values"]["max_relations"] == 31
assert payload["limits"]["extra"]["proof_partition_count"] == 2
assert payload["proof_state"]["evidence"]["requested_proof"] is False

try:
    ClassUnitGroupEngine(
        K,
        proof=False,
        algorithm="buchmann-hecke",
        limits=ClassUnitEngineLimits(max_relations=32, proof_partition_count=2),
        resume_from=payload,
    )
    raise AssertionError("changed resource limits resumed")
except ValueError as error:
    assert "resource limits differ" in str(error)

try:
    ClassUnitGroupEngine(
        K,
        proof=True,
        algorithm="buchmann-hecke",
        limits=limits,
        resume_from=payload,
    )
    raise AssertionError("changed proof policy resumed")
except ValueError as error:
    assert "proof policy differs" in str(error)

class Canonical:
    def __init__(self, name):
        self.name = name
    def to_dict(self):
        return {"schema": "fake-canonical-v1", "name": self.name}

class FakeCollector:
    records = (Canonical("relation"),)

class FakePresentation(Canonical):
    pass

class FakeGroup:
    def gens_ideals(self):
        return (Canonical("generator"),)

class FakeSaturation:
    content_sha256 = "a" * 64

conditional_dependencies = engine._proof_dependencies(
    FakeGroup(), FakeCollector(), FakePresentation("presentation"), FakeSaturation()
)
proof_engine = ClassUnitGroupEngine(
    K,
    proof=True,
    algorithm="buchmann-hecke",
    limits=limits,
)
unconditional_dependencies = proof_engine._proof_dependencies(
    FakeGroup(), FakeCollector(), FakePresentation("presentation"), FakeSaturation()
)
assert conditional_dependencies["relations"] != unconditional_dependencies["relations"]
assert set(conditional_dependencies) == {
    "relations", "presentation", "generators", "saturation",
}
print("checkpoint-policy-bound")
`);
  assert.equal(output, "checkpoint-policy-bound");
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

test("factor-base theorem authority controls proof status and upgrades", () => {
  const output = run(String.raw`
class Plan:
    def __init__(self, theorem, assumptions):
        self.theorem = theorem
        self.assumptions = assumptions

conditional = _factor_base_proof_status(
    Plan("BDF factor-base theorem", ("GRH",))
)
unconditional = _factor_base_proof_status(Plan("Minkowski", ()))
assert conditional == EXACT_RELATIONS_CONDITIONAL_GRH
assert unconditional == EXACT_UNCONDITIONAL
assert not _needs_unconditional_upgrade(False, conditional)
assert _needs_unconditional_upgrade(True, conditional)
assert not _needs_unconditional_upgrade(False, unconditional)
assert not _needs_unconditional_upgrade(True, unconditional)
try:
    _factor_base_proof_status(Plan("unsupported unconditional theorem", ()))
    raise AssertionError("unsupported unconditional authority was accepted")
except ArithmeticError:
    pass
print("plan-authority")
`);
  assert.equal(output, "plan-authority");
});

test("empty Minkowski factor bases retain the unit-ideal search path", () => {
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

R = PolynomialRing(QQ, "x")
x = R.gen()
K = NumberField(x**2 + 4*x + 1, "a")
engine = ClassUnitGroupEngine(
    K,
    algorithm="minkowski",
    components=ProbeComponents(),
)
ideal, row, strategy = engine._relation_ideal(object(), (), 0, 2)
assert ideal == K.maximal_order().ideal(1)
assert row == ()
assert strategy == "unit-ideal-sweep"
print("empty-factor-base")
`);
  assert.equal(output, "empty-factor-base");
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

test("public class_group propagates adapter validation failures", () => {
  const output = run(String.raw`
import sagejs.number_fields.class_group_maps as maps

class FakeRawGroup(_EngineClassGroup):
    def __init__(self):
        self.proof_status = EXACT_UNCONDITIONAL

class FakeResult:
    def __init__(self):
        self.raw = FakeRawGroup()
    def class_group(self):
        return self.raw

def fake_context(*args, **kwargs):
    return FakeResult()

def rejecting_adapter(result):
    raise TypeError("adapter rejected malformed proof material")

class_unit_context = fake_context
maps.class_group_from_engine_result = rejecting_adapter
try:
    class_group(object())
    raise AssertionError("adapter TypeError was hidden by a raw-group fallback")
except TypeError as error:
    assert str(error) == "adapter rejected malformed proof material"
print("adapter-failure-propagated")
`);
  assert.equal(output, "adapter-failure-propagated");
});

test("conditional raw engine groups cannot answer proof=True principality", () => {
  const output = run(String.raw`
class PrincipalClass:
    def is_one(self):
        return True

class ConditionalRawGroup(_EngineClassGroup):
    def __init__(self):
        self.proof_status = EXACT_RELATIONS_CONDITIONAL_GRH
    def __call__(self, ideal):
        return PrincipalClass()

group = ConditionalRawGroup()
assert group.is_principal(object(), proof=False)
try:
    group.is_principal(object(), proof=True)
    raise AssertionError("conditional principality accepted proof=True")
except ValueError as error:
    assert "unconditionally complete" in str(error)
try:
    group.is_principal(object(), proof=None)
    raise AssertionError("proof=None did not preserve proof=True semantics")
except ValueError:
    pass
print("conditional-proof-guarded")
`);
  assert.equal(output, "conditional-proof-guarded");
});
