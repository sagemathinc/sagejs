"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {compileKernel}=require('../../tools/native-kernel/compiler.cjs');
function run(c,a,o={}){const r=spawnSync(c,a,{encoding:'utf8',timeout:120000,maxBuffer:32*1024*1024,...o});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
function part(s,a,b){const i=s.indexOf(a),j=s.indexOf(b,i);assert(i>=0&&j>i);return s.slice(i,j);}
(async()=>{
 const pari=path.resolve(process.argv[2]),archive=path.resolve(process.argv[3]),lib=path.join(pari,'Olinux-x86_64');
 assert.equal(createHash('sha256').update(fs.readFileSync(archive)).digest('hex'),'02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53');
 const source=run('tar',['-xOf',archive,'pari-2.17.4/src/basemath/ZV.c']);assert.equal(source,fs.readFileSync(path.join(pari,'src/basemath/ZV.c'),'utf8'));
 let body=part(source,'static GEN\nZM_mul_i(','GEN\nZM_mul(GEN x');
 body=body.replace('ZM_mul_i(','oracle_mul_i(').replace('ZM_max_lg_i(x, lx, l)','ZM_max_lg(x)').replace('ZM_max_lg_i(y, ly, lx)','ZM_max_lg(y)').replace('return ZM_mul_fast(x,y, lx,ly, sx,sy);','{ status=-2; return cgetg(1,t_MAT); }').replace('return ZM_mul_classical(x, y, l, lx, ly);','return ZM_mul(x,y);').replace('return ZM_mul_sw(x, y, l - 1, lx - 1, ly - 1);','{ status=-1; return cgetg(1,t_MAT); }');
 const bound=part(source,'static long\nsw_bound(','/* assume lx > 1');
 let seed=12345;const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return BigInt(seed%17-8);};
 const cases=[];function add(rows,inner,cols,bits){const next=()=>{const r=rnd();return (r*(1n<<BigInt(bits))+r).toString();};cases.push({rows,inner,cols,a:Array.from({length:rows*inner},next),b:Array.from({length:inner*cols},next)});}
 for(const bits of [0,64,512,832,896,2048,4096])for(const shape of [[0,0,0],[1,0,2],[0,3,2],[2,3,0],[1,1,1],[2,2,2],[1,4,3],[4,1,3],[3,4,1],[3,3,3],[4,5,3],[8,8,8]])add(...shape,bits);
 for(const shape of [[31,31,31],[32,32,32],[70,70,70]])add(...shape,0);
 for(const bits of [831,832,895,896])cases.push({rows:2,inner:2,cols:2,a:Array.from({length:4},(_,i)=>String((1n<<BigInt(bits))+BigInt(i+1))),b:Array.from({length:4},(_,i)=>String(-((1n<<BigInt(bits))+BigInt(i+5))))});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-exact-matmul-')),c=path.join(dir,'oracle.c'),exe=path.join(dir,'oracle');
 fs.writeFileSync(c,`/* Source-extracted PARI dispatch, GPL-2.0-or-later. */
#include "pari.h"
#include "paripriv.h"
static long status;
${bound}\n${body}
static GEN readint(void){char s[8192];if(scanf("%8191s",s)!=1)exit(2);return gp_read_str(s);}
static GEN mat(long r,long c){GEN a=cgetg(c+1,t_MAT);for(long j=1;j<=c;j++){gel(a,j)=cgetg(r+1,t_COL);for(long i=1;i<=r;i++)gcoeff(a,i,j)=readint();}return a;}
int main(void){pari_init(128000000,1000);if(sizeof(long)!=8||ZM2_MUL_LIMIT!=14)return 3;long n=itos(readint());for(long t=0;t<n;t++){pari_sp av=avma;long rows=itos(readint()),inner=itos(readint()),cols=itos(readint());GEN a=mat(rows,inner),b=mat(inner,cols);status=0;GEN z=inner&&cols?oracle_mul_i(a,b,rows+1,inner+1,cols+1):ZM_mul(a,b);printf("{\\"status\\":%ld,\\"out\\":[",status);long first=1;for(long j=1;j<lg(z);j++)for(long i=1;i<lg(gel(z,j));i++){if(!first)putchar(',');first=0;pari_printf("\\"%Ps\\"",gcoeff(z,i,j));}puts("]}");avma=av;}pari_close();return 0;}`);
 run('cc',['-O2','-I'+path.join(pari,'src/headers'),'-I'+lib,c,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',exe]);
 const trace=run(exe,[],{input:[cases.length,...cases.flatMap(r=>[r.rows,r.inner,r.cols,...r.a,...r.b])].join(' ')}),expected=trace.trim().split('\n').map(JSON.parse);
 run('python3',['-c',`import sys,json,importlib
sys.path[:0]=sys.argv[1:3];f=importlib.import_module('bench.pari-class-group-port.integer_matrix_product').pari_integer_matrix_product
d=json.load(sys.stdin)
for r,e in zip(d['cases'],d['expected']):
 out=[77]*(r['rows']*r['cols']);s=f(list(map(int,r['a'])),list(map(int,r['b'])),r['rows'],r['inner'],r['cols'],out);assert s==e['status'],(r,s,e)
 want=list(map(int,e['out'])) if s==0 and r['inner'] else []
 assert out[:len(want)]==want and out[len(want):]==[77]*(len(out)-len(want)),(r,e,out)
for which in range(4):
 args=[[1]*6,[1]*6,2,3,2,[77]*4]
 if which==0:args[2]=-1
 elif which==1:args[0]=[]
 elif which==2:args[1]=[]
 else:args[5]=[77]*3
 before=str(args)
 try:f(*args)
 except ValueError:pass
 else:raise AssertionError('invalid matrix shape accepted')
 assert str(args)==before
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify({cases,expected})});
 const built=await compileKernel({sourcePath:path.join(__dirname,'integer_matrix_product.py')}),f=require(built.modulePath).pari_integer_matrix_product;assert(f.nativeAvailable);
 for(const backend of ['javascript','gmp'])for(let i=0;i<cases.length;i++){const r=cases[i],e=expected[i],initial=Array(r.rows*r.cols).fill(77n),make=v=>backend==='gmp'?f.createIntegerBuffer(v.length,256,v):v,out=make(initial);assert.equal(f[backend](make(r.a.map(BigInt)),make(r.b.map(BigInt)),BigInt(r.rows),BigInt(r.inner),BigInt(r.cols),out),BigInt(e.status));const want=e.status===0&&r.inner?e.out.map(BigInt):[];assert.deepEqual(backend==='gmp'?out.toArray():out,[...want,...Array(initial.length-want.length).fill(77n)]);}
 for(const backend of ['javascript','gmp'])for(let which=0;which<4;which++){const args=[Array(6).fill(1n),Array(6).fill(1n),2n,3n,2n,Array(4).fill(77n)];if(which===0)args[2]=-1n;else if(which===1)args[0]=[];else if(which===2)args[1]=[];else args[5]=Array(3).fill(77n);const before=args.map(x=>Array.isArray(x)?x.slice():x);assert.throws(()=>f[backend](...args));assert.deepEqual(args,before);}
 console.log(JSON.stringify({cases:cases.length,invalidShapesRejected:4,completed:expected.filter(e=>e.status===0).length,strassen:expected.filter(e=>e.status===-1).length,crt:expected.filter(e=>e.status===-2).length,traceSha256:createHash('sha256').update(trace).digest('hex'),coreBytes:fs.statSync(built.coreSourcePath).size}));
})().catch(e=>{console.error(e);process.exitCode=1;});
