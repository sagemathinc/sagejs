// sagejs-test-tier: specialized
"use strict";
const fs=require("node:fs"),path=require("node:path"),os=require("node:os"),crypto=require("node:crypto"),{spawnSync}=require("node:child_process"),assert=require("node:assert/strict"),test=require("node:test");
test("sampling driver checks artifact hashes, results and bounded options",t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"cubic-profile-driver-"));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const base=path.join(dir,"fixture");fs.mkdirSync(path.join(base,"build/Release"),{recursive:true});
  // Deliberately fake kernel for driver-contract tests; never numerical evidence.
  const source="fixture",addon="fixture addon",moduleText=`let calls=0;
function k(output){output.value=8;output.calls=++calls;return true;}
k.createIntegerBuffer=()=>({value:0,toArray(){return [String(this.calls),String(this.value)];}});
k.createUInt64Buffer=()=>[];k.packIntegerBuffer=x=>x;
module.exports={nativeAvailable:true,certified_complex_cubic_class_group_v1:k};`;
  for(const [f,s]of [['source.py',source],['index.cjs',moduleText],['build/Release/sagejs_native_kernel.node',addon]])fs.writeFileSync(path.join(base,f),s);
  const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
  fs.writeFileSync(path.join(dir,'builds.json'),JSON.stringify({schema:'sagejs.diagnostic/portable-cubic-ablation-v1',records:[{name:'fixture',sourceSha256:hash(source),moduleSha256:hash(moduleText),addonSha256:hash(addon)}]}));
  const driver=path.resolve(__dirname,'../bench/class-unit-groups/profile-cubic-ablation.cjs');
  const run=(field={coefficients:[122,-7,-1,1],h:8},calls='3',seed='712367')=>spawnSync(process.execPath,[driver,dir,'fixture',JSON.stringify(field),calls,seed],{encoding:'utf8',timeout:10000});
  const good=run();assert.equal(good.status,0,good.stderr);const report=JSON.parse(good.stdout);
  assert.equal(report.timing,false);assert.equal(report.warmups,100);assert.equal(report.calls,3);assert.equal(report.output[0],'103');
  assert.notEqual(run({coefficients:[122,-7,-1,1],h:7}).status,0);
  assert.notEqual(run({coefficients:[1,2],h:8}).status,0);
  for(const c of ['0','-1','1.5','1000001','NaN'])assert.notEqual(run(undefined,c).status,0);
  for(const s of ['-1','4294967296','NaN'])assert.notEqual(run(undefined,'1',s).status,0);
  for(const f of ['source.py','index.cjs','build/Release/sagejs_native_kernel.node']){
    const old=fs.readFileSync(path.join(base,f));fs.appendFileSync(path.join(base,f),'changed');assert.notEqual(run().status,0);fs.writeFileSync(path.join(base,f),old);
  }
});
