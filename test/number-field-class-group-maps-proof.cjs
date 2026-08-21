"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const root = join(__dirname, "..");
const fixture = join(
  root,
  "test",
  "fixtures",
  "number-field-class-group-maps-proof.json",
);
const sagejs =
  process.env.SAGEJS_TEST_EXECUTABLE ||
  join(root, "bin", process.platform === "win32" ? "sagejs.cmd" : "sagejs");

function run(source) {
  const result = spawnSync(sagejs, ["--python", "-"], {
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
