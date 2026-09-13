// sagejs-test-tier: integration
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const {spawnSync} = require("node:child_process");
const test = require("node:test");
const root = path.resolve(__dirname, "../../..");
const filename = path.join(__dirname, "json-leaves.py");
function run(command, args) {
  const result = spawnSync(command, args, {cwd:root, encoding:"utf8", timeout:120000,
    env:{...process.env,SAGEJS_NATIVE_DISABLE:"1"}});
  if(result.error) throw result.error;
  assert.equal(result.status,0,result.stderr||result.stdout);
  assert.equal(result.stdout.trim(),"JSON leaves passed");
}
test("numerical JSON finite leaves preserve CPython validation and ownership",()=>{
  run(process.env.PYTHON||(process.platform==="win32"?"python":"python3"),["-I","-c",
    "import sys, collections.abc, math, json, hashlib, typing\n"+
    `sys.path.insert(0,${JSON.stringify(path.join(root,"src/lib"))})\n`+
    fs.readFileSync(filename,"utf8")]);
});
test("numerical JSON finite leaves preserve public dynamic Python semantics",()=>{
  run(process.execPath,[path.join(root,"bin/sagejs"),"--python",filename]);
});
