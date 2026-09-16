"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {compileKernel}=require('../../tools/native-kernel/compiler.cjs');
function run(c,a,o={}){const r=spawnSync(c,a,{encoding:'utf8',timeout:120000,maxBuffer:64*1024*1024,...o});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
(async()=>{
 const pari=path.resolve(process.argv[2]),archive=path.resolve(process.argv[3]),lib=path.join(pari,'Olinux-x86_64');
 assert.equal(createHash('sha256').update(fs.readFileSync(archive)).digest('hex'),'02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53');
 const source=run('tar',['-xOf',archive,'pari-2.17.4/src/basemath/alglin1.c']),buch=run('tar',['-xOf',archive,'pari-2.17.4/src/basemath/buch2.c']);
 const a=source.indexOf('GEN\nRgM_pivots('),b=source.indexOf('static long\nZM_count_0_cols',a),c0=buch.indexOf('static long\ncompute_multiple_of_R_pivot('),c1=buch.indexOf('/* Ar =',c0);assert(a>=0&&b>a&&c0>=0&&c1>c0);
 let body=source.slice(a,b).replace('RgM_pivots(','oracle_pivots(').replace('if (RgM_is_ZM(x0)) return ZM_pivots(x0, rr);','if (RgM_is_ZM(x0)) { integer_dispatch=1; return ZM_pivots(x0,rr); }').replace('gerepile_gauss(x,k,t,av,j,c);','exit(97);').replace('return gc_const((pari_sp)d, d);','trace_work=x; trace_occupied=c; return d;');
 const cases=[];let seed=661;const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
 for(const precision of [64,128,320,1856])for(let rows=2;rows<=4;rows++)for(let degree=rows;degree<=2*rows;degree++)for(let columns=1;columns<=8;columns++){
  const values=[];for(let j=0;j<columns;j++)for(let i=0;i<rows;i++){
   if(j===0){values.push(String(i<2*rows-degree?1:2),'-1','0');continue;}
   const x=rnd(),e=(x%42)-35;
   if(x%11===0)values.push('0','-1','0');else if(x%13===0)values.push('0','0',String(e));else values.push(String((x%2?-1n:1n)*((1n<<BigInt(precision-1))+(BigInt(x)<<BigInt(precision-40)))),String(precision),String(e));
  }cases.push({rows,columns,degree,values});
 }
 // The all-integral dispatch must not invoke the custom floating callback.
 for(const degree of [3,4,5,6]){const rows=3,columns=5;cases.push({rows,columns,degree,values:[...Array.from({length:rows},(_,i)=>[String(i<6-degree?1:2),'-1','0']).flat(),...Array(12).fill(['0','-1','0']).flat()]});}
 cases.push({rows:8,columns:8,degree:8,frontier:true,values:[...Array(8).fill(['1','-1','0']).flat(),...Array(56).fill(['0','-1','0']).flat()]});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-regulator-pivots-')),file=path.join(dir,'oracle.c'),exe=path.join(dir,'oracle');
 fs.writeFileSync(file,`/* Source-extracted PARI2.17.4; GPL-2.0-or-later.
 * Abort if stack repacking is needed; these bounded controls never need it. */
#include "pari.h"
#include "paripriv.h"
static GEN trace_work,trace_occupied;static long integer_dispatch;
${buch.slice(c0,c1)}
${body}
static GEN rd(void){char s[8192];if(scanf("%8191s",s)!=1)exit(2);return gp_read_str(s);}
static GEN scalar(void){GEN m=rd();long p=itos(rd()),e=itos(rd());if(p==-1)return m;if(!signe(m))return real_0_bit(e);GEN x=itor(m,p);setexpo(x,e);return x;}
static void ps(GEN x){long e;if(typ(x)==t_INT){pari_printf("\\"%Ps\\",\\"-1\\",\\"0\\"",x);return;}pari_printf("\\"%Ps\\",\\"%ld\\",\\"%ld\\"",signe(x)?mantissa_real(x,&e):gen_0,signe(x)?bit_prec(x):0,expo(x));}
int main(void){pari_init(64000000,1000);if(INVNEWTON_LIMIT<=1856)return 3;long count=itos(rd());for(long t=0;t<count;t++){pari_sp av=avma;long rows=itos(rd()),cols=itos(rd()),r,rr;GEN A=cgetg(cols+1,t_MAT);for(long j=1;j<=cols;j++){gel(A,j)=cgetg(rows+1,t_COL);for(long i=1;i<=rows;i++)gcoeff(A,i,j)=scalar();}integer_dispatch=0;trace_work=NULL;trace_occupied=NULL;GEN d=oracle_pivots(A,NULL,&r,&compute_multiple_of_R_pivot),direct=RgM_pivots(A,NULL,&rr,&compute_multiple_of_R_pivot);if(rr!=r||!zv_equal(d,direct))return 4;printf("{\\"state\\":[%ld,%ld,0],\\"pivots\\":[",r,integer_dispatch);for(long j=1;j<=cols;j++){if(j>1)putchar(',');printf("%ld",d[j]);}printf("],\\"work\\":[");if(trace_work){long first=1;for(long j=1;j<=cols;j++)for(long i=1;i<=rows;i++){if(!first)putchar(',');first=0;ps(gcoeff(trace_work,i,j));}}printf("],\\"occupied\\":[");if(trace_occupied)for(long i=1;i<=rows;i++){if(i>1)putchar(',');printf("%ld",trace_occupied[i]);}puts("]}");avma=av;}pari_close();return 0;}
`);
 run('cc',['-O1','-fsanitize=undefined','-fno-sanitize-recover=undefined','-I'+path.join(pari,'src/headers'),'-I'+lib,file,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',exe]);
 const trace=run(exe,[],{input:[cases.length,...cases.flatMap(r=>[r.rows,r.columns,...r.values])].join(' ')}),expected=trace.trim().split('\n').map(JSON.parse);
 run('python3',['-c',`import sys,json,importlib
sys.path[:0]=sys.argv[1:3];f=importlib.import_module('bench.pari-class-group-port.regulator_pivots').pari_regulator_pivots
for ix,(r,e) in enumerate(zip(*json.load(sys.stdin))):
 rows=r['rows'];cols=r['columns'];size=rows*cols
 args=[list(map(int,r['values'])),rows,cols,[77]*(3*size),[77]*rows,[77]*cols,[77]*3,[77]*size,[77]*size,[77]*rows,[77]*cols,[77]*cols,[77]*10]
 status=f(*args)
 if r.get('frontier'):
  assert status==-2 and args[6]==[-1,1,-2] and args[3]==[77]*(3*size) and args[4]==[77]*rows and args[5]==[77]*cols
  continue
 assert status==0
 assert args[5]==e['pivots'] and args[6]==e['state'],(ix,args[5:7],e)
 assert args[3]==list(map(int,e['work']))+[77]*(3*size-len(e['work'])),(ix,args[3],e['work'])
 assert args[4]==e['occupied']+[77]*(rows-len(e['occupied']))
 for index,value in [(1,1),(3,[]),(5,[]),(6,[])]:
  bad=args[:];bad[index]=value;before=str(bad)
  try:f(*bad)
  except ValueError:pass
  else:raise AssertionError('malformed accepted')
  assert str(bad)==before
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify([cases,expected])});
 const summary={cases:cases.length,integerDispatch:expected.filter(e=>e.state[1]).length,cupFrontiers:cases.filter(r=>r.frontier).length,traceSha256:createHash('sha256').update(trace).digest('hex'),ubsan:true,qualifiedTiming:false};
 if(process.argv.includes('--source-only')){console.log(JSON.stringify(summary));return;}
 const built=await compileKernel({sourcePath:path.join(__dirname,'regulator_pivots.py')}),f=require(built.modulePath).pari_regulator_pivots;assert(f.nativeAvailable);
 for(const backend of ['javascript','gmp'])for(let ix=0;ix<cases.length;ix++){
  const r=cases[ix],e=expected[ix],rows=r.rows,cols=r.columns,size=rows*cols,make=n=>backend==='gmp'?f.createIntegerBuffer(n,64,Array(n).fill(77n)):Array(n).fill(77n),view=x=>Array.isArray(x)?x:x.toArray();
  const args=[r.values.map(BigInt),BigInt(rows),BigInt(cols),make(3*size),Array(rows).fill(77n),Array(cols).fill(77n),Array(3).fill(77n),make(size),make(size),make(rows),make(cols),make(cols),make(10)];const status=f[backend](...args);
  if(r.frontier){assert.equal(status,-2n);assert.deepEqual(args[6],[-1n,1n,-2n]);assert.deepEqual(view(args[3]),Array(3*size).fill(77n));assert.deepEqual(args[4],Array(rows).fill(77n));assert.deepEqual(args[5],Array(cols).fill(77n));continue;}assert.equal(status,0n);
  assert.deepEqual(args[5],e.pivots.map(BigInt));assert.deepEqual(args[6],e.state.map(BigInt));assert.deepEqual(view(args[3]),[...e.work.map(BigInt),...Array(3*size-e.work.length).fill(77n)],backend+' '+ix);assert.deepEqual(args[4],[...e.occupied.map(BigInt),...Array(rows-e.occupied.length).fill(77n)]);
  for(const [index,value]of [[1,1n],[3,make(0)],[5,[]],[6,[]]]){const bad=args.slice();bad[index]=value;const snap=a=>a.map(x=>typeof x==='bigint'?x:view(x).slice()),before=snap(bad);assert.throws(()=>f[backend](...bad));assert.deepEqual(snap(bad),before);}
 }
 console.log(JSON.stringify({...summary,coreBytes:fs.statSync(built.coreSourcePath).size}));
})().catch(e=>{console.error(e);process.exitCode=1;});
