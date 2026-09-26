'use strict';
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert/strict'),{spawnSync}=require('child_process'),{createHash}=require('crypto');
const {compileKernel}=require('../../tools/native-kernel/compiler.cjs');
function run(c,a,o={}){const r=spawnSync(c,a,{encoding:'utf8',timeout:90000,maxBuffer:32000000,...o});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
(async()=>{
const pari=path.resolve(process.argv[2]),archive=path.resolve(process.argv[3]),sha=x=>createHash('sha256').update(x).digest('hex'),lib=path.join(pari,'Olinux-x86_64');
assert.equal(sha(fs.readFileSync(archive)),'02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53');
const src=fs.readFileSync(path.join(pari,'src/basemath/base2.c'),'utf8');
assert.equal(src,run('tar',['-xOf',archive,'pari-2.17.4/src/basemath/base2.c']));
function section(start,end){return src.slice(src.indexOf(start),src.indexOf(end,src.indexOf(start)));}
const helper=section('static GEN\nZlx_sylvester_echelon','/* Sylvester\'s matrix')+section('static long\ninit_m','/* reduced resultant mod')+section('static long\nZpX_resultant_val_i','/* assume f separable').replace('ZpX_sylvester_echelon(x, y, 1, p, pm)','NULL').replace('long\nZpX_resultant_val(','long\nobserved_val(').replace('v = ZpX_resultant_val_i(f,g, p, q);','v = ZpX_resultant_val_i(f,g, p, q); printf("[%ld,%Ps,%ld],",m,q,v);');
// PARI printf is needed for GEN q; preserve source computation, only observe.
const code=`#include "pari.h"\n#include "paripriv.h"\n#include <stdio.h>\n${helper.replace('printf("[%ld,%Ps,%ld],",m,q,v);','pari_printf("[%ld,%Ps,%ld],",m,q,v);')}
int main(void){pari_init(128000000,10000);long n,d,p,M;while(scanf("%ld%ld%ld%ld",&n,&d,&p,&M)==4){pari_sp av=avma;GEN f=cgetg(n+3,t_POL),g=cgetg(d+3,t_POL);f[1]=g[1]=evalsigne(1);for(long i=0;i<=n;i++){long x;scanf("%ld",&x);gel(f,i+2)=stoi(x);}for(long i=0;i<=d;i++){long x;scanf("%ld",&x);gel(g,i+2)=stoi(x);}g=normalizepol(g);printf("[");long v=observed_val(f,g,stoi(p),M);printf("%ld]\\n",v);avma=av;}pari_close();}`;
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-kummer-resultant-'));fs.writeFileSync(path.join(dir,'oracle.c'),code);run('cc',['-O2','-I'+path.join(pari,'src/headers'),'-I'+lib,path.join(dir,'oracle.c'),'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',path.join(dir,'oracle')]);
const rows=[];for(const f of [[20034,-20018,0,1],[20018,-20010,0,1],[-20034,-20018,0,0,1],[-2000042,-2000022,0,0,1]])for(const p of [2,3,5,37])for(let c=-3;c<=3;c++)for(const M of [1,2,3,4])rows.push({f,g:[c,1],p,M});
const actualCode=`#include "pari.h"
#include "paripriv.h"
#include <stdio.h>
static void poly(GEN f){printf("[");for(long i=0;i<=degpol(f);i++){if(i)printf(",");pari_printf("%Ps",gel(f,i+2));}printf("]");}
int main(void){pari_init(128000000,10000);const char *polys[]={"x^3-20018*x+20034","x^3-20010*x+20018","x^4-20018*x-20034","x^4-2000022*x-2000042"};long primes[]={2,3,5,37};for(long k=0;k<4;k++){GEN nf=nfinit0(gp_read_str(polys[k]),0,nbits2prec(192)),T=nf_get_pol(nf);for(long j=0;j<4;j++){GEN p=stoi(primes[j]);if(dvdii(nf_get_index(nf),p))continue;GEN fac=FpX_factor(T,p),factors=gel(fac,1),exponents=gel(fac,2);for(long i=1;i<lg(factors);i++){GEN u=gel(factors,i);if(exponents[i]!=1||degpol(u)==degpol(T))continue;long degree=degpol(u);u=centermod(poltobasis(nf,u),p);GEN cw,w=Q_primitive_part(nf_to_scalar_or_alg(nf,u),&cw);if(typ(w)!=t_POL)w=scalarpol(w,0);long v=cw?degree-Q_pval(cw,p)*degpol(T):degree;printf("{\\"field\\":%ld,\\"actual\\":true,\\"p\\":%ld,\\"M\\":%ld,\\"f\\":",k,primes[j],v+1);poly(T);printf(",\\"g\\":");poly(w);printf("}\\n");}}}pari_close();}`;
fs.writeFileSync(path.join(dir,'actual.c'),actualCode);run('cc',['-O2','-I'+path.join(pari,'src/headers'),'-I'+lib,path.join(dir,'actual.c'),'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',path.join(dir,'actual')]);
const actual=run(path.join(dir,'actual'),[]).trim().split('\n').map(JSON.parse);rows.push(...actual);
// Precision escalation and zero resultant controls: initial m=3 for p=17.
for(const n of [3,4])for(const M of [4,5,6])for(const c of [0,17**3,17**4])rows.push({f:[-1,...Array(n-1).fill(0),1],g:[c],p:17,M});
const raw=run(path.join(dir,'oracle'),[],{input:rows.map(r=>[r.f.length-1,r.g.length-1,r.p,r.M,...r.f,...r.g].join(' ')).join('\n')+'\n'}),expected=raw.trim().split('\n').map(JSON.parse);
const post=JSON.parse(run('python3',['-c',`import sys,json,importlib
sys.path[:0]=sys.argv[1:3]
m=importlib.import_module('bench.pari-class-group-port.kummer_resultant')
post=[]
for r,e in zip(*json.load(sys.stdin)):
 n=len(r['f'])-1;w=[77]*(n*n+n+2);t=[77]*27
 v=m.pari_kummer_resultant_valuation(r['f'],r['g'],n,len(r['g'])-1,r['p'],r['M'],w,t)
 assert v==e[-1] and [t[1+3*i:4+3*i] for i in range(t[0])]==e[:-1],(r,e,v,t)
 assert w[-2:]==[77,77] and t[-2:]==[77,77]
 post.append([w,t])
for which in range(6):
 args=[[1,0,0,1],[1],3,0,3,2,[77]*12,[77]*25]
 if which==0: args[2]=2
 if which==1: args[3]=3
 if which==2: args[5]=0
 if which==3: args[0][-1]=2
 if which==4: args[6]=[77]*11
 if which==5: args[7]=[77]*24
 before=[list(args[6]),list(args[7])]
 try: m.pari_kummer_resultant_valuation(*args);assert False
 except ValueError: pass
 assert [args[6],args[7]]==before
try: m.pari_kummer_resultant_valuation([1,0,0,1],[0],3,0,2,64,[77]*12,[77]*25);assert False
except ValueError as e: assert 'word modulus frontier' in str(e)
print(json.dumps(post))
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify([rows,expected])}));
const built=await compileKernel({sourcePath:path.join(__dirname,'kummer_resultant.py')}),fn=require(built.modulePath).pari_kummer_resultant_valuation;assert(fn.nativeAvailable);
for(const b of ['javascript','gmp','tagged']){
for(let k=0;k<rows.length;k++){const r=rows[k],e=expected[k],n=r.f.length-1,w=Array(n*n+n+2).fill(77n),t=Array(27).fill(77n);assert.equal(fn[b](r.f.map(BigInt),r.g.map(BigInt),BigInt(n),BigInt(r.g.length-1),BigInt(r.p),BigInt(r.M),w,t),BigInt(e.at(-1)));assert.deepEqual(Array.from({length:Number(t[0])},(_,i)=>t.slice(1+3*i,4+3*i).map(Number)),e.slice(0,-1));assert.deepEqual([w.map(Number),t.map(Number)],post[k]);}
for(let which=0;which<6;which++){const args=[[1n,0n,0n,1n],[1n],3n,0n,3n,2n,Array(12).fill(77n),Array(25).fill(77n)];if(which===0)args[2]=2n;if(which===1)args[3]=3n;if(which===2)args[5]=0n;if(which===3)args[0][3]=2n;if(which===4)args[6].pop();if(which===5)args[7].pop();const before=[args[6].slice(),args[7].slice()];assert.throws(()=>fn[b](...args),/frontier|short/);assert.deepEqual([args[6],args[7]],before);}
assert.throws(()=>fn[b]([1n,0n,0n,1n],[0n],3n,0n,2n,64n,Array(12).fill(77n),Array(25).fill(77n)),/word modulus frontier/);
}
const result={cases:rows.length,actualCases:actual.length,actualCorrections:rows.filter((r,i)=>r.actual&&expected[i].at(-1)>=r.M).length,backends:['cpython','javascript','gmp','tagged'],coreSha256:sha(fs.readFileSync(built.coreSourcePath)),sourceSha256:sha(fs.readFileSync(path.join(__dirname,'kummer_resultant.py'))),qualifiedTiming:false};fs.writeFileSync(path.join(dir,'fixtures.json'),JSON.stringify({rows,expected,result}));console.log(JSON.stringify({dir,...result}));
})().catch(e=>{console.error(e);process.exitCode=1;});
