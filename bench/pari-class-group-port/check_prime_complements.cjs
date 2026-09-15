"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const hash=x=>createHash('sha256').update(x).digest('hex');
(async()=>{
 const oracle=require('./prime_complements_oracle.cjs').collect(path.resolve(process.argv[2]),path.resolve(process.argv[3]));
 for(const count of [1,2,3,4])assert(oracle.rows.some(r=>r.finalIdeals.length===count),'missing ideal-count coverage '+count);
 function inputs(r){
  const n=Number(r.n),s=n*n,count=r.finalIdeals.length,fill=l=>Array(l).fill('77'),ideals=fill(count*s+2),ranks=[];
  r.finalIdeals.forEach((v,j)=>{ranks.push(String(v.rank));v.matrix.forEach((x,i)=>ideals[j*s+i]=String(x));});
  return [ideals,ranks,String(count),String(n),String(r.p),fill(3*n*s+s+7*s+3*n),fill(2*n),fill(count*s+2),fill(count+2),fill(5)];
 }
 const packets=oracle.rows.map(inputs);
 const cp=spawnSync('python3',['-c',`
import sys,json,importlib
sys.path[:0]=sys.argv[1:3]
f=importlib.import_module('bench.pari-class-group-port.prime_complements').pari_small_prime_complements
out=[]
for packet in json.load(sys.stdin):
 args=[list(map(int,x)) if isinstance(x,list) else int(x) for x in packet]
 count=f(*args)
 out.append({'count':count,'args':[[str(v) for v in x] if isinstance(x,list) else str(x) for x in args]})
 for index,length in [(5,len(args[5])-1),(6,len(args[6])-1),(9,2)]:
  bad=[x.copy() if isinstance(x,list) else x for x in args];bad[index]=[77]*length
  before=[x.copy() if isinstance(x,list) else x for x in bad]
  try: f(*bad)
  except ValueError as e: assert 'short prime complements storage' in str(e)
  else: raise AssertionError('missing guard')
  assert bad==before
print(json.dumps(out))
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify(packets),encoding:'utf8',timeout:120000,maxBuffer:16*1024*1024});
 assert.equal(cp.status,0,cp.stderr);const expected=JSON.parse(cp.stdout);
 function verify(row,result){
  const n=Number(row.n),s=n*n,count=row.finalIdeals.length,bank=n*s,a=result.args,wanted=Array(count*s+2).fill('77'),ranks=Array(count+2).fill('77');
  row.LV.forEach((x,j)=>{ranks[j]=String(x.rank);x.matrix.forEach((v,i)=>wanted[j*s+i]=String(v));});
  assert.equal(result.count,count);assert.deepEqual(a[7],wanted);assert.deepEqual(a[8],ranks);
  let calls=0;if(count>1)calls=2*(count-2)+(count-2);
  assert.deepEqual(a[9],['0',String(calls),String(count),'77','77']);
  for(const [values,base,rankBase]of [[row.A,bank,0],[row.B,2*bank,n]])values.forEach((v,j)=>{
   assert.equal(a[6][rankBase+j],v===null?'-1':String(v.rank));
   const entries=v===null?[]:v.matrix.map(String);
   assert.deepEqual(a[5].slice(base+j*s,base+(j+1)*s),[...entries,...Array(s-entries.length).fill('77')]);
  });
  if(count===1){assert(a[5].every(x=>x==='77'));assert(a[6].every(x=>x==='77'));}
 }
 oracle.rows.forEach((r,i)=>verify(r,expected[i]));
 const built=await require('../../tools/native-kernel/compiler.cjs').compileKernel({sourcePath:path.join(__dirname,'prime_complements.py')});
 const f=require(built.modulePath).pari_small_prime_complements;
 for(const backend of ['javascript','gmp','tagged'])for(let i=0;i<packets.length;i++){
  const args=packets[i].map(x=>Array.isArray(x)?f.createIntegerBuffer(x.length,3,x.map(BigInt)):BigInt(x));
  const count=Number(f[backend](...args)),snap=()=>args.map(x=>typeof x==='bigint'?String(x):x.toArray().map(String));
  const result={count,args:snap()};assert.deepEqual(result,expected[i]);verify(oracle.rows[i],result);
  for(let j=0;j<2;j++)assert.deepEqual(result.args[j],packets[i][j]);
  for(const [index,length]of [[5,packets[i][5].length-1],[6,packets[i][6].length-1],[9,2]]){
   const before=snap(),bad=args.slice();bad[index]=f.createIntegerBuffer(length,3,Array(length).fill(77n));
   assert.throws(()=>f[backend](...bad),/short prime complements storage/);assert.deepEqual(snap(),before);assert.deepEqual(bad[index].toArray(),Array(length).fill(77n));
  }
 }
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-prime-complements-'));
 const result={cases:oracle.rows.length,backends:['cpython','javascript','gmp','tagged'],directory,sourceHash:hash(fs.readFileSync(path.join(__dirname,'prime_complements.py'))),coreHash:hash(fs.readFileSync(built.coreSourcePath)),qualifiedTiming:false};
 fs.writeFileSync(path.join(directory,'fixtures.json'),JSON.stringify({oracle,expected,result}));console.log(JSON.stringify(result));
})().catch(e=>{console.error(e);process.exitCode=1;});
