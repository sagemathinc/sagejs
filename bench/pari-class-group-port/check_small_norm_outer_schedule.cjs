"use strict";
// Correctness only: the C oracle executes extracted pinned PARI source. Its
// small_norm boundary records/supplies cache effects; it does not collect.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const {spawnSync} = require('node:child_process'), {createHash} = require('node:crypto');
const {compileKernel} = require('../../tools/native-kernel/compiler.cjs');
function run(cmd,args,options={}) {
  const r=spawnSync(cmd,args,{encoding:'utf8',timeout:60000,maxBuffer:16*1024*1024,...options});
  assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;
}
function extract(source,start,end) {
  const a=source.indexOf(start),b=source.indexOf(end,a);
  assert(a>=0&&b>a);return source.slice(a,b);
}
(async()=>{
  const pari=path.resolve(process.argv[2]),archive=process.argv[3],lib=path.join(pari,'Olinux-x86_64');
  assert.equal(createHash('sha256').update(fs.readFileSync(archive)).digest('hex'),'02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53');
  const pristine=run('tar',['-xOf',archive,'pari-2.17.4/src/basemath/buch2.c']);
  const local=fs.readFileSync(path.join(pari,'src/basemath/buch2.c'),'utf8');
  const trim=extract(pristine,'static GEN\ntrim_list(FB_t *F)','/* x t_INT or primitive ZC */');
  let block=extract(pristine,'      if (need > 0 && Nrelid > 0','      if (need > 0)\n      { /* Random relations */');
  assert.equal(trim,extract(local,'static GEN\ntrim_list(FB_t *F)','/* x t_INT or primitive ZC */'));
  assert.equal(block,extract(local,'      if (need > 0 && Nrelid > 0','      if (need > 0)\n      { /* Random relations */'));
  const blockHash=createHash('sha256').update(trim+block).digest('hex');
  // Instrument at the suspension boundary without replacing mathematical
  // control flow. The original if-block and trim_list remain verbatim.
  const marker='        if (lg(F.L_jid) > 1) small_norm';
  assert.equal(block.split(marker).length,2);
  block=block.replace(marker,'        entered = 1; SNAP("begin", lg(F.L_jid)>1?1:2, j);\n'+marker);
  const cases=[];
  for(const kc of [1,4,6])for(let done=0;done<=kc+3;done++)for(let variant=0;variant<12;variant++) {
    const perm=Array.from({length:kc},(_,i)=>kc-i);
    const raw=Array.from({length:variant%(kc+3)},(_,i)=>1+(i*3+variant)%kc);
    const state=[3,2,done,2,2,3,6,2,9,0,0,0,0,0,variant===1?1:0,variant%3===0?0:1,variant%3===0?0:Math.min(kc,1+variant%kc)];
    if(variant===2)state[0]=0;
    if(variant===3)state[1]=0;
    if(variant===4)state[3]=3;
    if(variant===5)state[5]=2*kc+2*2+5;
    if(variant===6)state[5]=2*kc+2*2+4;
    const minidx=Array.from({length:kc},(_,i)=>1+Math.floor(i/2));
    const multiplier=Array.from({length:kc},(_,i)=>variant===7?kc:(i+variant)%(kc+1));
    const basis=Array.from({length:kc*kc},(_,i)=>i%(kc+1)===0?1:20+i);
    cases.push({kc,ru:2,delta:variant%2,state,raw,perm,minidx,multiplier,basis});
  }
  // Saved mj must not change when an earlier retained ID updates multiplier[j].
  // Duplicate orbit IDs beyond KC are ignored before deduplication.
  for(const A of [0,1])for(const delta of [0,1])for(const R of [0,1]) {
    cases.push({kc:4,ru:2,delta,state:[3,2,1,2,2,3,6,2,9,0,0,0,0,0,A,R,3],
      raw:[2,1,4,3,4,3],perm:[2,1,4,3],minidx:[1,2,1,4],
      multiplier:[0,0,0,0],basis:[1,21,22,23,24,1,26,27,28,29,1,31,32,33,34,1]});
  }
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-outer-schedule-')),c=path.join(dir,'oracle.c'),exe=path.join(dir,'oracle');
  fs.writeFileSync(c,`/* PARI group GPL-2.0-or-later source-block oracle, no warranty. */
#include "pari.h"
#include "paripriv.h"
typedef struct {long KC,sfb_chg; GEN L_jid,minidx,perm;} FB_t;
typedef struct {long unused;} REL_t;
typedef struct {REL_t *last,*base,*end;long missing;GEN basis;} RELCACHE_t;
typedef void FACT;
static const long RELSUP=5;
${trim}
static long delta;
static void small_norm(RELCACHE_t *c,FB_t *f,GEN nf,long nr,FACT *fact,long j){
 (void)nf;(void)nr;(void)fact;(void)j;c->last+=delta;c->end+=2;c->missing++;
 if(f->KC>1)mael(c->basis,1,2)+=7;
}
static void vec(GEN v){putchar('[');for(long i=1;i<lg(v);i++){if(i>1)putchar(',');printf("%ld",v[i]);}putchar(']');}
static GEN readvec(long n){GEN v=cgetg(n+1,t_VECSMALL);for(long i=1;i<=n;i++)if(scanf("%ld",&v[i])!=1)exit(4);return v;}
#define SNAP(label,code,jj) do {printf("\\"%s\\":{\\"code\\":%ld,\\"j\\":%ld,\\"state\\":[%ld,%ld,%ld,%ld,%ld,%ld,%ld,%ld,%ld],\\"ideals\\":",label,(long)(code),(long)(jj),need,Nrelid,done_small,small_fail,fail_limit,(long)(cache.last-cache.base),(long)(cache.end-cache.base),cache.missing,F.sfb_chg);vec(F.L_jid);printf(",\\"multiplier\\":");vec(small_multiplier);printf(",\\"basis\\":[");for(long cc=1;cc<=F.KC;cc++)for(long rr=1;rr<=F.KC;rr++){if(rr!=1||cc!=1)putchar(',');printf("%ld",mael(cache.basis,cc,rr));}printf(" ]},");}while(0)
int main(void){pari_init(16000000,1000);long cases;if(scanf("%ld",&cases)!=1)return 2;
for(long z=0;z<cases;z++){pari_sp av=avma;long kc,RU,count;if(scanf("%ld%ld%ld%ld",&kc,&RU,&count,&delta)!=4)return 3;
GEN s=readvec(17);long need=s[1],Nrelid=s[2],done_small=s[3],small_fail=s[4],fail_limit=s[5],i;
FB_t F;F.KC=kc;F.sfb_chg=s[9];F.L_jid=readvec(count);F.perm=readvec(kc);F.minidx=readvec(kc);GEN small_multiplier=readvec(kc);
REL_t storage[100];RELCACHE_t cache;cache.base=storage;cache.last=storage+s[6];cache.end=storage+s[7];cache.missing=s[8];cache.basis=cgetg(kc+1,t_MAT);
for(long cc=1;cc<=kc;cc++)gel(cache.basis,cc)=zero_Flv(kc);
for(long cc=1;cc<=kc;cc++)for(long rr=1;rr<=kc;rr++)if(scanf("%ld",&mael(cache.basis,cc,rr))!=1)return 5;
GEN A=s[15]?gen_1:NULL,R=s[16]?gen_1:NULL,W=zerovec(s[17]),nf=NULL;FACT *fact=NULL;long entered=0;
F.L_jid=trim_list(&F);printf("{\\"trim\\":");vec(F.L_jid);putchar(',');
${block}
if(!entered)SNAP("begin",0,0);
SNAP("finish",entered,0);printf("\\"entered\\":%ld}\\n",entered);avma=av;
}pari_close();return 0;}
`);
  run('cc',['-O2','-I'+path.join(pari,'src/headers'),'-I'+lib,c,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',exe]);
  const input=[cases.length,...cases.flatMap(r=>[r.kc,r.ru,r.raw.length,r.delta,...r.state,...r.raw,...r.perm,...r.minidx,...r.multiplier,...r.basis])].join(' ');
  const trace=run(exe,[],{input}),expected=trace.trim().split('\n').map(JSON.parse);
  assert.equal(expected.length,cases.length);
  run('python3',['-c',`import sys,json,importlib
sys.path[:0]=sys.argv[1:3]
m=importlib.import_module('bench.pari-class-group-port.small_norm_outer_schedule')
for r,e in json.load(sys.stdin):
 kc=r['kc'];s=r['state'][:];ids=[77]*kc;present=[88]*kc;multi=r['multiplier'][:];basis=r['basis'][:]
 n=m.pari_trim_small_norm_list(r['raw'],len(r['raw']),r['minidx'],kc,present,ids)
 assert ids[:n]==e['trim'] and ids[n:]==[77]*(kc-n)
 s[13]=n
 code=m.pari_begin_small_norm_outer(kc,r['ru'],s,ids,r['perm'],multi,basis)
 def check(w):
  assert s[:9]==w['state'] and ids[:s[13]]==w['ideals'] and multi==w['multiplier'] and basis==w['basis'],(r,w,s,ids,basis)
 assert code==e['begin']['code'];check(e['begin'])
 if code:
  assert s[12]==e['begin']['j']
  if code==1:
   s[5]+=r['delta'];s[6]+=2;s[7]+=1
   if kc>1:basis[1]+=7
  m.pari_finish_small_norm_outer(kc,s,ids,r['perm'],basis)
 check(e['finish'])
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify(cases.map((r,i)=>[r,expected[i]]))});
  const built=await compileKernel({sourcePath:path.join(__dirname,'small_norm_outer_schedule.py')}),m=require(built.modulePath);
  assert(m.pari_begin_small_norm_outer.nativeAvailable&&m.pari_finish_small_norm_outer.nativeAvailable&&m.pari_trim_small_norm_list.nativeAvailable);
  for(const backend of ['javascript','gmp'])for(let index=0;index<cases.length;index++) {
    const r=cases[index],e=expected[index],kc=r.kc,s=r.state.map(BigInt),ids=Array(kc+2).fill(77n),present=Array(kc+2).fill(88n),multi=r.multiplier.map(BigInt),basis=r.basis.map(BigInt),perm=r.perm.map(BigInt);
    const n=Number(m.pari_trim_small_norm_list[backend](r.raw.map(BigInt),BigInt(r.raw.length),r.minidx.map(BigInt),BigInt(kc),present,ids));
    assert.deepEqual(ids.slice(0,n),e.trim.map(BigInt));assert.deepEqual(ids.slice(n),Array(kc+2-n).fill(77n));assert.deepEqual(present.slice(kc),[88n,88n]);
    s[13]=BigInt(n);
    const invoke=()=>m.pari_begin_small_norm_outer[backend](BigInt(kc),BigInt(r.ru),s,ids,perm,multi,basis);
    const code=Number(invoke());assert.equal(code,e.begin.code);
    const check=w=>{assert.deepEqual(s.slice(0,9),w.state.map(BigInt));assert.deepEqual(ids.slice(0,Number(s[13])),w.ideals.map(BigInt));assert.deepEqual(multi,w.multiplier.map(BigInt));assert.deepEqual(basis,w.basis.map(BigInt));};
    check(e.begin);
    if(code) {
      assert.equal(s[12],BigInt(e.begin.j));assert.throws(invoke,/already active/);
      if(code===1){s[5]+=BigInt(r.delta);s[6]+=2n;s[7]+=1n;if(kc>1)basis[1]+=7n;}
      m.pari_finish_small_norm_outer[backend](BigInt(kc),s,ids,perm,basis);
    }
    check(e.finish);assert.equal(s[9],0n);assert.deepEqual(ids.slice(kc),[77n,77n]);assert.deepEqual(perm,r.perm.map(BigInt));
    assert.throws(()=>m.pari_finish_small_norm_outer[backend](BigInt(kc),s,ids,perm,basis),/not active/);
  }
  for(const backend of ['javascript','gmp']) {
    // Exercise actual reusable owners, not only array argument marshalling.
    const packedIndex=cases.findIndex((r,i)=>expected[i].begin.code===2&&r.state[15]&&r.state[16]&&r.state[2]%2);
    assert(packedIndex>=0);
    const r=cases[packedIndex],e=expected[packedIndex];
    const f=m.pari_begin_small_norm_outer;
    const pack=a=>f.createIntegerBuffer(a.length,4,a.map(BigInt));
    const ids=pack(Array(r.kc).fill(77)),perm=pack(r.perm),basis=pack(r.basis),multi=pack(r.multiplier),present=pack(Array(r.kc).fill(88)),s=r.state.map(BigInt);
    s[13]=m.pari_trim_small_norm_list[backend](pack(r.raw),BigInt(r.raw.length),pack(r.minidx),BigInt(r.kc),present,ids);
    assert.equal(f[backend](BigInt(r.kc),BigInt(r.ru),s,ids,perm,multi,basis),BigInt(e.begin.code));
    assert.deepEqual(basis.toArray(),e.begin.basis.map(BigInt));
    // Empty LIE schedule: no supplied collector effects, but pivots restore.
    m.pari_finish_small_norm_outer[backend](BigInt(r.kc),s,ids,perm,basis);
    assert.deepEqual(ids.toArray(),e.finish.ideals.map(BigInt));
    assert.deepEqual(basis.toArray(),e.finish.basis.map(BigInt));
    assert.deepEqual(s.slice(0,9),e.finish.state.map(BigInt));
    const trim=m.pari_trim_small_norm_list[backend];
    for(const [ids,count,minidx] of [[[0n],1n,[1n]],[[1n],1n,[2n]],[[1n],2n,[1n]]]) {
      const present=[88n],out=[77n];
      assert.throws(()=>trim(ids,count,minidx,1n,present,out),/invalid trim/);
      assert.deepEqual(present,[88n]);assert.deepEqual(out,[77n]);
    }
    // Header-only upstream list and KC=0 are valid leaf boundary cases.
    assert.equal(trim([],0n,[],0n,[],[]),0n);
    // An invalid ignored suffix is not read: imax is chosen before scanning.
    const out=[77n],seen=[88n];
    assert.equal(trim([1n,999n],2n,[1n],1n,seen,out),1n);
    assert.deepEqual(out,[1n]);
  }
  const counts={gated:0,call:0,empty:0,lie:0};
  for(let i=0;i<cases.length;i++){const c=expected[i].begin.code;counts[['gated','call','empty'][c]]++;if(c&&cases[i].state[15]&&cases[i].state[16]&&cases[i].state[2]%2)counts.lie++;}
  assert(Object.values(counts).every(x=>x>0));
  console.log(JSON.stringify({cases:cases.length,...counts,blockHash,traceSha256:createHash('sha256').update(trace).digest('hex'),coreBytes:fs.statSync(built.coreSourcePath).size,qualifiedTiming:false,boundary:'small_norm cache effects supplied; no relation collection or linear algebra'}));
})().catch(e=>{console.error(e);process.exitCode=1;});
