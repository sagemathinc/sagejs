"use strict";
const fs=require("node:fs"),path=require("node:path"),os=require("node:os"),assert=require("node:assert/strict");
const {spawnSync}=require("node:child_process"),{createHash}=require("node:crypto");
const {pythonPrefix}=require("./run.cjs");
const root=path.resolve(__dirname,"../../..");
const output=process.argv[2];
if(!output||process.argv.length!==3||fs.existsSync(output))throw Error("usage: permutation-validation.cjs NEW_RECEIPT.json");
const inputs=["bench/numerics/performance/permutation-validation.py","bench/numerics/performance/permutation-validation.cjs","src/lib/sagejs/numerics/linear_algebra/validation.py","src/lib/sagejs/numerics/linear_algebra/operations.py","src/lib/sagejs/numerics/linear_algebra/factorizations.py","src/lib/sagejs/numerics/linear_algebra/storage.py","dist/compiler/compiler.js","dist/compiler/baselib-plain-pretty.js"];
const snapshot=()=>inputs.map(file=>({path:file,sha256:createHash("sha256").update(fs.readFileSync(path.join(root,file))).digest("hex")}));
const before=snapshot(),records=[];
for(const [runtime,command,args] of [
  ["cpython",process.env.PYTHON||(process.platform==="win32"?"python":"python3"),["-I","-c",pythonPrefix(root)+fs.readFileSync(path.join(__dirname,"permutation-validation.py"),"utf8")]],
  ["sagejs",process.execPath,["--require",path.join(root,"test/helpers/assert-no-exact-numerical-load.cjs"),path.join(root,"bin/sagejs"),"--python",path.join(__dirname,"permutation-validation.py")]],
]) {
  const result=spawnSync(command,args,{cwd:root,encoding:"utf8",timeout:300000,maxBuffer:4*1024*1024,env:{...process.env,SAGEJSPATH:path.join(root,"src/lib"),SAGEJS_NATIVE_DISABLE:"1"}});
  if(result.error)throw result.error;
  assert.equal(result.status,0,result.stderr||result.stdout);
  records.push({runtime,cases:JSON.parse(result.stdout)});
}
assert.deepEqual(snapshot(),before,"measured inputs changed");
for(let i=0;i<records[0].cases.length;i++)assert.deepEqual(records[0].cases[i].observation,records[1].cases[i].observation);
const report={schema:"sagejs.coordinate-validation-development/v1",qualification:false,host:{platform:process.platform,arch:process.arch,node:process.version,cpu:os.cpus()[0]?.model},inputs:before,warmups:3,samples:7,order:"alternating paired blocks within each runtime",baseline:"2a7728109 independent-product body only; all other code identical",included:["public LU on preconstructed DenseMatrix","factorization","independent validation","result construction"],excluded:["input matrix construction","serialization","startup","peak memory","browser/native/SEA qualification","matched SciPy comparison"],trace:"none",backend:"ordinary-python",records};
fs.writeFileSync(output,JSON.stringify(report,null,2)+"\n",{flag:"wx"});
console.log(JSON.stringify(records.map(r=>({runtime:r.runtime,cases:r.cases.map(c=>({n:c.n,medians_ms:Object.fromEntries(Object.entries(c.samples_ms).map(([k,v])=>[k,[...v].sort((a,b)=>a-b)[3]]))}))})),null,2));
