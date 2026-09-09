// sagejs-test-tier: specialized
"use strict";
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { readFileSync, writeFileSync, mkdtempSync, rmSync } = require("node:fs");
const { resolve, join } = require("node:path");
const { tmpdir } = require("node:os");
const test = require("node:test");
const { pythonExecutable } = require("../tools/python-executable.cjs");
const { conditionalSource } = require("../bench/class-unit-groups/diagnose-cubic-conditional-build.cjs");
const { compileKernel } = require("../tools/native-kernel/compiler.cjs");

test("pruned source-copy cursor preserves all pause boundaries and exact point order", t => {
  const source = readFileSync(resolve(__dirname, "../src/lib/sagejs/number_fields/cubic_class_number_native.py"), "utf8");
  const candidate = conditionalSource(source);
  const result = spawnSync(pythonExecutable(), ["-c", String.raw`
import ast, importlib.util, itertools, json, math, sys
from types import SimpleNamespace
spec = importlib.util.spec_from_file_location('fp', sys.argv[1])
fp = importlib.util.module_from_spec(spec); spec.loader.exec_module(fp)
sources = json.load(sys.stdin)
name = '_cubic_append_reduced_ideal_ellipsoid'
old = next(n for n in ast.parse(sources[0]).body if isinstance(n,ast.FunctionDef) and n.name==name)
new = next(n for n in ast.parse(sources[1]).body if isinstance(n,ast.FunctionDef) and n.name==name)
assert ast.dump(old.args) == ast.dump(new.args)
# Every admission, cap, online/fatal, and return statement is literally retained.
old_while = next(n for n in old.body if isinstance(n,ast.While))
new_while = next(n for n in new.body if isinstance(n,ast.While))
assert ast.dump(old_while.body[-1]) == ast.dump(new_while.body[-1])
assert ast.dump(old.body[-1]) == ast.dump(new.body[-1])
functions = [n for n in ast.parse(sources[1]).body if isinstance(n,ast.FunctionDef)
             and n.name in {name, '_cubic_conditional_centered_value'}]
ns = {'checked_uint64':int, '_cubic_floor_sqrt':math.isqrt,
      '_CUBIC_REDUCED_ENUMERATION_MAX_CANDIDATES':500}
exec('from __future__ import annotations\n'+'\n'.join(ast.unparse(n) for n in functions),ns)
choose=ns['_cubic_conditional_centered_value']
for lo in range(-6,7):
    for hi in range(lo,7):
        for numerator in range(-8,9):
            for denominator in [1,2,3]:
                expected=list(fp.centered_order(lo,hi,fp.Q(numerator,denominator)))
                actual=[choose(lo,hi,numerator,denominator,i) for i in range(hi-lo+1)]
                assert sorted(actual)==list(range(lo,hi+1))
                assert actual==expected

class Scenario:
    def __init__(self,g,bound,lower=0,capacity=9999,target=9999,online=False,close=9999,candidates=0,fatal=False):
        self.g,self.bound,self.lower=g,bound,lower
        self.capacity,self.target,self.online,self.close,self.fatal=capacity,target,online,close,fatal
        a,b,c,d,e,f=g;det=a*(d*f-e*e)-b*(b*f-c*e)+c*(b*e-c*d)
        self.limits=tuple(fp.ceil_root(fp.Q(bound*t,det),2) for t in (d*f-e*e,a*f-c*c,a*d-b*b))
        self.size=math.prod(2*n+1 for n in self.limits)
        self.parameters={(0,i):v for i,v in enumerate((*g,bound,*self.limits,0))}
        self.state=(0,candidates,0,0,*(-v for v in self.limits))
        self.trace=[];self.accepted=[];self.rows=[];self.updates=[]
    def candidate(self,*args):
        point=tuple(args[-4:-1]);self.trace.append(point)
        assert 0<fp.quadratic(self.g,point)<=self.bound
        assert next(v for v in reversed(point) if v)>0
        good=math.gcd(*point)==1 and fp.quadratic(self.g,point)>self.lower
        if good:self.accepted.append(point)
        return int(good),*point
    def append(self,*args):
        count=args[4];point=tuple(args[8:11])
        # Controlled rejection/duplicate behavior, not a mathematical oracle.
        key=(abs(point[0]),point[1],point[2])
        if sum(point)%3 and key not in self.rows:self.rows.append(key);return count+1
        return count
    def update(self,*args):
        row=args[-2];self.updates.append(row)
        if self.fatal:return -1
        return 2 if row+1>=self.close else 1
    def advance(self,budget):
        ns.update(_cubic_reduced_ellipsoid_candidate=self.candidate,
                  _cubic_append_smooth_principal_relation=self.append,
                  _cubic_online_relation_lattice_update=self.update,
                  _cubic_modular_relation_collection_complete=lambda w,c,t,f:c>=t)
        search=SimpleNamespace(**dict.fromkeys(('integers','transforms','relations','elements',
            'hnf_source','hnf_result','online_basis','online_source','online_hnf','support','membership')))
        count,candidates,online_count,status,x,y,z=self.state
        before=self.position()
        self.state=ns[name](search,None,0,0,self.parameters,0,count,self.capacity,1,1,self.target,
            True,self.online,online_count,status,x,y,z,candidates,budget,self.lower)
        assert 0<=self.position()-before<=budget
    def position(self):
        x,y,z=self.state[-3:];l0,l1,l2=self.limits
        return ((z+l2)*(2*l1+1)+y+l1)*(2*l0+1)+x+l0
    def snapshot(self):return self.state,list(self.trace),list(self.accepted),list(self.rows),list(self.updates)
cases=0
for g,bound in [((1,0,0,1,0,1),5),((2,1,-1,3,1,4),9),((1,2,-2,5,-3,6),7)]:
    for options in [{},{'lower':3},{'target':2},{'online':True,'close':2},
                    {'capacity':1},{'candidates':499},{'online':True,'fatal':True}]:
        full=Scenario(g,bound,**options);full.advance(full.size)
        if not options:assert full.accepted==list(fp.integer_points(g,bound))
        for split in range(full.size+1):
            paused=Scenario(g,bound,**options)
            before=paused.snapshot();paused.advance(0);assert paused.snapshot()==before
            paused.advance(split)
            if paused.state[0]<=paused.capacity and paused.state[3]>=0:paused.advance(full.size)
            assert paused.snapshot()==full.snapshot(),(g,options,split)
            cases+=1
    full=Scenario(g,bound);full.advance(full.size)
    staged=Scenario(g,bound,target=1);staged.advance(staged.size)
    staged.target=9999
    while staged.position()<staged.size:staged.advance(1)
    assert staged.snapshot()==full.snapshot()
    huge=2**300+17
    scaled=Scenario(tuple(v*huge for v in g),bound*huge);scaled.advance(scaled.size)
    assert scaled.snapshot()==full.snapshot()
print(cases,'pause splits, point order, 300-bit scaling, admission-tail identity, caps/fatal/closure passed')
`, resolve(__dirname, "../bench/class-unit-groups/diagnose-cubic-exact-fp.py")], {
    input: JSON.stringify([source,candidate]), encoding: "utf8", timeout: 60_000,
  });
  assert.equal(result.status, 0, `${result.error || ""}\n${result.stdout}\n${result.stderr}`);
  t.diagnostic(result.stdout.trim());
});

test("conditional cursor runs identically in CPython, JavaScript, GMP and fmpz", {
  timeout: 180_000,
}, async t => {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-conditional-cursor-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const source = conditionalSource(readFileSync(resolve(__dirname, "../src/lib/sagejs/number_fields/cubic_class_number_native.py"), "utf8"));
  const functionSource = name => {
    const start = source.indexOf(`def ${name}(`);
    const end = source.indexOf("\ndef ", start + 5);
    assert.ok(start >= 0 && end > start);
    return source.slice(start, end).replace(/\n+@native\s*$/, "");
  };
  const signature = name => {
    const text = functionSource(name);
    return text.slice(0, text.indexOf(":\n") + 2);
  };
  const schemaStart = source.indexOf("class CubicSearchWorkspace(");
  const schemaEnd = source.indexOf("def _cubic_conditional_centered_value(");
  const fixture = `from sagejs.native import native, uint64, checked_uint64, UInt64Buffer, IntegerBuffer, NativeIntegerVector, NativeExactArena, NativeWorkspace
from sagejs.ffi.flint import FmpzMatrix, fmpz_matrix

${source.slice(schemaStart,schemaEnd)}
_CUBIC_REDUCED_ENUMERATION_MAX_CANDIDATES = 500

${functionSource("_cubic_ceil_sqrt")}
${functionSource("_cubic_floor_sqrt")}
${functionSource("_cubic_conditional_centered_value")}

${signature("_cubic_reduced_ellipsoid_candidate")}
    workspace[0] += 1
    workspace[1] = (workspace[1] * 131 + coefficient_zero + 9 + 19 * (coefficient_one + 9) + 361 * (coefficient_two + 9)) % 1000000007
    if (coefficient_zero + 3 * coefficient_one + 7 * coefficient_two) % 4 == 1:
        return (0, 0, 0, 0)
    return (1, coefficient_zero, coefficient_one, coefficient_two)

${signature("_cubic_append_smooth_principal_relation")}
    if coordinate_zero > 0:
        return relation_count + 1
    return relation_count

${signature("_cubic_modular_relation_collection_complete")}
    return relation_count >= relation_target

${signature("_cubic_online_relation_lattice_update")}
    support[0, 10] = support[0, 10] + relation_row + 1
    return 1

${functionSource("_cubic_append_reduced_ideal_ellipsoid")}

@native
def conditional_witness(plan: IntegerBuffer, modular: UInt64Buffer, budget: uint64, initial: uint64, capacity: uint64, temporary_limit: uint64) -> int:
    with NativeExactArena(1048576, temporary_limit) as arena:
        workspace = arena.integer_vector(2, 0)
        matrix = arena.foreign_resource(fmpz_matrix, 1, 11)
        index: uint64 = 0
        while index < 10:
            matrix[0, index] = plan[index]
            index += 1
        search = CubicSearchWorkspace(workspace, matrix, matrix, matrix, matrix,
            matrix, matrix, matrix, matrix, matrix, matrix, matrix, matrix)
        x = -matrix[0, 7]
        y = -matrix[0, 8]
        z = -matrix[0, 9]
        count: uint64 = 0
        candidates: uint64 = initial
        online_count: uint64 = 0
        online_status = 0
        target: uint64 = 3
        active_budget: uint64 = 0
        while z <= matrix[0, 9] and count <= capacity:
            count, candidates, online_count, online_status, x, y, z = _cubic_append_reduced_ideal_ellipsoid(
                search, modular, 0, 0, matrix, 0, count, capacity, 1, 1, target,
                True, True, online_count, online_status, x, y, z, candidates, active_budget, 0,
            )
            active_budget = budget
            if count >= target:
                target = 10000
        return workspace[1] + 1000000007 * (workspace[0] + 1000 * (candidates + 1000 * (count + 10002 * (online_count + 1000 * matrix[0, 10]))))
`;
  const cases = [];
  for (const scale of [1n, 2n ** 300n + 17n]) {
    const plan = [2n,1n,-1n,3n,1n,4n,9n].map(v=>v*scale).concat([3n,3n,2n]);
    for (const initial of [0n,499n]) for (const capacity of [2n,10000n])
      for (const budget of [1n,7n,10000n]) cases.push({ plan:plan.map(String),initial:String(initial),capacity:String(capacity),budget:String(budget) });
  }
  const oracle = spawnSync(pythonExecutable(), ["-c", String.raw`
import ast,collections,json,sys
data=json.load(sys.stdin);tree=ast.parse(data['source'])
tree.body=[n for n in tree.body if not isinstance(n,(ast.Import,ast.ImportFrom))]
class Workspace:
    def __init__(self,*args):
        assert len(args)==len(type(self).__annotations__)
        for name,value in zip(type(self).__annotations__,args):setattr(self,name,value)
class Arena:
    def __init__(self,*args):pass
    def __enter__(self):return self
    def __exit__(self,*args):pass
    def integer_vector(self,n,value):return [value]*n
    def foreign_resource(self,*args):return collections.defaultdict(int)
ns=dict(native=lambda f:f,checked_uint64=int,NativeWorkspace=Workspace,NativeExactArena=Arena,fmpz_matrix=None)
exec('from __future__ import annotations\n'+ast.unparse(tree),ns)
print(json.dumps([str(ns['conditional_witness'](list(map(int,c['plan'])),[0],int(c['budget']),int(c['initial']),int(c['capacity']),3145728)) for c in data['cases']]))
`], {input:JSON.stringify({source:fixture,cases}),encoding:"utf8",timeout:60_000});
  assert.equal(oracle.status,0,`${oracle.error||""}\n${oracle.stderr}`);
  const expected = JSON.parse(oracle.stdout);
  const filename = join(directory,"conditional_witness.py");
  writeFileSync(filename,fixture);
  const compiled = await compileKernel({sourcePath:filename,cacheRoot:join(directory,"cache")});
  const fn = require(compiled.modulePath).conditional_witness;
  for (let i=0;i<cases.length;i++) {
    const c=cases[i];
    for (const [backend,implementation] of [["javascript",fn.javascript],["gmp",fn.gmp],["fmpz",fn.fmpz]]) {
      try {
        const actual = implementation(fn.packIntegerBuffer(c.plan.map(BigInt)),new BigUint64Array(1),BigInt(c.budget),BigInt(c.initial),BigInt(c.capacity),3145728n);
        assert.equal(String(actual),expected[i]);
      } catch (error) {
        throw new Error(`conditional case ${i}, ${backend}: ${JSON.stringify(c)}`, {cause:error});
      }
    }
  }
  // Retain the observed smaller-slab failure, rather than silently discarding
  // it when qualifying at the unchanged production temporary limit of 3 MiB.
  const stressedIndex = cases.findIndex(c => BigInt(c.plan[0]) > 2n**300n && c.budget === "1" && c.initial === "0" && c.capacity === "10000");
  assert.ok(stressedIndex >= 0);
  const stressed = cases[stressedIndex];
  assert.throws(() => fn.gmp(fn.packIntegerBuffer(stressed.plan.map(BigInt)),new BigUint64Array(1),1n,0n,10000n,1048576n), /temporary capacity exhausted/);
  assert.equal(String(fn.gmp(fn.packIntegerBuffer(stressed.plan.map(BigInt)),new BigUint64Array(1),7n,0n,10000n,3145728n)),expected[stressedIndex]);
});
