"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {compileKernel}=require('../../tools/native-kernel/compiler.cjs');
function run(c,a,o={}){const r=spawnSync(c,a,{encoding:'utf8',timeout:120000,maxBuffer:32*1024*1024,...o});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
(async()=>{
 const pari=path.resolve(process.argv[2]),archive=path.resolve(process.argv[3]),lib=path.join(pari,'Olinux-x86_64');
 assert.equal(createHash('sha256').update(fs.readFileSync(archive)).digest('hex'),'02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53');
 for(const file of ['RgV.c','gen1.c'])assert.equal(run('tar',['-xOf',archive,'pari-2.17.4/src/basemath/'+file]),fs.readFileSync(path.join(pari,'src/basemath',file),'utf8'));
 const cases=[];
 const integer=x=>[BigInt(x),-1n,0n],real=(x,p=128n,e=2n)=>x===0?[0n,0n,e]:[BigInt(x)<0n?-((1n<<(p-1n))+BigInt(-x)):((1n<<(p-1n))+BigInt(x)),p,e];
 const scalar=t=>[1n,...t,0n,-1n,0n],complex=(a,b)=>[2n,...a,...b];
 const entries=[scalar(real(1)),scalar(real(-2)),scalar(real(0)),scalar(integer(0)),scalar(integer(3)),complex(real(7),real(-9)),complex(integer(0),real(1)),complex(real(2),integer(0)),complex(real(-2),integer(5)),complex(real(2),integer(-5)),scalar(real(17,64n,-70n))];
 for(const generic of [false,true])for(const rows of [1,2,4])for(const inner of [1,2,5,11])for(let variant=0;variant<3;variant++){
  const columns=3,input=Array.from({length:rows*inner},(_,i)=>entries[(i+variant)%entries.length]).flat();
  // Ensure generic mode takes the non-rational matrix path even for 1x1.
  const coefficients=Array.from({length:inner*columns},(_,i)=>[0n,1n,-1n,7n,(1n<<80n)+3n,-((1n<<129n)+17n)][(i+variant)%6]);
  cases.push({rows,inner,columns,generic,input:input.map(String),coefficients:coefficients.map(String)});
 }
 const fixtures=JSON.parse(run(process.execPath,[path.join(__dirname,'check_log_embedding.cjs'),pari,'--export-fixtures']));
 for(const generic of [false,true])for(const coefficients of [[1,1,0],[1,1,1],[0,0,0]])cases.push({rows:1,inner:3,columns:1,generic,input:[...complex(real(2),integer(5)),...complex(real(-2),integer(-5)),...scalar(real(0))].map(String),coefficients:coefficients.map(String)});
 for(let group=0;group<4;group++)for(const generic of [false,true]){
  const data=fixtures.slice(group*20,group*20+20),rows=data[0].expected.length/7;
  cases.push({rows,inner:20,columns:3,generic,input:data.flatMap(r=>r.expected),coefficients:Array.from({length:60},(_,i)=>String(i%7===0?(1n<<90n)+1n:BigInt(i%5-2)))});
 }
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-log-transform-')),c=path.join(dir,'oracle.c'),exe=path.join(dir,'oracle');
 fs.writeFileSync(c,`#include "pari.h"
#include "paripriv.h"
static GEN rd(void){char s[4096];if(scanf("%4095s",s)!=1)exit(2);return gp_read_str(s);}
static GEN scalar(void){GEN m=rd();long p=itos(rd()),e=itos(rd());if(p==-1)return m;if(!signe(m))return real_0_bit(e);GEN x=itor(m,p);setexpo(x,e);return x;}
static void emit_scalar(GEN x){long e;if(typ(x)==t_INT){pari_printf("\\"%Ps\\",\\"-1\\",\\"0\\"",x);return;}pari_printf("\\"%Ps\\",\\"%ld\\",\\"%ld\\"",signe(x)?mantissa_real(x,&e):gen_0,signe(x)?bit_prec(x):0,expo(x));}
int main(void){pari_init(32000000,10000);long count=itos(rd());for(long t=0;t<count;t++){pari_sp av=avma;long rows=itos(rd()),inner=itos(rd()),cols=itos(rd()),generic=itos(rd());GEN x=cgetg(inner+1,t_MAT),y=cgetg(cols+1,t_MAT);for(long j=1;j<=inner;j++){GEN v=cgetg(rows+1,t_COL);gel(x,j)=v;for(long i=1;i<=rows;i++){long kind=itos(rd());GEN r=scalar(),im=scalar();gel(v,i)=kind==1?r:mkcomplex(r,im);}}for(long j=1;j<=cols;j++){GEN v=cgetg(inner+1,t_COL);gel(y,j)=v;for(long i=1;i<=inner;i++)gel(v,i)=rd();}GEN z=generic?gmul(x,y):RgM_ZM_mul(x,y);putchar('[');long first=1;for(long j=1;j<lg(z);j++)for(long i=1;i<lg(gel(z,j));i++){if(!first)putchar(',');first=0;GEN a=gcoeff(z,i,j);if(typ(a)==t_COMPLEX){printf("\\"2\\",");emit_scalar(gel(a,1));putchar(',');emit_scalar(gel(a,2));}else{printf("\\"1\\",");emit_scalar(a);printf(",\\"0\\",\\"-1\\",\\"0\\"");}}puts("]");avma=av;}pari_close();return 0;}`);
 run('cc',['-O2','-I'+path.join(pari,'src/headers'),'-I'+lib,c,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',exe]);
 const input=[cases.length,...cases.flatMap(r=>[r.rows,r.inner,r.columns,Number(r.generic),...r.input,...r.coefficients])].join(' ');
 const trace=run(exe,[],{input}),expected=trace.trim().split('\n').map(JSON.parse);assert.equal(expected.length,cases.length);
 run('python3',['-c',`import sys,json,importlib
sys.path[:0]=sys.argv[1:3]
f=importlib.import_module('bench.pari-class-group-port.log_matrix_transform').pari_log_matrix_transform
data=json.load(sys.stdin)
for r,want in zip(data['cases'],data['expected']):
 out=[77]*(7*r['rows']*r['columns']);assert f(list(map(int,r['input'])),list(map(int,r['coefficients'])),r['rows'],r['inner'],r['columns'],r['generic'],out)==0;assert out==list(map(int,want)),(r,out,want)
for entries,inner,output in [([9,0,-1,0,0,-1,0],1,[77]*7),([1,1,64,0,0,-1,0],1,[77]*7),([1,0,-1,0,0,-1,0],1,[77]*7),([1,1<<63,64,0,0,-1,0],1,[77]*6)]:
 before=output[:]
 try:f(entries,[1],1,inner,1,True,output)
 except ValueError:pass
 else:raise AssertionError('malformed input accepted')
 assert output==before
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify({cases,expected})});
 const built=await compileKernel({sourcePath:path.join(__dirname,'log_matrix_transform.py')}),f=require(built.modulePath).pari_log_matrix_transform;assert(f.nativeAvailable);
 for(const backend of ['javascript','gmp'])for(let i=0;i<cases.length;i++){
  const r=cases[i],initial=Array(7*r.rows*r.columns).fill(77n),out=backend==='gmp'?f.createIntegerBuffer(initial.length,64,initial):initial;
  assert.equal(f[backend](r.input.map(BigInt),r.coefficients.map(BigInt),BigInt(r.rows),BigInt(r.inner),BigInt(r.columns),r.generic,out),0n);
  assert.deepEqual(backend==='gmp'?out.toArray():out,expected[i].map(BigInt),backend+' case '+i);
 }
 for(const backend of ['javascript','gmp'])for(const [input,size]of [[[9n,0n,-1n,0n,0n,-1n,0n],7],[[1n,1n,64n,0n,0n,-1n,0n],7],[[1n,0n,-1n,0n,0n,-1n,0n],7],[[1n,1n<<63n,64n,0n,0n,-1n,0n],6]]){
  const initial=Array(size).fill(77n),out=backend==='gmp'?f.createIntegerBuffer(size,64,initial):initial;
  assert.throws(()=>f[backend](input,[1n],1n,1n,1n,true,out));assert.deepEqual(backend==='gmp'?out.toArray():out,Array(size).fill(77n));
 }
 console.log(JSON.stringify({cases:cases.length,actualLogCases:8,invalidInputsRejected:4,backends:['PARI','CPython','javascript','gmp'],traceSha256:createHash('sha256').update(trace).digest('hex'),coreBytes:fs.statSync(built.coreSourcePath).size}));
})().catch(e=>{console.error(e);process.exitCode=1;});
