"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

test("finite reductions certify S-saturation without claiming rank", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      String.raw`
import json
from sagejs.hyperelliptic_curves.saturation import (
    reduction_constraint,
    saturate_subgroup,
    verify_reduction_constraint,
)

class ToyPoint:
    def __init__(self, parent, coordinates):
        self._parent = parent
        self.coordinates = tuple(QQ(value) for value in coordinates)
    def parent(self):
        return self._parent
    def __add__(self, other):
        return ToyPoint(self._parent, [a+b for a,b in zip(self.coordinates, other.coordinates)])
    def __sub__(self, other):
        return self + (-other)
    def __neg__(self):
        return ToyPoint(self._parent, [-value for value in self.coordinates])
    def __rmul__(self, scalar):
        return ToyPoint(self._parent, [scalar*value for value in self.coordinates])
    def __mul__(self, scalar):
        return scalar*self
    def __eq__(self, other):
        return isinstance(other, ToyPoint) and self._parent is other._parent and self.coordinates == other.coordinates
    def is_zero(self):
        return all(value == 0 for value in self.coordinates)
    def __repr__(self):
        return "ToyPoint" + repr(self.coordinates)

class ToyJacobian:
    def __init__(self, dimension):
        self.dimension = dimension
    def zero(self):
        return ToyPoint(self, [0 for _ in range(self.dimension)])
    def __call__(self, point):
        if isinstance(point, ToyPoint) and point.parent() is self:
            return point
        return ToyPoint(self, point)

constraint = reduction_constraint(2, 3, (4, 12), ((1, 3), (1, 5)))
assert constraint["equation_rows"] == ((1,1), (1,1))
assert constraint["equation_rank"] == 1
assert constraint["kernel_basis"] == ((1,1),)
assert verify_reduction_constraint(constraint)
assert verify_reduction_constraint(json.loads(json.dumps(constraint)))

J = ToyJacobian(2)
P = J((1,0))
Q = J((0,1))
def reductions(jacobian, basis, prime):
    if prime == 3:
        return {"invariants": (2,), "point_coordinates": ((1,), (1,))}
    return {"invariants": (2,), "point_coordinates": ((0,), (1,))}

S = saturate_subgroup(
    J,
    (P,Q),
    primes=(2,),
    reduction_primes=(3,5),
    reduction_provider=reductions,
    independence_certificate={"proved": True, "source": "exact toy basis"},
)
assert S.s_saturated_primes == (2,)
assert S.ambient_saturated_primes == (2,)
assert S.free_quotient_saturated_primes == ()
assert not S.rank_status["full_rank_proved"]
assert not S.global_saturation_proved
assert not S.full_mordell_weil_group_proved
assert S.prime_results[0]["status"] == "ambient_subgroup_saturated_torsion_unresolved"
assert S.verify()
payload = S.to_dict()
assert payload["schema"] == "sagejs.hyperelliptic.saturation-result.v1"
assert json.loads(json.dumps(payload))["rank_status"]["analytic_rank_used"] is False

Sfree = saturate_subgroup(
    J,
    (P,Q),
    primes=(2,),
    reduction_primes=(3,5),
    reduction_provider=reductions,
    independence_certificate={"proved": True, "source": "exact toy basis"},
    algebraic_rank=2,
    algebraic_rank_provenance={"proved": True, "source": "2-Selmer computation"},
    torsion_order=1,
    torsion_provenance={"proved": True, "source": "certified reductions"},
    global_index_bound=2,
    global_index_bound_provenance={"proved": True, "source": "height bound"},
)
assert Sfree.free_quotient_saturated_primes == (2,)
assert Sfree.rank_status["full_rank_proved"]
assert Sfree.global_saturation_proved
assert Sfree.full_mordell_weil_group_proved
assert Sfree.global_status["required_primes"] == (2,)
True`,
    );
    assert.equal(result.repr, "True");
  } finally {
    await session.close();
  }
});

test("exact small-prime division records an index chain", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      String.raw`
import json
from sagejs.hyperelliptic_curves.saturation import saturate_subgroup

class ToyPoint:
    def __init__(self, parent, value):
        self._parent = parent
        self.value = QQ(value)
    def parent(self):
        return self._parent
    def __add__(self, other):
        return ToyPoint(self._parent, self.value + other.value)
    def __sub__(self, other):
        return ToyPoint(self._parent, self.value - other.value)
    def __neg__(self):
        return ToyPoint(self._parent, -self.value)
    def __rmul__(self, scalar):
        return ToyPoint(self._parent, scalar*self.value)
    def __mul__(self, scalar):
        return scalar*self
    def __eq__(self, other):
        return isinstance(other, ToyPoint) and self._parent is other._parent and self.value == other.value
    def is_zero(self):
        return self.value == 0
    def __repr__(self):
        return "ToyPoint(" + str(self.value) + ")"

class ToyJacobian:
    def zero(self):
        return ToyPoint(self, 0)
    def __call__(self, point):
        if isinstance(point, ToyPoint) and point.parent() is self:
            return point
        return ToyPoint(self, point)

J = ToyJacobian()
Q = J(1)
P = Q.__rmul__(2)
result = saturate_subgroup(
    J,
    (P,),
    primes=(2,),
    division_candidates={2: (Q,)},
    independence_certificate={"proved": True, "source": "exact toy lattice"},
    algebraic_rank=1,
    algebraic_rank_provenance={"proved": True, "source": "descent"},
    exact_subgroup_index=2,
    exact_subgroup_index_provenance={"proved": True, "source": "oracle lattice"},
    torsion_order=1,
    torsion_provenance={"proved": True, "source": "certified reductions"},
)
assert result.basis == (Q,)
assert result.index_factor_from_input == 2
assert len(result.basis_steps) == 1
step = result.basis_steps[0]
assert step["old_basis_from_new"] == ((2,),)
assert step["index_factor"] == 2
assert result.global_status["remaining_index_bound"] == 1
assert result.global_saturation_proved
assert result.full_mordell_weil_group_proved
assert result.verify()
payload = result.to_dict()
assert "_old_basis" not in payload["basis_steps"][0]
assert "_new_basis" not in payload["basis_steps"][0]
json.dumps(payload)
True`,
    );
    assert.equal(result.repr, "True");
  } finally {
    await session.close();
  }
});

test("bounds and resource exits retain proof provenance", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      String.raw`
from sagejs.hyperelliptic_curves.saturation import (
    index_bound_from_height,
    index_bound_from_regulator,
    saturate_subgroup,
)

regulator = index_bound_from_regulator(
    QQ(100), QQ(4), provenance={"proved": True, "source": "rigorous balls"}
)
assert regulator["value"] == 5
height = index_bound_from_height(
    QQ(100), QQ(2), 2, QQ(2),
    provenance={"proved": True, "source": "height lower-bound theorem"},
)
assert height["value"] == 10
try:
    index_bound_from_regulator(QQ(100), QQ(4), provenance={"proved": False})
    assert False
except ValueError:
    pass

class Point:
    def __init__(self, parent, value):
        self._parent = parent
        self.value = QQ(value)
    def parent(self):
        return self._parent
    def __add__(self, other):
        return Point(self._parent, self.value + other.value)
    def __sub__(self, other):
        return Point(self._parent, self.value - other.value)
    def __neg__(self):
        return Point(self._parent, -self.value)
    def __rmul__(self, scalar):
        return Point(self._parent, scalar*self.value)
    def __eq__(self, other):
        return isinstance(other, Point) and other._parent is self._parent and other.value == self.value
    def __repr__(self):
        return "Point(" + str(self.value) + ")"

class Group:
    def zero(self):
        return Point(self, 0)
    def __call__(self, value):
        return value if isinstance(value, Point) else Point(self, value)

J = Group()
P = J(1)
limited = saturate_subgroup(
    J,
    (P,),
    primes=(2,),
    independence_certificate={"proved": True, "source": "exact"},
    max_division_vectors=0,
)
assert limited.prime_results[0]["status"] == "resource_limit"
assert limited.prime_results[0]["resource_limit"]["diagnostics"]["kernel_dimension"] == 1
assert not limited.global_saturation_proved

unproved_rank = saturate_subgroup(
    J,
    (P,),
    algebraic_rank=1,
    algebraic_rank_provenance={"proved": False, "source": "analytic rank only"},
    independence_certificate={"proved": True, "source": "exact"},
    exact_subgroup_index=1,
    exact_subgroup_index_provenance={"proved": True, "source": "conditional input"},
)
assert not unproved_rank.rank_status["full_rank_proved"]
assert unproved_rank.rank_status["analytic_rank_used"] is False
assert not unproved_rank.global_saturation_proved
True`,
    );
    assert.equal(result.repr, "True");
  } finally {
    await session.close();
  }
});
