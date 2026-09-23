"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const hash=x=>createHash('sha256').update(x).digest('hex');
(async()=>{
 const oracle=require('./prime_embedding_norm_oracle.cjs').collect(path.resolve(process.argv[2]),path.resolve(process.argv[3]));
 const rows=oracle.rows;
 assert(rows.some(r=>String(r.embeddings[0][1])==='-1'),'exact integer coverage');
 assert(rows.some(r=>String(r.embeddings[0][1])!=='-1'),'real coverage');
 const packets=rows.map(r=>{
  const n=Number(r.n),vectors=[0,1,2].map(i=>r.matrix.map(t=>String(t[i])));
  return [...vectors,r.coordinates.map(String),...Array.from({length:3},()=>Array(n+2).fill('77')),String(n),String(r.r1)];
 });
 const cp=spawnSync('python3',['-c',`
import sys,json,importlib
sys.path[:0]=sys.argv[1:3]
f=importlib.import_module('bench.pari-class-group-port.prime_embedding_norm').pari_prepared_prime_embedding_norm
out=[]
for packet in json.load(sys.stdin):
 args=[list(map(int,x)) if isinstance(x,list) else int(x) for x in packet]
 try: result=list(map(str,f(*args)))
 except ValueError as e:
  assert str(e)=='get_norm precision'
  result=None
 out.append({'result':result,'values':[[str(v) for v in x] for x in args[4:7]]})
 before=[x.copy() if isinstance(x,list) else x for x in args]
 bad=args.copy();bad[4]=[77]*(args[7]-1)
 try:f(*bad)
 except ValueError as e:assert 'short prime embedding norm storage' in str(e)
 else:raise AssertionError('missing short guard')
 assert args==before
print(json.dumps(out))
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify(packets),encoding:'utf8',timeout:120000,maxBuffer:16*1024*1024});
 assert.equal(cp.status,0,cp.stderr);const expected=JSON.parse(cp.stdout);
 function verify(r,got){
  assert.deepEqual(got.result,r.accepted===false?null:[String(r.norm),String(r.roundingError)]);
  for(let i=0;i<3;i++)assert.deepEqual(got.values[i],[...r.embeddings.map(t=>String(t[i])),'77','77']);
 }
 rows.forEach((r,i)=>verify(r,expected[i]));
 const built=await require('../../tools/native-kernel/compiler.cjs').compileKernel({sourcePath:path.join(__dirname,'prime_embedding_norm.py')});
 const f=require(built.modulePath).pari_prepared_prime_embedding_norm;
 for(const backend of ['javascript','gmp','tagged'])for(let i=0;i<rows.length;i++){
  const args=packets[i].map(x=>Array.isArray(x)?f.createIntegerBuffer(x.length,40,x.map(BigInt)):BigInt(x));
  let result=null;
  if(rows[i].accepted===false)assert.throws(()=>f[backend](...args),/get_norm precision/);
  else result=f[backend](...args).map(String);
  const values=args.slice(4,7).map(x=>x.toArray().map(String));
  const got={result,values};assert.deepEqual(got,expected[i]);verify(rows[i],got);
  for(let j=0;j<4;j++)assert.deepEqual(args[j].toArray().map(String),packets[i][j]);
  const before=args.slice(0,7).map(x=>x.toArray()),bad=args.slice(),length=Number(rows[i].n)-1;bad[4]=f.createIntegerBuffer(length,40,Array(length).fill(77n));
  assert.throws(()=>f[backend](...bad),/short prime embedding norm storage/);
  assert.deepEqual(args.slice(0,7).map(x=>x.toArray()),before);assert.deepEqual(bad[4].toArray(),Array(length).fill(77n));
 }
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-prime-embedding-norm-'));
 const result={cases:rows.length,backends:['cpython','javascript','gmp','tagged'],directory,sourceHash:hash(fs.readFileSync(path.join(__dirname,'prime_embedding_norm.py'))),coreHash:hash(fs.readFileSync(built.coreSourcePath)),qualifiedTiming:false};
 fs.writeFileSync(path.join(directory,'fixtures.json'),JSON.stringify({oracle,expected,result}));console.log(JSON.stringify(result));
})().catch(e=>{console.error(e);process.exitCode=1;});
