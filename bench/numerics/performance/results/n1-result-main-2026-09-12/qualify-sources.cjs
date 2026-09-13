const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const python = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
const cases = [
  ['trace', 'db7c806b072b6f1d181f92532b75f1d395428a42', 'trace-source-db7c806b.tar.gz',
    '186c7b430e18628927d3c90bc3f49f1668eefa822241423a2a88acf1b7043824', 'trace-accounting.py', 'trace accounting passed'],
  ['result', 'b0c532cfb9b0295ae444b536027231c403214bea', 'result-source-b0c532cfb.tar.gz',
    'b978b3ff6e7b9685402f0ce58afe16555262d03a5376b1ea7fb9b0af085d674b', 'result-bookkeeping.py', 'result bookkeeping passed'],
];
const report = {
  schema: 'sagejs.numerics.n1-source-portability/v1',
  classification: 'source-only-portability',
  scope: 'CPython ordinary source only; not generated Sage.js, native, Wasm, npm/SEA, or performance qualification',
  collected_at: new Date().toISOString(),
  platform: process.platform, architecture: process.arch,
  python: execFileSync(python, ['--version'], {encoding: 'utf8', timeout: 10000}).trim(),
  runner_sha256: crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),
  complete: false, records: [],
};
for (const [name, commit, archive, hash, test, expected] of cases) {
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex'), hash);
  const root = path.resolve(name);
  fs.mkdirSync(root); // Refuse to overlay an earlier qualification.
  execFileSync('tar', ['-xzf', archive, '-C', root], {timeout: 60000});
  const prefix = 'import collections.abc, hashlib, json, math, sys, time, typing\n' +
    `sys.path.insert(0, ${JSON.stringify(path.join(root, 'src/lib'))})\n`;
  const source = fs.readFileSync(path.join(root, 'test/numerics/performance', test), 'utf8');
  const stdout = execFileSync(python, ['-I', '-c', prefix + source], {
    encoding: 'utf8', timeout: 60000, maxBuffer: 1024 * 1024,
    env: {...process.env, SAGEJS_NATIVE_DISABLE: '1'},
  }).trim();
  assert.equal(stdout, expected);
  report.records.push({name, commit, archive_sha256: hash, test, test_sha256:
    crypto.createHash('sha256').update(source).digest('hex'), stdout, passed: true});
  fs.writeFileSync('source-receipt.json', JSON.stringify(report, null, 2) + '\n');
}
report.complete = true;
fs.writeFileSync('source-receipt.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
