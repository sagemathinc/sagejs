"use strict";
// Differential diagnostics, never a timing qualification.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {compileKernel}=require('../../tools/native-kernel/compiler.cjs');
function run(c,a,o={}){const r=spawnSync(c,a,{encoding:'utf8',timeout:120000,maxBuffer:64*1024*1024,...o});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
const hash=x=>createHash('sha256').update(x).digest('hex');
(async()=>{
 const pari=path.resolve(process.argv[2]),archive=path.resolve(process.argv[3]),lib=path.join(pari,'Olinux-x86_64');
 assert.equal(hash(fs.readFileSync(archive)),'02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53');
 const src=run('tar',['-xOf',archive,'pari-2.17.4/src/basemath/alglin1.c']),gen=run('tar',['-xOf',archive,'pari-2.17.4/src/basemath/gen2.c']);
 function cut(s,a,b){const i=s.indexOf(a),j=s.indexOf(b,i+a.length);assert(i>=0&&j>i,a);return s.slice(i,j);}
 const approx=cut(gen,'static int\nr_approx0(','\n/*******************************************************************/').replaceAll('cx_approx0(','source_approx0(');
 const pivot=cut(src,'static long\ngauss_get_pivot_max(','static GEN\nget_col(').replaceAll('cx_approx0(','source_approx0(');
 const two=cut(src,'static GEN\nRgM_det2(','/* M a 2x2 ZM');
 let det=cut(src,'static GEN\ndet_simple_gauss(','/* Assumes a a square t_MAT').replace('det2(GEN a)','source_det2(GEN a)');
 det=det.replace('k = pivot(a, data, i, NULL);','k = pivot(a, data, i, NULL); trace_pivots[i-1]=k;')
 .replace('if (k > nbco) return gerepilecopy(av, gcoeff(a,i,i));','if (k > nbco) { trace_early=i; trace_work=gclone(a); return gerepilecopy(av, gcoeff(a,i,i)); }')
 .replace('s = -s;','s = -s; trace_swaps++;').replace('if (gc_needed(av,2))','trace_steps++; if (gc_needed(av,2))')
 .replace('if (s < 0) x = gneg_i(x);','trace_work=gclone(a); if (s < 0) x = gneg_i(x);');
 const cases=[],I=x=>[String(x),'-1','0'],R=(x,p=64,e=0)=>[String(BigInt(x)*(1n<<BigInt(p-1))),String(p),String(e)],Z=e=>['0','0',String(e)];
 let seed=719;const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
 cases.push({n:0,values:[]});
 for(const p of [64,128,384,1856])for(let n=1;n<=4;n++)for(let t=0;t<16;t++){
  const values=[];for(let j=0;j<n;j++)for(let i=0;i<n;i++){const x=rnd();values.push(...(x%7===0?I(0):x%11===0?Z(-80):x%5===0?I((x%9)-4):R(x%2?1:-1,p,(x%17)-8)));}
  cases.push({n,values});
 }
 for(const n of [1,2,3,4])cases.push({n,values:Array.from({length:n*n},(_,i)=>I(i%n===Math.floor(i/n)?2:0)).flat()});
 cases.push({n:2,values:[...I(1),'1','-2','3','-2','-2','5',...R(1)]});
 // A real zero can win the exponent maximum; rejection returns diagonal 2.
 cases.push({n:3,values:[...I(2),...Z(10),...I(0),...I(0),...R(1),...I(0),...I(0),...I(0),...R(1)]});
 // Original get_log_embed columns; no supplied determinant/rank answers.
 // This is a prepared regulator-shaped matrix, not a regulator certificate.
 const logs=JSON.parse(run(process.execPath,[path.join(__dirname,'check_log_embedding.cjs'),pari,'--export-fixtures']));
 let actualLogCases=0;
 for(let group=0;group<4;group++)for(let start=0;start<6;start++){
  const first=logs[group*20+start],n=(first.n+first.r1)/2,values=Array.from({length:n},(_,i)=>I(i<first.r1?1:2)).flat();
  for(let j=1;j<n;j++){const r=logs[group*20+start+j];for(let i=0;i<n;i++)values.push(...r.expected.slice(7*i+1,7*i+4));}
  cases.push({n,values});actualLogCases++;
 }
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-regulator-det-')),file=path.join(dir,'oracle.c'),exe=path.join(dir,'oracle');
 fs.writeFileSync(file,`/* Literal extracted PARI 2.17.4; GPL-2.0-or-later. */
#include "pari.h"
#include "paripriv.h"
static GEN trace_work;static long trace_pivots[4],trace_steps,trace_swaps,trace_early;
${approx}
${pivot}
${two}
${det}
static GEN rd(void){char s[8192];if(scanf("%8191s",s)!=1)exit(2);return gp_read_str(s);}
static GEN scalar(void){GEN m=rd();long p=itos(rd());GEN ee=rd();if(p==-1)return m;if(p==-2)return gdiv(m,ee);long e=itos(ee);if(!signe(m))return real_0_bit(e);GEN x=itor(m,p);setexpo(x,e);return x;}
static void ps(GEN x){long e;if(typ(x)==t_INT){pari_printf("\\\"%Ps\\\",\\\"-1\\\",\\\"0\\\"",x);return;}if(typ(x)==t_FRAC){pari_printf("\\\"%Ps\\\",\\\"-2\\\",\\\"%Ps\\\"",gel(x,1),gel(x,2));return;}pari_printf("\\\"%Ps\\\",\\\"%ld\\\",\\\"%ld\\\"",signe(x)?mantissa_real(x,&e):gen_0,signe(x)?bit_prec(x):0,expo(x));}
int main(void){pari_init(64000000,1000);long count=itos(rd());for(long t=0;t<count;t++){pari_sp av=avma;long n=itos(rd());GEN A=cgetg(n+1,t_MAT);for(long j=1;j<=n;j++){gel(A,j)=cgetg(n+1,t_COL);for(long i=1;i<=n;i++)gcoeff(A,i,j)=scalar();}trace_work=NULL;trace_steps=trace_swaps=trace_early=0;for(long i=0;i<4;i++)trace_pivots[i]=77;GEN d=source_det2(A),direct=det2(A);if(!gequal(d,direct))return 4;printf("{\\\"output\\\":[");ps(d);printf("],\\\"state\\\":[%ld,%ld,%ld,%ld,0],\\\"pivots\\\":[",n<3?n:3,trace_steps,trace_swaps,trace_early);for(long i=0;i<n-1;i++){if(i)putchar(',');printf("%ld",trace_pivots[i]);}printf("],\\\"work\\\":[");if(trace_work)for(long j=1;j<=n;j++)for(long i=1;i<=n;i++){if(j>1||i>1)putchar(',');ps(gcoeff(trace_work,i,j));}puts("]}");if(trace_work)gunclone(trace_work);avma=av;}pari_close();}
`);
 run('cc',['-O1','-fsanitize=undefined','-fno-sanitize-recover=undefined','-I'+path.join(pari,'src/headers'),'-I'+lib,file,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',exe]);
 const trace=run(exe,[],{input:[cases.length,...cases.flatMap(r=>[r.n,...r.values])].join(' ')}),expected=trace.trim().split('\n').map(JSON.parse);
 run('python3',['-c',`import sys,json,importlib
sys.path[:0]=sys.argv[1:3];f=importlib.import_module('bench.pari-class-group-port.regulator_determinant').pari_regulator_determinant
for ix,(r,e) in enumerate(zip(*json.load(sys.stdin))):
 n=r['n'];v=list(map(int,r['values']));args=[v,n,[77]*(3*n*n),[77]*3,[77]*max(0,n-1),[77]*5];status=f(*args)
 if n>=3 and all(v[i]<0 for i in range(1,len(v),3)):
  assert status==-1 and args[5]==[-1,0,0,0,-1] and args[3]==[77]*3
  continue
 assert status==0 and args[3]==list(map(int,e['output'])),(ix,args[3],e)
 assert args[5]==e['state'] and args[4]==e['pivots'],(ix,args[4:],e)
 assert args[2]==list(map(int,e['work']))+[77]*(3*n*n-len(e['work'])),(ix,args[2],e)
 for index,value in [(1,5),(3,[]),(5,[])]:
  bad=args[:];bad[index]=value;before=str(bad)
  try:f(*bad)
  except ValueError:pass
  else:raise AssertionError('malformed accepted')
  assert str(bad)==before
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify([cases,expected])});
 const pivotCases=[];
 for(const p of [64,128,1856])for(const diff of [p-1,p,p+1])for(const occupied of [false,true]){
  pivotCases.push({rows:3,columns:1,column:1,occupied:[0,1,0],use:occupied,work:[...R(1,p,-diff),...I(0),...I(0)],reference:[...R(1,p,0),...I(0),...I(0)]});
  // Exact-zero reference switches to the complete original column.
  pivotCases.push({rows:3,columns:1,column:1,occupied:[0,0,0],use:occupied,work:[...R(1,p,-diff),...I(0),...I(0)],reference:[...I(0),...R(1,p,0),...I(0)]});
 }
 pivotCases.push({rows:3,columns:1,column:1,occupied:[0,0,0],use:false,work:[...R(1),...Z(20),...I(0)],reference:[...R(1),...Z(20),...I(0)]});
 pivotCases.push({rows:3,columns:1,column:1,occupied:[0,0,0],use:false,work:['1','-2','3',...R(1,64,-1),...I(0)],reference:[...I(1),...I(1),...I(0)]});
 for(let t=0;t<64;t++){
  const rows=1+rnd()%4,columns=1+rnd()%4,column=1+rnd()%columns,work=[],reference=[];
  for(let i=0;i<rows*columns;i++){let x=rnd();work.push(...(x%5===0?Z(x%9-4):x%7===0?I(0):R(x%2?1:-1,64,x%40-30)));x=rnd();reference.push(...(x%3===0?I(0):R(1,64,x%90-10)));}
  pivotCases.push({rows,columns,column,work,reference,occupied:Array.from({length:rows},()=>rnd()%3===0?1:0),use:t%2===0});
 }
 const pf=path.join(dir,'pivot.c'),pe=path.join(dir,'pivot');
 fs.writeFileSync(pf,`#define main determinant_main\n#include "oracle.c"\n#undef main
int main(void){pari_init(64000000,1000);long count=itos(rd());for(long t=0;t<count;t++){pari_sp av=avma;long rows=itos(rd()),cols=itos(rd()),col=itos(rd()),use=itos(rd());GEN A=cgetg(cols+1,t_MAT),B=cgetg(cols+1,t_MAT),occupied=cgetg(rows+1,t_VECSMALL);for(long which=0;which<2;which++){GEN X=which?B:A;for(long j=1;j<=cols;j++){gel(X,j)=cgetg(rows+1,t_COL);for(long i=1;i<=rows;i++)gcoeff(X,i,j)=scalar();}}for(long i=1;i<=rows;i++)occupied[i]=itos(rd());printf("%ld\\n",gauss_get_pivot_max(A,B,col,use?occupied:NULL));avma=av;}pari_close();return 0;}`);
 run('cc',['-O1','-fsanitize=undefined','-fno-sanitize-recover=undefined','-I'+path.join(pari,'src/headers'),'-I'+lib,pf,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',pe]);
 const ptrace=run(pe,[],{input:[pivotCases.length,...pivotCases.flatMap(r=>[r.rows,r.columns,r.column,r.use?1:0,...r.work,...r.reference,...r.occupied])].join(' ')}),pexpected=ptrace.trim().split('\n').map(Number);
 run('python3',['-c',`import sys,json,importlib
sys.path[:0]=sys.argv[1:3];f=importlib.import_module('bench.pari-class-group-port.regulator_approx_zero').pari_regulator_pivot_max
for r,e in zip(*json.load(sys.stdin)):
 args=[list(map(int,r['work'])),list(map(int,r['reference'])),r['rows'],r['columns'],r['column'],r['occupied'],r['use']];before=str(args)
 assert f(*args)==e,(r,e)
 assert str(args)==before
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify([pivotCases,pexpected])});
 const summary={cases:cases.length,actualLogCases,pivotCases:pivotCases.length,sourceSwaps:expected.reduce((s,e)=>s+e.state[2],0),sourceEarlyExits:expected.filter(e=>e.state[3]).length,exactFrontiers:cases.filter(r=>r.n>=3&&r.values.filter((_,i)=>i%3===1).every(p=>Number(p)<0)).length,traceSha256:hash(trace+ptrace),ubsan:true,qualifiedTiming:false};
 if(process.argv.includes('--source-only')){console.log(JSON.stringify(summary));return;}
 const built=await compileKernel({sourcePath:path.join(__dirname,'regulator_determinant.py')}),f=require(built.modulePath).pari_regulator_determinant;assert(f.nativeAvailable);
 for(const backend of ['javascript','gmp'])for(let ix=0;ix<cases.length;ix++){
  const r=cases[ix],e=expected[ix],n=r.n,make=k=>backend==='gmp'?f.createIntegerBuffer(k,128,Array(k).fill(77n)):Array(k).fill(77n),view=x=>Array.isArray(x)?x:x.toArray();
  const args=[r.values.map(BigInt),BigInt(n),make(3*n*n),make(3),Array(Math.max(0,n-1)).fill(77n),Array(5).fill(77n)],status=f[backend](...args);
  if(n>=3&&r.values.filter((_,i)=>i%3===1).every(p=>Number(p)<0)){assert.equal(status,-1n);assert.deepEqual(args[5],[-1n,0n,0n,0n,-1n]);assert.deepEqual(view(args[3]),[77n,77n,77n]);continue;}
  assert.equal(status,0n);assert.deepEqual(view(args[3]),e.output.map(BigInt),backend+' '+ix);assert.deepEqual(args[5],e.state.map(BigInt));assert.deepEqual(args[4],e.pivots.map(BigInt));assert.deepEqual(view(args[2]),[...e.work.map(BigInt),...Array(3*n*n-e.work.length).fill(77n)]);
  for(const [index,value]of [[1,5n],[3,make(0)],[5,[]]]){const bad=args.slice();bad[index]=value;const snap=a=>a.map(x=>typeof x==='bigint'?x:view(x).slice()),before=snap(bad);assert.throws(()=>f[backend](...bad));assert.deepEqual(snap(bad),before);}
 }
 const pb=await compileKernel({sourcePath:path.join(__dirname,'regulator_approx_zero.py')}),pivotFn=require(pb.modulePath).pari_regulator_pivot_max;assert(pivotFn.nativeAvailable);
 for(const backend of ['javascript','gmp'])for(let ix=0;ix<pivotCases.length;ix++){
  const r=pivotCases[ix],make=v=>backend==='gmp'?pivotFn.createIntegerBuffer(v.length,64,v.map(BigInt)):v.map(BigInt),args=[make(r.work),make(r.reference),BigInt(r.rows),BigInt(r.columns),BigInt(r.column),r.occupied.map(BigInt),r.use];
  const snap=()=>args.map(x=>x&&typeof x.toArray==='function'?x.toArray():Array.isArray(x)?x.slice():x),before=snap();
  assert.equal(pivotFn[backend](...args),BigInt(pexpected[ix]));assert.deepEqual(snap(),before);
 }
 console.log(JSON.stringify({...summary,coreBytes:fs.statSync(built.coreSourcePath).size,sourceSha256:hash(fs.readFileSync(path.join(__dirname,'regulator_determinant.py'))),cacheKey:built.cacheKey,pivotCacheKey:pb.cacheKey,artifactDirectory:dir}));
})().catch(e=>{console.error(e);process.exitCode=1;});
