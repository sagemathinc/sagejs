"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const hash=x=>createHash('sha256').update(x).digest('hex');
function run(c,a,o={}){const r=spawnSync(c,a,{encoding:'utf8',timeout:120000,maxBuffer:32*1024*1024,...o});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
(async()=>{
 const oracle=await require('./quotient_minpoly_oracle.cjs').collect(path.resolve(process.argv[2]),path.resolve(process.argv[3]));
 const cp=JSON.parse(run('python3',['-c',`
import sys,json,importlib
sys.path[:0]=sys.argv[1:3];f=importlib.import_module('bench.pari-class-group-port.quotient_minpoly').pari_small_quotient_minpoly
result=[]
for r in json.load(sys.stdin):
 n=int(r['n']);size=n*(n+2);w=[77]*(2*size+4*n+4);out=[77]*(n+4);d=[77]*4
 degree=f(list(map(int,r['matrix'])),n,int(r['p']),w,out,d)
 result.append({'degree':degree,'workspace':w,'coefficients':out,'diagnostic':d})
print(json.dumps(result))
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify(oracle.rows)}));
 function verify(r,got){
  const n=Number(r.n),s=n*(n+2),expected=r.coefficients.map(Number);
  assert.equal(got.degree,expected.length-1);assert.deepEqual(got.coefficients,[...expected,...Array(n+4-expected.length).fill(77)]);
  assert.deepEqual(got.workspace.slice(0,s),r.powers.map(Number));assert.deepEqual(got.diagnostic,[n,Number(r.firstDependent),77,77]);
 }
 oracle.rows.forEach((r,i)=>verify(r,cp[i]));
 const built=await require('../../tools/native-kernel/compiler.cjs').compileKernel({sourcePath:path.join(__dirname,'quotient_minpoly.py')});
 const f=require(built.modulePath).pari_small_quotient_minpoly;
 for(const backend of ['javascript','gmp','tagged'])for(let i=0;i<oracle.rows.length;i++){
  const r=oracle.rows[i],n=Number(r.n),s=n*(n+2),buf=a=>f.createIntegerBuffer(a.length,3,a.map(BigInt)),fill=l=>buf(Array(l).fill(77));
  const matrix=buf(r.matrix),w=fill(2*s+4*n+4),out=fill(n+4),d=fill(4);
  const degree=Number(f[backend](matrix,BigInt(n),BigInt(r.p),w,out,d));
  const got={degree,workspace:w.toArray().map(Number),coefficients:out.toArray().map(Number),diagnostic:d.toArray().map(Number)};
  verify(r,got);assert.deepEqual(got,cp[i]);assert.deepEqual(matrix.toArray().map(String),r.matrix.map(String));
  const before=[out,d].map(x=>x.toArray());assert.throws(()=>f[backend](matrix,BigInt(n),BigInt(r.p),fill(2*s+4*n+3),out,d),/short quotient minimal polynomial storage/);assert.deepEqual([out,d].map(x=>x.toArray()),before);
  if(i===0){
   const args=[matrix,BigInt(n),BigInt(r.p),w,out,d];
   for(const [slot,length]of [[0,n*n-1],[3,2*s+4*n+3],[4,n+1],[5,1]]){
    const bad=args.slice();bad[slot]=fill(length);const owners=bad.filter(x=>typeof x==='object'),snap=owners.map(x=>x.toArray());
    assert.throws(()=>f[backend](...bad),/short quotient minimal polynomial storage/);assert.deepEqual(owners.map(x=>x.toArray()),snap);
   }
   for(const [slot,value]of [[1,0n],[1,5n],[2,1n],[2,3037000494n]]){
    const bad=args.slice();bad[slot]=value;assert.throws(()=>f[backend](...bad),/small quotient minimal polynomial domain/);assert.deepEqual([out,d].map(x=>x.toArray()),before);
   }
  }
 }
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-quotient-minpoly-'));
 const sourceHashes=Object.fromEntries(['quotient_minpoly.py','small_prime_matrix_kernel.py'].map(x=>[x,hash(fs.readFileSync(path.join(__dirname,x)))]));
 const result={cases:oracle.rows.length,backends:['cpython','javascript','gmp','tagged'],directory,sourceHashes,coreHash:hash(fs.readFileSync(built.coreSourcePath)),qualifiedTiming:false};
 fs.writeFileSync(path.join(directory,'fixtures.json'),JSON.stringify({oracle,expected:cp,result}));console.log(JSON.stringify(result));
})().catch(e=>{console.error(e);process.exitCode=1;});
