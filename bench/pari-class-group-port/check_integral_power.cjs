"use strict";
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const {spawnSync} = require('node:child_process'), {createHash} = require('node:crypto');
const {compileKernel} = require('../../tools/native-kernel/compiler.cjs');
function run(cmd,args,options={}) {
 const r=spawnSync(cmd,args,{encoding:'utf8',timeout:60000,maxBuffer:16*1024*1024,...options});
 assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;
}
(async()=>{
 const pari=path.resolve(process.argv[2]),lib=path.join(pari,'Olinux-x86_64');
 for(const file of ['base3.c','polarit2.c','trans1.c','bb_group.c']) {
  const rel='src/basemath/'+file;
  assert.deepEqual(fs.readFileSync(path.join(pari,rel)),Buffer.from(run('tar',['-xOf',process.argv[3],'pari-2.17.4/'+rel])));
 }
 assert.equal(createHash('sha256').update(fs.readFileSync(process.argv[3])).digest('hex'),'02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-integral-power-')),c=path.join(dir,'oracle.c'),exe=path.join(dir,'oracle');
 fs.writeFileSync(c,`#include "pari.h"
#include "paripriv.h"
static void vec(GEN x){putchar('[');for(long i=1;i<lg(x);i++){if(i>1)putchar(',');pari_printf("\\"%Ps\\"",gel(x,i));}putchar(']');}
static long squares,multiplies;static ulong order;
static GEN traced_square(void *nf,GEN x){squares++;order=order*4+1;return nfsqri((GEN)nf,x);}
static GEN traced_multiply(void *nf,GEN x,GEN y){multiplies++;order=order*4+2;return nfmuli((GEN)nf,x,y);}
int main(void){pari_init(128000000,10000);
for(ulong p=0;p<50;p++)for(ulong k=0;k<65;k++)printf("{\\"kind\\":\\"word\\",\\"p\\":%lu,\\"e\\":%lu,\\"out\\":\\"%lu\\"}\\n",p,k,upowuu(p,k));
ulong cuts[]={2642245,65535,7131,1625,565,255,138,84,56,40,30,23,19,15,13,11,10,9};
for(long z=0;z<18;z++)for(long delta=-1;delta<=1;delta++){ulong p=cuts[z]+delta,k=z+3;printf("{\\"kind\\":\\"word\\",\\"p\\":%lu,\\"e\\":%lu,\\"out\\":\\"%lu\\"}\\n",p,k,upowuu(p,k));}
for(long bits=0;bits<=130;bits+=65)for(long delta=-1;delta<=1;delta++)for(long sign=-1;sign<=1;sign+=2)for(long e=0;e<=31;e++){
 GEN a=mulsi(sign,addis(int2n(bits),delta));printf("{\\"kind\\":\\"integer\\",\\"e\\":%ld,\\"a\\":",e);pari_printf("\\"%Ps\\",\\"out\\":\\"%Ps\\"}\\n",a,powiu(a,e));}
const char *polys[]={"x^3-20018*x+20034","x^3-20010*x+20018","x^4-20018*x-20034","x^4-2000022*x-2000042"};
for(long field=0;field<4;field++){pari_sp av=avma;GEN nf=nfinit(gp_read_str(polys[field]),DEFAULTPREC);long n=nf_get_degree(nf);GEN table=cgetg(n*n*n+1,t_VEC);long pos=1;
for(long i=1;i<=n;i++)for(long j=1;j<=n;j++){GEN v=tablemul_ei_ej(nf,i,j);for(long k=1;k<=n;k++)gel(table,pos++)=gel(v,k);}
long scales[]={-6,0,1,2};ulong exponents[]={0,1,2,7,31,511};
for(long sample=0;sample<8;sample++)for(long si=0;si<4;si++)for(long ei=0;ei<6;ei++){
 GEN x=cgetg(n+1,t_COL);for(long i=1;i<=n;i++)gel(x,i)=stoi(scales[si]*(sample<2?(i==1?sample+1:0):((sample+3)*(i+2)%11)-5));
 ulong e=exponents[ei];GEN power=nfpow(nf,x,utoi(e));long tag=typ(power)!=t_COL;squares=multiplies=0;order=0;
 GEN normalized=nf_to_scalar_or_basis(nf,x),cx=NULL;
 if(e&&typ(normalized)==t_COL){GEN primitive=primitive_part(normalized,&cx);GEN v=gen_powu_i(primitive,e,(void*)nf,traced_square,traced_multiply);if(cx)v=gmul(v,powiu(cx,e));if(!gequal(v,power))return 3;}
 printf("{\\"kind\\":\\"field\\",\\"n\\":%ld,\\"e\\":%lu,\\"tag\\":%ld,\\"counts\\":[%ld,%ld,%lu],\\"table\\":",n,e,tag,squares,multiplies,order);vec(table);printf(",\\"x\\":");vec(x);printf(",\\"out\\":");vec(algtobasis(nf,power));puts("}");
}avma=av;}pari_close();return 0;}`);
 run('cc',['-O2','-I'+path.join(pari,'src/headers'),'-I'+lib,c,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',exe]);
 const trace=run(exe,[]),rows=trace.trim().split('\n').map(JSON.parse);
 run('python3',['-c',`import sys,json,importlib
sys.path[:0]=sys.argv[1:3];m=importlib.import_module('bench.pari-class-group-port.integral_power')
for r in json.load(sys.stdin):
 if r['kind']=='integer':
  assert m.pari_nonnegative_integer_power(int(r['a']),r['e'])==int(r['out']),r
  continue
 if r['kind']=='word':
  assert m.pari_word_power(r['p'],r['e'])==int(r['out']),r
  continue
 n=r['n'];x=list(map(int,r['x']));table=list(map(int,r['table']));out=[77]*(n+2);counts=[91]*3
 tag=m.pari_integral_element_power(table,x,n,r['e'],[0]*n,[0]*n,out,counts)
 assert tag==r['tag'] and counts==r['counts'] and out==list(map(int,r['out']))+[77,77],r
 assert x==list(map(int,r['x'])) and table==list(map(int,r['table']))
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify(rows)});
 const built=await compileKernel({sourcePath:path.join(__dirname,'integral_power.py')}),m=require(built.modulePath),f=m.pari_integral_element_power;
 assert(f.nativeAvailable&&m.pari_word_power.nativeAvailable);
 for(const backend of ['javascript','gmp'])for(const r of rows){
  if(r.kind==='integer'){assert.equal(m.pari_nonnegative_integer_power[backend](BigInt(r.a),BigInt(r.e)),BigInt(r.out));continue;}
  if(r.kind==='word'){assert.equal(m.pari_word_power[backend](BigInt(r.p),BigInt(r.e)),BigInt(r.out));continue;}
  const n=r.n,x=r.x.map(BigInt),table=r.table.map(BigInt),counts=[91n,91n,91n];
  // Same fixed 1024-word bound as the binary-power checker, now H(x)<2^8.
  assert(x.every(v=>v>-256n&&v<256n));assert(table.every(v=>v>-(1n<<64n)&&v<(1n<<64n)));
  const out=f.createIntegerBuffer(n+2,1024,Array(n+2).fill(77n)),primitive=f.createIntegerBuffer(n,1024),temporary=f.createIntegerBuffer(n,1024);
  assert.equal(f[backend](table,x,BigInt(n),BigInt(r.e),primitive,temporary,out,counts),BigInt(r.tag));
  assert.deepEqual(out.toArray(),[...r.out.map(BigInt),77n,77n]);assert.deepEqual(counts,r.counts.map(BigInt));
  assert.deepEqual(x,r.x.map(BigInt));assert.deepEqual(table,r.table.map(BigInt));
 }
 for(const backend of ['javascript','gmp']){
  for(const exponent of [-1n,512n]){
   const out=[77n,77n,77n],counts=[91n,91n,91n];
   assert.throws(()=>f[backend]([],[],3n,exponent,[],[],out,counts),/unsupported integral element power domain/);
   assert.deepEqual(out,[77n,77n,77n]);assert.deepEqual(counts,[91n,91n,91n]);
  }
  // Scalar and exponent-zero paths do not read unused arithmetic workspaces.
  let out=[77n,77n,77n],counts=[91n,91n,91n];
  assert.equal(f[backend]([],[],3n,0n,[],[],out,counts),1n);assert.deepEqual(out,[1n,0n,0n]);
  assert.equal(f[backend]([],[-6n,0n,0n],3n,7n,[],[],out,counts),1n);assert.deepEqual(out,[-279936n,0n,0n]);
 }
 console.log(JSON.stringify({wordCases:rows.filter(r=>r.kind==='word').length,integerCases:rows.filter(r=>r.kind==='integer').length,fieldCases:rows.filter(r=>r.kind==='field').length,traceSha256:createHash('sha256').update(trace).digest('hex'),coreBytes:fs.statSync(built.coreSourcePath).size,qualifiedTiming:false}));
})().catch(e=>{console.error(e);process.exitCode=1;});
