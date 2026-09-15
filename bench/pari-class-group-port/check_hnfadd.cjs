"use strict";
// Staged native outputs, never supplied HNF/rank answers, feed each next batch.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {compileKernel}=require('../../tools/native-kernel/compiler.cjs');
function run(c,a,o={}){const r=spawnSync(c,a,{encoding:'utf8',timeout:180000,maxBuffer:128*1024*1024,...o});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
function part(s,a,b){const i=s.indexOf(a),j=s.indexOf(b,i);assert(i>=0&&j>i,a);return s.slice(i,j);}
function signature(name,entry){return fs.readFileSync(path.join(__dirname,name+'.py'),'utf8').match(new RegExp('def '+entry+'\\(([\\s\\S]*?)\\n\\)'))[1].trim().split('\n').map(s=>s.trim().replace(/,$/,'').split(': '));}
(async()=>{
 const pari=path.resolve(process.argv[2]),archive=path.resolve(process.argv[3]),lib=path.join(pari,'Olinux-x86_64');
 assert.equal(createHash('sha256').update(fs.readFileSync(archive)).digest('hex'),'02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53');
 const source=run('tar',['-xOf',archive,'pari-2.17.4/src/basemath/hnf_snf.c']);assert.equal(source,fs.readFileSync(path.join(pari,'src/basemath/hnf_snf.c'),'utf8'));
 const hfinal=part(source,'static GEN\nhnffinal(','/* for debugging */'),profile=part(source,'static GEN\nZM_rowrankprofile(','/* HNF reduce a relation matrix');
 const addBody=part(source,'GEN\nhnfadd_i(','GEN\nhnfadd('),bodyHash=createHash('sha256').update(hfinal+profile+addBody).digest('hex');
 let addOracle=addBody.replace('hnfadd_i(','add_oracle(').replace('  H = hnffinal(matb,perm,ptdep,ptB,&Cnew);','  trace_rows=lig-nlze; H = hnffinal(matb,perm,ptdep,ptB,&Cnew);');
 const rgv=run('tar',['-xOf',archive,'pari-2.17.4/src/basemath/RgV.c']),zv=run('tar',['-xOf',archive,'pari-2.17.4/src/basemath/ZV.c']);
 assert.equal(rgv,fs.readFileSync(path.join(pari,'src/basemath/RgV.c'),'utf8'));assert.equal(zv,fs.readFileSync(path.join(pari,'src/basemath/ZV.c'),'utf8'));
 let wordLog=part(rgv,'static GEN\nRgMrow_zc_mul_i(','GEN\nRgMrow_zc_mul(')+part(rgv,'static GEN\nRgM_zc_mul_i(','GEN\nRgM_zc_mul(')+part(rgv,'GEN\nRgM_zm_mul(','/* x[i,]*y, l = lg(y) > 1 */');
 let wordExact=part(zv,'static GEN\nZM_zc_mul_i(','GEN\nZM_zc_mul(')+part(zv,'GEN\nZM_zm_mul(','/* x ZM, y a compatible zn');
 const leafHash=createHash('sha256').update(wordLog+wordExact).digest('hex');
 const replace=(s,a,b)=>{assert.equal(s.split(a).length,2,a);return s.replace(a,b);};
 wordLog=replace(wordLog,'if (!t) continue;','if (!t) {trace_counts[0]++;continue;}');
 wordLog=replace(wordLog,'if (!s) { s =','if (!s) { trace_counts[1]++; s =');
 wordLog=replace(wordLog,'case  1: s =','case  1: trace_counts[2]++; s =');
 wordLog=replace(wordLog,'case -1: s =','case -1: trace_counts[3]++; s =');
 wordLog=replace(wordLog,'default: s =','default: trace_counts[4]++; s =');
 wordLog=wordLog.replace('RgM_zm_mul(','source_word_log_product(');
 wordExact=replace(wordExact,'GEN s = mulis(gcoeff(x,i,1),y[1]);','GEN s = mulis(gcoeff(x,i,1),y[1]); if(!y[1])trace_counts[5]++;');
 wordExact=replace(wordExact,'if (y[j]) s = addii(s, mulis(gcoeff(x,i,j),y[j]));','if (y[j]) {trace_counts[6]++; s = addii(s, mulis(gcoeff(x,i,j),y[j]));}');
 wordExact=wordExact.replace('ZM_zm_mul(','source_word_exact_product(');
 addOracle=addOracle.replace('RgM_zm_mul(A, c)','source_word_log_product(A, c)').replace('ZM_zm_mul(B, c)','source_word_exact_product(B, c)');
 const buch=fs.readFileSync(path.join(pari,'src/basemath/buch2.c'),'utf8'),embed=part(buch,'static GEN\nget_log_embed(','\nstatic GEN\nrel_embed(');
 assert.equal(createHash('sha256').update(buch).digest('hex'),'d8b09a54e51399c83f2faa92ccc3f1f70f41d660b1cb279738bc207ff553f87a');
 const embeddings=JSON.parse(run(process.execPath,[path.join(__dirname,'check_log_embedding.cjs'),pari,'--export-fixtures']));
 const cases=[];let seed=293;function rand(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return [-3,-1,0,0,1,2][seed%6];}
 function addCase(rows,columns,initial,mat,kind='synthetic',k0=0){const batches=[0];for(let rest=columns-initial;rest>0;){const n=Math.min(rest,1+batches.length%2);batches.push(n);rest-=n;}cases.push({rows,columns,initial,k0,mat:mat.map(String),perm:Array.from({length:rows},(_,i)=>rows-i),batches,kind,logRows:3,logs:Array.from({length:columns},(_,j)=>embeddings[(cases.length%4)*20+j%20].expected).flat()});}
 for(let rows=0;rows<=7;rows++)for(let sample=0;sample<6;sample++){const columns=3+sample%4,initial=sample%3;addCase(rows,columns,initial,Array.from({length:rows*columns},rand),'synthetic',sample%(rows+1));}
 // Exact initial-prime and CUP dispatch boundaries, not supplied rank answers.
 addCase(2,2,0,[2147483659n*2147483693n,0,0,1],'verification');cases.at(-1).batches=[2];
 addCase(8,8,0,Array.from({length:64},(_,i)=>i%9===0?2:0),'CUP');cases.at(-1).batches=[8];
 addCase(33,33,0,Array(33*33).fill(0),'Strassen');cases.at(-1).batches=[33];
 const collector=JSON.parse(run(process.execPath,[path.join(__dirname,'check_prepared_small_norm.cjs'),pari,archive,'--export-fixtures','--unreduced','--distinct','--construct-primes'])).cases.filter(r=>r.expected.last);
 for(const {input:v,expected:e}of collector)for(const k0 of [0,Math.min(2,v.relation.length)]){
  addCase(v.relation.length,e.last,Math.min(1,e.last-1),e.records,'collector',k0);const r=cases.at(-1);r.perm=Array.from({length:r.rows},(_,i)=>i+1);r.n=Number(v.n);r.real=Number(v.admission_real_count);r.logRows=(r.n+r.real)/2;r.matrix=v.admission_matrix_m.flatMap((m,i)=>[m,v.admission_matrix_p[i],v.admission_matrix_e[i]]);r.generators=e.generators;
 }
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-hnfadd-')),c=path.join(dir,'oracle.c'),exe=path.join(dir,'oracle');
 fs.writeFileSync(c,`/* PARI2.17.4 literal hnfadd_i + hnffinal, GPL-2.0-or-later. */
#include "pari.h"
#include "paripriv.h"
#define DEBUGLEVEL DEBUGLEVEL_mathnf
typedef struct{GEN m;}REL_t;
static long trace_rows,trace_counts[7];
${embed}\n${wordLog}\n${wordExact}\n${hfinal}\n${profile}\n${addOracle}
static GEN rd(void){char s[8192];if(scanf("%8191s",s)!=1)exit(2);return gp_read_str(s);}
static GEN scalar(void){GEN m=rd();long p=itos(rd()),e=itos(rd());if(p==-1)return m;if(!signe(m))return real_0_bit(e);GEN x=itor(m,p);setexpo(x,e);return x;}
static void matrix(GEN a){putchar('[');long first=1;for(long j=1;j<lg(a);j++)for(long i=1;i<lg(gel(a,j));i++){if(!first)putchar(',');first=0;pari_printf("\\"%Ps\\"",gcoeff(a,i,j));}putchar(']');}
static void ps(GEN x){long e;if(typ(x)==t_INT){pari_printf("\\"%Ps\\",\\"-1\\",\\"0\\"",x);return;}pari_printf("\\"%Ps\\",\\"%ld\\",\\"%ld\\"",signe(x)?mantissa_real(x,&e):gen_0,signe(x)?bit_prec(x):0,expo(x));}
static void logmat(GEN C){putchar('[');long first=1;for(long j=1;j<lg(C);j++)for(long i=1;i<lg(gel(C,j));i++){if(!first)putchar(',');first=0;GEN x=gcoeff(C,i,j);if(typ(x)==t_COMPLEX){printf("\\"2\\",");ps(gel(x,1));putchar(',');ps(gel(x,2));}else{printf("\\"1\\",");ps(x);printf(",\\"0\\",\\"-1\\",\\"0\\"");}}putchar(']');}
static void emit(GEN H,GEN D,GEN B,GEN C,GEN perm){printf("{\\"H\\":");matrix(H);printf(",\\"D\\":");matrix(D);printf(",\\"B\\":");matrix(B);printf(",\\"C\\":");logmat(C);printf(",\\"perm\\":[");long li=lg(perm)-1;for(long i=1;i<=li;i++){if(i>1)putchar(',');printf("%ld",perm[i]);}long nh=lg(H)-1,nb=lg(B)-1,nc=lg(C)-1;printf("],\\"state\\":[%ld,%ld,%ld,%ld,%ld,%ld,0,%ld,0]}",nh,nc-nb,nb,li-nb-nh,nc-nb-nh,trace_rows<0?-1:trace_rows-nh,nc);}
int main(void){pari_init(256000000,1000);long count=itos(rd());for(long t=0;t<count;t++){pari_sp av=avma;long rows=itos(rd()),cols=itos(rd()),initial=itos(rd()),k0=itos(rd()),lr=itos(rd()),nb=itos(rd());GEN batches=cgetg(nb+1,t_VECSMALL);for(long i=1;i<=nb;i++)batches[i]=itos(rd());GEN perm=cgetg(rows+1,t_VECSMALL),A=cgetg(cols+1,t_MAT),allC=cgetg(cols+1,t_MAT);for(long i=1;i<=rows;i++)perm[i]=itos(rd());for(long j=1;j<=cols;j++){gel(A,j)=cgetg(rows+1,t_VECSMALL);for(long i=1;i<=rows;i++)mael(A,j,i)=itos(rd());}long actual=itos(rd());if(actual){long n=itos(rd()),r1=itos(rd());GEN flat=cgetg(n*n+1,t_VEC),M=cgetg(n+1,t_MAT);for(long i=1;i<=n*n;i++)gel(flat,i)=scalar();for(long j=0;j<n;j++){gel(M,j+1)=cgetg(lr+1,t_COL);for(long i=0;i<lr;i++){GEN re=gel(flat,i*n+j+1);gcoeff(M,i+1,j+1)=i<r1?re:mkcomplex(re,gel(flat,(lr+i-r1)*n+j+1));}}for(long j=1;j<=cols;j++){GEN v=cgetg(n+1,t_COL);long sc=1;for(long i=1;i<=n;i++){gel(v,i)=rd();if(i>1&&signe(gel(v,i)))sc=0;}REL_t rel={sc?gel(v,1):v};gel(allC,j)=get_log_embed(&rel,M,lr,r1,128);}}
else for(long j=1;j<=cols;j++){gel(allC,j)=cgetg(lr+1,t_COL);for(long i=1;i<=lr;i++){long kind=itos(rd());GEN re=scalar(),im=scalar();gcoeff(allC,i,j)=kind==1?re:mkcomplex(re,im);}}
printf("{\\"logs\\":");logmat(allC);GEN D=NULL,B=NULL,C=vecslice(allC,1,initial);trace_rows=-1;for(long i=0;i<7;i++)trace_counts[i]=0;GEN H=hnfspec_i(vecslice(A,1,initial),perm,&D,&B,&C,k0);printf(",\\"stages\\":[");emit(H,D,B,C,perm);long at=initial;for(long q=1;q<=nb;q++){long n=batches[q];trace_rows=-1;H=add_oracle(H,perm,&D,&B,&C,vecslice(A,at+1,at+n),vecslice(allC,at+1,at+n));at+=n;putchar(',');emit(H,D,B,C,perm);}printf("],\\"counts\\":[");for(long i=0;i<7;i++){if(i)putchar(',');printf("%ld",trace_counts[i]);}puts("]}");avma=av;}pari_close();return 0;}
`);
 run('cc',['-O1','-fsanitize=undefined','-fno-sanitize-recover=undefined','-I'+path.join(pari,'src/headers'),'-I'+lib,c,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',exe]);
 const trace=run(exe,[],{input:[cases.length,...cases.flatMap(r=>[r.rows,r.columns,r.initial,r.k0,r.logRows,r.batches.length,...r.batches,...r.perm,...r.mat,...(r.kind==='collector'?[1,r.n,r.real,...r.matrix,...r.generators]:[0,...r.logs])])].join(' ')}),oracle=trace.trim().split('\n').map(JSON.parse);assert.equal(oracle.length,cases.length);
 const leafCounts=Array(7).fill(0);for(const r of oracle)r.counts.forEach((n,i)=>leafCounts[i]+=n);assert(leafCounts.every(n=>n>0));
 cases.forEach((r,i)=>{r.logs=oracle[i].logs;r.expected=oracle[i].stages;r.capacity=Math.max(64,(r.rows+r.columns)**2,7*r.logRows*(r.rows+r.columns));});
 const initialSig=signature('hnfspec_complete','pari_hnfspec_complete'),addSig=signature('hnfadd','pari_hnfadd');
 const cp=JSON.parse(run('python3',['-c',`import sys,json,importlib
sys.path[:0]=sys.argv[1:3];init=importlib.import_module('bench.pari-class-group-port.hnfspec_complete').pari_hnfspec_complete;add=importlib.import_module('bench.pari-class-group-port.hnfadd').pari_hnfadd
cases,initial_sig,add_sig=json.load(sys.stdin);out=[];guards=0
def check(v,e):
 assert v['perm']==e['perm']
 for key,name in [('H','result_h'),('D','result_dep'),('B','result_b'),('C','result_c')]:
  want=list(map(int,e[key]));assert v[name]==want+[77]*(len(v[name])-len(want)),(key,v[name],want)
for r in cases:
 cap=r['capacity'];R=r['rows'];lr=r['logRows'];n=r['initial'];st=[]
 v={name:[77]*cap for name,typ in initial_sig if typ!='int'}
 v.update(original=list(map(int,r['mat'][:R*n])),rows=R,columns=n,perm=r['perm'][:],k0=r['k0'],logs=list(map(int,r['logs'][:7*lr*n])),log_rows=lr)
 status=init(**v);st.append({'status':status,'state':v['state'][:9]})
 if status:out.append(st);continue
 check(v,r['expected'][0]);old={'h':v['result_h'],'h_rows':v['state'][0],'dep':v['result_dep'],'b':v['result_b'],'b_columns':v['state'][2],'logs':v['result_c'],'total_columns':n,'perm':v['perm']};at=n
 for step,n in enumerate(r['batches']):
  v={name:[77]*cap for name,typ in add_sig if typ!='int'};v.update(old);v.update(rows=R,log_rows=lr,new_relations=list(map(int,r['mat'][at*R:(at+n)*R])),new_columns=n,new_logs=list(map(int,r['logs'][at*lr*7:(at+n)*lr*7])))
  before=str(v);readonly=str((v['h'],v['dep'],v['b'],v['logs'],v['new_relations'],v['new_logs']))
  status=add(**v);st.append({'status':status,'state':v['state'][:9]})
  assert str((v['h'],v['dep'],v['b'],v['logs'],v['new_relations'],v['new_logs']))==readonly
  if status==1:assert str(v)==before;continue
  if status:
   assert v['state'][:6]==[-1]*6 and v['state'][8] in (1,2)
   assert all(v[k]==[77]*cap for k in ['result_h','result_dep','result_b','result_c']);break
  e=r['expected'][step+1];check(v,e);assert v['state']==e['state']+[77]*(cap-9)
  if not guards and R>1 and n>0:
   for key,value in [('rows',-1),('result_h',[]),('perm',[1]*R),('new_logs',[9]+v['new_logs'][1:])]:
    bad=v.copy();bad[key]=value;saved=str(bad)
    try:add(**bad)
    except ValueError:pass
    else:raise AssertionError('invalid hnfadd accepted')
    assert str(bad)==saved;guards+=1
  at+=n;old={'h':v['result_h'],'h_rows':v['state'][0],'dep':v['result_dep'],'b':v['result_b'],'b_columns':v['state'][2],'logs':v['result_c'],'total_columns':at,'perm':v['perm']}
 out.append(st)
assert guards==4
print(json.dumps(out))
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify([cases,initialSig,addSig])}));
 const addResults=cp.flatMap(st=>st.slice(1));
 const frontiers=cp.flatMap((st,i)=>st.slice(1).filter(e=>e.status<0).map(e=>({kind:cases[i].kind,status:e.status,phase:e.state[8]})));
 const summary={cases:cases.length,collectorCases:cases.filter(r=>r.kind==='collector').length,collectorCompletedAdds:cp.reduce((n,st,i)=>n+(cases[i].kind==='collector'?st.slice(1).filter(e=>e.status===0).length:0),0),calls:cp.flat().length,addCalls:addResults.length,completedAdds:addResults.filter(e=>e.status===0).length,frontiers,statuses:cp.flat().reduce((a,e)=>(a[e.status]=(a[e.status]||0)+1,a),{}),leafCounts,leafHash,bodyHash,traceSha256:createHash('sha256').update(trace).digest('hex'),ubsan:true,qualifiedTiming:false};
 if(process.argv.includes('--export-unit-prefixes')){
  const prefixes=[];
  cases.forEach((r,i)=>{
   if(r.kind!=='collector'||r.k0!==0)return;
   cp[i].forEach((result,stage)=>{
    if(result.status!==0)return;
    const e=r.expected[stage],columns=e.state[4];if(columns<=0)return;
    const values=[];for(let j=0;j<columns*r.logRows;j++)values.push(...e.C.slice(7*j+1,7*j+4));
    assert.equal(values.length,3*r.logRows*columns);
    prefixes.push({rows:r.logRows,columns,degree:r.n,values,collectorCase:i,stage,hnfState:e.state,hnf:e.H});
   });
  });
  console.log(JSON.stringify({summary,prefixes,preparedBoundary:'PARI post-HNF unit-log prefixes cross-checked with same-source CPython; not a closed native collector-to-regulator run'}));return;
 }
 if(process.argv.includes('--source-only')){console.log(JSON.stringify(summary));return;}
 const built=await compileKernel({sourcePath:path.join(__dirname,'hnfadd.py')}),add=require(built.modulePath).pari_hnfadd,ib=await compileKernel({sourcePath:path.join(__dirname,'hnfspec_complete.py')}),init=require(ib.modulePath).pari_hnfspec_complete;assert(add.nativeAvailable&&init.nativeAvailable);
 assert.doesNotMatch(fs.readFileSync(built.coreSourcePath,'utf8'),/napi_call_function|PyObject_Call|v8::/);
 const guards={javascript:0,gmp:0};
 for(const backend of ['javascript','gmp'])for(let ix=0;ix<cases.length;ix++){
  const r=cases[ix],cap=r.capacity,R=r.rows,lr=r.logRows,view=x=>Array.isArray(x)?x.slice():x.toArray(),blank=typ=>backend==='gmp'&&typ==='IntegerBuffer'?add.createIntegerBuffer(cap,64,Array(cap).fill(77n)):Array(cap).fill(77n),alloc=sig=>Object.fromEntries(sig.filter(x=>x[1]!=='int').map(([k,t])=>[k,blank(t)]));
  function check(v,e){assert.deepEqual(v.perm,e.perm.map(BigInt));for(const [key,name]of [['H','result_h'],['D','result_dep'],['B','result_b'],['C','result_c']]){const want=e[key].map(BigInt);assert.deepEqual(view(v[name]),[...want,...Array(cap-want.length).fill(77n)],backend+' '+ix+' '+key);}}
  let n=r.initial,v=alloc(initialSig);Object.assign(v,{original:r.mat.slice(0,R*n).map(BigInt),rows:BigInt(R),columns:BigInt(n),perm:r.perm.map(BigInt),k0:BigInt(r.k0),logs:r.logs.slice(0,7*lr*n).map(BigInt),log_rows:BigInt(lr)});
  let status=init[backend](...initialSig.map(([name])=>v[name]));assert.equal(status,BigInt(cp[ix][0].status));assert.deepEqual(v.state.slice(0,9),cp[ix][0].state.map(BigInt));if(status)continue;
  check(v,r.expected[0]);let old={h:v.result_h,h_rows:v.state[0],dep:v.result_dep,b:v.result_b,b_columns:v.state[2],logs:v.result_c,total_columns:BigInt(n),perm:v.perm},at=n;
  for(let step=0;step<r.batches.length;step++){
   n=r.batches[step];v=alloc(addSig);Object.assign(v,old,{rows:BigInt(R),log_rows:BigInt(lr),new_relations:r.mat.slice(at*R,(at+n)*R).map(BigInt),new_columns:BigInt(n),new_logs:r.logs.slice(at*lr*7,(at+n)*lr*7).map(BigInt)});
   const snapshot=w=>Object.fromEntries(Object.entries(w).map(([k,x])=>[k,typeof x==='bigint'?x:view(x)])),before=snapshot(v);status=add[backend](...addSig.map(([name])=>v[name]));assert.equal(status,BigInt(cp[ix][step+1].status));assert.deepEqual(v.state.slice(0,9),cp[ix][step+1].state.map(BigInt));
   for(const key of ['h','dep','b','logs','new_relations','new_logs'])assert.deepEqual(view(v[key]),before[key]);
   if(status===1n){assert.deepEqual(snapshot(v),before);continue;}
   if(status){for(const key of ['result_h','result_dep','result_b','result_c'])assert.deepEqual(view(v[key]),Array(cap).fill(77n));break;}
   check(v,r.expected[step+1]);assert.deepEqual(v.state,[...r.expected[step+1].state.map(BigInt),...Array(cap-9).fill(77n)]);
   if(!guards[backend]&&R>1&&n>0)for(const [key,value]of [['rows',-1n],['result_h',[]],['perm',Array(R).fill(1n)],['new_logs',[9n,...v.new_logs.slice(1)]]]){const bad={...v,[key]:value},saved=snapshot(bad);assert.throws(()=>add[backend](...addSig.map(([name])=>bad[name])));assert.deepEqual(snapshot(bad),saved);guards[backend]++;}
   at+=n;old={h:v.result_h,h_rows:v.state[0],dep:v.result_dep,b:v.result_b,b_columns:v.state[2],logs:v.result_c,total_columns:BigInt(at),perm:v.perm};
  }
 }
 assert.deepEqual(guards,{javascript:4,gmp:4});console.log(JSON.stringify({...summary,guards,cacheKey:built.cacheKey,coreBytes:fs.statSync(built.coreSourcePath).size}));
})().catch(e=>{console.error(e);process.exitCode=1;});
