"use strict";
// Isolated representation control, not an alternate mathematical implementation.
// The existing int64 writer already treats unused limbs as unspecified.
const fs=require("node:fs"),path=require("node:path"),os=require("node:os");
const {spawnSync}=require("node:child_process"),{createHash}=require("node:crypto");
const assert=require("node:assert/strict");
const m=JSON.parse(fs.readFileSync(process.argv[2])),cpu=Number(process.argv[3]);
assert(Number.isInteger(cpu)&&cpu>=0);
const hash=p=>createHash("sha256").update(fs.readFileSync(p)).digest("hex");
assert.equal(hash(m.core),m.hashes.core);assert.equal(hash(m.exe),m.hashes.exe);
assert.equal(hash(m.inputPath),m.hashes.input);assert.equal(hash(m.fixturePath),m.hashes.fixture);
const fixture=JSON.parse(fs.readFileSync(m.fixturePath));
const source=fs.readFileSync(m.core,"utf8");
const begin=source.indexOf("static int sagejs_integer_buffer_set_mpz("),end=source.indexOf("static int sagejs_integer_buffer_get_int64(",begin);
assert(begin>0&&end>begin);
const block=source.slice(begin,end),clear="    memset(slot, 0, buffer->word_capacity * sizeof(*slot));\n";
assert.equal(block.split(clear).length,2);
const dir=fs.mkdtempSync(path.join(os.tmpdir(),"sagejs-buffer-clear-"));
const core=path.join(dir,"kernel_core.c"),exe=path.join(dir,"driver");
fs.writeFileSync(core,source.slice(0,begin)+block.replace(clear,"")+source.slice(end));
const prefix=process.env.SAGEJS_FLINT_PREFIX;assert(prefix);
const driver=path.join(path.dirname(m.exe),"driver.c");
function run(command,args,options={}){
 const r=spawnSync(command,args,{encoding:"utf8",timeout:120000,maxBuffer:4000000,...options});
 assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;
}
run("cc",["-O2","-ffp-contract=off","-I"+path.dirname(m.core),"-I"+path.join(prefix,"include"),driver,core,"-L"+path.join(prefix,"lib"),"-Wl,-rpath,"+path.join(prefix,"lib"),"-lgmp","-lm","-o",exe]);
const evidence={qualified:false,diagnostic:"Remove redundant GMP buffer-slot clearing only",cpu,
 repetitions:64,warmups:3,source:m.hashes.core,variant:hash(core),variantBinary:hash(exe),rows:[],
 limitations:["Generated representation control, not a compiler patch or complete regression test.","No exclusive host reservation."]};
for(let round=0;round<3;round++)for(const variant of round%2?[true,false]:[false,true]){
 const rows=run("prlimit",["--as=4294967296","--cpu=120","--","taskset","-c",String(cpu),variant?exe:m.exe,"64"],{input:fs.readFileSync(m.inputPath)}).trim().split("\n").map(JSON.parse);
 assert.equal(rows.length,fixture.cases.length);
 for(const [i,{index,seconds,...actual}]of rows.entries()){
  assert.equal(index,i);assert(Number.isFinite(seconds)&&seconds>=0);
  assert.deepEqual(actual,fixture.cases[i].expected);
 }
 const row={round,variant,seconds:rows.reduce((s,r)=>s+r.seconds,0)};
 evidence.rows.push(row);console.log(JSON.stringify(row));
 fs.writeFileSync(path.join(dir,"evidence.json"),JSON.stringify(evidence,null,2));
}
console.log(JSON.stringify({evidence:path.join(dir,"evidence.json")}));
