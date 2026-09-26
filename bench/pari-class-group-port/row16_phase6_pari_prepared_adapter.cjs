"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const ARCHIVE_SHA256 = "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53";
const BUCH2_SHA256 = "904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac";
const LIBRARY_SHA256 = "fdc8f2d7ff050c8e8c6cb8994b0f9dc971267ac763eaf5cd927454937d37357f";
const SOURCE = path.join(__dirname, "row16_phase6_pari_prepared_adapter.c");
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const fileSha = filename => sha(fs.readFileSync(filename));
let cached;

function buildHelper() {
  if (cached) return cached;
  const root = path.resolve(process.env.SAGEJS_PARI_ROOT || "/home/user/upstream/pari-2.17.4");
  const archive = path.resolve(process.env.SAGEJS_PARI_ARCHIVE || "/home/user/upstream/pari-2.17.4.tar.gz");
  const object = path.join(root,"Olinux-x86_64"), library=fs.realpathSync(path.join(object,"libpari.so"));
  assert.equal(fileSha(archive),ARCHIVE_SHA256); assert.equal(fileSha(path.join(root,"src/basemath/buch2.c")),BUCH2_SHA256);
  assert.equal(fileSha(library),LIBRARY_SHA256);
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),"sagejs-row16-pari-"));
  const executable=path.join(directory,"adapter");
  const args=["-O3","-Wall","-Wextra","-fno-strict-aliasing","-DNDEBUG",`-I${path.join(root,"src/headers")}`,`-I${object}`,SOURCE,`-L${object}`,`-Wl,-rpath,${object}`,"-lpari","-lm","-o",executable];
  const built=spawnSync(process.env.CC||"cc",args,{encoding:"utf8",timeout:120000});
  assert.equal(built.status,0,built.stderr||String(built.error));
  cached={executable,provenance:{archiveSha256:ARCHIVE_SHA256,buch2Sha256:BUCH2_SHA256,librarySha256:LIBRARY_SHA256,sourceSha256:fileSha(SOURCE),executableSha256:fileSha(executable)}};
  return cached;
}
function validateProjection(p) {
  assert.equal(p.schema,"sagejs.pari-class-group/row16-flag-zero-matched-projection-v1");
  assert.deepEqual(p.field,{id:"3.1.1002718428660.2",polynomialAscending:["-73393658","-146523","0","1"]});
  assert.equal(p.classGroup.classNumber,"27");
  assert.deepEqual([...p.classGroup.invariantFactorsSourceOrder].reverse(),["3","3","3"]);
  assert.equal(p.classGroup.generatorCount,"3");
  assert.deepEqual(p.unitGroup,{rank:"1",regulatorPresent:true,torsionOrder:"2",flagZeroStatus:"not_given(LARGE)"});
  assert.equal(p.terminalStatus,"pari-flag-zero-complete"); return p;
}
function commonProjection(sample) {
  const p=validateProjection(sample.projection);
  return {schema:p.schema,field:p.field,classGroup:{classNumber:p.classGroup.classNumber,
    invariantFactors:[...p.classGroup.invariantFactorsSourceOrder].reverse(),
    generatorCount:p.classGroup.generatorCount},unitGroup:p.unitGroup,
    terminalStatus:p.terminalStatus};
}
class Client {
  constructor(build=buildHelper()) { this.build=build; this.lines=[]; this.wait=[]; this.buffer=""; this.stderr="";
    this.child=spawn(build.executable,[],{stdio:["pipe","pipe","pipe"],env:{PATH:process.env.PATH,LANG:"C",LC_ALL:"C"}});
    this.child.stdout.setEncoding("utf8"); this.child.stderr.setEncoding("utf8");
    this.child.stderr.on("data",x=>this.stderr+=x); this.child.stdout.on("data",x=>{this.buffer+=x;for(;;){let i=this.buffer.indexOf("\n");if(i<0)break;let line=this.buffer.slice(0,i);this.buffer=this.buffer.slice(i+1);let w=this.wait.shift();w?w.resolve(line):this.lines.push(line);}});
    this.exit=new Promise(resolve=>this.child.once("exit",(code,signal)=>{while(this.wait.length)this.wait.shift().reject(new Error(this.stderr));resolve({code,signal});})); }
  next(){if(this.lines.length)return Promise.resolve(this.lines.shift());return new Promise((resolve,reject)=>this.wait.push({resolve,reject}));}
  async ready(){let line=await this.next();assert(line.startsWith("READY "));let r=JSON.parse(line.slice(6));assert.deepEqual(r.pariVersion,["2","17","4"]);return r;}
  async run(seed="1"){assert.match(seed,/^(0|[1-9][0-9]*)$/);this.child.stdin.write(`RUN ${seed}\n`);let r=JSON.parse(await this.next());assert.equal(r.schema,"sagejs.pari-class-group/row16-pari-prepared-sample-v1");assert(BigInt(r.kernelNanoseconds)>0n);validateProjection(r.projection);return r;}
  async close(){this.child.stdin.end("CLOSE\n");let r=await this.exit;assert.equal(r.signal,null);assert.equal(r.code,0,this.stderr);}
}
module.exports={ARCHIVE_SHA256,BUCH2_SHA256,LIBRARY_SHA256,Client,buildHelper,
  commonProjection,validateProjection};
