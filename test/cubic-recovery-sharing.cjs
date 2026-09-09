// sagejs-test-tier: unit
"use strict";
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const test = require('node:test');
const {spawnSync} = require('node:child_process');
const {pythonExecutable} = require('../tools/python-executable.cjs');
const {shareRecoverySource} = require('../bench/class-unit-groups/diagnose-cubic-recovery-sharing-build.cjs');
const {torsionProbeSource} = require('../bench/class-unit-groups/diagnose-cubic-torsion-probe-build.cjs');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/lib/sagejs/number_fields/cubic_class_number_native.py'), 'utf8');
test('shared recovery preserves exact discovery, owner writes, and fatal statuses', () => {
  const shared = shareRecoverySource(source);
  assert(Buffer.byteLength(shared) < Buffer.byteLength(source));
  assert.throws(() => shareRecoverySource(shared));
  const result = spawnSync(pythonExecutable(), [path.join(__dirname, 'fixtures/cubic-recovery-sharing.py')], {
    input: JSON.stringify({
      original: source, shared,
      probe_shared: shareRecoverySource(torsionProbeSource(source)),
      torsion_helper: fs.readFileSync(path.join(root, 'bench/class-unit-groups/cubic-torsion-prefix.py'), 'utf8'),
      fault_fixture: path.join(__dirname, 'fixtures/cubic-recovery-status-faults.py'),
    }),
    encoding: 'utf8', timeout: 30000,
  });
  assert.equal(result.status, 0, result.stdout + '\n' + result.stderr);
});
