// sagejs-test-tier: unit
"use strict";
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),test=require('node:test');
const {spawnSync}=require('node:child_process');
const {pythonExecutable}=require('../tools/python-executable.cjs');
const {absoluteValueSource}=require('../bench/class-unit-groups/diagnose-cubic-absolute-value-build.cjs');
const root=path.resolve(__dirname,'..');
test('historical cubic baseline reconstruction rejects source and delta corruption',()=>{
  const {restoreCubicBaseline}=require('./fixtures/cubic-source-baseline.cjs');
  const source=fs.readFileSync(path.join(root,'src/lib/sagejs/number_fields/cubic_class_number_native.py'),'utf8');
  const delta=fs.readFileSync(path.join(__dirname,'fixtures/cubic-source-baseline.patch'),'utf8');
  const baseline=restoreCubicBaseline(source,delta);
  assert.equal(restoreCubicBaseline(source.replaceAll('\n','\r\n'),delta.replaceAll('\n','\r\n')),baseline);
  assert.throws(()=>restoreCubicBaseline(source+'# unreviewed\n',delta));
  assert.throws(()=>restoreCubicBaseline(source.replace('absolute_discriminant = abs(projection[7])','absolute_discriminant = abs(projection[6])'),delta));
  assert.throws(()=>restoreCubicBaseline(source,delta.replace('@@ -257,9 +257,7 @@','@@ -257,8 +257,7 @@')));
  assert.throws(()=>restoreCubicBaseline(source,delta.replace('-    absolute_discriminant = projection[7]','-    absolute_discriminant = projection[6]')));
});
test('the fully formatted combined cubic candidate fits the unchanged package allowance',()=>{
  const {resumableSource}=require('../bench/class-unit-groups/diagnose-cubic-resumable-expansion-build.cjs');
  const {torsionProbeSource}=require('../bench/class-unit-groups/diagnose-cubic-torsion-probe-build.cjs');
  const {shareRecoverySource}=require('../bench/class-unit-groups/diagnose-cubic-recovery-sharing-build.cjs');
  const {searchWorkspaceSource}=require('../bench/class-unit-groups/diagnose-cubic-search-workspace-build.cjs');
  const {formatPythonSource}=require('../tools/python-format.cjs');
  const read=p=>fs.readFileSync(path.join(root,p),'utf8');
  const source=require('./fixtures/cubic-source-baseline.cjs').cubicSourceBaseline();
  const candidate=absoluteValueSource(searchWorkspaceSource(shareRecoverySource(torsionProbeSource(resumableSource(source,read('bench/class-unit-groups/cubic-expanded-shell-experiment.py'),read('bench/class-unit-groups/cubic-expanded-prefix-experiment.py'))))));
  assert.equal(formatPythonSource(candidate),candidate);
  // Integration removes only the two source-copy diagnostic banners. The
  // reviewed transformations remain bound to their original input, not to
  // an already-transformed production module.
  const banners=[
    '"""Private source-copy experiment; these helpers are not a production module.\n\nThe builder injects this ordinary Python into the existing closed native program.\nSearch bounds are scheduling only; accepted results still require exact closure.\n"""\n\n\n',
    '"""Resumable diagnostic shell traversal using the existing admission loop."""\n\n\n',
  ];
  let integrated=candidate;
  for(const banner of banners){assert.equal(integrated.split(banner).length,2);integrated=integrated.replace(banner,'');}
  assert.equal(read('src/lib/sagejs/number_fields/cubic_class_number_native.py'),integrated);
  const component=JSON.parse(read('architecture/package-graph.json')).packages.find(p=>p.id==='complex-cubic-native-program');
  assert.equal(component.max_source_bytes,485000);
  const bytes=component.files.reduce((total,p)=>total+Buffer.byteLength(p.endsWith('/cubic_class_number_native.py')?candidate:read(p).replaceAll('\r\n','\n')),0);
  assert(bytes<=component.max_source_bytes,`${bytes} exceeds ${component.max_source_bytes}`);
});
test('exact cubic absolute-value rewrites preserve evaluation and surrounding mathematics',()=>{
  const before=require('./fixtures/cubic-source-baseline.cjs').cubicSourceBaseline();
  const after=absoluteValueSource(before);
  assert(Buffer.byteLength(after)<Buffer.byteLength(before));
  assert.throws(()=>absoluteValueSource(after));
  const result=spawnSync(pythonExecutable(),['-c',String.raw`
import ast,copy,json,random,sys
d=json.load(sys.stdin)
before=ast.parse(d['before']);after=ast.parse(d['after'])
class Canonical(ast.NodeTransformer):
    count=0
    def visit_If(self,node):
        node=self.generic_visit(node)
        if node.orelse or len(node.body)!=1:return node
        t=node.test;b=node.body[0]
        if not(isinstance(t,ast.Compare) and isinstance(t.left,ast.Name) and len(t.ops)==1 and isinstance(t.ops[0],ast.Lt) and isinstance(t.comparators[0],ast.Constant) and t.comparators[0].value==0):return node
        name=t.left.id
        expected=ast.parse(name+' = -'+name).body[0]
        if ast.dump(b)!=ast.dump(expected):return node
        self.count+=1
        return ast.parse(name+' = abs('+name+')').body[0]
    def generic_visit(self,node):
        node=super().generic_visit(node)
        for field,items in ast.iter_fields(node):
            if not isinstance(items,list):continue
            out=[]
            for item in items:
                if out and isinstance(item,ast.Assign) and len(item.targets)==1 and isinstance(item.targets[0],ast.Name):
                    name=item.targets[0].id
                    if ast.dump(item)==ast.dump(ast.parse(name+' = abs('+name+')').body[0]):
                        prev=out[-1]
                        if isinstance(prev,ast.Assign) and len(prev.targets)==1 and ast.dump(prev.targets[0])==ast.dump(item.targets[0]):
                            out[-1]=ast.Assign(targets=prev.targets,value=ast.Call(func=ast.Name(id='abs',ctx=ast.Load()),args=[prev.value],keywords=[]))
                            continue
                out.append(item)
            setattr(node,field,out)
        return node
canonical=Canonical();normalized=canonical.visit(before)
assert canonical.count==24,canonical.count
# Three independent coordinate locals were interleaved before normalization.
old=ast.parse('absolute_zero = coefficient_zero\nabsolute_one = coefficient_one\nabsolute_two = coefficient_two\nabsolute_zero = abs(absolute_zero)\nabsolute_one = abs(absolute_one)\nabsolute_two = abs(absolute_two)').body
new=ast.parse('absolute_zero = abs(coefficient_zero)\nabsolute_one = abs(coefficient_one)\nabsolute_two = abs(coefficient_two)').body
found=0
for parent in ast.walk(normalized):
    for field,items in ast.iter_fields(parent):
        if not isinstance(items,list):continue
        for i in range(len(items)-5):
            if [ast.dump(n) for n in items[i:i+6]]==[ast.dump(n) for n in old]:
                items[i:i+6]=copy.deepcopy(new);found+=1;break
assert found==1
assert ast.dump(normalized)==ast.dump(after),'unrelated mathematical AST changed'
# For the admitted exact integer domain, verify the scalar identity and that
# a producer is still evaluated once, including signed machine boundaries.
rng=random.Random(9262026)
values=[0,1,-1,2**63-1,-2**63,2**64,-2**64]
values += [rng.randrange(-(1<<n),(1<<n)) for n in range(1,2049)]
for value in values:
    calls=[]
    def producer():calls.append(value);return value
    x=producer()
    if x<0:x=-x
    expected=x;assert len(calls)==1
    calls.clear();x=abs(producer())
    assert x==expected and len(calls)==1
print('24 exact sign normalizations, full AST equivalence modulo abs, and 2055 signed integer cases passed')
`],{input:JSON.stringify({before,after}),encoding:'utf8',maxBuffer:4000000,timeout:30000});
  assert.equal(result.status,0,result.stdout+'\n'+result.stderr);
});
