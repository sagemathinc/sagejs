"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {compileKernel}=require('../../tools/native-kernel/compiler.cjs');
const hash=x=>createHash('sha256').update(x).digest('hex');
function run(c,a,o={}){const r=spawnSync(c,a,{encoding:'utf8',timeout:120000,maxBuffer:64*1024*1024,...o});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
(async()=>{
 const pari=path.resolve(process.argv[2]),archive=path.resolve(process.argv[3]),lib=path.join(pari,'Olinux-x86_64');
 assert.equal(hash(fs.readFileSync(archive)),'02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53');
 const source=run('tar',['-xOf',archive,'pari-2.17.4/src/basemath/hnf_snf.c']);
 const part=(a,b)=>{const i=source.indexOf(a),j=source.indexOf(b,i+a.length);assert(i>=0&&j>i);return source.slice(i,j);};
 const elem=part('static void\nZC_elem(','INLINE int');
 let smith=part('static void\nsnf_pile1(','GEN\nZM_snfall(GEN');
 // Only U=V=NULL is exercised; remove the unreachable update dependency,
 // not any operation in the invariant-only source path.
 smith=smith.replaceAll('ZM_snfall_i(', 'experiment_snf(')
  .replace('if (U) update(u,v,a,b,(GEN*)(U+i),(GEN*)(U+j));','if (U) pari_err_BUG("unexpected transformation request");')
  .replace('ZC_elem(b, a, x,NULL, j,i);','counts[2]++; ZC_elem(b, a, x,NULL, j,i);')
  .replace('d = bezout_step(&a, &b, &u, &v);','counts[3]++; d = bezout_step(&a, &b, &u, &v);')
  .replace('/* x[k,j] != 0 mod b */','counts[4]++; /* x[k,j] != 0 mod b */')
  .replace('if (lgefint(c) > l) gcoeff(x,i,j) = remii(c, p);','if (lgefint(c) > l) { counts[5]++; gcoeff(x,i,j) = remii(c, p); }');
 const cases=[];let seed=81921;function rnd(n){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;}
 for(let n=0;n<=10;n++)for(let variant=0;variant<30;variant++){
  const diagonal=Array.from({length:n},()=>BigInt(variant===0?1:1+rnd(60)));
  const a=Array.from({length:n*n},(_,x)=>{const i=x%n,j=Math.floor(x/n);return i>j?0n:i===j?diagonal[i]:BigInt(rnd(Number(diagonal[i])));});
  cases.push({n,a:a.map(String)});
 }
 for(const bits of [65n,128n,256n,512n])for(let n=1;n<=6;n++)for(let variant=0;variant<3;variant++){
  const diagonal=Array.from({length:n},()=>((1n<<bits)+BigInt(rnd(64)))*BigInt(1+rnd(9)));
  const a=Array.from({length:n*n},(_,x)=>{const i=x%n,j=Math.floor(x/n);return i>j?0n:i===j?diagonal[i]:variant===0?0n:BigInt(rnd(99));});
  cases.push({n,a:a.map(String)});
 }
 // Distinguish C4 from C2 x C2 despite their identical determinant.
 cases.push({n:2,a:['2','0','1','2']},{n:2,a:['2','0','0','2']});
 for(let n=7;n<=17;n++)cases.push({n,a:Array.from({length:n*n},(_,i)=>i%n===Math.floor(i/n)?'6':'0')});
 let collectorFixtureSha256=null;
 const collectorIndex=process.argv.indexOf('--collector-fixtures');
 if(collectorIndex>=0){
  assert(process.argv[collectorIndex+1],'--collector-fixtures requires a JSON path');
  const bytes=fs.readFileSync(path.resolve(process.argv[collectorIndex+1])),fixture=JSON.parse(bytes);
  collectorFixtureSha256=hash(bytes);
  assert(Array.isArray(fixture.expected)&&Array.isArray(fixture.summary?.result),'collector fixture schema');
  let added=0;
  for(const e of fixture.expected){
   const result=fixture.summary.result.find(r=>r.field===e.field);
   if(!result||result.hnfStatus!==0||e.hnfState[3]!==0)continue;
   const n=e.hnfState[0];assert(Number.isInteger(n)&&n>=0);assert.equal(e.H.length,n*n);
   let values=e.H,origin='oracle H matched by collector replay';
   if(fixture.nativeOutputs){
    const native=fixture.nativeOutputs.find(r=>r.backend==='gmp'&&r.field===e.field);
    assert(native,'missing actual GMP collector output');assert.deepEqual(native.H,e.H);assert.deepEqual(native.hnfState,e.hnfState);
    values=native.H;origin='actual GMP collector H output';
   }
   cases.push({n,a:values.map(String),collectorField:e.field,relations:e.last,origin});added++;
  }
  assert(added>=2,'expected at least two full-rank translated collector HNF candidates');
 }
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-class-invariants-')),file=path.join(dir,'oracle.c'),exe=path.join(dir,'oracle');
 fs.writeFileSync(file,`/* PARI 2.17.4 differential harness, GPL-2.0-or-later. */
#include "pari.h"
#include "paripriv.h"
static long counts[6];
${elem}
${smith}
int main(void){pari_init(256000000,1000);long count;if(scanf("%ld",&count)!=1)return 2;for(long t=0;t<count;t++){pari_sp av=avma;long n;if(scanf("%ld",&n)!=1)return 3;GEN A=cgetg(n+1,t_MAT);for(long j=1;j<=n;j++){gel(A,j)=cgetg(n+1,t_COL);for(long i=1;i<=n;i++){char s[8192];if(scanf("%8191s",s)!=1)return 4;gcoeff(A,i,j)=gp_read_str(s);}}for(long i=0;i<6;i++)counts[i]=0;GEN d=experiment_snf(A,NULL,NULL,1),U,V,D=ZM_snfall(A,&U,&V);if(!gequal(d,ZM_snf(A))||!gequal(ZM_mul(ZM_mul(U,A),V),D))return 5;printf("{\\\"d\\\":[");for(long i=1;i<=n;i++){if(!equalii(gel(d,i),gcoeff(D,i,i)))return 6;if(!is_pm1(gel(d,i)))counts[1]++;if(i>1)putchar(',');pari_printf("\\\"%Ps\\\"",gel(d,i));}printf("],\\\"state\\\":[");for(long i=0;i<6;i++){if(i)putchar(',');printf("%ld",counts[i]);}puts("]}");avma=av;}pari_close();return 0;}
`);
 run('cc',['-O1','-fsanitize=undefined','-fno-sanitize-recover=undefined','-I'+path.join(pari,'src/headers'),'-I'+lib,file,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',exe]);
 const trace=run(exe,[],{input:[cases.length,...cases.flatMap(r=>[r.n,...r.a])].join(' ')}),records=trace.trim().split('\n').map(JSON.parse),expected=records.map(r=>r.d);
 const stats=JSON.parse(run('python3',['-c',`import sys,json,importlib
sys.path[:0]=sys.argv[1:3];f=importlib.import_module('bench.pari-class-group-port.class_invariant_output').pari_class_invariant_output
counts=[0]*6;states=[]
for ix,(r,e) in enumerate(zip(*json.load(sys.stdin))):
 n=r['n'];a=list(map(int,r['a']));d=list(map(int,e));cyc=[x for x in d if x!=1];args=[a+[999],n,[77]*(n*n+2),[77]*(n+2),[77]*(n+2),[77]*3,[77]*8]
 assert f(*args)==0
 assert args[4]==cyc+[77]*(n+2-len(cyc)),(ix,args[4],cyc)
 h=1
 for x in cyc:h*=x
 assert args[5]==[h,77,77]
 assert args[6][0:2]==[0,len(cyc)] and args[6][-2:]==[77]*2
 assert args[2]==[d[i%n] if i%n==i//n else 0 for i in range(n*n)]+[77]*2,(ix,args[2],d)
 assert args[0]==a+[999] and args[3][-2:]==[77]*2
 for i,v in enumerate(args[6][:6]):counts[i]+=v
 states.append(args[6][:6])
for a in [[0,0,0,1],[2,1,0,2],[2,0,-1,2],[2,0,2,2]]:
 args=[a,2,[77]*4,[77]*2,[77]*2,[77],[77]*6];before=[x[:] if isinstance(x,list) else x for x in args]
 assert f(*args)==-1
 before[6][0]=-1;assert args==before
for idx in [0,2,3,4,5,6]:
 args=[[2,0,1,2],2,[77]*4,[77]*2,[77]*2,[77],[77]*6];args[idx]=[];before=str(args)
 try:f(*args)
 except ValueError:pass
 else:raise AssertionError('accepted short owner')
 assert str(args)==before
print(json.dumps({'counts':counts,'states':states}))
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify([cases,expected])}));
 const collectorCandidates=cases.flatMap((r,i)=>r.collectorField===undefined?[]:[{field:r.collectorField,relations:r.relations,dimension:r.n,inputOrigin:r.origin,invariants:expected[i].filter(x=>x!=='1'),classNumberCandidate:expected[i].reduce((a,b)=>a*BigInt(b),1n).toString()}]);
 const summary={cases:cases.length,counts:stats.counts,traceSha256:hash(trace),ubsan:true,qualifiedTiming:false,artifactDirectory:dir,collectorFixtureSha256,collectorCandidates,collectorCompletenessClaim:false};
 assert.deepEqual(stats.states,records.map(r=>r.state),'source operation counts');
 if(process.argv.includes('--source-only')){console.log(JSON.stringify(summary));return;}
 const built=await compileKernel({sourcePath:path.join(__dirname,'class_invariant_output.py')}),f=require(built.modulePath).pari_class_invariant_output;assert(f.nativeAvailable);
 assert.doesNotMatch(fs.readFileSync(built.coreSourcePath,'utf8'),/napi_call_function|PyObject_Call|v8::/);
 for(const backend of ['javascript','gmp','tagged'])for(let ix=0;ix<cases.length;ix++){
  const r=cases[ix],d=expected[ix].map(BigInt),cyc=d.filter(x=>x!==1n),n=r.n,make=k=>f.createIntegerBuffer(k,512,Array(k).fill(77n));
  const raw=f.createIntegerBuffer(r.a.length+1,512,[...r.a.map(BigInt),999n]);
  const args=[raw,BigInt(n),make(n*n+2),make(n+2),make(n+2),make(3),Array(8).fill(77n)];
  assert.equal(f[backend](...args),0n);
  assert.deepEqual(args[4].toArray(),[...cyc,...Array(n+2-cyc.length).fill(77n)],backend+' '+ix);
  assert.deepEqual(args[5].toArray(),[cyc.reduce((a,b)=>a*b,1n),77n,77n]);
  assert.deepEqual(args[2].toArray(),[...Array.from({length:n*n},(_,i)=>i%n===Math.floor(i/n)?d[i%n]:0n),77n,77n]);
  assert.deepEqual(args[6],[...stats.states[ix].map(BigInt),77n,77n]);
  assert.deepEqual(raw.toArray(),[...r.a.map(BigInt),999n]);assert.deepEqual(args[3].toArray().slice(-2),[77n,77n]);
 }
 for(const backend of ['javascript','gmp','tagged']){
  for(const a of [[0n,0n,0n,1n],[2n,1n,0n,2n],[2n,0n,-1n,2n],[2n,0n,2n,2n]]){
   const args=[a,2n,Array(4).fill(77n),Array(2).fill(77n),Array(2).fill(77n),[77n],Array(6).fill(77n)],before=structuredClone(args);
   assert.equal(f[backend](...args),-1n);before[6][0]=-1n;assert.deepEqual(args,before);
  }
  for(const idx of [0,2,3,4,5,6]){
   const args=[[2n,0n,1n,2n],2n,Array(4).fill(77n),Array(2).fill(77n),Array(2).fill(77n),[77n],Array(6).fill(77n)];args[idx]=[];const before=structuredClone(args);assert.throws(()=>f[backend](...args));assert.deepEqual(args,before);
  }
 }
 console.log(JSON.stringify({...summary,coreBytes:fs.statSync(built.coreSourcePath).size,cacheKey:built.cacheKey,sourceSha256:hash(fs.readFileSync(path.join(__dirname,'class_invariant_output.py')))}));
})().catch(e=>{console.error(e);process.exitCode=1;});
