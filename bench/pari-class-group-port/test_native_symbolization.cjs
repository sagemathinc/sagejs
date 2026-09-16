"use strict";
const assert=require("node:assert/strict");
const s=require("./symbolize_native_samples.cjs");
const maps="700000-701000 r-xp 00001000 00:00 1 /tmp/a file.so\n";
const map=s.mappings(maps)[0];
const segments=s.loads(" LOAD 0x001000 0x401000 0x401000 0x000100 0x001000 R E 0x1000");
assert.equal(s.virtualAddress(0x700005n,map,segments,4096n),0x401005n);
const symbols=s.symbols("0000000000401000 0000000000000010 t leaf\n0000000000401000 0000000000000000 T alias");
assert.equal(s.containing(0x401005n,symbols).name,"leaf");
assert.equal(s.containing(0x401010n,symbols),null);
assert.equal(s.virtualAddress(0x700005n,map,[],4096n),null);
const result=s.summarize({maps,runs:[{samples:["0x700005","0x700006","0x700010","0x800000"],dropped:2}]},
  file=>{assert.equal(file,"/tmp/a file.so");return {loads:segments,symbols};});
assert.equal(result.totalSamples,4);assert.equal(result.resolvedSamples,2);
assert.equal(result.functions[0].name,"leaf");assert.equal(result.functions[0].percentOfAllSamples,50);
assert.equal(result.runs[0].dropped,2);
assert.throws(()=>s.summarize({maps,binarySha256:{"/tmp/a file.so":"expected"},
  runs:[{samples:["0x700005"]}]},()=>({loads:segments,symbols,sha256:"replaced"})),/ELF identity mismatch/);
console.log("Offline ELF mapping, load-bias, aliases, gaps and unresolved sample checks pass");
