// sagejs-test-tier: unit
"use strict";
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),test=require('node:test');
const {spawnSync}=require('node:child_process');
const {pythonExecutable}=require('../tools/python-executable.cjs');
const {searchWorkspaceSource}=require('../bench/class-unit-groups/diagnose-cubic-search-workspace-build.cjs');
const {resumableSource}=require('../bench/class-unit-groups/diagnose-cubic-resumable-expansion-build.cjs');
const {torsionProbeSource}=require('../bench/class-unit-groups/diagnose-cubic-torsion-probe-build.cjs');
const {shareRecoverySource}=require('../bench/class-unit-groups/diagnose-cubic-recovery-sharing-build.cjs');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
test('search bundles preserve the whole mathematical AST and exact owner bindings',()=>{
  const original=require('./fixtures/cubic-source-baseline.cjs').cubicSourceBaseline();
  const before=shareRecoverySource(torsionProbeSource(resumableSource(original,read('bench/class-unit-groups/cubic-expanded-shell-experiment.py'),read('bench/class-unit-groups/cubic-expanded-prefix-experiment.py'))));
  const after=searchWorkspaceSource(before);
  assert(Buffer.byteLength(after)<Buffer.byteLength(before));
  assert.throws(()=>searchWorkspaceSource(after));
  assert.throws(()=>searchWorkspaceSource(before.replace('adjacent_ellipsoid_parameters, expanded_parameters,','expanded_parameters, expanded_parameters,')));
  assert.throws(()=>searchWorkspaceSource(before.replace('def _cubic_collect_expanded_shell_prefix(', 'def _changed_expanded_shell_prefix(')));
  const result=spawnSync(pythonExecutable(),[path.join(__dirname,'fixtures/cubic-search-workspace-equivalence.py')],{input:JSON.stringify({before,after}),encoding:'utf8',maxBuffer:4000000,timeout:30000});
  assert.equal(result.status,0,result.stdout+'\n'+result.stderr);
});
