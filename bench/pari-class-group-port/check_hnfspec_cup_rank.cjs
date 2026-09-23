"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {compileKernel}=require('../../tools/native-kernel/compiler.cjs');
const hash=x=>createHash('sha256').update(x).digest('hex');
function run(c,a,o={}){const r=spawnSync(c,a,{encoding:'utf8',timeout:180000,maxBuffer:64*1024*1024,...o});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
function part(s,a,b){const i=s.indexOf(a),j=s.indexOf(b,i);assert(i>=0&&j>i);return s.slice(i,j);}
(async()=>{
const pari=path.resolve(process.argv[2]),archive=path.resolve(process.argv[3]),lib=path.join(pari,'Olinux-x86_64');
assert.equal(hash(fs.readFileSync(archive)),'02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53');
const source=run('tar',['-xOf',archive,'pari-2.17.4/src/basemath/alglin1.c']);
assert.equal(source,fs.readFileSync(path.join(pari,'src/basemath/alglin1.c'),'utf8'));
const zero=part(source,'static long\nZM_count_0_cols(','static void indexrank_all(');
let body=part(source,'GEN\nZM_pivots(GEN M0, long *rr)','    beenthere = 1;');
body=body.replace('ZM_pivots(','audit_rank(').replace('init_modular_small(&S);','init_modular_small(&S); st[4]=rmin;').replace('  for(;;)','  st[5]=imax;\n  for(;;)').replace('      if (!p) pari_err_OVERFLOW','      st[1]=p;\n      if (!p) pari_err_OVERFLOW').replace('      if (rp == rmin)','      st[0]++; last=d;\n      if (rp == rmin)');
body+=`\nst[9]=-1;st[2]=rbest;st[3]=zc;st[6]=dbest!=NULL;if(dbest)best=gcopy(dbest);guncloneNULL(dbest);return NULL;}\nEND:st[2]=rbest;st[3]=zc;st[6]=dbest!=NULL;if(dbest)best=gcopy(dbest);guncloneNULL(dbest);return d;}\n`;
const primes=[2147483659n,2147483693n,2147483713n,2147483743n],cases=[];
function add(m,n,a){cases.push({m,n,a:a.map(String)});}
for(const [m,n] of [[0,3],[3,0],[3,7],[7,3],[8,8],[8,13],[13,8],[15,15],[16,16],[16,19],[19,16],[64,64]]){
 add(m,n,Array(m*n).fill(0n));
 for(let k=0;k<=((Math.min(m,n)>=64)?3:(Math.min(m,n)>=16)?2:1);k++){
  const scale=primes.slice(0,k).reduce((a,b)=>a*b,1n);
  add(m,n,Array.from({length:m*n},(_,x)=>Math.floor(x/n)===x%n?(x===0?scale:1n):0n));
 }
 if(m&&n)add(m,n,Array.from({length:m*n},(_,x)=>BigInt((Math.floor(x/n)+1)*(x%n+1))));
}
// Strict best result survives a worse following prime, and no-best survives
// all primes dividing a nonzero matrix. CUP top block zero exercises R shifts.
add(8,8,Array.from({length:64},(_,x)=>BigInt((x%8+1)*(Math.floor(x/8)+1))*primes[1]));
add(16,16,Array.from({length:256},()=>primes[0]*primes[1]*primes[2]));
add(8,8,Array.from({length:64},(_,x)=>Math.floor(x/8)>=4&&Math.floor(x/8)===x%8?1n:0n));
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-cup-rank-'));
const c=`#include "pari.h"
#include "paripriv.h"
_Static_assert(sizeof(long)==8,"64-bit schedule");
static long st[10];static GEN last,best;
${zero}\n${body}
static void vec(GEN x){putchar('[');if(x)for(long j=1;j<lg(x);j++){if(j>1)putchar(',');printf("%ld",x[j]);}putchar(']');}
int main(void){pari_init(256000000,10000);forprime_t S;init_modular_small(&S);ulong expected[4]={2147483659UL,2147483693UL,2147483713UL,2147483743UL};for(long i=0;i<4;i++)if(u_forprime_next(&S)!=expected[i])return 9;
long count;scanf("%ld",&count);for(long t=0;t<count;t++){pari_sp av=avma;long m,n,rr;scanf("%ld%ld",&m,&n);GEN A=zeromatcopy(m,n);for(long i=1;i<=m;i++)for(long j=1;j<=n;j++){char s[256];scanf("%255s",s);gcoeff(A,i,j)=gp_read_str(s);}for(long i=0;i<10;i++)st[i]=0;st[2]=n;st[3]=ZM_count_0_cols(A);last=best=NULL;GEN d=audit_rank(A,&rr);if(d)last=d;if(n==0||st[3]==n)st[2]=st[3];printf("{\\"state\\":[");for(long i=0;i<10;i++){if(i)putchar(',');printf("%ld",st[i]);}printf("],\\"pivots\\":");vec(last);printf(",\\"best\\":");vec(best);puts("}");avma=av;}pari_close();}
`;
fs.writeFileSync(path.join(dir,'oracle.c'),c);
run('cc',['-O1','-fsanitize=undefined','-fno-sanitize-recover=undefined','-I'+path.join(pari,'src/headers'),'-I'+lib,path.join(dir,'oracle.c'),'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',path.join(dir,'oracle')]);
const expected=run(path.join(dir,'oracle'),[],{input:[cases.length,...cases.flatMap(r=>[r.m,r.n,...r.a])].join(' ')}).trim().split('\n').map(JSON.parse);
assert(expected.some(e=>e.state[0]===4));assert(expected.some(e=>e.state[0]===3));assert(expected.some(e=>e.state[9]===-1&&e.state[6]===0));
fs.writeFileSync(path.join(dir,'fixtures.json'),JSON.stringify({cases,expected}));
run('python3',['-c',`import sys,json,importlib
sys.path[:0]=sys.argv[1:3];f=importlib.import_module('bench.pari-class-group-port.hnfspec_cup_rank').pari_rectangular_cup_initial_pivots
for r,e in zip(*[json.load(open(sys.argv[3]))[k] for k in ('cases','expected')]):
 m=r['m'];n=r['n'];s=max(1,m*n,m,n);d=m//4+1;p=[77]*n;b=[77]*n;st=[77]*10
 out=f(list(map(int,r['a'])),m,n,[77]*(m*n),[77]*m,p,b,st,[0]*(8*s*d),[0]*(3*(n.bit_length()+1)),[0]*8,[0]*8)
 assert out==e['state'][9] and st==e['state'],(r,e,st)
 assert p==e['pivots']+[77]*(n-len(e['pivots'])) and b==e['best']+[77]*(n-len(e['best'])),(r,e,p,b)
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib'),path.join(dir,'fixtures.json')]);
const built=await compileKernel({sourcePath:path.join(__dirname,'hnfspec_cup_rank.py')}),mod=require(built.modulePath),f=mod.pari_rectangular_cup_initial_pivots,g=mod.pari_hnfspec_cup_rank_prefix;
assert(f.nativeAvailable&&g.nativeAvailable);assert.doesNotMatch(fs.readFileSync(built.coreSourcePath,'utf8'),/napi_call_function|PyObject_Call|v8::/);
for(const backend of ['javascript','gmp'])for(let k=0;k<cases.length;k++){
 const r=cases[k],e=expected[k],m=r.m,n=r.n,s=Math.max(1,m*n,m,n),bits=x=>x?Math.floor(Math.log2(x))+1:0;
 const ib=(len,val=0n)=>f.createIntegerBuffer(len,128,Array(len).fill(val));
 const orig=f.createIntegerBuffer(r.a.length,128,r.a.map(BigInt)),mat=ib(m*n),occ=ib(m),p=ib(n,77n),b=ib(n,77n),st=ib(10,77n),arena=ib(8*s*(Math.floor(m/4)+1)),frames=ib(3*(bits(n)+1)),solve=Array(8).fill(0n),cup=Array(8).fill(0n);
 const status=f[backend](orig,BigInt(m),BigInt(n),mat,occ,p,b,st,arena,frames,solve,cup);
 assert.equal(status,BigInt(e.state[9]));assert.deepEqual(st.toArray(),e.state.map(BigInt));assert.deepEqual(p.toArray(),[...e.pivots.map(BigInt),...Array(n-e.pivots.length).fill(77n)]);assert.deepEqual(b.toArray(),[...e.best.map(BigInt),...Array(n-e.best.length).fill(77n)]);
 const profile=ib(n+1,77n),cleanup=[0n,0n,BigInt(n+1),BigInt(m),0n,0n,0n,0n,0n,0n];
 const ps=g[backend](orig,cleanup,mat,occ,p,b,profile,st,arena,frames,solve,cup);assert.equal(ps,status);
 const want=m===0?Array.from({length:n+1},(_,i)=>BigInt(i+1)):status===0n?[...e.pivots.flatMap((v,i)=>v?[]:[BigInt(i+1)]),...e.pivots.flatMap((v,i)=>v?[BigInt(i+1)]:[]),77n]:Array(n+1).fill(77n);
 assert.deepEqual(profile.toArray(),want);if(status!==0n)assert.deepEqual(st.toArray().slice(7,9),[-1n,-1n]);
}
let guards=0;
for(const backend of ['javascript','gmp'])for(const short of [0,3,4,5,6,7,8,9,10,11]){
 const lengths={0:64,3:64,4:8,5:8,6:8,7:10,8:1536,9:15,10:8,11:8};
 const args=Array.from({length:12},(_,i)=>i===1||i===2?8n:i>=10?Array(lengths[i]-(short===i?1:0)).fill(77n):f.createIntegerBuffer(lengths[i]-(short===i?1:0),128,Array(lengths[i]-(short===i?1:0)).fill(77n)));
 const snapshot=args.map(x=>typeof x==='bigint'?x:Array.isArray(x)?x.slice():x.toArray());
 assert.throws(()=>f[backend](...args));assert.deepEqual(args.map(x=>typeof x==='bigint'?x:Array.isArray(x)?x.slice():x.toArray()),snapshot);guards++;
}
// Source multiplication dispatch requires unported Strassen at this identity
// split (40x40 times40x40). This intentionally is not a source-result match.
for(const backend of ['javascript','gmp']){
 const ib=(n,v=77n)=>f.createIntegerBuffer(n,128,Array(n).fill(v)),a=f.createIntegerBuffer(6400,128,Array.from({length:6400},(_,i)=>Math.floor(i/80)===i%80?1n:0n)),p=ib(80),best=ib(80),st=ib(10);
 assert.equal(f[backend](a,80n,80n,ib(6400),ib(80),p,best,st,ib(8*6400*21,0n),ib(24,0n),Array(8).fill(0n),Array(8).fill(0n)),-2n);
 assert.equal(st.toArray()[0],0n);assert.equal(st.toArray()[1],2147483659n);assert.equal(st.toArray()[9],-2n);assert.deepEqual(p.toArray(),Array(80).fill(77n));assert.deepEqual(best.toArray(),Array(80).fill(77n));
}
console.log(JSON.stringify({cases:cases.length,guards,strassenFrontiers:2,backends:['CPython','javascript','gmp'],sourceHash:hash(c),directory:dir,coreBytes:fs.statSync(built.coreSourcePath).size}));
})().catch(e=>{console.error(e);process.exitCode=1;});
