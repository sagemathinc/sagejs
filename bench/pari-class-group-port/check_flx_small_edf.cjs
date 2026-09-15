"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const hash=x=>createHash('sha256').update(x).digest('hex');
function run(c,a,o={}){const r=spawnSync(c,a,{encoding:'utf8',timeout:180000,maxBuffer:128*1024*1024,...o});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
(async()=>{
 const pari=path.resolve(process.argv[2]),archive=path.resolve(process.argv[3]),lib=path.join(pari,'Olinux-x86_64');
 assert.equal(hash(fs.readFileSync(archive)),'02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53');
 const source=run('tar',['-xOf',archive,'pari-2.17.4/src/basemath/FpX_factor.c']),start=source.indexOf('static void\nFlx_edf_simple('),end=source.indexOf('static GEN\nFlx_factor_Shoup(',start);assert(start>=0&&end>start);const literal=source.slice(start,end);
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-flx-small-edf-'));
 const control=String.raw`#include "pari.h"
#include "paripriv.h"
static long random_polynomials,random_shifts;
static GEN observed_polynomial(long d,long vs,ulong p){random_polynomials++;return random_Flx(d,vs,p);}
static ulong observed_shift(ulong p){random_shifts++;return random_Fl(p);}
#define random_Flx observed_polynomial
#define random_Fl observed_shift
`+literal+String.raw`
static void poly_json(GEN f){putchar('[');for(long j=2;j<lg(f);j++){if(j>2)putchar(',');printf("\"%lu\"",uel(f,j));}putchar(']');}
static void state_json(GEN x){putchar('[');for(long i=0;i<66;i++){if(i)putchar(',');GEN word=modii(x,int2n(64));if(i==65)word=modii(word,stoi(64));pari_printf("\"%Ps\"",word);x=shifti(x,-64);}putchar(']');}
static long first=1,rows=0;
static void emit_given(GEN T,ulong p,long d,long seed,const char *kind,GEN XP){long n=degpol(T),count=n/d;GEN V=cgetg(count+1,t_COL);setrand(stoi(seed));GEN initial=getrand();random_polynomials=random_shifts=0;long e=expu(p),simple=count>e*expu(e);
if(simple)Flx_edf_simple(T,XP,d,p,0,V,1);else Flx_edf(T,XP,d,p,0,V,1);GEN final=getrand();if(!first)putchar(',');first=0;rows++;
printf("{\"kind\":\"%s\",\"p\":%lu,\"d\":%ld,\"n\":%ld,\"seed\":%ld,\"simple\":%s,\"T\":",kind,p,d,n,seed,simple?"true":"false");poly_json(T);printf(",\"XP\":");poly_json(XP);printf(",\"initial\":");state_json(initial);printf(",\"final\":");state_json(final);printf(",\"randomPolynomials\":%ld,\"randomShifts\":%ld,\"factors\":[",random_polynomials,random_shifts);for(long j=1;j<=count;j++){if(j>1)putchar(',');poly_json(gel(V,j));}printf("]}");}
static void emit(GEN T,ulong p,long d,long seed,const char *kind){emit_given(T,p,d,seed,kind,Flx_Frobenius(T,p));}
int main(void){pari_init(256000000,10000);putchar('[');
for(ulong p=3;p<=5;p+=2)for(long n=2;n<=4;n++){ulong bound=upowuu(p,n);for(ulong code=0;code<bound;code++){GEN T=cgetg(n+3,t_VECSMALL);T[1]=0;ulong c=code;for(long i=0;i<n;i++){T[i+2]=c%p;c/=p;}T[n+2]=1;GEN F=Flx_factor(T,p),pols=gel(F,1),exps=gel(F,2);long count=lg(pols)-1,d=degpol(gel(pols,1)),ok=count>1;for(long j=1;j<=count;j++)if(degpol(gel(pols,j))!=d||exps[j]!=1)ok=0;if(ok)for(long seed=1;seed<=2;seed++)emit(T,p,d,seed,"exhaustive-small");}}
const char *fields[]={"x^3-20018*x+20034","x^3-20010*x+20018","x^4-20018*x-20034","x^4-2000022*x-2000042"};ulong primes[]={3,5,7,37};
for(long fi=0;fi<4;fi++)for(long pi=0;pi<4;pi++){ulong p=primes[pi];GEN T=ZX_to_Flx(gp_read_str(fields[fi]),p),sf=Flx_factor_squarefree(T,p);for(long k=1;k<lg(sf);k++){GEN component=gel(sf,k);if(degpol(component)<=0)continue;GEN XP=Flx_Frobenius(component,p),D=Flx_ddf(component,p),pols=gel(D,1),degrees=gel(D,2);for(long j=1;j<lg(pols);j++){GEN a=Flx_normalize(gel(pols,j),p);if(degpol(a)>degrees[j])emit_given(a,p,degrees[j],1,"actual-field-ddf-parent-XP",XP);}}}
for(long pi=2;pi<4;pi++){ulong p=primes[pi];for(long n=2;n<=4;n++){GEN T=pol1_Flx(0);for(long j=0;j<n;j++)T=Flx_mul(T,mkvecsmall3(0,(p-j)%p,1),p);emit(T,p,1,1,"split-linear");emit(T,p,1,2,"split-linear");}}
{GEN linear=mkvecsmall4(0,0,2,1),quadratic=mkvecsmall4(0,1,0,1),T=Flx_mul(linear,quadratic,3);emit_given(linear,3,1,1,"mixed-quartic-original-XP",Flx_Frobenius(T,3));}
puts("]");pari_close();return 0;}
`;
 fs.writeFileSync(path.join(directory,'oracle.c'),control);run('cc',['-O1','-fsanitize=undefined','-fno-sanitize-recover=undefined','-I'+path.join(pari,'src/headers'),'-I'+lib,path.join(directory,'oracle.c'),'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',path.join(directory,'oracle')]);
 const rows=JSON.parse(run(path.join(directory,'oracle'),[]));assert(rows.some(r=>r.XP.length-1>=r.n),'original layer XP exceeds component degree');fs.writeFileSync(path.join(directory,'source-fixtures.json'),JSON.stringify(rows));
 const packets=rows.map(r=>{const w=Array(16460).fill('77');for(let i=0;i<9;i++){w[i]=r.T[i]||'0';w[9+i]=r.XP[i]||'0';}return [w,'0',String(r.n),'9',String(r.XP.length-1),String(r.d),String(r.p),'18','54','64',[...r.initial,'77','77'],['77','77','77','77'],['77','77']];});
 const expected=JSON.parse(run('python3',['-c',`
import sys,json,importlib
sys.path[:0]=sys.argv[1:3]
f=importlib.import_module('bench.pari-class-group-port.flx_small_edf').pari_flx_small_edf
out=[]
for packet in json.load(sys.stdin):
 a=[list(map(int,x)) if isinstance(x,list) else int(x) for x in packet]
 result=f(*a)
 out.append({'result':result,'args':[[str(v) for v in x] if isinstance(x,list) else str(x) for x in a]})
 for index,value in [(2,5),(6,2),(9,len(a[0])-16383)]:
  bad=[x.copy() if isinstance(x,list) else x for x in a];bad[index]=value
  before=[x.copy() if isinstance(x,list) else x for x in bad]
  try:f(*bad)
  except ValueError:pass
  else:raise AssertionError('missing EDF guard')
  assert bad==before
print(json.dumps(out))
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify(packets)}));
 function verify(r,g){assert.equal(g.result,r.n/r.d);for(let j=0;j<g.result;j++){assert.deepEqual(g.args[0].slice(18+9*j,27+9*j),[...r.factors[j],...Array(9-r.factors[j].length).fill('0')]);assert.equal(g.args[0][54+j],String(r.factors[j].length-1));}assert.deepEqual(g.args[10],[...r.final,'77','77']);assert.equal(g.args[11][0],String(r.randomPolynomials));assert.equal(g.args[11][1],String(r.randomShifts));assert.equal(g.args[11][3],'77');assert.deepEqual(g.args[0].slice(-12),Array(12).fill('77'));}
 rows.forEach((r,i)=>verify(r,expected[i]));
 const built=await require('../../tools/native-kernel/compiler.cjs').compileKernel({sourcePath:path.join(__dirname,'flx_small_edf.py')});const f=require(built.modulePath).pari_flx_small_edf;
 for(const backend of ['javascript','gmp','tagged'])for(let i=0;i<rows.length;i++){const args=packets[i].map(x=>Array.isArray(x)?f.createIntegerBuffer(x.length,8,x.map(BigInt)):BigInt(x));const result=Number(f[backend](...args));const snap=()=>args.map(x=>typeof x==='bigint'?String(x):x.toArray().map(String));const got={result,args:snap()};assert.deepEqual(got,expected[i]);verify(rows[i],got);assert.deepEqual(got.args[0].slice(0,18),packets[i][0].slice(0,18));
  for(const [index,value]of [[2,5n],[6,2n],[9,BigInt(packets[i][0].length-16383)]]){const before=snap(),bad=args.slice();bad[index]=value;assert.throws(()=>f[backend](...bad),/small odd EDF domain|short odd EDF storage/);assert.deepEqual(snap(),before);}
 }
 const result={cases:rows.length,backends:['cpython','javascript','gmp','tagged'],directory,sourceHash:hash(fs.readFileSync(path.join(__dirname,'flx_small_edf.py'))),oracleSourceHash:hash(literal),coreHash:hash(fs.readFileSync(built.coreSourcePath)),qualifiedTiming:false};fs.writeFileSync(path.join(directory,'fixtures.json'),JSON.stringify({rows,expected,result}));console.log(JSON.stringify(result));
})().catch(e=>{console.error(e);process.exitCode=1;});
