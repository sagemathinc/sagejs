// sagejs-test-tier: integration
"use strict";
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const test = require('node:test');
const {pythonExecutable} = require('../tools/python-executable.cjs');
const {createSage} = require('../dist/tools/kernel.js');

const source = `import traceback
def cases():
    inner = ValueError('inner')
    middle = TypeError('middle')
    outer = RuntimeError('outer')
    for error in (inner, middle, outer):
        error.__traceback__ = None
    result = []
    middle.__context__ = inner
    outer.__cause__ = middle
    result.append(''.join(traceback.format_exception(outer)))
    result.append(''.join(traceback.format_exception(outer, chain=False)))
    result.append(''.join(traceback.format_exception(RuntimeError, outer, None)))
    outer.__cause__ = None
    outer.__context__ = middle
    outer.__suppress_context__ = True
    result.append(''.join(traceback.format_exception(outer)))
    outer.__suppress_context__ = False
    result.append(''.join(traceback.format_exception(outer)))
    inner.__context__ = outer
    result.append(''.join(traceback.format_exception(outer)))
    outer.__cause__ = outer
    result.append(''.join(traceback.format_exception(outer)))
    return result
`;
const oracle = spawnSync(pythonExecutable(), ['-c', source + '\nimport json\nprint(json.dumps(cases()))'],
  {encoding:'utf8', timeout:30000});
assert.equal(oracle.status, 0, oracle.stderr);
const expected = JSON.parse(oracle.stdout);

for (const mode of ['python', 'sage']) test(`${mode}: traceback formatting honors chaining and cycles`, async t => {
  const session = await createSage({mode});
  t.after(() => session.close());
  const result = await session.evaluate(source + `\nassert cases() == ${JSON.stringify(expected)}\nprint('chains-ok')`);
  assert.equal(result.stderr ?? '', '');
  assert.equal(result.stdout, 'chains-ok\n');
});
