"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const hash=x=>createHash('sha256').update(x).digest('hex');
(async()=>{
 const oracle=require('./prime_descriptor_oracle.cjs').collect(path.resolve(process.argv[2]),path.resolve(process.argv[3]));
 const packets=oracle.rows.map(r=>{
  const n=Number(r.n),s=n*n,fill=l=>Array(l).fill('77');
  return [r.table,r.uniformizer,String(n),String(r.p),String(Number(r.ramif)),fill(2*s+3*n),fill(n+2),fill(n+2),fill(s+2),fill(n+2),fill(n+2),fill(n+2),fill(32),fill(n+2),fill(s+2),fill(5)];
 });
 const cp=spawnSync('python3',['-c',`
import sys,json,importlib
sys.path[:0]=sys.argv[1:3]
f=importlib.import_module('bench.pari-class-group-port.prime_descriptor').pari_prepared_prime_descriptor_suffix
out=[]
for packet in json.load(sys.stdin):
 args=[list(map(int,x)) if isinstance(x,list) else int(x) for x in packet]
 result=f(*args)
 out.append({'result':result,'args':[[str(v) for v in x] if isinstance(x,list) else str(x) for x in args]})
 for index,length in [(5,len(args[5])-1),(13,args[2]-1),(14,args[2]**2-1),(15,2)]:
  bad=[x.copy() if isinstance(x,list) else x for x in args];bad[index]=[77]*length
  before=[x.copy() if isinstance(x,list) else x for x in bad]
  try:f(*bad)
  except ValueError as e:assert 'short prime descriptor storage' in str(e)
  else:raise AssertionError('missing short guard')
  assert bad==before
print(json.dumps(out))
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify(packets),encoding:'utf8',timeout:120000,maxBuffer:16*1024*1024});
 assert.equal(cp.status,0,cp.stderr);const expected=JSON.parse(cp.stdout);
 function verify(r,got){
  const n=Number(r.n),a=got.args;
  assert.equal(got.result,0);assert.deepEqual(a[13],[...r.antiuniformizer.map(String),'77','77']);
  assert.deepEqual(a[14],[...r.antiuniformizerTable.map(String),'77','77']);
  const pivot=r.antiuniformizer.findLastIndex(x=>BigInt(x)!==0n)+1;
  assert.deepEqual(a[15],['0',String(pivot),String(r.ramificationIndex),'77','77']);
  assert.deepEqual(r.multiplicationBefore,r.multiplicationAfter);
  assert.deepEqual(a[5].slice(0,n*n),r.multiplicationBefore.map(x=>String((BigInt(x)%BigInt(r.p)+BigInt(r.p))%BigInt(r.p))));
  for(const j of [6,7,8,9,10,11])assert.deepEqual(a[j].slice(-2),['77','77']);
  if(!r.valuationCalled)for(const j of [9,10,11,12])assert(a[j].every(x=>x==='77'));
 }
 oracle.rows.forEach((r,i)=>verify(r,expected[i]));
 assert.deepEqual([...new Set(oracle.rows.map(r=>r.ramificationIndex))].sort(),[1,2,3,4]);
 const built=await require('../../tools/native-kernel/compiler.cjs').compileKernel({sourcePath:path.join(__dirname,'prime_descriptor.py')});
 const f=require(built.modulePath).pari_prepared_prime_descriptor_suffix;
 for(const backend of ['javascript','gmp','tagged'])for(let i=0;i<packets.length;i++){
  const args=packets[i].map(x=>Array.isArray(x)?f.createIntegerBuffer(x.length,40,x.map(BigInt)):BigInt(x));
  const result=Number(f[backend](...args)),snap=()=>args.map(x=>typeof x==='bigint'?String(x):x.toArray().map(String));
  const got={result,args:snap()};assert.deepEqual(got,expected[i]);verify(oracle.rows[i],got);
  for(const j of [0,1])assert.deepEqual(got.args[j],packets[i][j].map(String));
  for(const [index,length] of [[5,packets[i][5].length-1],[13,Number(oracle.rows[i].n)-1],[14,Number(oracle.rows[i].n)**2-1],[15,2]]){
   const before=snap(),bad=args.slice();bad[index]=f.createIntegerBuffer(length,40,Array(length).fill(77n));
   assert.throws(()=>f[backend](...bad),/short prime descriptor storage/);assert.deepEqual(snap(),before);assert.deepEqual(bad[index].toArray(),Array(length).fill(77n));
  }
 }
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-prime-descriptor-'));
 const result={cases:oracle.rows.length,valuations:oracle.rows.filter(r=>r.valuationCalled).length,backends:['cpython','javascript','gmp','tagged'],directory,sourceHash:hash(fs.readFileSync(path.join(__dirname,'prime_descriptor.py'))),coreHash:hash(fs.readFileSync(built.coreSourcePath)),qualifiedTiming:false};
 fs.writeFileSync(path.join(directory,'fixtures.json'),JSON.stringify({oracle,expected,result}));console.log(JSON.stringify(result));
})().catch(e=>{console.error(e);process.exitCode=1;});
