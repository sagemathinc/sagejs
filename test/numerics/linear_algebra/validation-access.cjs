// sagejs-test-tier: integration
// sagejs-test-portable: true
"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),os=require("node:os");
const {spawnSync}=require("node:child_process");
const {pythonPrefix}=require("../../../bench/numerics/performance/run.cjs");
const root=path.resolve(__dirname,"../../..");
test("independent product storage snapshots preserve sums and cancellation",()=>{
  const source=fs.readFileSync(path.join(__dirname,"validation-access.py"),"utf8");
  const oracle=spawnSync(process.env.PYTHON || (process.platform==="win32"?"python":"python3"),["-I","-c",pythonPrefix(root)+source],{encoding:"utf8",timeout:120000});
  if(oracle.error)throw oracle.error;
  assert.equal(oracle.status,0,oracle.stderr || oracle.stdout);
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),"sagejs-validation-access-"));
  try {
    const filename=path.join(directory,"case.py");fs.writeFileSync(filename,source);
    const result=spawnSync(process.execPath,["--require",path.join(root,"test/helpers/assert-no-exact-numerical-load.cjs"),path.join(root,"bin/sagejs"),"--python",filename],{encoding:"utf8",timeout:120000,env:{...process.env,SAGEJSPATH:path.join(root,"src/lib"),SAGEJS_NATIVE_DISABLE:"1"}});
    if(result.error)throw result.error;
    assert.equal(result.status,0,result.stderr || result.stdout);
    assert.equal(result.stdout.trim(),oracle.stdout.trim());
    assert.match(result.stdout,/validation access passed/);
  } finally {fs.rmSync(directory,{recursive:true,force:true});}
});
