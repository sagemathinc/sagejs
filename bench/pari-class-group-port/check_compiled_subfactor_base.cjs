"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{compileKernel}=require('../../tools/native-kernel/compiler.cjs');
(async()=>{
const pari=path.resolve(process.argv[2]),lib=path.join(pari,'Olinux-x86_64'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-subfb-'));
const source=path.join(dir,'oracle.c'),exe=path.join(dir,'oracle');
fs.writeFileSync(source,`#include "${path.join(pari,'src/basemath/buch2.c')}"
int main(void){pari_init(64000000,10000);const char *polys[]={"x^3-20018*x+20034","x^3-20010*x+20018","x^4-20018*x-20034","x^4-2000022*x-2000042"};long bounds[]={3,7,37,101},mins[]={0,2,10};
for(long f=0;f<4;f++){GEN nf=nfinit(gp_read_str(polys[f]),192);for(long bi=0;bi<4;bi++)for(long mi=0;mi<3;mi++)for(long pi=0;pi<2;pi++){
pari_sp av=avma;GRHcheck_t S;long n=nf_get_degree(nf);init_GRHcheck(&S,n,nf_get_r1(nf),dbllog2(absi_shallow(nf_get_disc(nf)))*M_LN2);FB_t F={0};FBgen(&F,nf,n,bounds[bi],bounds[bi],&S);double target=pi?1000000.:10.;
subFBgen(&F,cgetg(1,t_VEC),cgetg(1,t_VEC),target,mins[mi]);printf("%ld %ld %.17g",F.KC,mins[mi],target);
for(long j=1;j<=F.KC;j++)pari_printf(" %Ps %d",pr_norm(gel(F.LP,j)),bad_subFB(&F,j));
printf(" %ld %ld %ld",lg(F.subFB)-1,F.MAXDEPSIZESFB,F.MAXDEPSFB);
for(long j=1;j<lg(F.subFB);j++)printf(" %ld",F.subFB[j]);for(long j=1;j<=F.KC;j++)printf(" %ld",F.perm[j]);puts("");delete_FB(&F);free_GRHcheck(&S);avma=av;}}
pari_close();return 0;}`);
const cc=spawnSync('cc',['-O2','-I'+path.join(pari,'src/headers'),'-I'+lib,source,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',exe],{encoding:'utf8',timeout:30000});assert.equal(cc.status,0,cc.stderr);
const run=spawnSync(exe,[],{encoding:'utf8',timeout:30000});assert.equal(run.status,0,run.stderr);
const rows=run.stdout.trim().split('\n').map(line=>{const v=line.split(' '),size=Number(v[0]),norms=[],bad=[];let pos=3;for(let i=0;i<size;i++){norms.push(v[pos++]);bad.push(v[pos++]);}const result=v.slice(pos,pos+3);pos+=3;const chosen=v.slice(pos,pos+Number(result[0]));pos+=chosen.length;return {norms,bad,minimum:Number(v[1]),target:Number(v[2]),result,chosen,permutation:v.slice(pos)};});assert.equal(rows.length,96);
const py=spawnSync('python3',['-c',`
import sys,json,importlib
sys.path[:0]=[${JSON.stringify(path.resolve(__dirname,'../..'))},${JSON.stringify(path.resolve(__dirname,'../../src/lib'))}]
f=importlib.import_module('bench.pari-class-group-port.subfactor_base').pari_prepared_subfactor_base
for r in json.load(sys.stdin):
    n=len(r['norms']);order=[0]*n;scratch=[0]*n;chosen=[0]*n;rejected=[0]*n;perm=[0]*n
    got=f(list(map(int,r['norms'])),list(map(int,r['bad'])),[r['target']],r['minimum'],order,scratch,[0]*128,chosen,rejected,perm)
    assert list(got)==list(map(int,r['result'])),(r,got)
    assert chosen[:got[0]]==list(map(int,r['chosen']))
    assert perm==list(map(int,r['permutation'])),(r,perm)
`],{input:JSON.stringify(rows),encoding:'utf8',timeout:30000});assert.equal(py.status,0,py.stderr);
const built=await compileKernel({sourcePath:path.join(__dirname,'subfactor_base.py')}),mod=require(built.modulePath);
for(let size=0;size<=128;size++)for(let pattern=0;pattern<3;pattern++)for(const backend of ['javascript','gmp']){
 const norms=Array.from({length:size},(_,i)=>BigInt(pattern===0?size-i:pattern===1?i%3:(i*47+size)%19));
 const expected=norms.map((v,i)=>({v,i})).sort((a,b)=>a.v<b.v?-1:a.v>b.v?1:a.i-b.i).map(x=>BigInt(x.i+1));
 const order=Array(size).fill(0n);assert.equal(mod.pari_norm_indexsort[backend](norms,order,Array(size).fill(0n),Array(128).fill(0n)),BigInt(size));assert.deepEqual(order,expected);
}
for(const r of rows)for(const backend of ['javascript','gmp']){
 const n=r.norms.length,order=Array(n).fill(0n),scratch=order.slice(),chosen=order.slice(),rejected=order.slice(),perm=order.slice();
 const got=mod.pari_prepared_subfactor_base[backend](r.norms.map(BigInt),r.bad.map(BigInt),[r.target],BigInt(r.minimum),order,scratch,Array(128).fill(0n),chosen,rejected,perm);
 assert.deepEqual(got,r.result.map(BigInt));assert.deepEqual(chosen.slice(0,Number(got[0])),r.chosen.map(BigInt));assert.deepEqual(perm,r.permutation.map(BigInt));
}
console.log('96 prepared subFB selections, permutations and trial limits match actual PARI/CPython/JS/GMP; automorphism computation is outside this boundary');
console.log('387 reverse/tied/permuted index-sort controls match stable order in JS/GMP');
})().catch(e=>{console.error(e);process.exitCode=1;});
