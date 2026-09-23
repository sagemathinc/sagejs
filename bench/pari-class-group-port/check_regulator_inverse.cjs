"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {compileKernel}=require('../../tools/native-kernel/compiler.cjs');
function run(c,a,o={}){const r=spawnSync(c,a,{encoding:'utf8',timeout:180000,maxBuffer:64*1024*1024,...o});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
(async()=>{
 const pari=path.resolve(process.argv[2]),archive=path.resolve(process.argv[3]),lib=path.join(pari,'Olinux-x86_64');
 assert.equal(createHash('sha256').update(fs.readFileSync(archive)).digest('hex'),'02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53');
 const cases=[],I=n=>[String(n),'-1','0'];let seed=557;
 const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
 for(const p of [64,128,320,1856])for(let n=1;n<=4;n++)for(let t=0;t<16;t++){
  const values=[];for(let j=0;j<n;j++)for(let i=0;i<n;i++){const r=rnd();if(r%9===0)values.push(...I(0));else if(r%7===0)values.push('1','-2','2');else values.push(String((r%2?1n:-1n)*((1n<<BigInt(p-1))+BigInt(r))),String(p),String((r%16)-8));}
  cases.push({n,values});
 }
 for(let n=1;n<=4;n++){
  cases.push({n,values:Array.from({length:n*n},(_,i)=>I(i%n===Math.floor(i/n)?1:0)).flat(),frontier:true});
  cases.push({n,values:Array(n*n).fill(['0','0','-64']).flat()});
 }
 const logs=JSON.parse(run(process.execPath,[path.join(__dirname,'check_log_embedding.cjs'),pari,'--export-fixtures']));
 for(let group=0;group<4;group++)for(let start=0;start<6;start++){
  const first=logs[group*20+start],n=(first.n+first.r1)/2,values=Array.from({length:n},(_,i)=>I(i<first.r1?1:2)).flat();
  for(let j=1;j<n;j++){const r=logs[group*20+start+j];for(let i=0;i<n;i++)values.push(...r.expected.slice(7*i+1,7*i+4));}cases.push({n,values});
 }
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-regulator-inverse-')),file=path.join(dir,'oracle.c'),exe=path.join(dir,'oracle');
 fs.writeFileSync(file,`#include "pari.h"
static GEN rd(void){char s[8192];if(scanf("%8191s",s)!=1)exit(2);return gp_read_str(s);}
static GEN scalar(void){GEN m=rd();long p=itos(rd());GEN ee=rd();if(p==-1)return m;if(p==-2)return gdiv(m,ee);long e=itos(ee);if(!signe(m))return real_0_bit(e);GEN x=itor(m,p);setexpo(x,e);return x;}
static void ps(GEN x){long e;if(typ(x)==t_INT){pari_printf("\\"%Ps\\",\\"-1\\",\\"0\\"",x);return;}if(typ(x)==t_FRAC){pari_printf("\\"%Ps\\",\\"-2\\",\\"%Ps\\"",gel(x,1),gel(x,2));return;}pari_printf("\\"%Ps\\",\\"%ld\\",\\"%ld\\"",signe(x)?mantissa_real(x,&e):gen_0,signe(x)?bit_prec(x):0,expo(x));}
int main(void){pari_init(64000000,1000);long count=itos(rd());for(long t=0;t<count;t++){pari_sp av=avma;long n=itos(rd());GEN a=cgetg(n+1,t_MAT);for(long j=1;j<=n;j++){gel(a,j)=cgetg(n+1,t_COL);for(long i=1;i<=n;i++)gcoeff(a,i,j)=scalar();}GEN b=RgM_inv(a);if(!b)puts("null");else{putchar('[');for(long j=1;j<=n;j++)for(long i=1;i<=n;i++){if(i>1||j>1)putchar(',');ps(gcoeff(b,i,j));}puts("]");}avma=av;}pari_close();return 0;}
`);
 run('cc',['-O1','-fsanitize=undefined','-fno-sanitize-recover=undefined','-I'+path.join(pari,'src/headers'),'-I'+lib,file,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',exe]);
 const trace=run(exe,[],{input:[cases.length,...cases.flatMap(r=>[r.n,...r.values])].join(' ')}),expected=trace.trim().split('\n').map(JSON.parse);
 const precisionFrontiers=JSON.parse(run('python3',['-c',`import sys,json,importlib
sys.path[:0]=sys.argv[1:3];f=importlib.import_module('bench.pari-class-group-port.regulator_inverse').pari_regulator_inverse
frontiers=[]
for ix,(r,e) in enumerate(zip(*json.load(sys.stdin))):
 n=r['n'];v=list(map(int,r['values']));size=3*n*n;args=[v,n,[77]*size,[77]*size,[77]*size,[77]*n,[77]*3]
 try: status=f(*args)
 except ValueError as error:
  if 'outside basecase window' not in str(error) and str(error)!='unsupported integer-to-real precision': raise
  assert args[4]==[77]*size
  frontiers.append(ix)
  continue
 if all(v[i]<0 for i in range(1,len(v),3)):
  assert status==-1 and args[4]==[77]*size
 elif e is None: assert status==1 and args[4]==[77]*size,(ix,status,args[4])
 else: assert status==0 and args[4]==list(map(int,e)),(ix,status,args[4],e)
 for index,value in [(1,0),(2,[]),(4,[]),(6,[])]:
  bad=args[:];bad[index]=value;before=str(bad)
  try:f(*bad)
  except ValueError:pass
  else:raise AssertionError('invalid accepted')
  assert str(bad)==before
print(json.dumps(frontiers))
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify([cases,expected])}));
 const summary={cases:cases.length,actualLogCases:24,precisionFrontiers,singular:expected.filter(x=>x===null).length,traceSha256:createHash('sha256').update(trace).digest('hex'),ubsan:true,qualifiedTiming:false};
 if(process.argv.includes('--source-only')){console.log(JSON.stringify(summary));return;}
 const built=await compileKernel({sourcePath:path.join(__dirname,'regulator_inverse.py')}),f=require(built.modulePath).pari_regulator_inverse;assert(f.nativeAvailable);
 for(const backend of ['javascript','gmp'])for(let ix=0;ix<cases.length;ix++){
  const r=cases[ix],e=expected[ix],n=r.n,size=3*n*n,make=()=>backend==='gmp'?f.createIntegerBuffer(size,64,Array(size).fill(77n)):Array(size).fill(77n),view=x=>Array.isArray(x)?x:x.toArray();
  const args=[r.values.map(BigInt),BigInt(n),make(),make(),make(),Array(n).fill(77n),Array(3).fill(77n)];
  if(precisionFrontiers.includes(ix)){assert.throws(()=>f[backend](...args));assert.deepEqual(view(args[4]),Array(size).fill(77n));continue;}
  const status=f[backend](...args);
  const frontier=r.values.filter((_,i)=>i%3===1).every(x=>BigInt(x)<0n);
  assert.equal(status,frontier?-1n:e===null?1n:0n);assert.deepEqual(view(args[4]),frontier||e===null?Array(size).fill(77n):e.map(BigInt),backend+' '+ix);
  for(const [index,value] of [[1,0n],[2,[]],[4,[]],[6,[]]]){
   const bad=args.slice();bad[index]=value;const snapshot=a=>a.map(x=>typeof x==='bigint'?x:view(x).slice()),before=snapshot(bad);
   assert.throws(()=>f[backend](...bad));assert.deepEqual(snapshot(bad),before);
  }
 }
 console.log(JSON.stringify({...summary,coreBytes:fs.statSync(built.coreSourcePath).size}));
})().catch(e=>{console.error(e);process.exitCode=1;});
