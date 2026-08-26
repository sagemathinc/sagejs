// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");
const { spawnSagejsSync } = require("./helpers/sagejs-cli.cjs");

const root = join(__dirname, "..");
const fixture = join(
  root,
  "test",
  "fixtures",
  "number-field-class-group-maps-proof.json",
);
function run(source) {
  const result = spawnSagejsSync(root, ["--python", "-"], {
    cwd: root,
    encoding: "utf8",
    input: source,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

test("class-group maps retain exact discrete logs and principality witnesses", () => {
  const output = run(String.raw`
from sagejs.number_fields.class_group_maps import IdealClassGroup, PrincipalIdealWitness, class_group_from_context
from sagejs.number_fields.class_group_proof import EXACT_UNCONDITIONAL

class ToyOrder:
    def ideal(self, value):
        if value == 1:
            return ToyIdeal(self, 0, 0)
        if isinstance(value, ToyFactored):
            return value.principal_ideal(self)
        raise TypeError("unknown toy ideal generator")

class ToyIdeal:
    def __init__(self, order, class_exponent, scalar_exponent, norm=1):
        self._order = order
        self.class_exponent = class_exponent
        self.scalar_exponent = scalar_exponent
        self._norm = norm
    def ring(self):
        return self._order
    def is_zero(self):
        return False
    def norm(self):
        return self._norm
    def __mul__(self, other):
        assert other.ring() is self._order
        return ToyIdeal(self._order, self.class_exponent + other.class_exponent, self.scalar_exponent + other.scalar_exponent)
    def __truediv__(self, other):
        assert other.ring() is self._order
        return ToyIdeal(self._order, self.class_exponent - other.class_exponent, self.scalar_exponent - other.scalar_exponent)
    def __pow__(self, exponent):
        return ToyIdeal(self._order, self.class_exponent * exponent, self.scalar_exponent * exponent)
    def __eq__(self, other):
        return isinstance(other, ToyIdeal) and other.ring() is self._order and other.class_exponent == self.class_exponent and other.scalar_exponent == self.scalar_exponent

class ToyFactored:
    def __init__(self, class_exponent, scalar_exponent):
        self.class_exponent = class_exponent
        self.scalar_exponent = scalar_exponent
    def factors(self):
        return (("g", self.class_exponent), ("s", self.scalar_exponent))
    def principal_ideal(self, order=None):
        return ToyIdeal(ORDER if order is None else order, self.class_exponent, self.scalar_exponent)
    def verify_principal_ideal(self, ideal):
        return self.principal_ideal(ideal.ring()) == ideal

ORDER = ToyOrder()
generator_ideal = ToyIdeal(ORDER, 1, 0)

def ideal_log(ideal):
    coordinate = ideal.class_exponent % 4
    quotient = ideal / ToyIdeal(ORDER, coordinate, 0)
    return {
        "coordinates": (coordinate,),
        "witness": ToyFactored(quotient.class_exponent, quotient.scalar_exponent),
    }

C = IdealClassGroup(
    ORDER,
    (4,),
    (generator_ideal,),
    (ToyFactored(4, 0),),
    ideal_log,
    proof_status=EXACT_UNCONDITIONAL,
    algorithm="hand-replayed-relations",
)
assert C.invariants() == (4,)
assert C.order() == 4
assert C.gens() == (C.gen(0),)
assert C.gen(0).ideal() == generator_ideal
assert C(C.gen(0).ideal()) == C.gen(0)
assert (C.gen(0)**4).is_one()
assert (C.gen(0)**3).inverse() == C.gen(0)
assert C.gen(0).order() == 4
assert C.map().preimage(C.map()(C.gen(0)**2)) == C.gen(0)**2

arbitrary = ToyIdeal(ORDER, 9, 3)
log = C.discrete_log(arbitrary)
assert log.coordinates == (1,)
assert log.verify(arbitrary, C)
assert not C.principality(arbitrary)
principal = ToyIdeal(ORDER, 8, 3)
answer = C.principality(principal)
assert answer and answer.generator.factors() == (("g", 8), ("s", 3))
assert answer.verify()

class MatrixPresentation:
    invariants = (4,)
    def verify(self, *_args): return True

class ProofState:
    label = EXACT_UNCONDITIONAL

class Context:
    order = ORDER
    proof_state = ProofState()
    presentation = MatrixPresentation()
    generator_ideals = (generator_ideal,)
    relation_witnesses = (ToyFactored(4, 0),)
    algorithm = "duck-typed-context"
    relation_count = 1
    def ideal_class_log(self, ideal): return ideal_log(ideal)

Cctx = class_group_from_context(Context())
assert Cctx.invariants() == (4,) and Cctx(Cctx.gen().ideal()) == Cctx.gen()
assert Cctx.verify()

def corrupt_log(ideal):
    return ((ideal.class_exponent + 1,), ToyFactored(0, ideal.scalar_exponent))

bad = IdealClassGroup(
    ORDER, (4,), (generator_ideal,), (ToyFactored(4, 0),), corrupt_log,
    proof_status=EXACT_UNCONDITIONAL,
)
try:
    bad(arbitrary)
    raise AssertionError("a corrupted ideal log was accepted")
except ArithmeticError:
    pass
try:
    IdealClassGroup(
        ORDER, (4,), (generator_ideal,), (ToyFactored(3, 0),), ideal_log,
        proof_status=EXACT_UNCONDITIONAL,
    )
    raise AssertionError("a corrupted defining relation was accepted")
except ArithmeticError:
    pass
try:
    IdealClassGroup(
        ORDER, (4,), (generator_ideal,), (ToyFactored(4, 0),), ideal_log,
        proof_status="incomplete-resource-limit",
    )
    raise AssertionError("an incomplete result constructed a class group")
except ValueError:
    pass
try:
    C.proof_status = "exact-relations-conditional-grh"
    raise AssertionError("the immutable public proof label was mutated")
except AttributeError:
    pass

print("class-group-maps-ok")
`);
  assert.equal(output, "class-group-maps-ok");
});

test("GRH and unconditional Minkowski records replay and reject mutations", () => {
  const payload = JSON.parse(readFileSync(fixture, "utf8"));
  assert.equal(payload.proof_status, "exact-unconditional");
  assert.equal(payload.mutations.length, 13);
  const output = run(String.raw`
import copy
import json

from sagejs.number_fields.class_group_maps import IdealClassGroup, PrincipalIdealWitness
from sagejs.number_fields.class_group_proof import (
    ConditionalGRHProofRecord,
    EXACT_RELATIONS_CONDITIONAL_GRH,
    EXACT_UNCONDITIONAL,
    MinkowskiPrimeClassRecord,
    SaturationProofRecord,
    UnconditionalMinkowskiProofRecord,
)

FIXTURE = json.loads(${JSON.stringify(JSON.stringify(payload))})

class ToyOrder:
    def ideal(self, value):
        if value == 1:
            return ToyIdeal(self, 0, 0)
        if isinstance(value, ToyFactored):
            return value.principal_ideal(self)
        raise TypeError("unknown toy ideal generator")

class ToyIdeal:
    def __init__(self, order, a, b, norm=1):
        self._order, self.a, self.b, self._norm = order, a, b, norm
    def ring(self): return self._order
    def is_zero(self): return False
    def norm(self): return self._norm
    def __mul__(self, other): return ToyIdeal(self._order, self.a + other.a, self.b + other.b)
    def __truediv__(self, other): return ToyIdeal(self._order, self.a - other.a, self.b - other.b)
    def __pow__(self, exponent): return ToyIdeal(self._order, self.a * exponent, self.b * exponent)
    def __eq__(self, other): return isinstance(other, ToyIdeal) and other._order is self._order and (other.a, other.b) == (self.a, self.b)

class ToyFactored:
    def __init__(self, a, b): self.a, self.b = a, b
    def factors(self): return (("g", self.a), ("s", self.b))
    def principal_ideal(self, order=None): return ToyIdeal(ORDER if order is None else order, self.a, self.b)
    def verify_principal_ideal(self, ideal): return self.principal_ideal(ideal.ring()) == ideal

class MatrixPresentation:
    invariants = (4,)
    def verify(self, *_args): return True

class ProofContext:
    field_order_fingerprint = "toy-field-order-v1"
    discriminant = -23
    minkowski_bound = (5, 1)
    saturation_record = SaturationProofRecord((2,), (2,), index_bound=2, evidence="toy-index-two-saturation")
    def __init__(self, ideals): self._ideals = tuple(ideals)
    def iter_minkowski_prime_ideals(self): return iter(self._ideals)
    def ideal_fingerprint(self, ideal): return str(ideal.a) + ":" + str(ideal.b) + ":" + str(ideal.norm())

ORDER = ToyOrder()
P1 = ToyIdeal(ORDER, 1, 0, 2)
P2 = ToyIdeal(ORDER, 2, 1, 3)
CONTEXT = ProofContext((P1, P2))

def ideal_log(ideal):
    coordinate = ideal.a % 4
    quotient = ideal / ToyIdeal(ORDER, coordinate, 0)
    return ((coordinate,), ToyFactored(quotient.a, quotient.b))

def decode_ideal(data): return ToyIdeal(ORDER, data[0], data[1], data[2])
def encode_ideal(ideal): return [ideal.a, ideal.b, ideal.norm()]
def decode_generator(data): return ToyFactored(data[0], data[1])
def encode_generator(generator): return [generator.a, generator.b]
def decode_witness(data, _ideal):
    return PrincipalIdealWitness.from_dict(data, decode_ideal, decode_generator)
def encode_witness(witness):
    return witness.to_dict(encode_ideal, encode_generator)
def decode_prime(data):
    return MinkowskiPrimeClassRecord.from_dict(data, decode_ideal, decode_witness)
def encode_prime(record):
    return record.to_dict(encode_ideal, encode_witness)

proof = UnconditionalMinkowskiProofRecord.from_dict(FIXTURE, decode_prime)
C = IdealClassGroup(
    ORDER, (4,), (ToyIdeal(ORDER, 1, 0),), (ToyFactored(4, 0),), ideal_log,
    proof_status=EXACT_UNCONDITIONAL,
    algorithm="minkowski",
    presentation_evidence=MatrixPresentation(),
    proof_record=proof,
    proof_context=CONTEXT,
)
assert C.verify()
expected_serialization = copy.deepcopy(FIXTURE)
expected_serialization.pop("mutations")
assert proof.to_dict(encode_prime) == expected_serialization

for mutation in FIXTURE["mutations"]:
    corrupted = copy.deepcopy(FIXTURE)
    corrupted.pop("mutations")
    target = corrupted
    for part in mutation["path"][:-1]: target = target[part]
    target[mutation["path"][-1]] = mutation["value"]
    try:
        bad_proof = UnconditionalMinkowskiProofRecord.from_dict(corrupted, decode_prime)
        bad_group = IdealClassGroup(
            ORDER, (4,), (ToyIdeal(ORDER, 1, 0),), (ToyFactored(4, 0),), ideal_log,
            proof_status=EXACT_UNCONDITIONAL,
            proof_record=bad_proof,
            proof_context=CONTEXT,
        )
        assert not bad_group.verify()
    except (TypeError, ValueError, ArithmeticError):
        pass

conditional_data = {
    "schema": "sagejs.number-fields.class-group.grh-proof.v1",
    "proof_status": EXACT_RELATIONS_CONDITIONAL_GRH,
    "theorem": "Bach bound",
    "bound": [48, 1],
    "relation_count": 3,
    "assumption": "GRH for the Dedekind zeta function",
    "saturation": SaturationProofRecord((2,), (), index_bound=2).to_dict(),
    "analytic_index_one": True,
}
conditional = ConditionalGRHProofRecord.from_dict(conditional_data)

class ConditionalContext:
    saturation_record = conditional.saturation
    def verify_conditional_grh_record(self, record):
        return record.to_dict() == conditional.to_dict()

CONDITIONAL_CONTEXT = ConditionalContext()
Cgrh = IdealClassGroup(
    ORDER, (4,), (ToyIdeal(ORDER, 1, 0),), (ToyFactored(4, 0),), ideal_log,
    proof_status=EXACT_RELATIONS_CONDITIONAL_GRH,
    algorithm="buchmann-hecke",
    factor_base_theorem="Bach bound",
    factor_base_bound=(48, 1),
    proof_record=conditional,
    proof_context=CONDITIONAL_CONTEXT,
    relation_count=3,
)
assert Cgrh.verify()
conditional_data["analytic_index_one"] = False
assert not ConditionalGRHProofRecord.from_dict(conditional_data).verify(Cgrh, CONDITIONAL_CONTEXT)

print("class-group-proof-ok")
`);
  assert.equal(output, "class-group-proof-ok");
});

test("the trivial presentation maps exact Sage.js fractional ideals", () => {
  const output = run(String.raw`
from sagejs.number_fields.class_group_maps import IdealClassGroup, PrincipalIdealWitness
from sagejs.number_fields.class_group_proof import EXACT_UNCONDITIONAL
from sagejs.number_fields.ideal_arithmetic import ideal_quotient

R = PolynomialRing(QQ, "x")
x = R.gen()
K = NumberField(x**3 - x - 1, "a")
O = K.maximal_order()
generator = (K.gen() + 2) / 2
I = ideal_quotient(O.ideal(K.gen() + 2), O.ideal(2))

def ideal_log(ideal):
    assert ideal == I
    return ((), PrincipalIdealWitness(ideal, generator, source="explicit fractional generator"))

C = IdealClassGroup(
    O, (), (), (), ideal_log,
    proof_status=EXACT_UNCONDITIONAL,
    algorithm="explicit-trivial-presentation",
)
assert C.order() == 1 and C.invariants() == () and C.gens() == ()
assert C(I).is_one()
answer = C.principality(I)
assert answer and answer.verify(O) and answer.generator == generator
try:
    C(O.ideal(0))
    raise AssertionError("the zero ideal acquired an ideal class")
except ValueError:
    pass

print("class-group-fractional-ideal-ok")
`);
  assert.equal(output, "class-group-fractional-ideal-ok");
});

test("completed engine results adapt to public witnessed maps and GRH evidence", () => {
  const output = run(String.raw`
import copy
import hashlib
import json

from sagejs.number_fields.class_group_maps import IdealClassGroup, class_group_from_engine_result
from sagejs.number_fields.class_group_proof import EXACT_RELATIONS_CONDITIONAL_GRH
from sagejs.number_fields.class_group_factor_base import (
    build_factor_base,
    factor_base_plan,
)
from sagejs.number_fields.class_group_matrix import extract_relation_presentation
from sagejs.number_fields.class_group_relations import (
    ExactRelationCollector,
    FactoredPrincipalWitness,
    factor_ideal_over_base,
    initial_rational_prime_relations,
    reduce_ideal_over_base,
    reconstruct_factor_base_ideal,
)
from sagejs.number_fields.class_unit_groups import _EngineClassGroup
from sagejs.number_fields.factored_elements import FactoredNumberFieldElement

def seal(payload):
    body = copy.deepcopy(payload)
    body.pop("content_sha256", None)
    text = json.dumps(body, allow_nan=False, ensure_ascii=True, separators=(",", ":"), sort_keys=True)
    body["content_sha256"] = hashlib.sha256(text.encode("utf-8")).hexdigest()
    return body

R = PolynomialRing(QQ, "x")
x = R.gen()
K = NumberField(x**2 - x - 1, "a")
O = K.maximal_order()
factor_base_plan_evidence = factor_base_plan(
    O, proof=False, theorem="bdf", max_bound=100_000,
    max_prime_ideals=4096, max_memory_bytes=512 * 1024 * 1024,
)
factor_base = tuple(
    record.prime_ideal for record in build_factor_base(factor_base_plan_evidence)
)
collector = ExactRelationCollector(O, factor_base)
initial_rational_prime_relations(collector)
relations = tuple(collector.records)
presentation = extract_relation_presentation(
    [record.row for record in relations], len(factor_base), backend="python"
)
generator_rows = tuple(presentation.generator_transforms)
generator_ideals = tuple(
    reconstruct_factor_base_ideal(O, factor_base, row) for row in generator_rows
)

def combine_relations(coefficients):
    factors = []
    for record, coefficient in zip(relations, coefficients, strict=False):
        witness = FactoredPrincipalWitness.from_dict(K, record.witness)
        factors.extend((element, exponent * int(coefficient)) for element, exponent in witness.factors())
    return FactoredNumberFieldElement(K, factors)

ENGINE_GROUP = _EngineClassGroup(
    O,
    presentation.invariants,
    generator_ideals,
    generator_rows,
    presentation,
    factor_base,
    relations,
    combine_relations,
    factor_ideal_over_base,
    reduce_ideal_over_base,
    lambda left, right: FactoredNumberFieldElement(K, list(left.factors()) + list(right.factors())),
    EXACT_RELATIONS_CONDITIONAL_GRH,
    factor_base_plan_evidence.theorem,
)

class Stage:
    def __init__(self, name, state, details): self.name, self.state, self.details = name, state, details

class SaturationProducer:
    def __init__(self):
        self.payload = seal({
            "schema": "sagejs.number-fields/class-unit-saturation-v1",
            "original_units": ["u0"],
            "required_primes": [2, 3],
            "class_primes": [2],
            "unit_primes": [3],
            "attempts": [
                {"schema": "sagejs.number-fields.unit-local-pth-obstruction.v1", "prime": 2, "outcome": "saturated", "method": "exact-local-obstruction", "quotient_targets": [1], "moduli": [2], "cap": 8},
                {"schema": "sagejs.number-fields.unit-pth-root-certificate.v1", "prime": 3, "outcome": "enlarged", "method": "exact-pth-root-identity", "root_coordinates": [[1, 1]], "exponent_vector": [1], "torsion_exponent": 0, "lattice_index_change": 3, "precision_history": [64, 128]},
            ],
            "index_bound": 6,
            "remaining_index_bound": 1,
            "index_bound_is_rigorous": True,
            "index_enlargement": 6,
            "unresolved_primes": [],
            "units": [[[1, 1]]],
            "precision_history": [64, 128],
            "rigorous": True,
            "complete": True,
            "saturated": True,
            "reason": "exact p-saturation",
            "status": "exact-unit-p-saturation",
            "proof_status": "exact-unit-p-saturation",
            "incomplete_reason": None,
            "analytic_validation": {"content_sha256": "analytic-hash"},
        })
    def to_dict(self): return copy.deepcopy(self.payload)
    def verify(self, field, order, original_units, analytic_validation=None):
        return field is K and order is O and tuple(original_units) == ("u0",) and analytic_validation == "analytic-artifact"

class EngineResult:
    field = K
    complete = True
    proof_status = EXACT_RELATIONS_CONDITIONAL_GRH
    algorithm = "buchmann-hecke"
    diagnostics = {"factor_base_bound": int(factor_base_plan_evidence.bound), "relations": len(relations)}
    stages = (
        Stage("analytic-index", "complete", {"rigorous": True, "lower_index": 1, "upper_index": 1}),
        Stage("proof", "complete", {"proof_status": EXACT_RELATIONS_CONDITIONAL_GRH, "exact_relations": len(relations)}),
    )
    def __init__(self):
        self._group = ENGINE_GROUP
        self.saturation_record = SaturationProducer()
        self.saturation_original_units = ("u0",)
        self.analytic_validation = "analytic-artifact"
        self.conditional_factor_base = factor_base
        self.conditional_relation_records = relations
        self.conditional_presentation_evidence = presentation
    def class_group(self): return self._group
    def verify_saturation_record(self, payload):
        return payload == self.saturation_record.to_dict() and self.saturation_record.verify(K, O, self.saturation_original_units, analytic_validation=self.analytic_validation)

C = class_group_from_engine_result(EngineResult())
assert isinstance(C, IdealClassGroup)
assert C.invariants() == tuple(presentation.invariants)
assert C.order() == int(presentation.order) and C.order() > 1
assert C.gen().ideal() == generator_ideals[0]
assert C.gen().order() == C.invariants()[0] and (C.gen()**C.gen().order()).is_one()
assert C(C.gen().ideal()) == C.gen()
arbitrary = generator_ideals[0] ** (C.gen().order() + 1) * O.ideal(2) ** 3
assert C(arbitrary) == C.gen()
assert C.discrete_log(arbitrary).principal_witness.verify(O)
assert not C.is_principal(arbitrary, proof=False)
principal = generator_ideals[0] ** (2 * C.gen().order()) * O.ideal(2) ** 3
answer = C.principality(principal)
assert answer and answer.generator.verify_principal_ideal(principal)
try:
    C.is_principal(principal, proof=True)
    raise AssertionError("a GRH-conditional group answered proof=True")
except ValueError:
    pass

payload = C.proof_payload()
assert C.verify_proof_payload(payload)
evidence = payload["conditional_evidence"]
assert evidence["schema"] == "sagejs.number-fields/conditional-class-group-evidence-v1"
assert evidence["field_order_fingerprint"] == factor_base[0].to_dict()["field_order_fingerprint"]
assert evidence["factor_base_plan"]["bound"]["bound"] == int(factor_base_plan_evidence.bound)
assert len(evidence["factor_base"]) == len(factor_base)
assert len(evidence["relations"]) == len(relations)
assert evidence["presentation"] == presentation.to_dict()
assert payload["saturation"]["class_primes"] == [2]
assert payload["saturation"]["unit_primes"] == [3]
assert payload["saturation"]["index_bound"] == 6
for key, value in (("theorem", "forged theorem"), ("bound", [47, 1]), ("relation_count", 6), ("analytic_index_one", False)):
    corrupted = copy.deepcopy(payload)
    corrupted[key] = value
    assert not C.verify_proof_payload(corrupted)
for path, value in (
    (("saturation", "evidence", "required_primes"), [2]),
    (("saturation", "evidence", "remaining_index_bound"), 3),
    (("saturation", "unit_primes"), [5]),
):
    corrupted = copy.deepcopy(payload)
    target = corrupted
    for part in path[:-1]: target = target[part]
    target[path[-1]] = value
    assert not C.verify_proof_payload(corrupted)

# The nested digest catches blind corruption, while reauthenticated mutations
# still fail exact prime, relation-witness, row, and matrix replay.
corrupted = copy.deepcopy(payload)
corrupted["conditional_evidence"]["content_sha256"] = "0" * 64
assert not C.verify_proof_payload(corrupted)

for path, mutate in (
    (("theorem",), lambda value: "forged-" + value),
    (("relation_count",), lambda _value: True),
    (("factor_base", 0, "f"), lambda value: value + 1),
    (("relations", 0, "row", 0), lambda value: value + 1),
    (("relations", 0, "row", 0), lambda _value: 1 << 100),
    (("relations", 0, "witness", "factors", 0, "exponent"), lambda value: value + 1),
    (("relations", 0, "witness", "factors", 0, "exponent"), lambda _value: 1 << 100),
    (("presentation", "smith", 0, 0), lambda value: value + 1),
    (("presentation", "smith_right", 0, 0), lambda value: value + 1),
    (("presentation", "smith_right", 0, 0), lambda _value: 1 << 2048),
):
    corrupted = copy.deepcopy(payload)
    target = corrupted["conditional_evidence"]
    for part in path[:-1]: target = target[part]
    target[path[-1]] = mutate(target[path[-1]])
    corrupted["conditional_evidence"] = seal(corrupted["conditional_evidence"])
    assert not C.verify_proof_payload(corrupted), path

corrupted = copy.deepcopy(payload)
_ignored = corrupted["conditional_evidence"]["relations"].reverse()
corrupted["conditional_evidence"] = seal(corrupted["conditional_evidence"])
assert not C.verify_proof_payload(corrupted)

corrupted = copy.deepcopy(payload)
_omitted = corrupted["conditional_evidence"]["factor_base"].pop()
corrupted["conditional_evidence"] = seal(corrupted["conditional_evidence"])
assert not C.verify_proof_payload(corrupted)

corrupted = copy.deepcopy(payload)
corrupted["conditional_evidence"]["factor_base_plan"]["caps"]["max_prime_ideals"] += 1
corrupted["conditional_evidence"] = seal(corrupted["conditional_evidence"])
assert not C.verify_proof_payload(corrupted)

for path, value in (
    (("assumption",), "G" * ((1 << 16) + 1)),
    (("relation_count",), 1 << 4097),
    (("relations",), [None] * 2049),
):
    corrupted = copy.deepcopy(payload)
    target = corrupted["conditional_evidence"]
    for part in path[:-1]: target = target[part]
    target[path[-1]] = value
    corrupted["conditional_evidence"] = seal(corrupted["conditional_evidence"])
    assert not C.verify_proof_payload(corrupted), path

corrupted = copy.deepcopy(payload)
corrupted["conditional_evidence"]["assumption"] = chr(0xD800)
assert not C.verify_proof_payload(corrupted)

assert not C.verify_proof_payload(payload, cancelled=lambda: True)

bad_saturation = EngineResult()
bad_saturation.saturation_record.payload["required_primes"] = [2, 5]
bad_saturation.saturation_record.payload = seal(bad_saturation.saturation_record.payload)
try:
    class_group_from_engine_result(bad_saturation)
    raise AssertionError("reauthenticated incomplete p-saturation was accepted")
except ArithmeticError:
    pass

bad_result = EngineResult()
bad_result._group._presentation.order = 8
try:
    class_group_from_engine_result(bad_result)
    raise AssertionError("a presentation with the wrong order was accepted")
except ArithmeticError:
    pass

print("engine-class-group-adapter-ok")
`);
  assert.equal(output, "engine-class-group-adapter-ok");
});

test("unconditional engine evidence replays its independent Minkowski stream", () => {
  const output = run(String.raw`
import copy
import hashlib
import json

from sagejs.number_fields.class_group_maps import class_group_from_engine_result
from sagejs.number_fields.class_group_proof import EXACT_UNCONDITIONAL
from sagejs.number_fields.factored_elements import FactoredNumberFieldElement

R = PolynomialRing(QQ, "x")
x = R.gen()
K = NumberField(x**2 + x + 11, "q")
O = K.maximal_order()
generator = K(2)
I = O.ideal(2)
witness = FactoredNumberFieldElement.from_element(K, generator)

def seal(payload):
    body = copy.deepcopy(payload)
    body.pop("content_sha256", None)
    text = json.dumps(body, allow_nan=False, ensure_ascii=True, separators=(",", ":"), sort_keys=True)
    body["content_sha256"] = hashlib.sha256(text.encode("utf-8")).hexdigest()
    return body

class SaturationProducer:
    def __init__(self):
        self.payload = seal({
            "schema": "sagejs.number-fields/class-unit-saturation-v1",
            "original_units": ["u0"],
            "required_primes": [2, 3],
            "class_primes": [2],
            "unit_primes": [3],
            "attempts": [
                {"schema": "sagejs.number-fields.unit-local-pth-obstruction.v1", "prime": 2, "outcome": "saturated", "method": "exact-local-obstruction", "quotient_targets": [1], "moduli": [2], "cap": 8},
                {"schema": "sagejs.number-fields.unit-pth-root-certificate.v1", "prime": 3, "outcome": "enlarged", "method": "exact-pth-root-identity", "root_coordinates": [[1, 1]], "exponent_vector": [1], "torsion_exponent": 0, "lattice_index_change": 3, "precision_history": [64, 128]},
            ],
            "index_bound": 6,
            "remaining_index_bound": 1,
            "index_bound_is_rigorous": True,
            "index_enlargement": 6,
            "unresolved_primes": [],
            "units": [[[1, 1]]],
            "precision_history": [64, 128],
            "rigorous": True,
            "complete": True,
            "saturated": True,
            "reason": "exact p-saturation",
            "status": "exact-unit-p-saturation",
            "proof_status": "exact-unit-p-saturation",
            "incomplete_reason": None,
            "analytic_validation": {"content_sha256": "analytic-hash"},
        })
    def to_dict(self): return copy.deepcopy(self.payload)
    def verify(self, field, order, original_units, analytic_validation=None):
        return field is K and order is O and tuple(original_units) == ("u0",) and analytic_validation == "analytic-artifact"

SATURATION = SaturationProducer()
ideal_payload = I.to_dict()
fingerprint = {
    "field_order_fingerprint": ideal_payload["field_order_fingerprint"],
    "basis": ideal_payload["basis"],
}
raw_record = {
    "index": 0,
    "norm": 4,
    "coordinates": [],
    "ideal": ideal_payload,
    "witness": witness.to_dict(),
}
progress_record = seal({
    "schema": "sagejs.number-fields.minkowski-proof-progress-record.v1",
    "index": 0,
    "prime_fingerprint": fingerprint,
    "evidence": raw_record,
})
plan_hash = "4" * 64
partition0 = seal({
    "schema": "sagejs.number-fields.minkowski-proof-partition.v1",
    "plan_sha256": plan_hash,
    "partition_index": 0,
    "partition_count": 2,
    "total_items": 1,
    "records": [progress_record],
})
partition1 = seal({
    "schema": "sagejs.number-fields.minkowski-proof-partition.v1",
    "plan_sha256": plan_hash,
    "partition_index": 1,
    "partition_count": 2,
    "total_items": 1,
    "records": [],
})
PROGRESS = seal({
    "schema": "sagejs.number-fields.minkowski-proof-progress.v1",
    "theorem": "Minkowski ideal-class theorem",
    "bound": [4, 1],
    "prime_fingerprints": [fingerprint],
    "dependency_hashes": {
        "relations": "1" * 64,
        "presentation": "2" * 64,
        "generators": "3" * 64,
        "saturation": SATURATION.payload["content_sha256"],
    },
    "partition_count": 2,
    "partitions": [partition0, partition1],
    "plan_sha256": plan_hash,
    "complete": True,
    "completed_items": 1,
})

class MatrixPresentation:
    invariants = ()
    order = 1
    free_rank = 0
    def verify(self, *_args): return True

class EngineGroup:
    proof_status = EXACT_UNCONDITIONAL
    factor_base_theorem = "Minkowski ideal-class theorem"
    _presentation = MatrixPresentation()
    def __init__(self): self._order = O
    def invariants(self): return ()
    def gens_ideals(self): return ()
    def representative_ideal(self, coordinates):
        assert tuple(coordinates) == ()
        return O.ideal(1)
    def discrete_log(self, ideal):
        assert ideal == I
        return ((), witness)
    def verify(self): return True

class Stage:
    def __init__(self, name, state, details): self.name, self.state, self.details = name, state, details

class EngineResult:
    complete = True
    proof_status = EXACT_UNCONDITIONAL
    algorithm = "minkowski"
    diagnostics = {"factor_base_bound": 0, "relations": 0, "unconditional_prime_records": (raw_record,)}
    stages = (
        Stage("analytic-index", "complete", {"rigorous": True, "lower_index": 1, "upper_index": 1}),
        Stage("unconditional-proof", "complete", {"theorem": "Minkowski", "bound": 4, "prime_ideals": 1}),
        Stage("proof", "complete", {"proof_status": EXACT_UNCONDITIONAL, "minkowski_primes": 1, "exact_relations": 0}),
    )
    def __init__(self, progress=PROGRESS):
        self._group = EngineGroup()
        self.saturation_record = SATURATION
        self.saturation_original_units = ("u0",)
        self.analytic_validation = "analytic-artifact"
        self.proof_progress = progress
        self.proof_dependency_hashes = dict(progress["dependency_hashes"])
    def class_group(self): return self._group
    def verify_saturation_record(self, payload):
        return payload == self.saturation_record.to_dict() and self.saturation_record.verify(K, O, self.saturation_original_units, analytic_validation=self.analytic_validation)

C = class_group_from_engine_result(EngineResult())
assert C.order() == 1 and C.invariants() == ()
assert C(I).is_one()
answer = C.principality(I)
assert answer and answer.generator.evaluate() == generator and answer.verify(O)
assert C.is_principal(I, proof=True)
payload = C.proof_payload()
assert payload["proof_status"] == EXACT_UNCONDITIONAL
assert payload["bound"] == [4, 1] and len(payload["prime_records"]) == 1
assert payload["proof_progress"]["partition_count"] == 2
assert payload["saturation"]["index_bound"] == 6
assert C.verify_proof_payload(payload)
for path, value in (
    (("theorem",), "forged Minkowski theorem"),
    (("discriminant",), 2),
    (("bound", 0), 2),
    (("field_order_fingerprint", "discriminant"), 2),
    (("saturation", "complete"), False),
    (("saturation", "evidence", "attempts", 1, "root_coordinates"), [[[9, 1]]]),
    (("proof_progress", "partitions", 0, "records", 0, "index"), 1),
    (("proof_progress", "completed_items"), 0),
    (("proof_progress", "dependency_hashes", "relations"), "9" * 64),
    (("proof_progress", "dependency_hashes", "saturation"), "forged hash"),
    (("bound", 0), True),
    (("prime_records", 0, "coordinates", 0), True),
    (("proof_progress", "partition_count"), True),
    (("proof_progress", "completed_items"), True),
    (("bound", 0), 4.0),
    (("prime_records", 0, "coordinates", 0), 0.0),
    (("proof_progress", "partition_count"), 2.0),
):
    corrupted = copy.deepcopy(payload)
    target = corrupted
    for part in path[:-1]: target = target[part]
    target[path[-1]] = value
    assert not C.verify_proof_payload(corrupted)

for path, value in (
    (("theorem",), "M" * ((1 << 16) + 1)),
    (("theorem",), chr(0xD800)),
    (("discriminant",), 1 << 4097),
    (("prime_records",), [payload["prime_records"][0]] * 4097),
    (("proof_progress", "partitions"), [None] * 8193),
):
    corrupted = copy.deepcopy(payload)
    target = corrupted
    for part in path[:-1]: target = target[part]
    target[path[-1]] = value
    assert not C.verify_proof_payload(corrupted), path

assert not C.verify_proof_payload(payload, cancelled=lambda: True)

bad_progress = copy.deepcopy(PROGRESS)
bad_progress["partitions"][0]["records"][0]["index"] = 1
bad_progress["partitions"][0]["records"][0] = seal(bad_progress["partitions"][0]["records"][0])
bad_progress["partitions"][0] = seal(bad_progress["partitions"][0])
bad_progress = seal(bad_progress)
try:
    class_group_from_engine_result(EngineResult(bad_progress))
    raise AssertionError("reauthenticated non-covering partitions were accepted")
except (ArithmeticError, ValueError):
    pass

incomplete_progress = copy.deepcopy(PROGRESS)
incomplete_progress["complete"] = False
incomplete_progress["completed_items"] = 0
incomplete_progress["partitions"][0]["records"] = []
incomplete_progress["partitions"][0] = seal(incomplete_progress["partitions"][0])
incomplete_progress = seal(incomplete_progress)
try:
    class_group_from_engine_result(EngineResult(incomplete_progress))
    raise AssertionError("resumable incomplete partitions upgraded proof status")
except ArithmeticError:
    pass

print("engine-unconditional-proof-ok")
`);
  assert.equal(output, "engine-unconditional-proof-ok");
});

test("public unconditional groups replay prime schemas and direct Minkowski evidence", () => {
  const output = run(String.raw`
import copy

from sagejs.number_fields.class_group_maps import class_group_from_engine_result
from sagejs.number_fields.class_unit_groups import class_unit_context

R = PolynomialRing(QQ, "x")
x = R.gen()

# This cubic field completes deterministically on every release target while
# exercising the same authenticated prime-ideal and principal-witness schemas.
# A degree-six class-group search can legitimately exhaust its bounded public
# resource policy, so it is not a suitable mandatory cross-platform oracle.
for proof in (False, True):
    K3 = NumberField(x**3 + 4*x - 1, "b")
    C3 = K3.class_group(proof=proof)
    assert C3.order() == 2 and C3.proof_status == "exact-unconditional"
    payload3 = C3.proof_payload()
    assert C3.verify_proof_payload(payload3)
    assert payload3["proof_progress"]["complete"] is True
    assert payload3["proof_progress"]["completed_items"] == len(
        payload3["prime_records"]
    )
    assert all(
        record["ideal"]["schema"] == "sagejs.number-fields.prime-ideal.v1"
        for record in payload3["prime_records"]
    )
    corrupted = copy.deepcopy(payload3)
    corrupted["prime_records"][0]["ideal"]["schema"] = "unknown-schema"
    assert not C3.verify_proof_payload(corrupted)

payload3 = C3.proof_payload()
assert all(
    record["principal_witness"]["ideal"]["schema"]
    == "sagejs.number-fields.ideal.v1"
    for record in payload3["prime_records"]
)
bad_ideal = copy.deepcopy(payload3)
bad_ideal["prime_records"][0]["principal_witness"]["ideal"]["schema"] = (
    "unknown-ideal-schema"
)
assert not C3.verify_proof_payload(bad_ideal)

result3 = class_unit_context(K3, proof=True)
factor_stage = next(stage for stage in result3.stages if stage.name == "factor-base")
factor_stage.details["bound"] = 100_001
result3.diagnostics["factor_base_bound"] = 100_001
try:
    class_group_from_engine_result(result3)
    raise AssertionError("an unbounded direct Minkowski replay was accepted")
except ArithmeticError:
    pass

print("public-unconditional-replay-ok")
`);
  assert.equal(output, "public-unconditional-replay-ok");
});
