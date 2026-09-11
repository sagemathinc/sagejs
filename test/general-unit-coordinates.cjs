// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, writeFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");
const { pythonExecutable } = require("../tools/python-executable.cjs");
const root = join(__dirname, "..");

function run(source, python = false, timeout = 180000) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-unit-coordinates-"));
  try {
    const filename = join(directory, "check.py");
    writeFileSync(filename, source);
    const executable = python ? pythonExecutable() : process.execPath;
    const args = python ? ["-B", filename] : [join(root, "bin/sagejs-source.cjs"), "--python", filename];
    const result = spawnSync(executable, args, { cwd: root, encoding: "utf8", timeout,
      killSignal: "SIGKILL", maxBuffer: 8 * 1024 * 1024 });
    assert.equal(result.status, 0, result.error?.message || result.stderr || result.stdout);
    return result.stdout.trim();
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

test("same-source coordinate enclosure helper agrees with a CPython rational oracle", () => {
  const source = String.raw`
import ast
from fractions import Fraction
from itertools import permutations
from types import SimpleNamespace
class Endpoint(Fraction):
    def ceil(self): return -((-self.numerator)//self.denominator)
    def floor(self): return self.numerator//self.denominator
class Ball:
    def __init__(self, lower, upper=None):
        self.lower=Endpoint(lower)
        self.upper=Endpoint(lower if upper is None else upper)
        self.rigorous=True
    def contains_zero(self): return self.lower <= 0 <= self.upper
    def __add__(self, other): return Ball(self.lower+other.lower,self.upper+other.upper)
    def __neg__(self): return Ball(-self.upper,-self.lower)
    def __mul__(self, other):
        values=[a*b for a in (self.lower,self.upper) for b in (other.lower,other.upper)]
        return Ball(min(values),max(values))
    def __truediv__(self, other):
        assert not other.contains_zero()
        return self*Ball(1/other.upper,1/other.lower)
def determinant(rows, **ignored):
    answer=Ball(0)
    for p in permutations(range(len(rows))):
        term=Ball(1)
        for i,j in enumerate(p): term=term*rows[i][j]
        if sum(p[i]>p[j] for i in range(len(p)) for j in range(i+1,len(p)))%2: term=-term
        answer=answer+term
    return answer
analytic=SimpleNamespace(RealBall=Ball,_determinant_ball=determinant)
class UnitCoordinateCapabilityError(Exception): pass
tree=ast.parse(open(${JSON.stringify(join(root, "src/lib/sagejs/number_fields/unit_coordinates.py"))}).read())
body=[ast.ImportFrom(module="__future__",names=[ast.alias(name="annotations")],level=0)]
body += [n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=="_integer_log_solution"]
exec(compile(ast.fix_missing_locations(ast.Module(body=body,type_ignores=[])),"unit-coordinate-source","exec"))
assert _integer_log_solution([],[]) == ()
assert _integer_log_solution([[Ball(2),Ball(1)],[Ball(1),Ball(3)]],[Ball(5),Ball(-5)]) == (4,-3)
assert _integer_log_solution([[Ball(2),Ball(0),Ball(0)],[Ball(0),Ball(3),Ball(0)],[Ball(0),Ball(0),Ball(5)]],[Ball(-4),Ball(9),Ball(20)]) == (-2,3,4)
assert _integer_log_solution([[Ball(-1,1)]],[Ball(0)]) is None
assert _integer_log_solution([[Ball(1)]],[Ball(0,1)]) is None
assert _integer_log_solution([[Ball(1)]],[Ball(Fraction(3,4),Fraction(5,4))]) == (1,)
try: _integer_log_solution([[Ball(2)]],[Ball(1)])
except ArithmeticError: pass
else: raise AssertionError("noninteger solution accepted")
print("interval-oracle-ok")
`;
  assert.equal(run(source, true), "interval-oracle-ok");
});

test("generic rank-two and rank-three maps preserve compact authority and exact logs", { timeout: 600000 }, () => {
  const output = run(String.raw`
from sagejs.number_fields.factored_elements import FactoredNumberFieldElement as Factored
from sagejs.number_fields.unit_coordinates import UnitCoordinateCapabilityError, UnitCoordinateResourceError
from sagejs.number_fields.class_unit_context import ClassUnitProofState
R = PolynomialRing(QQ, "x")
x = R.gen()
for f, rank, proof in [(x**3-x**2-2*x+1,2,False),(x**4-x-1,2,False),(x**4-x**3-3*x**2+x+1,3,False)]:
    K = NumberField(f,"a")
    result = K.class_unit_group(proof=proof,algorithm="buchmann-hecke")
    factor=result.unit_group().gens()[0].factors()[0][0]
    coefficient=factor._coefficients[0]
    before=(int(coefficient._numerator),int(coefficient._denominator))
    try: coefficient._numerator=before[0]+1
    except (TypeError,AttributeError): pass
    assert (int(coefficient._numerator),int(coefficient._denominator))==before
    try: factor._coefficients[0]=QQ(12345)
    except (TypeError,AttributeError): pass
    assert factor._coefficients[0] is coefficient
    original_order=result.context.order
    original_basis=original_order._basis_rows
    changed_basis=[list(row) for row in original_basis]
    changed_basis[0]=[2*c for c in changed_basis[0]]
    original_order._basis_rows=changed_basis
    try: result.unit_coordinate_map()
    except UnitCoordinateCapabilityError: pass
    else: raise AssertionError("mutated pre-factory generic order accepted")
    original_order._basis_rows=original_basis
    M = result.unit_coordinate_map()
    assert M.proof_status == result.proof_status
    assert len(result.unit_group().gens()) == rank
    assert len(M.gens()) == rank+1
    for i,g in enumerate(M.gens()):
        expected=[0]*(rank+1)
        expected[i]=1
        assert M.log(g)==tuple(expected)
    coords = tuple([1,2,-3]+([1] if rank==3 else []))
    value = M.exp(coords)
    assert M.log(value) == coords
    assert not hasattr(M,"_workspace")  # No retained, caller-mutable trusted log cache.
    assert M.log(value) == coords
    assert M.log(K(1)) == (0,)*(rank+1)
    assert M.log(K(-1)) == (1,)+(0,)*rank
    huge = tuple([3,2**200,-2**180]+([0] if rank==3 else []))
    compact = M.factored_exp(huge)
    saved = Factored.evaluate
    def forbid(self): raise AssertionError("implicit expansion")
    Factored.evaluate = forbid
    try:
        assert M.log(compact) == (1,)+huge[1:]
        try: M.exp(huge)
        except UnitCoordinateResourceError: pass
        else: raise AssertionError("unbounded explicit expansion")
        unknown = Factored.from_element(K,K(2))
        try: M.log(unknown)
        except UnitCoordinateCapabilityError: pass
        else: raise AssertionError("unknown factored membership accepted")
    finally: Factored.evaluate = saved
    for bad in [(0,),(False,)+(0,)*rank,(0.5,)+(0,)*rank]:
        try: M.factored_exp(bad)
        except (TypeError,ValueError): pass
        else: raise AssertionError("invalid coordinates")
    for bad in [K(0),K(2),K(QQ(1)/2)]:
        try: M.log(bad)
        except ValueError: pass
        else: raise AssertionError("nonunit accepted")
    limited = result.unit_coordinate_map()
    try: limited.log(K(2**5000))
    except UnitCoordinateResourceError: pass
    else: raise AssertionError("ordinary size preflight omitted")
    hint_map = result.unit_coordinate_map()
    hint_value = hint_map.factored_exp(coords)
    hint_map._constructed[0] = (hint_value,(0,)*(rank+1))
    try: hint_map.log(hint_value)
    except UnitCoordinateCapabilityError: pass
    else: raise AssertionError("unchecked cache coordinate accepted")
    other = NumberField(f,"b")
    try: M.log(other(1))
    except TypeError: pass
    else: raise AssertionError("wrong field accepted")
    old_state=result.context.proof_state
    result.context._proof_state=None
    try: M.log(compact)
    except UnitCoordinateCapabilityError: pass
    else: raise AssertionError("changed context proof accepted")
    result.context._proof_state=old_state
    old_generators=result.unit_group().generators
    result.unit_group().generators=(Factored.from_element(K,K(2)),)+old_generators[1:]
    try: M.log(compact)
    except UnitCoordinateCapabilityError: pass
    else: raise AssertionError("changed basis accepted")
    result.unit_group().generators=old_generators
    result.complete = False
    for action in [lambda: M.gens(),lambda: M.log(compact),lambda: M.factored_exp(coords),lambda: M.exp(coords)]:
        try: action()
        except UnitCoordinateCapabilityError: pass
        else: raise AssertionError("changed authority accepted")
print("generic-maps-ok")
`, false, 540000);
  assert.equal(output, "generic-maps-ok");
});

test("rank-zero specialized replay includes torsion and rejects counterfeit evidence", { timeout: 180000 }, () => {
  const output = run(String.raw`
from sagejs.number_fields.unit_coordinates import UnitCoordinateCapabilityError
R = PolynomialRing(QQ,"x")
x = R.gen()
for f in [x**2+1,x**2+x+1]:
    K=NumberField(f,"z")
    result=K.class_unit_group(proof=True)
    M=result.unit_coordinate_map()
    w=result.unit_group().torsion.order
    assert len(M.gens())==1
    assert M.log(M.gens()[0])==(1,)
    original_order=result.context.order
    result.context._order=K.order(2*K.gen())
    assert result.context.order is not original_order
    try: result.unit_coordinate_map()
    except UnitCoordinateCapabilityError: pass
    else: raise AssertionError("substituted rank-zero order accepted")
    result.context._order=original_order
    original_basis=original_order._basis_rows
    original_order._basis_rows=K.order(2*K.gen())._basis_rows
    try: result.unit_coordinate_map()
    except UnitCoordinateCapabilityError: pass
    else: raise AssertionError("mutated pre-factory rank-zero order accepted")
    original_order._basis_rows=original_basis
    for t in range(w):
        assert M.log(M.exp((t,)))==(t,)
        assert M.log(M.factored_exp((t+w,)))==(t,)
    if w==4:
        norm_one_nonunit=(K(3)+4*K.gen())/5
        assert norm_one_nonunit.norm()==1
        try: M.log(norm_one_nonunit)
        except ValueError: pass
        else: raise AssertionError("nonintegral norm-one input accepted")
    class Fake:
        def verify(self): return True
    result.unit_group()._completion_evidence=Fake()
    try: M.log(K(1))
    except UnitCoordinateCapabilityError: pass
    else: raise AssertionError("counterfeit completion accepted")
print("rank-zero-ok")
`, false);
  assert.equal(output, "rank-zero-ok");
});
