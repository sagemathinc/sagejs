// sagejs-test-tier: unit
"use strict";
const fs = require("node:fs"), path = require("node:path"), test = require("node:test");
const assert = require("node:assert/strict"), { spawnSync } = require("node:child_process");
const { pythonExecutable } = require("../tools/python-executable.cjs");
const { recoveryLogSource } = require("../bench/class-unit-groups/diagnose-cubic-recovery-log-build.cjs");
const source = fs.readFileSync(path.join(__dirname, "../src/lib/sagejs/number_fields/cubic_class_number_native.py"), "utf8");
test("recovery logarithms reuse the existing batch helper and preserve scalar semantics", () => {
  // The measured transformation is now integrated. Its diagnostic builder
  // must reject reapplication instead of changing another mathematical loop.
  assert.throws(() => recoveryLogSource(source));
  const start = source.indexOf('def _cubic_relation_prefix_has_archimedean_unit(');
  const recovery = source.slice(start, source.indexOf('\ndef ', start + 1));
  assert.equal((recovery.match(/_cubic_fill_dependency_logs\(/g) || []).length, 1);
  assert(!recovery.includes('_cubic_real_log_bounds('));
  const result = spawnSync(pythonExecutable(), ["-c", String.raw`
import ast,collections,json,sys
data=json.load(sys.stdin)
ast.parse(data['source'])
tree=ast.parse(data['source'])
names={'_cubic_real_log_bounds','_cubic_fill_dependency_logs'}
tree.body=[f for f in tree.body if isinstance(f,ast.FunctionDef) and f.name in names]
assert len(tree.body)==2
code=compile(tree,'actual-log-helpers','exec')
for size in (1,2,17,64):
  for failure in (-2,-1,0,size//2,size-1):
    runs=[]
    for batched in (False,True):
      calls=[]
      def root(coeff,scale):
        calls.append(('root',tuple(coeff),scale))
        return (2,1) if failure==-2 else (10,11)
      def logarithm(*args):
        element=args[10:13];calls.append(('log',element,args[13:]))
        return (1,0) if element[0]==failure else (element[0]*7,element[0]*7+1)
      ns=dict(IntegerBuffer=list,FmpzMatrix=dict,uint64=int,native=lambda f:f,
        _cubic_real_root_interval=root,_cubic_real_log_bounds_from_root_interval=logarithm)
      exec(code,ns)
      elements={(r,c):r if c==0 else c for r in range(size) for c in range(3)}
      logs=collections.defaultdict(lambda:99)
      coeff=[122,-7,-1,1];scratch=[{}, {}, {}];basis=[1,1,0,0,1,0,1]
      if batched:
        ok=ns['_cubic_fill_dependency_logs'](coeff,*scratch,elements,logs,*basis,size,True,128,32)
      else:
        ok=True
        for r in range(size):
          lo,hi=ns['_cubic_real_log_bounds'](*scratch,coeff,*basis,*(elements[r,c] for c in range(3)),128,32)
          if hi<lo:ok=False;break
          logs[r,0]=lo;logs[r,1]=hi
      runs.append((ok,dict(logs),[c for c in calls if c[0]=='log'],len([c for c in calls if c[0]=='root'])))
    assert runs[0][:3]==runs[1][:3]
    assert runs[1][3]==1
    if failure==-1:assert runs[0][3]==size
print('success, invalid-root, invalid-log and partial-write parity; one root per batch')
`], { input: JSON.stringify({ source }), encoding: "utf8", timeout: 30000 });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
