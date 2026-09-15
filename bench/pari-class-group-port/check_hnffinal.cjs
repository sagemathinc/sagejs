"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {compileKernel}=require('../../tools/native-kernel/compiler.cjs');
function run(c,a,o={}){const r=spawnSync(c,a,{encoding:'utf8',timeout:120000,maxBuffer:64*1024*1024,...o});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
(async()=>{
 const pari=path.resolve(process.argv[2]),archive=path.resolve(process.argv[3]),lib=path.join(pari,'Olinux-x86_64');
 assert.equal(createHash('sha256').update(fs.readFileSync(archive)).digest('hex'),'02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53');
 const source=run('tar',['-xOf',archive,'pari-2.17.4/src/basemath/hnf_snf.c']);assert.equal(source,fs.readFileSync(path.join(pari,'src/basemath/hnf_snf.c'),'utf8'));
 const start=source.indexOf('static GEN\nhnffinal('),end=source.indexOf('/* for debugging */',start);assert(start>=0&&end>start);const body=source.slice(start,end);
 const logs=JSON.parse(run(process.execPath,[path.join(__dirname,'check_log_embedding.cjs'),pari,'--export-fixtures']));
 const cases=[];let seed=619;function random(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return BigInt(seed%11-5);}
 function add(rows,cols,depRows,tail,A,D,B,perm,kind){const total=cols+tail;cases.push({rows,cols,depRows,total,logRows:3,A:A.map(String),D:D.map(String),B:B.map(String),perm,logs:Array.from({length:total},(_,j)=>logs[(cases.length%4)*20+j%20].expected).flat(),kind});}
 for(let rows=0;rows<=4;rows++)for(let extra=1;extra<=3;extra++)for(const depRows of [0,1,3])for(const tail of [0,2]){
  const cols=rows+extra,A=Array(rows*cols).fill(0n);
  for(let j=0;j<rows;j++)for(let i=0;i<=j;i++)A[(extra+j)*rows+i]=i===j?BigInt(1+(rows+j)%4):random();
  for(let j=0;j<cols;j++)for(let i=0;i<rows;i++)A[j*rows+i]+=2n*A[((j+1)%cols)*rows+i];
  const weights=Array.from({length:depRows*rows},random),D=Array.from({length:depRows*cols},(_,idx)=>{const j=Math.floor(idx/depRows),i=idx%depRows;let v=0n;for(let k=0;k<rows;k++)v+=weights[i*rows+k]*A[j*rows+k];return v;});
  add(rows,cols,depRows,tail,A,D,Array.from({length:(rows+depRows)*tail},random),Array.from({length:rows+depRows},(_,i)=>rows+depRows-i),'synthetic');
 }
 const assembly=JSON.parse(run(process.execPath,[path.join(__dirname,'check_hnfspec_assembly.cjs'),pari,archive,'--export-hnffinal-fixtures']));
 for(const r of assembly)if(r.input.kind==='collector'&&r.expected.state[2]>0){const e=r.expected;add(e.state[0],e.state[2],e.state[1],e.state[4],e.matbnew,e.dep,e.B,e.perm,'collector');}
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-hnffinal-')),c=path.join(dir,'oracle.c'),exe=path.join(dir,'oracle');
 fs.writeFileSync(c,`/* Source-extracted PARI2.17.4 hnffinal; GPL-2.0-or-later. */
#include "pari.h"
#include "paripriv.h"
#define DEBUGLEVEL DEBUGLEVEL_mathnf
${body}
static GEN rd(void){char s[8192];if(scanf("%8191s",s)!=1)exit(2);return gp_read_str(s);}
static GEN mat(long r,long c){GEN a=cgetg(c+1,t_MAT);for(long j=1;j<=c;j++){gel(a,j)=cgetg(r+1,t_COL);for(long i=1;i<=r;i++)gcoeff(a,i,j)=rd();}return a;}
static GEN scalar(void){GEN m=rd();long p=itos(rd()),e=itos(rd());if(p==-1)return m;if(!signe(m))return real_0_bit(e);GEN x=itor(m,p);setexpo(x,e);return x;}
static void printmat(GEN a){putchar('[');long first=1;for(long j=1;j<lg(a);j++)for(long i=1;i<lg(gel(a,j));i++){if(!first)putchar(',');first=0;pari_printf("\\"%Ps\\"",gcoeff(a,i,j));}putchar(']');}
static void ps(GEN x){long e;if(typ(x)==t_INT){pari_printf("\\"%Ps\\",\\"-1\\",\\"0\\"",x);return;}pari_printf("\\"%Ps\\",\\"%ld\\",\\"%ld\\"",signe(x)?mantissa_real(x,&e):gen_0,signe(x)?bit_prec(x):0,expo(x));}
int main(void){pari_init(128000000,1000);long count=itos(rd());for(long t=0;t<count;t++){pari_sp av=avma;long rows=itos(rd()),cols=itos(rd()),dr=itos(rd()),total=itos(rd()),lr=itos(rd()),pn=itos(rd());GEN A=mat(rows,cols),dep=mat(dr,cols),B=mat(rows+dr,total-cols),perm=cgetg(pn+1,t_VECSMALL);for(long i=1;i<=pn;i++)perm[i]=itos(rd());GEN C=cgetg(total+1,t_MAT);for(long j=1;j<=total;j++){gel(C,j)=cgetg(lr+1,t_COL);for(long i=1;i<=lr;i++){long kind=itos(rd());GEN re=scalar(),im=scalar();gcoeff(C,i,j)=kind==1?re:mkcomplex(re,im);}}GEN H=hnffinal(A,perm,&dep,&B,&C);printf("{\\"H\\":");printmat(H);printf(",\\"D\\":");printmat(dep);printf(",\\"B\\":");printmat(B);printf(",\\"C\\":[");long first=1;for(long j=1;j<lg(C);j++)for(long i=1;i<lg(gel(C,j));i++){if(!first)putchar(',');first=0;GEN x=gcoeff(C,i,j);if(typ(x)==t_COMPLEX){printf("\\"2\\",");ps(gel(x,1));putchar(',');ps(gel(x,2));}else{printf("\\"1\\",");ps(x);printf(",\\"0\\",\\"-1\\",\\"0\\"");}}printf("],\\"perm\\":[");for(long i=1;i<=pn;i++){if(i>1)putchar(',');printf("%ld",perm[i]);}long nr=lg(H)-1,s=rows-nr;printf("],\\"state\\":[%ld,%ld,%ld,%ld,%ld,%ld,0]}\\n",nr,cols-s,lg(B)-1,dr,cols-rows,s);avma=av;}pari_close();return 0;}`);
 run('cc',['-O1','-fsanitize=undefined','-fno-sanitize-recover=undefined','-I'+path.join(pari,'src/headers'),'-I'+lib,c,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',exe]);
 const trace=run(exe,[],{input:[cases.length,...cases.flatMap(r=>[r.rows,r.cols,r.depRows,r.total,r.logRows,r.perm.length,...r.A,...r.D,...r.B,...r.perm,...r.logs])].join(' ')}),expected=trace.trim().split('\n').map(JSON.parse);
 run('python3',['-c',`import sys,json,importlib
sys.path[:0]=sys.argv[1:3];f=importlib.import_module('bench.pari-class-group-port.hnffinal').pari_hnffinal_nonempty
tail_guard=False;dep_guard=False
for r,e in zip(*json.load(sys.stdin)):
 n=r['rows'];c=r['cols'];dr=r['depRows'];total=r['total'];lr=r['logRows'];lig=n+dr;tail=total-c
 perm=r['perm'][:];H=[77]*(n*n);D=[77]*(dr*n);B=[77]*(lig*(tail+n));C=[77]*(7*lr*total);state=[77]*7
 args=[list(map(int,r['A'])),n,c,perm,list(map(int,r['D'])),dr,list(map(int,r['B'])),total,list(map(int,r['logs'])),lr,[0]*(n*c),[0]*(c*c),[0]*(c*c),[0]*(c+1),[0]*11,[0]*(dr*c),[0]*(lig*tail),[0]*(7*lr*total),[0]*n,[0]*len(perm),H,D,B,C,state]
 assert f(*args)==0
 assert state==e['state'] and perm==e['perm'],(r,state,e)
 for actual,key in [(H,'H'),(D,'D'),(B,'B'),(C,'C')]:
  want=list(map(int,e[key]));assert actual==want+[77]*(len(actual)-len(want)),(r,key,actual,want)
 if tail and not tail_guard:
  bad=args[:];bad[8]=args[8][:];bad[8][c*lr*7]=9;before=str(bad)
  try:f(*bad)
  except ValueError:pass
  else:raise AssertionError('invalid trailing log accepted')
  assert str(bad)==before;tail_guard=True
 if dr and n and c>n and not dep_guard:
  bad=args[:];bad[4]=[0]*(dr*c);k=next(k for k in range(c) if args[11][k]);bad[4][k*dr]=1
  before=str((H,D,B,C,perm))
  try:f(*bad)
  except ValueError:pass
  else:raise AssertionError('independent dep row accepted')
  assert str((H,D,B,C,perm))==before and state==[-1]*7;dep_guard=True
assert tail_guard and dep_guard
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify([cases,expected])});
 const built=await compileKernel({sourcePath:path.join(__dirname,'hnffinal.py')}),f=require(built.modulePath).pari_hnffinal_nonempty;assert(f.nativeAvailable);
 const guards={};for(const backend of ['javascript','gmp']){let tailGuard=false,depGuard=false;for(let ix=0;ix<cases.length;ix++){
  const r=cases[ix],e=expected[ix],n=r.rows,c=r.cols,dr=r.depRows,total=r.total,lr=r.logRows,lig=n+dr,tail=total-c;
  const make=(size,value=0n)=>backend==='gmp'?f.createIntegerBuffer(size,256,Array(size).fill(value)):Array(size).fill(value),view=x=>Array.isArray(x)?x:x.toArray();
  const perm=r.perm.map(BigInt),H=make(n*n,77n),D=make(dr*n,77n),B=make(lig*(tail+n),77n),C=make(7*lr*total,77n),state=Array(7).fill(77n);
  const args=[r.A.map(BigInt),BigInt(n),BigInt(c),perm,r.D.map(BigInt),BigInt(dr),r.B.map(BigInt),BigInt(total),r.logs.map(BigInt),BigInt(lr),make(n*c),make(c*c),make(c*c),make(c+1),Array(11).fill(0n),make(dr*c),make(lig*tail),make(7*lr*total),Array(n).fill(0n),Array(perm.length).fill(0n),H,D,B,C,state];assert.equal(f[backend](...args),0n);
  assert.deepEqual(state,e.state.map(BigInt));assert.deepEqual(perm,e.perm.map(BigInt));
  for(const [x,key]of [[H,'H'],[D,'D'],[B,'B'],[C,'C']]){const v=view(x),want=e[key].map(BigInt);assert.deepEqual(v,[...want,...Array(v.length-want.length).fill(77n)],backend+' '+ix+' '+key);}
  if(tail&&!tailGuard){const bad=args.slice();bad[8]=args[8].slice();bad[8][c*lr*7]=9n;const before=bad.map(x=>typeof x==='bigint'?x:Array.isArray(x)?x.slice():view(x));assert.throws(()=>f[backend](...bad));assert.deepEqual(bad.map(x=>typeof x==='bigint'?x:Array.isArray(x)?x.slice():view(x)),before);tailGuard=true;}
  if(dr&&n&&c>n&&!depGuard){const bad=args.slice();bad[4]=Array(dr*c).fill(0n);const k=view(args[11]).slice(0,c).findIndex(v=>v!==0n);assert(k>=0);bad[4][k*dr]=1n;const before=[H,D,B,C,perm].map(view);assert.throws(()=>f[backend](...bad));assert.deepEqual([H,D,B,C,perm].map(view),before);assert.deepEqual(state,Array(7).fill(-1n));depGuard=true;}
 }assert(tailGuard&&depGuard);guards[backend]=2;}
 console.log(JSON.stringify({cases:cases.length,collectorMatrices:cases.filter(r=>r.kind==='collector').length,guards,traceSha256:createHash('sha256').update(trace).digest('hex'),coreBytes:fs.statSync(built.coreSourcePath).size,qualifiedTiming:false}));
})().catch(e=>{console.error(e);process.exitCode=1;});
