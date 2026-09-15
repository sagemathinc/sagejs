"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {compileKernel}=require('../../tools/native-kernel/compiler.cjs');
function run(c,a,o={}){const r=spawnSync(c,a,{encoding:'utf8',timeout:180000,maxBuffer:32*1024*1024,...o});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
(async()=>{
 const pari=path.resolve(process.argv[2]),lib=path.join(pari,'Olinux-x86_64'),cases=[];
 const archive=path.resolve(process.argv[3]||path.join(pari,'..','pari-2.17.4.tar.gz'));
 const hash=x=>createHash('sha256').update(x).digest('hex');
 assert.equal(hash(fs.readFileSync(archive)),'02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53','PARI 2.17.4 archive');
 const source=run('tar',['-xOf',archive,'pari-2.17.4/src/basemath/buch2.c']);
 assert.equal(hash(source),'904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac','pristine buch2.c');
 for(let kc=1;kc<=6;kc++)for(let h=0;h<=kc;h++)for(const b of [0,kc-h])for(let ru=2;ru<=4;ru++)for(const z of [0,1,3]){
  const cols=h+b+z,H=Array.from({length:h*h},(_,i)=>String(i% (h+1)===0?2:0)),C=[];
  for(let i=0;i<cols*ru;i++)C.push('1',String((1n<<127n)+BigInt(i)),'128',String(i%3),'0','-1','0');
  cases.push({kc,h,b,ru,z,cols,H,C});
 }
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-post-hnf-')),file=path.join(dir,'oracle.c'),exe=path.join(dir,'oracle');
 fs.writeFileSync(file,`#include "pari.h"
int main(void){pari_init(32000000,1000);for(long kc=1;kc<=6;kc++)for(long h=0;h<=kc;h++)for(long which=0;which<2;which++)for(long ru=2;ru<=4;ru++)for(long zi=0;zi<3;zi++){pari_sp av=avma;long b=which?kc-h:0,z=zi==2?3:zi,need=kc-h-b;if(ru-1-z>0)need=minss(need+ru-1-z,kc);GEN H=matid(h);for(long i=1;i<=h;i++)gcoeff(H,i,i)=gen_2;GEN d=ZM_det_triangular(H),r=mulir(d,real_1(128));long e;pari_printf("%ld %Ps %Ps %ld %ld\\n",need,d,mantissa_real(r,&e),bit_prec(r),expo(r));avma=av;}pari_close();}`);
 run('cc',['-O1','-fsanitize=undefined','-fno-sanitize-recover=undefined','-I'+path.join(pari,'src/headers'),'-I'+lib,file,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',exe]);
 const trace=run(exe,[]),expected=trace.trim().split('\n').map(s=>s.split(' '));assert.equal(expected.length,cases.length);
 run('python3',['-c',`import sys,json,importlib
sys.path[:0]=sys.argv[1:3]
f=importlib.import_module('bench.pari-class-group-port.post_hnf_regulator_inputs').pari_post_hnf_regulator_inputs
for r,e in zip(*json.load(sys.stdin)):
 e=list(map(int,e));out=[77]*(3*r['ru']*r['z']);h=[77];z=[77]*3;state=[77]*3
 result=f(r['kc'],r['h'],r['b'],r['cols'],r['ru'],list(map(int,r['H'])),list(map(int,r['C'])),[1<<127,128,0],out,h,z,state)
 assert result==e[0] and state==[e[0],r['z'],int(e[0]==0)]
 assert h==([e[1]] if result==0 else [77])
 assert z==(e[2:] if result==0 else [77]*3)
 want=[int(r['C'][7*i+j]) for i in range(r['ru']*r['z']) for j in [1,2,3]]
 assert out==(want if result==0 else [77]*len(out))
base=[2,2,0,3,2,[2,0,0,2],[1,1<<127,128,0,0,-1,0]*6,[1<<127,128,0],[77]*6,[77],[77]*3,[77]*3]
invalid=[(0,-1),(1,-1),(2,-1),(0,1),(3,1),(4,1),(4,5),(5,[]),(6,[]),(7,[]),(8,[]),(9,[]),(10,[]),(11,[]),(7,[0,0,0]),(7,[-(1<<127),128,0]),(6,[9]+base[6][1:])]
for index,value in invalid:
 args=[x[:] if isinstance(x,list) else x for x in base];args[index]=value
 before=str(args)
 try:f(*args)
 except ValueError:pass
 else:raise AssertionError('invalid input accepted '+str(index))
 assert str(args)==before,('invalid input changed owners',index)
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify([cases,expected])});
 const built=await compileKernel({sourcePath:path.join(__dirname,'post_hnf_regulator_inputs.py')}),f=require(built.modulePath).pari_post_hnf_regulator_inputs;assert(f.nativeAvailable);
 for(const backend of ['javascript','gmp'])for(let i=0;i<cases.length;i++){
  const r=cases[i],e=expected[i].map(BigInt),make=n=>backend==='gmp'?f.createIntegerBuffer(n,64,Array(n).fill(77n)):Array(n).fill(77n),view=x=>Array.isArray(x)?x:x.toArray(),out=make(3*r.ru*r.z),h=make(1),z=make(3),state=[77n,77n,77n];
  const result=f[backend](...[r.kc,r.h,r.b,r.cols,r.ru].map(BigInt),r.H.map(BigInt),r.C.map(BigInt),[1n<<127n,128n,0n],out,h,z,state);
  assert.equal(result,e[0]);assert.deepEqual(state,[e[0],BigInt(r.z),e[0]===0n?1n:0n]);assert.deepEqual(view(h),result===0n?[e[1]]:[77n]);assert.deepEqual(view(z),result===0n?e.slice(2):[77n,77n,77n]);
  const want=Array.from({length:r.ru*r.z},(_,j)=>r.C.slice(7*j+1,7*j+4).map(BigInt)).flat();
  assert.deepEqual(view(out),result===0n?want:Array(3*r.ru*r.z).fill(77n),backend+' real_logs '+i);
 }
 for(const backend of ['javascript','gmp']){
  const values=[2n,2n,0n,3n,2n,[2n,0n,0n,2n],Array.from({length:6},()=>[1n,1n<<127n,128n,0n,0n,-1n,0n]).flat(),[1n<<127n,128n,0n],Array(6).fill(77n),[77n],Array(3).fill(77n),Array(3).fill(77n)];
  const invalid=[[0,-1n],[1,-1n],[2,-1n],[0,1n],[3,1n],[4,1n],[4,5n],[5,[]],[6,[]],[7,[]],[8,[]],[9,[]],[10,[]],[11,[]],[7,[0n,0n,0n]],[7,[-(1n<<127n),128n,0n]],[6,[9n,...values[6].slice(1)]]];
  for(const [index,value] of invalid){
   const args=values.map(x=>Array.isArray(x)?x.slice():x);args[index]=Array.isArray(value)?value.slice():value;
   if(backend==='gmp')for(let j=5;j<=10;j++)args[j]=f.createIntegerBuffer(args[j].length,64,args[j]);
   const snapshot=()=>args.map(x=>typeof x==='bigint'?x:Array.isArray(x)?x.slice():x.toArray()),before=snapshot();
   assert.throws(()=>f[backend](...args),undefined,backend+' invalid '+index);assert.deepEqual(snapshot(),before,backend+' atomic '+index);
  }
 }
 console.log(JSON.stringify({cases:cases.length,atomicGuardsPerBackend:17,sourceSha256:hash(source),traceSha256:hash(trace),coreBytes:fs.statSync(built.coreSourcePath).size,qualifiedTiming:false,syntheticOnly:true}));
})().catch(e=>{console.error(e);process.exitCode=1;});
