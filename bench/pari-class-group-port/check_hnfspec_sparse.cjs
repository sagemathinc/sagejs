"use strict";
// Defined-execution oracle: extracted PARI prefix, UBSan, no replacement HNF.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {compileKernel}=require('../../tools/native-kernel/compiler.cjs');
function run(cmd,args,options={}){const r=spawnSync(cmd,args,{encoding:'utf8',timeout:120000,maxBuffer:32*1024*1024,...options});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
function part(s,a,b){const i=s.indexOf(a),j=s.indexOf(b,i);assert(i>=0&&j>i);return s.slice(i,j);}
(async()=>{
 const pari=path.resolve(process.argv[2]),archive=path.resolve(process.argv[3]),lib=path.join(pari,'Olinux-x86_64');
 assert.equal(createHash('sha256').update(fs.readFileSync(archive)).digest('hex'),'02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53');
 const original=run('tar',['-xOf',archive,'pari-2.17.4/src/basemath/hnf_snf.c']);
 assert.equal(original,fs.readFileSync(path.join(pari,'src/basemath/hnf_snf.c'),'utf8'));
 const counts=part(original,'static int\ncount(','static GEN\nhnffinal('),copies=part(original,'static void\np_mat(','/* permutation giving imagecompl');
 let prefix=part(original,'GEN\nhnfspec_i(','\nEND2:');
 const sourceHash=createHash('sha256').update(original).digest('hex'),prefixHash=createHash('sha256').update(counts+copies+prefix).digest('hex');
 const replace=(a,b)=>{assert.equal(prefix.split(a).length,2,a);prefix=prefix.replace(a,b);};
 replace('hnfspec_i(','sparse_oracle(');
 replace('lk0++; lswap(perm[i], perm[lk0]);','trace_state[8]++; lk0++; lswap(perm[i], perm[lk0]);');
 replace('case 1: /* move trivial generator between lig+1 and li */','case 1: /* move trivial generator between lig+1 and li */\n        trace_state[9]++;');
 const decrement='    lig--; col--;\n    if (gc_needed(av,3))';
 assert.equal(prefix.split(decrement).length,3);
 prefix=prefix.replace(decrement,'    lig--; col--; trace_state[10]++;\n    if (gc_needed(av,3))');
 prefix=prefix.replace(decrement,'    lig--; col--; trace_state[11]++;\n    if (gc_needed(av,3))');
 replace('  vmax = cgetg(co,t_VECSMALL);','  trace_state[12]=col;\n  vmax = cgetg(co,t_VECSMALL);');
 replace('goto END2;','{trace_state[5]=1;goto END2;}');
 prefix+=`\nEND2:
trace_state[0]=co;trace_state[1]=lig;trace_state[2]=col;trace_state[3]=lk0;
trace_state[4]=T!=NULL;trace_state[6]=n;trace_state[7]=s;
return mkvec4(mat,matt,T?T:cgetg(1,t_MAT),vmax);
}
`;
 let seed=0x4c9150aa;
 function random(n){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;}
 function permutation(n){const p=Array.from({length:n},(_,i)=>i+1);for(let i=n-1;i>0;i--){const j=random(i+1);[p[i],p[j]]=[p[j],p[i]];}return p;}
 const cases=[];
 function add(rows,columns,mat,{k0=0,cRows=1,perm=permutation(rows),kind='synthetic'}={}){assert.equal(mat.length,rows*columns);cases.push({rows,columns,mat:mat.map(String),k0,cRows,perm,kind});}
 for(let rows=0;rows<=7;rows++)for(let columns=0;columns<=9;columns++)for(let sample=0;sample<5;sample++){
  const choices=sample<2?[-1,0,0,0,1]:[-5,-2,-1,0,0,0,1,2,5];
  add(rows,columns,Array.from({length:rows*columns},()=>choices[random(choices.length)]),{k0:random(rows+1),cRows:sample%2});
 }
 // A bidiagonal relation family grows T by powers of M while sparse words
 // stay bounded: this exercises genuine multiword transformations.
 for(const rows of [3,7,10])for(const m of [1000000000n,-1000000000n])for(const k0 of [0,1]){
  const columns=rows+1,mat=Array(rows*columns).fill(0n);
  for(let i=0;i<rows;i++){mat[i*rows+i]=m;mat[(i+1)*rows+i]=1n;}
  add(rows,columns,mat,{k0,perm:Array.from({length:rows},(_,i)=>i+1)});
 }
 // No +/-1-only row: enter phase 3 and exercise strict HIGHBIT cutoffs.
 for(const exponent of [30n,60n,61n,62n])for(const t of [2n,3n,4n])for(const sign of [1n,-1n]){
  add(2,2,[0n,t,1n<<exponent,sign],{perm:[1,2]});
 }
 // Initial extrema, including no-pivot cases, are valid signed words.
 add(2,2,[(1n<<63n)-1n,2n,-((1n<<63n)-1n),3n],{perm:[2,1]});
 // Defined arithmetic where physical-vs-permuted vmax changes the decision:
 // the source proceeds, whereas a "corrected" permuted scan would stop.
 const physicalCase=cases.length,h=(1n<<63n)/3n;
 add(3,2,[h,2n,0n,-h,1n,0n],{k0:1,perm:[3,2,1]});
 // co > 300 and co > 1.5*li are separate, strict source conditions.
 for(const [rows,columns] of [[4,298],[4,299],[4,300],[201,302],[200,302]]){
  add(rows,columns,Array(rows*columns).fill(0),{cRows:0,perm:Array.from({length:rows},(_,i)=>i+1)});
 }
 // Real relation columns, not synthetic approximations. Export only; no
 // native collector build or timing run is requested by this route.
 const fixture=JSON.parse(run(process.execPath,[path.join(__dirname,'check_prepared_small_norm.cjs'),pari,archive,'--export-fixtures','--unreduced','--distinct','--construct-primes']));
 let realCases=0;
 for(const {input,expected}of fixture.cases){
  if(!expected.last)continue;
  const rows=input.relation.length,columns=expected.last;
  for(const k0 of [0,Math.min(2,rows)]){
   add(rows,columns,expected.records,{k0,perm:Array.from({length:rows},(_,i)=>i+1),kind:'collector'});realCases++;
  }
 }
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-hnfspec-sparse-')),c=path.join(dir,'oracle.c'),exe=path.join(dir,'oracle');
 fs.writeFileSync(c,`/* PARI group GPL-2.0-or-later source prefix, without warranty. */
#include "pari.h"
#include "paripriv.h"
_Static_assert(sizeof(long)==8,"oracle requires the pinned 64-bit PARI word model");
#define DEBUGLEVEL DEBUGLEVEL_mathnf
static long trace_state[13];
${counts}
${copies}
${prefix}
static void exact(GEN m){putchar('[');for(long j=1;j<lg(m);j++)for(long i=1;i<lg(gel(m,j));i++){if(j!=1||i!=1)putchar(',');pari_printf("\\"%Ps\\"",gmael(m,j,i));}putchar(']');}
static void words(GEN m,long rows){putchar('[');for(long j=1;j<lg(m);j++)for(long i=1;i<=rows;i++){if(j!=1||i!=1)putchar(',');printf("\\"%ld\\"",mael(m,j,i));}putchar(']');}
int main(void){pari_init(64000000,1000);long cases;if(scanf("%ld",&cases)!=1)return 2;
for(long z=0;z<cases;z++){pari_sp av=avma;long rows,columns,k0,cr;if(scanf("%ld%ld%ld%ld",&rows,&columns,&k0,&cr)!=4)return 3;
GEN perm=cgetg(rows+1,t_VECSMALL),mat=cgetg(columns+1,t_MAT),C=zeromat(cr,columns),dep=NULL,B=NULL;
for(long i=1;i<=rows;i++)if(scanf("%ld",&perm[i])!=1)return 4;
for(long j=1;j<=columns;j++){gel(mat,j)=cgetg(rows+1,t_VECSMALL);for(long i=1;i<=rows;i++)if(scanf("%ld",&mael(mat,j,i))!=1)return 5;}
printf("{\\"counts\\":[");for(long i=1;i<=rows;i++){long first=-999;long n=count(mat,i,columns,&first),last=count2(mat,i,columns);if(i>1)putchar(',');printf("[%ld,%ld,%ld]",n,first,last);}printf("],");
for(long i=0;i<13;i++)trace_state[i]=0;GEN out=sparse_oracle(mat,perm,&dep,&B,&C,k0);
printf("\\"mat\\":");words(gel(out,1),rows);printf(",\\"dense\\":");exact(gel(out,2));printf(",\\"T\\":");exact(gel(out,3));
printf(",\\"perm\\":[");for(long i=1;i<=rows;i++){if(i>1)putchar(',');printf("%ld",perm[i]);}
printf("],\\"vmax\\":[");for(long i=1;i<=trace_state[12];i++){if(i>1)putchar(',');printf("\\"%ld\\"",mael(out,4,i));}
printf("],\\"state\\":[");for(long i=0;i<13;i++){if(i)putchar(',');printf("\\"%ld\\"",trace_state[i]);}puts("]}");avma=av;
}pari_close();return 0;}
`);
 run('cc',['-O1','-fsanitize=undefined','-fno-sanitize-recover=undefined','-I'+path.join(pari,'src/headers'),'-I'+lib,c,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',exe]);
 const input=[cases.length,...cases.flatMap(r=>[r.rows,r.columns,r.k0,r.cRows,...r.perm,...r.mat])].join(' ');
 const trace=run(exe,[],{input}),expected=trace.trim().split('\n').map(JSON.parse);assert.equal(expected.length,cases.length);
 assert.equal(expected[physicalCase].state[5],'0');assert.equal(expected[physicalCase].state[11],'1');
 let maximumTBits=0,activeProductsChecked=0;
 for(let index=0;index<cases.length;index++){
  const r=cases[index],e=expected[index],retained=Number(e.state[0])-1,T=e.T.map(BigInt),raw=r.mat.map(BigInt);
  for(const t of T)maximumTBits=Math.max(maximumTBits,(t<0n?-t:t).toString(2).length);
  if(Number(e.state[4]))for(let row=r.k0;row<Number(e.state[1]);row++)for(let column=0;column<Number(e.state[2]);column++){
   const physical=e.perm[row]-1;let product=0n;
   for(let k=0;k<retained;k++)product+=raw[k*r.rows+physical]*T[column*retained+k];
   assert.equal(product,BigInt(e.mat[column*r.rows+physical]),'active mat0*T invariant '+index);activeProductsChecked++;
  }
 }
 assert(maximumTBits>64&&maximumTBits<=4096);assert(activeProductsChecked>0);
 const unsafe=[
  {rows:1,columns:1,k0:0,cRows:1,perm:[1],mat:[-(1n<<63n)],message:'absolute value'},
  {rows:2,columns:2,k0:0,cRows:1,perm:[1,2],mat:[(1n<<63n)-1n,1n,-((1n<<63n)-1n),1n],message:'word overflow'},
  {rows:3,columns:2,k0:1,cRows:1,perm:[3,2,1],mat:[(1n<<63n)-1n,2n,0n,-((1n<<63n)-1n),1n,0n],message:'word product overflow'},
 ];
 for(const r of unsafe){
  const input=[1,r.rows,r.columns,r.k0,r.cRows,...r.perm,...r.mat].join(' ');
  const result=spawnSync(exe,[],{input,encoding:'utf8',timeout:10000});
  assert.notEqual(result.status,0,'undefined C arithmetic must not supply an oracle result');
  assert.match(result.stderr,/runtime error:/);
 }
 if(process.argv.includes('--export-cleanup-fixtures')){
  console.log(JSON.stringify({cases,expected,unsafe,sourceHash,prefixHash,realCases},(_,v)=>typeof v==='bigint'?String(v):v));
  return;
 }
 run('python3',['-c',`import sys,json,importlib
sys.path[:0]=sys.argv[1:3];m=importlib.import_module('bench.pari-class-group-port.hnfspec_sparse')
for r,e in json.load(sys.stdin):
 rows=r['rows'];cols=r['columns'];raw=list(map(int,r['mat']));perm=r['perm'][:]
 for i,w in enumerate(e['counts']):
  found=[-999];n=m.pari_hnfspec_count(raw,rows,i+1,cols,found)
  assert [n,found[0],m.pari_hnfspec_count2(raw,rows,i+1,cols)]==w
 retained=int(e['state'][0])-1;mat=[77]*(rows*retained+2);dense=[77]*(r['k0']*retained+2);T=[77]*(retained*retained+2 if int(e['state'][4]) else 2);vmax=[77]*(retained+2);found=[-999];state=[77]*15
 result=m.pari_hnfspec_sparse_prefix(raw,rows,cols,perm,r['k0'],r['cRows'],mat,dense,T,vmax,found,state)
 assert state[:13]==list(map(int,e['state'])) and result==int(e['state'][5]),(r,state,e['state'])
 assert mat==list(map(int,e['mat']))+[77,77] and dense==list(map(int,e['dense']))+[77,77],r
 assert T==list(map(int,e['T']))+[77,77] and perm==e['perm'],r
 nv=int(e['state'][12]);assert vmax[:nv]==list(map(int,e['vmax'])) and vmax[nv:]==[77]*(retained+2-nv)
 assert state[13:]==[77,77] and raw==list(map(int,r['mat']))
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify(cases.map((r,i)=>[r,expected[i]]))});
 run('python3',['-c',`import sys,json,importlib
sys.path[:0]=sys.argv[1:3];m=importlib.import_module('bench.pari-class-group-port.hnfspec_sparse')
for r in json.load(sys.stdin):
 rows=r['rows'];cols=r['columns'];raw=list(map(int,r['mat']))
 try:m.pari_hnfspec_sparse_prefix(raw,rows,cols,r['perm'][:],r['k0'],r['cRows'],[0]*(rows*cols),[0]*(r['k0']*cols),[0]*(cols*cols),[0]*cols,[0],[0]*13)
 except ValueError as e:assert 'undefined upstream' in str(e),str(e)
 else:raise AssertionError('undefined upstream input accepted')
for variant in range(8):
 raw=[2,1,0,2];rows=2;cols=2;k0=1;cr=1;perm=[1,2];mat=[77]*4;dense=[77]*2;T=[77]*4;vmax=[77]*2;found=[77];state=[77]*13
 if variant==0:rows=-1
 if variant==1:k0=3
 if variant==2:raw=raw[:3]
 if variant==3:perm=[1,1]
 if variant==4:state=state[:12]
 if variant==5:T=T[:3]
 if variant==6:rows=9007199254740992
 if variant==7:cr=-1
 before=str((raw,perm,mat,dense,T,vmax,found,state))
 try:m.pari_hnfspec_sparse_prefix(raw,rows,cols,perm,k0,cr,mat,dense,T,vmax,found,state)
 except ValueError:pass
 else:raise AssertionError('invalid shape accepted')
 assert str((raw,perm,mat,dense,T,vmax,found,state))==before
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify(unsafe,(_,v)=>typeof v==='bigint'?String(v):v)});
 const built=await compileKernel({sourcePath:path.join(__dirname,'hnfspec_sparse.py')}),m=require(built.modulePath),f=m.pari_hnfspec_sparse_prefix;
 assert(f.nativeAvailable&&m.pari_hnfspec_count.nativeAvailable&&m.pari_hnfspec_count2.nativeAvailable);
 assert.doesNotMatch(fs.readFileSync(built.coreSourcePath,'utf8'),/napi_call_function|PyObject_Call|v8::/);
 for(const backend of ['javascript','gmp'])for(let index=0;index<cases.length;index++){
  const r=cases[index],e=expected[index],rows=r.rows,cols=r.columns,raw=r.mat.map(BigInt),perm=r.perm.map(BigInt),state=Array(15).fill(77n),retained=Number(e.state[0])-1;
  for(let i=0;i<rows;i++){const found=[-999n];assert.deepEqual([Number(m.pari_hnfspec_count[backend](raw,BigInt(rows),BigInt(i+1),BigInt(cols),found)),Number(found[0]),Number(m.pari_hnfspec_count2[backend](raw,BigInt(rows),BigInt(i+1),BigInt(cols)))],e.counts[i]);}
  const mat=Array(rows*retained+2).fill(77n),dense=Array(r.k0*retained+2).fill(77n),vmax=Array(retained+2).fill(77n),found=[-999n];
  const size=Number(e.state[4])?retained*retained+2:2;
  // 64 words exceed the observed <= 10*30-bit bidiagonal powers, with ample
  // headroom for these small synthetic and actual sparse relation matrices.
  const T=f.createIntegerBuffer(size,64,Array(size).fill(77n));
  assert.equal(f[backend](raw,BigInt(rows),BigInt(cols),perm,BigInt(r.k0),BigInt(r.cRows),mat,dense,T,vmax,found,state),BigInt(e.state[5]));
  assert.deepEqual(state,[...e.state.map(BigInt),77n,77n],'state '+index+' '+backend);
  assert.deepEqual(mat,[...e.mat.map(BigInt),77n,77n]);assert.deepEqual(dense,[...e.dense.map(BigInt),77n,77n]);assert.deepEqual(T.toArray(),[...e.T.map(BigInt),77n,77n]);assert.deepEqual(perm,e.perm.map(BigInt));
  const nv=Number(e.state[12]);assert.deepEqual(vmax,[...e.vmax.map(BigInt),...Array(retained+2-nv).fill(77n)]);assert.deepEqual(raw,r.mat.map(BigInt));
 }
 for(const backend of ['javascript','gmp'])for(const r of unsafe){
  const rows=r.rows,cols=r.columns;
  assert.throws(()=>f[backend](r.mat,BigInt(rows),BigInt(cols),r.perm.map(BigInt),BigInt(r.k0),BigInt(r.cRows),Array(rows*cols).fill(0n),Array(r.k0*cols).fill(0n),Array(cols*cols).fill(0n),Array(cols).fill(0n),[0n],Array(13).fill(0n)),/undefined upstream/);
 }
 for(const backend of ['javascript','gmp'])for(let variant=0;variant<8;variant++){
  let raw=[2n,1n,0n,2n],rows=2n,cols=2n,k0=1n,cr=1n,perm=[1n,2n],mat=Array(4).fill(77n),dense=Array(2).fill(77n),T=Array(4).fill(77n),vmax=[77n,77n],found=[77n],state=Array(13).fill(77n);
  if(variant===0)rows=-1n;if(variant===1)k0=3n;if(variant===2)raw=raw.slice(0,3);if(variant===3)perm=[1n,1n];if(variant===4)state=state.slice(0,12);if(variant===5)T=T.slice(0,3);if(variant===6)rows=9007199254740992n;if(variant===7)cr=-1n;
  const buffers=[raw,perm,mat,dense,T,vmax,found,state],before=buffers.map(x=>x.slice());
  assert.throws(()=>f[backend](raw,rows,cols,perm,k0,cr,mat,dense,T,vmax,found,state),/invalid|short|unsupported/);assert.deepEqual(buffers,before);
 }
 const branches={zero:0,unit:0,pm1:0,general:0,overflowStop:0,Tabsent:0,truncated:0,multiwordT:0};
 for(let i=0;i<cases.length;i++){const e=expected[i];branches.zero+=Number(e.state[8]);branches.unit+=Number(e.state[9]);branches.pm1+=Number(e.state[10]);branches.general+=Number(e.state[11]);branches.overflowStop+=Number(e.state[5]);branches.Tabsent+=Number(e.state[4])===0;branches.truncated+=Number(e.state[0])-1<cases[i].columns;branches.multiwordT+=e.T.some(s=>BigInt(s)>=(1n<<63n)||BigInt(s)<=-(1n<<63n));}
 assert(Object.values(branches).every(n=>n>0),JSON.stringify(branches));assert(realCases>0);
 console.log(JSON.stringify({cases:cases.length,realRelationCases:realCases,undefinedSourceCasesRejected:unsafe.length,invalidShapesRejected:8,maximumTBits,activeProductsChecked,...branches,sourceHash,prefixHash,traceSha256:createHash('sha256').update(trace).digest('hex'),coreBytes:fs.statSync(built.coreSourcePath).size,ubsan:true,qualifiedTiming:false,boundary:'END2 entry only, no multiprecision cleanup/rank profile/HNF'}));
})().catch(e=>{console.error(e);process.exitCode=1;});
