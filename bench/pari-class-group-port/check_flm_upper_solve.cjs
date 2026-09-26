"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {compileKernel}=require('../../tools/native-kernel/compiler.cjs');
const hash=x=>createHash('sha256').update(x).digest('hex');
function run(c,a,o={}){const r=spawnSync(c,a,{encoding:'utf8',timeout:240000,maxBuffer:128*1024*1024,...o});assert.equal(r.status,0,(r.stderr||String(r.error))+' completed output lines '+r.stdout.trim().split('\n').length);return r.stdout;}
(async()=>{
 const pari=path.resolve(process.argv[2]),archive=path.resolve(process.argv[3]),lib=path.join(pari,'Olinux-x86_64');assert.equal(hash(fs.readFileSync(archive)),'02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53');
 const cases=[];
 function add(n,m,p,kind='synthetic',U=null){p=BigInt(p);U=U||Array.from({length:n*n},(_,i)=>{const row=Math.floor(i/n),col=i%n;return String(row===col?1n+BigInt(13*i+5)%(p-1n):BigInt(17*i+3)%p);});const B=Array.from({length:m*n},(_,i)=>String(BigInt(i*i+11*i+7)%p));cases.push({n,m,p:String(p),U,B,kind});}
 for(const n of [0,1,2,3,4,5,7,8,9,15,16,17,31])for(const m of [0,1,4])for(const p of [2n,3n,65521n,2147483659n,2305843009213693951n])add(n,m,p);
 for(const n of [39,40,41,79,80])for(const m of [1,4])add(n,m,2147483659n);
 add(79,40,2147483659n);add(80,40,2147483659n,'dispatch-frontier');add(280,140,17n,'dispatch-frontier');
 const actualOption=process.argv.indexOf('--cup-fixtures');let actual=0;
 if(actualOption>=0)for(const r of JSON.parse(fs.readFileSync(process.argv[actualOption+1])).cases){const a=r.reference,n=a.rank,U=[];for(let i=0;i<n;i++)for(let j=0;j<n;j++)U.push(String(a.U[i*a.columns+j]));add(n,a.rows,a.prime,'actual-packed-CUP-U',U);actual++;}
 const src=run('tar',['-xOf',archive,'pari-2.17.4/src/basemath/Flv.c']);
 const first=src.slice(src.indexOf('static GEN\nFlm_solve_upper_1'),src.indexOf('static GEN\nFlm_rsolve_upper_2'));
 const solve=src.slice(src.indexOf('static GEN\nFlm_lsolve_upper_2'),src.indexOf('static GEN\nFlm_rsolve_lower_unit_2'));
 assert(first.includes('Fl_inv')&&solve.includes('Flm_mul_pre'));
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-flm-upper-')),file=path.join(dir,'oracle.c'),exe=path.join(dir,'oracle');
 fs.writeFileSync(file,`/* Source-extracted PARI2.17.4, GPL-2.0-or-later. */
#include "pari.h"
#include "paripriv.h"
${first}\n${solve}
static GEN rd(void){char s[4096];if(scanf("%4095s",s)!=1)exit(2);return gp_read_str(s);}
static GEN matrix(long m,long n){GEN A=zero_Flm_copy(m,n);for(long i=1;i<=m;i++)for(long j=1;j<=n;j++)ucoeff(A,i,j)=itou(rd());return A;}
int main(void){pari_init(128000000,1000);long count=itos(rd());for(long k=0;k<count;k++){pari_sp av=avma;long n=itos(rd()),m=itos(rd());ulong p=itou(rd());GEN U=matrix(n,n),B=matrix(m,n),X=Flm_lsolve_upper_pre(U,B,p,get_Fl_red(p));putchar('[');for(long i=1;i<=m;i++)for(long j=1;j<=n;j++){if(i>1||j>1)putchar(',');printf("\\\"%lu\\\"",ucoeff(X,i,j));}puts("]");avma=av;}pari_close();return 0;}
`);
 run('cc',['-O1','-fsanitize=undefined','-fno-sanitize-recover=undefined','-I'+path.join(pari,'src/headers'),'-I'+lib,file,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',exe]);
 const trace=run(exe,[],{input:[cases.length,...cases.flatMap(r=>[r.n,r.m,r.p,...r.U,...r.B])].join(' ')}),expected=trace.trim().split('\n').map(JSON.parse);assert.equal(expected.length,cases.length);
 for(let c=0;c<cases.length;c++){const r=cases[c],X=expected[c].map(BigInt),p=BigInt(r.p);for(let i=0;i<r.m;i++)for(let j=0;j<r.n;j++){let t=0n;for(let k=0;k<=j;k++)t+=X[i*r.n+k]*BigInt(r.U[k*r.n+j]);assert.equal(t%p,BigInt(r.B[i*r.n+j]));}}
 function stats(n){if(n===0)return [1,0,0,0,0,1];if(n===1)return [1,1,0,0,1,1];if(n===2)return [1,0,1,0,1,1];const a=stats(Math.ceil(n/2)),b=stats(Math.floor(n/2));return [1+a[0]+b[0],a[1]+b[1],a[2]+b[2],1+a[3]+b[3],a[4]+b[4],1+Math.max(a[5],b[5])];}
 for(const r of cases)r.state=r.kind==='dispatch-frontier'?[-1,0,0,0,0,0,0,1]:[0,...stats(r.n),1];
 run('python3',['-c',`import sys,json,importlib,copy
sys.path[:0]=sys.argv[1:3];f=importlib.import_module('bench.pari-class-group-port.flm_upper_solve').pari_flm_lsolve_upper
for r,want in zip(*json.load(sys.stdin)):
 n=r['n'];m=r['m'];p=int(r['p']);stride=n+2;ub=3;bb=ub+n*stride+5;ob=bb+m*stride+7;sb=ob+m*stride+5;fb=sb+m*n+5;arena=[77]*(fb+3*(n.bit_length()+1)+3)
 for i in range(n):arena[ub+i*stride:ub+i*stride+n]=map(int,r['U'][i*n:(i+1)*n])
 for i in range(m):arena[bb+i*stride:bb+i*stride+n]=map(int,r['B'][i*n:(i+1)*n])
 for alias in [False,True]:
  a=arena.copy();out=bb if alias else ob;state=[77]*9;before=a.copy();result=f(a,ub,stride,a,bb,stride,n,m,p,a,out,stride,a,sb,a,fb,state)
  assert state==r['state']+[77] and result==r['state'][0],(r['n'],r['m'],state,r['state'])
  if result<0:assert a==before;continue
  got=[a[out+i*stride+j] for i in range(m) for j in range(n)];assert got==list(map(int,want))
  changed=set(range(sb,sb+m*n))|set(range(fb,fb+3*(n.bit_length()+1)))|{out+i*stride+j for i in range(m) for j in range(n)}
  assert all(a[i]==before[i] for i in range(len(a)) if i not in changed)
for at,value in [(1,-1),(4,-1),(10,-1),(13,-1),(15,-1),(2,1),(5,1),(11,1),(6,-1),(7,-1),(8,1),(8,1<<63),(0,[2,3,99]),(3,[1]),(9,[77]),(12,[77]),(14,[77]*8),(16,[77]*7),(0,[0,3,99,4]),(0,[2,7,99,4]),(3,[-1,2])]:
 a=[[2,3,99,4],0,2,[1,2],0,2,2,1,7,[77]*2,0,2,[77]*2,0,[77]*9,0,[77]*8];a[at]=value;before=copy.deepcopy(a)
 try:f(*a)
 except ValueError:pass
 else:raise AssertionError(('unguarded input',at,value))
 assert a==before
for garbage in [-1,1<<100]:
 a=[[2,3,garbage,4],0,2,[1,2],0,2,2,1,7,[77]*2,0,2,[77]*2,0,[77]*9,0,[77]*8]
 assert f(*a)==0 and a[9]==[4,1] and a[0][2]==garbage
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify([cases,expected])});
 const built=await compileKernel({sourcePath:path.join(__dirname,'flm_upper_solve.py')}),f=require(built.modulePath).pari_flm_lsolve_upper;assert(f.nativeAvailable);assert.doesNotMatch(fs.readFileSync(built.coreSourcePath,'utf8'),/napi_call_function|PyObject_Call|v8::/);
 for(const backend of ['javascript','gmp','tagged'])for(let c=0;c<cases.length;c++){
  const r=cases[c],{n,m}=r,stride=n+2,ub=3,bb=ub+n*stride+5,ob=bb+m*stride+7,sb=ob+m*stride+5,fb=sb+m*n+5,frameSize=3*(n.toString(2).length+(n===0?0:1)),size=fb+frameSize+3,initial=Array(size).fill(77n);
  for(let i=0;i<n;i++)for(let j=0;j<n;j++)initial[ub+i*stride+j]=BigInt(r.U[i*n+j]);for(let i=0;i<m;i++)for(let j=0;j<n;j++)initial[bb+i*stride+j]=BigInt(r.B[i*n+j]);
  for(const alias of [false,true]){
   const a=f.createIntegerBuffer(size,8,initial),out=alias?bb:ob,state=Array(9).fill(77n),result=f[backend](a,BigInt(ub),BigInt(stride),a,BigInt(bb),BigInt(stride),BigInt(n),BigInt(m),BigInt(r.p),a,BigInt(out),BigInt(stride),a,BigInt(sb),a,BigInt(fb),state),after=a.toArray();
   assert.deepEqual(state,r.state.map(BigInt).concat(77n),backend+' state '+c);assert.equal(result,BigInt(r.state[0]));if(result<0){assert.deepEqual(after,initial);continue;}
   assert.deepEqual(Array.from({length:m*n},(_,i)=>after[out+Math.floor(i/n)*stride+i%n]),expected[c].map(BigInt),backend+' output '+c);
   const changed=new Set();for(let i=0;i<m*n;i++)changed.add(sb+i);for(let i=0;i<frameSize;i++)changed.add(fb+i);for(let i=0;i<m;i++)for(let j=0;j<n;j++)changed.add(out+i*stride+j);for(let i=0;i<size;i++)if(!changed.has(i))assert.equal(after[i],initial[i],backend+' padding '+c+' '+i);
  }
 }
 for(const backend of ['javascript','gmp','tagged']){
  for(const [at,value]of [[1,-1n],[4,-1n],[10,-1n],[13,-1n],[15,-1n],[2,1n],[5,1n],[11,1n],[6,-1n],[7,-1n],[8,1n],[8,1n<<63n],[0,[2n,3n,99n]],[3,[1n]],[9,[77n]],[12,[77n]],[14,Array(8).fill(77n)],[16,Array(7).fill(77n)],[0,[0n,3n,99n,4n]],[0,[2n,7n,99n,4n]],[3,[-1n,2n]]]){
   const a=[[2n,3n,99n,4n],0n,2n,[1n,2n],0n,2n,2n,1n,7n,[77n,77n],0n,2n,[77n,77n],0n,Array(9).fill(77n),0n,Array(8).fill(77n)];a[at]=value;const before=structuredClone(a);assert.throws(()=>f[backend](...a));assert.deepEqual(a,before);
  }
  for(const garbage of [-1n,1n<<100n]){
   const a=[[2n,3n,garbage,4n],0n,2n,[1n,2n],0n,2n,2n,1n,7n,[77n,77n],0n,2n,[77n,77n],0n,Array(9).fill(77n),0n,Array(8).fill(77n)];assert.equal(f[backend](...a),0n);assert.deepEqual(a[9],[4n,1n]);assert.equal(a[0][2],garbage);
  }
 }
 fs.writeFileSync(path.join(dir,'fixtures.json'),JSON.stringify([cases,expected]));console.log(JSON.stringify({cases:cases.length,actualPackedUpper:actual,backendRuns:['cpython','javascript','gmp','tagged'],aliasModes:2,dispatchFrontiers:2,atomicGuards:21,ignoredLowerTriangleControls:2,traceSha256:hash(trace),sourceHash:hash(src),coreBytes:fs.statSync(built.coreSourcePath).size,cacheKey:built.cacheKey,qualifiedTiming:false,ubsan:true,artifactDirectory:dir}));
})().catch(e=>{console.error(e);process.exitCode=1;});
