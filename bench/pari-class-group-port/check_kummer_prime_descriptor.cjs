"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const hash=x=>createHash('sha256').update(x).digest('hex');
function run(c,a,input){const r=spawnSync(c,a,{input,encoding:'utf8',timeout:120000,maxBuffer:32*1024*1024});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
(async()=>{
 const pari=path.resolve(process.argv[2]),archive=path.resolve(process.argv[3]),lib=path.join(pari,'Olinux-x86_64');
 assert.equal(hash(fs.readFileSync(archive)),'02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53');
 const source=run('tar',['-xOf',archive,'pari-2.17.4/src/basemath/base2.c']);
 const start=source.indexOf('GEN\nidealprimedec_kummer('),end=source.indexOf('\ntypedef struct {',start);assert(start>=0&&end>start);
 const literal=source.slice(start,end);
 const observed=literal.replace('idealprimedec_kummer(','observed_kummer(')
  .replace('u = centermod(poltobasis(nf, u), p);','u = centermod(poltobasis(nf, u), p); obs_before=gcopy(u); obs_t=gcopy(t);')
  .replace('long v = cw? f - Q_pval(cw, p) * N: f;','long v = cw? f - Q_pval(cw, p) * N: f; obs_w=w;obs_cw=cw;obs_v=v;')
  .replace('if (ZpX_resultant_val(T, w, p, v + 1) > v)','if ((obs_rv=ZpX_resultant_val(T, w, p, v + 1)) > v)');
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-kummer-descriptor-'));
 const control='#include "pari.h"\n#include "paripriv.h"\nstatic GEN obs_before,obs_t,obs_w,obs_cw;static long obs_v,obs_rv;\nstatic GEN mk_pr(GEN p,GEN u,long e,long f,GEN t){return mkvec5(p,u,utoipos(e),utoipos(f),t);}\n'+observed+String.raw`
static void integer(GEN x){pari_printf("\"%Ps\"",x);}
static void vector(GEN x){putchar('[');for(long i=1;i<lg(x);i++){if(i>1)putchar(',');integer(gel(x,i));}putchar(']');}
static void matrix(GEN x){putchar('[');for(long j=1;j<lg(x);j++)for(long i=1;i<lg(gel(x,j));i++){if(j>1||i>1)putchar(',');integer(gcoeff(x,i,j));}putchar(']');}
static void polynomial(GEN x){if(typ(x)!=t_POL)x=scalarpol(x,0);putchar('[');for(long i=0;i<=degpol(x);i++){if(i)putchar(',');integer(gel(x,i+2));}putchar(']');}
int main(void){pari_init(128000000,10000);const char* fields[]={"x^3-20018*x+20034","x^3-20010*x+20018","x^4-20018*x-20034","x^4-2000022*x-2000042"};long primes[]={2,3,5,7,37};int first=1;putchar('[');
for(long field=0;field<4;field++)for(long ip=0;ip<5;ip++){pari_sp av=avma;GEN nf=nfinit(gp_read_str(fields[field]),nbits2prec(192)),T=nf_get_pol(nf),p=stoi(primes[ip]);long n=degpol(T);if(dvdii(nf_get_index(nf),p)){set_avma(av);continue;}
GEN F=FpX_factor(T,p),factors=gel(F,1),es=gel(F,2);
for(long j=1;j<lg(factors);j++){GEN factor=gel(factors,j);long e=es[j];obs_before=obs_t=obs_w=obs_cw=NULL;obs_v=obs_rv=0;
GEN pr=observed_kummer(nf,factor,e,p),reference=idealprimedec_kummer(nf,factor,e,p);if(!gequal(pr,reference))pari_err_BUG("instrumented Kummer mismatch");
if(!first)putchar(',');first=0;printf("{\"field\":%ld,\"n\":%ld,\"p\":%ld,\"e\":%ld,\"index\":",field,n,primes[ip],e);integer(nf_get_index(nf));printf(",\"polynomial\":");polynomial(T);printf(",\"factor\":");polynomial(factor);
printf(",\"invzk\":");matrix(nf_get_invzk(nf));printf(",\"zkden\":");integer(nf_get_zkden(nf));GEN zk=nf_get_zkprimpart(nf);
printf(",\"zk\":[");for(long k=1;k<=n;k++)for(long i=0;i<n;i++){if(k>1||i)putchar(',');integer(polcoef_i(gel(zk,k),i,-1));}printf("],\"zkDegrees\":[");for(long k=1;k<=n;k++){if(k>1)putchar(',');printf("%ld",typ(gel(zk,k))==t_POL?degpol(gel(zk,k)):0);}printf("],\"table\":[");for(long a=1;a<=n;a++)for(long b=1;b<=n;b++){GEN col=tablemul_ei_ej(nf,a,b);for(long i=1;i<=n;i++){if(a>1||b>1||i>1)putchar(',');integer(gel(col,i));}}
printf("],\"u\":");vector(pr_get_gen(pr));printf(",\"inert\":%s,\"tau\":",typ(pr_get_tau(pr))==t_INT?"true":"false");if(typ(pr_get_tau(pr))==t_INT)integer(pr_get_tau(pr));else matrix(pr_get_tau(pr));
printf(",\"before\":");if(obs_before)vector(obs_before);else printf("null");printf(",\"anti\":");if(obs_t)vector(obs_t);else printf("null");printf(",\"primitive\":");if(obs_w)polynomial(obs_w);else printf("null");
printf(",\"cwPresent\":%s,\"cwNumerator\":",obs_cw?"true":"false");integer(obs_cw?numerator(obs_cw,NULL):gen_1);printf(",\"cwDenominator\":");integer(obs_cw?denominator(obs_cw,NULL):gen_1);printf(",\"v\":%ld,\"rv\":%ld,\"corrected\":%s}",obs_v,obs_rv,obs_before&&!gequal(obs_before,pr_get_gen(pr))?"true":"false");
}set_avma(av);}puts("]");pari_close();return 0;}
`;
 fs.writeFileSync(path.join(directory,'oracle.c'),control);const binary=path.join(directory,'oracle');
 run('cc',['-O1','-I'+path.join(pari,'src/headers'),'-I'+lib,path.join(directory,'oracle.c'),'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',binary]);
 const rows=JSON.parse(run(binary,[]));
 const packets=rows.map(r=>{const n=r.n,fill=k=>Array(k).fill('77');return [r.polynomial,r.invzk,r.zk,r.zkDegrees.map(String),r.table,r.factor,String(n),String(r.factor.length-1),String(r.e),String(r.p),r.zkden,fill(38),fill(n+2),fill(n+2),fill(2*n+2),fill(n+2),fill(n+2),fill(n*n+n+2),fill(27),fill(n+2),fill(n*n+2),fill(14)];});
 const sample=packets[rows.findIndex(r=>!r.inert)],n=Number(sample[6]),degree=Number(sample[7]),invalid=[];
 const minima={0:n+1,1:n*n,2:n*n,3:n,4:n*n*n,5:degree+1,11:36,12:n,13:n,14:2*n,15:n,16:n,17:n*n+n,18:25,19:n,20:n*n,21:12};
 for(const [index,length] of Object.entries(minima)){const a=structuredClone(sample);a[index]=Array(length-1).fill('77');invalid.push(a);}
 for(const [index,value] of [[6,'2'],[7,'0'],[7,String(n+1)],[8,'0'],[9,'1'],[10,'0']]){const a=structuredClone(sample);a[index]=value;invalid.push(a);}
 for(const [index,offset,value] of [[0,n,'2'],[5,degree,'2'],[5,0,'-1'],[5,0,sample[9]],[3,0,String(n)]]){const a=structuredClone(sample);a[index][offset]=value;invalid.push(a);}
 const cp=JSON.parse(run('python3',['-c',`
import sys,json,importlib
sys.path[:0]=sys.argv[1:3]
f=importlib.import_module('bench.pari-class-group-port.kummer_prime_descriptor').pari_prepared_kummer_prime_descriptor
out=[]
packets,invalid=json.load(sys.stdin)
for packet in packets:
 a=[list(map(int,x)) if isinstance(x,list) else int(x) for x in packet]
 result=f(*a)
 out.append(dict(result=result,args=[[str(y) for y in x] if isinstance(x,list) else str(x) for x in a]))
for packet in invalid:
 a=[list(map(int,x)) if isinstance(x,list) else int(x) for x in packet]
 before=[x.copy() if isinstance(x,list) else x for x in a]
 try:f(*a)
 except ValueError:pass
 else:raise AssertionError('missing Kummer preflight')
 assert a==before
print(json.dumps(out))
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],JSON.stringify([packets,invalid])));
 function verify(got,i){const r=rows[i],a=got.args,n=r.n;assert.equal(got.result,0);assert.deepEqual(a[19],[...r.u,'77','77']);
  assert.deepEqual(a[20],r.inert?['1',...Array(n*n+1).fill('77')]:[...r.tau,'77','77']);
  const correction=!r.inert&&r.e===1;
  const state=['0',String(r.p),String(r.e),String(r.factor.length-1),String(+r.inert),String(+r.corrected),String(+r.cwPresent),correction?r.cwNumerator:'0',correction?r.cwDenominator:'0',correction?String(r.primitive.length-1):'-1',String(r.v),String(r.rv),'77','77'];
  assert.deepEqual(a[21],state);
  if(correction)assert.deepEqual(a[15],[...r.primitive,...Array(n+2-r.primitive.length).fill('77')]);else assert(a[15].every(x=>x==='77'));
  if(!r.inert)assert.deepEqual(a[13],[...r.anti,'77','77']);
  for(let j=0;j<6;j++)assert.deepEqual(a[j],packets[i][j]);
  for(let j=11;j<=21;j++)assert.deepEqual(a[j].slice(-2),['77','77']);
 }
 cp.forEach(verify);
 const built=await require('../../tools/native-kernel/compiler.cjs').compileKernel({sourcePath:path.join(__dirname,'kummer_prime_descriptor.py')});
 const f=require(built.modulePath).pari_prepared_kummer_prime_descriptor;
 for(const backend of ['javascript','gmp','tagged'])for(let i=0;i<packets.length;i++){
  const args=packets[i].map(x=>Array.isArray(x)?f.createIntegerBuffer(x.length,40,x.map(BigInt)):BigInt(x));
  const result=Number(f[backend](...args)),got={result,args:args.map(x=>typeof x==='bigint'?String(x):x.toArray().map(String))};assert.deepEqual(got,cp[i]);verify(got,i);
 }
 for(const backend of ['javascript','gmp','tagged'])for(const packet of invalid){
  const args=packet.map(x=>Array.isArray(x)?f.createIntegerBuffer(x.length,40,x.map(BigInt)):BigInt(x));
  assert.throws(()=>f[backend](...args),/Kummer/);
  assert.deepEqual(args.map(x=>typeof x==='bigint'?String(x):x.toArray().map(String)),packet);
 }
 assert(rows.some(r=>r.corrected));assert(rows.some(r=>r.inert));assert(rows.some(r=>r.e>1));
 assert(rows.some(r=>r.cwPresent&&r.cwDenominator!=='1'));
 const result={cases:rows.length,invalidControls:invalid.length,corrections:rows.filter(r=>r.corrected).length,inert:rows.filter(r=>r.inert).length,repeated:rows.filter(r=>r.e>1).length,backends:['cpython','javascript','gmp','tagged'],directory,sourceHash:hash(literal),controlHash:hash(control),candidateHash:hash(fs.readFileSync(path.join(__dirname,'kummer_prime_descriptor.py'))),coreHash:hash(fs.readFileSync(built.coreSourcePath)),qualifiedTiming:false};
 fs.writeFileSync(path.join(directory,'fixtures.json'),JSON.stringify({rows,packets,expected:cp,result}));console.log(JSON.stringify(result));
})().catch(e=>{console.error(e);process.exitCode=1;});
