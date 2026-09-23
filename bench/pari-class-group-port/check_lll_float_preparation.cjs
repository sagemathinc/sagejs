"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const {spawnSync} = require("node:child_process");
const {createHash} = require("node:crypto");
const {compileKernel} = require("../../tools/native-kernel/compiler.cjs");
function run(command, args, options = {}) {
  const result = spawnSync(command, args, {encoding: "utf8", timeout: 60000, maxBuffer: 4 * 1024 * 1024, ...options});
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout;
}
(async () => {
  const pari = path.resolve(process.argv[2]), archive = path.resolve(process.argv[3]);
  const lib = path.join(pari, "Olinux-x86_64");
  let source = run("tar", ["-xOf", archive, "pari-2.17.4/src/basemath/lll.c"]);
  assert.equal(createHash("sha256").update(source).digest("hex"), "ba42f21e52b09873ba5bf2817edd8f0a8b69d4e0ff779419cc5390941aa7404b");
  const values = new Set(["0"]);
  for (const bits of [1, 2, 52, 53, 54, 63, 64, 65, 100, 128, 511, 1024, 2048]) {
    const power = 1n << BigInt(bits);
    for (const offset of [-2049n, -1025n, -1024n, -1n, 0n, 1n, 1023n, 1024n, 1025n, 2047n, 2048n]) {
      const value = power + offset;
      values.add(String(value)); values.add(String(-value));
    }
    if (bits > 64) for (const offset of [-1n, 0n, 1n]) {
      const value = power + (1n << BigInt(bits - 53)) + offset;
      values.add(String(value)); values.add(String(-value));
    }
  }
  const inputs = [...values];
  source += `
#include <stdint.h>
#include <inttypes.h>
int main(void) {
  pari_init(64000000, 10000);
  const char *values[] = {${inputs.map(JSON.stringify).join(",")}};
  for (size_t i = 0; i < sizeof(values)/sizeof(*values); i++) {
    pari_sp av = avma; long exponent; uint64_t bits;
    double value = itodbl_exp(gp_read_str(values[i]), &exponent);
    _Static_assert(sizeof(value) == sizeof(bits), "binary64 required");
    memcpy(&bits, &value, sizeof(bits));
    printf("%ld %" PRIu64 "\\n", exponent, bits); avma = av;
  }
  pari_close(); return 0;
}
`;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-lll-double-"));
  const cpath = path.join(directory, "oracle.c"), executable = path.join(directory, "oracle");
  fs.writeFileSync(cpath, source);
  run("cc", ["-O2", "-fvisibility=hidden", "-I" + path.join(pari, "src/headers"), "-I" + lib,
    cpath, "-L" + lib, "-Wl,-rpath," + lib, "-lpari", "-lm", "-o", executable]);
  const rows = run(executable, []).trim().split("\n").map(line => line.split(" "));
  assert.equal(rows.length, inputs.length);
  run("python3", ["-c", `
import sys,json,decimal,struct,importlib
sys.path[:0]=sys.argv[1:3]
function=importlib.import_module('bench.pari-class-group-port.lll_float_preparation').pari_lll_integer_to_double
different_from_direct=0
for value, expected in json.load(sys.stdin):
    output=[0.0]
    exponent=function(int(value),output)
    bits=struct.unpack('>Q',struct.pack('>d',output[0]))[0]
    assert [str(exponent),str(bits)]==expected,(value,expected,exponent,bits)
    if exponent>=0 and output[0]!=int(value)/(1<<exponent):
        different_from_direct+=1
assert different_from_direct>0,'missing a two-stage/direct-rounding distinction'
`, path.resolve(__dirname, "../.."), path.resolve(__dirname, "../../src/lib")],
  {input: JSON.stringify(inputs.map((value, index) => [value, rows[index]]))});
  const built = await compileKernel({sourcePath: path.join(__dirname, "lll_float_preparation.py")});
  const function_ = require(built.modulePath).pari_lll_integer_to_double;
  const buffer = new ArrayBuffer(8), view = new DataView(buffer);
  for (let index = 0; index < inputs.length; index++) for (const backend of ["javascript", "gmp"]) {
    const output = [0];
    const exponent = function_[backend](BigInt(inputs[index]), output);
    view.setFloat64(0, output[0], false);
    assert.deepEqual([String(exponent), String(view.getBigUint64(0, false))], rows[index], `${backend}: ${inputs[index]}`);
  }
  console.log(`${inputs.length} LLL integer normalizations match PARI/CPython/JS/GMP bit-for-bit, including zero and two-stage rounding boundaries`);
})().catch(error => {console.error(error); process.exitCode = 1;});
