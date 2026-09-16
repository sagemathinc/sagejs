"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {compileKernel}=require('../../tools/native-kernel/compiler.cjs');
function run(c,a,o={}){const r=spawnSync(c,a,{encoding:'utf8',timeout:180000,maxBuffer:64*1024*1024,...o});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
(async()=>{
 const pari=path.resolve(process.argv[2]),lib=path.join(pari,'Olinux-x86_64');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-bestappr-')),file=path.join(dir,'oracle.c'),exe=path.join(dir,'oracle');
 fs.writeFileSync(file,`#include "pari.h"
static void result(GEN y){
 if(typ(y)==t_VEC&&lg(y)==1)printf("\\"1\\",\\"0\\",\\"-1\\",\\"0\\"");
 else if(typ(y)==t_INT)pari_printf("\\"0\\",\\"%Ps\\",\\"-1\\",\\"0\\"",y);
 else pari_printf("\\"0\\",\\"%Ps\\",\\"-2\\",\\"%Ps\\"",gel(y,1),gel(y,2));puts("]");
}
int main(void){
 pari_init(64000000,1000);setrand(stoi(271828));long ps[]={64,128,192,384};
 for(long pi=0;pi<4;pi++)for(long i=0;i<42;i++)for(long k=1;k<=10000;k*=10){
  pari_sp av=avma;long p=ps[pi],e=i<40?i-20:p+i-40;
  GEN m=addii(int2n(p-1),randomi(int2n(p-1)));if(i%2)m=negi(m);if(i==0)m=gen_0;if(i==1)m=int2n(p-1);
  GEN x=itor(m,p);setexpo(x,e);GEN y=bestappr(x,stoi(k));
  pari_printf("[\\"%Ps\\",\\"%ld\\",\\"%ld\\",\\"%ld\\",",m,signe(m)?p:0,e,k);result(y);avma=av;
 }
 for(long n=-31;n<=31;n++)for(long d=2;d<=29;d++)for(long k=1;k<=100;k*=10){
  pari_sp av=avma;GEN x=gdiv(stoi(n),stoi(d));if(typ(x)==t_FRAC){
   pari_printf("[\\"%Ps\\",\\"-2\\",\\"%Ps\\",\\"%ld\\",",gel(x,1),gel(x,2),k);result(bestappr(x,stoi(k)));
  }avma=av;
 }pari_close();return 0;
}`);
 run('cc',['-O1','-fsanitize=undefined','-fno-sanitize-recover=undefined','-I'+path.join(pari,'src/headers'),'-I'+lib,file,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',exe]);
 const trace=run(exe,[]),rows=trace.trim().split('\n').map(JSON.parse);
 run('python3',['-c',`import sys,json,importlib
sys.path[:0]=sys.argv[1:3];m=importlib.import_module('bench.pari-class-group-port.regulator_bestappr')
for i,r in enumerate(json.load(sys.stdin)):
 v=list(map(int,r));got=(0,*m.pari_regulator_bestappr_fraction(v[0],v[2],v[3])) if v[1]==-2 else m.pari_regulator_bestappr_real(*v[:4]);assert got==tuple(v[4:]),(i,v,got)
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify(rows)});
 const summary={cases:rows.length,traceSha256:createHash('sha256').update(trace).digest('hex'),ubsan:true,qualifiedTiming:false};
 if(process.argv.includes('--source-only')){console.log(JSON.stringify(summary));return;}
 const built=await compileKernel({sourcePath:path.join(__dirname,'regulator_bestappr.py')}),mod=require(built.modulePath),f=mod.pari_regulator_bestappr_real,g=mod.pari_regulator_bestappr_fraction;assert(f.nativeAvailable&&g.nativeAvailable);
 for(const backend of ['javascript','gmp'])for(let i=0;i<rows.length;i++){const r=rows[i].map(BigInt),got=r[1]===-2n?[0n,...g[backend](r[0],r[2],r[3])]:f[backend](...r.slice(0,4));assert.deepEqual(got,r.slice(4),backend+' '+i);}
 console.log(JSON.stringify({...summary,coreBytes:fs.statSync(built.coreSourcePath).size}));
})().catch(e=>{console.error(e);process.exitCode=1;});
