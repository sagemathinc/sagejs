"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const hash=x=>createHash('sha256').update(x).digest('hex');
(async()=>{
 const catalogPath=path.resolve(process.argv[2]||'/tmp/sagejs-analytic-invhr-d88QqB/fixtures.json'),bytes=fs.readFileSync(catalogPath),catalog=JSON.parse(bytes);
 const polynomials=[[20034,-20018,0,1],[20018,-20010,0,1],[-20034,-20018,0,0,1],[-2000042,-2000022,0,0,1]],indices=[1,3,1,37];
 const rows=catalog.cases.map((c,field)=>{const selected=c.primes.map((p,i)=>({p,i})).filter(({p},i)=>(field===0||i<64)&&BigInt(indices[field])%BigInt(p)!==0n);return {field,polynomial:polynomials[field].map(String),index:indices[field],primes:selected.map(x=>x.p),expected:selected.map(({i})=>{const o=Number(c.offsets[i]),n=Number(c.counts[i]);return {degrees:c.degrees.slice(o,o+n).map(String),counts:c.multiplicities.slice(o,o+n).map(String)};})};});
 const packets=rows.map(r=>{const n=r.polynomial.length-1,k=r.primes.length,fill=l=>Array(l).fill('77');return [r.polynomial,String(n),String(r.index),r.primes,String(k),fill(393),fill(n+2),fill(n+2),fill(n+2),fill(n+2),fill(5),fill(k+2),fill(k+2),fill(k*n+2),fill(k*n+2),fill(k+2),fill(k+2),fill(k*n+2),fill(6)];});
 const cp=spawnSync('python3',['-c',`
import sys,json,importlib
sys.path[:0]=sys.argv[1:3]
f=importlib.import_module('bench.pari-class-group-port.prime_degree_catalog').pari_prime_degree_catalog
out=[]
for packet in json.load(sys.stdin):
 args=[list(map(int,x)) if isinstance(x,list) else int(x) for x in packet]
 result=f(*args)
 out.append({'result':result,'args':[[str(v) for v in x] if isinstance(x,list) else str(x) for x in args]})
 # Include a divisor late in the catalog: no earlier output may publish.
 for kind in ['index','prime','short']:
  bad=[x.copy() if isinstance(x,list) else x for x in args]
  expected=-3
  if kind=='index':bad[2]=bad[3][-1]
  elif kind=='prime':bad[3][-1]=3037000499;expected=-5
  else:bad[13]=[77]*(bad[4]*bad[1]-1);expected=-6
  before=[x.copy() if isinstance(x,list) else x for x in bad]
  assert f(*bad)==expected
  assert bad[:18]==before[:18]
  assert bad[18]==[expected,0,0,0]+before[18][4:]
print(json.dumps(out))
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify(packets),encoding:'utf8',timeout:120000,maxBuffer:32*1024*1024});assert.equal(cp.status,0,cp.stderr);const expected=JSON.parse(cp.stdout);
 function verify(row,got,index){assert.equal(got.result,0);const a=got.args,po=[],pc=[],pd=[],pm=[],fo=[],fc=[],fd=[];for(const e of row.expected){po.push(String(pd.length));pc.push(String(e.degrees.length));fo.push(String(fd.length));let count=0;for(let j=0;j<e.degrees.length;j++){pd.push(e.degrees[j]);pm.push(e.counts[j]);for(let k=0;k<Number(e.counts[j]);k++){fd.push(e.degrees[j]);count++;}}fc.push(String(count));}for(const [i,active]of [[11,po],[12,pc],[13,pd],[14,pm],[15,fo],[16,fc],[17,fd]])assert.deepEqual(a[i],[...active,...Array(packets[index][i].length-active.length).fill('77')]);assert.deepEqual(a[18],['0',String(row.primes.length),String(pd.length),String(fd.length),'77','77']);assert.deepEqual(a[0],row.polynomial);assert.deepEqual(a[3],row.primes.map(String));}
 rows.forEach((r,i)=>verify(r,expected[i],i));
 const built=await require('../../tools/native-kernel/compiler.cjs').compileKernel({sourcePath:path.join(__dirname,'prime_degree_catalog.py')});const f=require(built.modulePath).pari_prime_degree_catalog,nativeOutputs=[];
 for(const backend of ['javascript','gmp','tagged'])for(let i=0;i<rows.length;i++){
  const args=packets[i].map(x=>Array.isArray(x)?f.createIntegerBuffer(x.length,16,x.map(BigInt)):BigInt(x));const result=Number(f[backend](...args)),snap=a=>a.map(x=>typeof x==='bigint'?String(x):x.toArray().map(String)),got={result,args:snap(args)};assert.deepEqual(got,expected[i]);verify(rows[i],got,i);nativeOutputs.push({backend,field:rows[i].field,patternOffsets:got.args[11],patternCounts:got.args[12],patternDegrees:got.args[13],patternMultiplicities:got.args[14],fullOffsets:got.args[15],fullCounts:got.args[16],fullDegrees:got.args[17],state:got.args[18]});
  for(const kind of ['index','prime','short']){const bad=args.slice();bad[18]=f.createIntegerBuffer(6,16,Array(6).fill(77n));let status=-3;
   if(kind==='index')bad[2]=BigInt(rows[i].primes.at(-1));else if(kind==='prime'){const p=rows[i].primes.map(BigInt);p[p.length-1]=3037000499n;bad[3]=f.createIntegerBuffer(p.length,16,p);status=-5;}else{const length=rows[i].primes.length*(rows[i].polynomial.length-1)-1;bad[13]=f.createIntegerBuffer(length,16,Array(length).fill(77n));status=-6;}
   const before=snap(bad);assert.equal(Number(f[backend](...bad)),status);const after=snap(bad);assert.deepEqual(after.slice(0,18),before.slice(0,18));assert.deepEqual(after[18],[String(status),'0','0','0','77','77']);
  }
 }
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-prime-degree-catalog-')),result={cases:rows.length,primeCounts:rows.map(r=>r.primes.length),backends:['cpython','javascript','gmp','tagged'],directory,catalogHash:hash(bytes),sourceHash:hash(fs.readFileSync(path.join(__dirname,'prime_degree_catalog.py'))),coreHash:hash(fs.readFileSync(built.coreSourcePath)),qualifiedTiming:false};fs.writeFileSync(path.join(directory,'fixtures.json'),JSON.stringify({rows,packets,expected,nativeOutputs,result}));console.log(JSON.stringify(result));
})().catch(e=>{console.error(e);process.exitCode=1;});
