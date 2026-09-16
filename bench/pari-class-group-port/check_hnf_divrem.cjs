"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {compileKernel}=require('../../tools/native-kernel/compiler.cjs');
const hash=x=>createHash('sha256').update(x).digest('hex');
function run(c,a,o={}){const r=spawnSync(c,a,{encoding:'utf8',timeout:180000,maxBuffer:64*1024*1024,...o});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
(async()=>{
 const pari=path.resolve(process.argv[2]),archive=path.resolve(process.argv[3]),lib=path.join(pari,'Olinux-x86_64');
 assert.equal(hash(fs.readFileSync(archive)),'02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53');
 const cases=[];
 for(let n=0;n<=8;n++)for(const cols of [0,1,2,5])for(let seed=0;seed<8;seed++){
  const H=Array.from({length:n*n},(_,at)=>{const i=at%n,j=Math.floor(at/n),d=BigInt(2+i+seed%5);return String(i>j?0n:i===j?d:BigInt((i+3*j+seed)%Number(d)));});
  const shifts=[0n,1n,63n,64n,127n,128n,257n,513n],X=Array.from({length:n*cols},(_,i)=>String((i%2?-1n:1n)*((1n<<shifts[seed])+BigInt(i%11))));
  cases.push({n,cols,H,X,kind:'synthetic'});
 }
 for(let d=2;d<=12;d+=2)for(let x=-3*d;x<=3*d;x++)cases.push({n:1,cols:1,H:[String(d)],X:[String(x)],kind:'tie-neighbors'});
 const at=process.argv.indexOf('--collector-fixtures');let actual=0;
 if(at>=0){const payload=JSON.parse(fs.readFileSync(process.argv[at+1]));for(const r of payload.nativeOutputs.filter(r=>r.backend==='gmp')){
  const n=r.hnfState[0],cols=2*n+1,H=r.H,X=Array.from({length:n*cols},(_,i)=>String((i%2?-1n:1n)*((1n<<130n)+BigInt(i))));cases.push({n,cols,H,X,kind:'actual-H',field:r.field});actual++;
 }}
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-hnf-divrem-')),file=path.join(dir,'oracle.c'),exe=path.join(dir,'oracle');
 fs.writeFileSync(file,`/* Calls unmodified PARI 2.17.4 ZM_hnfdivrem. */
#include "pari.h"
static GEN rd(void){char s[8192];if(scanf("%8191s",s)!=1)exit(2);return gp_read_str(s);}
static GEN matrix(long n,long c){GEN x=cgetg(c+1,t_MAT);for(long j=1;j<=c;j++){gel(x,j)=cgetg(n+1,t_COL);for(long i=1;i<=n;i++)gcoeff(x,i,j)=rd();}return x;}
static void printmatrix(GEN x){putchar('[');for(long j=1;j<lg(x);j++)for(long i=1;i<lg(gel(x,j));i++){if(j>1||i>1)putchar(',');pari_printf("\\\"%Ps\\\"",gcoeff(x,i,j));}putchar(']');}
int main(void){pari_init(64000000,1000);long count=itos(rd());for(long k=0;k<count;k++){pari_sp av=avma;long n=itos(rd()),c=itos(rd());GEN H=matrix(n,n),X=matrix(n,c),Q,R=ZM_hnfdivrem(X,H,&Q);putchar('[');printmatrix(R);putchar(',');printmatrix(Q);puts("]");avma=av;}pari_close();return 0;}
`);
 run('cc',['-O1','-fsanitize=undefined','-fno-sanitize-recover=undefined','-I'+path.join(pari,'src/headers'),'-I'+lib,file,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',exe]);
 const trace=run(exe,[],{input:[cases.length,...cases.flatMap(r=>[r.n,r.cols,...r.H,...r.X])].join(' ')}),expected=trace.trim().split('\n').map(JSON.parse);
 for(let k=0;k<cases.length;k++){const {n,cols,H,X}=cases[k],[R,Q]=expected[k];for(let j=0;j<cols;j++)for(let i=0;i<n;i++){
  let v=BigInt(X[j*n+i]);for(let p=0;p<n;p++)v+=BigInt(H[p*n+i])*BigInt(Q[j*n+p]);assert.equal(v,BigInt(R[j*n+i]));
  assert(2n*BigInt(R[j*n+i])>=-BigInt(H[i*n+i])&&2n*BigInt(R[j*n+i])<BigInt(H[i*n+i]));
 }}
 run('python3',['-c',`import sys,json,importlib
sys.path[:0]=sys.argv[1:3];f=importlib.import_module('bench.pari-class-group-port.hnf_divrem').pari_hnf_divrem
for r,e in zip(*json.load(sys.stdin)):
 size=r['n']*r['cols'];a=[list(map(int,r['X']))+[999],list(map(int,r['H']))+[999],r['n'],r['cols'],[77]*(size+1),[77]*(size+1),[77]*7];before=[x.copy() if isinstance(x,list) else x for x in a]
 assert f(*a)==0
 assert a[4]==list(map(int,e[0]))+[77] and a[5]==list(map(int,e[1]))+[77]
 q=list(map(int,e[1]));assert a[6]==[0,size,sum(x!=0 for x in q),sum(x>0 for x in q),sum(x<0 for x in q),sum(x==0 for x in q),77]
 assert a[:4]==before[:4]
for at,value in [(0,[]),(1,[]),(2,-1),(3,-1),(4,[]),(5,[]),(6,[77]*5),(1,[0]),(1,[-2])]:
 a=[[5],[2],1,1,[77],[77],[77]*6];a[at]=value;before=[x.copy() if isinstance(x,list) else x for x in a]
 try:f(*a)
 except ValueError:pass
 else:raise AssertionError(('unguarded input',at,value))
 assert a==before
for H in [[2,1,0,2],[2,0,2,2],[2,0,-1,2]]:
 a=[[1,2],H,2,1,[77]*2,[77]*2,[77]*6];before=[x.copy() if isinstance(x,list) else x for x in a]
 try:f(*a)
 except ValueError:pass
 else:raise AssertionError(('unguarded nonHNF',H))
 assert a==before
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify([cases,expected])});
 const built=await compileKernel({sourcePath:path.join(__dirname,'hnf_divrem.py')}),f=require(built.modulePath).pari_hnf_divrem;assert(f.nativeAvailable);assert.doesNotMatch(fs.readFileSync(built.coreSourcePath,'utf8'),/napi_call_function|PyObject_Call|v8::/);
 for(const backend of ['javascript','gmp','tagged']){
  const view=x=>Array.isArray(x)?x:x.toArray();
  for(let i=0;i<cases.length;i++){
   const r=cases[i],e=expected[i],size=r.n*r.cols,a=[r.X.map(BigInt).concat(999n),r.H.map(BigInt).concat(999n),BigInt(r.n),BigInt(r.cols),f.createIntegerBuffer(size+1,128,Array(size+1).fill(77n)),f.createIntegerBuffer(size+1,128,Array(size+1).fill(77n)),Array(7).fill(77n)],before=a.slice(0,2).map(x=>x.slice());
   assert.equal(f[backend](...a),0n);assert.deepEqual(view(a[4]),e[0].map(BigInt).concat(77n));assert.deepEqual(view(a[5]),e[1].map(BigInt).concat(77n));assert.deepEqual(a.slice(0,2),before);
   const q=e[1].map(BigInt);assert.deepEqual(a[6],[0n,BigInt(size),BigInt(q.filter(x=>x!==0n).length),BigInt(q.filter(x=>x>0n).length),BigInt(q.filter(x=>x<0n).length),BigInt(q.filter(x=>x===0n).length),77n]);
  }
  for(const [at,value]of [[0,[]],[1,[]],[2,-1n],[3,-1n],[4,[]],[5,[]],[6,Array(5).fill(77n)],[1,[0n]],[1,[-2n]]]){
   const a=[[5n],[2n],1n,1n,[77n],[77n],Array(6).fill(77n)];a[at]=value;const before=structuredClone(a);assert.throws(()=>f[backend](...a));assert.deepEqual(a,before);
  }
  for(const H of [[2n,1n,0n,2n],[2n,0n,2n,2n],[2n,0n,-1n,2n]]){
   const a=[[1n,2n],H,2n,1n,[77n,77n],[77n,77n],Array(6).fill(77n)],before=structuredClone(a);assert.throws(()=>f[backend](...a));assert.deepEqual(a,before);
  }
 }
 fs.writeFileSync(path.join(dir,'fixtures.json'),JSON.stringify([cases,expected]));
 console.log(JSON.stringify({cases:cases.length,actualH:actual,atomicGuards:12,traceSha256:hash(trace),coreBytes:fs.statSync(built.coreSourcePath).size,cacheKey:built.cacheKey,ubsan:true,qualifiedTiming:false,artifactDirectory:dir}));
})().catch(e=>{console.error(e);process.exitCode=1;});
