"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {compileKernel}=require('../../tools/native-kernel/compiler.cjs');
function run(cmd,args,options={}){const r=spawnSync(cmd,args,{encoding:'utf8',timeout:60000,maxBuffer:32*1024*1024,...options});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
(async()=>{
 const pari=path.resolve(process.argv[2]),archive=path.resolve(process.argv[3]),lib=path.join(pari,'Olinux-x86_64');
 const sha=x=>createHash('sha256').update(x).digest('hex');
 assert.equal(sha(fs.readFileSync(archive)),'02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53');
 const hashes={};for(const name of ['alglin1.c','Flv.c','F2v.c']){const rel='src/basemath/'+name,s=run('tar',['-xOf',archive,'pari-2.17.4/'+rel]);assert.equal(fs.readFileSync(path.join(pari,rel),'utf8'),s);hashes[name]=sha(s);}
 const rows=[];
 for(let n=0;n<=3;n++)for(let mask=0;mask<(1<<(n*n));mask++)rows.push({n,p:2,a:Array.from({length:n*n},(_,k)=>(mask>>k)&1)});
 let seed=917;function next(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;}
 for(const p of [2,3,5,37,101,65537,3037000493])for(let n=1;n<=4;n++)for(let sample=0;sample<25;sample++){
  const a=Array.from({length:n*n},()=>next()%p);if(sample%5===0)for(let i=0;i<n;i++)a[i]=0;
  if(sample%7===0)for(let i=0;i<a.length;i++)a[i]-=p;
  rows.push({n,p,a});
 }
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-small-prime-inverse-')),c=path.join(dir,'oracle.c'),exe=path.join(dir,'oracle');
 fs.writeFileSync(c,`#include "pari.h"
#include "paripriv.h"
#include <stdio.h>
static void mat(GEN a){putchar('[');int first=1;for(long j=1;j<lg(a);j++)for(long i=1;i<lg(gel(a,j));i++){if(!first)putchar(',');first=0;pari_printf("%Ps",gcoeff(a,i,j));}putchar(']');}
static void words(GEN a,long n,int binary){putchar('[');int first=1;for(long j=1;j<=n;j++){if(binary){if(!first)putchar(',');first=0;printf("%lu",uel(gel(a,j),2));}else for(long i=1;i<=n;i++){if(!first)putchar(',');first=0;printf("%lu",uel(gel(a,j),i));}}putchar(']');}
int main(void){pari_init(128000000,10000);long n;ulong p;while(scanf("%ld %lu",&n,&p)==2){pari_sp av=avma;GEN a=cgetg(n+1,t_MAT);for(long j=1;j<=n;j++){gel(a,j)=cgetg(n+1,t_COL);for(long i=1;i<=n;i++){long v;if(scanf("%ld",&v)!=1)return 2;gcoeff(a,i,j)=stoi(v);}}
GEN expected=FpM_inv(a,utoi(p)),aa=NULL,b=NULL,u=NULL;
if(n){if(p==2){aa=ZM_to_F2m(a);b=matid_F2m(n);u=F2m_gauss_sp(aa,b);}else{aa=ZM_to_Flm(a,p);b=matid_Flm(n);u=Flm_gauss_sp(aa,b,NULL,p);}if((!u)!=(!expected))return 3;}
printf("{\\\"status\\\":%d,\\\"out\\\":",expected?0:-1);if(expected)mat(expected);else printf("[]");printf(",\\\"aa\\\":");if(n)words(aa,n,p==2);else printf("[]");printf(",\\\"bb\\\":");if(n)words(b,n,p==2);else printf("[]");puts("}");avma=av;}pari_close();return 0;}`);
 run('cc',['-O2','-I'+path.join(pari,'src/headers'),'-I'+lib,c,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',exe]);
 const trace=run(exe,[],{input:rows.map(r=>[r.n,r.p,...r.a].join(' ')).join('\n')+'\n'}),expected=trace.trim().split('\n').map(JSON.parse);assert.equal(rows.length,expected.length);
 run('python3',['-c',`import sys,json,decimal,importlib
sys.path[:0]=sys.argv[1:3];m=importlib.import_module('bench.pari-class-group-port.small_prime_matrix_inverse')
for r,e in zip(*json.load(sys.stdin)):
 n=r['n'];size=m.pari_small_prime_matrix_inverse_workspace_size(n);a=2;out=a+n*n+2;scratch=out+n*n+2;w=[77]*(scratch+size+2);w[a:a+n*n]=r['a'];before=w.copy()
 assert m.pari_small_prime_matrix_inverse(w,a,n,r['p'],out,scratch)==e['status'],r
 assert w[out:out+n*n]==(e['out'] if e['status']==0 else [77]*(n*n)),r
 assert w[scratch:scratch+len(e['aa'])]==e['aa'],('aa',r)
 assert w[scratch+n*n:scratch+n*n+len(e['bb'])]==e['bb'],('bb',r)
 assert w[:out]==before[:out] and w[out+n*n:scratch]==before[out+n*n:scratch] and w[-2:]==[77,77]
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify([rows,expected])});
 const backends=['cpython'];let coreSha256=null;
 if(process.argv.includes('--native')){
  const built=await compileKernel({sourcePath:path.join(__dirname,'small_prime_matrix_inverse.py')}),f=require(built.modulePath).pari_small_prime_matrix_inverse;assert(f.nativeAvailable);coreSha256=sha(fs.readFileSync(built.coreSourcePath));
  for(const backend of ['javascript','gmp','tagged']){
   for(let q=0;q<rows.length;q++){const r=rows[q],e=expected[q],n=r.n,size=2*n*n+n,a=2,out=a+n*n+2,scratch=out+n*n+2,w=Array(scratch+size+2).fill(77n);w.splice(a,n*n,...r.a.map(BigInt));const before=w.slice();
    assert.equal(f[backend](w,BigInt(a),BigInt(n),BigInt(r.p),BigInt(out),BigInt(scratch)),BigInt(e.status));
    assert.deepEqual(w.slice(out,out+n*n),e.status===0?e.out.map(BigInt):Array(n*n).fill(77n));
    assert.deepEqual(w.slice(scratch,scratch+e.aa.length),e.aa.map(BigInt));assert.deepEqual(w.slice(scratch+n*n,scratch+n*n+e.bb.length),e.bb.map(BigInt));
    assert.deepEqual(w.slice(0,out),before.slice(0,out));assert.deepEqual(w.slice(out+n*n,scratch),before.slice(out+n*n,scratch));assert.deepEqual(w.slice(-2),[77n,77n]);
   }
   for(const args of [[0n,-1n,3n,2n,4n],[0n,5n,3n,2n,4n],[-1n,1n,3n,2n,4n],[0n,1n,1n,2n,4n],[0n,1n,3037000507n,2n,4n],[0n,1n,3n,2n,20n]]){const w=Array(12).fill(77n);assert.throws(()=>f[backend](w,...args),/unsupported|negative|insufficient/);assert.deepEqual(w,Array(12).fill(77n));}
   backends.push(backend);
  }
 }
 const result={cases:rows.length,singular:expected.filter(e=>e.status<0).length,backends,coreSha256,sourceSha256:hashes,oracleSha256:sha(fs.readFileSync(c)),traceSha256:sha(trace),qualifiedTiming:false};fs.writeFileSync(path.join(dir,'fixtures.json'),JSON.stringify({rows,expected,result}));console.log(JSON.stringify({dir,...result}));
})().catch(e=>{console.error(e);process.exitCode=1;});
