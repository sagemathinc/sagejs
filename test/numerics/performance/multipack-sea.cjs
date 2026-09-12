// sagejs-test-tier: specialized
"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const {spawnSync} = require("node:child_process");
const test = require("node:test");
test("relocated executable SEA isolates numerical native packs and rejects corruption",{timeout:360000},()=>{
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(),"sagejs-multipack-sea-"));
  try {
    const result = spawnSync(process.execPath,[path.join(__dirname,"multipack-worker.cjs"),temporary,"--sea"],
      {cwd:path.resolve(__dirname,"../../.."),encoding:"utf8",timeout:340000,maxBuffer:8*1024*1024});
    if (result.error) throw result.error;
    assert.equal(result.status,0,result.stderr||result.stdout);
    console.log(result.stdout);
  } finally {
    fs.rmSync(temporary,{recursive:true,force:true});
  }
});
