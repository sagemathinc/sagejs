"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {compileKernel}=require('../../tools/native-kernel/compiler.cjs');
function run(c,a,o={}){const r=spawnSync(c,a,{encoding:'utf8',timeout:120000,maxBuffer:64*1024*1024,...o});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
function part(s,a,b){const i=s.indexOf(a),j=s.indexOf(b,i);assert(i>=0&&j>i,a);return s.slice(i,j);}
(async()=>{
 const pari=path.resolve(process.argv[2]),archive=path.resolve(process.argv[3]),lib=path.join(pari,'Olinux-x86_64');
 const fixture=JSON.parse(run(process.execPath,[path.join(__dirname,'check_hnfspec_cleanup.cjs'),pari,archive,'--export-rank-fixtures']));
 const pinned=file=>{const s=run('tar',['-xOf',archive,'pari-2.17.4/'+file]);assert.equal(s,fs.readFileSync(path.join(pari,file),'utf8'));return s;};
 const alg=pinned('src/basemath/alglin1.c'),hnf=pinned('src/basemath/hnf_snf.c'),flv=pinned('src/basemath/Flv.c');
 let body=part(alg,'GEN\nZM_pivots(GEN M0, long *rr)','    beenthere = 1;');
 const zero=part(alg,'static long\nZM_count_0_cols(','static void indexrank_all(');
 let profile=part(hnf,'static GEN\nZM_rowrankprofile(','/* HNF reduce a relation matrix');
 const empty=part(hnf,'  if (!col) {\n    permpro = identity_perm(lnz);','  /* lnz = lg(permpro) */');
 const sourceHash=createHash('sha256').update(zero+body+profile+empty).digest('hex');
 body=body.replace('ZM_pivots(','rank_oracle(');
 body=body.replace('init_modular_small(&S);','init_modular_small(&S); audit[4]=rmin;');
 body=body.replace('  for(;;)','  audit[5]=imax;\n  for(;;)');
 body=body.replace('      if (!p) pari_err_OVERFLOW','      audit[1]=p;\n      if (!p) pari_err_OVERFLOW');
 body=body.replace('d = Flm_pivots(ZM_to_Flm(M0, p), p, &rp, 1);','d = audited_pivots(ZM_to_Flm(M0, p), p, &rp);\n      if (audit[9]) goto FRONTIER;\n      audit[0]++;');
 body+=`\naudit[9]=-1;\nFRONTIER:\n audit[2]=rbest;audit[3]=zc;audit[6]=dbest!=NULL;
 if(dbest)audit_best=gcopy(dbest);guncloneNULL(dbest);return NULL;\n}\nEND:
 audit[2]=rbest;audit[3]=zc;audit[6]=dbest!=NULL;
 if(dbest)audit_best=gcopy(dbest);*rr=rbest;guncloneNULL(dbest);return d;\n}\n`;
 profile=profile.replace('ZM_rowrankprofile(','profile_oracle(').replace('ZM_pivots(x,&r); set_avma(av);','rank_oracle(x,&r); /* retain diagnostic snapshots, no stack reset */\n  if(audit[9])return cgetg(1,t_VECSMALL);\n  audit_last=d;');
 const cases=fixture.cases.map((r,i)=>({input:r,extra:fixture.expected[i].extra,cleanup:fixture.expected[i].state.map(Number),kind:r.kind}));
 let seed=7192301;function random(n){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;}
 function add(rows,cols,extra,kind='synthetic'){cases.push({extra:extra.map(String),cleanup:[0,0,rows+1,cols,cols,1,0,0,0,0],kind});}
 for(const rows of [0,1,2,3,5,7,8,9,16])for(const cols of [0,1,2,4,7,8,10])for(let k=0;k<3;k++)add(rows,cols,Array.from({length:rows*cols},()=>k===0?0:random(9)-4));
 const p=2147483659n,q=2147483693n;
 for(const [rows,cols]of [[2,2],[3,2],[2,3],[7,9],[9,7]])for(const scale of [p,p*q,1n]){
  const a=Array(rows*cols).fill(0n);for(let i=0;i<Math.min(rows,cols);i++)a[i*rows+i]=i?1n:scale;add(rows,cols,a);
 }
 // Strict dbest must survive a later worse modular result (rank 1 then 0).
 add(3,3,[q,2n*q,0n,2n*q,4n*q,0n,0n,0n,0n]);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-hnfspec-rank-')),c=path.join(dir,'oracle.c'),exe=path.join(dir,'oracle');
 fs.writeFileSync(c,`/* Source-extracted PARI2.17.4 initial rank branch; GPL-2.0-or-later. */
#include "pari.h"
#include "paripriv.h"
_Static_assert(sizeof(long)==8,"pinned 64-bit source required");
static long audit[10];static GEN audit_matrix,audit_best,audit_last;
static GEN audited_pivots(GEN x,ulong p,long *rr){audit_matrix=x;if(lg(x)-1>=8&&nbrows(x)>=8){audit[9]=-2;return NULL;}audit_last=Flm_pivots(x,p,rr,1);return audit_last;}
${zero}\n${body}\n${profile}
static void ints(GEN x){putchar('[');for(long i=1;i<lg(x);i++){if(i>1)putchar(',');printf("\\"%ld\\"",x[i]);}putchar(']');}
int main(void){pari_init(128000000,10000);long count;if(scanf("%ld",&count)!=1)return 2;
for(long z=0;z<count;z++){pari_sp av=avma;long rows,col,lnz,nr=-1;GEN permpro,extramat;
if(scanf("%ld%ld",&rows,&col)!=2)return 3;lnz=rows+1;extramat=cgetg(col+1,t_MAT);
for(long j=1;j<=col;j++){gel(extramat,j)=cgetg(rows+1,t_COL);for(long i=1;i<=rows;i++){char value[8192];if(scanf("%8191s",value)!=1)return 4;gmael(extramat,j,i)=gp_read_str(value);}}
for(long i=0;i<10;i++)audit[i]=0;audit_matrix=NULL;audit_best=NULL;audit_last=NULL;
${empty.replace('ZM_rowrankprofile','profile_oracle')}
if(audit[9]){audit[7]=-1;audit[8]=-1;}else{audit[7]=nr;audit[8]=lg(permpro)-1;if(col){audit[2]=nr;audit[3]=ZM_count_0_cols(shallowtrans(extramat));}}
printf("{\\"state\\":[");for(long i=0;i<10;i++){if(i)putchar(',');printf("\\"%ld\\"",audit[i]);}printf("],\\"profile\\":");ints(permpro);
printf(",\\"pivots\\":");ints(audit_last?audit_last:cgetg(1,t_VECSMALL));printf(",\\"best\\":");ints(audit_best?audit_best:cgetg(1,t_VECSMALL));printf(",\\"matrix\\":[");if(audit_matrix)for(long i=1;i<=col;i++)for(long j=1;j<=rows;j++){if(i!=1||j!=1)putchar(',');printf("\\"%lu\\"",uel(gel(audit_matrix,j),i));}puts("]}");avma=av;
}pari_close();return 0;}
`);
 run('cc',['-O1','-fsanitize=undefined','-fno-sanitize-recover=undefined','-I'+path.join(pari,'src/headers'),'-I'+lib,c,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',exe]);
 const trace=run(exe,[],{input:[cases.length,...cases.flatMap(r=>[r.cleanup[2]-1,r.cleanup[3],...r.extra])].join(' ')}),expected=trace.trim().split('\n').map(JSON.parse);
 assert.equal(expected.length,cases.length);
 const success=expected.filter(e=>e.state[9]==='0').length,verification=expected.filter(e=>e.state[9]==='-1').length,cup=expected.filter(e=>e.state[9]==='-2').length;
 assert(success&&verification&&cup);assert(expected.some(e=>e.state[0]==='2'&&e.state[9]==='0'));assert(expected.some(e=>e.state[6]==='1'&&e.state[9]==='-1'));
 if(process.argv.includes('--export-assembly-fixtures')){
  console.log(JSON.stringify({cases,expected,sourceHash}));return;
 }
 run('python3',['-c',`import sys,json,importlib
sys.path[:0]=sys.argv[1:3];m=importlib.import_module('bench.pari-class-group-port.hnfspec_rank_prefix');cl=importlib.import_module('bench.pari-class-group-port.hnfspec_cleanup')
for r,e in json.load(sys.stdin):
 cs=r['cleanup'];n=cs[2]-1;rows=cs[3];extra=list(map(int,r['extra']))+[999];matrix=[77]*(rows*n+2);occ=[77]*(rows+2);piv=[77]*(n+2);best=[77]*(n+2);profile=[77]*(n+3);state=[77]*12
 if 'input' in r:
  v=r['input'];R=v['rows'];C=v['columns'];k=v['k0'];resident=[77]*(R*C+2);actual=[77]*10
  matrix=[77]*(R*C+2);occ=[77]*(C+2);piv=[77]*(R+2);best=[77]*(R+2);profile=[77]*(R+3)
  result=m.pari_hnfspec_cleanup_rank_prefix(list(map(int,v['mat'])),R,C,v['perm'][:],k,v['cRows'],[0]*(R*C),[0]*(k*C),[0]*(C*C),[0]*C,[0],[0]*13,[0]*((R-k)*C),[0]*(k*C),resident,actual,matrix,occ,piv,best,profile,state)
  assert actual==cs and resident[:len(r['extra'])]==list(map(int,r['extra']));extra=resident
 else:result=m.pari_hnfspec_rank_prefix(extra,cs,matrix,occ,piv,best,profile,state)
 assert state==list(map(int,e['state']))+[77,77] and result==int(e['state'][9]),(r,e,state)
 for a,w in [(matrix,e['matrix']),(piv,e['pivots']),(best,e['best']),(profile,e['profile'])]:
  w=list(map(int,w));assert a==w+[77]*(len(a)-len(w)),(r,e,a)
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify(cases.map((r,i)=>[r,expected[i]]))});
 const built=await compileKernel({sourcePath:path.join(__dirname,'hnfspec_rank_prefix.py')}),module=require(built.modulePath),f=module.pari_hnfspec_rank_prefix,fused=module.pari_hnfspec_cleanup_rank_prefix;
 assert(f.nativeAvailable&&fused.nativeAvailable);assert.doesNotMatch(fs.readFileSync(built.coreSourcePath,'utf8'),/napi_call_function|PyObject_Call|v8::/);
 for(const backend of ['javascript','gmp'])for(let z=0;z<cases.length;z++){
  const r=cases[z],e=expected[z],cs=r.cleanup,n=cs[2]-1,rows=cs[3],words=n=>Array(n).fill(77n),exact=n=>f.createIntegerBuffer(n,64,words(n));
  let extra=f.createIntegerBuffer(r.extra.length+1,64,[...r.extra.map(BigInt),999n]);
  let matrix=exact(rows*n+2),occ=exact(rows+2),piv=exact(n+2),best=exact(n+2),profile=exact(n+3);const state=exact(12);let status;
  if(r.input){const v=r.input,R=v.rows,C=v.columns,k=v.k0,actual=words(10);extra=exact(R*C+2);matrix=exact(R*C+2);occ=exact(C+2);piv=exact(R+2);best=exact(R+2);profile=exact(R+3);
   status=fused[backend](v.mat.map(BigInt),BigInt(R),BigInt(C),v.perm.map(BigInt),BigInt(k),BigInt(v.cRows),words(R*C),exact(k*C),exact(C*C),words(C),[0n],words(13),exact((R-k)*C),exact(k*C),extra,actual,matrix,occ,piv,best,profile,state);assert.deepEqual(actual,cs.map(BigInt));assert.deepEqual(extra.toArray().slice(0,r.extra.length),r.extra.map(BigInt));
  }else status=f[backend](extra,cs.map(BigInt),matrix,occ,piv,best,profile,state);
  assert.equal(status,BigInt(e.state[9]));assert.deepEqual(state.toArray(),[...e.state.map(BigInt),77n,77n]);
  for(const [a,w]of [[matrix,e.matrix],[piv,e.pivots],[best,e.best],[profile,e.profile]])assert.deepEqual(a.toArray(),[...w.map(BigInt),...words(a.toArray().length-w.length)]);
 }
 run('python3',['-c',`import sys,importlib
sys.path[:0]=sys.argv[1:3];m=importlib.import_module('bench.pari-class-group-port.hnfspec_rank_prefix')
for variant in range(10):
 extra=[1,0,0,1];cs=[0,0,3,2,2,1,0,0,0,0];matrix=[77]*4;occ=[77]*2;piv=[77]*2;best=[77]*2;profile=[77]*3;state=[77]*10
 if variant==0:cs=cs[:9]
 if variant==1:cs[2]=0
 if variant==2:extra=extra[:3]
 if variant==3:profile=profile[:2]
 if variant==4:state=state[:9]
 if variant==5:matrix=matrix[:3]
 if variant==6:occ=occ[:1]
 if variant==7:piv=piv[:1]
 if variant==8:best=best[:1]
 if variant==9:cs[3]=-1
 args=(extra,cs,matrix,occ,piv,best,profile,state);before=str(args)
 try:m.pari_hnfspec_rank_prefix(*args)
 except ValueError:pass
 else:raise AssertionError('malformed input accepted')
 assert str(args)==before
for position in range(16,22):
 args=[[2,1,0,2],2,2,[1,2],1,1]+[[77]*n for n in [4,2,4,2,1,13,2,2,4,10,4,2,2,2,3,10]]
 args[position]=args[position][:-1];before=str(args)
 try:m.pari_hnfspec_cleanup_rank_prefix(*args)
 except ValueError:pass
 else:raise AssertionError('short fused owner accepted')
 assert str(args)==before
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')]);
 for(const backend of ['javascript','gmp'])for(let variant=0;variant<10;variant++){
  let extra=[1n,0n,0n,1n],cs=[0n,0n,3n,2n,2n,1n,0n,0n,0n,0n],matrix=Array(4).fill(77n),occ=[77n,77n],piv=[77n,77n],best=[77n,77n],profile=Array(3).fill(77n),state=Array(10).fill(77n);
  if(variant===0)cs=cs.slice(0,9);if(variant===1)cs[2]=0n;if(variant===2)extra=extra.slice(0,3);if(variant===3)profile=profile.slice(0,2);if(variant===4)state=state.slice(0,9);if(variant===5)matrix=matrix.slice(0,3);if(variant===6)occ=occ.slice(0,1);if(variant===7)piv=piv.slice(0,1);if(variant===8)best=best.slice(0,1);if(variant===9)cs[3]=-1n;
  const args=[extra,cs,matrix,occ,piv,best,profile,state],before=args.map(x=>x.slice());assert.throws(()=>f[backend](...args),/invalid|short/);assert.deepEqual(args,before);
 }
 for(const backend of ['javascript','gmp'])for(let position=16;position<22;position++){
  const args=[[2n,1n,0n,2n],2n,2n,[1n,2n],1n,1n,...[4,2,4,2,1,13,2,2,4,10,4,2,2,2,3,10].map(n=>Array(n).fill(77n))];args[position]=args[position].slice(0,-1);const before=args.map(x=>Array.isArray(x)?x.slice():x);
  assert.throws(()=>fused[backend](...args),/short fused/);assert.deepEqual(args,before);
 }
 console.log(JSON.stringify({cases:cases.length,fusedCleanupCases:fixture.cases.length,connectedCertified:expected.slice(0,fixture.cases.length).filter(e=>e.state[9]==='0').length,realRelationCases:fixture.cases.filter(r=>r.kind==='collector').length,invalidShapesRejected:10,invalidFusedOwnersRejected:6,success,verification,cup,sourceHash,traceSha256:createHash('sha256').update(trace).digest('hex'),cacheKey:built.cacheKey,coreBytes:fs.statSync(built.coreSourcePath).size,ubsan:true,qualifiedTiming:false}));
})().catch(e=>{console.error(e);process.exitCode=1;});
