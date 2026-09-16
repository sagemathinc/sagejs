"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {compileKernel}=require('../../tools/native-kernel/compiler.cjs');
function run(c,a,o={}){const r=spawnSync(c,a,{encoding:'utf8',timeout:120000,maxBuffer:96*1024*1024,...o});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
function part(s,a,b){const i=s.indexOf(a),j=s.indexOf(b,i);assert(i>=0&&j>i,a);return s.slice(i,j);}
(async()=>{
 const pari=path.resolve(process.argv[2]),archive=path.resolve(process.argv[3]),lib=path.join(pari,'Olinux-x86_64');
 const fixture=JSON.parse(run(process.execPath,[path.join(__dirname,'check_hnfspec_rank_prefix.cjs'),pari,archive,'--export-assembly-fixtures']));
 const cases=fixture.cases.flatMap((r,i)=>r.input?[{input:r.input,rank:fixture.expected[i]}]:[]),certified=cases.filter(r=>r.rank.state[9]==='0');
 const original=run('tar',['-xOf',archive,'pari-2.17.4/src/basemath/hnf_snf.c']);assert.equal(original,fs.readFileSync(path.join(pari,'src/basemath/hnf_snf.c'),'utf8'));
 const counts=part(original,'static int\ncount(','static GEN\nhnffinal('),helpers=part(original,'static void\np_mat(','/* HNF reduce a relation matrix');
 let body=part(original,'GEN\nhnfspec_i(','  if (T) C = typ(C)==t_MAT? RgM_ZM_mul(C,T): RgV_RgM_mul(C,T);');
 const bodyHash=createHash('sha256').update(counts+helpers+body).digest('hex');body=body.replace('hnfspec_i(','assembly_oracle(');
 body+=`\nGEN U=NULL;H=matbnew;if(col)H=ZM_hnflll(matbnew,&U,0);
trace_state[0]=lg(matbnew)==1?0:nbrows(matbnew);trace_state[1]=lg(dep)==1?0:nbrows(dep);trace_state[2]=col;
trace_state[3]=lg(B)==1?0:nbrows(B);trace_state[4]=co-col-1;trace_state[5]=col!=0;trace_nlze=nlze;
return mkvec5(matbnew,dep,B,H,U?U:cgetg(1,t_MAT));\n}\n`;
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-hnfspec-assembly-')),c=path.join(dir,'oracle.c'),exe=path.join(dir,'oracle');
 fs.writeFileSync(c,`/* Source-extracted PARI2.17.4; GPL-2.0-or-later. */
#include "pari.h"
#include "paripriv.h"
_Static_assert(sizeof(long)==8,"pinned source word model required");
#define DEBUGLEVEL DEBUGLEVEL_mathnf
static long trace_state[6];
static long trace_nlze;
${counts}\n${helpers}\n${body}
static void matrix(GEN m){putchar('[');for(long j=1;j<lg(m);j++)for(long i=1;i<lg(gel(m,j));i++){if(j!=1||i!=1)putchar(',');pari_printf("\\"%Ps\\"",gmael(m,j,i));}putchar(']');}
int main(void){pari_init(256000000,1000);long count;if(scanf("%ld",&count)!=1)return 2;
for(long z=0;z<count;z++){pari_sp av=avma;long rows,cols,k0,cr;if(scanf("%ld%ld%ld%ld",&rows,&cols,&k0,&cr)!=4)return 3;
GEN A=cgetg(cols+1,t_MAT),perm=cgetg(rows+1,t_VECSMALL),C=zeromat(cr,cols),dep=NULL,B=NULL;
for(long i=1;i<=rows;i++)if(scanf("%ld",&perm[i])!=1)return 4;
for(long j=1;j<=cols;j++){gel(A,j)=cgetg(rows+1,t_VECSMALL);for(long i=1;i<=rows;i++)if(scanf("%ld",&mael(A,j,i))!=1)return 5;}
GEN out=assembly_oracle(A,perm,&dep,&B,&C,k0);printf("{\\"nlze\\":%ld,\\"matbnew\\":",trace_nlze);matrix(gel(out,1));printf(",\\"dep\\":");matrix(gel(out,2));printf(",\\"B\\":");matrix(gel(out,3));printf(",\\"H\\":");matrix(gel(out,4));printf(",\\"U\\":");matrix(gel(out,5));
printf(",\\"perm\\":[");for(long i=1;i<=rows;i++){if(i>1)putchar(',');printf("%ld",perm[i]);}printf("],\\"state\\":[");for(long i=0;i<6;i++){if(i)putchar(',');printf("%ld",trace_state[i]);}puts("]}");avma=av;}
pari_close();return 0;}
`);
 run('cc',['-O1','-fsanitize=undefined','-fno-sanitize-recover=undefined','-I'+path.join(pari,'src/headers'),'-I'+lib,c,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',exe]);
 const trace=run(exe,[],{input:[certified.length,...certified.flatMap(({input:r})=>[r.rows,r.columns,r.k0,r.cRows,...r.perm,...r.mat])].join(' ')}),expected=trace.trim().split('\n').map(JSON.parse);assert.equal(expected.length,certified.length);
 let ix=0,products=0,maxBits=0;for(const r of cases){if(r.rank.state[9]!=='0')continue;r.expected=expected[ix++];const e=r.expected,R=e.state[0],C=e.state[2];
  for(const v of [...e.matbnew,...e.dep,...e.B,...e.H,...e.U]){const a=BigInt(v);maxBits=Math.max(maxBits,(a<0n?-a:a).toString(2).length);}
  for(let j=0;j<C;j++)for(let i=0;i<R;i++){let value=0n;for(let k=0;k<C;k++)value+=BigInt(e.matbnew[k*R+i])*BigInt(e.U[j*C+k]);assert.equal(value,BigInt(e.H[j*R+i]));products++;}
 }
 assert(products>0);assert(expected.some(e=>e.state[5]===0));assert(expected.some(e=>e.state[1]>0));assert(expected.some(e=>e.B.length>0));
 if(process.argv.includes('--export-hnffinal-fixtures')){console.log(JSON.stringify(cases.filter(r=>r.expected)));return;}
 run('python3',['-c',`import sys,json,importlib
sys.path[:0]=sys.argv[1:3];m=importlib.import_module('bench.pari-class-group-port.hnfspec_assembly');rank=importlib.import_module('bench.pari-class-group-port.hnfspec_rank_prefix')
guards=0
for case in json.load(sys.stdin):
 r=case['input'];R=r['rows'];C=r['columns'];k=r['k0'];raw=list(map(int,r['mat']));perm=r['perm'][:];mat=[0]*(R*C);dense=[0]*(k*C);T=[0]*(C*C);vmax=[0]*C;found=[0];sp=[0]*13;bottom=[0]*((R-k)*C);updated=[0]*(k*C);extra=[0]*(R*C);cs=[0]*10;matrix=[0]*(R*C);occ=[0]*C;piv=[0]*R;best=[0]*R;profile=[0]*(R+1);rs=[0]*10
 status=rank.pari_hnfspec_cleanup_rank_prefix(raw,R,C,perm,k,r['cRows'],mat,dense,T,vmax,found,sp,bottom,updated,extra,cs,matrix,occ,piv,best,profile,rs)
 assert status==int(case['rank']['state'][9]) and rs==list(map(int,case['rank']['state']))
 work=[77]*(R+2);new=[77]*(R*C+2);dep=[77]*(R*C+2);B=[77]*(R*C+2);H=[77]*(R*C+2);U=[77]*(C*C+2);lam=[77]*(C*C+2);D=[77]*(C+3);hs=[77]*13;state=[77]*8
 owners=(perm,sp,cs,rs,profile,bottom,updated,extra,work,new,dep,B,H,U,lam,D,hs,state);before=str(owners);readonly=str(owners[1:8])
 result=m.pari_hnfspec_assembly(R,k,perm,sp,cs,rs,profile,bottom,updated,extra,work,new,dep,B,H,U,lam,D,hs,state)
 assert result==status
 if status:
  assert str(owners)==before;continue
 e=case['expected'];assert perm==e['perm'] and state==e['state']+[77,77]
 assert str(owners[1:8])==readonly
 for a,w in [(new,e['matbnew']),(dep,e['dep']),(B,e['B']),(H,e['H']),(U,e['U'])]:
  w=list(map(int,w));assert a==w+[77]*(len(a)-len(w)),(r,e,a)
 if not e['state'][5]:assert lam==[77]*len(lam) and D==[77]*len(D) and hs==[77]*13
 if not guards and R>1 and sp[2]>0 and rs[8]>1:
  args=[R,k,*owners]
  # Rejected dimensions, capacities, profile and permutation must be atomic.
  for index,value in [(0,-1),(3,[]),(6,[]),(10,[]),(15,[]),(19,[]),(2,[perm[0]]*R),(6,[0]*len(profile))]:
   bad=args[:];bad[index]=value;before_bad=str(bad)
   try:m.pari_hnfspec_assembly(*bad)
   except ValueError:pass
   else:raise AssertionError('malformed assembly accepted')
   assert str(bad)==before_bad;guards+=1
assert guards==8
for rs in json.loads(sys.argv[3]):
 args=[-999,-999,[],[],[],list(map(int,rs)),[],[],[],[],[],[],[],[],[],[],[],[],[],[]];saved=str(args)
 assert m.pari_hnfspec_assembly(*args)==int(rs[9]) and str(args)==saved
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib'),JSON.stringify(fixture.expected.filter(e=>e.state[9]!=='0').map(e=>e.state))],{input:JSON.stringify(cases)});
 const built=await compileKernel({sourcePath:path.join(__dirname,'hnfspec_assembly.py')}),f=require(built.modulePath).pari_hnfspec_assembly;
 const rb=await compileKernel({sourcePath:path.join(__dirname,'hnfspec_rank_prefix.py')}),rank=require(rb.modulePath).pari_hnfspec_cleanup_rank_prefix;
 assert(f.nativeAvailable&&rank.nativeAvailable);assert.doesNotMatch(fs.readFileSync(built.coreSourcePath,'utf8'),/napi_call_function|PyObject_Call|v8::/);
 const guardCounts={javascript:0,gmp:0};
 for(const backend of ['javascript','gmp'])for(const entry of cases){
  const r=entry.input,R=r.rows,C=r.columns,k=r.k0,words=n=>Array(n).fill(77n),exact=n=>f.createIntegerBuffer(n,C>32?4:64,words(n));
  if(C>32&&entry.expected)assert.equal(entry.expected.state[0],0,'large zero-row HNF test owner bound');
  const perm=r.perm.map(BigInt),sp=words(13),cs=words(10),rs=exact(10),profile=exact(R+1),bottom=exact((R-k)*C),updated=exact(k*C),extra=exact(R*C);
  const status=rank[backend](r.mat.map(BigInt),BigInt(R),BigInt(C),perm,BigInt(k),BigInt(r.cRows),words(R*C),exact(k*C),exact(C*C),words(C),[0n],sp,bottom,updated,extra,cs,exact(R*C),exact(C),exact(R),exact(R),profile,rs);
  assert.equal(status,BigInt(entry.rank.state[9]));assert.deepEqual(rs.toArray(),entry.rank.state.map(BigInt));
  const work=words(R+2),newmat=exact(R*C+2),dep=exact(R*C+2),B=exact(R*C+2),H=exact(R*C+2),U=exact(C*C+2),lam=exact(C*C+2),D=exact(C+3),hs=words(13),state=words(8);
  const owners=[perm,sp,cs,rs,profile,bottom,updated,extra,work,newmat,dep,B,H,U,lam,D,hs,state],snapshot=()=>owners.map(x=>Array.isArray(x)?x.slice():x.toArray()),before=snapshot();
  assert.equal(f[backend](BigInt(R),BigInt(k),perm,sp,cs,rs,profile,bottom,updated,extra,work,newmat,dep,B,H,U,lam,D,hs,state),status);
  if(status!==0n){assert.deepEqual(snapshot(),before);continue;}
  const e=entry.expected;assert.deepEqual(perm,e.perm.map(BigInt));assert.deepEqual(state,[...e.state.map(BigInt),77n,77n]);
  assert.deepEqual(snapshot().slice(1,8),before.slice(1,8));
  for(const [a,w]of [[newmat,e.matbnew],[dep,e.dep],[B,e.B],[H,e.H],[U,e.U]])assert.deepEqual(a.toArray(),[...w.map(BigInt),...words(a.toArray().length-w.length)]);
  if(!e.state[5]){assert.deepEqual(lam.toArray(),words(C*C+2));assert.deepEqual(D.toArray(),words(C+3));assert.deepEqual(hs,words(13));}
  if(!guardCounts[backend]&&R>1&&sp[2]>0n&&rs.toArray()[8]>1n){
   const args=[BigInt(R),BigInt(k),...owners];
   for(const [index,value]of [[0,-1n],[3,[]],[6,exact(0)],[10,[]],[15,exact(0)],[19,[]],[2,Array(R).fill(perm[0])],[6,f.createIntegerBuffer(R+1,4,Array(R+1).fill(0n))]]){
    const bad=args.slice();bad[index]=value;const snap=()=>bad.map(x=>Array.isArray(x)?x.slice():typeof x==='bigint'?x:x.toArray()),saved=snap();
    assert.throws(()=>f[backend](...bad));assert.deepEqual(snap(),saved);guardCounts[backend]++;
   }
  }
 }
 assert.deepEqual(guardCounts,{javascript:8,gmp:8});
 const frontierStates=fixture.expected.filter(e=>e.state[9]!=='0').map(e=>e.state);
 assert.deepEqual([...new Set(frontierStates.map(s=>s[9]))].sort(),['-1','-2']);
 for(const backend of ['javascript','gmp'])for(const rs of frontierStates){
  const empty=()=>f.createIntegerBuffer(0,4,[]),args=[-999n,-999n,[],[],[],f.createIntegerBuffer(10,4,rs.map(BigInt)),empty(),empty(),empty(),empty(),[],empty(),empty(),empty(),empty(),empty(),empty(),empty(),[],[]];
  const snap=()=>args.map(x=>typeof x==='bigint'?x:Array.isArray(x)?x.slice():x.toArray()),saved=snap();
  assert.equal(f[backend](...args),BigInt(rs[9]));assert.deepEqual(snap(),saved);
 }
 const distribution=(items,key)=>{const out={};for(const e of items)out[e[key]]=(out[e[key]]||0)+1;return out;};
 console.log(JSON.stringify({nlzeDistribution:distribution(expected,'nlze'),depRowsDistribution:distribution(expected.map(e=>({rows:e.state[1]})),'rows'),realDepShapes:distribution(cases.filter(r=>r.input.kind==='collector'&&r.expected).map(r=>({shape:r.expected.state[1]+'x'+r.expected.state[2]})),'shape'),depShapes:distribution(expected.map(e=>({shape:e.state[1]+'x'+e.state[2]})),'shape'),guardCounts,stickyFrontierStates:frontierStates.length}));
 console.log(JSON.stringify({cases:cases.length,certified:certified.length,frontiers:cases.length-certified.length,realRelationCases:cases.filter(r=>r.input.kind==='collector').length,products,maxBits,emptyHnfBranches:expected.filter(e=>!e.state[5]).length,bodyHash,traceSha256:createHash('sha256').update(trace).digest('hex'),cacheKey:built.cacheKey,coreBytes:fs.statSync(built.coreSourcePath).size,ubsan:true,qualifiedTiming:false,boundary:'exact assembly and independent HNFLLL only; C transforms/hnffinal/hnfadd absent'}));
})().catch(e=>{console.error(e);process.exitCode=1;});
