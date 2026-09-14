"use strict";
// Pinned source extraction, not a handwritten C cleanup/HNF implementation.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {compileKernel}=require('../../tools/native-kernel/compiler.cjs');
function run(cmd,args,options={}){const r=spawnSync(cmd,args,{encoding:'utf8',timeout:120000,maxBuffer:64*1024*1024,...options});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
function part(s,a,b){const i=s.indexOf(a),j=s.indexOf(b,i);assert(i>=0&&j>i);return s.slice(i,j);}
(async()=>{
 const pari=path.resolve(process.argv[2]),archive=path.resolve(process.argv[3]),lib=path.join(pari,'Olinux-x86_64');
 // Reuse all original deterministic/real fixtures and prefix snapshots. This
 // export also verifies the pinned archive and separately UBSan-rejects the
 // original three undefined signed-word executions; it runs no native kernel.
 const fixture=JSON.parse(run(process.execPath,[path.join(__dirname,'check_hnfspec_sparse.cjs'),pari,archive,'--export-cleanup-fixtures']));
 const {cases,expected:before,unsafe}=fixture;
 const original=fs.readFileSync(path.join(pari,'src/basemath/hnf_snf.c'),'utf8');
 assert.equal(createHash('sha256').update(original).digest('hex'),fixture.sourceHash);
 const counts=part(original,'static int\ncount(','static GEN\nhnffinal('),copies=part(original,'static void\np_mat(','/* permutation giving imagecompl');
 let body=part(original,'GEN\nhnfspec_i(','  if (!col) {\n    permpro = identity_perm(lnz);');
 const bodyHash=createHash('sha256').update(counts+copies+body).digest('hex');
 const replace=(a,b)=>{assert.equal(body.split(a).length,2,a);body=body.replace(a,b);};
 replace('hnfspec_i(','cleanup_oracle(');
 replace('s = signe(v); if (!s) continue;','s = signe(v); if (!s) {cleanup_state[6]++;continue;}');
 replace('{ for (h=1; h<i0; h++) gel(Bj,h) = subii(gel(Bj,h), gel(Bk,h)); }','{ cleanup_state[7]++; for (h=1; h<i0; h++) gel(Bj,h) = subii(gel(Bj,h), gel(Bk,h)); }');
 replace('{ for (h=1; h<i0; h++) gel(Bj,h) = addii(gel(Bj,h), gel(Bk,h)); }','{ cleanup_state[8]++; for (h=1; h<i0; h++) gel(Bj,h) = addii(gel(Bj,h), gel(Bk,h)); }');
 replace('for (h=1; h<i0; h++) gel(Bj,h) = subii(gel(Bj,h), mulii(v,gel(Bk,h)));','cleanup_state[9]++; for (h=1; h<i0; h++) gel(Bj,h) = subii(gel(Bj,h), mulii(v,gel(Bk,h)));');
 body+=`\ncleanup_state[0]=lig-k0;cleanup_state[1]=nlze;cleanup_state[2]=lnz;
cleanup_state[3]=col;cleanup_state[4]=co-1;cleanup_state[5]=T!=NULL;
return mkvec4(matb,matt,T?T:cgetg(1,t_MAT),extramat);\n}\n`;
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-hnfspec-cleanup-')),c=path.join(dir,'oracle.c'),exe=path.join(dir,'oracle');
 fs.writeFileSync(c,`/* PARI group GPL-2.0-or-later source, without warranty. */
#include "pari.h"
#include "paripriv.h"
_Static_assert(sizeof(long)==8,"pinned 64-bit word model required");
#define DEBUGLEVEL DEBUGLEVEL_mathnf
static long cleanup_state[10];
${counts}\n${copies}\n${body}
static void exact(GEN m){putchar('[');for(long j=1;j<lg(m);j++)for(long i=1;i<lg(gel(m,j));i++){if(j!=1||i!=1)putchar(',');pari_printf("\\"%Ps\\"",gmael(m,j,i));}putchar(']');}
int main(void){pari_init(64000000,1000);long cases;if(scanf("%ld",&cases)!=1)return 2;
for(long z=0;z<cases;z++){pari_sp av=avma;long rows,columns,k0,cr;if(scanf("%ld%ld%ld%ld",&rows,&columns,&k0,&cr)!=4)return 3;
GEN perm=cgetg(rows+1,t_VECSMALL),mat=cgetg(columns+1,t_MAT),C=zeromat(cr,columns),dep=NULL,B=NULL;
for(long i=1;i<=rows;i++)if(scanf("%ld",&perm[i])!=1)return 4;
for(long j=1;j<=columns;j++){gel(mat,j)=cgetg(rows+1,t_VECSMALL);for(long i=1;i<=rows;i++)if(scanf("%ld",&mael(mat,j,i))!=1)return 5;}
for(long i=0;i<10;i++)cleanup_state[i]=0;GEN out=cleanup_oracle(mat,perm,&dep,&B,&C,k0);
printf("{\\"bottom\\":");exact(gel(out,1));printf(",\\"dense\\":");exact(gel(out,2));printf(",\\"T\\":");exact(gel(out,3));printf(",\\"extra\\":");exact(gel(out,4));
printf(",\\"state\\":[");for(long i=0;i<10;i++){if(i)putchar(',');printf("\\"%ld\\"",cleanup_state[i]);}puts("]}");avma=av;
}pari_close();return 0;}
`);
 run('cc',['-O1','-fsanitize=undefined','-fno-sanitize-recover=undefined','-I'+path.join(pari,'src/headers'),'-I'+lib,c,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',exe]);
 const input=[cases.length,...cases.flatMap(r=>[r.rows,r.columns,r.k0,r.cRows,...r.perm,...r.mat])].join(' ');
 const trace=run(exe,[],{input}),expected=trace.trim().split('\n').map(JSON.parse);assert.equal(expected.length,cases.length);
 let products=0,maximumBits=0,changedT=0;const branches=[0,0,0,0];
 for(let z=0;z<cases.length;z++){
  const r=cases[z],e=expected[z],s=e.state.map(Number),retained=s[4],T=e.T.map(BigInt);
  changedT+=JSON.stringify(e.T)!==JSON.stringify(before[z].T);
  for(let k=0;k<4;k++)branches[k]+=s[k+6];
  for(const value of [...e.T,...e.bottom,...e.dense,...e.extra]){const v=BigInt(value);maximumBits=Math.max(maximumBits,(v<0n?-v:v).toString(2).length);}
  if(s[5])for(let j=0;j<retained;j++)for(let i=0;i<Number(before[z].state[1]);i++){
   let sum=0n;for(let h=0;h<retained;h++)sum+=BigInt(r.mat[h*r.rows+before[z].perm[i]-1])*T[j*retained+h];
   assert.equal(sum,BigInt(i<r.k0?e.dense[j*r.k0+i]:e.bottom[j*s[0]+i-r.k0]),'active transformation '+z);products++;
  }
 }
 assert(branches.every(n=>n>0));assert(changedT>0&&products>0&&maximumBits>64&&maximumBits<=4096);
 for(const r of unsafe){const result=spawnSync(exe,[],{input:[1,r.rows,r.columns,r.k0,r.cRows,...r.perm,...r.mat].join(' '),encoding:'utf8',timeout:10000});assert.notEqual(result.status,0);assert.match(result.stderr,/runtime error:/);}
 run('python3',['-c',`import sys,json,importlib
sys.path[:0]=sys.argv[1:3];m=importlib.import_module('bench.pari-class-group-port.hnfspec_cleanup')
for r,p,e in json.load(sys.stdin):
 rows=r['rows'];cols=r['columns'];k0=r['k0'];s=list(map(int,e['state']));retained=s[4]
 raw=list(map(int,r['mat']))+[-(1<<63)];perm=r['perm'][:];mat=[77]*(rows*cols+2);dense=[77]*(k0*cols+2);T=[77]*(cols*cols+2);vmax=[77]*(cols+2);found=[77];sp=[77]*15;bottom=[77]*((rows-k0)*cols+2);updated=[77]*(k0*cols+2);extra=[77]*(rows*cols+2);state=[77]*12
 result=m.pari_hnfspec_cleanup(raw,rows,cols,perm,k0,r['cRows'],mat,dense,T,vmax,found,sp,bottom,updated,extra,state)
 assert result==int(p['state'][5]) and sp[:13]==list(map(int,p['state']))
 assert state==s+[77,77] and perm==p['perm']
 for actual,want in [(mat,p['mat']),(dense,p['dense']),(updated,e['dense']),(extra,e['extra']),(T,e['T'])]:
  want=list(map(int,want));assert actual[:len(want)]==want and actual[len(want):]==[77]*(len(actual)-len(want))
 live=[bottom[j*(rows-k0)+i] for j in range(retained) for i in range(s[0])];assert live==list(map(int,e['bottom']))
 assert bottom[retained*(rows-k0):]==[77]*(len(bottom)-retained*(rows-k0))
 assert sp[13:]==[77,77] and raw==list(map(int,r['mat']))+[-(1<<63)]
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify(cases.map((r,i)=>[r,before[i],expected[i]]))});
 run('python3',['-c',`import sys,json,importlib
sys.path[:0]=sys.argv[1:3];m=importlib.import_module('bench.pari-class-group-port.hnfspec_cleanup')
for variant in range(7):
 raw=[2,1,0,2];rows=2;cols=2;k0=1;perm=[1,2];mat=[77]*4;dense=[77]*2;T=[77]*4;vmax=[77]*2;found=[77];sp=[77]*13;bottom=[77]*2;updated=[77]*2;extra=[77]*4;state=[77]*10
 if variant==0:bottom=bottom[:1]
 if variant==1:updated=updated[:1]
 if variant==2:extra=extra[:3]
 if variant==3:state=state[:9]
 if variant==4:perm=[1,1]
 if variant==5:rows=-1
 if variant==6:sp=sp[:12]
 buffers=(raw,perm,mat,dense,T,vmax,found,sp,bottom,updated,extra,state);before=str(buffers)
 try:m.pari_hnfspec_cleanup(raw,rows,cols,perm,k0,1,mat,dense,T,vmax,found,sp,bottom,updated,extra,state)
 except ValueError:pass
 else:raise AssertionError('malformed input accepted')
 assert str(buffers)==before
for r in json.load(sys.stdin):
 rows=r['rows'];cols=r['columns'];k0=r['k0'];state=[77]*10
 try:m.pari_hnfspec_cleanup(list(map(int,r['mat'])),rows,cols,r['perm'][:],k0,r['cRows'],[0]*(rows*cols),[0]*(k0*cols),[0]*(cols*cols),[0]*cols,[0],[0]*13,[0]*((rows-k0)*cols),[0]*(k0*cols),[0]*(rows*cols),state)
 except ValueError as e:assert 'undefined upstream' in str(e)
 else:raise AssertionError('undefined source input accepted')
 assert state==[77]*10
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify(unsafe)});
 const built=await compileKernel({sourcePath:path.join(__dirname,'hnfspec_cleanup.py')}),m=require(built.modulePath),f=m.pari_hnfspec_cleanup;
 assert(f.nativeAvailable);assert.doesNotMatch(fs.readFileSync(built.coreSourcePath,'utf8'),/napi_call_function|PyObject_Call|v8::/);
 for(const backend of ['javascript','gmp'])for(let z=0;z<cases.length;z++){
  const r=cases[z],e=expected[z],p=before[z],rows=r.rows,cols=r.columns,k0=r.k0,s=e.state.map(Number),retained=s[4];
  const words=n=>Array(n).fill(77n),exact=n=>f.createIntegerBuffer(n,64,words(n));
  const raw=[...r.mat.map(BigInt),-(1n<<63n)],perm=r.perm.map(BigInt),mat=words(rows*cols+2),dense=exact(k0*cols+2),T=exact(cols*cols+2),vmax=words(cols+2),found=[77n],sp=words(15),bottom=exact((rows-k0)*cols+2),updated=exact(k0*cols+2),extra=exact(rows*cols+2),state=words(12);
  assert.equal(f[backend](raw,BigInt(rows),BigInt(cols),perm,BigInt(k0),BigInt(r.cRows),mat,dense,T,vmax,found,sp,bottom,updated,extra,state),BigInt(p.state[5]));
  assert.deepEqual(sp,[...p.state.map(BigInt),77n,77n]);assert.deepEqual(state,[...e.state.map(BigInt),77n,77n]);assert.deepEqual(perm,p.perm.map(BigInt));
  for(const [actual,want]of [[mat,p.mat],[dense.toArray(),p.dense],[updated.toArray(),e.dense],[extra.toArray(),e.extra],[T.toArray(),e.T]])assert.deepEqual(actual,[...want.map(BigInt),...words(actual.length-want.length)]);
  const b=bottom.toArray(),live=[];for(let j=0;j<retained;j++)for(let i=0;i<s[0];i++)live.push(b[j*(rows-k0)+i]);assert.deepEqual(live,e.bottom.map(BigInt));assert.deepEqual(b.slice(retained*(rows-k0)),words(b.length-retained*(rows-k0)));
  assert.deepEqual(raw,[...r.mat.map(BigInt),-(1n<<63n)]);
 }
 for(const backend of ['javascript','gmp'])for(let variant=0;variant<7;variant++){
  let raw=[2n,1n,0n,2n],rows=2n,cols=2n,k0=1n,perm=[1n,2n],mat=Array(4).fill(77n),dense=Array(2).fill(77n),T=Array(4).fill(77n),vmax=[77n,77n],found=[77n],sp=Array(13).fill(77n),bottom=[77n,77n],updated=[77n,77n],extra=Array(4).fill(77n),state=Array(10).fill(77n);
  if(variant===0)bottom=bottom.slice(0,1);if(variant===1)updated=updated.slice(0,1);if(variant===2)extra=extra.slice(0,3);if(variant===3)state=state.slice(0,9);if(variant===4)perm=[1n,1n];if(variant===5)rows=-1n;if(variant===6)sp=sp.slice(0,12);
  const buffers=[raw,perm,mat,dense,T,vmax,found,sp,bottom,updated,extra,state],before=buffers.map(x=>x.slice());
  assert.throws(()=>f[backend](raw,rows,cols,perm,k0,1n,mat,dense,T,vmax,found,sp,bottom,updated,extra,state),/invalid|short/);assert.deepEqual(buffers,before);
 }
 for(const backend of ['javascript','gmp'])for(const r of unsafe){
  const rows=r.rows,cols=r.columns,k0=r.k0,state=Array(10).fill(77n),zero=n=>Array(n).fill(0n);
  assert.throws(()=>f[backend](r.mat.map(BigInt),BigInt(rows),BigInt(cols),r.perm.map(BigInt),BigInt(k0),BigInt(r.cRows),zero(rows*cols),zero(k0*cols),zero(cols*cols),zero(cols),[0n],zero(13),zero((rows-k0)*cols),zero(k0*cols),zero(rows*cols),state),/undefined upstream/);
  assert.deepEqual(state,Array(10).fill(77n),'failed prefix must not enter cleanup');
 }
 console.log(JSON.stringify({cases:cases.length,realRelationCases:fixture.realCases,undefinedSourceCasesRejected:unsafe.length,invalidShapesRejected:7,prefixOverflowStops:before.filter(e=>Number(e.state[5])).length,branches,changedT,products,maximumBits,sourceHash:fixture.sourceHash,bodyHash,traceSha256:createHash('sha256').update(trace).digest('hex'),cacheKey:built.cacheKey,coreBytes:fs.statSync(built.coreSourcePath).size,ubsan:true,qualifiedTiming:false,boundary:'before rowrankprofile; no dep/B/C assembly, hnffinal or hnfadd_i'}));
})().catch(e=>{console.error(e);process.exitCode=1;});
