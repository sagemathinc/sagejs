"use strict";
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const {spawnSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const hash = x => createHash('sha256').update(x).digest('hex');
function run(command,args,options={}) {
  const r=spawnSync(command,args,{encoding:'utf8',timeout:120000,maxBuffer:32*1024*1024,...options});
  assert.equal(r.status,0,r.stderr||String(r.error)); return r.stdout;
}
(async()=>{
  const {collect} = require('./pradical_oracle.cjs');
  const oracle=await collect(path.resolve(process.argv[2]),path.resolve(process.argv[3]));
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-pradical-'));
  const cp=JSON.parse(run('python3',['-c',`
import sys,json,importlib
sys.path[:0]=sys.argv[1:3]
m=importlib.import_module('bench.pari-class-group-port.pradical')
rows=json.load(sys.stdin); outputs=[]
for r in rows:
 n=int(r['n']);p=int(r['p']);s=n*n
 table=list(map(int,r['table']));w=[77]*(5*s+2*n)
 phi=[77]*(s+2);rad=[77]*(s+2);d=[77]*6
 count=m.pari_small_pradical(table,n,p,w,[77]*n,[77]*n,[77]*3,phi,rad,d)
 assert phi[:s]==list(map(int,r['phi']))
 assert count==int(r['radicalColumns']) and rad[:n*count]==list(map(int,r['radical']))
 assert w[:s]==list(map(int,r['frobenius'])) and w[s:2*s]==list(map(int,r['frobeniusPower']))
 assert d[2:4]==[int(r['matrixProducts']),int(r['finalQ'])]
 assert phi[s:]==[77]*2 and rad[n*count:]==[77]*(s+2-n*count) and d[4:]==[77]*2
 outputs.append({'count':count,'phi':phi,'radical':rad,'diagnostic':d})
print(json.dumps(outputs))
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify(oracle.rows)}));
  const {compileKernel}=require('../../tools/native-kernel/compiler.cjs');
  const built=await compileKernel({sourcePath:path.join(__dirname,'pradical.py')});
  const module=require(built.modulePath),f=module.pari_small_pradical;
  let productCases=0;
  for(const backend of ['javascript','gmp','tagged']) {
    for(let i=0;i<oracle.rows.length;i++) {
      const row=oracle.rows[i],n=Number(row.n),s=n*n;
      const buffer=(values)=>f.createIntegerBuffer(values.length,3,values.map(BigInt));
      const fill=(length)=>buffer(Array(length).fill(77));
      const table=buffer(row.table),w=fill(5*s+2*n),phi=fill(s+2),rad=fill(s+2),d=fill(6);
      const count=f[backend](table,BigInt(n),BigInt(row.p),w,fill(n),fill(n),fill(3),phi,rad,d);
      assert.deepEqual({count:Number(count),phi:phi.toArray().map(Number),radical:rad.toArray().map(Number),diagnostic:d.toArray().map(Number)},cp[i],backend+' '+i);
      assert.deepEqual(w.toArray().slice(0,s).map(String),row.frobenius.map(String));
      assert.deepEqual(w.toArray().slice(s,2*s).map(String),row.frobeniusPower.map(String));
      assert.deepEqual(table.toArray().map(String),row.table.map(String));
      const before=[w,phi,rad,d].map(b=>b.toArray());
      assert.throws(()=>f[backend](table,BigInt(n),BigInt(row.p),fill(5*s+2*n-1),fill(n),fill(n),fill(3),phi,rad,d),/short pradical storage/);
      assert.deepEqual([w,phi,rad,d].map(b=>b.toArray()),before);
      if(i===0){
        const args=[table,BigInt(n),BigInt(row.p),w,fill(n),fill(n),fill(3),phi,rad,d];
        for(const [slot,length] of [[0,n*s-1],[3,5*s+2*n-1],[4,n-1],[5,n-1],[6,2],[7,s-1],[8,s-1],[9,3]]){
          const bad=args.slice();bad[slot]=fill(length);
          const owners=bad.filter(x=>typeof x==='object'),snapshots=owners.map(x=>x.toArray());
          assert.throws(()=>f[backend](...bad),/short pradical storage/);
          assert.deepEqual(owners.map(x=>x.toArray()),snapshots);
        }
        for(const [slot,value]of [[1,2n],[1,5n],[2,1n],[2,3037000494n]]){
          const bad=args.slice();bad[slot]=value;
          assert.throws(()=>f[backend](...bad),/small pradical domain/);
          assert.deepEqual([w,phi,rad,d].map(b=>b.toArray()),before);
        }
      }
    }
    const multiply=module.pari_small_fp_matrix_product;
    let seed=317n;
    for(const p of [2n,3n,37n,3037000493n])for(let n=1;n<=4;n++)for(let trial=0;trial<16;trial++) {
      const s=n*n,values=[];
      for(let i=0;i<2*s;i++){seed=(seed*6364136223846793005n+1n)&((1n<<64n)-1n);values.push(trial===0?p-1n:seed%p);}
      const want=[];
      for(let j=0;j<n;j++)for(let i=0;i<n;i++){
        let sum=0n;for(let k=0;k<n;k++)sum+=values[k*n+i]*values[s+j*n+k];want.push(sum%p);
      }
      const w=multiply.createIntegerBuffer(3*s+2,3,[...values,...Array(s+2).fill(77n)]);
      multiply[backend](w,0n,BigInt(s),BigInt(2*s),BigInt(n),p);
      assert.deepEqual(w.toArray(),[...values,...want,77n,77n]);
      if(backend==='javascript')productCases++;
    }
  }
  const sourceHashes=Object.fromEntries(['pradical.py','integral_frobenius.py','small_prime_matrix_kernel.py','integral_field_arithmetic.py','f2x_small.py','relation_cache.py'].map(name=>[name,hash(fs.readFileSync(path.join(__dirname,name)))]));
  const result={cases:oracle.rows.length,productCases,backends:['cpython','javascript','gmp','tagged'],directory,sourceHashes,coreHash:hash(fs.readFileSync(built.coreSourcePath)),qualifiedTiming:false};
  fs.writeFileSync(path.join(directory,'fixtures.json'),JSON.stringify({oracle,expected:cp,result}));
  console.log(JSON.stringify(result));
})().catch(e=>{console.error(e);process.exitCode=1;});
