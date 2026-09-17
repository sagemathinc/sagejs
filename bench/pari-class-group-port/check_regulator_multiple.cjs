"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {compileKernel}=require('../../tools/native-kernel/compiler.cjs');
const hash=x=>createHash('sha256').update(x).digest('hex');
function run(c,a,o={}){const r=spawnSync(c,a,{encoding:'utf8',timeout:120000,maxBuffer:64*1024*1024,...o});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
(async()=>{
 const pari=path.resolve(process.argv[2]),archive=path.resolve(process.argv[3]),lib=path.join(pari,'Olinux-x86_64');
 assert.equal(hash(fs.readFileSync(archive)),'02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53');
 const src=run('tar',['-xOf',archive,'pari-2.17.4/src/basemath/buch2.c']);
 const a=src.indexOf('static GEN\nclean_cols('),b=src.indexOf('/* leave small integer n as is',a);assert(a>=0&&b>a);
 let body=src.slice(a,b);
 body=body.replace('*pneed = RU - (lg(mdet)-1-r);','trace_status=1; *pneed = RU - (lg(mdet)-1-r);')
 .replace('kR = divru(det2(Im_mdet), N);','{ GEN raw = det2(Im_mdet); if(typ(raw)!=t_REAL) { trace_status=-3; return gc_NULL(av); } kR = divru(raw,N); }')
 .replace('*pneed = 0; return gc_NULL(av);','trace_status=2; *pneed = 0; return gc_NULL(av);')
 .replace('if (gexpo(gsub(d,kR)) - gexpo(d) > -20) {','if (gexpo(gsub(d,kR)) - gexpo(d) > -20) { trace_status=3;')
 .replace('{ *ptL = NULL; return gc_NULL(av); }','{ trace_status=4; *ptL = NULL; return gc_NULL(av); }')
 .replace('L = RgM_inv(Im_mdet);','L = RgM_inv(Im_mdet); if(L)trace_inverse=gclone(L);');
 const I=x=>[String(x),'-1','0'];
 function real(x,p,e=0){if(x===0||x===0n)return ['0','0',String(e-p)];let m=BigInt(x),sign=m<0n?-1n:1n;m*=sign;const bits=m.toString(2).length;return[String(sign*(m<<BigInt(p-bits))),String(p),String(e+bits-1)];}
 const cases=[];
 for(const p of [64,128,384,192])for(let rows=2;rows<=4;rows++)for(let degree=rows;degree<=2*rows;degree++)for(const exponent of [-3,-2,0,5])for(const variant of [0,1,2]){
  const columns=rows+1,values=[];
  for(let j=0;j<columns;j++)for(let i=0;i<rows;i++){
   let x=j<rows-1?(i===j?1:i===rows-1?-1:0):(i===0?j+1:i===rows-1?-j-1:0);
   if(variant===1&&i===rows-1&&j===0)x+=1;
   values.push(...real(x,p,exponent));
  }
  if(variant===2)values.splice(3*rows*(columns-1),3*rows,...Array.from({length:rows},()=>['0','0','0']).flat());
  cases.push({rows,degree,columns,values});
 }
 for(let rows=2;rows<=4;rows++)for(const columns of [0,1,3])cases.push({rows,degree:rows+1,columns,values:Array.from({length:rows*columns},()=>I(0)).flat()});
 // Whole exact independent matrices reach divru's real-only precondition.
 // The oracle cuts before that undefined type misuse and labels -3 explicitly.
 for(let rows=2;rows<=4;rows++)cases.push({rows,degree:rows,columns:rows-1,values:Array.from({length:rows-1},(_,j)=>Array.from({length:rows},(_,i)=>I(i===j?1:i===rows-1?-1:0)).flat()).flat()});
 // Large common components plus independent unit differences: cancellation
 // and residual precision are decided by source, not an assigned rank/status.
 for(const shift of [40,48,56,60,62])for(const degree of [4,5,8]){
  const big=1n<<BigInt(shift),values=[];
  for(let j=0;j<3;j++)for(let i=0;i<4;i++)values.push(...real(i===0?big:i===3?-big-(j?1n:0n):i===j?1n:0n,64));
  cases.push({rows:4,columns:3,degree,values});
 }
 const logs=JSON.parse(run(process.execPath,[path.join(__dirname,'check_log_embedding.cjs'),pari,'--export-fixtures']));
 let actualLogCases=0;
 for(let group=0;group<4;group++)for(let start=0;start<8;start++){
  const first=logs[group*20+start],rows=(first.n+first.r1)/2,columns=rows+1,values=[];
  for(let j=0;j<columns;j++){const r=logs[group*20+start+j];for(let i=0;i<rows;i++)values.push(...r.expected.slice(7*i+1,7*i+4));}
  cases.push({rows,degree:first.n,columns,values});actualLogCases++;
 }
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-regulator-multiple-')),file=path.join(dir,'oracle.c'),exe=path.join(dir,'oracle');
 fs.writeFileSync(file,`/* Source-extracted PARI 2.17.4; GPL-2.0-or-later.
 * Only cut: a non-real determinant before divru, whose precondition fails.
 * Classification counters are observations, never supplied mathematical answers. */
#include "pari.h"
#include "paripriv.h"
static long trace_status;static GEN trace_inverse;
${body}
static GEN rd(void){char s[8192];if(scanf("%8191s",s)!=1)exit(2);return gp_read_str(s);}
static GEN scalar(void){GEN m=rd();long p=itos(rd()),e=itos(rd());if(p==-1)return m;if(!signe(m))return real_0_bit(e);GEN x=itor(m,p);setexpo(x,e);return x;}
static void ps(GEN x){long e;if(typ(x)==t_INT){pari_printf("\\\"%Ps\\\",\\\"-1\\\",\\\"0\\\"",x);return;}if(typ(x)==t_FRAC){pari_printf("\\\"%Ps\\\",\\\"-2\\\",\\\"%Ps\\\"",gel(x,1),gel(x,2));return;}pari_printf("\\\"%Ps\\\",\\\"%ld\\\",\\\"%ld\\\"",signe(x)?mantissa_real(x,&e):gen_0,signe(x)?bit_prec(x):0,expo(x));}
int main(void){pari_init(64000000,1000);long count=itos(rd());for(long t=0;t<count;t++){pari_sp av=avma;long rows=itos(rd()),cols=itos(rd()),degree=itos(rd()),need=71,bits=73;GEN A=cgetg(cols+1,t_MAT),L=NULL;for(long j=1;j<=cols;j++){gel(A,j)=cgetg(rows+1,t_COL);for(long i=1;i<=rows;i++)gcoeff(A,i,j)=scalar();}trace_status=0;trace_inverse=NULL;GEN kR=compute_multiple_of_R(A,rows,degree,&need,&bits,&L);printf("{\\\"state\\\":[%ld,%ld,%ld,%ld],\\\"multiple\\\":[",trace_status,need,bits,L?(typ(L)==t_MAT?2L:1L):0L);if(kR)ps(kR);printf("],\\\"coordinates\\\":[");if(kR&&typ(L)==t_MAT)for(long j=1;j<lg(L);j++)for(long i=1;i<lgcols(L);i++){if(j>1||i>1)putchar(',');ps(gcoeff(L,i,j));}printf("],\\\"inverse\\\":[");if(trace_inverse){for(long j=1;j<lg(trace_inverse);j++)for(long i=1;i<lgcols(trace_inverse);i++){if(j>1||i>1)putchar(',');ps(gcoeff(trace_inverse,i,j));}gunclone(trace_inverse);}puts("]}");avma=av;}pari_close();return 0;}
`);
 run('cc',['-O1','-fsanitize=undefined','-fno-sanitize-recover=undefined','-I'+path.join(pari,'src/headers'),'-I'+lib,file,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',exe]);
 const trace=run(exe,[],{input:[cases.length,...cases.flatMap(r=>[r.rows,r.columns,r.degree,...r.values])].join(' ')}),expected=trace.trim().split('\n').map(JSON.parse);
 fs.writeFileSync(path.join(dir,'fixtures.json'),JSON.stringify([cases,expected]));
 let scalarReplayCount=0;
 {
  const records=JSON.parse(run('python3',['-c',`import sys,json,importlib
sys.path[:0]=sys.argv[1:3];mod=importlib.import_module('bench.pari-class-group-port.regulator_inverse');r=json.load(sys.stdin);n=r['rows'];v=[v for i in range(n) for v in [1,-1,0]]+list(map(int,r['values'][:3*n*(n-1)]));records=[]
def wrap(f,op):
 def call(*args):
  result=f(*args);records.append([op,*map(str,args),*map(str,result)]);return result
 return call
for op,name in enumerate(['add','multiply','divide']):
 name='pari_regulator_scalar_'+name;setattr(mod,name,wrap(getattr(mod,name),op))
mod.pari_regulator_inverse(v,n,[77]*(3*n*n),[77]*(3*n*n),[77]*(3*n*n),[77]*n,[77]*3)
for precision in [128,192]:
 shift=precision-128;base=226854911280625642308916404954512140971<<shift
 for da in range(-2,3):
  for db in range(-2,3):mod.pari_regulator_scalar_divide(-base-da,precision,-2,base+db,precision,0)
print(json.dumps(records))
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify(cases[234])}));
  const sf=path.join(dir,'scalar.c'),se=path.join(dir,'scalar');
  fs.writeFileSync(sf,`#define main multiple_main\n#include "oracle.c"\n#undef main
int main(void){pari_init(64000000,1000);long count=itos(rd());for(long i=0;i<count;i++){pari_sp av=avma;long op=itos(rd());GEN a=scalar(),b=scalar(),c=op==0?gadd(a,b):op==1?gmul(a,b):gdiv(a,b);putchar('[');ps(c);puts("]");avma=av;}pari_close();return 0;}`);
  run('cc',['-O1','-fsanitize=undefined','-fno-sanitize-recover=undefined','-I'+path.join(pari,'src/headers'),'-I'+lib,sf,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',se]);
  const outputs=run(se,[],{input:[records.length,...records.flatMap(r=>r.slice(0,7))].join(' ')}).trim().split('\n').map(JSON.parse);
  scalarReplayCount=records.length;
  for(let i=0;i<records.length;i++)if(JSON.stringify(records[i].slice(7))!==JSON.stringify(outputs[i])){const failure={firstScalarMismatch:i,record:records[i],expected:outputs[i],artifactDirectory:dir};if(process.argv.includes('--diagnose-scalar')){console.log(JSON.stringify(failure));return;}assert.fail(JSON.stringify(failure));}
  if(process.argv.includes('--diagnose-scalar')){console.log(JSON.stringify({scalarOpsAgree:records.length,artifactDirectory:dir}));return;}
 }
 run('python3',['-c',`import sys,json,importlib
sys.path[:0]=sys.argv[1:3];f=importlib.import_module('bench.pari-class-group-port.regulator_multiple').pari_regulator_multiple
for ix,(r,e) in enumerate(zip(*json.load(sys.stdin))):
 n=r['rows'];c=r['columns'];z=n*(c+1);q=n*n
 lengths=[3*z,c+1,3,3*z,n,c+1,3,z,z,n,c+1,c+1,10,3*q,3*q,3*q,3,n,5,3*q,3*q,3*q,n,3,3*q,3*q,3,3*(n-1)*c]
 args=[list(map(int,r['values']))+[999,-17,23],n,c,r['degree']]+[[77]*k for k in lengths]+[[77,71,73,77]]
 if e['state'][0]==-3:
  before=str(args)
  try:f(*args)
  except ValueError as error:assert str(error)=='nonzero exact regulator logarithm'
  else:raise AssertionError('out-of-domain exact logarithm accepted')
  assert str(args)==before
  continue
 status=f(*args)
 assert status==e['state'][0],(ix,status,e,r)
 assert args[32]==e['state'],(ix,args[32],e)
 assert args[30]==(list(map(int,e['multiple'])) if status==0 else [77]*3),(ix,args[30],e)
 if e['inverse']:assert args[25]==list(map(int,e['inverse'])),('inverse',ix,args[25],e['inverse'])
 assert args[31]==(list(map(int,e['coordinates'])) if status==0 else [77]*lengths[-1]),(ix,args[31],e)
 for index,value in [(1,1),(4,[]),(30,[]),(32,[])]:
  bad=args[:];bad[index]=value;before=str(bad)
  try:f(*bad)
  except ValueError:pass
  else:raise AssertionError('invalid input accepted')
  assert str(bad)==before
 if c:
  bad=args[:];bad[0]=[1<<2304,2305,0]+args[0][3:];before=str(bad)
  try:f(*bad)
  except ValueError:pass
  else:raise AssertionError('out-of-window precision accepted')
  assert str(bad)==before
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify([cases,expected])});
 const statuses={};for(const e of expected)statuses[e.state[0]]=(statuses[e.state[0]]||0)+1;
 const summary={cases:cases.length,actualLogCases,sourceClassifications:statuses,rejectedPreparedDomain:statuses[-3]||0,scalarReplayCount,traceSha256:hash(trace),ubsan:true,qualifiedTiming:false,artifactDirectory:dir};
 if(process.argv.includes('--source-only')){console.log(JSON.stringify(summary));return;}
 const built=await compileKernel({sourcePath:path.join(__dirname,'regulator_multiple.py')}),f=require(built.modulePath).pari_regulator_multiple;assert(f.nativeAvailable);
 const wordIndices=new Set([5,6,8,9,10,21,22,26,27,32]);
 for(const backend of ['javascript','gmp'])for(let ix=0;ix<cases.length;ix++){
  const r=cases[ix],e=expected[ix],n=r.rows,c=r.columns,z=n*(c+1),q=n*n,lengths=[3*z,c+1,3,3*z,n,c+1,3,z,z,n,c+1,c+1,10,3*q,3*q,3*q,3,n,5,3*q,3*q,3*q,n,3,3*q,3*q,3,3*(n-1)*c],make=(k,index)=>backend==='gmp'&&!wordIndices.has(index)?f.createIntegerBuffer(k,128,Array(k).fill(77n)):Array(k).fill(77n),view=x=>Array.isArray(x)?x:x.toArray();
  const args=[[...r.values.map(BigInt),999n,-17n,23n],BigInt(n),BigInt(c),BigInt(r.degree),...lengths.map((k,i)=>make(k,i+4)),[77n,71n,73n,77n]];
  if(e.state[0]===-3){const snap=()=>args.map(x=>typeof x==='bigint'?x:view(x).slice()),before=snap();assert.throws(()=>f[backend](...args),/nonzero exact regulator logarithm/);assert.deepEqual(snap(),before);continue;}
  const status=f[backend](...args);
  assert.equal(status,BigInt(e.state[0]),backend+' '+ix);assert.deepEqual(args[32],e.state.map(BigInt),backend+' '+ix);assert.deepEqual(view(args[30]),status===0n?e.multiple.map(BigInt):[77n,77n,77n]);assert.deepEqual(view(args[31]),status===0n?e.coordinates.map(BigInt):Array(lengths.at(-1)).fill(77n));
  if(e.inverse.length)assert.deepEqual(view(args[25]),e.inverse.map(BigInt));
  for(const [index,value]of [[1,1n],[4,make(0,4)],[30,make(0,30)],[32,[]]]){const bad=args.slice();bad[index]=value;const snap=a=>a.map(x=>typeof x==='bigint'?x:view(x).slice()),before=snap(bad);assert.throws(()=>f[backend](...bad));assert.deepEqual(snap(bad),before);}
  if(c){const bad=args.slice();bad[0]=[1n<<2304n,2305n,0n,...args[0].slice(3)];const snap=a=>a.map(x=>typeof x==='bigint'?x:view(x).slice()),before=snap(bad);assert.throws(()=>f[backend](...bad));assert.deepEqual(snap(bad),before);}
 }
 console.log(JSON.stringify({...summary,coreBytes:fs.statSync(built.coreSourcePath).size,cacheKey:built.cacheKey,sourceSha256:hash(fs.readFileSync(path.join(__dirname,'regulator_multiple.py')))}));
})().catch(e=>{console.error(e);process.exitCode=1;});
