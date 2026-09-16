"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{compileKernel}=require('../../tools/native-kernel/compiler.cjs');
(async()=>{
const pari=path.resolve(process.argv[2]),lib=path.join(pari,'Olinux-x86_64'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-smooth-insert-'));
const source=path.join(dir,'oracle.c'),exe=path.join(dir,'oracle');
fs.writeFileSync(source,`#include "${path.join(pari,'src/basemath/buch2.c')}"
int main(void){pari_init(16000000,10000);long contents[]={1,2,6,30};
for(long jid=1;jid<=3;jid++)for(long jid0=0;jid0<=3;jid0++)for(long ci=0;ci<4;ci++)for(long use=0;use<3;use++)for(long allowance=0;allowance<=2;allowance+=2){
pari_sp av=avma;RELCACHE_t C={0};C.basis=zero_Flm_copy(3,3);C.missing=3;C.relsup=allowance;reallocate(&C,8);C.last=C.base;
for(long repeat=0;repeat<2;repeat++){FB_t F={0};F.KC=3;F.subFB=mkvecsmall2(1,3);F.LP=mkvec3(mkvec5(stoi(2),gen_0,gen_1,gen_0,gen_0),mkvec5(stoi(3),gen_0,stoi(2),gen_0,gen_0),mkvec5(stoi(5),gen_0,gen_1,gen_0,gen_0));
FACT fact[5];fact[0].pr=1;fact[1].pr=2;fact[1].ex=2;GEN rex=use?(use==1?mkvecsmall2(-1,2):mkvecsmall2(0,0)):NULL,gx=mkcol3(stoi(2*contents[ci]),stoi(3*contents[ci]),stoi(5*contents[ci]));long e0=2,nz;
if(jid==jid0)add_to_fact(jid,1+e0,fact);else{add_to_fact(jid,1,fact);if(jid0)add_to_fact(jid0,e0,fact);}
GEN R=set_fact(&F,fact,rex,&nz),cgx=Z_content(gx);if(cgx){gx=Q_div_to_int(gx,cgx);long n=fact[0].pr;for(long i=1;i<=n;i++)fact_update(R,&F,fact[i].pr,cgx);if(rex)for(long i=1;i<lg(rex);i++)if(rex[i]){long t,ipr=F.subFB[i];for(t=1;t<=n;t++)if(fact[t].pr==ipr)break;if(t>n)fact_update(R,&F,ipr,cgx);}}
long before=C.last-C.base,k=add_rel_i(&C,R,nz,gx,0,0,NULL,use);
printf("[%ld,%ld,%ld,%ld,%ld,%ld,[",jid,jid0,contents[ci],use,fact[0].pr,nz);for(long i=1;i<=fact[0].pr;i++)printf("%s%ld",i==1?"":",",fact[i].pr);printf("],[");for(long i=1;i<=fact[0].pr;i++)printf("%s%ld",i==1?"":",",fact[i].ex);printf("],[");for(long i=1;i<=3;i++)pari_printf("%s%Ps",i==1?"":",",gel(gx,i));printf("],[");for(long i=1;i<=3;i++)printf("%s%ld",i==1?"":",",R[i]);printf("],%ld,%ld,%ld,%ld,%ld,%ld,[",repeat,k,(long)(C.last-C.base)>before,(long)(C.last-C.base),C.missing,C.relsup);for(long col=1;col<=3;col++)for(long row=1;row<=3;row++)printf("%s%lu",col==1&&row==1?"":",",uel(gel(C.basis,col),row));printf("],[");for(long j=1;j<=C.last-C.base;j++)for(long i=1;i<=3;i++)pari_printf("%s%Ps",j==1&&i==1?"":",",gel(C.base[j].m,i));printf("],[");for(long j=1;j<=C.last-C.base;j++)for(long i=1;i<=3;i++)printf("%s%ld",j==1&&i==1?"":",",C.base[j].R[i]);printf("],%ld]\\n",allowance);}delete_cache(&C);avma=av;}pari_close();return 0;}`);
const cc=spawnSync('cc',['-O2','-I'+path.join(pari,'src/headers'),'-I'+lib,source,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',exe],{encoding:'utf8',timeout:30000});assert.equal(cc.status,0,cc.stderr);
const run=spawnSync(exe,[],{encoding:'utf8',timeout:30000});assert.equal(run.status,0,run.stderr);const rows=run.stdout.trim().split('\n').map(JSON.parse);assert.equal(rows.length,576);
const py=spawnSync('python3',['-c',`
import sys,json,importlib
sys.path[:0]=sys.argv[1:3]
f=importlib.import_module('bench.pari-class-group-port.relation_insertion').pari_insert_smooth_relation
for row in json.load(sys.stdin):
    jid,jid0,c,use,count,nz,I,E,G,R,repeat,k,appended,last,missing,sup,B,stored,V,allowance=row
    if repeat==0:
        state=[0,8,3,allowance];basis=[0]*9;records=[0]*24;hashes=[0]*8;metadata=[0]*24;scratch=[0]*3;generators=[99]*24;progress=[0,0]
    indices=[2,0,0,0];exponents=[2,0,0,0];candidate=[2*c,3*c,5*c];relation=[0]*3
    got=f(jid,jid0,2,indices,exponents,1,[1,3],[-1,2] if use==1 else [0,0],2 if use else -1,[2,3,5],[1,2,1],candidate,relation,state,basis,records,hashes,metadata,scratch,generators,progress,use)
    assert progress[1]==(repeat+1 if use else 0)
    assert got==(k,appended,nz,count),(row,got)
    assert state==[last,8,missing,sup] and basis==B and records[:last*3]==V
    assert generators[:last*3]==stored and generators[last*3:]==[99]*(24-last*3)
    assert candidate==G and relation==R and indices[:count]==I and exponents[:count]==E
    candidate[0]=999
    assert generators[:last*3]==stored
    assert metadata[:last*3]==[v for i in range(last) for v in (i+1,0,0)]
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify(rows),encoding:'utf8',timeout:30000});assert.equal(py.status,0,py.stderr);
const built=await compileKernel({sourcePath:path.join(__dirname,'relation_insertion.py')}),mod=require(built.modulePath);
for(const backend of ['javascript','gmp']){let state,basis,records,hashes,metadata,scratch,generators,progress;
for(const row of rows){
 const [jid,jid0,c,use,count,nz,I,E,G,R,repeat,k,appended,last,missing,sup,B,stored,V,allowance]=row;
 if(repeat===0){state=[0,8,3,allowance].map(BigInt);basis=Array(9).fill(0n);records=Array(24).fill(0n);hashes=Array(8).fill(0n);metadata=Array(24).fill(0n);scratch=Array(3).fill(0n);generators=Array(24).fill(99n);progress=[0n,0n];}
 const indices=[2n,0n,0n,0n],exponents=indices.slice(),candidate=[2*c,3*c,5*c].map(BigInt),relation=[0n,0n,0n];
 const got=mod.pari_insert_smooth_relation[backend](BigInt(jid),BigInt(jid0),2n,indices,exponents,1n,[1n,3n],use===1?[-1n,2n]:[0n,0n],use?2n:-1n,[2n,3n,5n],[1n,2n,1n],candidate,relation,state,basis,records,hashes,metadata,scratch,generators,progress,BigInt(use));assert.equal(progress[1],BigInt(use?repeat+1:0));
 assert.deepEqual(got,[k,appended,nz,count].map(BigInt));assert.deepEqual(state,[last,8,missing,sup].map(BigInt));assert.deepEqual(basis,B.map(BigInt));assert.deepEqual(records.slice(0,last*3),V.map(BigInt));
 assert.deepEqual(generators.slice(0,last*3),stored.map(BigInt));assert(generators.slice(last*3).every(v=>v===99n));
 assert.deepEqual(candidate,G.map(BigInt));assert.deepEqual(relation,R.map(BigInt));assert.deepEqual(indices.slice(0,count),I.map(BigInt));assert.deepEqual(exponents.slice(0,count),E.map(BigInt));
 candidate[0]=999n;assert.deepEqual(generators.slice(0,last*3),stored.map(BigInt));
 assert.deepEqual(metadata.slice(0,last*3),Array.from({length:last},(_,i)=>[BigInt(i+1),0n,0n]).flat());
}}
assert(rows.some(r=>r[11]===0&&r[12]===1));assert(rows.some(r=>r[11]===-1&&r[12]===0));assert(rows.some(r=>r[11]>0));
console.log('576 connected normalization/cache transitions match PARI/CPython/JS/GMP; exact generators survive candidate reuse, including zero-return appends');
})().catch(e=>{console.error(e);process.exitCode=1;});
