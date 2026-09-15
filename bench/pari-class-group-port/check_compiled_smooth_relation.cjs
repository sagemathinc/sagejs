"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{compileKernel}=require('../../tools/native-kernel/compiler.cjs');
(async()=>{
const pari=path.resolve(process.argv[2]),lib=path.join(pari,'Olinux-x86_64'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-smooth-rel-'));
const source=path.join(dir,'oracle.c'),exe=path.join(dir,'oracle');
fs.writeFileSync(source,`#include "${path.join(pari,'src/basemath/buch2.c')}"
int main(void){pari_init(16000000,10000);long contents[]={1,2,6,30};
for(long jid=1;jid<=3;jid++)for(long jid0=0;jid0<=3;jid0++)for(long ci=0;ci<4;ci++)for(long use=0;use<2;use++){
pari_sp av=avma;FB_t F={0};F.KC=3;F.subFB=mkvecsmall2(1,3);F.LP=mkvec3(mkvec5(stoi(2),gen_0,gen_1,gen_0,gen_0),mkvec5(stoi(3),gen_0,stoi(2),gen_0,gen_0),mkvec5(stoi(5),gen_0,gen_1,gen_0,gen_0));
FACT fact[5];fact[0].pr=1;fact[1].pr=2;fact[1].ex=2;GEN rex=use?mkvecsmall2(-1,2):NULL,gx=mkcol3(stoi(2*contents[ci]),stoi(3*contents[ci]),stoi(5*contents[ci]));long e0=2,nz;
if(jid==jid0)add_to_fact(jid,1+e0,fact);else{add_to_fact(jid,1,fact);if(jid0)add_to_fact(jid0,e0,fact);}
GEN R=set_fact(&F,fact,rex,&nz),cgx=Z_content(gx);if(cgx){gx=Q_div_to_int(gx,cgx);long n=fact[0].pr;for(long i=1;i<=n;i++)fact_update(R,&F,fact[i].pr,cgx);if(rex)for(long i=1;i<lg(rex);i++)if(rex[i]){long t,ipr=F.subFB[i];for(t=1;t<=n;t++)if(fact[t].pr==ipr)break;if(t>n)fact_update(R,&F,ipr,cgx);}}
printf("[%ld,%ld,%ld,%ld,%ld,%ld,[",jid,jid0,contents[ci],use,fact[0].pr,nz);for(long i=1;i<=fact[0].pr;i++)printf("%s%ld",i==1?"":",",fact[i].pr);printf("],[");for(long i=1;i<=fact[0].pr;i++)printf("%s%ld",i==1?"":",",fact[i].ex);printf("],[");for(long i=1;i<=3;i++)pari_printf("%s%Ps",i==1?"":",",gel(gx,i));printf("],[");for(long i=1;i<=3;i++)printf("%s%ld",i==1?"":",",R[i]);puts("]]");avma=av;}pari_close();return 0;}`);
const cc=spawnSync('cc',['-O2','-I'+path.join(pari,'src/headers'),'-I'+lib,source,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',exe],{encoding:'utf8',timeout:30000});assert.equal(cc.status,0,cc.stderr);
const run=spawnSync(exe,[],{encoding:'utf8',timeout:30000});assert.equal(run.status,0,run.stderr);const rows=run.stdout.trim().split('\n').map(JSON.parse);assert.equal(rows.length,96);
const py=spawnSync('python3',['-c',`
import sys,json,importlib
sys.path[:0]=[${JSON.stringify(path.resolve(__dirname,'../..'))},${JSON.stringify(path.resolve(__dirname,'../../src/lib'))}]
f=importlib.import_module('bench.pari-class-group-port.smooth_relation').pari_prepared_smooth_relation
for jid,jid0,c,use,count,nz,I,E,G,R in json.load(sys.stdin):
    indices=[2,0,0,0];exponents=[2,0,0,0];candidate=[2*c,3*c,5*c];relation=[0]*3
    got=f(jid,jid0,2,indices,exponents,1,[1,3],[-1,2],2 if use else -1,[2,3,5],[1,2,1],candidate,relation)
    assert got==(count,nz,c)
    assert indices[:count]==I and exponents[:count]==E and candidate==G and relation==R
`],{input:JSON.stringify(rows),encoding:'utf8',timeout:30000});assert.equal(py.status,0,py.stderr);
const built=await compileKernel({sourcePath:path.join(__dirname,'smooth_relation.py')}),mod=require(built.modulePath);
for(const [jid,jid0,c,use,count,nz,I,E,G,R] of rows)for(const backend of ['javascript','gmp']){
 const indices=[2n,0n,0n,0n],exponents=indices.slice(),candidate=[2*c,3*c,5*c].map(BigInt),relation=[0n,0n,0n];
 const got=mod.pari_prepared_smooth_relation[backend](BigInt(jid),BigInt(jid0),2n,indices,exponents,1n,[1n,3n],[-1n,2n],use?2n:-1n,[2n,3n,5n],[1n,2n,1n],candidate,relation);
 assert.deepEqual(got,[count,nz,c].map(BigInt));assert.deepEqual(indices.slice(0,count),I.map(BigInt));assert.deepEqual(exponents.slice(0,count),E.map(BigInt));assert.deepEqual(candidate,G.map(BigInt));assert.deepEqual(relation,R.map(BigInt));
}
console.log('96 post-factorization assembly/content-normalization cases match PARI/CPython/JS/GMP');
})().catch(e=>{console.error(e);process.exitCode=1;});
