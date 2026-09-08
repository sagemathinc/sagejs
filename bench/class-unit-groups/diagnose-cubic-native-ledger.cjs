"use strict";
// Pin to one CPU. Usage: node THIS BUILT_ROOT OUTPUT_DIRECTORY
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const {spawnSync, execFileSync} = require('node:child_process');
const [root, directory] = process.argv.slice(2);
const preload = path.join(directory, 'profile-cubic-native-ledger.cjs');
const script = path.join(directory, 'instrumented-public-ab.py');
const originalScript = fs.readFileSync(path.join(directory, 'diagnose-irreducibility-public-ab.py'), 'utf8');
const begin = '    started = time.perf_counter_ns()';
const end = '    elapsed = time.perf_counter_ns() - started';
assert.equal(originalScript.split(begin).length, 2);
assert.equal(originalScript.split(end).length, 2);
// Keep the original two-boundary A/B loop, warmup, and replay order intact.
// Add only untimed phase markers; a separate helper loop changes JIT history.
fs.writeFileSync(script, originalScript
  .replace(begin, '    if boundary == "scalar-prepared":\n        print("SAGEJS_NATIVE_LEDGER_BEGIN")\n' + begin)
  .replace(end, end + '\n    if boundary == "scalar-prepared":\n        print("SAGEJS_NATIVE_LEDGER_END")'));
const cache = fs.mkdtempSync('/tmp/cubic-native-ledger-');
const commit = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim();
const samples = [];
for (let round = 0; round < 11; round++) {
  for (const mode of round % 2 ? ['metadata', 'reconstruction'] : ['reconstruction', 'metadata']) {
    const env = {PATH: process.env.PATH, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', TZ: 'UTC',
      OMP_NUM_THREADS: '1', OPENBLAS_NUM_THREADS: '1', MKL_NUM_THREADS: '1', BLIS_NUM_THREADS: '1',
      FLINT_NUM_THREADS: '1', NUMEXPR_NUM_THREADS: '1', XDG_CACHE_HOME: cache,
      SAGEJS_USE_SOURCE: '1', SAGEJS_NATIVE_MODE: 'auto', SAGEJS_NATIVE_AUTOLOAD: '1',
      SAGEJS_NATIVE_REQUIRED: '1', SAGEJS_NATIVE_INTEGER_BACKEND: 'auto',
      SAGEJS_MODULE_CACHE_AUTO_CLEANUP: '0', SAGEJS_NATIVE_CACHE_DIR: path.join(root, 'dist/native-kernels'),
      SAGEJS_DYNAMIC_CACHE_DIR: path.join(cache, 'dynamic'),
      SAGEJS_PRECOMPILED_DYNAMIC_CACHE_DIR: path.join(cache, 'precompiled-absent'),
      SAGEJS_SITE_PACKAGES: path.join(cache, 'site-absent'),
      SAGEJS_DIAGNOSTIC_IRREDUCIBILITY: mode, SAGEJS_DIAGNOSTIC_CLASS_WARMUPS: '128'};
    const r = spawnSync(process.execPath, ['--require', preload, path.join(root, 'bin/sagejs'), '--python', script],
      {cwd: root, env, encoding: 'utf8', timeout: 300000, maxBuffer: 8e6});
    fs.writeFileSync(path.join(directory, `${round}-${mode}.stdout`), r.stdout || '');
    fs.writeFileSync(path.join(directory, `${round}-${mode}.stderr`), r.stderr || '');
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const parse = (text, prefix) => JSON.parse(text.split('\n').find(x => x.startsWith(prefix)).slice(prefix.length));
    const publicRows = parse(r.stdout, 'IRREDUCIBILITY_AB=');
    const publicRow = publicRows.find(row => row.boundary === 'scalar-prepared');
    const native = parse(r.stderr, 'NATIVE_LEDGER=');
    assert.equal(native.calls.length, publicRow.iterations);
    const rootNs = Number(publicRow.root_ns);
    const nativeNs = native.calls.reduce((s, x) => s + Number(x.ns), 0);
    assert.ok(rootNs >= nativeNs);
    samples.push({round, mode, public: publicRow, publicRows, native,
      root_ms: rootNs / publicRow.iterations / 1e6,
      native_ms: nativeNs / publicRow.iterations / 1e6,
      host_ms: (rootNs - nativeNs) / publicRow.iterations / 1e6});
  }
  console.error('native ledger round', round + 1);
}
assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim(), commit);
console.log(JSON.stringify({instrumented: true, promotion: false,
  protocol: 'two-boundary-ab-with-128-extra-warmups', commit, samples}, null, 2));
