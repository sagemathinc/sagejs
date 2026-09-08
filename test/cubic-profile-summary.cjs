"use strict";
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const {spawnSync} = require('node:child_process');
const test = require('node:test');

test('profile attribution separates overlapping stacks and unanchored GC', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cubic-profile-summary-'));
  try {
    const profile = path.join(directory, 'fixture.cpuprofile');
    const node = (id, functionName, children = []) => ({id, callFrame: {functionName}, children});
    fs.writeFileSync(profile, JSON.stringify({
      nodes: [node(1, '(root)', [2, 5, 6]), node(2, 'target', [3, 4]),
        node(3, 'work'), node(4, 'other'), node(5, '(garbage collector)'), node(6, 'outside')],
      samples: [3, 5, 4, 6], timeDeltas: [2, 3, 5, 7],
    }));
    const script = path.resolve(__dirname, '../bench/class-unit-groups/summarize-construction-profile.cjs');
    const result = spawnSync(process.execPath, [script, profile, 'target'], {encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr);
    const data = JSON.parse(result.stdout);
    assert.equal(data.attributedMicroseconds, 7);
    assert.equal(data.windowMicroseconds, 10);
    assert.equal(data.windowGcMicroseconds, 3);
    assert.equal(data.inclusive.find(x => x.name === 'target').microseconds, 7);
    assert.equal(data.exclusive.reduce((s, x) => s + x.microseconds, 0), 7);
    assert.ok(!data.inclusive.some(x => x.name === '(garbage collector)' || x.name === 'outside'));
    const missing = spawnSync(process.execPath, [script, profile, 'absent'], {encoding: 'utf8'});
    assert.notEqual(missing.status, 0);
  } finally {
    fs.rmSync(directory, {recursive: true, force: true});
  }
});
