"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
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
assert len(witness.archimedean_logarithms(100)) == 2
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
      "7764c770d05257ef3c365b94a5c54cc5342ee3902dd21230686f21e1cbf2d2cd",
    factored_hash:
      "ac7b4a166714ec2a76cf2c3fc6f5c190cd41dca50fc6dda4f4d8936d52469fec",
    hash_rejections: 19,
    immutable_rejections: 4,
    portable_replay: true,
  });
});
