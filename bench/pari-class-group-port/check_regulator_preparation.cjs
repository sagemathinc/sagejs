"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {compileKernel}=require('../../tools/native-kernel/compiler.cjs');
function run(c,a,o={}){const r=spawnSync(c,a,{encoding:'utf8',timeout:120000,maxBuffer:32*1024*1024,...o});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
(async()=>{
 const pari=path.resolve(process.argv[2]),archive=path.resolve(process.argv[3]),lib=path.join(pari,'Olinux-x86_64');
 assert.equal(createHash('sha256').update(fs.readFileSync(archive)).digest('hex'),'02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53');
 const source=run('tar',['-xOf',archive,'pari-2.17.4/src/basemath/buch2.c']);
 const start=source.indexOf('static GEN\nclean_cols('),end=source.indexOf('/* Ar =',start);assert(start>=0&&end>start);const body=source.slice(start,end);
 const cases=[],exponents=[-33,-32,-31,-3,-2,-1,0,1];
 for(let rows=2;rows<=4;rows++)for(let degree=rows;degree<=2*rows;degree++)for(let columns=0;columns<=7;columns++){
  const entries=Array.from({length:rows*columns},(_,i)=>{const v=(i+degree+columns)%7,e=exponents[(i+columns)%exponents.length];return v===0?['0','-1','0']:v===1?['-2','-1','0']:v===2?['0','0',String(e)]:[String((v%2?-1n:1n)*(1n<<63n)),'64',String(e)];}).flat();
  cases.push({rows,degree,columns,entries,occupied:Array.from({length:rows},(_,i)=>columns%3===0&&i===rows-1?1:0)});
 }
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-regulator-prep-')),c=path.join(dir,'oracle.c'),exe=path.join(dir,'oracle');
 fs.writeFileSync(c,`/* Literal PARI2.17.4 clean_cols/pivot; GPL-2.0-or-later. */
#include "pari.h"
#include "paripriv.h"
${body}
static GEN rd(void){char s[8192];if(scanf("%8191s",s)!=1)exit(2);return gp_read_str(s);}
static GEN scalar(void){GEN m=rd();long p=itos(rd()),e=itos(rd());if(p==-1)return m;if(!signe(m))return real_0_bit(e);GEN x=itor(m,p);setexpo(x,e);return x;}
static void ps(GEN x){long e;if(typ(x)==t_INT){pari_printf("\\"%Ps\\",\\"-1\\",\\"0\\"",x);return;}pari_printf("\\"%Ps\\",\\"%ld\\",\\"%ld\\"",signe(x)?mantissa_real(x,&e):gen_0,signe(x)?bit_prec(x):0,expo(x));}
int main(void){pari_init(16000000,1000);if(sizeof(long)!=8||HIGHEXPOBIT!=(1UL<<61))return 3;long count=itos(rd());for(long t=0;t<count;t++){pari_sp av=avma;long rows=itos(rd()),degree=itos(rd()),cols=itos(rd());GEN A=cgetg(cols+1,t_MAT),occupied=cgetg(rows+1,t_VECSMALL);for(long i=1;i<=rows;i++)occupied[i]=itos(rd());for(long j=1;j<=cols;j++){gel(A,j)=cgetg(rows+1,t_COL);for(long i=1;i<=rows;i++)gcoeff(A,i,j)=scalar();}int prec=0;GEN B=clean_cols(A,&prec),T=cgetg(rows+1,t_COL);long r1=2*rows-degree;for(long i=1;i<=rows;i++)gel(T,i)=i<=r1?gen_1:gen_2;GEN M=shallowconcat(T,B);printf("{\\"state\\":[%ld,%d,%ld],\\"selected\\":[0",lg(M)-1,prec,r1);for(long j=1;j<lg(B);j++){long k=1;while(gel(A,k)!=gel(B,j))k++;printf(",%ld",k);}printf("],\\"values\\":[");long first=1;for(long j=1;j<lg(M);j++)for(long i=1;i<=rows;i++){if(!first)putchar(',');first=0;ps(gcoeff(M,i,j));}printf("],\\"pivots\\":[");for(long j=1;j<lg(M);j++){if(j>1)putchar(',');printf("%ld",compute_multiple_of_R_pivot(M,NULL,j,occupied));}puts("]}");avma=av;}pari_close();return 0;}
`);
 run('cc',['-O1','-fsanitize=undefined','-fno-sanitize-recover=undefined','-I'+path.join(pari,'src/headers'),'-I'+lib,c,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',exe]);
 const trace=run(exe,[],{input:[cases.length,...cases.flatMap(r=>[r.rows,r.degree,r.columns,...r.occupied,...r.entries])].join(' ')}),expected=trace.trim().split('\n').map(JSON.parse);
 run('python3',['-c',`import sys,json,importlib
sys.path[:0]=sys.argv[1:3];m=importlib.import_module('bench.pari-class-group-port.regulator_preparation')
for r,e in zip(*json.load(sys.stdin)):
 out=[77]*(3*r['rows']*(r['columns']+1));selected=[77]*(r['columns']+1);state=[77]*3
 args=[list(map(int,r['entries'])),r['rows'],r['columns'],r['degree'],out,selected,state]
 n=m.pari_regulator_column_preparation(*args);assert state==e['state'] and n==state[0]
 assert out==list(map(int,e['values']))+[77]*(len(out)-len(e['values']))
 assert selected==e['selected']+[77]*(len(selected)-len(e['selected']))
 assert [m.pari_regulator_pivot(out,r['rows'],n,j,r['occupied']) for j in range(1,n+1)]==e['pivots']
 for index,value in [(1,1),(3,0),(4,[]),(5,[]),(6,[])]:
  bad=args[:];bad[index]=value;before=str(bad)
  try:m.pari_regulator_column_preparation(*bad)
  except ValueError:pass
  else:raise AssertionError('invalid preparation accepted')
  assert str(bad)==before
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify([cases,expected])});
 const summary={cases:cases.length,traceSha256:createHash('sha256').update(trace).digest('hex'),ubsan:true,qualifiedTiming:false};
 if(process.argv.includes('--source-only')){console.log(JSON.stringify(summary));return;}
 const built=await compileKernel({sourcePath:path.join(__dirname,'regulator_preparation.py')}),module=require(built.modulePath),f=module.pari_regulator_column_preparation,pivot=module.pari_regulator_pivot;assert(f.nativeAvailable&&pivot.nativeAvailable);
 for(const backend of ['javascript','gmp'])for(let ix=0;ix<cases.length;ix++){
  const r=cases[ix],e=expected[ix],make=v=>backend==='gmp'?f.createIntegerBuffer(v.length,64,v):v,view=x=>Array.isArray(x)?x:x.toArray();
  const out=make(Array(3*r.rows*(r.columns+1)).fill(77n)),selected=Array(r.columns+1).fill(77n),state=Array(3).fill(77n);
  const args=[make(r.entries.map(BigInt)),BigInt(r.rows),BigInt(r.columns),BigInt(r.degree),out,selected,state];const n=f[backend](...args);assert.equal(n,BigInt(e.state[0]));assert.deepEqual(state,e.state.map(BigInt));assert.deepEqual(view(out),[...e.values.map(BigInt),...Array(view(out).length-e.values.length).fill(77n)]);assert.deepEqual(selected,[...e.selected.map(BigInt),...Array(selected.length-e.selected.length).fill(77n)]);
  for(let j=1;j<=Number(n);j++)assert.equal(pivot[backend](out,BigInt(r.rows),n,BigInt(j),r.occupied.map(BigInt)),BigInt(e.pivots[j-1]));
  for(const [index,value]of [[1,1n],[3,0n],[4,make([])],[5,[]],[6,[]]]){const bad=args.slice();bad[index]=value;const snap=a=>a.map(x=>typeof x==='bigint'?x:view(x).slice()),before=snap(bad);assert.throws(()=>f[backend](...bad));assert.deepEqual(snap(bad),before);}
 }
 console.log(JSON.stringify({...summary,coreBytes:fs.statSync(built.coreSourcePath).size}));
})().catch(e=>{console.error(e);process.exitCode=1;});
