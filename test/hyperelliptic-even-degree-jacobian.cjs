"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");

process.env.SAGEJS_HYPERELLIPTIC_AUTO_RECEIPT_POLICY = "off";

const { createSage } = require("../dist/tools/kernel.js");

const root = path.resolve(__dirname, "..");
const documentation = readFileSync(
  path.join(root, "docs/hyperelliptic-even-degree-jacobians.md"),
  "utf8",
);
const sageOracle = JSON.parse(
  readFileSync(
    path.join(
      root,
      "bench/hyperelliptic/oracles/even-degree-jacobian-sage.json",
    ),
    "utf8",
  ),
);

function documentedExample(name) {
  const expression = new RegExp(
    `<!-- tested-example:${name}:start -->\\n` +
      "```sage\\n([\\s\\S]*?)\\n```\\n" +
      `<!-- tested-example:${name}:end -->`,
  );
  const match = expression.exec(documentation);
  assert.ok(match, `missing documented example ${name}`);
  return match[1];
}

test(
  "split even-degree Sage vectors, cancellation, and full authority",
  { timeout: 120_000 },
  async () => {
    const session = await createSage();
    try {
      const result = await session.evaluate(`
import copy
R.<x> = GF(13)[]
H = HyperellipticCurve(x^8 + x + 1)
J = H.jacobian()
P = H([1,4]); Q = H([2,5])
D = J(P); E = J(Q)
assert J.model_kind() == "even-degree-split-two-infinity"
assert tuple(int(P0[1]) for P0 in J.infinity_points()) == (1,12)
assert str(D) == "(x + 12, 4 : 1)"
assert str(E) == "(x + 11, 5 : 1)"
assert str(J(P,Q)) == "(x^2 + 10*x + 2, 4*x : 1)"
assert J(P,Q) == D-E
assert J.point_to_divisor(P, basepoint=J.infinity_points()[1]) == (
    D-J(J.infinity_points()[1])
)
assert J(P,P) == J.zero()
assert D-D == J.zero()
assert D+(-D) == J.zero()
assert J(J.infinity_points()[0]) == J.zero()
assert J(J.infinity_points()[1]) != J.zero()
assert len(set(J(R(1),R(0),n) for n in range(4))) == 4
assert J(D.mumford_coordinates()) == D
assert copy.copy(D) == D
assert J.divisor_from_data(D.to_data()) == D
assert hash(J.divisor_from_data(D.to_data())) == hash(D)
try:
    D.uv()
    assert False
except NotImplementedError:
    pass
try:
    D._n = 0
    assert False
except (AttributeError, TypeError):
    pass
tampered = D.to_data()
tampered["infinity_weight"] = "0"
assert J.divisor_from_data(tampered) != D
tampered = D.to_data()
tampered["curve"]["infinity_values"] = ("12", "1")
try:
    J.divisor_from_data(tampered)
    assert False
except ValueError:
    pass
try:
    J(R(1), R(0), 4)
    assert False
except ValueError:
    pass
try:
    J(2*(x+12), R(4), 1)
    assert False
except ValueError as error:
    assert "monic" in str(error)
try:
    J(x+12, x+4, 1)
    assert False
except ValueError as error:
    assert "reduced" in str(error)
try:
    D.scalar_multiple(2, algorithm="native")
    assert False
except NotImplementedError:
    pass
assert J.prepared_arithmetic().capability() == {
    "available": False,
    "selected": "reference",
    "reason": "split-even-degree-reference-only",
    "model_kind": "even-degree-split-two-infinity",
    "schema": None,
}
prepared = J.prepared_arithmetic()
assert prepared.add_batch([D,E],[E,D]) == [D+E,D+E]
assert prepared.scalar_batch([D,E],[3,-2]) == [3*D,-2*E]
assert prepared.sum([D,E,-D,-E]).is_zero()
split_module = __import__(
    "sagejs.hyperelliptic_curves.jacobian_split",
    fromlist=["SplitMumfordDivisor"],
)
original_element_class = split_module.SplitMumfordDivisor
split_module.SplitMumfordDivisor = object
try:
    assert D+E == E+D
    assert J(D.mumford_coordinates()) == D
finally:
    split_module.SplitMumfordDivisor = original_element_class
[D,E,J(P,Q),D-D]
`);
      assert.equal(
        result.repr,
        "[(x + 12, 4 : 1), (x + 11, 5 : 1), " +
          "(x^2 + 10*x + 2, 4*x : 1), (1, 0 : 2)]",
      );
    } finally {
      await session.close();
    }
  },
);

test("pinned SageMath split oracle replays exactly", async () => {
  assert.equal(
    sageOracle.schema,
    "sagejs.hyperelliptic-even-degree-sage-oracle.v1",
  );
  assert.equal(sageOracle.source.upstream_merge_commit, "3f60901");
  const session = await createSage();
  try {
    const result = await session.evaluate(`
import json
rows=[]
R.<x> = GF(101)[]
H = HyperellipticCurve(x^8+x+1); J=H.jacobian(); P=H([3,0])
D=J(P,P); rows.append({"name":"sage-pr-42373-point-minus-itself","repr":str(D),"is_zero":D.is_zero()})
R.<x> = GF(13)[]
H=HyperellipticCurve(x^8+x+1); J=H.jacobian(); P=H([1,4]); Q=H([2,5])
for name,D in (("genus3-point-P",J(P)),("genus3-point-Q",J(Q)),("genus3-point-difference",J(P,Q))):
    rows.append({"name":name,"repr":str(D),"is_zero":D.is_zero()})
R.<x> = GF(7)[]
J=HyperellipticCurve(x^5-x^4+x^2-x,x^3+1).jacobian()
D=J(x^2+x,0)+J(x^2,-x)
rows.append({"name":"genus2-generalized-sum","repr":str(D),"is_zero":D.is_zero()})
D=-D
rows.append({"name":"genus2-generalized-negation","repr":str(D),"is_zero":D.is_zero()})
J=HyperellipticCurve(x^8+3*x+2).jacobian()
A=J(x^2+4*x+3,2*x+2,1); B=J(x^3+6*x^2+6*x,6*x^2+6*x+3,0); D=A+B
rows.append({"name":"genus3-balanced-addition","repr":str(D),"is_zero":D.is_zero()})
R.<x> = GF(3)[]; order2=HyperellipticCurve(x^6+x+2).jacobian().order()
R.<x> = GF(5)[]; order3=HyperellipticCurve(x^8+x+1).jacobian().order()
json.dumps({"rows":rows,"orders":{"genus2-gf3":int(order2),"genus3-gf5":int(order3)}},sort_keys=True)
`);
    const observed = JSON.parse(result.repr.slice(1, -1));
    assert.deepEqual(observed.rows, sageOracle.rows);
    assert.deepEqual(observed.orders, sageOracle.orders);
  } finally {
    await session.close();
  }
});

test(
  "generalized split equations use balanced reduction and negation",
  { timeout: 120_000 },
  async () => {
    const session = await createSage();
    try {
      const result = await session.evaluate(`
R.<x> = GF(7)[]
f = x^5 - x^4 + x^2 - x
h = x^3 + 1
H = HyperellipticCurve(f,h)
J = H.jacobian()
D1 = J(x^2+x,0)
D2 = J(x^2,-x)
assert tuple(int(P[1]) for P in J.infinity_points()) == (0,6)
assert D1+D2 == J(x^2+2*x+4,x+4,0)
assert -(D1+D2) == J(x^2+2*x+4,6*x+1,0)
assert (D1+D2)-(D1+D2) == J.zero()

R3.<z> = GF(7)[]
H3 = HyperellipticCurve(z^8+3*z+2)
J3 = H3.jacobian()
A = J3(z^2+4*z+3,2*z+2,1)
B = J3(z^3+6*z^2+6*z,6*z^2+6*z+3,0)
assert A+B == J3(z^3+4*z^2+2*z+5,2*z^2+3*z+5,0)
assert A-A == J3.zero()
[D1+D2,-(D1+D2),A+B]
`);
      assert.equal(
        result.repr,
        "[(x^2 + 2*x + 4, x + 4 : 0), " +
          "(x^2 + 2*x + 4, 6*x + 1 : 0), " +
          "(z^3 + 4*z^2 + 2*z + 5, 2*z^2 + 3*z + 5 : 0)]",
      );
    } finally {
      await session.close();
    }
  },
);

test(
  "small split Jacobians exhaustively satisfy the group contract",
  { timeout: 180_000 },
  async () => {
    const session = await createSage();
    try {
      const result = await session.evaluate(`
import json
R.<x> = GF(3)[]
H = HyperellipticCurve(x^6+x+2)
J = H.jacobian()
elements = J.points(max_elements=1000,max_candidates=100000)
assert len(elements) == J.order() == 13
assert len(set(elements)) == 13
for A in elements:
    assert A-A == J.zero()
    assert A+(-A) == J.zero()
    assert J(A.mumford_coordinates()) == A
    assert J.divisor_from_data(A.to_data()) == A
for A in elements:
    for B in elements:
        assert A+B in J
        assert A+B == B+A
        for C in elements:
            assert (A+B)+C == A+(B+C)
assert J.group_structure(algorithm="exhaustive") == (13,)
invariants, certificate = J.group_structure(
    certificate=True,
    max_random_elements=30,
    max_group_operations=100000,
    max_baby_steps=10000,
    max_memory_bytes=10000000,
    seed=7,
)
assert invariants == (13,)
assert certificate["algorithms"]["group_law"] == (
    "balanced-cantor-even-split.v1"
)
assert J.verify_group_structure_certificate(certificate)
assert J.verify_group_structure_certificate(json.loads(json.dumps(certificate)))
G, phi = J.abelian_group(algorithm="exhaustive", seed=7)
assert G.invariants() == (13,)
assert phi.verify()
assert all(phi.preimage(phi(k*G.gen(0))) == k*G.gen(0) for k in range(13))
generator = J.random_element(seed=9)
order_certificate = generator.order_certificate(algorithm="reference")
assert J.verify_order_certificate(order_certificate)
(len(elements), invariants, generator.order(algorithm="reference"))
`);
      assert.match(result.repr, /^\(13, \(13,\), (1|13)\)$/);
    } finally {
      await session.close();
    }
  },
);

test(
  "genus-3 split enumeration and deterministic operation trees are exact",
  { timeout: 180_000 },
  async () => {
    const session = await createSage();
    try {
      const result = await session.evaluate(`
R.<x> = GF(5)[]
H = HyperellipticCurve(x^8+x+1)
J = H.jacobian()
elements = J.points(max_elements=1000,max_candidates=100000)
assert len(elements) == J.order() == 284
sample = elements[:12]
for A in sample:
    assert A-A == J.zero()
    for B in sample:
        assert A+B == B+A
        for C in sample[:6]:
            assert (A+B)+C == A+(B+C)
assert all((284*A).is_zero() for A in sample)
(len(elements),len(set(elements)))
`);
      assert.equal(result.repr, "(284, 284)");
    } finally {
      await session.close();
    }
  },
);

test("unsupported models and cross-parent data fail closed", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(`
R.<x> = GF(5)[]
try:
    HyperellipticCurve(2*x^6+x+1).jacobian()
    assert False
except NotImplementedError as error:
    assert "inert infinity" in str(error)
H = HyperellipticCurve(x^6+x+1)
J1 = H.jacobian(); J2 = H.jacobian()
D = J1(H([0,1]))
try:
    J2(D)
    assert False
except ValueError as error:
    assert "different parent" in str(error)
try:
    J1.height_pairing([D])
    assert False
except NotImplementedError as error:
    assert "split even-degree" in str(error)
for operation in (
    lambda: D.canonical_height(),
    lambda: J1.rational_two_torsion(),
    lambda: J1.torsion_bound(),
    lambda: J1.regulator([D]),
    lambda: J1.saturate([D]),
):
    try:
        operation()
        assert False
    except NotImplementedError as error:
        assert "split even-degree" in str(error)
R2.<t> = GF(2)[]
H2 = HyperellipticCurve(t^6+t+1,t^3+t+1)
try:
    H2.jacobian()
    assert False
except NotImplementedError as error:
    assert "characteristic-2" in str(error)
RQ.<q> = QQ[]
try:
    HyperellipticCurve(q^6+q+1).jacobian()
    assert False
except NotImplementedError as error:
    assert "odd prime field" in str(error)
J17 = J1.change_ring(GF(17))
assert J17.model_kind() == "even-degree-split-two-infinity"
assert tuple(int(P[1]) for P in J17.infinity_points()) == (1,16)
True
`);
    assert.equal(result.repr, "True");
  } finally {
    await session.close();
  }
});

for (const name of ["basic", "group"]) {
  test(`documentation example ${name} executes verbatim`, async () => {
    const session = await createSage();
    try {
      const result = await session.evaluate(documentedExample(name));
      assert.equal(result.repr, "True");
    } finally {
      await session.close();
    }
  });
}
