"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {compileKernel}=require('../../tools/native-kernel/compiler.cjs');
function run(cmd,args,options={}){const r=spawnSync(cmd,args,{encoding:'utf8',timeout:60000,maxBuffer:8*1024*1024,...options});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
(async()=>{
 const multiword=process.argv.includes('--multiword');
 const pari=path.resolve(process.argv[2]),lib=path.join(pari,'Olinux-x86_64');
 for(const [file,sha]of Object.entries({
  'src/kernel/gmp/gcdext.c':'26e788ce814668cdd879ef8d4d1d9b9beafc7e096b47767b642403892721a6d0',
  'src/kernel/none/gcdll.c':'b91389d8cd1b8fea0f62da09a73e076b92c4127dcc3a9234f17001d5c2524e7b',
  'src/basemath/base4.c':'46301497631028a5978266bb4a27c2bdf0a13aab8fb60335e3f359438b76d5e7',
  'src/basemath/arith1.c':'b8c6de3f34a02dc4a47516e30dd009d090ab9b9a2870fdfc2827f47a069d7265',
  'src/kernel/none/level1.h':'e9164e4d8d2fbb820ee6747c6cf597a0b9d34b86de87a8c47cc0e42f70d90159',
 })){
  assert.equal(createHash('sha256').update(fs.readFileSync(path.join(pari,file))).digest('hex'),sha);
  assert.equal(createHash('sha256').update(run('tar',['-xOf',process.argv[3],'pari-2.17.4/'+file])).digest('hex'),sha);
 }
 const positive=[1n,2n,3n,4n,6n,12n,35n,144n,233n,2147483659n,(1n<<63n),(1n<<64n)-2n,(1n<<64n)-1n];
 const values=[0n,...positive,...positive.map(x=>-x)],cases=[];
 for(const a of values)for(const b of values)cases.push({kind:0,a:String(a),b:String(b)});
 if(multiword){
  for(const bits of [65n,128n,256n,1024n])for(let seed=0n;seed<12n;seed++){
   const a=(1n<<bits)+seed*65537n+1n;
   const bs=[0n,1n,2n,a,a*3n,(1n<<(bits-1n))+seed*1000003n+3n];
   for(const b of bs)for(const sign of [-1n,1n])for(const signB of [-1n,1n])cases.push({kind:0,a:String(sign*a),b:String(signB*b)});
  }
  let a=1n,b=1n;for(let i=0;i<600;i++){[a,b]=[b,a+b];if(i>90&&i%31===0)for(const sign of [-1n,1n])cases.push({kind:0,a:String(sign*a),b:String(b)});}
 }
 for(const b of [2n,4n,6n,8n,12n,18n,30n,36n,72n,100n,210n,65536n,(1n<<63n),(1n<<64n)-1n]){
  for(const a of [...values,b-1n,b/2n,b/3n,b+1n,(1n<<90n)+15n])cases.push({kind:1,a:String(a),b:String(b)});
 }
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-hnf-word-')),c=path.join(dir,'oracle.c'),exe=path.join(dir,'oracle');
 fs.writeFileSync(c,`#include "pari.h"
#include "paripriv.h"
int main(void){pari_init(64000000,10000);const char *as[]={${cases.map(r=>JSON.stringify(r.a)).join(',')}},*bs[]={${cases.map(r=>JSON.stringify(r.b)).join(',')}};int kinds[]={${cases.map(r=>r.kind).join(',')}};
for(long i=0;i<${cases.length};i++){pari_sp av=avma;GEN a=gp_read_str(as[i]),b=gp_read_str(bs[i]),g,u,v;if(kinds[i]){u=Fp_invgen(a,b,&g);pari_printf("%Ps %Ps\\n",g,u);}else{g=bezout(a,b,&u,&v);pari_printf("%Ps %Ps %Ps\\n",g,u,v);}avma=av;}pari_close();return 0;}`);
 run('cc',['-O2','-I'+path.join(pari,'src/headers'),'-I'+lib,c,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',exe]);
 const trace=run(exe,[]),expected=trace.trim().split('\n').map(r=>r.split(' '));assert.equal(expected.length,cases.length);
 run('python3',['-c',`import sys,json,importlib,math
sys.path[:0]=sys.argv[1:3];m=importlib.import_module('bench.pari-class-group-port.hnf_word_arithmetic')
bezout=importlib.import_module('bench.pari-class-group-port.hnf_bezout').pari_hnf_bezout if sys.argv[3]=='1' else m.pari_word_bezout
for i,(r,w) in enumerate(zip(*json.load(sys.stdin))):
 a=int(r['a']);b=int(r['b']);f=m.pari_word_inverse_generator if r['kind'] else bezout
 out=f(a,b);assert out==tuple(map(int,w)),(i,r,out,w)
 if r['kind']:
  d,u=out;assert u*a%b==d%b
  if a%b:assert math.gcd(u,b)==1
 else:
  d,u,v=out;assert a*u+b*v==d==math.gcd(a,b)
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib'),multiword?'1':'0'],{input:JSON.stringify([cases,expected])});
 const built=await compileKernel({sourcePath:path.join(__dirname,'hnf_word_arithmetic.py')}),m=require(built.modulePath);
 const general=multiword?await compileKernel({sourcePath:path.join(__dirname,'hnf_bezout.py')}):null;
 const bezout=general?require(general.modulePath).pari_hnf_bezout:m.pari_word_bezout;
 for(const [i,r]of cases.entries())for(const backend of ['javascript','gmp']){
  const f=r.kind?m.pari_word_inverse_generator:bezout;assert.equal(f.nativeAvailable,true);
  assert.deepEqual(f[backend](BigInt(r.a),BigInt(r.b)),expected[i].map(BigInt),`${i} ${backend}`);
 }
 console.log(`${cases.length} exact PARI/CPython/JS/GMP Bezout and inverse-generator choices agree, including noninvertible composite pivots`);
 console.log(JSON.stringify({multiword,traceSha256:createHash('sha256').update(trace).digest('hex'),qualifiedTiming:false}));
})().catch(e=>{console.error(e);process.exitCode=1;});
