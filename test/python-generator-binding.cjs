// sagejs-test-tier: integration
"use strict";
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const {spawnSync}=require('node:child_process');
const test=require('node:test');
const {createSage}=require('../dist/tools/kernel.js');
const {pythonExecutable}=require('../tools/python-executable.cjs');
const fixture=readFileSync(join(__dirname,'fixtures/python-generator-binding.py'),'utf8');
const cases=[...fixture.matchAll(/^def (test_\w+)\(/gm)].map(match=>match[1]);
for(const name of cases) test(`generator binding agrees with CPython: ${name}`,async()=>{
  const source=fixture+`\n${name}()\nprint('ok')\n`;
  const oracle=spawnSync(pythonExecutable(),['-c',source],{encoding:'utf8',timeout:30000});
  assert.equal(oracle.status,0,oracle.stderr);
  assert.equal(oracle.stderr,'');
  for(const mode of ['python','sage']) {
    const session=await createSage({mode});
    try {
      const result=await session.evaluate(source);
      assert.equal(result.stdout,oracle.stdout,mode);
      assert.equal(result.stderr ?? '','');
    } finally {await session.close();}
  }
});
