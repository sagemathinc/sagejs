"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const hash=x=>createHash('sha256').update(x).digest('hex');
function run(c,a,input){const r=spawnSync(c,a,{input,encoding:'utf8',timeout:240000,maxBuffer:64*1024*1024});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
(async()=>{
 const pari=path.resolve(process.argv[2]),archive=path.resolve(process.argv[3]),preparedPath=path.resolve(process.argv[4]),lib=path.join(pari,'Olinux-x86_64');
 assert.equal(hash(fs.readFileSync(archive)),'02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53');
 const prepared=JSON.parse(fs.readFileSync(preparedPath)).rows.find(r=>r.field===0);assert(prepared&&prepared.index==='1');
 const source=run('tar',['-xOf',archive,'pari-2.17.4/src/basemath/buch2.c']);
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-initial-kummer-catalog-'));
 const control=source+String.raw`
static void exact(GEN x){pari_printf("\"%Ps\"",x);}
int main(void){pari_init(128000000,10000);GEN nf=nfinit(gp_read_str("x^3-20018*x+20034"),nbits2prec(192));long n=nf_get_degree(nf),r1=nf_get_r1(nf);double ld=dbllog2(absi(nf_get_disc(nf)))*M_LN2;
GRHcheck_t initial;init_GRHcheck(&initial,n,r1,ld);long lo=1,hi=1;while(!GRHchk(nf,&initial,hi)){lo=hi;hi*=2;}while(hi-lo>1){long t=(lo+hi)/2;if(GRHchk(nf,&initial,t))hi=t;else lo=t;}long c2=(hi==2&&GRHchk(nf,&initial,1))?1:hi;if(c2>(long)(4*ld*ld))c2=(long)(4*ld*ld);long minimum=nthideal(&initial,nf,n);if(c2<minimum)c2=minimum;free_GRHcheck(&initial);
long bounds[]={1,2,3,5,7,37,c2};putchar('[');for(long z=0;z<7;z++){long bound=bounds[z];GRHcheck_t S;init_GRHcheck(&S,n,r1,ld);cache_prime_dec(&S,bound,nf);if(z)putchar(',');printf("{\"bound\":%ld,\"patterns\":[",bound);
for(long j=0;j<S.nprimes;j++){if(j)putchar(',');GRHprime_t *r=S.primes+j;GEN f=gel(r->dec,1),m=gel(r->dec,2);printf("[%lu,[",r->p);for(long k=1;k<lg(f);k++){if(k>1)putchar(',');printf("%ld",f[k]);}printf("],[");for(long k=1;k<lg(m);k++){if(k>1)putchar(',');printf("%ld",m[k]);}printf("]]");}
FB_t F={0};setrand(gen_1);FBgen(&F,nf,n,bound,bound,&S);printf("],\"groups\":[");for(long j=1;j<=F.KCZ2;j++){long p=F.FB[j];GEN V=gel(F.LV,p);if(j>1)putchar(',');printf("{\"p\":%ld,\"records\":[",p);for(long k=1;k<lg(V);k++){GEN P=gel(V,k),u=pr_get_gen(P),tau=pr_get_tau(P);if(k>1)putchar(',');printf("[\"%ld\",\"%ld\",\"%ld\",\"0\"",p,pr_get_e(P),pr_get_f(P));for(long i=1;i<=n;i++){putchar(',');exact(gel(u,i));}for(long a=1;a<=n;a++)for(long b=1;b<=n;b++){putchar(',');exact(gcoeff(tau,a,b));}putchar(']');}printf("]}");}
printf("],\"rng\":[");GEN r=getrand();for(long i=0;i<66;i++){if(i)putchar(',');ulong v=*int_W(r,i);if(i==65)v&=63;printf("\"%lu\"",v);}printf("]}");free_GRHcheck(&S);}
puts("]");pari_close();return 0;}
`;
 fs.writeFileSync(path.join(directory,'oracle.c'),control);const binary=path.join(directory,'oracle');run('cc',['-O1','-I'+path.join(pari,'src/headers'),'-I'+lib,path.join(directory,'oracle.c'),'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',binary]);
 const rows=JSON.parse(run(binary,[]));
 const sourcePath=path.join(__dirname,'initial_kummer_catalog.py'),names=fs.readFileSync(sourcePath,'utf8').match(/def pari_initial_kummer_catalog\(([\s\S]*?)\n\)/)[1].trim().split('\n').map(x=>x.trim().replace(/,$/,'').split(': '));
 const cp=JSON.parse(run('python3',['-c',`
import sys,json,importlib
sys.path[:0]=sys.argv[1:3]
d=json.load(sys.stdin);r=d['prepared'];n=r['n'];stride=4+n+n*n
get=importlib.import_module('bench.pari-class-group-port.get_fs_small').pari_get_fs_small
seed=importlib.import_module('bench.pari-class-group-port.pari_random').pari_random_seed
f=importlib.import_module('bench.pari-class-group-port.initial_kummer_catalog').pari_initial_kummer_catalog
out=[]
for row in d['rows']:
 v={name:[77]*1 if kind=='IntegerBuffer' else 0 for name,kind in d['names']}
 v.update(polynomial=list(map(int,r['polynomial'])),invzk=list(map(int,r['invzk'])),zk=list(map(int,r['zk'])),zk_degrees=r['zkDegrees'],table=list(map(int,r['table'])),n=n,index=int(r['index']),zkden=int(r['zkden']),bound=row['bound'],prime_count=len(row['patterns']))
 primes=[];po=[];pc=[];pd=[];mc=[];fo=[];slots=0
 for p,ed,em in row['patterns']:
  fd=[77]*(n+2);fe=fd.copy();de=fd.copy();co=fd.copy();st=[77]*3
  assert get(v['polynomial'],n,v['index'],p,[77]*393,fd,fe,de,co,st)==0
  count=st[1]
  assert de[:count]==ed and co[:count]==em
  primes.append(p);po.append(len(pd));pc.append(count);pd.extend(de[:count]);mc.extend(co[:count]);fo.append(slots);slots+=sum(co[:count])
 v.update(primes=primes,pattern_offsets=po,pattern_counts=pc,pattern_degrees=pd,multiplicities=mc,full_offsets=fo)
 sizes=dict(random_state=66,factorwork=16994,factor=n+1,diagnostic=3,minpoly_diagnostic=1,polywork=36,u=n,t=n,rational=2*n,primitive=n,column=n,resultant_work=n*n+n,resultant_trace=25,u_output=n,tau_output=n*n,descriptor_state=12,unsorted=n*stride,generators=n*n,residue_degrees=n,order=n,sort_diagnostic=2,decomposition_output=n*stride,decomposition_state=3,catalog_primes=slots,catalog_e=slots,catalog_f=slots,catalog_inert=slots,catalog_generators=slots*n,catalog_tau=slots*n*n,requested_counts=len(primes),state=4)
 for name,size in sizes.items():v[name]=[77]*(size+2)
 seed(v['random_state'],1)
 initial={name:x.copy() if isinstance(x,list) else x for name,x in v.items()}
 count=f(**v)
 for name,size in sizes.items():assert v[name][size:]==[77,77],name
 result={name:list(map(str,x)) if isinstance(x,list) else str(x) for name,x in v.items()}
 out.append(dict(count=count,input={name:list(map(str,x)) if isinstance(x,list) else str(x) for name,x in initial.items()},output=result))
for which in range(8):
 v={name:x.copy() if isinstance(x,list) else x for name,x in initial.items()}
 if which==0:v['bound']=0
 if which==1:v['prime_count']=0
 if which==2:v['primes']=[]
 if which==3:v['pattern_offsets'][0]=-1
 if which==4:v['pattern_counts'][0]=0
 if which==5:v['multiplicities'][0]=0
 if which==6:v['catalog_tau']=[]
 if which==7:v['state']=[]
 before={name:x.copy() if isinstance(x,list) else x for name,x in v.items()}
 try:f(**v)
 except ValueError:pass
 else:raise AssertionError('missing catalog preflight')
 assert v==before
print(json.dumps(out))
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],JSON.stringify({prepared,rows,names})));
 for(let i=0;i<rows.length;i++){
  const row=rows[i],got=cp[i].output,n=prepared.n,expected=Object.fromEntries(['catalog_primes','catalog_e','catalog_f','catalog_inert','catalog_generators','catalog_tau','requested_counts'].map(k=>[k,Array(got[k].length).fill('77')]));let count=0,visited=0;
  for(let j=0;j<row.patterns.length;j++){const p=row.patterns[j][0];if(p>row.bound)break;visited++;expected.requested_counts[j]='0';const group=row.groups.find(g=>g.p===p);if(!group)continue;expected.requested_counts[j]=String(group.records.length);const offset=Number(got.full_offsets[j]);group.records.forEach((r,k)=>{for(const [h,name]of ['catalog_primes','catalog_e','catalog_f','catalog_inert'].entries())expected[name][offset+k]=r[h];for(let a=0;a<n;a++)expected.catalog_generators[(offset+k)*n+a]=r[4+a];for(let a=0;a<n*n;a++)expected.catalog_tau[(offset+k)*n*n+a]=r[4+n+a];});count+=group.records.length;}
  for(const name in expected)assert.deepEqual(got[name],expected[name]);assert.equal(cp[i].count,count);assert.deepEqual(got.state,['0',String(visited),String(row.groups.length),String(count),'77','77']);assert.deepEqual(got.random_state,[...row.rng,'77','77']);
 }
 const result={cases:rows.length,invalidControls:8,backends:['cpython'],directory,sourceHash:hash(fs.readFileSync(sourcePath)),oracleHash:hash(control),preparedHash:hash(fs.readFileSync(preparedPath)),qualifiedTiming:false};
 fs.writeFileSync(path.join(directory,'fixtures.json'),JSON.stringify({prepared,rows,names,cp,result}));
 if(!process.argv.includes('--source-only')){
  const built=await require('../../tools/native-kernel/compiler.cjs').compileKernel({sourcePath}),f=require(built.modulePath).pari_initial_kummer_catalog;
  for(const backend of ['javascript','gmp','tagged'])for(const row of cp){const a=names.map(([name,kind])=>kind==='IntegerBuffer'?f.createIntegerBuffer(row.input[name].length,40,row.input[name].map(BigInt)):BigInt(row.input[name]));assert.equal(Number(f[backend](...a)),row.count);for(let j=0;j<names.length;j++)assert.deepEqual(typeof a[j]==='bigint'?String(a[j]):a[j].toArray().map(String),row.output[names[j][0]]);}
  for(const backend of ['javascript','gmp','tagged'])for(let which=0;which<8;which++){
   const v=structuredClone(cp.at(-1).input);
   if(which===0)v.bound='0';if(which===1)v.prime_count='0';if(which===2)v.primes=[];if(which===3)v.pattern_offsets[0]='-1';if(which===4)v.pattern_counts[0]='0';if(which===5)v.multiplicities[0]='0';if(which===6)v.catalog_tau=[];if(which===7)v.state=[];
   const a=names.map(([name,kind])=>kind==='IntegerBuffer'?f.createIntegerBuffer(v[name].length,40,v[name].map(BigInt)):BigInt(v[name]));
   assert.throws(()=>f[backend](...a),/Kummer/);for(let j=0;j<names.length;j++)assert.deepEqual(typeof a[j]==='bigint'?String(a[j]):a[j].toArray().map(String),v[names[j][0]]);
  }
  result.backends.push('javascript','gmp','tagged');result.coreHash=hash(fs.readFileSync(built.coreSourcePath));fs.writeFileSync(path.join(directory,'fixtures.json'),JSON.stringify({prepared,rows,names,cp,result}));
 }
 console.log(JSON.stringify(result));
})().catch(e=>{console.error(e);process.exitCode=1;});
