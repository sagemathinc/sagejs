"use strict";
// Pinned PARI differential oracle only; no replacement mathematics in C.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const {spawnSync} = require('node:child_process'), {createHash} = require('node:crypto');
const {compileKernel} = require('../../tools/native-kernel/compiler.cjs');
const hash = x => createHash('sha256').update(x).digest('hex');
function run(c,a,o={}) { const r=spawnSync(c,a,{encoding:'utf8',timeout:120000,maxBuffer:32*1024*1024,...o}); assert.equal(r.status,0,r.stderr||String(r.error)); return r.stdout; }
(async()=>{
 const pari=path.resolve(process.argv[2]), archive=path.resolve(process.argv[3]), lib=path.join(pari,'Olinux-x86_64');
 assert.equal(hash(fs.readFileSync(archive)),'02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53');
 const source=run('tar',['-xOf',archive,'pari-2.17.4/src/basemath/Flx.c']);
 assert.equal(hash(source),'7d22f056fe56aa3c5fbd6b0e8f02fdb2e13e285d8a519382ddb2dbe7efefda44');
 assert.equal(hash(fs.readFileSync(path.join(pari,'src/basemath/Flx.c'))),hash(source));
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-flx-small-'));
 const names=['copy','normalize','sub','mul','sqr','divrem','gcd','deriv','deflate'];
 let seed=23131; const rnd=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0; return seed%n;};
 const cases=[];
 for(const p of [3,5,101,2147483659,3037000493]) for(let trial=0;trial<90;trial++) {
  const da=trial%10-1, db=rnd(10)-1;
  const poly=d=>Array.from({length:d+1},(_,i)=>i===d?1+rnd(p-1):rnd(p));
  const a=poly(da),b=poly(db);
  if(trial%7===0)for(let i=0;i<da;i++)a[i]=0;
  for(let op=0;op<names.length;op++) {
   if(op===1&&da<0||op===3&&da>=0&&db>=0&&da+db>8||op===4&&da>4||op===5&&db<0)continue;
   let k=1; if(op===8&&da>0){k=da;}
   cases.push({op,p,a,b,da,db,k});
  }
 }
 const cfile=path.join(dir,'oracle.c'), exe=path.join(dir,'oracle');
 fs.writeFileSync(cfile,String.raw`#include "pari.h"
#include "paripriv.h"
static void emit(GEN z){long d=degpol(z);printf("%ld",d);for(long i=0;i<9;i++)printf(" %lu",i<=d?uel(z,i+2):0UL);}
int main(void){pari_init(8000000,1000);long count;scanf("%ld",&count);for(long t=0;t<count;t++){pari_sp av=avma;long op,da,db,k;ulong p;scanf("%ld%lu%ld%ld%ld",&op,&p,&da,&db,&k);GEN a=cgetg(da+3,t_VECSMALL),b=cgetg(db+3,t_VECSMALL);a[1]=b[1]=0;for(long i=0;i<=da;i++)scanf("%lu",&uel(a,i+2));for(long i=0;i<=db;i++)scanf("%lu",&uel(b,i+2));GEN z=NULL,q=NULL;switch(op){case 0:z=Flx_copy(a);break;case 1:z=Flx_normalize(a,p);break;case 2:z=Flx_sub(a,b,p);break;case 3:z=Flx_mul(a,b,p);break;case 4:z=Flx_sqr(a,p);break;case 5:q=Flx_divrem(a,b,p,&z);break;case 6:z=Flx_gcd(a,b,p);break;case 7:z=Flx_deriv(a,p);break;case 8:z=Flx_deflate(a,k);break;}emit(z);if(q){putchar(' ');emit(q);}putchar('\n');avma=av;}pari_close();}
`);
 run('cc',['-O1','-fsanitize=undefined','-fno-sanitize-recover=undefined','-I'+path.join(pari,'src/headers'),'-I'+lib,cfile,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',exe]);
 const trace=run(exe,[],{input:[cases.length,...cases.flatMap(c=>[c.op,c.p,c.da,c.db,c.k,...c.a,...c.b])].join(' ')});
 const expected=trace.trim().split('\n').map(s=>s.split(' ').map(Number));
 const cp=run('python3',['-c',`import sys,json,importlib
sys.path[:0]=sys.argv[1:3]
m=importlib.import_module('bench.pari-class-group-port.flx_small')
names=['copy','normalize','sub','mul','sqr','divrem','gcd','deriv','deflate']
for ix,(c,e) in enumerate(zip(*json.load(sys.stdin))):
 w=[77]*73;w[:9]=c['a']+[0]*(9-len(c['a']));w[9:18]=c['b']+[0]*(9-len(c['b']));before=w[:18];op=c['op'];da=c['da'];db=c['db'];p=c['p']
 args=[w,0,da]
 if op in [2,3,5,6]:args += [9,db]
 if op not in [0,8]:args += [p]
 if op==8:args += [c['k']]
 args += [18]
 if op==5:args += [27]
 if op==6:args += [36]
 d=getattr(m,'pari_flx_'+names[op])(*args)
 out=27 if op==5 else 18
 actual=[d]+w[out:out+9]
 if op==5:
  qd=8
  while qd>=0 and w[18+qd]==0:qd-=1
  actual += [qd]+w[18:27]
 assert actual==e,(ix,c,actual,e)
 assert w[:18]==before and w[-1]==77
 if op==5:
  w[18:36]=[77]*18
  qd=m.pari_flx_div(w,0,da,9,db,p,18,27)
  assert [qd]+w[18:27]==e[10:] and w[27:36]==[77]*9
  w[18:36]=[77]*18
  rd=m.pari_flx_rem(w,0,da,9,db,p,18,27)
  assert [rd]+w[18:27]==e[:10]
  if db==0:assert w[27:36]==[77]*9
for a,out in [(0,1),(1,0),(0,0)]:
 w=list(range(30));before=w[:];assert m.pari_flx_copy(w,a,7,out)==7
 assert w[out:out+9]==before[a:a+8]+[0]
print('CPython passed',ix+1)
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify([cases,expected])});
 const summary={cases:cases.length,cp:cp.trim(),sourceSha256:hash(source),artifactDirectory:dir,qualifiedTiming:false};
 if(!process.argv.includes('--source-only')) {
  const built=await compileKernel({sourcePath:path.join(__dirname,'flx_small.py')}),mod=require(built.modulePath);
  for(const backend of ['javascript','gmp','tagged'])for(let ix=0;ix<cases.length;ix++) {
   const c=cases[ix],f=mod['pari_flx_'+names[c.op]],initial=Array(73).fill(77n);
   initial.splice(0,9,...c.a.map(BigInt),...Array(9-c.a.length).fill(0n));initial.splice(9,9,...c.b.map(BigInt),...Array(9-c.b.length).fill(0n));
   const w=f.createIntegerBuffer(73,2,initial),args=[w,0n,BigInt(c.da)];
   if([2,3,5,6].includes(c.op))args.push(9n,BigInt(c.db));if(![0,8].includes(c.op))args.push(BigInt(c.p));if(c.op===8)args.push(BigInt(c.k));args.push(18n);if(c.op===5)args.push(27n);if(c.op===6)args.push(36n);
   const d=f[backend](...args),v=w.toArray().map(Number),out=c.op===5?27:18,actual=[Number(d),...v.slice(out,out+9)];
   if(c.op===5){let qd=8;while(qd>=0&&v[18+qd]===0)qd--;actual.push(qd,...v.slice(18,27));}
   assert.deepEqual(actual,expected[ix],backend+' '+ix);assert.deepEqual(v.slice(0,18),initial.slice(0,18).map(Number));assert.equal(v[72],77);
   if(c.op===5)for(const operation of ['div','rem']) {
    const fn=mod['pari_flx_'+operation],owner=fn.createIntegerBuffer(73,2,initial);
    const degree=fn[backend](owner,0n,BigInt(c.da),9n,BigInt(c.db),BigInt(c.p),18n,27n),values=owner.toArray().map(Number);
    assert.deepEqual([Number(degree),...values.slice(18,27)],operation==='div'?expected[ix].slice(10):expected[ix].slice(0,10));
    if(operation==='div'||c.db===0)assert.deepEqual(values.slice(27,36),Array(9).fill(77));
   }
  }
  summary.backends=['javascript','gmp','tagged'];summary.coreSha256=hash(fs.readFileSync(built.coreSourcePath));summary.coreBytes=fs.statSync(built.coreSourcePath).size;
 }
 fs.writeFileSync(path.join(dir,'fixtures.json'),JSON.stringify({cases,expected,summary}));console.log(JSON.stringify(summary));
})().catch(e=>{console.error(e);process.exitCode=1;});
