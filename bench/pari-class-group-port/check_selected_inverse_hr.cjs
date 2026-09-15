"use strict";
// Prepared analytic-factor diagnostic: no class-group answer supplies this data.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {compileKernel}=require('../../tools/native-kernel/compiler.cjs');
function run(c,a,o={}){const r=spawnSync(c,a,{encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024,...o});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
(async()=>{
 const pari=path.resolve(process.argv[2]),archive=path.resolve(process.argv[3]),lib=path.join(pari,'Olinux-x86_64');
 assert.equal(createHash('sha256').update(fs.readFileSync(archive)).digest('hex'),'02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53');
 const pristine=run('tar',['-xOf',archive,'pari-2.17.4/src/basemath/buch2.c']);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-selected-invhr-')),file=path.join(dir,'oracle.c'),exe=path.join(dir,'oracle');
 fs.writeFileSync(path.join(dir,'buch2.c'),pristine);
 fs.writeFileSync(file,`#include "buch2.c"
static void triple(GEN x){long e;pari_printf("[\\"%Ps\\",\\"%ld\\",\\"%ld\\"]",mantissa_real(x,&e),bit_prec(x),expo(x));}
int main(void){pari_init(128000000,10000);const char *polys[]={"x^3-20018*x+20034","x^3-20010*x+20018","x^4-20018*x-20034","x^4-2000022*x-2000042"};
for(long f=0;f<4;f++){GEN nf=nfinit(gp_read_str(polys[f]),192),D=absi_shallow(nf_get_disc(nf));long n=nf_get_degree(nf),r1=nf_get_r1(nf),r2=nf_get_r2(nf),ru=r1+r2;double ld=dbllog2(D)*M_LN2;GRHcheck_t S;init_GRHcheck(&S,n,r1,ld);long bound=primeneeded(n,r1,r2,ld);cache_prime_dec(&S,bound,nf);GEN res=compute_invres(&S,bound),w=nfrootsof1(nf);w=gel(w,1);
GEN invhr=gmul(gdiv(gmul2n(powru(mppi(DEFAULTPREC),r2),ru),mulri(gsqrt(D,DEFAULTPREC),w)),res);
pari_printf("{\\"field\\":%ld,\\"degree\\":%ld,\\"r1\\":%ld,\\"r2\\":%ld,\\"discriminant\\":\\"%Ps\\",\\"rootsOfUnity\\":\\"%Ps\\",\\"residueBound\\":%ld,\\"inverseResidue\\":",f,n,r1,r2,D,w,bound);triple(res);printf(",\\"inverse_hr\\":");triple(invhr);puts("}");free_GRHcheck(&S);}pari_close();}`);
 run('cc',['-O1','-fsanitize=undefined','-fno-sanitize-recover=undefined','-I'+path.join(pari,'src/headers'),'-I'+lib,file,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',exe]);
 const trace=run(exe,[]),fields=trace.trim().split('\n').map(JSON.parse);
 run('python3',['-c',`import sys,json,importlib
sys.path[:0]=sys.argv[1:3]
f=importlib.import_module('bench.pari-class-group-port.regulator_normalization').pari_regulator_normalization
for r in json.load(sys.stdin):
 work=[[0]*3]+[[0]*8 for _ in range(4)]+[[0]*128]
 assert f(int(r['discriminant']),r['r1'],r['r2'],int(r['rootsOfUnity']),list(map(int,r['inverseResidue'])),*work)==tuple(map(int,r['inverse_hr']))
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify(fields)});
 if(!process.argv.includes('--export-fixtures')){
  const built=await compileKernel({sourcePath:path.join(__dirname,'regulator_normalization.py')}),f=require(built.modulePath).pari_regulator_normalization;
  for(const backend of ['javascript','gmp'])for(const r of fields){const make=n=>f.createIntegerBuffer(n,64);assert.deepEqual(f[backend](BigInt(r.discriminant),BigInt(r.r1),BigInt(r.r2),BigInt(r.rootsOfUnity),r.inverseResidue.map(BigInt),make(3),make(8),make(8),make(8),make(8),make(128)),r.inverse_hr.map(BigInt));}
 }
 const summary={fields,traceSha256:createHash('sha256').update(trace).digest('hex'),preparedResidue:true,usesClassGroupOracle:false,qualifiedTiming:false,artifactDirectory:dir};
 fs.writeFileSync(path.join(dir,'fixtures.json'),JSON.stringify(summary));console.log(JSON.stringify(summary));
})().catch(e=>{console.error(e);process.exitCode=1;});
