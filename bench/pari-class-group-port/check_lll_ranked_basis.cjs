"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {spawnSync}=require("node:child_process");
const {compileKernel}=require("../../tools/native-kernel/compiler.cjs");
function run(command,args,options={}){const r=spawnSync(command,args,{encoding:"utf8",timeout:60000,maxBuffer:8*1024*1024,...options});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
(async()=>{
 const oracle=JSON.parse(run(process.execPath,[path.join(__dirname,"probe_lll_preparation.cjs"),process.argv[2],process.argv[3]]));
 assert.equal(oracle.rows.length,32);
 const sourcePath=path.join(__dirname,"lll_ranked_basis.py"),source=fs.readFileSync(sourcePath,"utf8");
 const declarations=source.match(/def pari_lll_ranked_basis\(([\s\S]*?)\n\)/)[1].trim().split("\n").map(s=>s.trim().replace(/,$/,"").split(": "));
 const names=declarations.map(x=>x[0]),floatNames=new Set(declarations.filter(x=>x[1]==="Float64Buffer").map(x=>x[0]));
 function inputs(row){
  const n=row.degree,values={original:row.input,n:String(n),rank:String(n)};
  for(const name of names){if(name in values)continue;let length=n*n;
   if(["qr_input","qr","vectors"].includes(name))length=3*n*n;
   else if(["betas","norms","column"].includes(name))length=3*n;
   else if(["y","s","exponents","s_exponents","alpha","column_exponents","float_scratch"].includes(name))length=n;
   else if(name==="diagnostic")length=7;
   else if(name==="selection")length=5;
   else if(name==="stages")length=4;
   else if(name==="temporary")length=1;
   else if(["r1","r2","r3","inverse","first","second","final"].includes(name))length=12;
   else if(["t1","t2","t3","integers","rounded"].includes(name))length=4;
   values[name]=Array(length).fill("0");
  }return values;
 }
 const all=oracle.rows.map(inputs);
 run("python3",["-c",`
import sys,json,decimal,importlib
sys.path[:0]=sys.argv[1:3]
f=importlib.import_module('bench.pari-class-group-port.lll_ranked_basis').pari_lll_ranked_basis
names,float_names,inputs,expected=json.load(sys.stdin)
for index,(raw,row) in enumerate(zip(inputs,expected)):
 values={k:[float(v) if k in float_names else int(v) for v in x] if isinstance(x,list) else int(x) for k,x in raw.items()}
 status=f(*(values[k] for k in names));assert status==0,(index,status,values['stages'])
 n=row['degree'];want=list(map(int,row['transform']));got=values['transform'];original=values['original']
 assert got==[want[i*n+j] for j in range(n) for i in range(n)],index
 assert values['basis']==[sum(original[i*n+k]*got[j*n+k] for k in range(n)) for j in range(n) for i in range(n)],index
 assert values['stages']==[row['stages'][4],row['returns'][0],row['returns'][2],0],index
 assert values['selection'][0]==row['qr_status'] and values['selection'][1]==0,index
raw=inputs[0]
values={k:[float(v) if k in float_names else int(v) for v in x] if isinstance(x,list) else int(x) for k,x in raw.items()}
values['rank']=values['n']-1
assert f(*(values[k] for k in names))==1
assert values['stages']==[0,-999,-999,-999] and not any(values['basis'])
values['rank']=values['n'];n=values['n']
values['original']=[int(i==j) for i in range(n) for j in range(n)]
values['original'][0]=1<<23280
assert f(*(values[k] for k in names))==2
assert values['stages']==[1,-999,-999,-999]
`,path.resolve(__dirname,"../.."),path.resolve(__dirname,"../../src/lib")],{input:JSON.stringify([names,[...floatNames],all,oracle.rows])});
 const built=await compileKernel({sourcePath}),f=require(built.modulePath).pari_lll_ranked_basis;assert.equal(f.nativeAvailable,true);
 for(let index=0;index<all.length;index++)for(const backend of ["javascript","gmp"]){
  const values={};for(const[k,x]of Object.entries(all[index]))values[k]=Array.isArray(x)?x.map(floatNames.has(k)?Number:BigInt):BigInt(x);
  const pack=x=>backend==="gmp"?f.packIntegerBuffer(x,64):x;
  for(const k of names)if(Array.isArray(values[k])&&!floatNames.has(k))values[k]=pack(values[k]);
  assert.equal(f[backend](...names.map(k=>values[k])),0n,`${index} ${backend} status`);
  if(backend==="gmp")for(const k of names)if(Array.isArray(all[index][k])&&!floatNames.has(k))values[k]=values[k].toArray();
  const row=oracle.rows[index],n=row.degree,want=row.transform.map(BigInt),original=row.input.map(BigInt),got=values.transform;
  assert.deepEqual(got,Array.from({length:n*n},(_,p)=>want[(p%n)*n+Math.floor(p/n)]),`${index} ${backend} transform`);
  const basis=Array.from({length:n*n},(_,p)=>{const j=Math.floor(p/n),i=p%n;let x=0n;for(let k=0;k<n;k++)x+=original[i*n+k]*got[j*n+k];return x;});
  assert.deepEqual(values.basis,basis,`${index} ${backend} basis`);
  assert.deepEqual(values.stages,[row.stages[4],row.returns[0],row.returns[2],0].map(BigInt),`${index} ${backend} stages`);
  assert.equal(values.selection[0],BigInt(row.qr_status));assert.equal(values.selection[1],0n);
 }
 for(const backend of ["javascript","gmp"]){
  for(const boundary of ["rank","precision"]){
   const values={};for(const[k,x]of Object.entries(all[0]))values[k]=Array.isArray(x)?x.map(floatNames.has(k)?Number:BigInt):BigInt(x);
   if(boundary==="rank")values.rank--;
   else{const n=Number(values.n);values.original=Array.from({length:n*n},(_,i)=>BigInt(i%n===Math.floor(i/n)));values.original[0]=1n<<23280n;}
   for(const k of names)if(Array.isArray(values[k])&&!floatNames.has(k)&&backend==="gmp")values[k]=f.packIntegerBuffer(values[k],1024);
   assert.equal(f[backend](...names.map(k=>values[k])),boundary==="rank"?1n:2n,`${backend} ${boundary} unresolved`);
   const stages=backend==="gmp"?values.stages.toArray():values.stages;
   assert.deepEqual(stages,[boundary==="rank"?0n:1n,-999n,-999n,-999n]);
  }
 }
 assert.doesNotMatch(fs.readFileSync(built.coreSourcePath,"utf8"),/napi_call_function|PyObject_Call/);
 console.log("32 connected ranked LLL paths match normal PARI transforms and FLATTER/fast/DPE stages in CPython/JS/GMP; rank and precision fallbacks remain explicit dependencies");
 console.log(JSON.stringify({modulePath:built.modulePath,qualifiedTiming:false}));
})().catch(error=>{console.error(error);process.exitCode=1;});
