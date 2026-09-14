"use strict";
// Upstream code is a diagnostic oracle, never the translated runtime backend.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),os=require("node:os");
const {spawnSync}=require("node:child_process"),{createHash}=require("node:crypto");
const {compileKernel}=require("../../tools/native-kernel/compiler.cjs");
function run(command,args,options={}){const r=spawnSync(command,args,{encoding:"utf8",timeout:60000,maxBuffer:8*1024*1024,...options});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
(async()=>{
 const connected=process.argv.includes("--connected");
 const pari=path.resolve(process.argv[2]),archive=path.resolve(process.argv[3]),lib=path.join(pari,"Olinux-x86_64");
 const upstream=run("tar",["-xOf",archive,"pari-2.17.4/src/basemath/buch2.c"]);
 assert.equal(createHash("sha256").update(upstream).digest("hex"),"904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac");
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"sagejs-ideal-preparation-")),c=path.join(dir,"oracle.c"),exe=path.join(dir,"oracle");
 fs.writeFileSync(c,upstream+`
static void scalar(GEN x) {long e;if(typ(x)==t_INT)pari_printf(" %Ps -1 0",x);else pari_printf(" %Ps %ld %ld",signe(x)?mantissa_real(x,&e):gen_0,signe(x)?bit_prec(x):0,expo(x));}
static void ints(GEN x,long n){for(long i=1;i<=n;i++)for(long j=1;j<=n;j++)pari_printf(" %Ps",gcoeff(x,i,j));}
static void reals(GEN x,long n){for(long i=1;i<=n;i++)for(long j=1;j<=n;j++)scalar(gcoeff(x,i,j));}
int main(void){pari_init(128000000,10000);
 const char *polys[]={"x^3-20018*x+20034","x^3-20010*x+20018","x^4-20018*x-20034","x^4-2000022*x-2000042"};
 long primes[]={2,3,5,7,11,13,17,19};double scales[]={0.125,4.,1.e12};
 for(long f=0;f<4;f++){pari_sp outer=avma;GEN nf=nfinit(gp_read_str(polys[f]),nbits2prec(192));long n=nf_get_degree(nf),prec=nf_get_prec(nf);
 for(long k=0;k<8;k++){pari_sp keep=avma;GEN I=idealhnf(nf,gel(idealprimedec(nf,stoi(primes[k])),1)),G=nf_get_G(nf),U=ZM_lll(ZM_mul(nf_get_roundG(nf),I),.99,LLL_IM),ideal=ZM_mul(I,U),matrix=RgM_mul(G,ideal),r=gaussred_from_QR(matrix,prec);if(!r)return 2;
 {forprime_t S;init_modular_small(&S);ulong rp=u_forprime_next(&S);long nullity;Flm_pivots(ZM_to_Flm(ZM_mul(nf_get_roundG(nf),I),rp),rp,&nullity,1);if(rp!=2147483659UL||nullity!=0)return 5;}
 for(long t=0;t<3;t++){double v[11]={0},q[121]={0},T=scales[t];long stride=n+1;
 for(long i=1;i<=n;i++){if(!gisdouble(gcoeff(r,i,i),&v[i]))return 3;for(long j=1;j<i;j++)if(!gisdouble(gcoeff(r,j,i),&q[j*stride+i]))return 4;}
 double b2=v[2]+v[1]*q[stride+2]*q[stride+2],bound=maxdd(2*b2,Fincke_Pohst_bound(T,r));
 GEN zT=dbltor(T*T),prod=gcoeff(r,1,1);long stop;for(stop=2;stop<=n;stop++){prod=gmul(prod,gcoeff(r,stop,stop));GEN B=sqrtnr(gmul(zT,prod),stop);if(stop==n||cmprr(B,gcoeff(r,stop+1,stop+1))<0)break;}
 printf("%ld %ld %.17g %ld %ld %.17g",n,prec2nbits(prec),T,ZV_isscalar(gel(ideal,1)),stop,bound);
 ints(I,n);ints(U,n);ints(nf_get_roundG(nf),n);reals(G,n);ints(ideal,n);reals(matrix,n);reals(r,n);
 for(long i=0;i<=n;i++)printf(" %.17g",v[i]);for(long i=0;i<stride*stride;i++)printf(" %.17g",q[i]);puts("");}
 avma=keep;}avma=outer;}pari_close();return 0;}
`);
 run("cc",["-O2","-I"+path.join(pari,"src/headers"),"-I"+lib,c,"-L"+lib,"-Wl,-rpath,"+lib,"-lpari","-lm","-o",exe]);
 const trace=run(exe,[]),rows=trace.trim().split("\n").map(line=>{
  const fields=line.trim().split(/\s+/),n=Number(fields[0]);let offset=6;const take=k=>{const out=fields.slice(offset,offset+k);offset+=k;return out;};
  const row={n,precision:fields[1],scale:Number(fields[2]),skip:fields[3],stop:fields[4],bound:Number(fields[5]),I:take(n*n),U:take(n*n),G0:take(n*n),G:take(3*n*n),ideal:take(n*n),matrix:take(3*n*n),reduction:take(3*n*n),v:take(n+1).map(Number),q:take((n+1)**2).map(Number)};
  assert.equal(offset,fields.length);return row;
 });assert.equal(rows.length,96);
 const moduleName=connected?"ideal_ranked_preparation":"ideal_enumeration_preparation",entry=connected?"pari_ideal_ranked_preparation":"pari_ideal_prepare_enumeration";
 const sourcePath=path.join(__dirname,moduleName+".py"),source=fs.readFileSync(sourcePath,"utf8");
 const declarations=source.match(new RegExp("def "+entry+"\\(([\\s\\S]*?)\\n\\)"))[1].trim().split("\n").map(s=>s.trim().replace(/,$/,"").split(": "));
 const names=declarations.map(x=>x[0]),floatNames=declarations.filter(x=>x[1]==="Float64Buffer").map(x=>x[0]);
 function inputs(r){const n=r.n,z=k=>Array(k).fill("0");return {original_ideal:r.I,transform:Array.from({length:n*n},(_,p)=>r.U[(p%n)*n+Math.floor(p/n)]),embedding:r.G,n:String(n),precision:r.precision,scale:r.scale,ideal:z(n*n),matrix:z(3*n*n),flags:z(1),reduction:z(3*n*n),vectors:z(3*n*n),betas:z(3*n),norms:z(3*n),column:z(3*n),float_q:z((n+1)**2),float_v:z(n+1),bound:z(1),cache:z(3),a:z(64),b:z(64),p:z(64),q:z(64),stack:z(128)};}
 const all=rows.map(r=>{
  const values=inputs(r);if(!connected)return values;
  const n=r.n;values.rounded_embedding=r.G0;values.transform=Array(n*n).fill("0");values.flags=["0","0"];
  delete values.matrix;delete values.reduction;delete values.a;delete values.b;delete values.p;delete values.q;delete values.stack;
  for(const name of names){if(name in values)continue;let length=n*n;
   if(["qr_input","qr","vectors"].includes(name))length=3*n*n;
   else if(["betas","norms","column"].includes(name))length=3*n;
   else if(["y","s","exponents","s_exponents","alpha","column_exponents","float_scratch"].includes(name))length=n;
   else if(name==="diagnostic")length=7;
   else if(name==="rank_diagnostic")length=3;
   else if(name==="selection")length=5;
   else if(name==="stages")length=4;
   else if(name==="temporary")length=1;
   else if(["r1","r2","r3","inverse","first","second","final"].includes(name))length=12;
   else if(["t1","t2","t3","integers","rounded"].includes(name))length=4;
   else if(name.startsWith("root_"))length=name==="root_stack"?128:64;
   values[name]=Array(length).fill("0");
  }return values;
 });
 run("python3",["-c",`
import sys,json,decimal,importlib
sys.path[:0]=sys.argv[1:3]
f=getattr(importlib.import_module('bench.pari-class-group-port.${moduleName}'),'${entry}')
names,float_names,inputs,rows,connected=json.load(sys.stdin)
for index,(raw,r) in enumerate(zip(inputs,rows)):
 values={k:[float(v) if k in float_names else int(v) for v in x] if isinstance(x,list) else float(x) if k=='scale' else int(x) for k,x in raw.items()}
 status=f(*(values[k] for k in names));assert status==(0 if connected else int(r['stop'])),(index,status)
 for k in ['ideal','matrix','reduction']:
  actual={'matrix':'qr_input','reduction':'qr'}.get(k,k) if connected else k
  assert values[actual]==list(map(int,r[k])),(index,k)
 assert values['flags']==([int(r['skip']),int(r['stop'])] if connected else [int(r['skip'])]),index
 if connected:
  n=r['n'];assert values['transform']==[int(r['U'][i*n+j]) for j in range(n) for i in range(n)],index
  assert values['rank_diagnostic']==[1,2147483659,0],index
 assert values['float_q']==r['q'] and values['float_v']==r['v'] and values['bound']==[r['bound']],index
if connected:
 raw=inputs[0]
 values={k:[float(v) if k in float_names else int(v) for v in x] if isinstance(x,list) else float(x) if k=='scale' else int(x) for k,x in raw.items()}
 values['original_ideal']=[0]*len(values['original_ideal'])
 assert f(*(values[k] for k in names))==1
 assert values['flags']==[-1,-1] and not any(values['ideal'])
 n=values['n'];values['original_ideal']=[2147483659*2147483693 if i==j else 0 for i in range(n) for j in range(n)]
 assert f(*(values[k] for k in names))==7
 assert values['rank_diagnostic']==[2,2147483693,n] and values['flags']==[-1,-1]
`,path.resolve(__dirname,"../.."),path.resolve(__dirname,"../../src/lib")],{input:JSON.stringify([names,floatNames,all,rows,connected])});
 const built=await compileKernel({sourcePath}),f=require(built.modulePath)[entry];assert.equal(f.nativeAvailable,true);
 for(let index=0;index<rows.length;index++)for(const backend of ["javascript","gmp"]){
  const r=rows[index],values={};for(const[k,x]of Object.entries(all[index]))values[k]=Array.isArray(x)?x.map(floatNames.includes(k)?Number:BigInt):k==="scale"?Number(x):BigInt(x);
  if(backend==="gmp")for(const k of names)if(Array.isArray(values[k])&&!floatNames.includes(k))values[k]=f.packIntegerBuffer(values[k],64);
  assert.equal(f[backend](...names.map(k=>values[k])),connected?0n:BigInt(r.stop),`${index} ${backend} status`);
  const ints=k=>backend==="gmp"?values[k].toArray():values[k];
  for(const k of ["ideal","matrix","reduction"])assert.deepEqual(ints(connected?({matrix:"qr_input",reduction:"qr"}[k]||k):k),r[k].map(BigInt),`${index} ${backend} ${k}`);
  assert.deepEqual(ints("flags"),connected?[BigInt(r.skip),BigInt(r.stop)]:[BigInt(r.skip)]);assert.deepEqual(values.float_q,r.q);assert.deepEqual(values.float_v,r.v);assert.deepEqual(values.bound,[r.bound]);
  if(connected){const n=r.n;assert.deepEqual(ints("transform"),Array.from({length:n*n},(_,p)=>BigInt(r.U[(p%n)*n+Math.floor(p/n)])),`${index} ${backend} U`);assert.deepEqual(ints("rank_diagnostic"),[1n,2147483659n,0n]);}
 }
 if(connected)for(const backend of ["javascript","gmp"])for(const dubious of [false,true]){
  const values={};for(const[k,x]of Object.entries(all[0]))values[k]=Array.isArray(x)?x.map(floatNames.includes(k)?Number:BigInt):k==="scale"?Number(x):BigInt(x);
  values.original_ideal.fill(0n);
  if(dubious){const n=Number(values.n);for(let i=0;i<n;i++)values.original_ideal[i*n+i]=2147483659n*2147483693n;}
  if(backend==="gmp")for(const k of names)if(Array.isArray(values[k])&&!floatNames.includes(k))values[k]=f.packIntegerBuffer(values[k],64);
  assert.equal(f[backend](...names.map(k=>values[k])),dubious?7n:1n,`${backend} rank dependency`);
  assert.deepEqual(backend==="gmp"?values.flags.toArray():values.flags,[-1n,-1n]);
 }
 assert.doesNotMatch(fs.readFileSync(built.coreSourcePath,"utf8"),/napi_call_function|PyObject_Call/);
 console.log(connected?"96 connected rank/LLL/ideal/embedding/QR/bound paths match PARI/CPython/JS/GMP; rank and U are computed":"96 post-LLL ideal/embedding/QR/bound paths match PARI/CPython/JS/GMP exactly; U remains supplied scaffolding");
 console.log(JSON.stringify({traceSha256:createHash("sha256").update(trace).digest("hex"),modulePath:built.modulePath,qualifiedTiming:false}));
})().catch(error=>{console.error(error);process.exitCode=1;});
