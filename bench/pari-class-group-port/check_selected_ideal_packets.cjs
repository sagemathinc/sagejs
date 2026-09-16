"use strict";
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const hash=x=>createHash('sha256').update(x).digest('hex');
function run(c,a,o={}){const r=spawnSync(c,a,{encoding:'utf8',timeout:60000,maxBuffer:16*1024*1024,...o});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
(async()=>{
 const pari=path.resolve(process.argv[2]),archive=path.resolve(process.argv[3]),lib=path.join(pari,'Olinux-x86_64');
 assert.equal(hash(fs.readFileSync(archive)),'02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53');
 const upstream=run('tar',['-xOf',archive,'pari-2.17.4/src/basemath/buch2.c']);
 assert.equal(hash(upstream),'904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac');
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-selected-ideals-'));
 const c=upstream+String.raw`
static void zjson(GEN x){pari_printf("\"%Ps\"",x);}
static void matjson(GEN a,long n){putchar('[');for(long i=1;i<=n;i++)for(long j=1;j<=n;j++){if(i>1||j>1)putchar(',');zjson(gcoeff(a,i,j));}putchar(']');}
int main(void){pari_init(256000000,10000);const char *fields[]={"x^3-20018*x+20034","x^3-20010*x+20018","x^4-20018*x-20034","x^4-2000022*x-2000042"};putchar('[');
for(long field=0;field<4;field++){
 pari_sp av=avma;GEN nf=nfinit(gp_read_str(fields[field]),DEFAULTPREC);long n=nf_get_degree(nf),r1=nf_get_r1(nf);
 double ld=dbllog2(absi_shallow(nf_get_disc(nf)))*M_LN2;GRHcheck_t S;init_GRHcheck(&S,n,r1,ld);long low=1,high=1;
 while(!GRHchk(nf,&S,high)){low=high;high*=2;}while(high-low>1){long t=(low+high)/2;if(GRHchk(nf,&S,t))high=t;else low=t;}
 long c2=(high==2&&GRHchk(nf,&S,1))?1:high;if(c2>(long)(4*ld*ld))c2=(long)(4*ld*ld);long c1=maxss(c2,nthideal(&S,nf,n));if(c2<c1)c2=c1;
 FB_t F={0};FBgen(&F,nf,n,c1,c2,&S);if(field)putchar(',');printf("{\"field\":%ld,\"degree\":%ld,\"real\":%ld,\"logD\":%.17g,\"base\":[%ld,%ld,%ld,%ld,%ld],\"table\":[",field,n,r1,ld,c1,c2,F.KC,F.KCZ,F.KCZ2);
 for(long i=1;i<=n;i++)for(long j=1;j<=n;j++){GEN v=tablemul_ei_ej(nf,i,j);for(long k=1;k<=n;k++){if(i>1||j>1||k>1)putchar(',');zjson(gel(v,k));}}
 printf("],\"catalog\":[");long first=1;for(long i=0;i<S.nprimes;i++){GEN dec=idealprimedec(nf,utoipos(S.primes[i].p));for(long j=1;j<lg(dec);j++){
  GEN P=gel(dec,j);if(!first)putchar(',');first=0;printf("{\"p\":%lu,\"f\":%ld,\"inert\":%d,\"generator\":[",S.primes[i].p,pr_get_f(P),pr_is_inert(P));
  for(long k=1;k<=n;k++){if(k>1)putchar(',');zjson(pr_is_inert(P)?gen_0:gel(pr_get_gen(P),k));}printf("]}");
 }}
 printf("],\"expectedIdeals\":[");first=1;for(long i=1;i<=F.KCZ;i++){GEN group=gel(F.LV,F.FB[i]);for(long j=1;j<lg(group);j++){if(!first)putchar(',');first=0;matjson(pr_hnf(nf,gel(group,j)),n);}}printf("],\"expectedNorms\":[");first=1;for(long i=1;i<=F.KCZ;i++){GEN group=gel(F.LV,F.FB[i]);for(long j=1;j<lg(group);j++){if(!first)putchar(',');first=0;zjson(pr_norm(gel(group,j)));}}printf("]}");free_GRHcheck(&S);set_avma(av);
}puts("]");pari_close();return 0;}
`;
 fs.writeFileSync(path.join(directory,'oracle.c'),c);
 run('cc',['-O1','-I'+path.join(pari,'src/headers'),'-I'+lib,path.join(directory,'oracle.c'),'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',path.join(directory,'oracle')]);
 const fields=JSON.parse(run(path.join(directory,'oracle'),[]));
 const receipts=JSON.parse(run('python3',['-c',String.raw`
import sys,json,importlib
sys.path[:0]=sys.argv[1:3]
base=importlib.import_module('bench.pari-class-group-port.initial_base').pari_prepared_initial_base
pack=importlib.import_module('bench.pari-class-group-port.selected_ideal_packets').pari_selected_ideal_packets
result=[]
for r in json.load(sys.stdin):
 n=r['degree'];cat=r['catalog'];primes=[];fo=[];fc=[];degrees=[];po=[];pc=[];pd=[];mult=[]
 for index,d in enumerate(cat):
  if not primes or primes[-1]!=d['p']:
   primes.append(d['p']);fo.append(index);fc.append(0);po.append(len(pd));pc.append(0)
  fc[-1]+=1;degrees.append(d['f'])
  if pc[-1]==0 or pd[-1]!=d['f']:pd.append(d['f']);mult.append(1);pc[-1]+=1
  else:mult[-1]+=1
 cap=max(primes)+1;sp=[0]*len(primes);off=[0]*cap;counts=[0]*cap;complete=[0]*cap;indices=[0]*len(cat)
 b=base(n,r['real'],[r['logD'],0.0,0.0],primes,po,pc,pd,mult,fo,fc,degrees,[0]*(n+1),[0.0]*(len(primes)+2),[0.0]*2,[0.0]*(len(primes)+1),sp,off,counts,complete,indices)
 assert list(b[:5])==r['base']
 descriptors=[list(map(int,r['table'])),[d['p'] for d in cat],degrees,[d['inert'] for d in cat],[int(x) for d in cat for x in d['generator']],len(cat),indices]
 for count in (0,1,b[2]):
  scratch=[[77]*n,[77]*(n*n),[77]*(n*n),[77]*n,[77]*(n*n)]
  ideals=[77]*(b[2]*n*n+2);norms=[77]*(b[2]+2)
  assert pack(*descriptors,count,n,*scratch,ideals,norms)==count
  assert ideals==[int(x) for H in r['expectedIdeals'][:count] for x in H]+[77]*((b[2]-count)*n*n+2)
  assert norms==list(map(int,r['expectedNorms'][:count]))+[77]*(b[2]-count+2)
 for invalid in (-1,len(cat)):
  bad=descriptors.copy();bad[6]=indices[:];bad[6][0]=invalid
  scratch=[[77]*n,[77]*(n*n),[77]*(n*n),[77]*n,[77]*(n*n)];ideals=[77]*(b[2]*n*n+2);norms=[77]*(b[2]+2)
  before=str((scratch,ideals,norms))
  try:pack(*bad,b[2],n,*scratch,ideals,norms)
  except ValueError:pass
  else:raise AssertionError('invalid selected index accepted')
  assert str((scratch,ideals,norms))==before
 result.append({'field':r['field'],'base':list(map(str,b)),'selectedIndices':indices[:b[2]],'descriptors':descriptors,'degree':n,'expectedIdeals':[x for H in r['expectedIdeals'] for x in H],'expectedNorms':r['expectedNorms']})
print(json.dumps(result))
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify(fields)}));
 const backends=['PARI','CPython'];
 if(process.argv.includes('--native')){
  const {compileKernel}=require('../../tools/native-kernel/compiler.cjs');
  const built=await compileKernel({sourcePath:path.join(__dirname,'selected_ideal_packets.py')});const f=require(built.modulePath).pari_selected_ideal_packets;
  for(const backend of ['javascript','gmp','tagged'])for(const r of receipts){
   const n=r.degree,kc=r.selectedIndices.length,d=r.descriptors.map(v=>Array.isArray(v)?v.map(BigInt):BigInt(v));
   for(const count of [0,1,kc]){
    const scratch=[n,n*n,n*n,n,n*n].map(k=>Array(k).fill(77n)),H=Array(kc*n*n+2).fill(77n),N=Array(kc+2).fill(77n);
    assert.equal(f[backend](...d,BigInt(count),BigInt(n),...scratch,H,N),BigInt(count));
    assert.deepEqual(H,[...r.expectedIdeals.slice(0,count*n*n).map(BigInt),...Array((kc-count)*n*n+2).fill(77n)]);
    assert.deepEqual(N,[...r.expectedNorms.slice(0,count).map(BigInt),...Array(kc-count+2).fill(77n)]);
   }
   for(const index of [-1,Number(d[5])]){const bad=d.slice();bad[6]=d[6].slice();bad[6][0]=BigInt(index);const owners=[n,n*n,n*n,n,n*n,kc*n*n+2,kc+2].map(k=>Array(k).fill(77n));assert.throws(()=>f[backend](...bad,BigInt(kc),BigInt(n),...owners),/selected ideal index/);assert(owners.every(a=>a.every(x=>x===77n)));}
  }
  backends.push('javascript','gmp','tagged');
 }
 fs.writeFileSync(path.join(directory,'fixtures.json'),JSON.stringify({fields,receipts}));
 console.log(JSON.stringify({directory,backends,activeIdeals:receipts.map(r=>r.selectedIndices.length),sourceHash:hash(fs.readFileSync(path.join(__dirname,'selected_ideal_packets.py'))),oracleHash:hash(c),boundary:'prepared maximal order and full prime decomposition; translated initial_base selection feeds HNF/norm construction; oracle packets assertions only'}));
})().catch(e=>{console.error(e);process.exitCode=1;});
