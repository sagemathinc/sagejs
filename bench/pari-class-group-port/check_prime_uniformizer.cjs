"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const hash=x=>createHash('sha256').update(x).digest('hex');
(async()=>{
 const oracle=require('./prime_uniformizer_oracle.cjs').collect(path.resolve(process.argv[2]),path.resolve(process.argv[3]));
 const packets=oracle.rows.map(r=>{
  assert(r.embeddingMode);const n=Number(r.n),c=r.P.rank+r.V.rank,s=n*n,fill=l=>Array(l).fill('77');
  return [r.table,r.P.matrix,r.V.matrix,String(n),String(r.P.rank),String(r.V.rank),String(r.p),String(Number(r.ramif)),String(r.r1),
   ...[0,1,2].map(i=>r.matrix.map(x=>String(x[i]))),fill(3*s+3*n+2*n*(c+1)+(c+1)**2+n+c+1),
   ...Array.from({length:7},()=>fill(n+2)),fill((r.P.rank+2)*(n+3)+2),fill(5)];
 });
 const cp=spawnSync('python3',['-c',`
import sys,json,importlib
sys.path[:0]=sys.argv[1:3]
f=importlib.import_module('bench.pari-class-group-port.prime_uniformizer').pari_prepared_prime_uniformizer
out=[]
for packet in json.load(sys.stdin):
 args=[list(map(int,x)) if isinstance(x,list) else int(x) for x in packet]
 result=f(*args)
 out.append({'result':result,'args':[[str(v) for v in x] if isinstance(x,list) else str(x) for x in args]})
 for index,length in [(12,len(args[12])-1),(19,args[3]-1),(20,(args[4]+2)*(args[3]+3)-1),(21,2)]:
  bad=[x.copy() if isinstance(x,list) else x for x in args];bad[index]=[77]*length
  before=[x.copy() if isinstance(x,list) else x for x in bad]
  try:f(*bad)
  except ValueError as e:assert 'short prime uniformizer storage' in str(e)
  else:raise AssertionError('missing short guard')
  assert bad==before
print(json.dumps(out))
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify(packets),encoding:'utf8',timeout:120000,maxBuffer:16*1024*1024});
 assert.equal(cp.status,0,cp.stderr);const expected=JSON.parse(cp.stdout);
 function verify(r,got){
  const n=Number(r.n),a=got.args,t=r.candidates.flatMap(x=>[...x.coordinates.map(String),String(x.norm),String(x.error),String(Number(x.accepted))]);
  assert.equal(got.result,0);assert.deepEqual(a[19],[...r.uniformizer.map(String),'77','77']);
  assert.deepEqual(a[20],[...t,...Array(packets[oracle.rows.indexOf(r)][20].length-t.length).fill('77')]);
  assert.equal(a[21][0],'0');assert.equal(a[21][1],String(r.candidates.length));assert.deepEqual(a[21].slice(3),['77','77']);
  const last=r.candidates.at(-1);const branch=r.candidates.length>2?3:last.accepted?(r.candidates.length===1?1:2):2;
  assert.equal(a[21][2],String(branch));
 }
 oracle.rows.forEach((r,i)=>verify(r,expected[i]));
 const built=await require('../../tools/native-kernel/compiler.cjs').compileKernel({sourcePath:path.join(__dirname,'prime_uniformizer.py')});
 const f=require(built.modulePath).pari_prepared_prime_uniformizer;
 for(const backend of ['javascript','gmp','tagged'])for(let i=0;i<packets.length;i++){
  const args=packets[i].map(x=>Array.isArray(x)?f.createIntegerBuffer(x.length,40,x.map(BigInt)):BigInt(x));
  const result=Number(f[backend](...args)),snap=()=>args.map(x=>typeof x==='bigint'?String(x):x.toArray().map(String));
  const got={result,args:snap()};assert.deepEqual(got,expected[i]);verify(oracle.rows[i],got);
  for(const j of [0,1,2,9,10,11])assert.deepEqual(got.args[j],packets[i][j].map(String));
  for(const [index,length] of [[12,packets[i][12].length-1],[19,Number(oracle.rows[i].n)-1],[20,(oracle.rows[i].P.rank+2)*(Number(oracle.rows[i].n)+3)-1],[21,2]]){
   const before=snap(),bad=args.slice();bad[index]=f.createIntegerBuffer(length,40,Array(length).fill(77n));
   assert.throws(()=>f[backend](...bad),/short prime uniformizer storage/);assert.deepEqual(snap(),before);assert.deepEqual(bad[index].toArray(),Array(length).fill(77n));
  }
 }
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-prime-uniformizer-'));
 const result={cases:oracle.rows.length,normTests:oracle.rows.reduce((x,r)=>x+r.candidates.length,0),backends:['cpython','javascript','gmp','tagged'],directory,sourceHash:hash(fs.readFileSync(path.join(__dirname,'prime_uniformizer.py'))),coreHash:hash(fs.readFileSync(built.coreSourcePath)),qualifiedTiming:false};
 fs.writeFileSync(path.join(directory,'fixtures.json'),JSON.stringify({oracle,expected,result}));console.log(JSON.stringify(result));
})().catch(e=>{console.error(e);process.exitCode=1;});
