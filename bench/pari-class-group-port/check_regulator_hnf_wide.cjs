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
 let elem=part(src,'static void\nZC_elem(','INLINE int'),reduce=part(src,'static void\nZM_reduce(','/* normalize T'),body=part(src,'GEN\nZM_hnfall_i(','GEN\nhnfall(GEN x)');
 const remove=part(src,'static void\nremove_0cols(','/* Inefficient compared');
 elem=elem.replace('GEN p1,u,v,d;','GEN p1,u,v,d; counts[6]++;').replace('if (!signe(ak)) {','if (!signe(ak)) { counts[7]++;').replace('if (!signe(u))','if (!signe(u) && (++counts[8]))').replace('if (!signe(v))','if (!signe(v) && (++counts[9]))').replace('  if (!is_pm1(d))','  counts[10]++; if (!is_pm1(d))');
 reduce=reduce.replace('    ZV_neg_inplace(gel(A,j0));','    counts[11]++; ZV_neg_inplace(gel(A,j0));').replace('    togglesign(q);','    counts[12]++; togglesign(q);');
 body=body.replaceAll('ZM_hnfall','audit_ZM_hnfall').replace('for (li=m; li; li--)\n  {','for (li=m; li; li--)\n  { counts[3]++;').replace('for (j=1; j<r; j++)\n    {','for (j=1; j<r; j++)\n    { counts[4]++;').replace('for (i=h[j]; i>li; i--)\n      {','for (i=h[j]; i>li; i--)\n      { counts[5]++;').replace('      swap(gel(A,j), gel(A,r));','      counts[14]++; swap(gel(A,j), gel(A,r));').replace('      ZV_neg_inplace(gel(A,r));','      counts[11]++; ZV_neg_inplace(gel(A,r));').replace('for (i=h[j]; i; i--)\n    {','for (i=h[j]; i; i--)\n    { counts[13]++;').replace('  if (remove) remove_0cols(r, &A, &B, remove);','  counts[1]=n-r; counts[2]=r; trace_work=gclone(A);trace_c=gclone(c);trace_h=gclone(h);\n  if (remove) remove_0cols(r, &A, &B, remove);');
 const cases=[];let seed=77357;function rnd(n){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;}
 function add(rows,cols,a){cases.push({rows,cols,a:a.map(String)});}
 for(let rows=0;rows<=6;rows++)for(const cols of [8,9,12,17])for(let variant=0;variant<4;variant++){
  const a=Array.from({length:rows*cols},()=>variant===0?0:rnd(31)-15);
  if(variant===2&&rows>1)for(let j=0;j<cols;j++)a[j*rows+rows-1]=0;
  if(variant===3)for(let j=1;j<cols;j++)for(let i=0;i<rows;i++)a[j*rows+i]=a[i];
  add(rows,cols,a);
 }
 for(const bits of [65n,128n,256n,512n])for(const rows of [1,3,4]){
  add(rows,8,Array.from({length:rows*8},()=>BigInt(rnd(11)-5)*(1n<<bits)+BigInt(rnd(23)-11)));
  add(rows,9,Array.from({length:rows*9},(_,i)=>i%rows===Math.floor(i/rows)?-(1n<<bits)*BigInt(2*i+1):0n));
 }
 // j==r after decrement must NOT assign c[li]; retain that source quirk.
 for(const rows of [1,3,4]){
  add(rows,8,Array.from({length:rows*8},(_,i)=>Math.floor(i/rows)===7?i%rows+1:0));
  add(rows,8,Array.from({length:rows*8},(_,i)=>Math.floor(i/rows)===8-rows+i%rows?i%rows+1:0));
 }
 for(const [rows,cols]of [[9,8],[12,9]])add(rows,cols,Array.from({length:rows*cols},()=>rnd(15)-7));
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-regulator-hnf-wide-')),file=path.join(dir,'oracle.c'),exe=path.join(dir,'oracle');
 fs.writeFileSync(file,`/* Literal PARI2.17.4 extraction; GPL-2.0-or-later. */
#include "pari.h"
#include "paripriv.h"
static long counts[15];static GEN trace_work,trace_c,trace_h;
${elem}
${reduce}
${remove}
${body}
static void matrix(GEN A){putchar('[');for(long j=1;j<lg(A);j++)for(long i=1;i<lg(gel(A,j));i++){if(j>1||i>1)putchar(',');pari_printf("\\\"%Ps\\\"",gcoeff(A,i,j));}putchar(']');}
static void words(GEN v){putchar('[');for(long i=1;i<lg(v);i++){if(i>1)putchar(',');printf("%ld",v[i]);}putchar(']');}
int main(void){pari_init(256000000,1000);long count;if(scanf("%ld",&count)!=1)return 2;for(long t=0;t<count;t++){pari_sp av=avma;long rows,cols;if(scanf("%ld%ld",&rows,&cols)!=2)return 3;GEN A=cgetg(cols+1,t_MAT);for(long j=1;j<=cols;j++){gel(A,j)=cgetg(rows+1,t_COL);for(long i=1;i<=rows;i++){char s[8192];if(scanf("%8191s",s)!=1)return 4;gcoeff(A,i,j)=gp_read_str(s);}}for(long i=0;i<15;i++)counts[i]=0;GEN H=audit_ZM_hnfall(A,NULL,1),direct=ZM_hnf(A);if(!gequal(H,direct))return 5;printf("{\\\"H\\\":");matrix(H);printf(",\\\"work\\\":");matrix(trace_work);printf(",\\\"c\\\":");words(trace_c);printf(",\\\"h\\\":");words(trace_h);printf(",\\\"state\\\":[");for(long i=0;i<15;i++){if(i)putchar(',');printf("%ld",counts[i]);}puts("]}");gunclone(trace_work);gunclone(trace_c);gunclone(trace_h);avma=av;}pari_close();return 0;}
`);
 run('cc',['-O1','-fsanitize=undefined','-fno-sanitize-recover=undefined','-I'+path.join(pari,'src/headers'),'-I'+lib,file,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',exe]);
 const trace=run(exe,[],{input:[cases.length,...cases.flatMap(r=>[r.rows,r.cols,...r.a])].join(' ')}),expected=trace.trim().split('\n').map(JSON.parse);
 const peakBits=JSON.parse(run('python3',['-c',`import sys,json,importlib
sys.set_int_max_str_digits(0);sys.path[:0]=sys.argv[1:3];f=importlib.import_module('bench.pari-class-group-port.regulator_hnf_wide').pari_regulator_hnf_wide
peak=0
class Observed(list):
 def __setitem__(self,key,value):
  global peak
  peak=max(peak,abs(value).bit_length());super().__setitem__(key,value)
for ix,(r,e) in enumerate(zip(*json.load(sys.stdin))):
 rows=r['rows'];cols=r['cols'];size=rows*cols;args=[list(map(int,r['a']))+[999],rows,cols,Observed([77]*(size+2)),Observed([77]*(rows+2)),[77]*(rows+2),[77]*(cols+2),Observed([77]*(size+2)),[77]*17]
 assert f(*args)==0
 for at,key in [(3,'work'),(5,'c'),(6,'h'),(8,'state')]:assert args[at]==list(map(int,e[key]))+[77]*2,(ix,key,args[at],e[key])
 assert args[7]==list(map(int,e['H']))+[77]*(size+2-len(e['H'])),(ix,args[7],e['H'])
 assert args[0]==list(map(int,r['a']))+[999] and args[4][-2:]==[77]*2
for index,value in [(0,[]),(1,-1),(2,7),(3,[]),(4,[]),(5,[]),(6,[]),(7,[]),(8,[])]:
 args=[[1]*16,2,8,[77]*16,[77]*2,[77]*2,[77]*8,[77]*16,[77]*15];args[index]=value;before=str(args)
 try:f(*args)
 except ValueError:pass
 else:raise AssertionError('invalid wide HNF input accepted')
 assert str(args)==before
print(peak)
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify([cases,expected])}));
 const counts=Array(15).fill(0);for(const e of expected)e.state.forEach((x,i)=>counts[i]+=x);
 const summary={cases:cases.length,syntheticOnly:true,counts,peakBits,traceSha256:hash(trace),ubsan:true,qualifiedTiming:false,artifactDirectory:dir};
 if(process.argv.includes('--source-only')){console.log(JSON.stringify(summary));return;}
 const built=await compileKernel({sourcePath:path.join(__dirname,'regulator_hnf_wide.py')}),f=require(built.modulePath).pari_regulator_hnf_wide;assert(f.nativeAvailable);
 assert.doesNotMatch(fs.readFileSync(built.coreSourcePath,'utf8'),/napi_call_function|PyObject_Call|v8::/);
 for(const backend of ['javascript','gmp','tagged'])for(let ix=0;ix<cases.length;ix++){
  const r=cases[ix],e=expected[ix],size=r.rows*r.cols,make=n=>f.createIntegerBuffer(n,1024,Array(n).fill(77n));
  const raw=f.createIntegerBuffer(r.a.length+1,1024,[...r.a.map(BigInt),999n]),args=[raw,BigInt(r.rows),BigInt(r.cols),make(size+2),make(r.rows+2),Array(r.rows+2).fill(77n),Array(r.cols+2).fill(77n),make(size+2),Array(17).fill(77n)];assert.equal(f[backend](...args),0n);
  assert.deepEqual(args[3].toArray(),[...e.work.map(BigInt),77n,77n],backend+' '+ix);assert.deepEqual(args[5],[...e.c.map(BigInt),77n,77n]);assert.deepEqual(args[6],[...e.h.map(BigInt),77n,77n]);assert.deepEqual(args[8],[...e.state.map(BigInt),77n,77n]);assert.deepEqual(args[7].toArray(),[...e.H.map(BigInt),...Array(size+2-e.H.length).fill(77n)]);assert.deepEqual(raw.toArray(),[...r.a.map(BigInt),999n]);assert.deepEqual(args[4].toArray().slice(-2),[77n,77n]);
 }
 for(const backend of ['javascript','gmp','tagged'])for(const [index,value]of [[0,[]],[1,-1n],[2,7n],[3,[]],[4,[]],[5,[]],[6,[]],[7,[]],[8,[]]]){const args=[Array(16).fill(1n),2n,8n,Array(16).fill(77n),Array(2).fill(77n),Array(2).fill(77n),Array(8).fill(77n),Array(16).fill(77n),Array(15).fill(77n)];args[index]=value;const before=structuredClone(args);assert.throws(()=>f[backend](...args));assert.deepEqual(args,before);}
 console.log(JSON.stringify({...summary,coreBytes:fs.statSync(built.coreSourcePath).size,cacheKey:built.cacheKey,sourceSha256:hash(fs.readFileSync(path.join(__dirname,'regulator_hnf_wide.py')))}));
})().catch(e=>{console.error(e);process.exitCode=1;});
