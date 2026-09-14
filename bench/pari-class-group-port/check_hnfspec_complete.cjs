"use strict";
// Original sparse matrices + independently computed PARI embedding entries.
// No HNF, rank, C*T or final-result fixtures are supplied to the native call.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {compileKernel}=require('../../tools/native-kernel/compiler.cjs');
function run(c,a,o={}){const r=spawnSync(c,a,{encoding:'utf8',timeout:180000,maxBuffer:128*1024*1024,...o});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
(async()=>{
 const pari=path.resolve(process.argv[2]),archive=path.resolve(process.argv[3]),lib=path.join(pari,'Olinux-x86_64');
 assert.equal(createHash('sha256').update(fs.readFileSync(archive)).digest('hex'),'02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53');
 const fixture=JSON.parse(run(process.execPath,[path.join(__dirname,'check_hnfspec_rank_prefix.cjs'),pari,archive,'--export-assembly-fixtures']));
 const embeddings=JSON.parse(run(process.execPath,[path.join(__dirname,'check_log_embedding.cjs'),pari,'--export-fixtures']));
 const cases=fixture.cases.flatMap((r,i)=>r.input?[{...r.input,rankStatus:Number(fixture.expected[i].state[9])}]:[]);
 // Dense 8x8 dispatch is genuinely before CUP, not a supplied rank answer.
 cases.push({rows:8,columns:8,k0:8,cRows:3,perm:[1,2,3,4,5,6,7,8],mat:Array.from({length:64},(_,i)=>i%9===0?'2':'0'),kind:'CUP-frontier',rankStatus:-2});
 for(let i=0;i<cases.length;i++){const r=cases[i];r.logRows=3;r.logs=Array.from({length:r.columns},(_,j)=>embeddings[(i%4)*20+j%20].expected).flat();assert.equal(r.logs.length,7*r.logRows*r.columns);}
 // Match real relation columns to their own collected generators and M.
 // This is a prepared-log boundary, not a native collector/log computation.
 const collector=JSON.parse(run(process.execPath,[path.join(__dirname,'check_prepared_small_norm.cjs'),pari,archive,'--export-fixtures','--unreduced','--distinct','--construct-primes'])).cases.filter(r=>r.expected.last);
 const buch=fs.readFileSync(path.join(pari,'src/basemath/buch2.c'),'utf8'),ea=buch.indexOf('static GEN\nget_log_embed('),eb=buch.indexOf('\nstatic GEN\nrel_embed(',ea);assert(ea>=0&&eb>ea);
 const edir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-hnfspec-matched-logs-')),ec=path.join(edir,'oracle.c'),ee=path.join(edir,'oracle');
 fs.writeFileSync(ec,`/* PARI2.17.4 literal get_log_embed, GPL-2.0-or-later. */
#include "pari.h"
typedef struct{GEN m;}REL_t;
${buch.slice(ea,eb)}
static GEN rd(void){char s[8192];if(scanf("%8191s",s)!=1)exit(2);return gp_read_str(s);}
static GEN scalar(void){GEN m=rd();long p=itos(rd()),e=itos(rd());if(p==-1)return m;if(!signe(m))return real_0_bit(e);GEN x=itor(m,p);setexpo(x,e);return x;}
static void ps(GEN x){long e;if(typ(x)==t_INT){pari_printf("\\"%Ps\\",\\"-1\\",\\"0\\"",x);return;}pari_printf("\\"%Ps\\",\\"%ld\\",\\"%ld\\"",signe(x)?mantissa_real(x,&e):gen_0,signe(x)?bit_prec(x):0,expo(x));}
int main(void){pari_init(128000000,1000);long count=itos(rd());for(long t=0;t<count;t++){pari_sp av=avma;long n=itos(rd()),r1=itos(rd()),cols=itos(rd()),ru=(n+r1)/2;GEN flat=cgetg(n*n+1,t_VEC),M=cgetg(n+1,t_MAT);for(long i=1;i<=n*n;i++)gel(flat,i)=scalar();for(long j=0;j<n;j++){gel(M,j+1)=cgetg(ru+1,t_COL);for(long i=0;i<ru;i++){GEN re=gel(flat,i*n+j+1);gcoeff(M,i+1,j+1)=i<r1?re:mkcomplex(re,gel(flat,(ru+i-r1)*n+j+1));}}putchar('[');long first=1;for(long j=0;j<cols;j++){GEN v=cgetg(n+1,t_COL);long scalar=1;for(long i=1;i<=n;i++){gel(v,i)=rd();if(i>1&&signe(gel(v,i)))scalar=0;}REL_t rel={scalar?gel(v,1):v};GEN out=get_log_embed(&rel,M,ru,r1,128);for(long i=1;i<=ru;i++){if(!first)putchar(',');first=0;GEN x=gel(out,i);if(typ(x)==t_COMPLEX){printf("\\"2\\",");ps(gel(x,1));putchar(',');ps(gel(x,2));}else{printf("\\"1\\",");ps(x);printf(",\\"0\\",\\"-1\\",\\"0\\"");}}}puts("]");avma=av;}pari_close();return 0;}`);
 run('cc',['-O1','-fsanitize=undefined','-fno-sanitize-recover=undefined','-I'+path.join(pari,'src/headers'),'-I'+lib,ec,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',ee]);
 const matchingTrace=run(ee,[],{input:[collector.length,...collector.flatMap(({input:v,expected:e})=>[v.n,v.admission_real_count,e.last,...v.admission_matrix_m.flatMap((m,i)=>[m,v.admission_matrix_p[i],v.admission_matrix_e[i]]),...e.generators])].join(' ')}),matchingLogs=matchingTrace.trim().split('\n').map(JSON.parse);
 let match=0;for(const r of cases)if(r.kind==='collector'){const ix=Math.floor(match/2),{input:v,expected:e}=collector[ix];assert.equal(r.rows,Number(v.relation.length));assert.deepEqual(r.mat,e.records.map(String));assert.equal(r.columns,e.last);r.logRows=(Number(v.n)+Number(v.admission_real_count))/2;r.logs=matchingLogs[ix];assert.equal(r.logs.length,7*r.logRows*r.columns);match++;}assert.equal(match,2*collector.length);
 const source=run('tar',['-xOf',archive,'pari-2.17.4/src/basemath/hnf_snf.c']);assert.equal(source,fs.readFileSync(path.join(pari,'src/basemath/hnf_snf.c'),'utf8'));
 const start=source.indexOf('static int\ncount('),end=source.indexOf('  if (CO > co)',start);assert(start>=0&&end>start);
 let body=source.slice(start,end);const bodyHash=createHash('sha256').update(body).digest('hex');
 body=body.replace('hnfspec_i(','connected_oracle(').replace('H = ZM_hnflll(matgen, &U, 0);','trace_calls++; H = ZM_hnflll(matgen, &U, 0);');
 body=body.replace('  H = hnffinal(matbnew, perm, ptdep, ptB, &C);','  long old_rows=col?nbrows(matbnew):0; trace_state[3]=col?nbrows(dep):0;\n  H = hnffinal(matbnew, perm, ptdep, ptB, &C);');
 body+=`\ntrace_state[0]=lg(H)-1;trace_state[1]=col-(old_rows-trace_state[0]);trace_state[2]=lg(*ptB)-1;
trace_state[4]=col-old_rows;trace_state[5]=old_rows-trace_state[0];trace_state[6]=CO>co?-3:0;trace_state[7]=co-1;trace_state[8]=CO>co?3:0;
*ptC=C;return H;\n}\n`;
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-hnfspec-complete-')),c=path.join(dir,'oracle.c'),exe=path.join(dir,'oracle');
 fs.writeFileSync(c,`/* Source-extracted PARI2.17.4 through pre-hnfadd_i; GPL-2.0-or-later. */
#include "pari.h"
#include "paripriv.h"
#define DEBUGLEVEL DEBUGLEVEL_mathnf
static long trace_state[9],trace_calls;
${body}
static GEN rd(void){char s[8192];if(scanf("%8191s",s)!=1)exit(2);return gp_read_str(s);}
static GEN scalar(void){GEN m=rd();long p=itos(rd()),e=itos(rd());if(p==-1)return m;if(!signe(m))return real_0_bit(e);GEN x=itor(m,p);setexpo(x,e);return x;}
static void matrix(GEN a){putchar('[');long first=1;for(long j=1;j<lg(a);j++)for(long i=1;i<lg(gel(a,j));i++){if(!first)putchar(',');first=0;pari_printf("\\"%Ps\\"",gcoeff(a,i,j));}putchar(']');}
static void ps(GEN x){long e;if(typ(x)==t_INT){pari_printf("\\"%Ps\\",\\"-1\\",\\"0\\"",x);return;}pari_printf("\\"%Ps\\",\\"%ld\\",\\"%ld\\"",signe(x)?mantissa_real(x,&e):gen_0,signe(x)?bit_prec(x):0,expo(x));}
int main(void){pari_init(256000000,1000);long count=itos(rd());for(long t=0;t<count;t++){pari_sp av=avma;long rows=itos(rd()),cols=itos(rd()),k0=itos(rd()),lr=itos(rd());GEN A=cgetg(cols+1,t_MAT),perm=cgetg(rows+1,t_VECSMALL),dep=NULL,B=NULL,C=cgetg(cols+1,t_MAT);for(long i=1;i<=rows;i++)perm[i]=itos(rd());for(long j=1;j<=cols;j++){gel(A,j)=cgetg(rows+1,t_VECSMALL);for(long i=1;i<=rows;i++)mael(A,j,i)=itos(rd());}for(long j=1;j<=cols;j++){gel(C,j)=cgetg(lr+1,t_COL);for(long i=1;i<=lr;i++){long kind=itos(rd());GEN re=scalar(),im=scalar();gcoeff(C,i,j)=kind==1?re:mkcomplex(re,im);}}trace_calls=0;GEN H=connected_oracle(A,perm,&dep,&B,&C,k0);printf("{\\"H\\":");matrix(H);printf(",\\"D\\":");matrix(dep);printf(",\\"B\\":");matrix(B);printf(",\\"C\\":[");long first=1;for(long j=1;j<lg(C);j++)for(long i=1;i<lg(gel(C,j));i++){if(!first)putchar(',');first=0;GEN x=gcoeff(C,i,j);if(typ(x)==t_COMPLEX){printf("\\"2\\",");ps(gel(x,1));putchar(',');ps(gel(x,2));}else{printf("\\"1\\",");ps(x);printf(",\\"0\\",\\"-1\\",\\"0\\"");}}printf("],\\"perm\\":[");for(long i=1;i<=rows;i++){if(i>1)putchar(',');printf("%ld",perm[i]);}printf("],\\"state\\":[");for(long i=0;i<9;i++){if(i)putchar(',');printf("%ld",trace_state[i]);}printf("],\\"calls\\":%ld}\\n",trace_calls);avma=av;}pari_close();return 0;}
`);
 run('cc',['-O1','-fsanitize=undefined','-fno-sanitize-recover=undefined','-I'+path.join(pari,'src/headers'),'-I'+lib,c,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',exe]);
 const certified=cases.filter(r=>r.rankStatus===0),trace=run(exe,[],{input:[certified.length,...certified.flatMap(r=>[r.rows,r.columns,r.k0,r.logRows,...r.perm,...r.mat,...r.logs])].join(' ')}),expected=trace.trim().split('\n').map(JSON.parse);assert.equal(expected.length,certified.length);
 for(let i=0;i<certified.length;i++)certified[i].expected=expected[i];
 // Component initial-rank oracle labels only unresolved branches; complete
 // outputs are compared to the actual connected source block above.
 const cp=JSON.parse(run('python3',['-c',`import sys,json,importlib
sys.path[:0]=sys.argv[1:3];f=importlib.import_module('bench.pari-class-group-port.hnfspec_complete').pari_hnfspec_complete
statuses=[];states=[];frontier_shapes=[];guards=0;max_bits=0
for r in json.load(sys.stdin):
 R=r['rows'];C=r['columns'];k=r['k0'];lr=r['logRows'];sz=R*C;ls=7*lr*C
 def buf(n):return [77]*n
 args=[list(map(int,r['mat'])),R,C,r['perm'][:],k,list(map(int,r['logs'])),lr,buf(sz),buf(k*C),buf(C*C),buf(C),buf(1),buf(13),buf((R-k)*C),buf(k*C),buf(sz),buf(10),buf(sz),buf(C),buf(R),buf(R),buf(R+1),buf(10),buf(R),buf(sz),buf(sz),buf(sz),buf(6),buf(ls),buf(sz),buf(C*C),buf(C*C),buf(C+1),buf(11),buf(sz),buf(sz),buf(ls),buf(R),buf(sz),buf(sz),buf(R*(C+R)),buf(ls),buf(7),buf(9)]
 result=f(*args);statuses.append(result);state=args[43]
 states.append(state[:])
 max_bits=max(max_bits,max((abs(x).bit_length() for a in args if isinstance(a,list) for x in a),default=0))
 assert args[0]==list(map(int,r['mat'])) and args[5]==list(map(int,r['logs']))
 if result in (-1,-2):
  assert state[:6]==[-1]*6 and state[6]==result and state[8] in (1,2)
  assert all(a==[77]*len(a) for a in args[38:42])
  if state[8]==1:assert result==r['rankStatus'] and args[27]==[77]*6
  else:frontier_shapes.append({'rows':args[27][1],'inner':args[27][2],'columns':args[27][2],'retained':state[7],'originalRows':R,'originalColumns':C})
  continue
 e=r['expected'];assert state==e['state'] and args[3]==e['perm'],(r['kind'],state,e['state'])
 for actual,key in zip(args[38:42],['H','D','B','C']):
  want=list(map(int,e[key]));assert actual==want+[77]*(len(actual)-len(want)),(r,key,actual,want)
 assert args[27][5]==0
 if not e['calls']:assert args[33]==[77]*11 and args[30]==[77]*(C*C)
 if not guards and R>1 and C>0:
  for index,value in [(1,-1),(38,[]),(43,[]),(3,[1]*R),(5,[9]+args[5][1:])]:
   bad=args[:];bad[index]=value;before=str(bad)
   try:f(*bad)
   except ValueError:pass
   else:raise AssertionError('invalid complete input accepted')
   assert str(bad)==before;guards+=1
assert guards==5
print(json.dumps({'statuses':statuses,'states':states,'maxOwnerBits':max_bits,'exactFrontierShapes':frontier_shapes}))
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify(cases)}));
 assert(cp.maxOwnerBits<=2048,'explicit owner capacity bound');assert(expected.every(e=>e.calls===0||e.calls===1));
 const summary={cases:cases.length,collectorMatrices:cases.filter(r=>r.kind==='collector').length,matchedCollectorLogVectors:collector.reduce((s,r)=>s+r.expected.last,0),matchingLogsSha256:createHash('sha256').update(matchingTrace).digest('hex'),statuses:cp.statuses.reduce((a,s)=>(a[s]=(a[s]||0)+1,a),{}),exactFrontierShapes:cp.exactFrontierShapes,maxOwnerBits:cp.maxOwnerBits,sourceHnfCalls:expected.reduce((a,e)=>(a[e.calls]=(a[e.calls]||0)+1,a),{}),bodyHash,traceSha256:createHash('sha256').update(trace).digest('hex'),ubsan:true,qualifiedTiming:false,scope:'prepared original sparse matrices plus actual embedding entries, not an nf-only engine'};
 if(process.argv.includes('--source-only')){console.log(JSON.stringify(summary));return;}
 const built=await compileKernel({sourcePath:path.join(__dirname,'hnfspec_complete.py')}),f=require(built.modulePath).pari_hnfspec_complete;assert(f.nativeAvailable);
 assert.doesNotMatch(fs.readFileSync(built.coreSourcePath,'utf8'),/napi_call_function|PyObject_Call|v8::/);
 const guards={javascript:0,gmp:0};
 for(const backend of ['javascript','gmp'])for(let ix=0;ix<cases.length;ix++){
  const r=cases[ix],R=r.rows,C=r.columns,k=r.k0,lr=r.logRows,sz=R*C,ls=7*lr*C;
  const words=n=>Array(n).fill(77n),buf=n=>backend==='gmp'?f.createIntegerBuffer(n,C>32?32:256,words(n)):words(n),view=x=>Array.isArray(x)?x.slice():x.toArray();
  const args=[r.mat.map(BigInt),BigInt(R),BigInt(C),r.perm.map(BigInt),BigInt(k),r.logs.map(BigInt),BigInt(lr),words(sz),buf(k*C),buf(C*C),words(C),words(1),words(13),buf((R-k)*C),buf(k*C),buf(sz),words(10),buf(sz),buf(C),buf(R),buf(R),buf(R+1),buf(10),words(R),buf(sz),buf(sz),buf(sz),words(6),buf(ls),buf(sz),buf(C*C),buf(C*C),buf(C+1),words(11),buf(sz),buf(sz),buf(ls),words(R),buf(sz),buf(sz),buf(R*(C+R)),buf(ls),words(7),words(9)];
  const result=f[backend](...args),state=args[43];assert.equal(result,BigInt(cp.statuses[ix]),backend+' '+ix);
  assert.deepEqual(state,cp.states[ix].map(BigInt));
  assert.deepEqual(args[0],r.mat.map(BigInt));assert.deepEqual(args[5],r.logs.map(BigInt));
  if(result===-1n||result===-2n){assert.deepEqual(state.slice(0,6),Array(6).fill(-1n));assert.equal(state[6],result);assert([1n,2n].includes(state[8]));for(const a of args.slice(38,42))assert.deepEqual(view(a),words(view(a).length));continue;}
  const e=r.expected;assert.deepEqual(state,e.state.map(BigInt));assert.deepEqual(args[3],e.perm.map(BigInt));
  for(const [j,key]of ['H','D','B','C'].entries()){const actual=view(args[38+j]),want=e[key].map(BigInt);assert.deepEqual(actual,[...want,...words(actual.length-want.length)],backend+' '+ix+' '+key);}
  assert.equal(args[27][5],0n);if(!e.calls){assert.deepEqual(args[33],words(11));assert.deepEqual(view(args[30]),words(C*C));}
  if(!guards[backend]&&R>1&&C>0){for(const [index,value]of [[1,-1n],[38,buf(0)],[43,[]],[3,Array(R).fill(1n)],[5,[9n,...args[5].slice(1)]]]){const bad=args.slice();bad[index]=value;const snap=()=>bad.map(x=>typeof x==='bigint'?x:view(x)),before=snap();assert.throws(()=>f[backend](...bad));assert.deepEqual(snap(),before);guards[backend]++;}}
 }
 console.log(JSON.stringify({...summary,guards,cacheKey:built.cacheKey,coreBytes:fs.statSync(built.coreSourcePath).size}));
})().catch(e=>{console.error(e);process.exitCode=1;});
