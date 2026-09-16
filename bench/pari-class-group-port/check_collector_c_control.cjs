"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const {source}=require('./collector_c_control.cjs');
const pari=path.resolve(process.argv[2]),archive=path.resolve(process.argv[3]);
const unreduced=process.argv.includes('--unreduced');
function run(command,args,options={}) {
 const r=spawnSync(command,args,{encoding:'utf8',timeout:60000,maxBuffer:8*1024*1024,...options});
 assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;
}
const pristine=run('tar',['-xOf',archive,'pari-2.17.4/src/basemath/buch2.c']);
assert.throws(()=>source(pristine+'\n'),/pristine/);
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-collector-control-'));
const c=path.join(dir,'control.c'),exe=path.join(dir,'control'),lib=path.join(pari,'Olinux-x86_64');
fs.writeFileSync(c,source(pristine,{unreduced}));
run('cc',['-O2','-I'+path.join(pari,'src/headers'),'-I'+lib,c,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',exe]);
const fixture=JSON.parse(run(process.execPath,[path.join(__dirname,'check_compiled_ideal_collector.cjs'),pari,'--export-fixtures',...(unreduced?['--unreduced']:[])]));
assert.equal(fixture.schema,unreduced?'pari-unreduced-ideal-collector-v1':'pari-prepared-ideal-collector-v1');
for(const repetitions of [1,2]) {
 const rows=run(exe,[String(repetitions)]).trim().split('\n').map(JSON.parse);
 assert.equal(rows.length,16);
 for(const r of rows) {
  const {index,repetitions:count,seconds,...result}=r;
  assert.equal(count,repetitions);assert(seconds>=0&&Number.isFinite(seconds));
  assert.deepEqual(result,fixture.cases[index].expected,`control case ${index}`);
 }
}
console.log('Pristine '+(unreduced?'unreduced':'prepared')+' C control matches all 16 diagnostic collector states with fresh repeated calls; timing qualification remains pending');
