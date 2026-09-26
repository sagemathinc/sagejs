"use strict";
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { spawnSync } = require('node:child_process'), { createHash } = require('node:crypto');
const { compileKernel } = require('../../tools/native-kernel/compiler.cjs');
function run(cmd, args, options = {}) {
  const r = spawnSync(cmd, args, {encoding:'utf8',timeout:120000,maxBuffer:32*1024*1024,...options});
  assert.equal(r.status,0,r.stderr || String(r.error)); return r.stdout;
}
(async () => {
  const sum = process.argv.includes('--sum');
  const moduleName = sum ? 'integer_real_sum' : 'integer_real_product';
  const entry = sum ? 'pari_integer_real_sum' : 'pari_integer_real_product';
  const pari = path.resolve(process.argv[2]), lib = path.join(pari,'Olinux-x86_64');
  const archive = path.resolve(process.argv[3]);
  assert.equal(createHash('sha256').update(fs.readFileSync(archive)).digest('hex'),'02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53');
  const upstreamFile = 'src/kernel/none/' + (sum ? 'add.c' : 'mp_indep.c');
  const source = run('tar',['-xOf',archive,'pari-2.17.4/'+upstreamFile]);
  assert.equal(source,fs.readFileSync(path.join(pari,upstreamFile),'utf8'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-integer-real-')), c = path.join(dir,'oracle.c'), exe = path.join(dir,'oracle');
  fs.writeFileSync(c,`/* Differential oracle: PARI2.17.4 generic integer-real multiplication. */
#include "pari.h"
#include "paripriv.h"
_Static_assert(sizeof(long)==8,"64-bit pinned representation");
int main(void){pari_init(16000000,10000);setrand(stoi(271828));
if(MULRR_MULII_LIMIT!=3520)return 2;
long precisions[]={64,128,192,256,384,512,768,1024,2048,2176,2240,2304};
long sizes[]={0,1,63,64,65,127,128,129,191,192,193,255,256,257,511,512,513,1024,2048,4096};
for(long pi=0;pi<12;pi++)for(long si=0;si<20;si++)for(long variant=0;variant<8;variant++){
pari_sp av=avma;long p=precisions[pi],b=sizes[si],de,e=(variant%3-1)*107;
${sum ? 'if(p>512||b>1024)continue;' : ''}
GEN a=b?addii(int2n(b-1),randomi(int2n(b-1))):gen_0;
if(variant==0&&b)a=subis(int2n(b),1);
if(variant==1&&b)a=int2n(b-1);
if(variant%2)a=negi(a);
GEN m=addii(int2n(p-1),randomi(int2n(p-1)));
if(variant==2)m=subis(int2n(p),1);
if(variant==3)m=int2n(p-1);
if(variant%3==0)m=negi(m);
GEN y=itor(m,p);setexpo(y,e);
if(variant==7){m=gen_0;y=real_0_bit(e);}
GEN z=${sum ? 'gadd' : 'gmul'}(a,y);long zp=typ(z)==t_INT?-1:(signe(z)?bit_prec(z):0),ze=typ(z)==t_INT?0:expo(z);
GEN zm=typ(z)==t_INT?z:(signe(z)?mantissa_real(z,&de):gen_0);
pari_printf("%Ps %Ps %ld %ld %Ps %ld %ld\\n",a,m,variant==7?0:p,e,zm,zp,ze);avma=av;
}pari_close();return 0;}`);
  run('cc',['-O2','-I'+path.join(pari,'src/headers'),'-I'+lib,c,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',exe]);
  const trace=run(exe,[]), rows=trace.trim().split('\n').map(s=>s.split(' '));
  assert.equal(rows.length,sum ? 864 : 1920);
  run('python3',['-c',`import sys,json,importlib
sys.path[:0]=sys.argv[1:3]
f=getattr(importlib.import_module('bench.pari-class-group-port.${moduleName}'),'${entry}')
for row in json.load(sys.stdin):
 v=list(map(int,row));got=f(*v[:4]);assert got==tuple(v[4:]),(v,got)
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify(rows)});
  if(process.argv.includes('--cpython-only')){console.log(JSON.stringify({cases:rows.length,partial:true}));return;}
  const built=await compileKernel({sourcePath:path.join(__dirname,moduleName+'.py')});
  const f=require(built.modulePath)[entry];assert(f.nativeAvailable);
  for(const backend of ['javascript','gmp'])for(const row of rows){const v=row.map(BigInt);assert.deepEqual(f[backend](...v.slice(0,4)),v.slice(4),backend+': '+row);}
  for(const backend of ['javascript','gmp'])for(const args of [[2n,1n,64n,0n],[2n,1n<<2367n,2368n,0n]])assert.throws(()=>f[backend](...args));
  console.log(JSON.stringify({operation:sum?'sum':'product',cases:rows.length,backends:['PARI','CPython','javascript','gmp'],sourceSha256:createHash('sha256').update(source).digest('hex'),traceSha256:createHash('sha256').update(trace).digest('hex'),coreBytes:fs.statSync(built.coreSourcePath).size}));
})().catch(e=>{console.error(e);process.exitCode=1;});
