"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const {spawnSync} = require("node:child_process");
const {compileKernel} = require("../../tools/native-kernel/compiler.cjs");
function run(command, args, options = {}) {
  const result = spawnSync(command, args, {encoding: "utf8", timeout: 60000, maxBuffer: 4*1024*1024, ...options});
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout;
}
(async () => {
  const bits = new DataView(new ArrayBuffer(8));
  const values = [-Infinity, -Number.MAX_VALUE, -2, -1, -0, 0, Number.MIN_VALUE,
    2**-1022, 0.5, 1-Number.EPSILON/2, 1, 2-Number.EPSILON, Number.MAX_VALUE, Infinity, NaN];
  for (let exponent=-1074; exponent<=1023; exponent++) values.push(2**exponent);
  let seed = 0x4d595df4d0f33173n;
  for (let i=0; i<512; i++) {
    seed = BigInt.asUintN(64, seed*6364136223846793005n+1442695040888963407n);
    bits.setBigUint64(0, seed, false); values.push(bits.getFloat64(0, false));
  }
  // Every exponent is inside C int, as at the upstream call boundary.
  const shifts = [-2147483648, -2098, -1075, -1074, -1023, -1, 0, 1, 1023, 1074, 2098, 2147483647];
  const pairs = values.slice(0,15).flatMap(x => shifts.map(e => [x,e]));
  for (let i=15; i<values.length; i++) pairs.push([values[i], (i*37)%4197-2098]);
  for (let multiplier=1; multiplier<=255; multiplier+=2) for (const sign of [-1,1])
    for (const shift of [-2,-1,1,1074]) pairs.push([sign*multiplier*Number.MIN_VALUE,shift]);
  assert.equal(pairs.length, 3814);
  const encoded = pairs.map(([x,e]) => {bits.setFloat64(0,x,false); return [String(bits.getBigUint64(0,false)),e];});
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),"sagejs-pari-scale-"));
  const source=path.join(directory,"oracle.c"), executable=path.join(directory,"oracle");
  fs.writeFileSync(source, `#include <math.h>
#include <stdint.h>
#include <inttypes.h>
#include <stdio.h>
#include <string.h>
int main(void) {
  uint64_t bits; int exponent;
  while (scanf("%" SCNu64 " %d", &bits, &exponent)==2) {
    double x; memcpy(&x,&bits,sizeof(x)); x=ldexp(x,exponent);
    memcpy(&bits,&x,sizeof(bits)); printf("%" PRIu64 "\\n",bits);
  }
  return 0;
}
`);
  run("cc",["-O2",source,"-lm","-o",executable]);
  const expected=run(executable,[],{input:encoded.map(row=>row.join(" ")).join("\n")+"\n"}).trim().split("\n");
  assert.equal(expected.length,pairs.length);
  run("python3",["-c",`
import sys,json,struct,importlib,math
sys.path[:0]=sys.argv[1:3]
scale=importlib.import_module('bench.pari-class-group-port.lll_float_preparation').pari_lll_scale
def decode(bits):return struct.unpack('>d',struct.pack('>Q',int(bits)))[0]
for (bits,shift),wanted in json.load(sys.stdin):
    got=scale(decode(bits),shift); want=decode(wanted)
    assert (math.isnan(got) and math.isnan(want)) or struct.pack('>d',got)==struct.pack('>d',want),(bits,shift,wanted,got)
`,path.resolve(__dirname,"../.."),path.resolve(__dirname,"../../src/lib")],{input:JSON.stringify(encoded.map((row,i)=>[row,expected[i]]))});
  const built=await compileKernel({sourcePath:path.join(__dirname,"lll_float_preparation.py")});
  const scale=require(built.modulePath).pari_lll_scale;
  assert.equal(scale.nativeAvailable,true);
  for (let i=0;i<pairs.length;i++) for (const backend of ["javascript","gmp"]) {
    const [x,e]=pairs[i], got=scale[backend](x,BigInt(e));
    bits.setBigUint64(0,BigInt(expected[i]),false);const want=bits.getFloat64(0,false);
    assert(Number.isNaN(want)?Number.isNaN(got):Object.is(got,want),`${i} ${backend}: ${got} != ${want}`);
  }
  console.log("3814 Babai C ldexp policy cases match CPython/JS/GMP, including overflow, subnormal rounding and signed zero");
})().catch(error=>{console.error(error);process.exitCode=1;});
