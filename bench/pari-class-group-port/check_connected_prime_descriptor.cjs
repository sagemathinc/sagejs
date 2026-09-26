"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const hash=x=>createHash('sha256').update(x).digest('hex');
(async()=>{
 const oracle=require('./prime_descriptor_oracle.cjs').collect(path.resolve(process.argv[2]),path.resolve(process.argv[3]));
 const packets=oracle.rows.map(r=>{
  assert(r.embeddingMode);const n=r.n,c=r.P.rank+r.V.rank,s=n*n,fill=l=>Array(l).fill('77');
  return [r.table,r.P.matrix,r.V.matrix,String(n),String(r.P.rank),String(r.V.rank),String(r.p),String(Number(r.ramif)),String(r.r1),
   ...[0,1,2].map(i=>r.matrix.map(x=>String(x[i]))),fill(Math.max(2*s+3*n,3*s+3*n+2*n*(c+1)+(c+1)**2+n+c+1)),
   ...Array.from({length:7},()=>fill(n+2)),fill((r.P.rank+2)*(n+3)+2),fill(5),fill(s+2),fill(32),fill(n+2),fill(s+2),fill(3+n+s+2),fill(5)];
 });
 const cp=spawnSync('python3',['-c',`
import sys,json,importlib
sys.path[:0]=sys.argv[1:3]
f=importlib.import_module('bench.pari-class-group-port.prime_descriptor').pari_prepared_prime_descriptor
out=[]
for packet in json.load(sys.stdin):
 args=[list(map(int,x)) if isinstance(x,list) else int(x) for x in packet]
 result=f(*args)
 out.append({'result':result,'args':[[str(v) for v in x] if isinstance(x,list) else str(x) for x in args]})
 for index,length in [(26,3+args[3]+args[3]**2-1),(27,2)]:
  bad=[x.copy() if isinstance(x,list) else x for x in args];bad[index]=[77]*length
  before=[x.copy() if isinstance(x,list) else x for x in bad]
  try:f(*bad)
  except ValueError as e:assert 'short connected prime descriptor storage' in str(e)
  else:raise AssertionError('missing final guard')
  assert bad==before
print(json.dumps(out))
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify(packets),encoding:'utf8',timeout:120000,maxBuffer:32*1024*1024});
 assert.equal(cp.status,0,cp.stderr);const expected=JSON.parse(cp.stdout);
 function verify(r,got,index){
  const a=got.args,n=r.n,trace=r.candidates.flatMap(c=>[...c.coordinates.map(String),String(c.norm),String(c.error),String(Number(c.accepted))]);
  assert.equal(got.result,0);assert.deepEqual(a[19],[...r.uniformizer.map(String),'77','77']);
  assert.deepEqual(a[20],[...trace,...Array(packets[index][20].length-trace.length).fill('77')]);
  assert.equal(a[21][0],'0');assert.equal(a[21][1],String(r.candidates.length));
  assert.deepEqual(a[24],[...r.antiuniformizer.map(String),'77','77']);assert.deepEqual(a[25],[...r.antiuniformizerTable.map(String),'77','77']);
  assert.deepEqual(a[26],[String(r.p),String(r.ramificationIndex),String(r.residueDegree),...r.uniformizer.map(String),...r.antiuniformizerTable.map(String),'77','77']);
  assert.deepEqual(a[27],['0',String(r.antiuniformizer.findLastIndex(x=>BigInt(x)!==0n)+1),String(r.ramificationIndex),'77','77']);
  for(const j of [0,1,2,9,10,11])assert.deepEqual(a[j],packets[index][j].map(String));
  for(const j of [13,14,15,16,17,18,19,22,24,25,26,27])assert.deepEqual(a[j].slice(-2),['77','77']);
 }
 oracle.rows.forEach((r,i)=>verify(r,expected[i],i));
 const built=await require('../../tools/native-kernel/compiler.cjs').compileKernel({sourcePath:path.join(__dirname,'prime_descriptor.py')});
 const f=require(built.modulePath).pari_prepared_prime_descriptor;
 for(const backend of ['javascript','gmp','tagged'])for(let i=0;i<packets.length;i++){
  const args=packets[i].map(x=>Array.isArray(x)?f.createIntegerBuffer(x.length,40,x.map(BigInt)):BigInt(x));
  const result=Number(f[backend](...args)),snap=()=>args.map(x=>typeof x==='bigint'?String(x):x.toArray().map(String));
  const got={result,args:snap()};assert.deepEqual(got,expected[i]);verify(oracle.rows[i],got,i);
  for(const [index,length] of [[26,3+oracle.rows[i].n+oracle.rows[i].n**2-1],[27,2]]){
   const before=snap(),bad=args.slice();bad[index]=f.createIntegerBuffer(length,40,Array(length).fill(77n));
   assert.throws(()=>f[backend](...bad),/short connected prime descriptor storage/);assert.deepEqual(snap(),before);assert.deepEqual(bad[index].toArray(),Array(length).fill(77n));
  }
 }
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-connected-prime-descriptor-'));
 const result={cases:oracle.rows.length,normTests:oracle.rows.reduce((a,r)=>a+r.candidates.length,0),valuations:oracle.rows.filter(r=>r.valuationCalled).length,backends:['cpython','javascript','gmp','tagged'],directory,sourceHash:hash(fs.readFileSync(path.join(__dirname,'prime_descriptor.py'))),checkerHash:hash(fs.readFileSync(__filename)),coreHash:hash(fs.readFileSync(built.coreSourcePath)),qualifiedTiming:false};
 fs.writeFileSync(path.join(directory,'fixtures.json'),JSON.stringify({oracle,expected,result}));console.log(JSON.stringify(result));
})().catch(e=>{console.error(e);process.exitCode=1;});
