// sagejs-test-tier: unit
"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const { spawnSync } = require("node:child_process");
const { pythonExecutable } = require("../tools/python-executable.cjs");
const { expansionSource } = require("../bench/class-unit-groups/diagnose-cubic-expansion-build.cjs");
const sourcePath = path.resolve(__dirname, "../src/lib/sagejs/number_fields/cubic_class_number_native.py");
const helpersPath = path.resolve(__dirname, "../bench/class-unit-groups/cubic-expanded-shell-experiment.py");

test("expanded-shell source copy preserves the exact closure and original collector", () => {
  const source = require('./fixtures/cubic-source-baseline.cjs').cubicSourceBaseline(), helpers = fs.readFileSync(helpersPath, "utf8");
  const candidate = expansionSource(source, helpers);
  for (const name of ["_cubic_try_bounded_exact_closure", "_cubic_collect_adjacent_relation_prefix", "_cubic_append_smooth_principal_relation"]) {
    const extract = text => {
      const start = text.indexOf(`def ${name}(`), stop = text.indexOf("\ndef ", start + 1);
      assert(start >= 0 && stop > start);
      return text.slice(start, stop);
    };
    assert.equal(extract(candidate), extract(source));
  }
  assert.throws(() => expansionSource(candidate, helpers));
  const parsed = spawnSync(pythonExecutable(), ["-c", "import ast,sys; ast.parse(sys.stdin.read())"], { input: candidate, encoding: "utf8" });
  assert.equal(parsed.status, 0, parsed.stderr);
});

test("ordinary Python shell preparation and collection preserve inner plans", () => {
  const result = spawnSync(pythonExecutable(), ["-c", String.raw`
import collections, itertools, math, pathlib, sys
ns = dict(FmpzMatrix=dict, NativeIntegerVector=list, UInt64Buffer=list, uint64=int,
          checked_uint64=int, _CUBIC_MAX_POWERS=24, _POWER_OFFSET=0,
          _CUBIC_REDUCED_ENUMERATION_MAX_COORDINATE=64,
          _CUBIC_REDUCED_ENUMERATION_MAX_CANDIDATES=500,
          _cubic_ceil_sqrt=lambda n: math.isqrt(n) + (math.isqrt(n)**2 < n),
          _cubic_dyadic_ceiling_quotient=lambda a,b: -(-a//b))
exec(compile(pathlib.Path(sys.argv[1]).read_text(),sys.argv[1],'exec'),ns)
prepare=ns['_cubic_expansion_parameters']
def matrix(): return collections.defaultdict(int)
def length(p, row, v):
    x,y,z=v
    return p[row,0]*x*x+2*p[row,1]*x*y+2*p[row,2]*x*z+p[row,3]*y*y+2*p[row,4]*y*z+p[row,5]*z*z
cases=0
for d0,d1,d2,k in itertools.product(range(1,4),range(1,4),range(1,4),range(-2,3)):
    # Gram of an invertible triangular integral basis; not merely diagonal.
    p=matrix(); gram=(d0*d0,d0*k,0,k*k+d1*d1,d1*k,k*k+d2*d2)
    for c,g in enumerate(gram): p[0,c]=g
    p[0,6]=min(8*gram[0],2*gram[3]); before=dict(p); expanded=matrix()
    status=prepare(p,0,expanded)
    assert dict(p)==before
    assert status in (0,1)
    if status:
        bound=max(8*gram[0],2*gram[3]); assert expanded[0,6]==bound
        for v in itertools.product(range(-8,9),repeat=3):
            if length(p,0,v)<=bound:
                assert all(abs(v[j])<=expanded[0,7+j] for j in range(3))
    cases+=1
p=matrix(); assert prepare(p,0,matrix())==0
p[0,0]=1; p[0,3]=1; p[0,5]=0; p[0,6]=1
assert prepare(p,0,matrix())==-1
p[0,5]=1; p[0,0]=10**8
assert prepare(p,0,matrix())==-1

p=matrix()
for col,value in enumerate((1,0,0,1,0,1,2,2,2,2,0)): p[0,col]=value
before=dict(p); seen=[]
def candidate(workspace,base,transforms,offset,q,row,x,y,z):
    sign=z or y or x
    if sign<=0 or not 0<length(q,row,(x,y,z))<=q[row,6]: return 0,0,0,0
    return 1,x,y,z
def append(workspace,modular,candidates,elements,count,capacity,n,groups,a,b,c,*rest):
    assert count<capacity
    seen.append((a,b,c)); return count+1
ns.update(_cubic_reduced_ellipsoid_candidate=candidate,
          _cubic_append_smooth_principal_relation=append,
          _cubic_online_relation_lattice_update=lambda *args: 1)
collect=ns['_cubic_collect_expanded_shell']
args=([1,0,0],[],matrix(),matrix(),p,matrix(),matrix(),matrix(),matrix(),matrix(),matrix(),matrix(),matrix(),matrix(),matrix(),1,1,False)
r=collect(*args,0,0,1,500,499)
assert dict(p)==before
expected={v for v in itertools.product(range(-3,4),repeat=3) if (v[2] or v[1] or v[0])>0 and 2<sum(x*x for x in v)<=8}
assert set(seen)==expected and len(seen)==len(expected)
assert r==(len(expected),len(expected),1)
seen.clear(); r=collect(*args,0,0,1,5,5)
assert r==(5,5,1) and len(seen)==5
seen.clear(); ns['_CUBIC_REDUCED_ENUMERATION_MAX_CANDIDATES']=2
r=collect(*args,0,0,1,500,499)
assert r==(2,2,-1) and len(seen)==2
assert dict(p)==before
print(cases,'Gram cases; exact shell partition, target and failure guards passed')
`, helpersPath], { encoding: "utf8", timeout: 30_000 });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /135 Gram cases/);
});
