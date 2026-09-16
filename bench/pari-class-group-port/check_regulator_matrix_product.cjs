"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {compileKernel}=require('../../tools/native-kernel/compiler.cjs');
function run(c,a,o={}){const r=spawnSync(c,a,{encoding:'utf8',timeout:180000,maxBuffer:64*1024*1024,...o});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
(async()=>{
 const pari=path.resolve(process.argv[2]),archive=path.resolve(process.argv[3]),lib=path.join(pari,'Olinux-x86_64');
 assert.equal(createHash('sha256').update(fs.readFileSync(archive)).digest('hex'),'02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53');
 const cases=[],I=x=>[String(x),'-1','0'];
 for(const p of [64,128,320,1024]){
  const pool=[I(0),I(1),I(-7),['1','-2','2'],['-2','-2','3'],['0','0','-80'],[String((1n<<BigInt(p-1))+5n),String(p),'2'],[String(-((1n<<BigInt(p-1))+3n)),String(p),'-4']];
  for(const rows of [1,2,3,4])for(const inner of [1,2,3,7])for(const columns of [1,3])for(let t=0;t<3;t++)cases.push({rows,inner,columns,left:Array.from({length:rows*inner},(_,i)=>pool[(i+t)%pool.length]).flat(),right:Array.from({length:inner*columns},(_,i)=>pool[(3*i+t+4)%pool.length]).flat()});
 }
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-regulator-mul-')),file=path.join(dir,'oracle.c'),exe=path.join(dir,'oracle');
 fs.writeFileSync(file,`#include "pari.h"
static GEN rd(void){char s[8192];if(scanf("%8191s",s)!=1)exit(2);return gp_read_str(s);}
static GEN scalar(void){GEN m=rd();long p=itos(rd());GEN ee=rd();if(p==-1)return m;if(p==-2)return gdiv(m,ee);long e=itos(ee);if(!signe(m))return real_0_bit(e);GEN x=itor(m,p);setexpo(x,e);return x;}
static GEN matrix(long r,long c){GEN a=cgetg(c+1,t_MAT);for(long j=1;j<=c;j++){gel(a,j)=cgetg(r+1,t_COL);for(long i=1;i<=r;i++)gcoeff(a,i,j)=scalar();}return a;}
static void ps(GEN x){long e;if(typ(x)==t_INT){pari_printf("\\"%Ps\\",\\"-1\\",\\"0\\"",x);return;}if(typ(x)==t_FRAC){pari_printf("\\"%Ps\\",\\"-2\\",\\"%Ps\\"",gel(x,1),gel(x,2));return;}pari_printf("\\"%Ps\\",\\"%ld\\",\\"%ld\\"",signe(x)?mantissa_real(x,&e):gen_0,signe(x)?bit_prec(x):0,expo(x));}
int main(void){pari_init(64000000,1000);long count=itos(rd());for(long t=0;t<count;t++){pari_sp av=avma;long r=itos(rd()),k=itos(rd()),c=itos(rd());GEN a=matrix(r,k),b=matrix(k,c),z=RgM_mul(a,b);putchar('[');for(long j=1;j<=c;j++)for(long i=1;i<=r;i++){if(i>1||j>1)putchar(',');ps(gcoeff(z,i,j));}puts("]");avma=av;}pari_close();return 0;}`);
 run('cc',['-O1','-fsanitize=undefined','-fno-sanitize-recover=undefined','-I'+path.join(pari,'src/headers'),'-I'+lib,file,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',exe]);
 const trace=run(exe,[],{input:[cases.length,...cases.flatMap(r=>[r.rows,r.inner,r.columns,...r.left,...r.right])].join(' ')}),expected=trace.trim().split('\n').map(JSON.parse);
 const frontier=r=>[...r.left,...r.right].filter((_,i)=>i%3===1).every(x=>BigInt(x)<0n);
 run('python3',['-c',`import sys,json,importlib
sys.path[:0]=sys.argv[1:3];f=importlib.import_module('bench.pari-class-group-port.regulator_matrix_product').pari_regulator_matrix_product
for ix,(r,e) in enumerate(zip(*json.load(sys.stdin))):
 a=list(map(int,r['left']));b=list(map(int,r['right']));out=[77]*(3*r['rows']*r['columns']);s=f(a,b,r['rows'],r['inner'],r['columns'],out)
 if all(x<0 for x in (a+b)[1::3]): assert s==-1 and all(x==77 for x in out)
 else: assert s==0 and out==list(map(int,e)),(ix,s,out,e)
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify([cases,expected])});
 const summary={cases:cases.length,exactFrontiers:cases.filter(frontier).length,traceSha256:createHash('sha256').update(trace).digest('hex'),ubsan:true,qualifiedTiming:false};
 if(process.argv.includes('--source-only')){console.log(JSON.stringify(summary));return;}
 const built=await compileKernel({sourcePath:path.join(__dirname,'regulator_matrix_product.py')}),f=require(built.modulePath).pari_regulator_matrix_product;assert(f.nativeAvailable);
 for(const backend of ['javascript','gmp'])for(let i=0;i<cases.length;i++){
  const r=cases[i],size=3*r.rows*r.columns,initial=Array(size).fill(77n),out=backend==='gmp'?f.createIntegerBuffer(size,64,initial):initial;
  assert.equal(f[backend](r.left.map(BigInt),r.right.map(BigInt),BigInt(r.rows),BigInt(r.inner),BigInt(r.columns),out),frontier(r)?-1n:0n);
  assert.deepEqual(backend==='gmp'?out.toArray():out,frontier(r)?Array(size).fill(77n):expected[i].map(BigInt),backend+' '+i);
 }
 console.log(JSON.stringify({...summary,coreBytes:fs.statSync(built.coreSourcePath).size}));
})().catch(e=>{console.error(e);process.exitCode=1;});
