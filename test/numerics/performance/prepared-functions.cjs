// sagejs-test-tier: native
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawnSync } = require("node:child_process");
const { pythonPrefix } = require("../../../bench/numerics/performance/run.cjs");
const { compileKernel } = require("../../../tools/native-kernel/compiler.cjs");
const { removeLoadedNativeCache } = require("../../helpers/native-cache-cleanup.cjs");
const root = path.resolve(__dirname,"../../..");
const source = fs.readFileSync(path.join(__dirname,"prepared-functions.py"),"utf8");
function run(command,args,env={}) {
  const result=spawnSync(command,args,{cwd:root,env:{...process.env,...env},encoding:"utf8",timeout:120000,maxBuffer:1024*1024});
  assert.equal(result.status,0,result.stderr+result.stdout);
  assert.match(result.stdout,/prepared functions passed/);
}
test("prepared function contracts and finite-intermediate policy under CPython",()=>{
  run(process.env.PYTHON || (process.platform==="win32"?"python":"python3"),["-I","-c","import copy\n"+pythonPrefix(root)+'\nEXPECTED_TARGET="dynamic"\n'+source]);
});
test("prepared functions use real source-native, dynamic and missing/stale fallback routes",async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),"sagejs-public-evaluator-"));
  try {
    const cache=path.join(directory,"cache");
    await compileKernel({sourcePath:path.join(root,"src/lib/sagejs/numerics/_evaluation_core.py"),cacheRoot:cache});
    const stale=path.join(directory,"stale");fs.mkdirSync(stale);
    const index=JSON.parse(fs.readFileSync(path.join(cache,"index.json"),"utf8"));
    for(const value of Object.values(index.sources)) value.sourceHash="0".repeat(64);
    fs.writeFileSync(path.join(stale,"index.json"),JSON.stringify(index));
    for(const [mode,target,selected] of [["dynamic","dynamic",cache],["native","native",cache],["missing","dynamic",path.join(directory,"absent")],["stale","dynamic",stale]]) {
      const filename=path.join(directory,mode+".py");
      fs.writeFileSync(filename,`EXPECTED_TARGET=${JSON.stringify(target)}\n`+source);
      run(process.execPath,["--require",path.join(root,"test/helpers/assert-no-exact-numerical-load.cjs"),path.join(root,"bin/sagejs"),"--python",filename],{
        SAGEJSPATH:path.join(root,"src/lib"),SAGEJS_NATIVE_CACHE_DIR:selected,
        SAGEJS_NATIVE_DISABLE:mode==="dynamic"?"1":"0",SAGEJS_NATIVE_MODE:"auto",SAGEJS_NATIVE_REQUIRED:"0",
      });
    }
  } finally {removeLoadedNativeCache(directory);}
});
