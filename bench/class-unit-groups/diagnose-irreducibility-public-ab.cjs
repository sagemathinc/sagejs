"use strict";
// Diagnostic override only. Never imported by production or used for promotion.
// Pin to one CPU. Usage: node THIS BUILT_ROOT OUTPUT_DIRECTORY [EXTRA_WARMUPS]
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const {spawnSync, execFileSync} = require('node:child_process');
const [root, directory] = process.argv.slice(2);
const extraWarmups = Number(process.argv[4] || '0');
assert.ok(Number.isInteger(extraWarmups) && extraWarmups >= 0 && extraWarmups <= 512);
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const source = path.join(root, 'src/lib/sagejs/number_fields/cubic_class_number_native.py');
const pack = path.join(root, 'dist/native-kernels/pack/sagejs_native_kernel_pack.node');
const script = path.join(directory, 'diagnose-irreducibility-public-ab.py');
const commit = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim();
const identity = {source: hash(source), pack: hash(pack), script: hash(script)};
const cache = fs.mkdtempSync('/tmp/cubic-irreducibility-ab-');
const samples = [];
for (let round = 0; round < 11; round++) {
  for (const mode of round % 2 ? ['metadata', 'reconstruction'] : ['reconstruction', 'metadata']) {
    const env = {
      PATH: process.env.PATH, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', TZ: 'UTC',
      OMP_NUM_THREADS: '1', OPENBLAS_NUM_THREADS: '1', MKL_NUM_THREADS: '1',
      BLIS_NUM_THREADS: '1', FLINT_NUM_THREADS: '1', NUMEXPR_NUM_THREADS: '1',
      XDG_CACHE_HOME: cache, SAGEJS_USE_SOURCE: '1', SAGEJS_NATIVE_MODE: 'auto',
      SAGEJS_NATIVE_AUTOLOAD: '1', SAGEJS_NATIVE_REQUIRED: '1',
      SAGEJS_NATIVE_INTEGER_BACKEND: 'auto', SAGEJS_MODULE_CACHE_AUTO_CLEANUP: '0',
      SAGEJS_NATIVE_CACHE_DIR: path.join(root, 'dist/native-kernels'),
      SAGEJS_DYNAMIC_CACHE_DIR: path.join(cache, 'dynamic'),
      SAGEJS_PRECOMPILED_DYNAMIC_CACHE_DIR: path.join(cache, 'precompiled-absent'),
      SAGEJS_SITE_PACKAGES: path.join(cache, 'site-absent'),
      SAGEJS_DIAGNOSTIC_IRREDUCIBILITY: mode,
      SAGEJS_DIAGNOSTIC_CLASS_WARMUPS: String(extraWarmups),
    };
    const result = spawnSync(process.execPath, [path.join(root, 'bin/sagejs'), '--python', script], {
      cwd: root, env, encoding: 'utf8', timeout: 300000, maxBuffer: 8e6,
    });
    fs.writeFileSync(path.join(directory, `ab-${round}-${mode}.stdout`), result.stdout || '');
    fs.writeFileSync(path.join(directory, `ab-${round}-${mode}.stderr`), result.stderr || '');
    assert.equal(result.status, 0, result.stderr);
    const line = result.stdout.split('\n').find(line => line.startsWith('IRREDUCIBILITY_AB='));
    assert.ok(line, result.stdout);
    for (const row of JSON.parse(line.slice('IRREDUCIBILITY_AB='.length))) {
      assert.equal(row.mode, mode);
      samples.push({round, ...row, ms: Number(row.root_ns) / row.iterations / 1e6});
    }
  }
  console.error('A/B round', round + 1);
}
assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim(), commit);
assert.deepEqual({source: hash(source), pack: hash(pack), script: hash(script)}, identity);
console.log(JSON.stringify({diagnostic: true, promotion: false, commit, identity, extraWarmups,
  node: process.version, host: os.hostname(), samples}, null, 2));
