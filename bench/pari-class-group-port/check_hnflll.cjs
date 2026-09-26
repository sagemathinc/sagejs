"use strict";
// Exact source algorithm, plus upstream whole-function and A*U oracles.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {compileKernel}=require('../../tools/native-kernel/compiler.cjs');
function run(c,a,o={}){const r=spawnSync(c,a,{encoding:'utf8',timeout:120000,maxBuffer:64*1024*1024,...o});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
function part(s,a,b){const i=s.indexOf(a),j=s.indexOf(b,i);assert(i>=0&&j>i,a);return s.slice(i,j);}
(async()=>{
 const pari=path.resolve(process.argv[2]),archive=path.resolve(process.argv[3]),lib=path.join(pari,'Olinux-x86_64');
 assert.equal(createHash('sha256').update(fs.readFileSync(archive)).digest('hex'),'02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53');
 const source=run('tar',['-xOf',archive,'pari-2.17.4/src/basemath/hnf_snf.c']);assert.equal(source,fs.readFileSync(path.join(pari,'src/basemath/hnf_snf.c'),'utf8'));
 const remove=part(source,'static void\nremove_0cols(','/* Inefficient compared');
 let body=part(source,'static void\nMinus(','GEN\nhnflll(GEN x)');
 const bodyHash=createHash('sha256').update(remove+body).digest('hex');
 const replace=(a,b)=>{assert.equal(body.split(a).length,2,a);body=body.replace(a,b);};
 replace('ZM_hnflll(GEN A,','audit_hnflll(GEN A,');
 replace('    ZV_togglesign(Aj);','    counters[1]++; ZV_togglesign(Aj);');
 replace('  *row0 = findi_normalize','  counters[2]++;\n  *row0 = findi_normalize');
 replace('    q = truedivii(gcoeff(A,*row0,k), gcoeff(A,*row0,j));','    { counters[3]++; q = truedivii(gcoeff(A,*row0,k), gcoeff(A,*row0,j)); }');
 replace('      q = diviiround(gcoeff(lambda,j,k), gel(D,j));','      { counters[4]++; q = diviiround(gcoeff(lambda,j,k), gel(D,j)); }');
 replace('    else\n      return;','    else\n      { counters[5]++; return; }');
 replace('  if (signe(q))\n  {','  if (signe(q))\n  {\n    counters[6]++;');
 replace('  swap(gel(A,k), gel(A,k-1));','  counters[7]++; swap(gel(A,k), gel(A,k-1));');
 replace('  GEN z = addii(mulii(gel(D,k-2),gel(D,k)), sqri(gcoeff(lambda,k-1,k)));','  counters[8]++;\n  GEN z = addii(mulii(gel(D,k-2),gel(D,k)), sqri(gcoeff(lambda,k-1,k)));');
 replace('  while (k < n)\n  {','  while (k < n)\n  {\n    counters[0]++;');
 replace('  gerepileall(av, B? 2: 1, &A, &B);','  counters[9]=k;counters[10]=kmax;\n  trace_lambda=gcopy(lambda);trace_d=cgetg(n+1,t_VEC);for(long i=0;i<n;i++)gel(trace_d,i+1)=icopy(gel(D,i));\n  /* retain all diagnostic owners through printing */');
 let seed=0x5b3257c1;function random(n){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;}
 const cases=[];function add(rows,cols,a,kind='synthetic'){cases.push({rows,cols,a:a.map(String),kind});}
 for(let rows=0;rows<=6;rows++)for(let cols=0;cols<=8;cols++)for(let sample=0;sample<4;sample++){
  const a=Array.from({length:rows*cols},()=>sample===0?0:random(19)-9);
  if(sample===2&&cols>1)for(let i=0;i<rows;i++)a[(cols-1)*rows+i]=a[i];
  add(rows,cols,a);
 }
 for(const bits of [64n,128n,256n,512n])for(const [rows,cols]of [[1,1],[2,3],[4,6]]){
  const a=Array.from({length:rows*cols},()=>BigInt(random(9)-4)*(1n<<bits)+BigInt(random(19)-9));add(rows,cols,a,'large');
 }
 // Original collector relation columns, not fabricated rank-profile answers.
 const relations=JSON.parse(run(process.execPath,[path.join(__dirname,'check_prepared_small_norm.cjs'),pari,archive,'--export-fixtures','--unreduced','--distinct','--construct-primes']));
 for(const r of relations.cases)if(r.expected.last)add(r.input.relation.length,r.expected.last,r.expected.records,'collector');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-hnflll-')),c=path.join(dir,'oracle.c'),exe=path.join(dir,'oracle');
 fs.writeFileSync(c,`/* Source-extracted PARI2.17.4, GPL-2.0-or-later. */
#include "pari.h"
#include "paripriv.h"
_Static_assert(sizeof(long)==8,"pinned word model required");
#define DEBUGLEVEL DEBUGLEVEL_mathnf
static long counters[11];static GEN trace_lambda,trace_d;
${remove}\n${body}
static void matrix(GEN m){putchar('[');for(long j=1;j<lg(m);j++)for(long i=1;i<lg(gel(m,j));i++){if(j!=1||i!=1)putchar(',');pari_printf("\\"%Ps\\"",gmael(m,j,i));}putchar(']');}
int main(void){pari_init(256000000,1000);long count;if(scanf("%ld",&count)!=1)return 2;
for(long z=0;z<count;z++){pari_sp av=avma;long rows,cols;if(scanf("%ld%ld",&rows,&cols)!=2)return 3;GEN A=cgetg(cols+1,t_MAT);
for(long j=1;j<=cols;j++){gel(A,j)=cgetg(rows+1,t_COL);for(long i=1;i<=rows;i++){char value[8192];if(scanf("%8191s",value)!=1)return 4;gmael(A,j,i)=gp_read_str(value);}}
for(long i=0;i<11;i++)counters[i]=0;GEN U,H=audit_hnflll(A,&U,0),U2,H2=ZM_hnflll(A,&U2,0);if(!gequal(H,H2)||!gequal(U,U2))return 5;
printf("{\\"H\\":");matrix(H);printf(",\\"U\\":");matrix(U);printf(",\\"lambda\\":");matrix(trace_lambda);printf(",\\"D\\":[");for(long i=1;i<lg(trace_d);i++){if(i>1)putchar(',');pari_printf("\\"%Ps\\"",gel(trace_d,i));}
printf("],\\"state\\":[");for(long i=0;i<11;i++){if(i)putchar(',');printf("\\"%ld\\"",counters[i]);}puts("]}");avma=av;}
printf("{\\"round\\":[");for(long a=-31;a<=31;a++)for(long b=1;b<=17;b++){if(a!=-31||b!=1)putchar(',');pari_printf("\\"%Ps\\"",diviiround(stoi(a),stoi(b)));}puts("]}");pari_close();return 0;}
`);
 run('cc',['-O1','-fsanitize=undefined','-fno-sanitize-recover=undefined','-I'+path.join(pari,'src/headers'),'-I'+lib,c,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',exe]);
 const trace=run(exe,[],{input:[cases.length,...cases.flatMap(r=>[r.rows,r.cols,...r.a])].join(' ')}),all=trace.trim().split('\n').map(JSON.parse),round=all.pop().round,expected=all;assert.equal(expected.length,cases.length);
 let products=0,maxBits=0;const counts=Array(9).fill(0);
 for(let z=0;z<cases.length;z++){
  const r=cases[z],e=expected[z],A=r.a.map(BigInt),U=e.U.map(BigInt),H=e.H.map(BigInt);
  for(let i=0;i<9;i++)counts[i]+=Number(e.state[i]);
  for(const v of [...e.H,...e.U,...e.lambda,...e.D]){const n=BigInt(v);maxBits=Math.max(maxBits,(n<0n?-n:n).toString(2).length);}
  for(let j=0;j<r.cols;j++)for(let i=0;i<r.rows;i++){let value=0n;for(let k=0;k<r.cols;k++)value+=A[k*r.rows+i]*U[j*r.cols+k];assert.equal(value,H[j*r.rows+i]);products++;}
 }
 assert(counts.every(x=>x>0));assert(maxBits>64&&maxBits<=16384);
 run('python3',['-c',`import sys,json,importlib
sys.path[:0]=sys.argv[1:3];m=importlib.import_module('bench.pari-class-group-port.hnflll');data=json.load(sys.stdin)
for r,e in data['cases']:
 rows=r['rows'];cols=r['cols'];raw=list(map(int,r['a']))+[999];a=[77]*(rows*cols+2);u=[77]*(cols*cols+2);lam=[77]*(cols*cols+2);d=[77]*(cols+3);state=[77]*13
 assert m.pari_hnflll(raw,rows,cols,a,u,lam,d,state)==0
 for actual,w in [(a,e['H']),(u,e['U']),(lam,e['lambda']),(d,e['D']),(state,e['state'])]:assert actual==list(map(int,w))+[77,77],(r,e,actual)
 assert raw==list(map(int,r['a']))+[999]
ix=0
for a in range(-31,32):
 for b in range(1,18):
  assert m.pari_hnflll_round_quotient(a,b)==int(data['round'][ix]);ix+=1
  assert m.pari_hnflll_exact_quotient(a*b,b)==a
for variant in range(8):
 raw=[2,1,0,2];rows=2;cols=2;a=[77]*4;u=[77]*4;lam=[77]*4;d=[77]*3;state=[77]*11
 if variant==0:rows=-1
 if variant==1:cols=-1
 if variant==2:raw=raw[:3]
 if variant==3:a=a[:3]
 if variant==4:u=u[:3]
 if variant==5:lam=lam[:3]
 if variant==6:d=d[:2]
 if variant==7:state=state[:10]
 args=(raw,rows,cols,a,u,lam,d,state);before=str(args)
 try:m.pari_hnflll(*args)
 except ValueError:pass
 else:raise AssertionError('malformed HNFLLL input accepted')
 assert str(args)==before
for a,b in [(1,2),(1,0),(1,-1)]:
 try:m.pari_hnflll_exact_quotient(a,b)
 except ValueError:pass
 else:raise AssertionError('invalid exact division accepted')
for b in [0,-1]:
 try:m.pari_hnflll_round_quotient(1,b)
 except ValueError:pass
 else:raise AssertionError('invalid rounding domain accepted')
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify({cases:cases.map((r,i)=>[r,expected[i]]),round})});
 const built=await compileKernel({sourcePath:path.join(__dirname,'hnflll.py')}),mod=require(built.modulePath),f=mod.pari_hnflll;
 assert(f.nativeAvailable);assert.doesNotMatch(fs.readFileSync(built.coreSourcePath,'utf8'),/napi_call_function|PyObject_Call|v8::/);
 for(const backend of ['javascript','gmp']){
  for(let z=0;z<cases.length;z++){
   const r=cases[z],e=expected[z],rows=r.rows,cols=r.cols,words=n=>Array(n).fill(77n),exact=n=>f.createIntegerBuffer(n,256,words(n));
   const raw=f.createIntegerBuffer(r.a.length+1,256,[...r.a.map(BigInt),999n]),a=exact(rows*cols+2),u=exact(cols*cols+2),lam=exact(cols*cols+2),d=exact(cols+3),state=words(13);
   assert.equal(f[backend](raw,BigInt(rows),BigInt(cols),a,u,lam,d,state),0n);
   for(const [actual,w]of [[a.toArray(),e.H],[u.toArray(),e.U],[lam.toArray(),e.lambda],[d.toArray(),e.D],[state,e.state]])assert.deepEqual(actual,[...w.map(BigInt),77n,77n]);
   assert.deepEqual(raw.toArray(),[...r.a.map(BigInt),999n]);
  }
  let ix=0;for(let a=-31;a<=31;a++)for(let b=1;b<=17;b++){assert.equal(mod.pari_hnflll_round_quotient[backend](BigInt(a),BigInt(b)),BigInt(round[ix++]));assert.equal(mod.pari_hnflll_exact_quotient[backend](BigInt(a*b),BigInt(b)),BigInt(a));}
  for(let variant=0;variant<8;variant++){
   let raw=[2n,1n,0n,2n],rows=2n,cols=2n,a=Array(4).fill(77n),u=Array(4).fill(77n),lam=Array(4).fill(77n),d=Array(3).fill(77n),state=Array(11).fill(77n);
   if(variant===0)rows=-1n;if(variant===1)cols=-1n;if(variant===2)raw=raw.slice(0,3);if(variant===3)a=a.slice(0,3);if(variant===4)u=u.slice(0,3);if(variant===5)lam=lam.slice(0,3);if(variant===6)d=d.slice(0,2);if(variant===7)state=state.slice(0,10);
   const args=[raw,rows,cols,a,u,lam,d,state],before=args.map(x=>Array.isArray(x)?x.slice():x);assert.throws(()=>f[backend](...args),/invalid|short/);assert.deepEqual(args,before);
  }
  for(const [a,b]of [[1n,2n],[1n,0n],[1n,-1n]])assert.throws(()=>mod.pari_hnflll_exact_quotient[backend](a,b),/invalid/);
  for(const b of [0n,-1n])assert.throws(()=>mod.pari_hnflll_round_quotient[backend](1n,b),/positive divisor/);
 }
 console.log(JSON.stringify({cases:cases.length,realRelationCases:cases.filter(r=>r.kind==='collector').length,products,maxBits,counts,quotientCases:round.length,invalidShapesRejected:8,bodyHash,traceSha256:createHash('sha256').update(trace).digest('hex'),cacheKey:built.cacheKey,coreBytes:fs.statSync(built.coreSourcePath).size,ubsan:true,qualifiedTiming:false}));
})().catch(e=>{console.error(e);process.exitCode=1;});
