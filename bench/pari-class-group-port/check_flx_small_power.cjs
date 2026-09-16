"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
function run(c,a,o={}){const r=spawnSync(c,a,{encoding:'utf8',timeout:90000,maxBuffer:16*1024*1024,...o});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
const hash=x=>createHash('sha256').update(x).digest('hex');
(async()=>{
 const pari=path.resolve(process.argv[2]),archive=path.resolve(process.argv[3]),lib=path.join(pari,'Olinux-x86_64');
 assert.equal(hash(fs.readFileSync(archive)),'02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53');
 const upstreamHashes={};for(const name of ['Flx.c','bb_group.c']){const s=run('tar',['-xOf',archive,'pari-2.17.4/src/basemath/'+name]);assert.equal(fs.readFileSync(path.join(pari,'src/basemath',name),'utf8'),s);upstreamHashes[name]=hash(s);}
 const rows=[];const exponents=[0n,1n,2n,3n,5n,31n,510n,511n,512n,513n,(1n<<25n)-1n,1n<<25n,(1n<<25n)+1n,1n<<63n,(1n<<64n)-1n];
 for(const p of [3,5,101,65537])for(let dt=0;dt<=4;dt++)for(const e of exponents){
  const t=Array.from({length:dt+1},(_,i)=>(i*7+2)%p);t[dt]=1;
  const a=[1,1];rows.push({p,t,a,e:String(e)});
 }
 for(const a of [[],[1],[2,0,1],[1,2,0,0,1]])for(const e of [0n,1n,2n,513n,(1n<<25n)+17n])rows.push({p:101,t:[3,0,0,0,1],a,e:String(e)});
 for(const p of [3,5,509,521,33554393,33554467,3037000493])rows.push({p,t:[1,1,0,1],a:[0,1],e:String(p)});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-flx-small-power-'));
 const source=`#include <pari.h>\n#include <paripriv.h>\n#include <stdio.h>\ntypedef struct {GEN T;ulong p;long sq,mu;} C;\nstatic GEN sq(void*e,GEN x){C*c=e;c->sq++;return Flxq_sqr(x,c->T,c->p);}\nstatic GEN mu(void*e,GEN x,GEN y){C*c=e;c->mu++;return Flxq_mul(x,y,c->T,c->p);}\nstatic GEN rd(void){long d;scanf("%ld",&d);GEN a=cgetg(d+3,t_VECSMALL);a[1]=0;for(long i=0;i<=d;i++)scanf("%lu",&a[i+2]);return a;}\nint main(void){if(sizeof(long)!=8)return 2;pari_init(16000000,1000);long count;scanf("%ld",&count);for(long k=0;k<count;k++){pari_sp av=avma;ulong p,n;scanf("%lu %lu",&p,&n);GEN a=rd(),t=rd();C c={t,p,0,0};GEN z=n==0?pol1_Flx(0):n==1?Flx_copy(a):n==2?sq(&c,a):gen_powu_i(a,n,&c,sq,mu);GEN direct=Flxq_powu(a,n,t,p);if(!gequal(z,direct))return 3;printf("[%ld,[",degpol(z));for(long i=0;i<9;i++)printf("%s\\\"%lu\\\"",i?",":"",i<=degpol(z)?(ulong)z[i+2]:0UL);printf("],%ld,%ld]\\n",c.sq,c.mu);set_avma(av);}pari_close();return 0;}\n`;
 fs.writeFileSync(path.join(dir,'oracle.c'),source);
 run('cc',['-O1','-I'+path.join(pari,'src/headers'),'-I'+lib,path.join(dir,'oracle.c'),'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',path.join(dir,'oracle')]);
 const input=[rows.length,...rows.flatMap(r=>[r.p,r.e,r.a.length-1,...r.a,r.t.length-1,...r.t])].join(' ');
 const expected=run(path.join(dir,'oracle'),[],{input}).trim().split('\n').map(JSON.parse);
 assert.equal(expected.length,rows.length);fs.writeFileSync(path.join(dir,'fixtures.json'),JSON.stringify([rows,expected]));
 const cp=run('python3',['-c',`import sys,json,importlib
sys.path[:0]=sys.argv[1:3]
m=importlib.import_module('bench.pari-class-group-port.flx_small_power')
sq,mul=m.pari_flxq_sqr,m.pari_flxq_mul
for r,e in zip(*json.load(sys.stdin)):
 counts=[0,0]
 def cs(*a):counts[0]+=1;return sq(*a)
 def cm(*a):counts[1]+=1;return mul(*a)
 m.pari_flxq_sqr,m.pari_flxq_mul=cs,cm
 w=[77]*117;w[:9]=r['a']+[0]*(9-len(r['a']));w[9:18]=r['t']+[0]*(9-len(r['t']));before=w[:18]
 d=m.pari_flxq_powu(w,0,len(r['a'])-1,int(r['e']),9,len(r['t'])-1,r['p'],18,27)
 assert [d,w[18:27],*counts]==[e[0],list(map(int,e[1])),*e[2:]],(r,counts,e)
 assert w[:18]==before
print('passed')
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify([rows,expected])});
 const {compileKernel}=require('../../tools/native-kernel/compiler.cjs');
 const built=await compileKernel({sourcePath:path.join(__dirname,'flx_small_power.py')}),f=require(built.modulePath).pari_flxq_powu;assert(f.nativeAvailable);
 assert.doesNotMatch(fs.readFileSync(built.coreSourcePath,'utf8'),/napi_call_function|PyObject_Call|v8::/);
 for(const backend of ['javascript','gmp','tagged'])for(let i=0;i<rows.length;i++){
  const r=rows[i],e=expected[i],w=Array(117).fill(77n);w.splice(0,9,...r.a.map(BigInt),...Array(9-r.a.length).fill(0n));w.splice(9,9,...r.t.map(BigInt),...Array(9-r.t.length).fill(0n));const before=w.slice(0,18);
  const d=f[backend](w,0n,BigInt(r.a.length-1),BigInt(r.e),9n,BigInt(r.t.length-1),BigInt(r.p),18n,27n);
  assert.equal(d,BigInt(e[0]));assert.deepEqual(w.slice(18,27),e[1].map(BigInt));assert.deepEqual(w.slice(0,18),before);
 }
 for(const backend of ['javascript','gmp','tagged'])for(const change of [a=>a[3]=-1n,a=>a[3]=1n<<64n,a=>a[6]=2n,a=>a[7]=0n,a=>a[8]=28n]){
  const w=Array(117).fill(0n);w[0]=1n;w[1]=1n;w[9]=1n;w[11]=1n;
  const args=[w,0n,1n,3n,9n,2n,101n,18n,27n];change(args);const before=w.slice();
  assert.throws(()=>f[backend](...args));assert.deepEqual(w,before);
 }
 const evaluations=[];for(const p of [3,101,65537,3037000493])for(let dt=1;dt<=4;dt++)for(let dq=-1;dq<=3;dq++){
  const a=dt===1?[2%p]:[1,1],t=Array(dt+1).fill(0);t[0]=2%p;t[dt]=1;
  const q=Array.from({length:dq+1},(_,i)=>(i+1)%p);if(dq>=0)q[dq]=1;
  evaluations.push({p,a,t,q});
 }
 const extraSource=`#include <pari.h>\n#include <paripriv.h>\n#include <stdio.h>\nstatic GEN rd(void){long d;scanf("%ld",&d);GEN a=cgetg(d+3,t_VECSMALL);a[1]=0;for(long i=0;i<=d;i++)scanf("%lu",&a[i+2]);return a;}\nstatic void emit(GEN x){printf("[%ld,[",degpol(x));for(long i=0;i<9;i++)printf("%s\\\"%lu\\\"",i?",":"",i<=degpol(x)?(ulong)x[i+2]:0UL);printf("]]");}\nint main(void){pari_init(16000000,1000);long n;scanf("%ld",&n);for(long k=0;k<n;k++){pari_sp av=avma;ulong p;scanf("%lu",&p);GEN a=rd(),t=rd(),q=rd(),v=Flxq_powers(a,2,t,p);putchar('[');for(long i=1;i<=3;i++){emit(gel(v,i));putchar(',');}emit(Flx_FlxqV_eval(q,v,t,p));puts("]");set_avma(av);}pari_close();return 0;}\n`;
 fs.writeFileSync(path.join(dir,'extra.c'),extraSource);
 run('cc',['-O1','-I'+path.join(pari,'src/headers'),'-I'+lib,path.join(dir,'extra.c'),'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',path.join(dir,'extra')]);
 const extraExpected=run(path.join(dir,'extra'),[],{input:[evaluations.length,...evaluations.flatMap(r=>[r.p,r.a.length-1,...r.a,r.t.length-1,...r.t,r.q.length-1,...r.q])].join(' ')}).trim().split('\n').map(JSON.parse);
 assert.equal(extraExpected.length,evaluations.length);fs.writeFileSync(path.join(dir,'evaluation-fixtures.json'),JSON.stringify([evaluations,extraExpected]));
 run('python3',['-c',`import sys,json,importlib
sys.path[:0]=sys.argv[1:3]
m=importlib.import_module('bench.pari-class-group-port.flx_small_power')
original_square=m.pari_flxq_sqr
for r,e in zip(*json.load(sys.stdin)):
 for length in range(3):
  square_count=[0]
  def square(*args):square_count[0]+=1;return original_square(*args)
  m.pari_flxq_sqr=square
  w=[77]*144
  for at,key in [(0,'a'),(9,'t'),(18,'q')]:w[at:at+9]=r[key]+[0]*(9-len(r[key]))
  m.pari_flxq_powers(w,0,len(r['a'])-1,length,9,len(r['t'])-1,r['p'],27,54,72)
  assert square_count[0]==(1 if length==2 else 0)
  for k in range(length+1):assert [w[54+k],w[27+9*k:36+9*k]]==[e[k][0],list(map(int,e[k][1]))]
  if length==2:
   d=m.pari_flx_flxqv_eval(w,18,len(r['q'])-1,27,54,2,9,len(r['t'])-1,r['p'],63,72)
   assert [d,w[63:72]]==[e[3][0],list(map(int,e[3][1]))],(r,e,w[63:72])
print('passed')
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify([evaluations,extraExpected])});
 const module=require(built.modulePath),powers=module.pari_flxq_powers,evalq=module.pari_flx_flxqv_eval;
 for(const backend of ['javascript','gmp','tagged'])for(let i=0;i<evaluations.length;i++)for(let length=0;length<=2;length++){
  const r=evaluations[i],e=extraExpected[i],w=Array(144).fill(77n);
  for(const [at,key]of [[0,'a'],[9,'t'],[18,'q']])w.splice(at,9,...r[key].map(BigInt),...Array(9-r[key].length).fill(0n));
  const before=w.slice(0,27);
  assert.equal(powers[backend](w,0n,BigInt(r.a.length-1),BigInt(length),9n,BigInt(r.t.length-1),BigInt(r.p),27n,54n,72n),BigInt(length+1));
  for(let k=0;k<=length;k++){assert.equal(w[54+k],BigInt(e[k][0]));assert.deepEqual(w.slice(27+9*k,36+9*k),e[k][1].map(BigInt));}
  if(length===2){const d=evalq[backend](w,18n,BigInt(r.q.length-1),27n,54n,2n,9n,BigInt(r.t.length-1),BigInt(r.p),63n,72n);assert.equal(d,BigInt(e[3][0]));assert.deepEqual(w.slice(63,72),e[3][1].map(BigInt));}
  assert.deepEqual(w.slice(0,27),before);
 }
 console.log(JSON.stringify({cases:rows.length,evaluationCases:evaluations.length,powersLengths:[0,1,2],cp:cp.trim(),backends:['javascript','gmp','tagged'],upstreamHashes,sourceHash:hash(fs.readFileSync(path.join(__dirname,'flx_small_power.py'))),directory:dir,qualifiedTiming:false}));
})().catch(e=>{console.error(e);process.exitCode=1;});
