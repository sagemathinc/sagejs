"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{compileKernel}=require('../../tools/native-kernel/compiler.cjs');
(async()=>{
const factMode=process.argv.includes('--fact');
const pari=path.resolve(process.argv[2]),lib=path.join(pari,'Olinux-x86_64'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-relcache-'));
const source=path.join(dir,'oracle.c'),exe=path.join(dir,'oracle');
fs.writeFileSync(source,`#include "${path.join(pari,'src/basemath/buch2.c')}"
int main(void){pari_init(64000000,10000);long dims[]={2,3,5,8};
for(long d=0;d<4;d++)for(long allowance=0;allowance<=2;allowance+=2){long n=dims[d];RELCACHE_t C={0};C.basis=zero_Flm_copy(n,n);C.missing=n;C.relsup=allowance;reallocate(&C,64);C.last=C.base;
GEN prior=zero_Flv(n);
for(long step=0;step<24;step++){GEN R=zero_Flv(n);long nz=n+1;
${factMode?`FACT fact[4];fact[0].pr=step%4;for(long j=1;j<=fact[0].pr;j++){fact[j].pr=(step+j)%n+1;fact[j].ex=(step*3+j)%5-2;}
FB_t F={0};F.KC=n;F.subFB=mkvecsmall2(1,n);GEN extra=step%6==0?NULL:mkvecsmall2(step%3-1,1-step%3);R=set_fact(&F,fact,extra,&nz);`:
`for(long j=1;j<=n;j++){R[j]=step>=1&&step<=3?(j==1?step:0):step%7==0?0:step%5==0?prior[j]:(step*7+j*3+step*j)%7-3;if(R[j]&&nz==n+1)nz=j;}`}prior=R;
long before=C.last-C.base,gen=step%3!=0,rnd=step%2,k;
pari_CATCH(e_INV){k=-999;}pari_TRY{k=add_rel_i(&C,R,nz,gen?gen_1:NULL,0,0,NULL,rnd);}pari_ENDCATCH;
printf("[%ld,%ld,%ld,%ld,%ld,%ld,%ld,%ld,%ld,%ld,[",n,allowance,step,k,(long)(C.last-C.base),C.missing,C.relsup,nz,gen,rnd);
for(long j=1;j<=n;j++)printf("%s%ld",j==1?"":",",R[j]);printf("],[");
for(long col=1;col<=n;col++)for(long row=1;row<=n;row++)printf("%s%lu",col==1&&row==1?"":",",uel(gel(C.basis,col),row));printf("],[");
for(long j=1;j<=C.last-C.base;j++)printf("%s%ld",j==1?"":",",C.base[j].nz);printf("],[");
for(long j=1;j<=C.last-C.base;j++)for(long row=1;row<=n;row++)printf("%s%ld",j==1&&row==1?"":",",C.base[j].R[row]);printf("],%d]\\n",C.last-C.base>before);
}delete_cache(&C);}pari_close();return 0;}`);
const cc=spawnSync('cc',['-O2','-I'+path.join(pari,'src/headers'),'-I'+lib,source,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',exe],{encoding:'utf8',timeout:30000});assert.equal(cc.status,0,cc.stderr);
const run=spawnSync(exe,[],{encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024});assert.equal(run.status,0,run.stderr);
const rows=run.stdout.trim().split('\n').map(JSON.parse);assert.equal(rows.length,192);
if(factMode)assert.deepEqual(rows.filter(r=>r[3]===-999).map(r=>r.slice(0,3)),[[2,[2,5]],[5,[3,5,10]],[8,[2,5,10,11]]].flatMap(([n,steps])=>[0,2].flatMap(allowance=>steps.map(step=>[n,allowance,step]))));
if(!factMode){assert(rows.some(r=>r[3]===-1));
assert(rows.some(r=>r[3]===0&&r[14]===0));
assert(rows.some(r=>r[3]===0&&r[14]===1));
assert(rows.some(r=>r[3]>0));}
const py=spawnSync('python3',['-c',`
import sys,json,importlib
sys.path[:0]=[${JSON.stringify(path.resolve(__dirname,'../..'))},${JSON.stringify(path.resolve(__dirname,'../../src/lib'))}]
f=importlib.import_module('bench.pari-class-group-port.relation_cache').pari_prepared_add_relation
insert=importlib.import_module('bench.pari-class-group-port.relation_cache').pari_prepared_insert_fact
for r in json.load(sys.stdin):
    n,allowance,step,k,last,missing,sup,nz,gen,rnd,R,B,H,V,added=r
    if step==0:state=[0,64,n,allowance];basis=[0]*(n*n);records=[0]*(64*n);hashes=[0]*64;metadata=[0]*192;scratch=[0]*n
    if ${factMode?'True':'False'}:
        indices=[(step+j)%n+1 for j in range(1,step%4+1)];exponents=[(step*3+j)%5-2 for j in range(1,step%4+1)];output=[99]*n
        try:
            result=insert(indices,exponents,len(indices),[1,n],[step%3-1,1-step%3],-1 if step%6==0 else 2,gen,rnd,state,basis,records,hashes,metadata,output,scratch)
            assert result[2]==nz
            got=result[:2]
        except ZeroDivisionError as error:
            assert str(error)=='noninvertible relation pivot'
            got=(-999,0)
        assert output==R
    else:got=f(R,nz,gen,0,0,rnd,state,basis,records,hashes,metadata,scratch)
    assert got==(k,added),(n,allowance,step,got,k,added)
    assert state==[last,64,missing,sup],(r,state)
    assert basis==B,(n,step,basis,B)
    assert hashes[:last]==H and records[:last*n]==V
`],{input:JSON.stringify(rows),encoding:'utf8',timeout:30000});assert.equal(py.status,0,py.stderr);
const built=await compileKernel({sourcePath:path.join(__dirname,'relation_cache.py')}),mod=require(built.modulePath);
for(const backend of ['javascript','gmp']){let state,basis,records,hashes,metadata,scratch;for(const r of rows){const [n,allowance,step,k,last,missing,sup,nz,gen,rnd,R,B,H,V,added]=r;
if(step===0){state=[0,64,n,allowance].map(BigInt);basis=Array(n*n).fill(0n);records=Array(64*n).fill(0n);hashes=Array(64).fill(0n);metadata=Array(192).fill(0n);scratch=Array(n).fill(0n);}
let got;
if(factMode){const indices=Array.from({length:step%4},(_,i)=>BigInt((step+i+1)%n+1)),exponents=Array.from({length:step%4},(_,i)=>BigInt((step*3+i+1)%5-2)),output=Array(n).fill(99n);
 const invoke=()=>mod.pari_prepared_insert_fact[backend](indices,exponents,BigInt(indices.length),[1n,BigInt(n)],[BigInt(step%3-1),BigInt(1-step%3)],step%6===0?-1n:2n,BigInt(gen),BigInt(rnd),state,basis,records,hashes,metadata,output,scratch);
 if(k===-999){assert.throws(invoke,/noninvertible relation pivot/);got=[-999n,0n];}else{const result=invoke();assert.equal(result[2],BigInt(nz));got=result.slice(0,2);}assert.deepEqual(output,R.map(BigInt));
}else got=mod.pari_prepared_add_relation[backend](R.map(BigInt),BigInt(nz),BigInt(gen),0n,0n,BigInt(rnd),state,basis,records,hashes,metadata,scratch);
assert.deepEqual(got,[k,added].map(BigInt));assert.deepEqual(state,[last,64,missing,sup].map(BigInt));assert.deepEqual(basis,B.map(BigInt));assert.deepEqual(hashes.slice(0,last),H.map(BigInt));assert.deepEqual(records.slice(0,last*n),V.map(BigInt));
}}
console.log(factMode?'192 connected set_fact/add_rel_i transitions match PARI/CPython/JS/GMP: 174 returns and 18 matched upstream failures':'192 resident add_rel_i transitions match PARI/CPython/JS/GMP, including signed vectors and duplicate/zero/dependent paths');
if(factMode)console.log(JSON.stringify({upstreamInverseFailures:rows.filter(r=>r[3]===-999).map(r=>r.slice(0,3))}));
})().catch(e=>{console.error(e);process.exitCode=1;});
