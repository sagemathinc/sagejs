"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

const fixture = JSON.parse(
  readFileSync(
    join(__dirname, "fixtures/number-field-class-unit-context.json"),
    "utf8",
  ),
);

test("factored elements and the shared class/unit context replay exactly", async (t) => {
  const session = await createSage({ mode: "python" });
  t.after(() => session.close());
  const source = String.raw`
import copy
import hashlib
import json

from sagejs.number_fields.factored_elements import FactoredNumberFieldElement
from sagejs.number_fields.class_unit_analytic import (
    AnalyticPrecisionError,
    saturate_unit_lattice,
    verify_saturation_evidence,
)
from sagejs.number_fields.class_unit_context import (
    PROOF_LABELS,
    ClassUnitGroupContext,
    ClassUnitProofState,
    ResourceLimits,
)

fixture = json.loads(${JSON.stringify(JSON.stringify(fixture))})
R = PolynomialRing(QQ, "x")
x = R.gen()
K = NumberField(x**2 - 5, "a")
a = K.gen()
O = K.maximal_order()

witness = FactoredNumberFieldElement(
    K,
    [(a + 1, 2), (a - 1, -1), (a + 1, -1), (K.one(), 100), (a, 0)],
)
proof = ClassUnitProofState.conditional_grh(
    "Bach bound",
    17,
    "GRH for the Dedekind zeta function",
    {"index_one": True},
)
limits = ResourceLimits(
    max_factor_base_size=8,
    max_relations=20,
    max_precision_bits=256,
    max_memory_bytes=1048576,
    extra={"max_row_weight": 9},
)
context = ClassUnitGroupContext(
    K,
    O,
    proof,
    algorithm="buchmann-hecke",
    limits=limits,
    factor_base=[{
        "schema": "test.factor-base.v1",
        "index": 0,
        "p": 2,
        "norm": 4,
        "e": 1,
        "f": 2,
        "ideal_basis": [[[2, 1], [0, 1]], [[0, 1], [2, 1]]],
    }],
    relations=[{
        "schema": "test.relation.v1",
        "row": [[0, 1]],
        "witness": witness,
        "provenance": {"kind": "fixture"},
    }],
    search_state={
        "schema": "test.search-state.v1",
        "candidates_tested": 4,
        "random_state": [7, 13],
    },
    matrix_state={"schema": "test.matrix.v1", "rank": 1, "rows": [[1]]},
    class_group_state={"schema": "test.class-group.v1", "invariants": []},
    unit_state={"schema": "test.unit.v1", "rank": 1, "generators": [witness]},
    analytic_state={
        "schema": "test.analytic.v1",
        "index_bound": 1,
        "log_residue": ["1", "2"],
    },
    saturation_history=[{
        "prime": 2,
        "class_saturated": True,
        "unit_saturated": True,
    }],
    proof_progress={"checked_prime_norm": 11, "complete": False},
    precision_history=[80, 160],
    diagnostics={"relation_attempts": 4, "timing_micros": 1200},
    random_seed=7,
)

assert witness.to_dict() == fixture["factored_element"]
assert context.to_dict() == fixture["context"]
assert witness.evaluate() == (a + 3) / 2
assert witness.norm() == 1
assert witness.principal_ideal(O) == O.ideal(witness.evaluate())
assert witness.verify_principal_ideal(O.ideal(witness.evaluate()))
logarithms = witness.archimedean_logarithms(100)
assert len(logarithms) == 2
assert all(logarithm.rigorous for logarithm in logarithms)
assert all(logarithm.precision_bits == 100 for logarithm in logarithms)
assert all("outward dyadic" in logarithm.source for logarithm in logarithms)

epsilon = (a + 1) / 2
square_subgroup = [FactoredNumberFieldElement.from_element(K, epsilon**2)]
saturation = saturate_unit_lattice(
    K,
    O,
    square_subgroup,
    2,
    index_bound_is_rigorous=True,
    coordinate_bound=1,
)
assert saturation.complete and saturation.saturated and saturation.rigorous
assert saturation.remaining_index_bound == 1
assert saturation.index_enlargement == 2
assert len(saturation.evidence) == 1
assert saturation.evidence[0].root**2 == epsilon**2
assert saturation.verify()
assert verify_saturation_evidence(K, O, square_subgroup, saturation.to_dict())
tampered_saturation = copy.deepcopy(saturation.to_dict())
tampered_saturation["evidence"][0]["root_coordinates"][0][0] += 1
assert not verify_saturation_evidence(K, O, square_subgroup, tampered_saturation)

untrusted_bound = saturate_unit_lattice(
    K, O, square_subgroup, 2, coordinate_bound=1
)
assert not untrusted_bound.complete
assert untrusted_bound.unresolved_primes == (2,)

failed_closed = saturate_unit_lattice(
    K,
    O,
    square_subgroup,
    2,
    index_bound_is_rigorous=True,
    coordinate_bound=0,
    local_rational_primes=(),
)
assert not failed_closed.complete
assert failed_closed.evidence == ()

locally_obstructed = saturate_unit_lattice(
    K,
    O,
    [FactoredNumberFieldElement.from_element(K, epsilon)],
    2,
    index_bound_is_rigorous=True,
    coordinate_bound=1,
)
assert locally_obstructed.complete and locally_obstructed.verify()
assert locally_obstructed.evidence[0].outcome == "saturated"
assert locally_obstructed.evidence[0].method == (
    "exact-finite-order-quotient-pth-power-obstruction"
)

reconstruction_precisions = []
def adaptive_root_provider(field, order, generators, prime, precision):
    reconstruction_precisions.append(precision)
    if precision < 128:
        raise AnalyticPrecisionError("insufficient root reconstruction precision")
    return ([1], 0, epsilon)

adaptive_saturation = saturate_unit_lattice(
    K,
    O,
    square_subgroup,
    2,
    index_bound_is_rigorous=True,
    precision_bits=64,
    maximum_precision_bits=128,
    candidate_root_provider=adaptive_root_provider,
)
assert adaptive_saturation.complete
assert reconstruction_precisions == [64, 128]
assert adaptive_saturation.precision_history == (64, 128)
assert FactoredNumberFieldElement.from_dict(K, witness.to_dict()) == witness
assert witness * ~witness == FactoredNumberFieldElement(K)
assert witness**0 == FactoredNumberFieldElement(K)

class RelationRecord:
    def __init__(self, payload):
        self.payload = payload
        self.witness = FactoredNumberFieldElement.from_dict(K, payload["witness"])

    def to_dict(self):
        return self.payload

def verify_relation(record, replayed_context):
    return (
        record.payload["row"] == [[0, 1]]
        and record.witness.verify_principal_ideal(O.ideal(record.witness.evaluate()))
        and replayed_context.order is O
    )

replayed = ClassUnitGroupContext.replay(
    K,
    O,
    fixture["context"],
    component_decoders={"relations": RelationRecord},
    component_verifiers={"relations": verify_relation},
)
assert type(replayed.relations[0]) is RelationRecord
assert replayed.to_dict() == context.to_dict()

# Pointer-free identity permits deterministic replay in a fresh but exactly
# equal presentation, while a different variable or polynomial is rejected.
L = NumberField(x**2 - 5, "a")
OL = L.maximal_order()
portable = ClassUnitGroupContext.from_dict(L, OL, fixture["context"])
assert portable.stable_hash() == context.stable_hash()

immutable_rejections = 0
for action in (
    lambda: setattr(proof, "label", "heuristic-diagnostic-only"),
    lambda: setattr(limits, "max_relations", 21),
    lambda: setattr(witness, "_factors", ()),
    lambda: setattr(context, "proof_state", ClassUnitProofState.unconditional()),
):
    try:
        action()
    except (AttributeError, TypeError):
        immutable_rejections += 1
assert immutable_rejections == 4

unconditional = context.fork_for_proof(
    ClassUnitProofState.unconditional("Minkowski bound", 11)
)
other_limits = ResourceLimits(max_relations=21)
limited = ClassUnitGroupContext(
    K,
    O,
    proof,
    algorithm="buchmann-hecke",
    limits=other_limits,
    signature=(2, 0),
)
other_algorithm = ClassUnitGroupContext(
    K,
    O,
    proof,
    algorithm="minkowski",
    limits=limits,
    signature=(2, 0),
)
assert len({context.cache_key(), unconditional.cache_key(), limited.cache_key(), other_algorithm.cache_key()}) == 4
assert tuple(PROOF_LABELS) == (
    "exact-unconditional",
    "exact-relations-conditional-grh",
    "incomplete-resource-limit",
    "heuristic-diagnostic-only",
)

def rehash(payload):
    body = dict(payload)
    body.pop("content_sha256", None)
    text = json.dumps(
        body,
        allow_nan=False,
        ensure_ascii=True,
        separators=(",", ":"),
        sort_keys=True,
    )
    payload["content_sha256"] = hashlib.sha256(text.encode("utf-8")).hexdigest()

def replace_path(payload, path, value):
    target = payload
    for part in path[:-1]:
        target = target[part]
    target[path[-1]] = value

# Every serialized context component is covered by an independent single-item
# mutation.  The outer checkpoint hash must reject each one before replay.
mutations = (
    (("algorithm",), "minkowski"),
    (("field_order_identity", "field", "defining_polynomial", 0, 0), -6),
    (("field_order_identity", "maximal_order_basis", 0, 0, 0), 3),
    (("discriminant",), 13),
    (("signature", 0), 0),
    (("factor_base", 0, "p"), 3),
    (("relations", 0, "row", 0, 1), 2),
    (("relations", 0, "witness", "factors", 0, "exponent"), -2),
    (("search_state", "candidates_tested"), 5),
    (("matrix_state", "rank"), 0),
    (("class_group_state", "invariants"), [2]),
    (("unit_state", "rank"), 2),
    (("analytic_state", "index_bound"), 2),
    (("saturation_history", 0, "prime"), 3),
    (("proof_progress", "checked_prime_norm"), 13),
    (("precision_history", 1), 161),
    (("diagnostics", "relation_attempts"), 5),
    (("proof_state", "factor_base_bound"), 19),
    (("limits", "values", "max_relations"), 21),
    (("random_seed",), 8),
)
hash_rejections = 0
for path, value in mutations:
    corrupted = copy.deepcopy(fixture["context"])
    replace_path(corrupted, path, value)
    try:
        ClassUnitGroupContext.from_dict(K, O, corrupted)
    except (TypeError, ValueError, KeyError):
        hash_rejections += 1
assert hash_rejections == len(mutations)

# Recomputed hashes cannot turn an invalid proof label or a different exact
# field identity into valid evidence.
bad_label = copy.deepcopy(fixture["context"])
bad_label["proof_state"]["label"] = "certified"
rehash(bad_label["proof_state"])
rehash(bad_label)
try:
    ClassUnitGroupContext.from_dict(K, O, bad_label)
    raise AssertionError("an unknown proof label was accepted")
except ValueError:
    pass

bad_field = copy.deepcopy(fixture["context"])
bad_field["field_order_identity"]["field"]["defining_polynomial"][0][0] = -6
rehash(bad_field)
try:
    ClassUnitGroupContext.from_dict(K, O, bad_field)
    raise AssertionError("a different field identity was accepted")
except ValueError:
    pass

noncanonical_factors = copy.deepcopy(fixture["factored_element"])
noncanonical_factors["factors"].reverse()
rehash(noncanonical_factors)
try:
    FactoredNumberFieldElement.from_dict(K, noncanonical_factors)
    raise AssertionError("a noncanonical factor order was accepted")
except ValueError:
    pass

# Generic context replay authenticates bytes; producer-owned verifiers retain
# responsibility for component semantics after a deliberate hash rewrite.
bad_relation = copy.deepcopy(fixture["context"])
bad_relation["relations"][0]["row"] = [[0, 2]]
rehash(bad_relation)
ClassUnitGroupContext.from_dict(K, O, bad_relation)
try:
    ClassUnitGroupContext.from_dict(
        K,
        O,
        bad_relation,
        component_decoders={"relations": RelationRecord},
        component_verifiers={"relations": verify_relation},
    )
    raise AssertionError("a relation rejected by its producer verifier was accepted")
except ValueError:
    pass

print(json.dumps({
    "context_hash": context.stable_hash(),
    "factored_hash": witness.stable_hash(),
    "hash_rejections": hash_rejections,
    "immutable_rejections": immutable_rejections,
    "portable_replay": portable.to_dict() == fixture["context"],
}, sort_keys=True))
`;
  const result = await session.evaluate(source);
  assert.equal(result.stderr ?? "", "");
  assert.equal(result.error, undefined);
  const report = JSON.parse(result.stdout.trim());
  assert.deepEqual(report, {
    context_hash:
      "b6b2a98701b6bd36f8888b0b82a2d2f9e788124bb51efb2d013c272c2e36dbd6",
    factored_hash:
      "ac7b4a166714ec2a76cf2c3fc6f5c190cd41dca50fc6dda4f4d8936d52469fec",
    hash_rejections: 20,
    immutable_rejections: 4,
    portable_replay: true,
  });
});

test("class/unit checkpoints resume exact search state and reject corruption", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-class-unit-"));
  const checkpointPath = join(directory, "checkpoint.json");
  t.after(() => rmSync(directory, { force: true, recursive: true }));

  const session = await createSage({ mode: "python" });
  t.after(() => session.close());
  const source = String.raw`
import copy
import json

from sagejs.number_fields.class_unit_context import (
    ClassUnitCancellationError,
    ClassUnitCheckpoint,
    ClassUnitProofState,
    ResourceLimits,
    load_class_unit_checkpoint,
    save_class_unit_checkpoint,
)

checkpoint_path = ${JSON.stringify(checkpointPath)}
R = PolynomialRing(QQ, "x")
x = R.gen()
K = NumberField(x**2 - 5, "a")
O = K.maximal_order()

class SearchState:
    schema = "test.resumable-search.v1"

    def __init__(self, random_state, position=0):
        self.random_state = random_state
        self.position = position

    def next_candidate(self):
        self.random_state = (1103515245 * self.random_state + 12345) % (2**31)
        self.position += 1
        return self.random_state

    def to_dict(self):
        return {
            "schema": self.schema,
            "random_state": self.random_state,
            "position": self.position,
        }

    @classmethod
    def from_dict(cls, payload):
        if payload.get("schema") != cls.schema:
            raise ValueError("wrong search-state schema")
        if set(payload) != {"schema", "random_state", "position"}:
            raise ValueError("noncanonical search state")
        return cls(payload["random_state"], payload["position"])

def verify_search_state(state, context):
    return (
        type(state) is SearchState
        and state.position >= 0
        and 0 <= state.random_state < 2**31
        and context.order is O
    )

proof = ClassUnitProofState.unconditional("Minkowski bound", 11)
limits = ResourceLimits(max_checkpoint_bytes=1048576, max_relations=20)
progress = []
cancellation = {"requested": False}
controller = ClassUnitCheckpoint(
    K,
    O,
    proof,
    algorithm="buchmann-hecke",
    limits=limits,
    random_seed=23,
    destination=checkpoint_path,
    progress=lambda event: progress.append(event.to_dict()),
    cancelled=lambda: cancellation["requested"],
)

search = SearchState(23)
prefix = [search.next_candidate() for _ in range(3)]
first_event = controller.stage(
    "relation-search",
    "checkpoint",
    {"candidates_tested": search.position},
)
first_details = first_event.details
first_details["candidates_tested"] = 999
assert first_event.details["candidates_tested"] == 3
first_hash = controller.save({
    "factor_base": [{"schema": "test.factor-base.v1", "index": 0, "norm": 4}],
    "relations": [{"schema": "test.relation.v1", "row": [[0, 1]]}],
    "search_state": search,
    "matrix_state": {"schema": "test.matrix.v1", "rank": 1},
    "proof_progress": {"stage": "relations", "checked": 3},
})

# Continuing directly and continuing after a fresh controller restore must
# consume precisely the same candidate stream.
expected_tail = [search.next_candidate() for _ in range(5)]
resumed_progress = []
resumed = ClassUnitCheckpoint(
    K,
    O,
    resume_from=checkpoint_path,
    progress=lambda event: resumed_progress.append(event.to_dict()),
    component_decoders={"search_state": SearchState.from_dict},
    component_verifiers={"search_state": verify_search_state},
)
restored_search = resumed.restore_search_state()
actual_tail = [restored_search.next_candidate() for _ in range(5)]
assert resumed.resumed
assert actual_tail == expected_tail
assert resumed.restore_factor_base()[0]["index"] == 0
assert resumed.restore_relations()[0]["row"] == [[0, 1]]
assert resumed.restore_matrix_state()["rank"] == 1
assert resumed.restore_proof_progress() == {"stage": "relations", "checked": 3}
second_event = resumed.stage("relation-search", "resumed", {"tail": len(actual_tail)})
assert second_event.sequence == 1
second_hash = resumed.save({"search_state": restored_search})
assert second_hash != first_hash

# A detached sink is another supported checkpoint destination and can be used
# as a resume source without sharing mutable producer objects.
sink_payloads = []
sink_hash = save_class_unit_checkpoint(sink_payloads.append, resumed.context)
assert sink_hash == second_hash
detached = load_class_unit_checkpoint(
    sink_payloads[0],
    K,
    O,
    component_decoders={"search_state": SearchState.from_dict},
    component_verifiers={"search_state": verify_search_state},
)
assert detached.stable_hash() == second_hash

try:
    load_class_unit_checkpoint(sink_payloads[0], K, O, max_checkpoint_bytes=16)
    raise AssertionError("checkpoint byte limit was ignored")
except ValueError:
    pass

corrupted = copy.deepcopy(sink_payloads[0])
corrupted["search_state"]["position"] += 1
try:
    load_class_unit_checkpoint(corrupted, K, O)
    raise AssertionError("corrupted search progress was accepted")
except ValueError:
    pass

cancellation["requested"] = True
try:
    controller.check_cancelled("relation-search", {"candidates_tested": 3})
    raise AssertionError("cancellation request was ignored")
except ClassUnitCancellationError as error:
    assert error.stage == "relation-search"
    assert error.details == {"candidates_tested": 3}

print(json.dumps({
    "actual_tail": actual_tail,
    "checkpoint_hash_changed": first_hash != second_hash,
    "corruption_rejected": True,
    "prefix": prefix,
    "progress_sequences": [progress[0]["sequence"], resumed_progress[0]["sequence"]],
    "sink_detached": sink_payloads[0] is not resumed.context,
}, sort_keys=True))
`;
  const result = await session.evaluate(source);
  assert.equal(result.stderr ?? "", "");
  assert.equal(result.error, undefined);
  const report = JSON.parse(result.stdout.trim());
  assert.deepEqual(report, {
    actual_tail: [955942579, 958927984, 1256915945, 813160558, 2047662863],
    checkpoint_hash_changed: true,
    corruption_rejected: true,
    prefix: [1758542852, 1350039021, 844110882],
    progress_sequences: [0, 1],
    sink_detached: true,
  });
});

test("Minkowski proof partitions checkpoint atomically and replay exactly", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-minkowski-proof-"));
  const checkpointPath = join(directory, "checkpoint.json");
  t.after(() => rmSync(directory, { force: true, recursive: true }));

  const session = await createSage({ mode: "python" });
  t.after(() => session.close());
  const source = String.raw`
import copy
import hashlib
import json

from sagejs.number_fields.class_unit_context import (
    ClassUnitCancellationError,
    ClassUnitCheckpoint,
    ClassUnitProofState,
    MinkowskiProofProgress,
    MinkowskiProofProgressRecord,
    stable_component_hash,
)

checkpoint_path = ${JSON.stringify(checkpointPath)}
R = PolynomialRing(QQ, "x")
x = R.gen()
K = NumberField(x**3 - x - 1, "a")
O = K.maximal_order()
fingerprints = tuple(
    {"index": index, "norm": prime, "ideal_hnf": [[prime, 0], [0, 1]]}
    for index, prime in enumerate((2, 3, 4, 5, 7, 8, 9))
)
dependencies = {
    "relations": stable_component_hash({"rows": [[1, 0], [0, 1]]}),
    "generators": stable_component_hash({"ideals": [fingerprints[0]]}),
    "saturation": stable_component_hash({"class_primes": [2], "complete": True}),
}
bound = (31, 2)

def record(index, coordinate=None):
    return MinkowskiProofProgressRecord(
        index,
        fingerprints[index],
        {
            "coordinates": [index if coordinate is None else coordinate],
            "principal_witness_sha256": stable_component_hash(
                {"prime_index": index, "power": 1}
            ),
        },
    )

def decode_record(payload):
    return MinkowskiProofProgressRecord.from_dict(payload)

def verify_record(value, index, fingerprint):
    return (
        type(value) is MinkowskiProofProgressRecord
        and value.index == index
        and value.prime_fingerprint == fingerprint
        and value.evidence["coordinates"] == [index]
    )

cancellation = {"requested": False}

def observe(event):
    if (
        event.stage == "unconditional-proof"
        and event.state == "checkpoint"
        and event.details["completed"] == 3
    ):
        cancellation["requested"] = True

controller = ClassUnitCheckpoint(
    K,
    O,
    ClassUnitProofState.incomplete("unconditional proof in progress"),
    algorithm="buchmann-hecke",
    destination=checkpoint_path,
    progress=observe,
    cancelled=lambda: cancellation["requested"],
)
progress = controller.begin_minkowski_proof(
    bound,
    fingerprints,
    partition_count=3,
    dependency_hashes=dependencies,
)
assert progress.pending_indices() == tuple(range(7))
assert progress.pending_indices(0) == (0, 3, 6)

# A worker may advance its strided partition independently, then merge that
# authenticated prefix into the shared checkpoint.
worker_zero = progress.partitions[0].append(record(0)).append(record(3))
progress = controller.checkpoint_minkowski_proof_partition(
    progress,
    worker_zero,
    details={"worker": 0},
)
assert progress.completed_items == 2

# Cancellation requested by the progress callback occurs after the newly
# accepted record is atomically saved by the controller's finally boundary.
try:
    controller.checkpoint_minkowski_proof_prime(
        progress,
        1,
        record(1),
        details={"worker": 1},
    )
    raise AssertionError("proof-pass cancellation was ignored")
except ClassUnitCancellationError as error:
    assert error.stage == "unconditional-proof"

def decode_progress(payload):
    if payload is None:
        return None
    return MinkowskiProofProgress.from_dict(payload, decode_record)

resumed = ClassUnitCheckpoint(
    K,
    O,
    resume_from=checkpoint_path,
    component_decoders={"proof_progress": decode_progress},
)
progress = resumed.restore_minkowski_proof_progress(
    bound=bound,
    prime_fingerprints=fingerprints,
    partition_count=3,
    dependency_hashes=dependencies,
    record_verifier=verify_record,
)
assert progress is not None
assert progress.completed_items == 3
assert progress.pending_indices() == (2, 4, 5, 6)

for index in progress.pending_indices():
    progress = resumed.checkpoint_minkowski_proof_prime(
        progress,
        index,
        record(index),
        details={"resumed": True},
    )
assert progress.complete
assert progress.completed_items == progress.total_items == 7

replayed = MinkowskiProofProgress.from_dict(
    progress.to_dict(),
    record_decoder=decode_record,
    record_verifier=verify_record,
)
assert replayed.to_dict() == progress.to_dict()

def rehash(payload):
    body = dict(payload)
    body.pop("content_sha256", None)
    text = json.dumps(
        body,
        allow_nan=False,
        ensure_ascii=True,
        separators=(",", ":"),
        sort_keys=True,
    )
    payload["content_sha256"] = hashlib.sha256(text.encode("utf-8")).hexdigest()

def replan(payload):
    plan = {
        "theorem": payload["theorem"],
        "bound": payload["bound"],
        "prime_fingerprints": payload["prime_fingerprints"],
        "dependency_hashes": payload["dependency_hashes"],
        "partition_count": payload["partition_count"],
    }
    text = json.dumps(
        plan,
        allow_nan=False,
        ensure_ascii=True,
        separators=(",", ":"),
        sort_keys=True,
    )
    payload["plan_sha256"] = hashlib.sha256(text.encode("utf-8")).hexdigest()
    for partition in payload["partitions"]:
        partition["plan_sha256"] = payload["plan_sha256"]
        rehash(partition)
    rehash(payload)

# Prime-plan and every dependency mutation can be internally rehashed, but it
# no longer matches the exact plan requested by the computation being resumed.
plan_mutations = []
changed_prime = copy.deepcopy(progress.to_dict())
changed_prime["prime_fingerprints"][0]["norm"] = 11
plan_mutations.append(changed_prime)
for name in ("relations", "generators", "saturation"):
    changed = copy.deepcopy(progress.to_dict())
    changed["dependency_hashes"][name] = "0" * 64
    plan_mutations.append(changed)
plan_mismatches = 0
for changed in plan_mutations:
    replan(changed)
    try:
        altered = MinkowskiProofProgress.from_dict(changed, decode_record)
        matches = altered.matches_plan(
            bound,
            fingerprints,
            partition_count=3,
            dependency_hashes=dependencies,
        )
    except ValueError:
        matches = False
    if not matches:
        plan_mismatches += 1
assert plan_mismatches == 4

# Rehashing a mutated record still cannot bypass producer-owned mathematical
# verification of its coordinates and principal witness.
bad_record = copy.deepcopy(progress.to_dict())
bad_record["partitions"][0]["records"][0]["evidence"]["coordinates"] = [99]
rehash(bad_record["partitions"][0]["records"][0])
rehash(bad_record["partitions"][0])
rehash(bad_record)
try:
    MinkowskiProofProgress.from_dict(
        bad_record,
        record_decoder=decode_record,
        record_verifier=verify_record,
    )
    raise AssertionError("a mutated proof-prime record was accepted")
except ValueError:
    pass

# Removing an authenticated suffix produces resumable incomplete progress,
# never a false unconditional completion claim.
truncated = copy.deepcopy(progress.to_dict())
truncated["partitions"][0]["records"].pop()
truncated["partitions"][0]["content_sha256"] = "stale"
truncated["completed_items"] -= 1
truncated["complete"] = False
try:
    MinkowskiProofProgress.from_dict(truncated, decode_record)
    raise AssertionError("stale partition authentication was accepted")
except ValueError:
    pass
rehash(truncated["partitions"][0])
rehash(truncated)
incomplete = MinkowskiProofProgress.from_dict(truncated, decode_record)
assert not incomplete.complete
assert incomplete.pending_indices(0) == (6,)

print(json.dumps({
    "atomic_cancel_completed": 3,
    "complete": progress.complete,
    "partition_records": [len(value.records) for value in progress.partitions],
    "plan_mismatches": plan_mismatches,
    "remaining_after_cancel": [2, 4, 5, 6],
    "replay_hash": replayed.stable_hash(),
}, sort_keys=True))
`;
  const result = await session.evaluate(source);
  assert.equal(result.stderr ?? "", "");
  assert.equal(result.error, undefined);
  const report = JSON.parse(result.stdout.trim());
  assert.equal(report.atomic_cancel_completed, 3);
  assert.equal(report.complete, true);
  assert.deepEqual(report.partition_records, [3, 2, 2]);
  assert.equal(report.plan_mismatches, 4);
  assert.deepEqual(report.remaining_after_cancel, [2, 4, 5, 6]);
  assert.match(report.replay_hash, /^[0-9a-f]{64}$/);
});
