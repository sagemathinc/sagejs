"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{compileKernel}=require('../../tools/native-kernel/compiler.cjs');
(async()=>{
const pari=path.resolve(process.argv[2]),lib=path.join(pari,'Olinux-x86_64'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-subfb-change-'));
const source=path.join(dir,'oracle.c'),exe=path.join(dir,'oracle');
fs.writeFileSync(source,`#include "${path.join(pari,'src/basemath/buch2.c')}"
int main(void){pari_init(64000000,10000);const char *polys[]={"x^3-20018*x+20034","x^3-20010*x+20018","x^4-20018*x-20034","x^4-2000022*x-2000042"};
for(long f=0;f<4;f++){GEN nf=nfinit(gp_read_str(polys[f]),192);for(long pref=0;pref<6;pref++)for(long mode=1;mode<=2;mode++){
pari_sp av=avma;GRHcheck_t S;long n=nf_get_degree(nf);init_GRHcheck(&S,n,nf_get_r1(nf),dbllog2(absi_shallow(nf_get_disc(nf)))*M_LN2);FB_t F={0};FBgen(&F,nf,n,37,37,&S);subFBgen(&F,cgetg(1,t_VEC),cgetg(1,t_VEC),10.,2);F.sfb_chg=mode;
if(pref==5){GEN all=cgetg(F.KC+1,t_VECSMALL);long end=1;for(long j=1;j<=F.KC;j++)if(!bad_subFB(&F,j))all[end++]=j;setlg(all,end);assign_subFB(&F,all,end);}
if(pref==0)F.L_jid=NULL;else{long count=pref==1?0:pref==2?2:F.KC;F.L_jid=cgetg(count+1,t_VECSMALL);for(long j=1;j<=count;j++)F.L_jid[j]=pref>=4?j:F.KC+1-j;}
long pc=F.L_jid?lg(F.L_jid)-1:-1,old=lg(F.subFB)-1;printf("%ld %ld %ld %ld",F.KC,old,mode,pc);
for(long j=1;j<=F.KC;j++)printf(" %d",bad_subFB(&F,j));for(long j=1;j<=F.KC;j++)printf(" %ld",F.perm[j]);for(long j=1;j<=pc;j++)printf(" %ld",F.L_jid[j]);for(long j=1;j<=old;j++)printf(" %ld",F.subFB[j]);
GEN before=F.subFB;long ok=subFB_change(&F);printf(" %ld %d %ld %d %ld %ld",ok,before!=F.subFB,lg(F.subFB)-1,F.sfb_chg,F.MAXDEPSIZESFB,F.MAXDEPSFB);for(long j=1;j<lg(F.subFB);j++)printf(" %ld",F.subFB[j]);puts("");delete_FB(&F);free_GRHcheck(&S);avma=av;}}
pari_close();return 0;}`);
const cc=spawnSync('cc',['-O2','-I'+path.join(pari,'src/headers'),'-I'+lib,source,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',exe],{encoding:'utf8',timeout:30000});assert.equal(cc.status,0,cc.stderr);
const run=spawnSync(exe,[],{encoding:'utf8',timeout:30000});assert.equal(run.status,0,run.stderr);
const rows=run.stdout.trim().split('\n').map(line=>{const v=line.split(' ');let pos=4;const size=Number(v[0]),old=Number(v[1]),mode=Number(v[2]),pc=Number(v[3]);const take=n=>{const a=v.slice(pos,pos+n);pos+=n;return a;};const bad=take(size),perm=take(size),pref=take(Math.max(0,pc)),current=take(old),result=take(2),state=take(4),after=take(Number(state[0]));assert.equal(pos,v.length);return {size,old,mode,pc,bad,perm,pref,current,result,state,after};});assert.equal(rows.length,48);
assert.equal(rows.filter(r=>r.result[0]==='0').length,4);
assert(rows.some(r=>r.result[0]==='1'&&r.result[1]==='0'));
assert(rows.some(r=>r.result[1]==='1'));
const py=spawnSync('python3',['-c',`
import sys,json,importlib
sys.path[:0]=[${JSON.stringify(path.resolve(__dirname,'../..'))},${JSON.stringify(path.resolve(__dirname,'../../src/lib'))}]
f=importlib.import_module('bench.pari-class-group-port.subfactor_base').pari_prepared_subfactor_change
for r in json.load(sys.stdin):
    current=list(map(int,r['current']))+[0]*(r['size']+1-r['old']);state=[r['old'],r['mode'],16*r['old'],16*r['old']//10]
    got=f(list(map(int,r['bad'])),list(map(int,r['perm'])),list(map(int,r['pref'])),r['pc'],current,state,[0]*(r['size']+1),[0]*r['size'])
    assert list(got)==list(map(int,r['result'])),(r,got)
    assert state==list(map(int,r['state']))
    assert current[:state[0]]==list(map(int,r['after']))
`],{input:JSON.stringify(rows),encoding:'utf8',timeout:30000});assert.equal(py.status,0,py.stderr);
const built=await compileKernel({sourcePath:path.join(__dirname,'subfactor_base.py')}),mod=require(built.modulePath);
for(const r of rows)for(const backend of ['javascript','gmp']){
 const current=[...r.current.map(BigInt),...Array(r.size+1-r.old).fill(0n)],state=[r.old,r.mode,r.old*16,Math.floor(r.old*16/10)].map(BigInt);
 const got=mod.pari_prepared_subfactor_change[backend](r.bad.map(BigInt),r.perm.map(BigInt),r.pref.map(BigInt),BigInt(r.pc),current,state,Array(r.size+1).fill(0n),Array(r.size).fill(0n));
 assert.deepEqual(got,r.result.map(BigInt));assert.deepEqual(state,r.state.map(BigInt));assert.deepEqual(current.slice(0,Number(state[0])),r.after.map(BigInt));
}
console.log('48 subFB_change transitions match PARI/CPython/JS/GMP, including four failed increases, unchanged successes and assignments');
})().catch(e=>{console.error(e);process.exitCode=1;});
