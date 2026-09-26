"use strict";
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{compileKernel}=require('../../tools/native-kernel/compiler.cjs');
(async()=>{
  const pari=path.resolve(process.argv[2]),lib=path.join(pari,'Olinux-x86_64'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-dbltor-'));
  const source=path.join(dir,'oracle.c'),exe=path.join(dir,'oracle');
  fs.writeFileSync(source,`#include "pari.h"
#include <stdint.h>
#include <inttypes.h>
int main(void){pari_init(16000000,10000);union{double f;uint64_t u;}d;
while(scanf("%" SCNx64,&d.u)==1){pari_sp av=avma;
pari_CATCH(CATCH_ALL){puts("overflow");}pari_TRY{long shift;GEN x=dbltor(d.f),m=signe(x)?mantissa_real(x,&shift):gen_0;pari_printf("%Ps %ld %ld\\n",m,signe(x)?bit_prec(x):0,expo(x));}pari_ENDCATCH;
avma=av;}pari_close();return 0;}`);
  const bits=[];
  for(let e=0;e<2048;e++)for(const f of [0n,1n,0xfffffffffffffn])for(const s of [0n,1n])bits.push(((s<<63n)|(BigInt(e)<<52n)|f).toString(16).padStart(16,'0'));
  for(let k=0;k<52;k++)for(const s of [0n,1n])bits.push(((s<<63n)|(1n<<BigInt(k))).toString(16).padStart(16,'0'));
  const cc=spawnSync('cc',['-O2','-I'+path.join(pari,'src/headers'),'-I'+lib,source,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-o',exe],{encoding:'utf8',timeout:30000});assert.equal(cc.status,0,cc.stderr);
  const run=spawnSync(exe,[],{input:bits.join('\n')+'\n',encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024});assert.equal(run.status,0,run.stderr);
  const rows=run.stdout.trim().split('\n');assert.equal(rows.length,bits.length);
  const py=spawnSync('python3',['-c',`
import sys,json,struct,importlib
sys.path[:0]=[${JSON.stringify(path.resolve(__dirname,'../..'))},${JSON.stringify(path.resolve(__dirname,'../../src/lib'))}]
f=importlib.import_module('bench.pari-class-group-port.float_conversion').pari_float_to_real
for bits,want in json.load(sys.stdin):
    value=struct.unpack('>d',bytes.fromhex(bits))[0]
    try:got=' '.join(map(str,f(value)))
    except OverflowError:got='overflow'
    assert got==want,(bits,want,got)
`],{input:JSON.stringify(bits.map((b,i)=>[b,rows[i]])),encoding:'utf8',timeout:30000});assert.equal(py.status,0,py.stderr);
  const built=await compileKernel({sourcePath:path.join(__dirname,'float_conversion.py')}),mod=require(built.modulePath);
  for(let i=0;i<bits.length;i++)for(const backend of ['javascript','gmp']){
    const value=Buffer.from(bits[i],'hex').readDoubleBE();
    if(rows[i]==='overflow')assert.throws(()=>mod.pari_float_to_real[backend](value),/dbltor/);
    else assert.deepEqual(mod.pari_float_to_real[backend](value),rows[i].split(' ').map(BigInt),`${backend}: ${bits[i]}`);
  }
  console.log(`${bits.length} binary64 ingress controls match PARI/CPython/JS/GMP, including subnormals, signed zero and nonfinite rejection`);
})().catch(error=>{console.error(error);process.exitCode=1;});
