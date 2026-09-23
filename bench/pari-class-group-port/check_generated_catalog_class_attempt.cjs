"use strict";
// Diagnostic composition: prepared nf -> generated degree/descriptor catalogs -> candidate.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const hash=x=>createHash('sha256').update(x).digest('hex');
(async()=>{
if(process.argv[2]==='--rpc'){
 const backend=process.argv[3],loaded=new Map();
 const {createInterface}=require('node:readline');
 for await(const line of createInterface({input:process.stdin,crlfDelay:Infinity})){
  try{
   const request=JSON.parse(line);let mod=loaded.get(request.module);
   if(!mod){
    const sourcePath=path.join(__dirname,request.module+'.py');
    if(backend==='javascript'){
     const {lowerSource}=require('../../tools/native-kernel/ir.cjs'),{createNativeImportResolver}=require('../../tools/native-kernel/native-imports.cjs'),{generateJavaScript}=require('../../tools/native-kernel/js-backend.cjs');
     const resolveNativeImport=createNativeImportResolver({root:path.resolve(__dirname,'../..'),lowerSource,initialSourcePath:sourcePath});
     const ir=await lowerSource(fs.readFileSync(sourcePath,'utf8'),sourcePath,{resolveNativeImport});
     const filename=path.join(process.argv[4],request.module+'.cjs');fs.writeFileSync(filename,generateJavaScript(ir,{sourcePath}));mod=require(filename);
    }else{
     const {compileKernel}=require('../../tools/native-kernel/compiler.cjs');const built=await compileKernel({sourcePath});mod=require(built.modulePath);
     fs.appendFileSync(path.join(process.argv[4],'kernels.jsonl'),JSON.stringify({module:request.module,coreHash:hash(fs.readFileSync(built.coreSourcePath)),addonHash:hash(fs.readFileSync(built.addonPath)),modulePath:built.modulePath})+'\n');
    }
    loaded.set(request.module,mod);
   }
   const args=request.args.map((v,i)=>{const kind=request.kinds[i],convert=kind==='bool'?Boolean:['float','Float64Buffer'].includes(kind)?Number:BigInt;return Array.isArray(v)?v.map(convert):convert(v);});
   const result=mod[request.name][backend](...args);
   process.stdout.write(JSON.stringify({result,args},(_,v)=>typeof v==='bigint'?String(v):v)+'\n');
  }catch(error){process.stdout.write(JSON.stringify({error:error.stack})+'\n');}
 }
 return;
}
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-generated-catalog-class-'));
const paths=process.argv.slice(2,5);assert.equal(paths.length,3,'prepared class template, analytic template, Kummer template required');
const [prepared,analytic,kummer]=paths.map(p=>JSON.parse(fs.readFileSync(p)));
// Positive allowlists: do not send expected fields, selected ideals or policy answers to Python.
const nfNames=['admission_matrix_m','admission_matrix_p','admission_matrix_e','preparation_embedding','preparation_rounded_embedding'];
const runtimeNames=['admission_primes','admission_products'];
const raw=prepared.inputs[0],nf=kummer.prepared,a=analytic.cases[0];
assert.equal(prepared.expected[0].field,0);assert.equal(Number(raw.n),3);assert.equal(Number(raw.admission_real_count),3);
assert.deepEqual(nf.polynomial.map(String),['20034','-20018','0','1']);
assert.equal(String(a.discriminant),'32075641032116');assert.equal(Number(a.roots_of_unity),2);
const capacities=Object.fromEntries(prepared.names.filter(([k])=>Array.isArray(raw[k])).map(([k])=>[k,raw[k].length]));
const payload={capacities,names:prepared.names,nf:Object.fromEntries(nfNames.map(k=>[k,raw[k]])),runtime:Object.fromEntries(runtimeNames.map(k=>[k,raw[k]])),field:Object.fromEntries(['polynomial','invzk','zk','zkDegrees','table','index','zkden'].map(k=>[k,nf[k]])),discriminant:a.discriminant,rootsOfUnity:a.roots_of_unity,analyticNames:analytic.names,analyticCapacities:Object.fromEntries(analytic.names.filter(([k])=>Array.isArray(a[k])).map(([k])=>[k,a[k].length])),catalogNames:kummer.names,catalogCapacities:Object.fromEntries(Object.entries(kummer.cp.at(-1).input).filter(([,v])=>Array.isArray(v)).map(([k,v])=>[k,v.length]))};
const backendAt=process.argv.indexOf('--backend'),backend=backendAt<0?'cpython':process.argv[backendAt+1];assert(['cpython','javascript','gmp'].includes(backend));
payload.backend=backend;payload.node=process.execPath;payload.checker=__filename;payload.directory=dir;
const script=String.raw`import sys,json,importlib,inspect,copy,decimal,subprocess,ast,atexit
sys.set_int_max_str_digits(100000);sys.path[:0]=sys.argv[1:3]
d=json.load(sys.stdin)
rpc=None
if d['backend']!='cpython':
 rpc=subprocess.Popen([d['node'],d['checker'],'--rpc',d['backend'],d['directory']],stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True)
 def close_rpc():
  if not rpc.stdin.closed:rpc.stdin.close()
  rpc.wait()
 atexit.register(close_rpc)
def strings(value):
 if isinstance(value,list):return [strings(x) for x in value]
 return str(value) if isinstance(value,int) and not isinstance(value,bool) else value
def parsed(value):
 if isinstance(value,list):return [parsed(x) for x in value]
 return int(value) if isinstance(value,str) else value
def f(module,name):
 original=getattr(importlib.import_module('bench.pari-class-group-port.'+module),name)
 if rpc is None:return original
 signature=inspect.signature(original)
 definition=ast.parse(inspect.getsource(original)).body[0]
 kinds=[ast.unparse(p.annotation) for p in definition.args.args]
 def invoke(*args,**kwargs):
  bound=signature.bind(*args,**kwargs);values=list(bound.arguments.values())
  rpc.stdin.write(json.dumps(dict(module=module,name=name,kinds=kinds,args=strings(values)))+'\n');rpc.stdin.flush()
  response=json.loads(rpc.stdout.readline());assert 'error' not in response,response.get('error')
  for old,new in zip(values,response['args']):
   if isinstance(old,list):old[:]=parsed(new)
  return parsed(response['result'])
 invoke.__signature__=signature
 return invoke
def z(n):return [0]*n
def ints(v):return list(map(int,v))
n=3;r1=3;ru=3;index=int(d['field']['index']);assert index==1
v={k:z(length) for k,length in d['capacities'].items()}
for k,value in d['nf'].items():v[k]=ints(value)
for k,value in d['runtime'].items():v[k]=ints(value)
# Runtime prime table is independent of nf; verify it is the complete prime list.
limit=65537;sieve=[True]*(limit+1);sieve[0]=sieve[1]=False
for p in range(2,int(limit**0.5)+1):
 if sieve[p]:
  for j in range(p*p,limit+1,p):sieve[j]=False
runtime_primes=[p for p in range(2,limit+1) if sieve[p]]
assert v['admission_primes']==runtime_primes
primes=[p for p in runtime_primes if p<=10007];pcnt=len(primes)
po=z(pcnt);pc=z(pcnt);pd=z(pcnt*n);mult=z(pcnt*n);fo=z(pcnt);fc=z(pcnt);fd=z(pcnt*n);ds=z(4)
degree=f('prime_degree_catalog','pari_prime_degree_catalog')
status=degree(ints(d['field']['polynomial']),n,index,primes,pcnt,z(393),z(n),z(n),z(n),z(n),z(3),po,pc,pd,mult,fo,fc,fd,ds)
assert status==0 and ds[0]==0,(status,ds)
pd=pd[:ds[2]];mult=mult[:ds[2]];fd=fd[:ds[3]]
logd=f('discriminant_log','pari_discriminant_log')(int(d['discriminant']))
sp=z(pcnt);off=z(primes[-1]+1);cnt=off.copy();complete=off.copy();selected=z(len(fd))
base=f('initial_base','pari_prepared_initial_base')(n,r1,[logd,0.,0.],primes,po,pc,pd,mult,fo,fc,fd,z(n+1),[0.]*(pcnt+2),[0.]*2,[0.]*(pcnt+1),sp,off,cnt,complete,selected)
c1,c2,kc,kcz,kcz2,kc2,prod=base;assert kcz==kcz2,'honesty frontier needs separate verification'
cat={k:z(length) for k,length in d['catalogCapacities'].items()}
cat.update(primes=primes,pattern_offsets=po,pattern_counts=pc,pattern_degrees=pd,multiplicities=mult,full_offsets=fo,prime_count=pcnt,bound=c2,polynomial=ints(d['field']['polynomial']),invzk=ints(d['field']['invzk']),zk=ints(d['field']['zk']),zk_degrees=ints(d['field']['zkDegrees']),table=ints(d['field']['table']),n=n,index=index,zkden=int(d['field']['zkden']))
for k in ['catalog_primes','catalog_e','catalog_f','catalog_inert']:cat[k]=z(len(fd))
cat['catalog_generators']=z(len(fd)*n);cat['catalog_tau']=z(len(fd)*n*n);cat['requested_counts']=z(pcnt)
f('pari_random','pari_random_seed')(cat['random_state'],1)
written=f('initial_kummer_catalog','pari_initial_kummer_catalog')(**cat);assert written==kc
for ix in selected[:kc]:assert cat['catalog_primes'][ix]>0,'selected unproduced descriptor'
H=z(kc*n*n);N=z(kc)
assert f('selected_ideal_packets','pari_selected_ideal_packets')(cat['table'],cat['catalog_primes'],cat['catalog_f'],cat['catalog_inert'],cat['catalog_generators'],len(fd),selected,kc,n,z(n),z(n*n),z(n*n),z(n),z(n*n),H,N)==kc
mp=z(kc);me=z(kc);mf=z(kc);mi=z(kc);mt=z(kc*n*n)
assert f('selected_ideal_metadata','pari_selected_ideal_metadata')(cat['catalog_primes'],cat['catalog_e'],cat['catalog_f'],cat['catalog_inert'],cat['catalog_tau'],len(fd),selected,kc,n,mp,me,mf,mi,mt)==kc
active=sp[:kcz];bad=z(kc)
f('bad_subfactor','pari_bad_subfactor_flags')([off[p] for p in active],[cnt[p] for p in active],[complete[p] for p in active],kcz,kc,bad)
product=f('subfactor_product','pari_subfactor_product')(n,0,logd,c2);perm=z(kc)
sub=f('subfactor_base','pari_prepared_subfactor_base')(N,bad,[product],3,z(kc),z(kc),z(3*kc+3),z(kc),z(kc),perm)
additional=5+ru-1;target=kc+additional;cap=10*target+50
v.update(n=n,precision=192,scale=f('ball_volume','pari_small_norm_scale')(n),track_small=1,admission_real_count=r1,admission_mode=2,admission_factor_product=prod,admission_factorlimit=1048576,admission_prime_limit=65537,nrelid=4,track_fact=1,jid0=0,e0=0,extra_count=-1,search_count=kc,construct_primes=0,outer_mode=0,outer_ru=0,log_precision=192,initial_additional=additional,initial_target=target,hnf_k0=sub[0],accept_cache_changed=True)
v.update(admission_prime_offsets=[-1]*(c2+1),admission_prime_counts=z(c2+1),admission_group_tau=mt,admission_group_e=me,admission_group_f=mf,admission_group_inert=mi,relation_primes=mp,ramification=me.copy(),packet_ids=list(range(1,kc+1)),packet_ideals=H,packet_norms=N,search_ideals=perm.copy(),initial_primes=active,initial_offsets=[off[p] for p in active],initial_counts=[cnt[p] for p in active],initial_complete=[complete[p] for p in active],hnf_perm=perm.copy(),relation=z(kc),relation_scratch=z(kc),relation_basis=z(kc*kc),relation_records=z(cap*kc),relation_hashes=z(cap),relation_metadata=z(3*cap),generators=z(cap*n),relation_state=[0,cap,kc,additional,0,target])
for p in active:v['admission_prime_offsets'][p]=off[p];v['admission_prime_counts'][p]=cnt[p]
v['accept_inverse_hr']=[-991,-992,-993]
for k,kind in d['analyticNames']:
 if k in ('real_places','complex_places'):continue
 if k in d['analyticCapacities']:v['analytic_'+k]=[0. if kind=='Float64Buffer' else 0]*d['analyticCapacities'][k]
v.update(analytic_discriminant=int(d['discriminant']),analytic_roots_of_unity=int(d['rootsOfUnity']),analytic_log_discriminant=[-999.],analytic_primes=primes,analytic_offsets=po,analytic_counts=pc,analytic_degrees=pd,analytic_multiplicities=mult,analytic_state=z(2))
entry=f('analytic_class_group_attempt','pari_analytic_class_group_attempt');names=list(inspect.signature(entry).parameters)
assert set(names)==set(v),(set(names)-set(v),set(v)-set(names))
fresh=copy.deepcopy(v)
action=entry(**v)
summary=dict(action=action,state=v['attempt_state'],classNumber=str(v['class_number'][0]),invariants=list(map(str,v['class_invariants'][:v['attempt_state'][2]])),regulator=list(map(str,v['accept_regulator'][:3])),initialBase=list(map(str,base)),catalogState=cat['state'][:4],degreeState=ds,subfactorCount=sub[0],analyticState=v['analytic_state'],inverseHR=list(map(str,v['accept_inverse_hr'])),logD=v['analytic_log_discriminant'],relations=v['relation_state'][0])
before=copy.deepcopy(v);assert entry(**v)==action and v==before
if rpc is not None:rpc.stdin.close();assert rpc.wait()==0
with open(sys.argv[3],'w') as out:json.dump({'fresh':fresh,'summary':summary},out)
print(json.dumps(summary))
`;
const r=spawnSync('python3',['-c',script,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib'),path.join(dir,'cp.json')],{input:JSON.stringify(payload),encoding:'utf8',maxBuffer:128*1024*1024,timeout:600000});
assert.equal(r.status,0,r.stderr||String(r.error));const cp=JSON.parse(r.stdout),e=prepared.summary.cp[0];
for(const key of ['action','state','classNumber','invariants','regulator'])assert.deepEqual(cp[key],e[key],key);
assert.deepEqual(cp.initialBase.slice(0,6),['333','333','66','48','48','66']);
assert.equal(cp.subfactorCount,4);assert.equal(cp.relations,73);
const produced=JSON.parse(fs.readFileSync(path.join(dir,'cp.json'))).fresh;
for(const [key,source]of [['offsets','offsets'],['counts','counts'],['degrees','degrees'],['multiplicities','multiplicities']])assert.deepEqual(produced['analytic_'+key].map(String),a[source].map(String),'source analytic '+key);
const sourceRecords=kummer.rows.find(row=>row.bound===333).groups.flatMap(group=>group.records);
for(const [key,index]of [['relation_primes',0],['admission_group_e',1],['admission_group_f',2],['admission_group_inert',3]])assert.deepEqual(produced[key].map(String),sourceRecords.map(row=>String(row[index])),key);
assert.deepEqual(produced.admission_group_tau.map(String),sourceRecords.flatMap(row=>row.slice(7).map(String)),'source selected tau');
const summary={cp,backend,qualifiedTiming:false,oneNativeCall:false,templateValueAllowlist:[...nfNames,...runtimeNames],remainingBoundary:'Prepared nf embeddings including rounded embedding, integral basis and multiplication table; runtime prime/product tables; no degree patterns, selected descriptors, HNF/norm packets, policy outcomes or inverse hR supplied.',inputHashes:paths.map(p=>hash(fs.readFileSync(p))),checkerHash:hash(fs.readFileSync(__filename)),artifactDirectory:dir};
fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
})().catch(error=>{console.error(error);process.exitCode=1;});
