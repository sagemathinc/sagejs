"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{compileKernel}=require('../../tools/native-kernel/compiler.cjs');
(async()=>{
const pari=path.resolve(process.argv[2]),lib=path.join(pari,'Olinux-x86_64'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-initrel-'));
const source=path.join(dir,'oracle.c'),exe=path.join(dir,'oracle');
fs.writeFileSync(source,`#include "${path.join(pari,'src/basemath/buch2.c')}"
int main(void){pari_init(64000000,10000);const char *polys[]={"x^3-20018*x+20034","x^3-20010*x+20018","x^4-20018*x-20034","x^4-2000022*x-2000042"};long bounds[]={7,37,101};
for(long f=0;f<4;f++){GEN nf=nfinit(gp_read_str(polys[f]),192);for(long bi=0;bi<3;bi++)for(long add=0;add<=3;add+=3){
pari_sp av=avma;GRHcheck_t S;long n=nf_get_degree(nf);init_GRHcheck(&S,n,nf_get_r1(nf),dbllog2(absi_shallow(nf_get_disc(nf)))*M_LN2);FB_t F={0};FBgen(&F,nf,n,bounds[bi],bounds[bi],&S);subFBgen(&F,cgetg(1,t_VEC),cgetg(1,t_VEC),10.,2);RELCACHE_t C={0};C.basis=zero_Flm_copy(F.KC,F.KC);init_rel(&C,&F,add);
printf("[%ld,%ld",F.KC,add);
for(long which=0;which<4;which++){printf(",[");for(long i=1;i<=F.KCZ;i++){long p=F.FB[i];GEN P=gel(F.LV,p);long v=which==0?p:which==1?F.iLP[p]:which==2?lg(P)-1:isclone(P);printf("%s%ld",i==1?"":",",v);}printf("]");}
printf(",[");for(long i=1;i<=F.KC;i++)printf("%s%ld",i==1?"":",",pr_get_e(gel(F.LP,i)));printf("]");
long last=C.last-C.base;printf(",[%ld,%lu,%lu,%ld,%ld,%ld],[",last,(ulong)C.len,C.missing,C.relsup,(long)(C.chk-C.base),(long)(C.end-C.base));
for(long col=1;col<=F.KC;col++)for(long row=1;row<=F.KC;row++)printf("%s%lu",col==1&&row==1?"":",",uel(gel(C.basis,col),row));printf("],[");
for(long i=1;i<=last;i++)printf("%s%ld",i==1?"":",",C.base[i].nz);printf("],[");
for(long i=1;i<=last;i++)for(long j=1;j<=F.KC;j++)printf("%s%ld",i==1&&j==1?"":",",C.base[i].R[j]);printf("],[");
for(long i=1;i<=last;i++)pari_printf("%s%Ps",i==1?"":",",C.base[i].m);printf("]]\\n");delete_cache(&C);delete_FB(&F);free_GRHcheck(&S);avma=av;}}
pari_close();return 0;}`);
const cc=spawnSync('cc',['-O2','-I'+path.join(pari,'src/headers'),'-I'+lib,source,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',exe],{encoding:'utf8',timeout:30000});assert.equal(cc.status,0,cc.stderr);
const run=spawnSync(exe,[],{encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024});assert.equal(run.status,0,run.stderr);
const rows=run.stdout.trim().split('\n').map(JSON.parse);assert.equal(rows.length,24);
const py=spawnSync('python3',['-c',`
import sys,json,importlib
sys.path[:0]=[${JSON.stringify(path.resolve(__dirname,'../..'))},${JSON.stringify(path.resolve(__dirname,'../../src/lib'))}]
f=importlib.import_module('bench.pari-class-group-port.relation_cache').pari_prepared_initialize_relations
owned=importlib.import_module('bench.pari-class-group-port.relation_insertion').pari_initialize_owned_relations
for case_index,r in enumerate(json.load(sys.stdin)):
    n,additional,primes,offsets,counts,complete,ramification,want,B,H,R,M=r
    capacity=10*(n+additional)+50;state=[99]*6;basis=[99]*(n*n);records=[0]*(capacity*n);hashes=[0]*capacity;metadata=[0]*(capacity*3)
    got=f(additional,primes,offsets,counts,complete,ramification,state,basis,records,hashes,metadata,[0]*n,[0]*n)
    assert got==want[0] and state==want
    assert basis==B and hashes[:got]==H and records[:got*n]==R
    assert metadata[:got*3:3]==M
    degree=3 if case_index<12 else 4
    bank=[99]*(capacity*degree)
    got=owned(additional,primes,offsets,counts,complete,ramification,state,basis,records,hashes,metadata,[0]*n,[0]*n,degree,bank)
    assert got==want[0] and state==want and basis==B
    assert hashes[:got]==H and records[:got*n]==R
    assert metadata[:got*3:3]==list(range(1,got+1))
    assert bank[:got*degree]==[x for p in M for x in [p]+[0]*(degree-1)]
    assert all(x==99 for x in bank[got*degree:])
`],{input:JSON.stringify(rows),encoding:'utf8',timeout:30000});assert.equal(py.status,0,py.stderr);
const built=await compileKernel({sourcePath:path.join(__dirname,'relation_cache.py')}),mod=require(built.modulePath);
const ownedBuilt=await compileKernel({sourcePath:path.join(__dirname,'relation_insertion.py')}),ownedMod=require(ownedBuilt.modulePath);
for(const [caseIndex,r] of rows.entries())for(const backend of ['javascript','gmp']){
 const [n,additional,...rest]=r,[primes,offsets,counts,complete,ramification,want,B,H,R,M]=rest,capacity=10*(n+additional)+50;
 const state=Array(6).fill(99n),basis=Array(n*n).fill(99n),records=Array(capacity*n).fill(0n),hashes=Array(capacity).fill(0n),metadata=Array(capacity*3).fill(0n);
 const got=mod.pari_prepared_initialize_relations[backend](BigInt(additional),...rest.slice(0,5).map(a=>a.map(BigInt)),state,basis,records,hashes,metadata,Array(n).fill(0n),Array(n).fill(0n));
 assert.equal(got,BigInt(want[0]));assert.deepEqual(state,want.map(BigInt));assert.deepEqual(basis,B.map(BigInt));assert.deepEqual(hashes.slice(0,Number(got)),H.map(BigInt));assert.deepEqual(records.slice(0,Number(got)*n),R.map(BigInt));assert.deepEqual(Array.from({length:Number(got)},(_,i)=>metadata[3*i]),M.map(BigInt));
 const degree=caseIndex<12?3:4,bank=Array(capacity*degree).fill(99n);
 const args=[BigInt(additional),...rest.slice(0,5).map(a=>a.map(BigInt)),state,basis,records,hashes,metadata,Array(n).fill(0n),Array(n).fill(0n),BigInt(degree),bank];
 assert.equal(ownedMod.pari_initialize_owned_relations[backend](...args),got);
 assert.deepEqual(state,want.map(BigInt));assert.deepEqual(basis,B.map(BigInt));
 assert.deepEqual(records.slice(0,Number(got)*n),R.map(BigInt));assert.deepEqual(hashes.slice(0,Number(got)),H.map(BigInt));
 assert.deepEqual(Array.from({length:Number(got)},(_,i)=>metadata[3*i]),Array.from({length:Number(got)},(_,i)=>BigInt(i+1)));
 assert.deepEqual(bank.slice(0,Number(got)*degree),M.flatMap(p=>[BigInt(p),...Array(degree-1).fill(0n)]));assert(bank.slice(Number(got)*degree).every(x=>x===99n));
 const snapshot=JSON.stringify([state,basis,records,hashes,metadata],(_,v)=>typeof v==='bigint'?String(v):v);
 assert.throws(()=>ownedMod.pari_initialize_owned_relations[backend](...args.slice(0,-1),[]),/invalid initial generator allocation/);
 assert.equal(JSON.stringify([state,basis,records,hashes,metadata],(_,v)=>typeof v==='bigint'?String(v):v),snapshot);
}
console.log('24 relation-cache initializations and owned generator banks match PARI/CPython/JS/GMP; row IDs, unused slots and allocation guards checked');
})().catch(e=>{console.error(e);process.exitCode=1;});
