"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const hash=x=>createHash('sha256').update(x).digest('hex');
function run(c,a,input){const r=spawnSync(c,a,{input,encoding:'utf8',timeout:120000,maxBuffer:32*1024*1024});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
(async()=>{
 const pari=path.resolve(process.argv[2]),archive=path.resolve(process.argv[3]),lib=path.join(pari,'Olinux-x86_64');
 assert.equal(hash(fs.readFileSync(archive)),'02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53');
 const source=run('tar',['-xOf',archive,'pari-2.17.4/src/basemath/FpX_factor.c']);
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-flx-polynomial-factor-'));
 const code=String.raw`#include "pari.h"
#include "paripriv.h"
int main(void){pari_init(64000000,10000);long d;ulong p,seed;
while(scanf("%ld%lu%lu",&d,&p,&seed)==3){pari_sp av=avma;GEN f=cgetg(d+3,t_VECSMALL);f[1]=0;for(long i=0;i<=d;i++)scanf("%lu",(ulong*)&f[i+2]);setrand(utoi(seed));GEN F=Flx_factor(f,p),P=gel(F,1),E=gel(F,2);printf("{\"factors\":[");for(long j=1;j<lg(P);j++){if(j>1)putchar(',');GEN z=gel(P,j);putchar('[');for(long i=0;i<=degpol(z);i++){if(i)putchar(',');printf("%lu",(ulong)z[i+2]);}putchar(']');}printf("],\"exponents\":[");for(long j=1;j<lg(E);j++){if(j>1)putchar(',');printf("%ld",E[j]);}printf("],\"state\":[");GEN state=getrand();for(long i=0;i<66;i++){if(i)putchar(',');ulong v=*int_W(state,i);if(i==65)v&=63;printf("\"%lu\"",v);}puts("]}");set_avma(av);}pari_close();return 0;}`;
 fs.writeFileSync(path.join(directory,'oracle.c'),code);run('cc',['-O1','-fsanitize=undefined','-fno-sanitize-recover=undefined','-I'+path.join(pari,'src/headers'),'-I'+lib,path.join(directory,'oracle.c'),'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',path.join(directory,'oracle')]);
 const base=[];
 for(let d=0;d<=4;d++)for(let packed=0;packed<3**d;packed++){let k=packed;const f=[];for(let i=0;i<d;i++){f.push(k%3);k=Math.floor(k/3);}f.push(1);base.push({f,p:3});}
 for(const p of [5,7,37])for(const f of [[20034,-20018,0,1],[20018,-20010,0,1],[-20034,-20018,0,0,1],[-2000042,-2000022,0,0,1]])base.push({f:f.map(x=>(x%p+p)%p),p});
 for(const p of [5,37])for(const f of [[0,1],[1,0,1],[1,2,1],[0,0,0,1],[0,0,0,0,1],[0,-6,11,-6,1],[4,0,5,0,1]])base.push({f:f.map(x=>(x%p+p)%p),p});
 const rows=base.flatMap(r=>[1,2].map(seed=>({...r,seed})));
 const expected=run(path.join(directory,'oracle'),[],rows.map(r=>[r.f.length-1,r.p,r.seed,...r.f].join(' ')).join('\n')+'\n').trim().split('\n').map(JSON.parse);
 const cp=JSON.parse(run('python3',['-c',`
import sys,json,importlib,hashlib
sys.path[:0]=sys.argv[1:3]
m=importlib.import_module('bench.pari-class-group-port.flx_small_polynomial_factor')
rng=importlib.import_module('bench.pari-class-group-port.pari_random')
out=[]
guard_degrees=set()
for row in json.load(sys.stdin):
 w=[77]*17000;w[:len(row['f'])]=row['f'];r=[77]*68;diag=[77]*5;md=[77]*3
 rng.pari_random_seed(r,row['seed'])
 count=m.pari_flx_small_polynomial_factor(w,0,len(row['f'])-1,row['p'],9,45,49,53,r,diag,md)
 out.append(dict(count=count,factors=[w[9+9*i:10+9*i+w[45+i]] for i in range(count)],exponents=w[49:49+count],state=list(map(str,r)),diagnostic=list(map(str,diag)),minpolyDiagnostic=list(map(str,md)),workspaceHash=hashlib.sha256(','.join(map(str,w)).encode()).hexdigest()))
 assert w[:len(row['f'])]==row['f'] and w[-6:]==[77]*6
 degree=len(row['f'])-1
 if degree not in guard_degrees:
  guard_degrees.add(degree)
  args=[w,0,degree,row['p'],9,45,49,53,r,diag,md]
  checks=[(2,-1),(2,5),(3,2),(3,4),(3,3037000494)]
  checks += [(i,-1) for i in [1,4,5,6,7]]
  checks += [(0,w[:16993]),(8,r[:65]),(9,diag[:2]),(10,[])]
  for index,value in checks:
   bad=[x.copy() if isinstance(x,list) else x for x in args]
   bad[index]=value.copy() if isinstance(value,list) else value
   before=[x.copy() if isinstance(x,list) else x for x in bad]
   try:m.pari_flx_small_polynomial_factor(*bad)
   except ValueError as error:assert 'frontier' in str(error) or 'short odd polynomial factor storage' in str(error)
   else:raise AssertionError('missing factor preflight guard')
   assert bad==before
  for position,value in [(degree,0)]+([(0,-1),(0,row['p'])] if degree else []):
   bad=[x.copy() if isinstance(x,list) else x for x in args];bad[0][position]=value
   before=[x.copy() if isinstance(x,list) else x for x in bad]
   try:m.pari_flx_small_polynomial_factor(*bad)
   except ValueError as error:assert 'monic frontier' in str(error) or 'canonical input required' in str(error)
   else:raise AssertionError('missing factor coefficient guard')
   assert bad==before
print(json.dumps(out))
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],JSON.stringify(rows)));
 for(let i=0;i<rows.length;i++){assert.deepEqual(cp[i].factors,expected[i].factors);assert.deepEqual(cp[i].exponents,expected[i].exponents);assert.deepEqual(cp[i].state,[...expected[i].state,'77','77']);}
 const built=await require('../../tools/native-kernel/compiler.cjs').compileKernel({sourcePath:path.join(__dirname,'flx_small_polynomial_factor.py')});
 const module=require(built.modulePath),f=module.pari_flx_small_polynomial_factor;
 // The independently qualified seed entry supplies initial state, not answers.
 const rngBuilt=await require('../../tools/native-kernel/compiler.cjs').compileKernel({sourcePath:path.join(__dirname,'pari_random.py')});const seedFn=require(rngBuilt.modulePath).pari_random_seed;
 const guarded=new Set();let nativeGuardCases=0;
 for(const backend of ['javascript','gmp','tagged'])for(let i=0;i<rows.length;i++){
  const row=rows[i],values=Array(17000).fill(77n);row.f.forEach((x,j)=>values[j]=BigInt(x));
  const w=f.createIntegerBuffer(values.length,40,values),r=f.createIntegerBuffer(68,40,Array(68).fill(77n)),diag=f.createIntegerBuffer(5,40,Array(5).fill(77n)),md=f.createIntegerBuffer(3,40,Array(3).fill(77n));
  seedFn.javascript(r,BigInt(row.seed));
  const count=Number(f[backend](w,0n,BigInt(row.f.length-1),BigInt(row.p),9n,45n,49n,53n,r,diag,md)),a=w.toArray().map(String);
  assert.deepEqual({count,factors:Array.from({length:count},(_,j)=>a.slice(9+9*j,10+9*j+Number(a[45+j])).map(Number)),exponents:a.slice(49,49+count).map(Number),state:r.toArray().map(String),diagnostic:diag.toArray().map(String),minpolyDiagnostic:md.toArray().map(String),workspaceHash:hash(a.join(','))},cp[i]);
  const degree=row.f.length-1,key=backend+':'+degree;
  if(!guarded.has(key)){
   guarded.add(key);
   const original=[w,0n,BigInt(degree),BigInt(row.p),9n,45n,49n,53n,r,diag,md],snapshot=args=>args.map(x=>typeof x==='bigint'?String(x):x.toArray().map(String));
   const before=snapshot(original),checks=[[2,-1n],[2,5n],[3,2n],[3,4n],[3,3037000494n],...[1,4,5,6,7].map(j=>[j,-1n]),[0,a.slice(0,16993)],[8,r.toArray().slice(0,65)],[9,diag.toArray().slice(0,2)],[10,[]]];
   for(const [index,value]of checks){const bad=original.slice();bad[index]=Array.isArray(value)?f.createIntegerBuffer(value.length,40,value.map(BigInt)):value;const snapshotBefore=snapshot(bad);assert.throws(()=>f[backend](...bad),/frontier|short odd polynomial factor storage/);assert.deepEqual(snapshot(bad),snapshotBefore);assert.deepEqual(snapshot(original),before);nativeGuardCases++;}
   for(const [position,value]of [[degree,0n],...(degree?[[0,-1n],[0,BigInt(row.p)]]:[])]){const copy=w.toArray();copy[position]=value;const bad=original.slice();bad[0]=f.createIntegerBuffer(copy.length,40,copy);const snapshotBefore=snapshot(bad);assert.throws(()=>f[backend](...bad),/monic frontier|canonical input required/);assert.deepEqual(snapshot(bad),snapshotBefore);assert.deepEqual(snapshot(original),before);nativeGuardCases++;}
  }
 }
 const result={cases:rows.length,nativeGuardCases,guardScope:'Representative degrees0..4: domain, negative offsets, short owners, monicity and canonical residues; no overlap checks claimed',backends:['cpython','javascript','gmp','tagged'],directory,sourceHash:hash(fs.readFileSync(path.join(__dirname,'flx_small_polynomial_factor.py'))),checkerHash:hash(fs.readFileSync(__filename)),upstreamHash:hash(source),coreHash:hash(fs.readFileSync(built.coreSourcePath)),qualifiedTiming:false};fs.writeFileSync(path.join(directory,'fixtures.json'),JSON.stringify({rows,expected,result}));console.log(JSON.stringify(result));
})().catch(e=>{console.error(e);process.exitCode=1;});
