"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

const TIMEOUT_MS = 10 * 60 * 1000;
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const elapsed = (started) => Number(process.hrtime.bigint() - started) / 1e6;
const bufferValues = (buffer) =>
  (buffer.toArray ? buffer.toArray() : Array.from(buffer)).map(BigInt);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: TIMEOUT_MS,
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout;
}

function randomMantissa(bits, initial) {
  assert.equal(bits % 64, 0);
  const mask = (1n << 64n) - 1n;
  let state = BigInt(initial) & mask;
  const words = [];
  for (let i = 0; i < bits / 64; i++) {
    state = (6364136223846793005n * state + 1442695040888963407n) & mask;
    words.push(state.toString(16).padStart(16, "0"));
  }
  words[0] = (BigInt("0x" + words[0]) | (1n << 63n))
    .toString(16)
    .padStart(16, "0");
  return BigInt("0x" + words.join(""));
}

function cases() {
  const sparse = (bits) => {
    const high = 1n << BigInt(bits - 1);
    return [high + 1n, high + (high >> 1n)];
  };
  const carry = (bits) => {
    const high = 1n << BigInt(bits - 1);
    const x = 3n * (high >> 1n) + 3n;
    const y = ((1n << BigInt(2 * bits - 1)) - 1n) / x;
    return [x, y];
  };
  const tie3520 = sparse(3520);
  const tie3584 = sparse(3584);
  const tie153088 = sparse(153088);
  const carry153088 = carry(153088);
  return [
    {
      label: "below-host-cutoff",
      args: [randomMantissa(3456, 11), 3456n, 7n, randomMantissa(3456, 29), 3456n, -13n],
    },
    {
      label: "at-host-cutoff-tie",
      args: [tie3520[0], 3520n, -91n, tie3520[1], 3520n, 53n],
    },
    {
      label: "above-host-cutoff-tie",
      args: [tie3584[0], 3584n, 17n, tie3584[1], 3584n, -22n],
    },
    {
      label: "above-host-cutoff-negative",
      args: [-randomMantissa(3584, 37), 3584n, -700n, randomMantissa(3584, 41), 3584n, 901n],
    },
    {
      label: "high-precision-tie",
      args: [tie153088[0], 153088n, -3n, tie153088[1], 153088n, 9n],
    },
    {
      label: "high-precision-rounding-carry",
      args: [carry153088[0], 153088n, 152000n, carry153088[1], 153088n, -151000n],
    },
    {
      label: "high-precision-negative-random",
      args: [-randomMantissa(153088, 47), 153088n, -80000n, randomMantissa(153088, 53), 153088n, 70000n],
    },
    {
      label: "high-precision-unequal-guard-word",
      args: [randomMantissa(152960, 59), 152960n, 33n, randomMantissa(153088, 61), 153088n, -77n],
    },
  ];
}

function roundingShape(args) {
  let [mx, px, , my, py] = args;
  mx = mx < 0n ? -mx : mx;
  my = my < 0n ? -my : my;
  if (px > py) [mx, my, px, py] = [my, mx, py, px];
  if (px < py) my >>= py - px - 64n;
  const product = mx * my;
  const bits = BigInt(product.toString(2).length);
  const discard = bits - px;
  const unit = 1n << discard;
  const remainder = product & (unit - 1n);
  const half = unit >> 1n;
  const quotient = product >> discard;
  return {
    guard: remainder >= half,
    sticky: remainder !== half,
    carry: (quotient + (remainder >= half ? 1n : 0n)).toString(2).length > Number(px),
  };
}

function pristinePariOracle(rows) {
  const pari = path.resolve(process.env.PARI_ROOT || "/home/user/upstream/pari-2.17.4");
  const archive = path.resolve(process.env.PARI_ARCHIVE || "/home/user/upstream/pari-2.17.4.tar.gz");
  assert.equal(sha256(fs.readFileSync(archive)), "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53");
  assert.equal(sha256(fs.readFileSync(path.join(pari, "src/kernel/none/mp_indep.c"))), "5d7862d1a5464a07e7377fa6f00a9a12b7988d766c63409198fbcc13cbad3700");
  assert.equal(sha256(fs.readFileSync(path.join(pari, "src/kernel/gmp/tune.h"))), "cf1b7bcad303ca0a3d74d360ed455385ca16ebfd42240eff0e0959040f3d4461");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-full-product-oracle-"));
  const source = path.join(directory, "oracle.c");
  const executable = path.join(directory, "oracle");
  fs.writeFileSync(
    source,
    `#define _GNU_SOURCE
#include "pari.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
static void emit(GEN x){long d=0;if(!signe(x))printf("0 0 %ld\\n",expo(x));else pari_printf("%Ps %ld %ld\\n",mantissa_real(x,&d),bit_prec(x),expo(x));}
int main(void){char *line=NULL;size_t cap=0;pari_init(536870912,10000);while(getline(&line,&cap,stdin)>0){char *v[6],*save=NULL,*p=strtok_r(line," \\n",&save);int i=0;while(p&&i<6){v[i++]=p;p=strtok_r(NULL," \\n",&save);}if(i!=6)return 2;pari_sp av=avma;long sx=v[0][0]=='-'?-1:1,sy=v[3][0]=='-'?-1:1,px=atol(v[1]),ex=atol(v[2]),py=atol(v[4]),ey=atol(v[5]);GEN xm=strtoi(v[0]+(sx<0)),ym=strtoi(v[3]+(sy<0));GEN x=itor(xm,nbits2prec(px)),y=itor(ym,nbits2prec(py));setexpo(x,ex);setexpo(y,ey);setsigne(x,sx);setsigne(y,sy);emit(mulrr(x,y));set_avma(av);}free(line);pari_close();return 0;}`,
  );
  const library = path.join(pari, "Olinux-x86_64");
  run("cc", ["-O2", "-I" + path.join(pari, "src/headers"), "-I" + library, source, "-L" + library, "-Wl,-rpath," + library, "-lpari", "-lm", "-o", executable]);
  const input = rows.map(({ args }) => args.map(String).join(" ")).join("\n") + "\n";
  const trace = run(executable, [], { input });
  const lines = trace.trim().split("\n");
  assert.equal(lines.length, rows.length);
  return {
    values: lines.map((line) => line.trim().split(/\s+/).map(BigInt)),
    traceSha256: sha256(trace),
  };
}

function cpythonOracle(rows) {
  const script = `
import importlib,json,sys
sys.path[:0]=sys.argv[1:3]
f=importlib.import_module('bench.pari-class-group-port.short_product').pari_short_product
def parse(x): return (-1 if x[0]=='-' else 1)*int(x.lstrip('-'),16)
def emit(x): return ('-' if x<0 else '')+format(abs(x),'x')
for row in json.load(sys.stdin): print(*(emit(x) for x in f(*(parse(x) for x in row))))
`;
  const encode = (value) => (value < 0n ? "-" : "") + (value < 0n ? -value : value).toString(16);
  const decode = (value) => (value.startsWith("-") ? -BigInt("0x" + value.slice(1)) : BigInt("0x" + value));
  const input = JSON.stringify(rows.map(({ args }) => args.map(encode)));
  return run("python3", ["-c", script, path.resolve(__dirname, "../.."), path.resolve(__dirname, "../../src/lib")], { input })
    .trim().split("\n").map((line) => line.split(/\s+/).map(decode));
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

(async () => {
  const rows = cases();
  const tieShape = roundingShape(rows.find(({ label }) => label === "high-precision-tie").args);
  assert.deepEqual(tieShape, { guard: true, sticky: false, carry: false });
  const carryShape = roundingShape(rows.find(({ label }) => label === "high-precision-rounding-carry").args);
  assert.equal(carryShape.carry, true);
  const pari = pristinePariOracle(rows);
  assert.deepEqual(cpythonOracle(rows), pari.values);

  const built = await compileKernel({
    sourcePath: path.join(__dirname, "high_precision_full_product_probe.py"),
  });
  const module = require(built.modulePath);
  const api = module.pari_high_precision_full_product_batch;
  assert(api.nativeAvailable);
  const flat = rows.flatMap(({ args }) => args);
  const operands = api.createIntegerBuffer(flat.length, 154112, flat);
  for (const backend of ["javascript", "gmp", "tagged"]) {
    const output = api.createIntegerBuffer(3 * rows.length, 154112, Array(3 * rows.length).fill(0n));
    const state = api.createInt64Buffer([0n, 0n, 0n]);
    assert.equal(api[backend](operands, BigInt(rows.length), output, state), 0n);
    assert.deepEqual(bufferValues(output), pari.values.flat(), backend);
    assert.deepEqual(bufferValues(state), [1n, BigInt(rows.length), 3520n], backend);
  }

  const output = api.createIntegerBuffer(3 * rows.length, 154112, pari.values.flat());
  const state = api.createInt64Buffer([1n, BigInt(rows.length), 3520n]);
  const heldOutput = bufferValues(output);
  const heldState = bufferValues(state);
  assert.throws(() => api.gmp(operands, BigInt(rows.length), api.createIntegerBuffer(3 * rows.length - 1, 154112), state), /output storage exhausted/);
  assert.deepEqual(bufferValues(output), heldOutput);
  assert.deepEqual(bufferValues(state), heldState);
  const corrupt = [...flat];
  corrupt[corrupt.length - 2] = 153087n;
  assert.throws(() => api.gmp(api.createIntegerBuffer(corrupt.length, 154112, corrupt), BigInt(rows.length), output, state), /requires 64-bit words/);
  assert.deepEqual(bufferValues(output), heldOutput);
  assert.deepEqual(bufferValues(state), heldState);

  const core = fs.readFileSync(built.coreSourcePath, "utf8");
  const start = core.lastIndexOf("static int native_pari_short_product");
  assert(start >= 0);
  const productCore = core.slice(start, start + 160000);
  assert.match(productCore, /mpz_mul/);
  assert.match(productCore, /3520/);

  function measure(bits, seed) {
    const args = [randomMantissa(bits, seed), BigInt(bits), 5n, randomMantissa(bits, seed + 2), BigInt(bits), -7n];
    const input = api.createIntegerBuffer(6, 154112, args);
    const out = api.createIntegerBuffer(3, 154112, [0n, 0n, 0n]);
    const timingState = api.createInt64Buffer([0n, 0n, 0n]);
    for (let i = 0; i < 5; i++) api.gmp(input, 1n, out, timingState);
    const samples = [];
    for (let i = 0; i < 31; i++) {
      const started = process.hrtime.bigint();
      api.gmp(input, 1n, out, timingState);
      samples.push(elapsed(started));
    }
    return median(samples);
  }
  const lowMs = measure(3584, 71);
  const highMs = measure(153088, 73);
  const wordRatio = 153088 / 3584;
  const timeRatio = highMs / lowMs;
  assert(timeRatio < wordRatio * wordRatio * 0.25, { lowMs, highMs, wordRatio, timeRatio });

  console.log(JSON.stringify({
    status: "pass",
    source: "ordinary CPython-parseable Python",
    hostTune: { MULRR_MULII_LIMITBits: 3520, effectiveFullProductFirstBits: 3584, tuneDependent: true },
    fixtures: rows.map((row, i) => ({ label: row.label, outputSha256: sha256(pari.values[i].map(String).join("\n")) })),
    oracleTraceSha256: pari.traceSha256,
    backends: ["CPython", "javascript", "gmp", "tagged", "PARI-2.17.4"],
    transactionalRejections: 2,
    nativeLowering: { mpzMul: true, coreBytes: fs.statSync(built.coreSourcePath).size, cacheKey: built.cacheKey },
    benchmark: { lowBits: 3584, highBits: 153088, lowMedianMs: lowMs, highMedianMs: highMs, wordRatio, timeRatio, quadraticRatio: wordRatio * wordRatio, qualifiedAgainstPari: false },
  }));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
