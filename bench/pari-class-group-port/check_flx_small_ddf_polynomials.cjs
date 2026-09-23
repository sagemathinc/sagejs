"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const hash=x=>createHash('sha256').update(x).digest('hex');
function run(c,a,input){const r=spawnSync(c,a,{input,encoding:'utf8',timeout:120000,maxBuffer:32*1024*1024});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
(async()=>{
 const pari=path.resolve(process.argv[2]),archive=path.resolve(process.argv[3]);
 assert.equal(hash(fs.readFileSync(archive)),'02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53');
 const source=run('tar',['-xOf',archive,'pari-2.17.4/src/basemath/FpX_factor.c']);
 const start=source.indexOf('static GEN\nFlx_ddf_Shoup('),end=source.indexOf('\nstatic void\nFlx_edf_simple(',start);assert(start>=0&&end>start);
 const literal=source.slice(start,end),directory=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-ddf-polynomials-'));
 const rows=[];
 // Exhaust every monic polynomial through degree four over F3/F5, including
 // nonsquarefree controls (raw DDF output, not a claim of factorization).
 for(const p of [3,5])for(let d=0;d<=4;d++)for(let code=0;code<p**d;code++){
  let k=code;const c=[];for(let i=0;i<d;i++){c.push(k%p);k=Math.floor(k/p);}c.push(1);rows.push({p,c});
 }
 const fields=[[20034,-20018,0,1],[20018,-20010,0,1],[-20034,-20018,0,0,1],[-2000042,-2000022,0,0,1]];
 for(let field=0;field<4;field++)for(const p of [3,5,7,37])rows.push({p,c:fields[field].map(x=>(x%p+p)%p),field});
 for(const p of [7,37,3037000493])for(let d=0;d<=4;d++)for(const lead of [1,2])rows.push({p,c:[...Array.from({length:d},(_,i)=>(i+3)%p),lead]});
 const control='#include "pari.h"\n#include "paripriv.h"\n'+literal+String.raw`
int main(void){pari_init(16000000,10000);unsigned long p;char text[4096];int first=1;putchar('[');
while(scanf("%lu %4095s",&p,text)==2){pari_sp av=avma;GEN T=ZX_to_Flx(gp_read_str(text),p);GEN XP=Flx_Frobenius_pre(T,p,get_Fl_red(p));GEN f=Flx_ddf_Shoup(T,XP,p,get_Fl_red(p));
if(!first)putchar(',');first=0;putchar('[');for(long j=1;j<lg(f);j++){if(j>1)putchar(',');putchar('[');GEN a=gel(f,j);for(long i=2;i<lg(a);i++){if(i>2)putchar(',');printf("%lu",uel(a,i));}putchar(']');}putchar(']');set_avma(av);}
puts("]");pari_close();return 0;}
`;
 fs.writeFileSync(path.join(directory,'oracle.c'),control);const lib=path.join(pari,'Olinux-x86_64'),binary=path.join(directory,'oracle');
 run('cc',['-O1','-I'+path.join(pari,'src/headers'),'-I'+lib,path.join(directory,'oracle.c'),'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',binary]);
 const expected=JSON.parse(run(binary,[],rows.map(r=>r.p+' '+r.c.map((v,i)=>`(${v})*x^${i}`).join('+')).join('\n')+'\n'));
 const packets=rows.map(r=>{const w=Array(323).fill(77);for(let i=0;i<9;i++)w[i]=r.c[i]||0;return w;});
 const cp=JSON.parse(run('python3',['-c',`
import sys,json,importlib
sys.path[:0]=sys.argv[1:3]
m=importlib.import_module('bench.pari-class-group-port.flx_small_factor')
out=[]
for r,w in json.load(sys.stdin):
 n=m.pari_flx_small_ddf_polynomials(w,0,len(r['c'])-1,r['p'],9,45,49)
 out.append(w)
 assert n==len(r['c'])-1
for degree,prime,lead,length in [(-1,3,1,323),(5,3,1,323),(2,2,1,323),(2,4,1,323),(2,3,0,323),(2,3,3,323),(2,3,-1,323),(2,3,1,320)]:
 w=[0]*length
 w[2]=lead
 before=w.copy()
 try:m.pari_flx_small_ddf_polynomials(w,0,degree,prime,9,45,49)
 except ValueError:pass
 else:raise AssertionError('missing DDF guard')
 assert w==before
print(json.dumps(out))
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],JSON.stringify(rows.map((r,i)=>[r,packets[i]]))));
 function verify(w,i){
  const degrees=Array(4).fill(0),polys=Array(36).fill(0);for(let j=0;j<4;j++)polys[j*9]=1;
  expected[i].forEach((c,j)=>{degrees[j]=c.length-1;c.forEach((v,k)=>polys[j*9+k]=v);});
  assert.deepEqual(w.slice(9,45),polys);assert.deepEqual(w.slice(45,49),degrees);
  assert.deepEqual(w.slice(0,9),packets[i].slice(0,9));assert.deepEqual(w.slice(321),[77,77]);
 }
 cp.forEach(verify);
 const built=await require('../../tools/native-kernel/compiler.cjs').compileKernel({sourcePath:path.join(__dirname,'flx_small_factor.py')});
 const f=require(built.modulePath).pari_flx_small_ddf_polynomials;
 for(const backend of ['javascript','gmp','tagged'])for(let i=0;i<rows.length;i++){
  const w=f.createIntegerBuffer(323,4,packets[i].map(BigInt));assert.equal(Number(f[backend](w,0n,BigInt(rows[i].c.length-1),BigInt(rows[i].p),9n,45n,49n)),rows[i].c.length-1);
  const got=w.toArray().map(Number);assert.deepEqual(got,cp[i]);verify(got,i);
 }
 for(const backend of ['javascript','gmp','tagged'])for(const [d,p,lead,length] of [[-1,3,1,323],[5,3,1,323],[2,2,1,323],[2,4,1,323],[2,3,0,323],[2,3,3,323],[2,3,-1,323],[2,3,1,320]]){
  const a=Array(length).fill(0n);a[2]=BigInt(lead);const w=f.createIntegerBuffer(length,4,a);
  assert.throws(()=>f[backend](w,0n,BigInt(d),BigInt(p),9n,45n,49n),/DDF/);assert.deepEqual(w.toArray(),a);
 }
 const result={cases:rows.length,invalidControls:8,backends:['cpython','javascript','gmp','tagged'],sourceHash:hash(literal),candidateHash:hash(fs.readFileSync(path.join(__dirname,'flx_small_factor.py'))),controlHash:hash(control),coreHash:hash(fs.readFileSync(built.coreSourcePath)),coreBytes:fs.statSync(built.coreSourcePath).size,directory,qualifiedTiming:false};
 fs.writeFileSync(path.join(directory,'fixtures.json'),JSON.stringify({rows,expected,result}));console.log(JSON.stringify(result));
})().catch(e=>{console.error(e);process.exitCode=1;});
