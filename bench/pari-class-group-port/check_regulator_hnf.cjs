"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {compileKernel}=require('../../tools/native-kernel/compiler.cjs');
const hash=x=>createHash('sha256').update(x).digest('hex');
function run(c,a,o={}){const r=spawnSync(c,a,{encoding:'utf8',timeout:120000,maxBuffer:64*1024*1024,...o});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
function part(s,a,b){const i=s.indexOf(a),j=s.indexOf(b,i+a.length);assert(i>=0&&j>i,a);return s.slice(i,j);}
(async()=>{
 const pari=path.resolve(process.argv[2]),archive=path.resolve(process.argv[3]),lib=path.join(pari,'Olinux-x86_64');
 assert.equal(hash(fs.readFileSync(archive)),'02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53');
 const src=run('tar',['-xOf',archive,'pari-2.17.4/src/basemath/hnf_snf.c']);
 let elem=part(src,'static void\nZC_elem(','INLINE int'),reduce=part(src,'static void\nZM_reduce(','/* normalize T'),hnf=part(src,'static void\nremove_0cols(','/* u*z[1..k]');
 elem=elem.replace('GEN p1,u,v,d;','GEN p1,u,v,d; counts[4]++;').replace('if (!signe(ak)) {','if (!signe(ak)) { counts[5]++;').replace('if (!signe(u))','if (!signe(u) && (++counts[6]))').replace('if (!signe(v))','if (!signe(v) && (++counts[7]))').replace('  if (!is_pm1(d))','  counts[8]++; if (!is_pm1(d))');
 reduce=reduce.replace('    togglesign(q);','    counts[10]++; togglesign(q);');
 hnf=hnf.replace('ZM_hnf(GEN x)','source_ZM_hnf(GEN x)').replace('for (li=m; li>ldef; li--)\n  {','for (li=m; li>ldef; li--)\n  { counts[3]++;').replace('if (s < 0) ZV_neg_inplace(gel(A,def));','if (s < 0) { counts[9]++; ZV_neg_inplace(gel(A,def)); }').replace('else\n      if (ldef) ldef--;','else { counts[11]++; if (ldef) ldef--; }').replace('  /* rank A = n - def */','  counts[1]=n-def; counts[2]=def; trace_work=gclone(A);\n  /* rank A = n - def */');
 const cases=[];let seed=55671;function rnd(n){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;}
 function add(rows,cols,a,kind='synthetic'){cases.push({rows,cols,a:a.map(String),kind});}
 for(let rows=0;rows<=6;rows++)for(let cols=0;cols<=8;cols++)for(let variant=0;variant<4;variant++){
  const a=Array.from({length:rows*cols},()=>variant===0?0:rnd(21)-10);
  if(variant===2&&cols>1)for(let i=0;i<rows;i++)a[(cols-1)*rows+i]=a[i];
  if(variant===3&&rows>1)for(let j=0;j<cols;j++)a[j*rows+rows-1]=0;
  add(rows,cols,a);
 }
 for(const bits of [65n,128n,256n,1024n])for(const [rows,cols]of [[1,2],[3,5],[4,7]])add(rows,cols,Array.from({length:rows*cols},()=>BigInt(rnd(9)-4)*(1n<<bits)+BigInt(rnd(17)-8)),'large');
 for(const bits of [65n,128n,256n,1024n])for(const rows of [1,2,3])add(rows,rows,Array.from({length:rows*rows},(_,i)=>i%rows===Math.floor(i/rows)?-(1n<<bits)*BigInt(2*i+1):0n),'large-diagonal');
 const rel=JSON.parse(run(process.execPath,[path.join(__dirname,'check_prepared_small_norm.cjs'),pari,archive,'--export-fixtures','--unreduced','--distinct','--construct-primes']));
 for(const r of rel.cases)if(r.expected.last&&r.expected.last<=7)add(r.input.relation.length,r.expected.last,r.expected.records,'collector');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-regulator-hnf-')),file=path.join(dir,'oracle.c'),exe=path.join(dir,'oracle');
 fs.writeFileSync(file,`/* Extracted PARI 2.17.4; GPL-2.0-or-later. */
#include "pari.h"
#include "paripriv.h"
static long counts[12];static GEN trace_work;
${elem}
${reduce}
${hnf}
static void matrix(GEN A){putchar('[');for(long j=1;j<lg(A);j++)for(long i=1;i<lg(gel(A,j));i++){if(j>1||i>1)putchar(',');pari_printf("\\\"%Ps\\\"",gcoeff(A,i,j));}putchar(']');}
int main(void){pari_init(256000000,1000);long count;if(scanf("%ld",&count)!=1)return 2;for(long t=0;t<count;t++){pari_sp av=avma;long rows,cols;if(scanf("%ld%ld",&rows,&cols)!=2)return 3;GEN A=cgetg(cols+1,t_MAT);for(long j=1;j<=cols;j++){gel(A,j)=cgetg(rows+1,t_COL);for(long i=1;i<=rows;i++){char s[8192];if(scanf("%8191s",s)!=1)return 4;gcoeff(A,i,j)=gp_read_str(s);}}for(long i=0;i<12;i++)counts[i]=0;trace_work=NULL;if(cols>7){puts("{\\\"frontier\\\":true}");avma=av;continue;}GEN H=source_ZM_hnf(A),direct=ZM_hnf(A);if(!gequal(H,direct))return 5;printf("{\\\"H\\\":");matrix(H);printf(",\\\"work\\\":");if(trace_work)matrix(trace_work);else printf("[]");printf(",\\\"state\\\":[");for(long i=0;i<12;i++){if(i)putchar(',');printf("%ld",counts[i]);}puts("]}");if(trace_work)gunclone(trace_work);avma=av;}pari_close();return 0;}
`);
 run('cc',['-O1','-fsanitize=undefined','-fno-sanitize-recover=undefined','-I'+path.join(pari,'src/headers'),'-I'+lib,file,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',exe]);
 const trace=run(exe,[],{input:[cases.length,...cases.flatMap(r=>[r.rows,r.cols,...r.a])].join(' ')}),expected=trace.trim().split('\n').map(JSON.parse);
 const observedPeakBits=JSON.parse(run('python3',['-c',`import sys,json,importlib
sys.set_int_max_str_digits(0)
sys.path[:0]=sys.argv[1:3];f=importlib.import_module('bench.pari-class-group-port.regulator_hnf').pari_regulator_hnf
peak=0
class Observed(list):
 def __setitem__(self,key,value):
  global peak
  peak=max(peak,abs(value).bit_length());super().__setitem__(key,value)
for ix,(r,e) in enumerate(zip(*json.load(sys.stdin))):
 rows=r['rows'];cols=r['cols'];size=rows*cols;args=[list(map(int,r['a']))+[999],rows,cols,Observed([77]*(size+2)),Observed([77]*(rows+2)),Observed([77]*(size+2)),[77]*14];status=f(*args)
 if e.get('frontier'):
  assert status==-1 and args[3]==[77]*(size+2) and args[5]==[77]*(size+2) and args[6]==[-1]+[0]*11+[77]*2
 else:
  assert status==0 and args[6]==e['state']+[77]*2,(ix,args[6],e)
  assert args[3]==list(map(int,e['work']))+[77]*2,(ix,args[3],e)
  assert args[5]==list(map(int,e['H']))+[77]*(size+2-len(e['H'])),(ix,args[5],e)
 assert args[0]==list(map(int,r['a']))+[999]
 for index,value in [(1,-1),(2,-1),(6,[])]:
  bad=args[:];bad[index]=value;before=str(bad)
  try:f(*bad)
  except ValueError:pass
  else:raise AssertionError('invalid HNF shape accepted')
  assert str(bad)==before
 assert args[4][-2:]==[77]*2
for index in [0,3,4,5,6]:
 args=[[2,1,0,3],2,2,[77]*4,[77]*2,[77]*4,[77]*12];args[index]=[];before=str(args)
 try:f(*args)
 except ValueError:pass
 else:raise AssertionError('short HNF owner accepted')
 assert str(args)==before
print(peak)
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify([cases,expected])}));
 const counts=Array(12).fill(0);let maxBits=0;for(const e of expected)if(!e.frontier){e.state.forEach((x,i)=>counts[i]+=x);for(const v of e.work){const x=BigInt(v);maxBits=Math.max(maxBits,(x<0n?-x:x).toString(2).length);}}
 const summary={cases:cases.length,collectorCases:cases.filter(r=>r.kind==='collector').length,widthFrontiers:expected.filter(e=>e.frontier).length,finalWorkMaxBits:maxBits,observedPeakBits,counts,traceSha256:hash(trace),ubsan:true,qualifiedTiming:false,artifactDirectory:dir};
 if(process.argv.includes('--source-only')){console.log(JSON.stringify(summary));return;}
 const built=await compileKernel({sourcePath:path.join(__dirname,'regulator_hnf.py')}),f=require(built.modulePath).pari_regulator_hnf;assert(f.nativeAvailable);
 assert.doesNotMatch(fs.readFileSync(built.coreSourcePath,'utf8'),/napi_call_function|PyObject_Call|v8::/);
 for(const backend of ['javascript','gmp','tagged'])for(let ix=0;ix<cases.length;ix++){
  const r=cases[ix],e=expected[ix],size=r.rows*r.cols,make=n=>f.createIntegerBuffer(n,1024,Array(n).fill(77n));
  const raw=f.createIntegerBuffer(r.a.length+1,1024,[...r.a.map(BigInt),999n]),args=[raw,BigInt(r.rows),BigInt(r.cols),make(size+2),make(r.rows+2),make(size+2),Array(14).fill(77n)],status=f[backend](...args);
  if(e.frontier){assert.equal(status,-1n);assert.deepEqual(args[3].toArray(),Array(size+2).fill(77n));assert.deepEqual(args[5].toArray(),Array(size+2).fill(77n));assert.deepEqual(args[6],[-1n,...Array(11).fill(0n),77n,77n]);}
  else{assert.equal(status,0n);assert.deepEqual(args[6],[...e.state.map(BigInt),77n,77n],backend+' '+ix);assert.deepEqual(args[3].toArray(),[...e.work.map(BigInt),77n,77n]);assert.deepEqual(args[5].toArray(),[...e.H.map(BigInt),...Array(size+2-e.H.length).fill(77n)]);}
  assert.deepEqual(raw.toArray(),[...r.a.map(BigInt),999n]);
  assert.deepEqual(args[4].toArray().slice(-2),[77n,77n]);
  for(const [index,value]of [[1,-1n],[2,-1n],[6,[]]]){const bad=args.slice();bad[index]=value;const snap=a=>a.map(x=>typeof x==='bigint'?x:Array.isArray(x)?x.slice():x.toArray()),before=snap(bad);assert.throws(()=>f[backend](...bad));assert.deepEqual(snap(bad),before);}
 }
 for(const backend of ['javascript','gmp','tagged'])for(const index of [0,3,4,5,6]){
  const args=[[2n,1n,0n,3n],2n,2n,Array(4).fill(77n),Array(2).fill(77n),Array(4).fill(77n),Array(12).fill(77n)];args[index]=[];const before=structuredClone(args);assert.throws(()=>f[backend](...args));assert.deepEqual(args,before);
 }
 console.log(JSON.stringify({...summary,coreBytes:fs.statSync(built.coreSourcePath).size,cacheKey:built.cacheKey,sourceSha256:hash(fs.readFileSync(path.join(__dirname,'regulator_hnf.py')))}));
})().catch(e=>{console.error(e);process.exitCode=1;});
