"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const hash=x=>createHash('sha256').update(x).digest('hex');
function run(c,a,o={}){const r=spawnSync(c,a,{encoding:'utf8',timeout:120000,maxBuffer:32*1024*1024,...o});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
(async()=>{
 const oracle=await require('./quotient_projection_oracle.cjs').collect(path.resolve(process.argv[2]),path.resolve(process.argv[3]));
 const rows=oracle.rows.map(r=>({...r,ideal:r.radical,rank:r.radicalColumns,kernelColumns:r.dimension,dimension:r.quotientDimension}));
 const cp=JSON.parse(run('python3',['-c',`
import sys,json,importlib
sys.path[:0]=sys.argv[1:3];m=importlib.import_module('bench.pari-class-group-port.quotient_projection');f=m.pari_small_quotient_projection
result=[]
for r in json.load(sys.stdin):
 n=int(r['n']);s=n*n;w=[77]*(11*s+2*n);state=[77]*5
 count=f(list(map(int,r['ideal'])),list(map(int,r['phi'])),n,int(r['rank']),int(r['p']),w,state)
 iw=[77]*(11*s+2*n);istate=[77]*5
 icount=m.pari_small_radical_quotient(list(map(int,r['table'])),n,int(r['p']),[77]*(5*s+2*n),[77]*n,[77]*n,[77]*3,[77]*s,[77]*s,[77]*4,iw,istate)
 assert (icount,iw,istate)==(count,w,state)
 result.append({'count':count,'workspace':w,'state':state})
print(json.dumps(result))
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify(rows)}));
 function verify(r,got){
  const n=Number(r.n),s=n*n,d=Number(r.dimension);
  assert.deepEqual(got.state,[0,d,Number(r.kernelColumns),77,77]);assert.equal(got.count,Number(r.kernelColumns));
  for(const [offset,name]of [[s,'M'],[2*s,'Mi'],[3*s,'M2'],[4*s,'Mi2'],[7*s,'phi2'],[8*s,'kernel']]){
   const expected=r[name].map(Number);assert.deepEqual(got.workspace.slice(offset,offset+expected.length),expected,name);
   if(offset>=3*s)assert.deepEqual(got.workspace.slice(offset+expected.length,offset+s),Array(s-expected.length).fill(77),name+' tail');
  }
 }
 rows.forEach((r,i)=>verify(r,cp[i]));
 const built=await require('../../tools/native-kernel/compiler.cjs').compileKernel({sourcePath:path.join(__dirname,'quotient_projection.py')});
 const module=require(built.modulePath),f=module.pari_small_quotient_projection;
 for(const backend of ['javascript','gmp','tagged'])for(let i=0;i<rows.length;i++){
  const r=rows[i],n=Number(r.n),s=n*n;
  const buf=a=>f.createIntegerBuffer(a.length,3,a.map(BigInt)),fill=l=>buf(Array(l).fill(77));
  const ideal=buf(r.ideal),phi=buf(r.phi),w=fill(11*s+2*n),state=fill(5);
  const count=Number(f[backend](ideal,phi,BigInt(n),BigInt(r.rank),BigInt(r.p),w,state));
  const got={count,workspace:w.toArray().map(Number),state:state.toArray().map(Number)};
  verify(r,got);assert.deepEqual(got,cp[i]);
  assert.deepEqual(ideal.toArray().map(String),r.ideal.map(String));assert.deepEqual(phi.toArray().map(String),r.phi.map(String));
  const before=state.toArray();assert.throws(()=>f[backend](ideal,phi,BigInt(n),BigInt(r.rank),BigInt(r.p),fill(11*s+2*n-1),state),/short quotient projection storage/);assert.deepEqual(state.toArray(),before);
  const integrated=module.pari_small_radical_quotient,iw=fill(11*s+2*n),istate=fill(5),iphi=fill(s),irad=fill(s);
  const icount=Number(integrated[backend](buf(r.table),BigInt(n),BigInt(r.p),fill(5*s+2*n),fill(n),fill(n),fill(3),iphi,irad,fill(4),iw,istate));
  assert.deepEqual({count:icount,workspace:iw.toArray().map(Number),state:istate.toArray().map(Number)},cp[i]);
  assert.deepEqual(iphi.toArray().map(String),r.phi.map(String));assert.deepEqual(irad.toArray().slice(0,n*Number(r.rank)).map(String),r.ideal.map(String));
 }
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-quotient-projection-'));
 const sourceHashes=Object.fromEntries(['quotient_projection.py','pradical.py','small_prime_matrix_basis.py','small_prime_matrix_inverse.py','small_prime_matrix_kernel.py'].map(x=>[x,hash(fs.readFileSync(path.join(__dirname,x)))]));
 const result={cases:oracle.rows.length,backends:['cpython','javascript','gmp','tagged'],directory,sourceHashes,coreHash:hash(fs.readFileSync(built.coreSourcePath)),qualifiedTiming:false};
 fs.writeFileSync(path.join(directory,'fixtures.json'),JSON.stringify({oracle,expected:cp,result}));console.log(JSON.stringify(result));
})().catch(e=>{console.error(e);process.exitCode=1;});
