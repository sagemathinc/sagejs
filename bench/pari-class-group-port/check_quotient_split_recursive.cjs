"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const hash=x=>createHash('sha256').update(x).digest('hex');
(async()=>{
 const oracle=require('./quotient_split_recursive_oracle.cjs').collect(path.resolve(process.argv[2]),path.resolve(process.argv[3]));
 assert(oracle.rows.some(r=>r.visits.length>1 && r.visits.some(v=>v.split && v.roots.length<v.dimension)), 'recursive partial split coverage');
 function inputs(r){
  const n=Number(r.n),s=n*n,fill=l=>Array(l).fill('77');
  return [r.table,r.radical,r.phi,String(n),String(r.radicalColumns),String(r.p),
   fill(11*s+2*n),fill(10*s+3*n),fill(n),fill(n),fill(s),fill(2*n*(n+2)+4*n+4),fill(n+2),fill(2),fill(4),fill(244),
   fill(n*s),fill(n),fill(6),fill(s),fill(n*s),fill(n),fill(n*s+2),fill(n+2),fill(5)];
 }
 const packets=oracle.rows.map(inputs);
 const cp=spawnSync('python3',['-c',`
import sys,json,importlib
sys.path[:0]=sys.argv[1:3]
module=importlib.import_module('bench.pari-class-group-port.quotient_split_recursive')
f=module.pari_small_quotient_split_recursive
step=module.pari_small_quotient_split_step
trace=[]
def traced(*args):
 trace.append([str(x) for x in args[1][:args[3]*args[4]]])
 return step(*args)
module.pari_small_quotient_split_step=traced
out=[]
for packet in json.load(sys.stdin):
 args=[list(map(int,x)) if isinstance(x,list) else int(x) for x in packet]
 trace.clear()
 count=f(*args)
 out.append({'count':count,'trace':trace.copy(),'args':[[str(v) for v in x] if isinstance(x,list) else str(x) for x in args]})
 for index,length in [(14,3),(20,len(args[20])-1),(24,2)]:
  bad=[x.copy() if isinstance(x,list) else x for x in args];bad[index]=[77]*length
  before=[x.copy() if isinstance(x,list) else x for x in bad]
  try: f(*bad)
  except ValueError as e: assert 'short recursive quotient split storage' in str(e)
  else: raise AssertionError('missing guard')
  assert bad==before
print(json.dumps(out))
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify(packets),encoding:'utf8',timeout:120000,maxBuffer:16*1024*1024});
 assert.equal(cp.status,0,cp.stderr);const expected=JSON.parse(cp.stdout);
 function verify(row,result){
  const n=Number(row.n),s=n*n,a=result.args,wanted=Array(n*s+2).fill('77'),ranks=Array(n+2).fill('77');
  row.finalIdeals.forEach((x,j)=>{ranks[j]=String(x.rank);x.matrix.forEach((v,i)=>wanted[j*s+i]=String(v));});
  assert.equal(result.count,row.finalIdeals.length);
  assert.deepEqual(a[22],wanted);assert.deepEqual(a[23],ranks);
  assert.deepEqual(a[24],['0',String(row.visits.length),String(row.finalIdeals.length),'77','77']);
 }
 oracle.rows.forEach((r,i)=>{verify(r,expected[i]);assert.deepEqual(expected[i].trace,r.visits.map(v=>v.H.map(String)));delete expected[i].trace;});
 const built=await require('../../tools/native-kernel/compiler.cjs').compileKernel({sourcePath:path.join(__dirname,'quotient_split_recursive.py')});
 const f=require(built.modulePath).pari_small_quotient_split_recursive;
 for(const backend of ['javascript','gmp','tagged'])for(let i=0;i<packets.length;i++){
  const args=packets[i].map(x=>Array.isArray(x)?f.createIntegerBuffer(x.length,3,x.map(BigInt)):BigInt(x));
  const count=Number(f[backend](...args)),snap=()=>args.map(x=>typeof x==='bigint'?String(x):x.toArray().map(String));
  const result={count,args:snap()};assert.deepEqual(result,expected[i]);verify(oracle.rows[i],result);
  for(let j=0;j<3;j++)assert.deepEqual(result.args[j],packets[i][j].map(String));
  for(const [index,length] of [[14,3],[20,packets[i][20].length-1],[24,2]]){
   const before=snap(),bad=args.slice();bad[index]=f.createIntegerBuffer(length,3,Array(length).fill(77n));
   assert.throws(()=>f[backend](...bad),/short recursive quotient split storage/);assert.deepEqual(snap(),before);
   assert.deepEqual(bad[index].toArray(),Array(length).fill(77n));
  }
 }
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-quotient-recursive-'));
 const result={cases:oracle.rows.length,visits:oracle.rows.reduce((n,r)=>n+r.visits.length,0),backends:['cpython','javascript','gmp','tagged'],directory,sourceHash:hash(fs.readFileSync(path.join(__dirname,'quotient_split_recursive.py'))),coreHash:hash(fs.readFileSync(built.coreSourcePath)),qualifiedTiming:false};
 fs.writeFileSync(path.join(directory,'fixtures.json'),JSON.stringify({oracle,expected,result}));console.log(JSON.stringify(result));
})().catch(e=>{console.error(e);process.exitCode=1;});
