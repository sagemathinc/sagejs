"use strict";
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const {spawnSync} = require('node:child_process'), {createHash} = require('node:crypto');
const {compileKernel} = require('../../tools/native-kernel/compiler.cjs');
function run(c,a,o={}) { const r=spawnSync(c,a,{encoding:'utf8',timeout:180000,maxBuffer:16*1024*1024,...o}); assert.equal(r.status,0,r.stderr||String(r.error)); return r.stdout; }
(async()=>{
 const pari=path.resolve(process.argv[2]), archive=path.resolve(process.argv[3]), lib=path.join(pari,'Olinux-x86_64');
 assert.equal(createHash('sha256').update(fs.readFileSync(archive)).digest('hex'),'02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53');
 const src=run('tar',['-xOf',archive,'pari-2.17.4/src/basemath/buch2.c']);
 const start=src.indexOf('  invhr = gmul('),end=src.indexOf(';',start);assert(start>=0&&end>start);
 const expression=src.slice(start,end+1).replace('invhr =','GEN result =').replace('gel(zu,1)','w').replace('compute_invres(&GRHcheck, LIMres)','invres');
 assert(!expression.includes('compute_invres')&&!expression.includes('gel(zu,1)'));
 const cases=[];
 for(let degree=2;degree<=10;degree++)for(let r2=0;r2<=Math.floor(degree/2);r2++)for(const bits of [5,63,64,65,127,256,1023,1855]) {
  const d=(1n<<BigInt(bits))+BigInt(degree*17+r2*3+1), r1=degree-2*r2;
  cases.push([String(d),r1,r2,r1?2:2*(r2+1),String((1n<<63n)+BigInt(degree*73+r2)),64,r2-2]);
 }
 for(const w of [(1n<<32n)-1n,1n<<63n,(1n<<64n)-1n])cases.push(['23',1,1,String(w),String(1n<<63n),64,0]);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-regulator-normalize-')),c=path.join(dir,'oracle.c'),exe=path.join(dir,'oracle');
 fs.writeFileSync(c,`/* buchall expression from PARI 2.17.4, GPL-2.0-or-later. */
#include "pari.h"
static GEN rd(void){char s[8192];if(scanf("%8191s",s)!=1)exit(2);return gp_read_str(s);}
int main(void){pari_init(64000000,1000);long count=itos(rd());for(long t=0;t<count;t++){pari_sp av=avma;GEN D=rd();long R1=itos(rd()),R2=itos(rd()),RU=R1+R2;GEN w=rd(),m=rd();long p=itos(rd()),e=itos(rd());GEN invres=itor(m,p);setexpo(invres,e);
${expression}
long de;pari_printf("%Ps %ld %ld\\n",mantissa_real(result,&de),bit_prec(result),expo(result));avma=av;}pari_close();return 0;}`);
 run('cc',['-O1','-fsanitize=undefined','-fno-sanitize-recover=undefined','-I'+path.join(pari,'src/headers'),'-I'+lib,c,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',exe]);
 const trace=run(exe,[],{input:[cases.length,...cases.flat()].join(' ')}), expected=trace.trim().split('\n').map(s=>s.split(' '));
 run('python3',['-c',`import sys,json,importlib,copy
sys.path[:0]=sys.argv[1:3]
f=importlib.import_module('bench.pari-class-group-port.regulator_normalization').pari_regulator_normalization
for i,(r,e) in enumerate(zip(*json.load(sys.stdin))):
 v=list(map(int,r));work=[[0]*3]+[[0]*8 for _ in range(4)]+[[0]*128]
 assert f(*v[:4],v[4:],*work)==tuple(map(int,e)),i
 # Reuse the pi cache with no coefficient workspace, as in the source cache.
 assert f(*v[:4],v[4:],work[0],[],[],[],[],[])==tuple(map(int,e)),i
base=[23,1,1,2,[1<<63,64,0]]+[[0]*3]+[[0]*8 for _ in range(4)]+[[0]*128]
for slot,value in [(0,0),(0,1<<1856),(1,-1),(2,6),(3,0),(3,1<<64),(4,[1<<127,128,0]),(5,[])]:
 args=copy.deepcopy(base);args[slot]=value;before=copy.deepcopy(args)
 try:f(*args)
 except ValueError:pass
 else:raise AssertionError(('missing guard',slot))
 assert args==before,slot
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify([cases,expected])});
 const summary={cases:cases.length,syntheticOnly:true,atomicGuardsPerBackend:8,traceSha256:createHash('sha256').update(trace).digest('hex'),ubsan:true,qualifiedTiming:false};
 if(process.argv.includes('--source-only')){console.log(JSON.stringify(summary));return;}
 const built=await compileKernel({sourcePath:path.join(__dirname,'regulator_normalization.py')}),f=require(built.modulePath).pari_regulator_normalization;assert(f.nativeAvailable);
 for(const backend of ['javascript','gmp'])for(let i=0;i<cases.length;i++){
  const v=cases[i].map(BigInt),make=n=>backend==='gmp'?f.createIntegerBuffer(n,128):Array(n).fill(0n),work=[make(3),make(8),make(8),make(8),make(8),make(128)];
  assert.deepEqual(f[backend](...v.slice(0,4),v.slice(4),...work),expected[i].map(BigInt),backend+' '+i);
  assert.deepEqual(f[backend](...v.slice(0,4),v.slice(4),work[0],[],[],[],[],[]),expected[i].map(BigInt),backend+' cached '+i);
 }
 for(const backend of ['javascript','gmp'])for(const [slot,value] of [[0,0n],[0,1n<<1856n],[1,-1n],[2,6n],[3,0n],[3,1n<<64n],[4,[1n<<127n,128n,0n]],[5,[]]]) {
  const make=n=>backend==='gmp'?f.createIntegerBuffer(n,128):Array(n).fill(0n),view=x=>typeof x==='bigint'?x:Array.isArray(x)?x.slice():x.toArray();
  const args=[23n,1n,1n,2n,[1n<<63n,64n,0n],make(3),make(8),make(8),make(8),make(8),make(128)];args[slot]=value;
  const before=args.map(view);assert.throws(()=>f[backend](...args));assert.deepEqual(args.map(view),before);
 }
 console.log(JSON.stringify({...summary,coreBytes:fs.statSync(built.coreSourcePath).size}));
})().catch(e=>{console.error(e);process.exitCode=1;});
