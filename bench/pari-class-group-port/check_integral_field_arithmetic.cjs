"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {compileKernel}=require('../../tools/native-kernel/compiler.cjs');
function run(cmd,args,options={}){const r=spawnSync(cmd,args,{encoding:'utf8',timeout:60000,maxBuffer:8*1024*1024,...options});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
(async()=>{
 const pari=path.resolve(process.argv[2]),lib=path.join(pari,'Olinux-x86_64');
 for(const [file,sha]of Object.entries({
  'src/basemath/base3.c':'5cbf4ebd6c70deb06cfd83f94b8d86368e60cd084f318a003a8ee14821e1cbea',
  'src/basemath/bb_group.c':'30ceda3cedce14d61e646021fe7c59e057beb8694002ee09b8532eaa32ea27c3',
 })){
 assert.equal(createHash('sha256').update(fs.readFileSync(path.join(pari,file))).digest('hex'),sha);
 assert.equal(createHash('sha256').update(run('tar',['-xOf',process.argv[3],'pari-2.17.4/'+file])).digest('hex'),sha);
 }
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-field-arithmetic-')),c=path.join(dir,'oracle.c'),exe=path.join(dir,'oracle');
 fs.writeFileSync(c,`#include "pari.h"
#include "paripriv.h"
static void vec(GEN x){putchar('[');for(long i=1;i<lg(x);i++){if(i>1)putchar(',');pari_printf("\\"%Ps\\"",gel(x,i));}putchar(']');}
static long squares,multiplies;static ulong order;
static GEN traced_square(void *nf,GEN x){squares++;order=order*4+1;return nfsqri((GEN)nf,x);}
static GEN traced_multiply(void *nf,GEN x,GEN y){multiplies++;order=order*4+2;return nfmuli((GEN)nf,x,y);}
int main(void){pari_init(128000000,10000);const char *polys[]={"x^3-20018*x+20034","x^3-20010*x+20018","x^4-20018*x-20034","x^4-2000022*x-2000042"};
for(long field=0;field<4;field++){pari_sp av=avma;GEN nf=nfinit(gp_read_str(polys[field]),DEFAULTPREC);long n=nf_get_degree(nf);GEN table=cgetg(n*n*n+1,t_VEC);long pos=1;
for(long i=1;i<=n;i++)for(long j=1;j<=n;j++){GEN v=tablemul_ei_ej(nf,i,j);for(long k=1;k<=n;k++)gel(table,pos++)=gel(v,k);}
for(long sample=0;sample<24;sample++){GEN x=cgetg(n+1,t_COL),y=cgetg(n+1,t_COL);for(long i=1;i<=n;i++){
long a=sample<2*n?(sample%n==i-1?(sample<n?1:-1):0):((sample+3)*(i+2)%11)-5;
long b=sample<2*n?(sample%n==(n-i)?-1:0):((sample+5)*(i+1)%13)-6;
if(sample==2*n){a=0;b=0;}if(sample==2*n+1&&i>1){a=0;b=0;}
gel(x,i)=shifti(stoi(a),sample>=16?96:0);gel(y,i)=shifti(stoi(b),sample>=20?192:0);}
GEN product=algtobasis(nf,nfmul(nf,x,y)),square=algtobasis(nf,nfsqr(nf,x));
printf("{\\"n\\":%ld,\\"table\\":",n);vec(table);printf(",\\"x\\":");vec(x);printf(",\\"y\\":");vec(y);printf(",\\"product\\":");vec(product);printf(",\\"square\\":");vec(square);printf(",\\"powers\\":[");
if(sample<12){ulong exponents[]={1,2,3,7,31,511};for(long z=0;z<6;z++){ulong exponent=exponents[z];squares=multiplies=0;order=0;GEN power=gen_powu_i(x,exponent,(void*)nf,traced_square,traced_multiply);if(!gequal(power,algtobasis(nf,nfpow(nf,x,utoi(exponent)))))return 3;if(z)putchar(',');printf("{\\"exponent\\":%lu,\\"counts\\":[%ld,%ld,%lu],\\"value\\":",exponent,squares,multiplies,order);vec(power);putchar('}');}}
puts("]}");}
avma=av;}pari_close();return 0;}`);
 run('cc',['-O2','-I'+path.join(pari,'src/headers'),'-I'+lib,c,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',exe]);
 const trace=run(exe,[]),rows=trace.trim().split('\n').map(JSON.parse);assert.equal(rows.length,96);
 run('python3',['-c',`import sys,json,importlib
sys.path[:0]=sys.argv[1:3];m=importlib.import_module('bench.pari-class-group-port.integral_field_arithmetic')
for ix,r in enumerate(json.load(sys.stdin)):
 n=r['n'];table=list(map(int,r['table']));x=list(map(int,r['x']));y=list(map(int,r['y']));product=[77]*(n+2);square=[77]*(n+2)
 assert m.pari_integral_field_multiply(table,x,y,n,product)==0
 assert m.pari_integral_field_square(table,x,n,square)==0
 assert product==list(map(int,r['product']))+[77,77] and square==list(map(int,r['square']))+[77,77],(ix,r,product,square)
 assert table==list(map(int,r['table'])) and x==list(map(int,r['x'])) and y==list(map(int,r['y']))
 for power in r['powers']:
  out=[77]*(n+2);counts=[0,0,0]
  assert m.pari_integral_field_binary_power(table,x,n,power['exponent'],[0]*n,out,counts)==0
  assert out==list(map(int,power['value']))+[77,77] and counts==power['counts'],(ix,power,out,counts)
 assert table==list(map(int,r['table'])) and x==list(map(int,r['x']))
for degree in [2,5]:
 out=[77]*5
 try:m.pari_integral_field_square([],[],degree,out)
 except ValueError as error:assert str(error)=='unsupported integral field arithmetic degree'
 else:raise AssertionError('unsupported degree accepted')
 assert out==[77]*5
for exponent in [-1,0,512]:
 out=[77]*3;counts=[91,91]
 try:m.pari_integral_field_binary_power([],[],3,exponent,[],out,counts)
 except ValueError as error:assert str(error)=='unsupported integral field binary power domain'
 else:raise AssertionError('unsupported exponent accepted')
 assert out==[77]*3 and counts==[91,91]
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify(rows)});
 const built=await compileKernel({sourcePath:path.join(__dirname,'integral_field_arithmetic.py')}),m=require(built.modulePath);
 assert(m.pari_integral_field_multiply.nativeAvailable&&m.pari_integral_field_square.nativeAvailable&&m.pari_integral_field_binary_power.nativeAvailable);
 assert.doesNotMatch(fs.readFileSync(built.coreSourcePath,'utf8'),/napi_call_function|PyObject_Call/);
 for(const [ix,r]of rows.entries())for(const backend of ['javascript','gmp']){
  const n=r.n,table=r.table.map(BigInt),x=r.x.map(BigInt),y=r.y.map(BigInt),product=Array(n+2).fill(77n),square=Array(n+2).fill(77n);
  assert.equal(m.pari_integral_field_multiply[backend](table,x,y,BigInt(n),product),0n);
  assert.equal(m.pari_integral_field_square[backend](table,x,BigInt(n),square),0n);
  assert.deepEqual(product,[...r.product.map(BigInt),77n,77n],`${ix} ${backend} product`);
  assert.deepEqual(square,[...r.square.map(BigInt),77n,77n],`${ix} ${backend} square`);
  assert.deepEqual(table,r.table.map(BigInt));assert.deepEqual(x,r.x.map(BigInt));assert.deepEqual(y,r.y.map(BigInt));
  for(const power of r.powers){
   // A fixed 1024 words/entry, not an oracle-sized or auto-growing allocation.
   // For these declared inputs H(x)<2^8, table height<2^64, n<=4 and e<=511:
   // H(x^e) <= H(x)^e * (n*n*H(table))^(e-1), below 65536 bits.
   assert(table.every(v=>v>-(1n<<64n)&&v<(1n<<64n)));
   assert(x.every(v=>v>-256n&&v<256n));
   const f=m.pari_integral_field_binary_power,out=f.createIntegerBuffer(n+2,1024,Array(n+2).fill(77n)),temporary=f.createIntegerBuffer(n,1024),counts=[0n,0n,0n];
   assert.equal(f[backend](table,x,BigInt(n),BigInt(power.exponent),temporary,out,counts),0n);
   assert.deepEqual(out.toArray(),[...power.value.map(BigInt),77n,77n],ix+' '+backend+' power '+power.exponent);
   assert.deepEqual(counts,power.counts.map(BigInt));
  }
  assert.deepEqual(table,r.table.map(BigInt));assert.deepEqual(x,r.x.map(BigInt));
 }
 const limited=rows[1],f=m.pari_integral_field_binary_power;
 for(const backend of ['javascript','gmp'])assert.throws(()=>f[backend](limited.table.map(BigInt),limited.x.map(BigInt),BigInt(limited.n),511n,f.createIntegerBuffer(limited.n,8),f.createIntegerBuffer(limited.n,8),[0n,0n,0n]),/IntegerBuffer word capacity exceeded/);
 for(const backend of ['javascript','gmp'])for(const exponent of [-1n,0n,512n]){
  const out=Array(3).fill(77n),counts=[91n,91n];
  assert.throws(()=>f[backend]([],[],3n,exponent,[],out,counts),/unsupported integral field binary power domain/);
  assert.deepEqual(out,Array(3).fill(77n));assert.deepEqual(counts,[91n,91n]);
 }
 for(const backend of ['javascript','gmp'])for(const degree of [2n,5n]){
  const out=Array(5).fill(77n);assert.throws(()=>m.pari_integral_field_square[backend]([],[],degree,out),/unsupported integral field arithmetic degree/);assert.deepEqual(out,Array(5).fill(77n));
 }
 const powers=rows.reduce((sum,r)=>sum+r.powers.length,0);assert.equal(powers,288);
 console.log(JSON.stringify({cases:rows.length,operations:rows.length*2,powers,traceSha256:createHash('sha256').update(trace).digest('hex'),coreBytes:fs.statSync(built.coreSourcePath).size,qualifiedTiming:false}));
})().catch(e=>{console.error(e);process.exitCode=1;});
