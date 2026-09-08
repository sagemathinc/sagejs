// sagejs-test-tier: integration
"use strict";
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const path = require('node:path');
const test = require('node:test');
const {retryable} = require('../bench/class-unit-groups/diagnose-cubic-staged-survey.cjs');

test('staged discovery retry decisions agree with the production Python policy', () => {
  const result = spawnSync(process.execPath, ['bin/sagejs','--python'], {
    cwd: path.resolve(__dirname,'..'), encoding:'utf8', timeout:120000,
    env:{...process.env,SAGEJS_NATIVE_DISABLE:'1'},
    input: `
import json
from sagejs.number_fields.cubic_class_number_native_runtime import _retryable_native_decline
records = []
for length in [63, 64, 65]:
    for phase in range(66):
        for code in [0, 437, 438, 999]:
            values = [0] * length
            values[59] = code
            if length > 63:
                values[63] = phase
            records.append([length, phase, code, _retryable_native_decline(values)])
print("RETRY_POLICY=" + json.dumps(records))
`,
  });
  assert.equal(result.status,0,result.stdout+result.stderr);
  const prefix='RETRY_POLICY=';
  const data=JSON.parse(result.stdout.split('\n').find(x=>x.startsWith(prefix)).slice(prefix.length));
  assert.equal(data.length,792);
  for(const [length,phase,code,expected] of data) {
    const values=Array(length).fill('0'); values[59]=String(code);
    if(length>63)values[63]=String(phase);
    assert.equal(retryable(values),expected,JSON.stringify({length,phase,code}));
  }
});
