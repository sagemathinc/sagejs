"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {compileKernel}=require('../../tools/native-kernel/compiler.cjs');
const hash=x=>createHash('sha256').update(x).digest('hex');
function run(c,a,o={}){const r=spawnSync(c,a,{encoding:'utf8',timeout:180000,maxBuffer:128*1024*1024,...o});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
(async()=>{
 const pari=path.resolve(process.argv[2]),archive=path.resolve(process.argv[3]),lib=path.join(pari,'Olinux-x86_64');
 assert.equal(hash(fs.readFileSync(archive)),'02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53');
 const source=run('tar',['-xOf',archive,'pari-2.17.4/src/basemath/Flv.c']);
 const begin=source.indexOf('static GEN\nFlm_solve_upper_1('),end=source.indexOf('static long\nFlm_echelon_gauss(');assert(begin>0&&end>begin);
 const cases=[];let seed=829123;const rnd=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
 for(const [m,n] of [[1,1],[3,7],[7,3],[7,9],[8,8],[8,13],[13,8],[15,16],[16,15],[24,29],[32,32],[63,65],[80,80]]){
  for(const prime of [2,101,2147483659])for(let variant=0;variant<8;variant++){
   const a=Array.from({length:m*n},(_,ij)=>{const i=Math.floor(ij/n),j=ij%n;
    if(variant===0)return 0;
    if(variant===1)return i===j?1:0;
    if(variant===2&&i<Math.ceil(Math.min(m,n)/2))return 0;
    if(variant===3&&j<n-2)return 0;
    if(variant===4)return (i+1)*(j+1)%prime;
    if(variant===5)return (i%3)*(j%5)%prime;
    return rnd(Math.min(prime,997));});
   cases.push({rows:m,columns:n,prime,matrix:a.map(String)});
  }
 }
 for(const n of [8,17])cases.push({rows:n,columns:n,prime:'2305843009213693951',matrix:Array.from({length:n*n},(_,k)=>String(2305843009213693951n-BigInt(1+rnd(997))))});
 const at=process.argv.indexOf('--fixtures');
 if(at>=0){const supplied=JSON.parse(fs.readFileSync(process.argv[at+1]));for(const r of supplied.cases||supplied){const v=r.reference||r;cases.push({...v,matrix:(v.modularMatrix||v.matrix).map(String)});}}
 for(const m of [32,128])cases.push({rows:m,columns:8,prime:2147483659,matrix:Array.from({length:m*8},(_,k)=>Math.floor(k/8)===m-1&&k%8===7?'1':'0')});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-flm-cup-')),file=path.join(dir,'oracle.c'),exe=path.join(dir,'oracle');
 fs.writeFileSync(file,`/* Pinned PARI differential oracle; GPL-2.0-or-later. */
#include "pari.h"
#include "paripriv.h"
${source.slice(begin,end)}
static void vec(GEN a,long n){putchar('[');for(long i=1;i<=n;i++){if(i>1)putchar(',');printf("%ld",a[i]);}putchar(']');}
static void mat(GEN a,long m,long n){putchar('[');for(long i=1;i<=m;i++)for(long j=1;j<=n;j++){if(i>1||j>1)putchar(',');printf("\\\"%lu\\\"",ucoeff(a,i,j));}putchar(']');}
int main(void){pari_init(256000000,1000);long count;if(scanf("%ld",&count)!=1)return 2;
for(long t=0;t<count;t++){pari_sp av=avma;long m,n;ulong p;if(scanf("%ld %ld %lu",&m,&n,&p)!=3)return 3;
GEN A=zero_Flm_copy(m,n);for(long i=1;i<=m;i++)for(long j=1;j<=n;j++)if(scanf("%lu",&ucoeff(A,i,j))!=1)return 4;
GEN R,C,U,P;long rank=Flm_CUP_pre(A,&R,&C,&U,&P,p,get_Fl_red(p));GEN d=zero_zv(n);for(long i=1;i<=rank;i++)d[P[i]]=R[i];
printf("{\\\"rank\\\":%ld,\\\"R\\\":",rank);vec(R,rank);printf(",\\\"P\\\":");vec(P,n);printf(",\\\"C\\\":");mat(C,m,rank);printf(",\\\"U\\\":");mat(U,rank,n);printf(",\\\"pivots\\\":");vec(d,n);puts("}");avma=av;}pari_close();}
`);
 run('cc',['-O1','-fsanitize=undefined','-fno-sanitize-recover=undefined','-I'+path.join(pari,'src/headers'),'-I'+lib,file,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',exe]);
 const trace=run(exe,[],{input:[cases.length,...cases.flatMap(r=>[r.rows,r.columns,r.prime,...r.matrix])].join(' ')}),expected=trace.trim().split('\n').map(JSON.parse);
 const cp=run('python3',['-c',`import sys,json,importlib
sys.path[:0]=sys.argv[1:3]
f=importlib.import_module('bench.pari-class-group-port.flm_cup').pari_flm_cup
for ix,(v,e) in enumerate(zip(*json.load(sys.stdin))):
 m,n,p=v['rows'],v['columns'],int(v['prime']);s=max(1,m*n,m,n);a=list(map(int,v['matrix']))+[999]
 work=[77]*(8*s*(m//4+1)+2);frames=[77]*(3*(n.bit_length()+1)+2);ss=[77]*10;d=[77]*(n+2);state=[77]*10
 assert f(a,m,n,p,work,frames,ss,d,state)==0,(ix,state)
 r=e['rank'];actual={'rank':r,'R':work[6*s:6*s+r],'P':work[7*s:7*s+n],'C':[str(work[s+i*n+j]) for i in range(m) for j in range(r)],'U':[str(work[2*s+i*n+j]) for i in range(r) for j in range(n)],'pivots':d[:n]}
 assert actual==e,(ix,v,actual,e)
 assert state==[0,r,n-r]+[77]*7 and a==list(map(int,v['matrix']))+[999]
 assert work[-2:]==frames[-2:]==ss[-2:]==d[-2:]==[77]*2
def args(m=8,n=8):
 s=max(1,m*n,m,n)
 return [[int(i//n==i%n) for i in range(m*n)],m,n,2147483659,[77]*(8*s*(m//4+1)),[77]*(3*(n.bit_length()+1)),[77]*8,[77]*n,[77]*8]
for index in [0,4,5,6,7,8]:
 a=args();a[index]=[];before=repr(a)
 try:f(*a)
 except ValueError:pass
 else:raise AssertionError(('short owner',index))
 assert repr(a)==before
for value in [-1,2147483659]:
 a=args();a[0][0]=value;before=repr(a)
 try:f(*a)
 except ValueError:pass
 else:raise AssertionError('unreduced residue')
 assert repr(a)==before
for m,n in [(0,0),(0,5),(5,0)]:
 a=args(m,n);assert f(*a)==0 and a[7]==[0]*n and a[8][:3]==[0,0,n]
a=args(90,300);assert f(*a)==-1 and a[7]==[77]*300 and a[8]==[-1]+[77]*7
print('CPython passed')
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify([cases,expected])});
 const summary={cases:cases.length,cp:cp.trim(),ubsan:true,sourceSha256:hash(source),traceSha256:hash(trace),artifactDirectory:dir,qualifiedTiming:false};
 fs.writeFileSync(path.join(dir,'fixtures.json'),JSON.stringify({cases,expected,summary}));
 if(process.argv.includes('--source-only')){console.log(JSON.stringify(summary));return;}
 const built=await compileKernel({sourcePath:path.join(__dirname,'flm_cup.py')}),f=require(built.modulePath).pari_flm_cup;assert(f.nativeAvailable);
 assert.doesNotMatch(fs.readFileSync(built.coreSourcePath,'utf8'),/napi_call_function|PyObject_Call|v8::/);
 const output=[];
 for(const backend of ['javascript','gmp'])for(let ix=0;ix<cases.length;ix++){
  const v=cases[ix],e=expected[ix],m=v.rows,n=v.columns,s=Math.max(1,m*n,m,n),bits=x=>BigInt(x).toString(2).length,make=k=>f.createIntegerBuffer(k,4,Array(k).fill(77n));
  const a=f.createIntegerBuffer(v.matrix.length+1,4,[...v.matrix.map(BigInt),999n]),arena=make(8*s*(Math.floor(m/4)+1)+2),frames=make(3*(bits(n)+1)+2),ss=Array(10).fill(77n),d=make(n+2),state=Array(10).fill(77n);
  assert.equal(f[backend](a,BigInt(m),BigInt(n),BigInt(v.prime),arena,frames,ss,d,state),0n,backend+' '+ix);
  const w=arena.toArray(),r=e.rank,actual={rank:r,R:w.slice(6*s,6*s+r).map(Number),P:w.slice(7*s,7*s+n).map(Number),C:Array.from({length:m*r},(_,k)=>String(w[s+Math.floor(k/r)*n+k%r])),U:Array.from({length:r*n},(_,k)=>String(w[2*s+k])),pivots:d.toArray().slice(0,n).map(Number)};
  assert.deepEqual(actual,e,backend+' '+ix);assert.deepEqual(state,[0n,BigInt(r),BigInt(n-r),...Array(7).fill(77n)]);
  assert.deepEqual(a.toArray(),[...v.matrix.map(BigInt),999n]);for(const x of [w,frames.toArray(),ss,d.toArray()])assert.deepEqual(x.slice(-2),[77n,77n]);
  output.push({backend,index:ix,...actual});
 }
 for(const backend of ['javascript','gmp']){
  const args=(m=8,n=8)=>{const s=Math.max(1,m*n,m,n),bits=x=>x===0?0:BigInt(x).toString(2).length;return [Array.from({length:m*n},(_,i)=>BigInt(Math.floor(i/n)===i%n)),BigInt(m),BigInt(n),2147483659n,Array(8*s*(Math.floor(m/4)+1)).fill(77n),Array(3*(bits(n)+1)).fill(77n),Array(8).fill(77n),Array(n).fill(77n),Array(8).fill(77n)];};
  for(const index of [0,4,5,6,7,8]){const a=args();a[index]=[];const before=structuredClone(a);assert.throws(()=>f[backend](...a));assert.deepEqual(a,before);}
  for(const value of [-1n,2147483659n]){const a=args();a[0][0]=value;const before=structuredClone(a);assert.throws(()=>f[backend](...a));assert.deepEqual(a,before);}
  for(const [m,n] of [[0,0],[0,5],[5,0]]){const a=args(m,n);assert.equal(f[backend](...a),0n);assert.deepEqual(a[7],Array(n).fill(0n));assert.deepEqual(a[8].slice(0,3),[0n,0n,BigInt(n)]);}
  const a=args(90,300);assert.equal(f[backend](...a),-1n);assert.deepEqual(a[7],Array(300).fill(77n));assert.deepEqual(a[8],[-1n,...Array(7).fill(77n)]);
 }
 summary.atomicGuards=true;summary.emptyShapes=true;summary.boundedProductBridge=500000;
 summary.coreBytes=fs.statSync(built.coreSourcePath).size;summary.coreSha256=hash(fs.readFileSync(built.coreSourcePath));summary.backends=['javascript','gmp'];
 fs.writeFileSync(path.join(dir,'fixtures.json'),JSON.stringify({cases,expected,nativeOutputs:output,summary}));console.log(JSON.stringify(summary));
})().catch(e=>{console.error(e);process.exitCode=1;});
