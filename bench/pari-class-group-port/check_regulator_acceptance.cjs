"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {compileKernel}=require('../../tools/native-kernel/compiler.cjs');
const hash=x=>createHash('sha256').update(x).digest('hex');
function run(c,a,o={}){const r=spawnSync(c,a,{encoding:'utf8',timeout:180000,maxBuffer:64*1024*1024,...o});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
(async()=>{
 const pari=path.resolve(process.argv[2]),archive=path.resolve(process.argv[3]),lib=path.join(pari,'Olinux-x86_64');
 assert.equal(hash(fs.readFileSync(archive)),'02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53');
 // Reuse fixture construction, never supplied regulator/HNF answers.
 const generated=JSON.parse(run(process.execPath,[path.join(__dirname,'check_regulator_multiple.cjs'),pari,archive,'--source-only']));
 const [all,oracle]=JSON.parse(fs.readFileSync(path.join(generated.artifactDirectory,'fixtures.json'),'utf8'));
 const bases=[];for(const status of [0,1,2,3,4]){let kept=0;for(let i=0;i<all.length&&kept<3;i++)if(oracle[i].state[0]===status){bases.push({...all[i],kind:'synthetic'});kept++;}}
 for(const r of all.slice(-32))bases.push({...r,kind:'actual-embedding'});
 for(const rows of [2,3,4]){const r=all.find((x,i)=>x.rows===rows&&oracle[i].state[0]===0);for(const columns of [8,11]){const values=[];for(let j=0;j<columns;j++)values.push(...r.values.slice(3*rows*(j%r.columns),3*rows*(j%r.columns+1)));bases.push({...r,columns,values,kind:'synthetic-wide'});}}
 const cases=[];for(const r of bases)for(const exponent of [-2,0,2])for(const changed of [true,false])cases.push({...r,changed,zeta:[String(1n<<63n),'64',String(exponent)]});
 const src=run('tar',['-xOf',archive,'pari-2.17.4/src/basemath/buch2.c']);const a=src.indexOf('static GEN\nclean_cols('),b=src.indexOf('static GEN\nget_clg2(',a);assert(a>=0&&b>a);let body=src.slice(a,b);
 body=body.replace('*pneed = RU - (lg(mdet)-1-r);','raw_multiple=1; *pneed = RU - (lg(mdet)-1-r);').replace('*pneed = 0; return gc_NULL(av);','raw_multiple=2; *pneed = 0; return gc_NULL(av);').replace('if (gexpo(gsub(d,kR)) - gexpo(d) > -20) {','if (gexpo(gsub(d,kR)) - gexpo(d) > -20) { raw_multiple=3;').replace('{ *ptL = NULL; return gc_NULL(av); }','{ raw_multiple=4; *ptL = NULL; return gc_NULL(av); }');
 body=body.replace('  L = bestappr(lambda,D);','  rec[1]=1; L = bestappr(lambda,D);').replace('  den = Q_denom(L);','  den = Q_denom(L); rec[1]=2;').replace('  bit = -gexpo(gsub(L, lambda));','  bit = -gexpo(gsub(L, lambda)); rec[2]=bit;').replace('  H = ZM_hnf(L); r = lg(H)-1;','  rec[1]=3; H = ZM_hnf(L); r = lg(H)-1; rec[3]=r;').replace('    R = gmul(*ptkR, gdiv(ZM_det_triangular(H), powiu(den, r)));','    { R = gmul(*ptkR, gdiv(ZM_det_triangular(H), powiu(den, r))); rec[1]=4; }').replace('  if ((reason = bad_check(c)))','  rec[1]=5; if ((reason = bad_check(c)))');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-regulator-acceptance-')),file=path.join(dir,'oracle.c'),exe=path.join(dir,'oracle');
 fs.writeFileSync(file,`/* Both numerical bodies extracted from PARI2.17.4, GPL-2.0-or-later.
 * Host gate mirrors buchall; it neither changes precision nor loops. */
#include "pari.h"
#include "paripriv.h"
static long raw_multiple,rec[4];
${body}
static GEN rd(void){char s[8192];if(scanf("%8191s",s)!=1)exit(2);return gp_read_str(s);}
static GEN scalar(void){GEN m=rd();long p=itos(rd());GEN ee=rd();if(p==-1)return m;if(p==-2)return gdiv(m,ee);long e=itos(ee);if(!signe(m))return real_0_bit(e);GEN x=itor(m,p);setexpo(x,e);return x;}
static void ps(GEN x){long e;if(typ(x)==t_INT){pari_printf("\\\"%Ps\\\",\\\"-1\\\",\\\"0\\\"",x);return;}if(typ(x)==t_FRAC){pari_printf("\\\"%Ps\\\",\\\"-2\\\",\\\"%Ps\\\"",gel(x,1),gel(x,2));return;}pari_printf("\\\"%Ps\\\",\\\"%ld\\\",\\\"%ld\\\"",signe(x)?mantissa_real(x,&e):gen_0,signe(x)?bit_prec(x):0,expo(x));}
static void matrix(GEN A,int exact){putchar('[');if(A)for(long j=1;j<lg(A);j++)for(long i=1;i<lg(gel(A,j));i++){if(j>1||i>1)putchar(',');if(exact)pari_printf("\\\"%Ps\\\"",gcoeff(A,i,j));else ps(gcoeff(A,i,j));}putchar(']');}
int main(void){pari_init(128000000,1000);long count=itos(rd());for(long t=0;t<count;t++){pari_sp av=avma;long rows=itos(rd()),cols=itos(rd()),degree=itos(rd()),changed=itos(rd()),need=71,bits=73;GEN A=cgetg(cols+1,t_MAT);for(long j=1;j<=cols;j++){gel(A,j)=cgetg(rows+1,t_COL);for(long i=1;i<=rows;i++)gcoeff(A,i,j)=scalar();}GEN z=scalar(),lambda=NULL,L=NULL;raw_multiple=0;for(long i=0;i<4;i++)rec[i]=77;GEN R=compute_multiple_of_R(A,rows,degree,&need,&bits,&lambda),multiple=R;long stage=1,raw=raw_multiple,action,kind=lambda?(typ(lambda)==t_MAT?2:1):0;
if(!lambda)action=1;else if(!R)action=need?3:2;else if(!changed){need=1;action=4;}else{stage=2;for(long i=0;i<4;i++)rec[i]=0;raw=compute_R(lambda,z,&L,&R);rec[0]=raw;if(raw==1){need=1;action=5;}else if(raw==3)action=6;else action=0;}
printf("{\\\"acceptance\\\":[%ld,%ld,%ld],\\\"multiple_state\\\":[%ld,%ld,%ld,%ld],\\\"reconstruction_state\\\":[%ld,%ld,%ld,%ld],\\\"multiple\\\":[",stage,action,raw,raw_multiple,need,bits,kind,rec[0],rec[1],rec[2],rec[3]);if(multiple)ps(multiple);printf("],\\\"coordinates\\\":");matrix(multiple?lambda:NULL,0);printf(",\\\"regulator\\\":[");if(action==0)ps(R);printf("],\\\"relations\\\":");matrix(action==0?L:NULL,1);puts("}");avma=av;}pari_close();return 0;}
`);
 run('cc',['-O1','-fsanitize=undefined','-fno-sanitize-recover=undefined','-I'+path.join(pari,'src/headers'),'-I'+lib,file,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',exe]);
 const trace=run(exe,[],{input:[cases.length,...cases.flatMap(r=>[r.rows,r.columns,r.degree,r.changed?1:0,...r.values,...r.zeta])].join(' ')}),expected=trace.trim().split('\n').map(JSON.parse);
 run('python3',['-c',`import sys,json,importlib
sys.path[:0]=sys.argv[1:3];f=importlib.import_module('bench.pari-class-group-port.regulator_acceptance').pari_regulator_acceptance
for ix,(r,e) in enumerate(zip(*json.load(sys.stdin))):
 n=r['rows'];c=r['columns'];z=n*(c+1);q=n*n;s=(n-1)*c
 lengths=[3*z,c+1,3,3*z,n,c+1,3,z,z,n,c+1,c+1,10,3*q,3*q,3*q,3,n,5,3*q,3*q,3*q,n,3,3*q,3*q,3,3*s]
 args=[list(map(int,r['values']))+[999,-17,23],n,c,r['degree']]+[[77]*k for k in lengths]+[[77,71,73,77],list(map(int,r['zeta']))]+[[77]*k for k in [3*s,s,s,n-1,s,15,3,s,1,4,n-1,c]]+[r['changed'],[77]*3]
 status=f(*args)
 assert status==e['acceptance'][1] and args[47]==e['acceptance'],(ix,args[47],e)
 assert args[32]==e['multiple_state'] and args[43]==e['reconstruction_state'],(ix,args[32],args[43],e)
 for at,key,length in [(30,'multiple',3),(31,'coordinates',3*s),(40,'regulator',3),(41,'relations',s)]:assert args[at]==(list(map(int,e[key])) if e[key] else [77]*length),(ix,key,args[at],e[key])
 if e['acceptance'][0]==1:
  for at in range(34,46):assert all(v==77 for v in args[at]),(ix,at,args[at])
 if ix==0:
  for at,replacement in [(33,[]),(33,[0,0,0]),(33,[-(1<<63),64,0]),(33,[1,-1,0]),(47,[77,77])]:
   invalid=args.copy();invalid[at]=replacement;before=[x.copy() if isinstance(x,list) else x for x in invalid]
   try:f(*invalid)
   except ValueError:pass
   else:raise AssertionError(('accepted invalid boundary',at,replacement))
   assert invalid==before,('invalid boundary mutated owners',at)
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify([cases,expected])});
 const actions={};for(const e of expected)actions[e.acceptance[1]]=(actions[e.acceptance[1]]||0)+1;
 const summary={cases:cases.length,actualEmbeddingCases:cases.filter(r=>r.kind==='actual-embedding').length,genuinePostHnfUnitLogCases:0,syntheticWideCases:cases.filter(r=>r.kind==='synthetic-wide').length,atomicBoundaryGuards:5,actions,traceSha256:hash(trace),ubsan:true,qualifiedTiming:false,taggedBackend:'unavailable for mixed exact/Float64 programs',artifactDirectory:dir};
 if(process.argv.includes('--source-only')){console.log(JSON.stringify(summary));return;}
 const built=await compileKernel({sourcePath:path.join(__dirname,'regulator_acceptance.py')}),f=require(built.modulePath).pari_regulator_acceptance;assert(f.nativeAvailable);
 assert.doesNotMatch(fs.readFileSync(built.coreSourcePath,'utf8'),/napi_call_function|PyObject_Call|v8::/);
 const words=new Set([5,6,8,9,10,21,22,26,27,32,39,43,44,45,47]);
 for(const backend of ['javascript','gmp'])for(let ix=0;ix<cases.length;ix++){
  const r=cases[ix],e=expected[ix],n=r.rows,c=r.columns,z=n*(c+1),q=n*n,s=(n-1)*c,lengths=[3*z,c+1,3,3*z,n,c+1,3,z,z,n,c+1,c+1,10,3*q,3*q,3*q,3,n,5,3*q,3*q,3*q,n,3,3*q,3*q,3,3*s],make=(k,at)=>words.has(at)?Array(k).fill(77n):f.createIntegerBuffer(k,1024,Array(k).fill(77n)),view=x=>Array.isArray(x)?x:x.toArray();
  const args=[[...r.values.map(BigInt),999n,-17n,23n],BigInt(n),BigInt(c),BigInt(r.degree),...lengths.map((k,i)=>make(k,i+4)),[77n,71n,73n,77n],r.zeta.map(BigInt),...[3*s,s,s,n-1,s,15,3,s,1,4,n-1,c].map((k,i)=>make(k,i+34)),r.changed,[77n,77n,77n]],status=f[backend](...args);
  assert.equal(status,BigInt(e.acceptance[1]));assert.deepEqual(args[47],e.acceptance.map(BigInt),backend+' '+ix);assert.deepEqual(args[32],e.multiple_state.map(BigInt));assert.deepEqual(args[43],e.reconstruction_state.map(BigInt));
  for(const [at,key,length]of [[30,'multiple',3],[31,'coordinates',3*s],[40,'regulator',3],[41,'relations',s]])assert.deepEqual(view(args[at]),e[key].length?e[key].map(BigInt):Array(length).fill(77n),backend+' '+ix+' '+key);
  if(e.acceptance[0]===1)for(let at=34;at<46;at++)assert(view(args[at]).every(v=>v===77n));
  if(ix===0)for(const [at,replacement]of [[33,[]],[33,[0n,0n,0n]],[33,[-(1n<<63n),64n,0n]],[33,[1n,-1n,0n]],[47,[77n,77n]]]){
   const invalid=args.slice();invalid[at]=replacement;
   const snapshot=()=>invalid.map(x=>Array.isArray(x)?x.slice():x&&typeof x.toArray==='function'?x.toArray():x);
   const before=snapshot();assert.throws(()=>f[backend](...invalid));assert.deepEqual(snapshot(),before,backend+' atomic boundary '+at);
  }
 }
 console.log(JSON.stringify({...summary,coreBytes:fs.statSync(built.coreSourcePath).size,cacheKey:built.cacheKey,sourceSha256:hash(fs.readFileSync(path.join(__dirname,'regulator_acceptance.py')))}));
})().catch(e=>{console.error(e);process.exitCode=1;});
