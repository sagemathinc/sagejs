"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {compileKernel}=require('../../tools/native-kernel/compiler.cjs');
function run(cmd,args,options={}){const r=spawnSync(cmd,args,{encoding:'utf8',timeout:60000,maxBuffer:32*1024*1024,...options});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
(async()=>{
 const pari=path.resolve(process.argv[2]),archive=path.resolve(process.argv[3]),lib=path.join(pari,'Olinux-x86_64'),sha=x=>createHash('sha256').update(x).digest('hex');
 assert.equal(sha(fs.readFileSync(archive)),'02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53');
 const hashes={};for(const name of ['FpX_factor.c','arith1.c']){const rel='src/basemath/'+name,s=run('tar',['-xOf',archive,'pari-2.17.4/'+rel]);assert.equal(fs.readFileSync(path.join(pari,rel),'utf8'),s);hashes[name]=sha(s);}
 const rows=[];
 for(const p of [3,5])for(let a=0;a<p;a++)for(let b=0;b<p;b++)for(let c=0;c<p;c++)if(a||b||c)rows.push({kind:0,p,degree:2,coefficients:[c,b,a]});
 for(let b=0;b<37;b++)for(let c=0;c<37;c++)rows.push({kind:0,p:37,degree:2,coefficients:[c,b,1]});
 for(const p of [3,5,7,17,37,73,241,65537,3037000493]){
  for(let degree=0;degree<=2;degree++)for(let s=0;s<40;s++){const coefficients=Array.from({length:degree+1},(_,i)=>((s+3)*(i+5)*7919)%(2*p)-p);if(coefficients.every(x=>x%p===0))coefficients[degree]=1;rows.push({kind:0,p,degree,coefficients});}
  for(let a=0;a<Math.min(p,250);a++)rows.push({kind:1,p,a});
  for(const x of [...new Set([0,1,2,3%p,p-1])])for(let exponent=0;exponent<=64;exponent++)rows.push({kind:2,p,x,exponent});
 }
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-small-prime-roots-')),c=path.join(dir,'oracle.c'),exe=path.join(dir,'oracle');
 fs.writeFileSync(c,`#include "pari.h"
#include "paripriv.h"
#include <stdio.h>
int main(void){pari_init(128000000,10000);long kind;ulong p;while(scanf("%ld %lu",&kind,&p)==2){pari_sp av=avma;
if(kind==0){long d;scanf("%ld",&d);GEN v=cgetg(d+2,t_VEC);for(long i=1;i<=d+1;i++){long a;scanf("%ld",&a);gel(v,i)=stoi(a);}GEN f=gtopolyrev(v,0),roots=FpX_roots(f,utoi(p));putchar('[');for(long i=1;i<lg(roots);i++){if(i>1)putchar(',');pari_printf("%Ps",gel(roots,i));}puts("]");}
else if(kind==1){ulong a;scanf("%lu",&a);ulong r=Fl_sqrt_pre(a,p,get_Fl_red(p));if(r==~0UL)puts("-1");else printf("%lu\\n",r);}
else{ulong x,e;scanf("%lu %lu",&x,&e);printf("%lu\\n",Fl_powu_pre(x,e,p,get_Fl_red(p)));}
avma=av;}pari_close();return 0;}`);
 run('cc',['-O2','-I'+path.join(pari,'src/headers'),'-I'+lib,c,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',exe]);
 const trace=run(exe,[],{input:rows.map(r=>[r.kind,r.p,...(r.kind===0?[r.degree,...r.coefficients]:r.kind===1?[r.a]:[r.x,r.exponent])].join(' ')).join('\n')+'\n'}),expected=trace.trim().split('\n').map(JSON.parse);assert.equal(rows.length,expected.length);
 run('python3',['-c',`import sys,json,decimal,importlib
sys.path[:0]=sys.argv[1:3];m=importlib.import_module('bench.pari-class-group-port.small_prime_quadratic_roots')
for r,e in zip(*json.load(sys.stdin)):
 if r['kind']==1:assert m.pari_small_prime_sqrt_pre(r['a'],r['p'])==e,r
 elif r['kind']==2:assert m.pari_small_prime_pow_pre(r['x'],r['exponent'],r['p'])==e,r
 else:
  out=[77]*4;before=r['coefficients'].copy();count=m.pari_small_prime_quadratic_roots(r['coefficients'],r['degree'],r['p'],out)
  assert count==len(e) and out==e+[77]*(4-len(e)),r
  assert r['coefficients']==before
out=[77]*4
try:m.pari_small_prime_quadratic_roots([-1,0,1],2,1009,out)
except ValueError as e:assert 'prime iterator frontier' in str(e)
else:raise AssertionError('missing prime iterator frontier')
assert out==[77]*4
# Preserve Flx_normalize's otherwise output-invisible inverse on monomials.
original_inverse=m.pari_word_mod_inverse
calls=[]
def tracked_inverse(a,p):
 calls.append((a,p));return original_inverse(a,p)
m.pari_word_mod_inverse=tracked_inverse
for coefficients,degree,expected_calls in [([0,2],1,[(2,37)]),([0,0,2],2,[(2,37)]),([2],0,[])]:
 calls.clear();m.pari_small_prime_quadratic_roots(coefficients,degree,37,[77]*4)
 assert calls==expected_calls,(coefficients,calls)
m.pari_word_mod_inverse=original_inverse
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify([rows,expected])});
 const backends=['cpython'];let coreSha256=null;
 if(process.argv.includes('--native')){
  const built=await compileKernel({sourcePath:path.join(__dirname,'small_prime_quadratic_roots.py')}),m=require(built.modulePath),f=m.pari_small_prime_quadratic_roots;assert(f.nativeAvailable);coreSha256=sha(fs.readFileSync(built.coreSourcePath));
  for(const backend of ['javascript','gmp','tagged']){
   for(let i=0;i<rows.length;i++){const r=rows[i],e=expected[i];
    if(r.kind===1)assert.equal(m.pari_small_prime_sqrt_pre[backend](BigInt(r.a),BigInt(r.p)),BigInt(e));
    else if(r.kind===2)assert.equal(m.pari_small_prime_pow_pre[backend](BigInt(r.x),BigInt(r.exponent),BigInt(r.p)),BigInt(e));
    else{const a=r.coefficients.map(BigInt),out=Array(4).fill(77n);assert.equal(f[backend](a,BigInt(r.degree),BigInt(r.p),out),BigInt(e.length));assert.deepEqual(out,[...e.map(BigInt),...Array(4-e.length).fill(77n)]);assert.deepEqual(a,r.coefficients.map(BigInt));}
   }
   for(const args of [[[0n,0n,0n],2n,37n],[[1n],-1n,3n],[[1n],3n,3n],[[1n],0n,2n],[[],1n,3n],[[-1n,0n,1n],2n,1009n]]){const out=Array(4).fill(77n);assert.throws(()=>f[backend](...args,out),/unsupported|insufficient|zero polynomial|prime iterator frontier/);assert.deepEqual(out,Array(4).fill(77n));}
   backends.push(backend);
  }
 }
 const result={cases:rows.length,rootCases:rows.filter(r=>r.kind===0).length,sqrtCases:rows.filter(r=>r.kind===1).length,powerCases:rows.filter(r=>r.kind===2).length,backends,coreSha256,sourceSha256:hashes,oracleSha256:sha(fs.readFileSync(c)),traceSha256:sha(trace),primitiveMapping:'nonzero-PI multiply/square mapped to exact product modulo p',nonresidueFrontier:'prime iterator candidates11..1967',qualifiedTiming:false};fs.writeFileSync(path.join(dir,'fixtures.json'),JSON.stringify({rows,expected,result}));console.log(JSON.stringify({dir,...result}));
})().catch(e=>{console.error(e);process.exitCode=1;});
