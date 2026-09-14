"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {compileKernel}=require('../../tools/native-kernel/compiler.cjs');
function run(c,a,o={}){const r=spawnSync(c,a,{encoding:'utf8',timeout:180000,maxBuffer:64*1024*1024,...o});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
(async()=>{
 const pari=path.resolve(process.argv[2]),archive=path.resolve(process.argv[3]),lib=path.join(pari,'Olinux-x86_64');
 assert.equal(createHash('sha256').update(fs.readFileSync(archive)).digest('hex'),'02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53');
 const source=run('tar',['-xOf',archive,'pari-2.17.4/src/basemath/buch2.c']),a=source.indexOf('static GEN\ni2print('),b=source.indexOf('static GEN\nget_clg2(',a);assert(a>=0&&b>a);
 const cases=[],I=x=>[String(x),'-1','0'];
 function R(n,p=128,e=0){if(n===0)return ['0','0',String(e-p)];let m=BigInt(n),s=m<0n?-1n:1n;m*=s;const bits=m.toString(2).length;return[String(s*(m<<BigInt(p-bits))),String(p),String(e+bits-1)];}
 for(const precision of [64,128,192])for(let rows=1;rows<=3;rows++)for(const columns of [rows,rows+2,7,8])for(const denominator of [1,2,3])for(const factor of [1,2,3,4,5,6]){
  const values=[];for(let j=0;j<columns;j++)for(let i=0;i<rows;i++){
   if(j<rows)values.push(...R(i===j?1:0,precision));
   else if(i===j%rows)values.push(denominator===1?'1':'1',denominator===1?'-1':'-2',denominator===1?'0':String(denominator));
   else values.push(...I(0));
  }
  cases.push({rows,columns,values,multiple:R(factor,precision,-1),zeta:R(1,precision),denominator});
 }
 // Rounded rational coordinates, including negative entries and the
 // 32-bit approximation-margin rejection, not only exact fractions.
 for(const precision of [64,128,192])for(let rows=1;rows<=3;rows++)for(const d of [2,3,5])for(const perturb of [0n,1n,1n<<40n]){
  const columns=rows+2,values=[];
  for(let j=0;j<columns;j++)for(let i=0;i<rows;i++){
   if(j<rows)values.push(...R(i===j?1:0,precision));
   else if(i===j%rows){const e=-Math.ceil(Math.log2(d)),m=((1n<<BigInt(precision-1-e))+BigInt(Math.floor(d/2)))/BigInt(d)+perturb;values.push(String(j%2?-m:m),String(precision),String(e));}
   else values.push(...R(0,precision));
  }
  cases.push({rows,columns,values,multiple:R(2*d,precision),zeta:R(1,precision)});
 }
 // Acceptance cutoffs use PARI's binary64 conversion, not exact comparison.
 for(const [num,den,e] of [[3n,4n,-1],[13n,10n,0],[19n,40n,-2]])for(const delta of [-2n,-1n,0n,1n,2n]){
  const p=128,m=((num<<BigInt(p-1-e))+den/2n)/den+delta;
  cases.push({rows:1,columns:1,values:R(1,p),multiple:[String(m),String(p),String(e)],zeta:R(1,p)});
 }
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-regulator-reconstruct-')),file=path.join(dir,'oracle.c'),exe=path.join(dir,'oracle');
 fs.writeFileSync(file,`/* PARI 2.17.4 source-extracted compute_R, GPL-2.0-or-later. */
#include "pari.h"
#include "paripriv.h"
${source.slice(a,b)}
static GEN rd(void){char s[8192];if(scanf("%8191s",s)!=1)exit(2);return gp_read_str(s);}
static GEN scalar(void){GEN m=rd();long p=itos(rd());GEN ee=rd();if(p==-1)return m;if(p==-2)return gdiv(m,ee);long e=itos(ee);if(!signe(m))return real_0_bit(e);GEN x=itor(m,p);setexpo(x,e);return x;}
static void ps(GEN x){long e;pari_printf("\\"%Ps\\",\\"%ld\\",\\"%ld\\"",signe(x)?mantissa_real(x,&e):gen_0,signe(x)?bit_prec(x):0,expo(x));}
int main(void){pari_init(64000000,1000);long count=itos(rd());for(long t=0;t<count;t++){pari_sp av=avma;long rows=itos(rd()),cols=itos(rd());GEN A=cgetg(cols+1,t_MAT);for(long j=1;j<=cols;j++){gel(A,j)=cgetg(rows+1,t_COL);for(long i=1;i<=rows;i++)gcoeff(A,i,j)=scalar();}GEN R=scalar(),z=scalar(),L=NULL;long reason=compute_R(A,z,&L,&R);printf("{\\"reason\\":%ld,\\"regulator\\":[",reason);ps(R);printf("],\\"relations\\":[");if(L)for(long j=1;j<lg(L);j++)for(long i=1;i<lgcols(L);i++){if(j>1||i>1)putchar(',');pari_printf("\\"%Ps\\"",gcoeff(L,i,j));}puts("]}");avma=av;}pari_close();return 0;}`);
 run('cc',['-O1','-fsanitize=undefined','-fno-sanitize-recover=undefined','-I'+path.join(pari,'src/headers'),'-I'+lib,file,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',exe]);
 const trace=run(exe,[],{input:[cases.length,...cases.flatMap(r=>[r.rows,r.columns,...r.values,...r.multiple,...r.zeta])].join(' ')}),expected=trace.trim().split('\n').map(JSON.parse);
 const frontiers=JSON.parse(run('python3',['-c',`import sys,json,importlib,copy
sys.path[:0]=sys.argv[1:3];f=importlib.import_module('bench.pari-class-group-port.regulator_reconstruction').pari_regulator_reconstruction
frontiers=[]
for ix,(r,e) in enumerate(zip(*json.load(sys.stdin))):
 n=r['rows'];c=r['columns'];s=n*c
 args=[list(map(int,r['values'])),n,c,list(map(int,r['multiple'])),list(map(int,r['zeta'])),[77]*(3*s),[77]*s,[77]*s,[77]*n,[77]*s,[77]*12,[77]*3,[77]*s,[77],[77]*4]
 reason=f(*args)
 if reason==-1:
  assert c>7
  frontiers.append(ix)
 else:
  assert reason==e['reason'],(ix,reason,e,args[14])
  assert args[11]==(list(map(int,e['regulator'])) if reason==0 else [77]*3),(ix,args[11],e)
  assert args[12]==(list(map(int,e['relations'])) if reason==0 else [77]*s),(ix,args[12],e)
# Invalid shapes and owners must reject before changing any workspace.
base=[[1,-1,0],1,1,[1<<127,128,0],[1<<127,128,0],[77]*3,[77],[77],[77],[77],[77]*12,[77]*3,[77],[77],[77]*4]
for slot,replacement in [(2,0),(5,[]),(10,[77]*11),(14,[77]*3),(3,[0,0,0])]:
 args=copy.deepcopy(base);args[slot]=replacement;before=copy.deepcopy(args)
 try:f(*args)
 except ValueError:pass
 else:raise AssertionError(('expected rejection',slot))
 assert args==before,slot
print(json.dumps(frontiers))
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify([cases,expected])}));
 const summary={cases:cases.length,widthFrontiers:frontiers.length,sourceReasons:expected.reduce((a,e)=>(a[e.reason]=(a[e.reason]||0)+1,a),{}),translatedReasons:expected.reduce((a,e,i)=>(frontiers.includes(i)?a:(a[e.reason]=(a[e.reason]||0)+1,a)),{}),atomicRejectionsPerBackend:5,traceSha256:createHash('sha256').update(trace).digest('hex'),ubsan:true,qualifiedTiming:false};
 if(process.argv.includes('--source-only')){console.log(JSON.stringify(summary));return;}
 const built=await compileKernel({sourcePath:path.join(__dirname,'regulator_reconstruction.py')}),f=require(built.modulePath).pari_regulator_reconstruction;assert(f.nativeAvailable);
 for(const backend of ['javascript','gmp'])for(let i=0;i<cases.length;i++){
  const r=cases[i],e=expected[i],n=r.rows,c=r.columns,s=n*c,make=k=>backend==='gmp'?f.createIntegerBuffer(k,128,Array(k).fill(77n)):Array(k).fill(77n),view=x=>Array.isArray(x)?x:x.toArray();
  const args=[r.values.map(BigInt),BigInt(n),BigInt(c),r.multiple.map(BigInt),r.zeta.map(BigInt),make(3*s),make(s),make(s),make(n),make(s),Array(12).fill(77n),make(3),make(s),make(1),Array(4).fill(77n)],reason=f[backend](...args);
  assert.equal(reason,frontiers.includes(i)?-1n:BigInt(e.reason),backend+' '+i);
  assert.deepEqual(view(args[11]),reason===0n?e.regulator.map(BigInt):Array(3).fill(77n));assert.deepEqual(view(args[12]),reason===0n?e.relations.map(BigInt):Array(s).fill(77n));
 }
 for(const backend of ['javascript','gmp'])for(const [slot,replacement] of [[2,0n],[5,[]],[10,Array(11).fill(77n)],[14,Array(3).fill(77n)],[3,[0n,0n,0n]]]){
  const make=k=>backend==='gmp'?f.createIntegerBuffer(k,128,Array(k).fill(77n)):Array(k).fill(77n),view=x=>typeof x==='bigint'?x:Array.isArray(x)?x.slice():x.toArray();
  const args=[[1n,-1n,0n],1n,1n,[1n<<127n,128n,0n],[1n<<127n,128n,0n],make(3),make(1),make(1),make(1),make(1),Array(12).fill(77n),make(3),make(1),make(1),Array(4).fill(77n)];
  args[slot]=replacement;const before=args.map(view);assert.throws(()=>f[backend](...args));assert.deepEqual(args.map(view),before,backend+' atomic '+slot);
 }
 console.log(JSON.stringify({...summary,coreBytes:fs.statSync(built.coreSourcePath).size}));
})().catch(e=>{console.error(e);process.exitCode=1;});
