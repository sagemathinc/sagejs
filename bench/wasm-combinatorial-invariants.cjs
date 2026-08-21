#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const {
  buildWasmProductionPacks,
} = require("../tools/native-kernel/wasm-production-pack.cjs");
const {
  resolveToolchain,
} = require("../packages/flint-wasm/scripts/wasm-toolchain.cjs");

const root = resolve(__dirname, "..");
const functions = [
  "packed_integer_matrix_permanent",
  "packed_integer_matrix_minors",
  "packed_rational_matrix_permanent",
  "packed_rational_matrix_minors",
  "packed_prime_matrix_permanent",
  "packed_prime_matrix_minors",
];

function toolchain() {
  const status = resolveToolchain({ root });
  if (!status.ready) return null;
  return {
    clang: status.paths.clang,
    sysroot: status.paths.sysroot,
    gmpPrefix: status.paths.libraries.gmp.prefix,
    flintPrefix: status.paths.libraries.flint.prefix,
    mpfrPrefix: status.paths.libraries.mpfr.prefix,
    mpcPrefix: status.paths.libraries.mpc.prefix,
  };
}

async function instantiate(manifest, outputRoot) {
  const { WASI } = require("node:wasi");
  const { instantiateWasmKernelPacks } = await import(
    "../tools/native-kernel/wasm-pack-loader.mjs"
  );
  return instantiateWasmKernelPacks({
    manifest,
    load(pack) {
      return readFileSync(join(outputRoot, pack.asset));
    },
    host() {
      const wasi = new WASI({ version: "preview1", returnOnExit: true });
      return {
        imports: { wasi_snapshot_preview1: wasi.wasiImport },
        initialize(instance) {
          wasi.initialize(instance);
        },
      };
    },
  });
}

function median(samples) {
  samples.sort((left, right) => left - right);
  return samples[Math.floor(samples.length / 2)];
}

function timed(call, repetitions = 7) {
  call();
  const samples = [];
  for (let repeat = 0; repeat < repetitions; repeat += 1) {
    const started = performance.now();
    call();
    samples.push(performance.now() - started);
  }
  return median(samples);
}

function gcd(left, right) {
  left = Math.abs(left);
  while (right !== 0) [left, right] = [right, left % right];
  return left;
}

function rationalEntries(length) {
  const numerators = [];
  const denominators = [];
  for (let index = 0; index < length; index += 1) {
    let numerator = (index * 17 + 3) % 23 - 11;
    let denominator = (index % 5) + 1;
    const common = gcd(numerator, denominator);
    numerator /= common;
    denominator /= common;
    numerators.push(BigInt(numerator));
    denominators.push(BigInt(denominator));
  }
  return { numerators, denominators };
}

function pythonFallback() {
  const result = spawnSync("/usr/bin/python3", ["-c", String.raw`
import json
import math
import sys
import time
from fractions import Fraction
sys.path.insert(0, "src/lib")
from sagejs.kernels.matrix.combinatorial import (
    packed_integer_matrix_minors,
    packed_integer_matrix_permanent,
    packed_prime_matrix_minors,
    packed_prime_matrix_permanent,
    packed_rational_matrix_minors,
    packed_rational_matrix_permanent,
)

def median_time(call, repeats=7):
    call()
    values=[]
    for _ in range(repeats):
        start=time.perf_counter()
        call()
        values.append(1000*(time.perf_counter()-start))
    return sorted(values)[len(values)//2]

answer={}
integer_entries=[(i*17+3)%23-11 for i in range(100)]
integer_permanent=[0]
integer_states=[0]*(1<<10)
ip=lambda: packed_integer_matrix_permanent(integer_permanent,integer_entries,integer_states,10,10)
answer["ZZ.permanent10"]={"ms":median_time(ip),"value":str(integer_permanent[0])}
integer_minor_entries=integer_entries[:56]
integer_minors=[0]*(math.comb(7,3)*math.comb(8,3))
im=lambda: packed_integer_matrix_minors(integer_minors,integer_minor_entries,[0]*8,[0]*6,7,8,3)
answer["ZZ.minors7x8k3"]={"ms":median_time(im),"value":"|".join(map(str,integer_minors))}

rationals=[Fraction((i*17+3)%23-11,i%5+1) for i in range(100)]
numerators=[v.numerator for v in rationals]
denominators=[v.denominator for v in rationals]
rn=[0];rd=[0]
rp=lambda: packed_rational_matrix_permanent(rn,rd,numerators,denominators,[0]*1024,[0]*1024,10,10)
answer["QQ.permanent10"]={"ms":median_time(rp),"value":str(rn[0])+"/"+str(rd[0])}
count=math.comb(7,3)*math.comb(8,3)
rmn=[0]*count;rmd=[0]*count
rm=lambda: packed_rational_matrix_minors(rmn,rmd,numerators[:56],denominators[:56],[0]*8,[0]*8,[0]*6,7,8,3)
answer["QQ.minors7x8k3"]={"ms":median_time(rm),"value":"|".join(str(rmn[i])+"/"+str(rmd[i]) for i in range(count))}

prime_entries=[v%7 for v in integer_entries]
prime_permanent=[0]
pp=lambda: packed_prime_matrix_permanent(prime_permanent,prime_entries,[0]*1024,10,10,7)
answer["GF7.permanent10"]={"ms":median_time(pp),"value":str(prime_permanent[0])}
prime_minors=[0]*count
pm=lambda: packed_prime_matrix_minors(prime_minors,prime_entries[:56],[0]*8,[0]*6,7,8,3,7)
answer["GF7.minors7x8k3"]={"ms":median_time(pm),"value":"|".join(map(str,prime_minors))}
print(json.dumps(answer,separators=(",",":")))
`], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, PYTHONPATH: "" },
    timeout: 180_000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

async function main() {
  const selectedToolchain = toolchain();
  if (selectedToolchain === null) {
    throw new Error("the pinned Wasm FLINT/GMP toolchain is unavailable");
  }
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-wasm-combinatorial-bench-"));
  try {
    const descriptor = {
      id: "packed-combinatorial-invariants-production",
      source: "src/lib/sagejs/kernels/matrix/combinatorial.py",
      functions,
      semantic_domain: "packed exact combinatorial matrix invariants",
      fallback: "same-source",
      host_isolation: "certified",
      oracles: ["cpython", "javascript", "sage"],
      benchmark: "bench:wasm-combinatorial-invariants",
      platforms: ["linux-x64", "linux-arm64", "windows-x64", "macos-arm64"],
    };
    const manifestPath = join(temporary, "native-kernels.json");
    writeFileSync(
      manifestPath,
      `${JSON.stringify({ kernels: [descriptor] }, null, 2)}\n`,
    );
    const outputRoot = join(temporary, "output");
    const manifest = await buildWasmProductionPacks({
      root,
      manifestPath,
      outputRoot,
      domains: ["flint"],
      emitOnly: false,
      toolchain: selectedToolchain,
    });
    const runtime = await instantiate(manifest, outputRoot);
    const logical = "sagejs/kernels/matrix/combinatorial.py";
    const portable = pythonFallback();
    const wasm = {};

    const integers = Array.from(
      { length: 100 },
      (_unused, index) => BigInt((index * 17 + 3) % 23 - 11),
    );
    const integerPermanent = runtime.function(logical, functions[0]);
    const integerPermanentValue = [0n];
    const integerPermanentCall = () => integerPermanent(
      { values: integerPermanentValue, wordCapacity: 32 },
      integers,
      { values: Array(1024).fill(0n), wordCapacity: 32 },
      10n,
      10n,
    );
    wasm["ZZ.permanent10"] = {
      ms: timed(integerPermanentCall),
      value: String(integerPermanentValue[0]),
    };

    const count = 1960;
    const integerMinors = runtime.function(logical, functions[1]);
    const integerMinorValues = Array(count).fill(0n);
    const integerMinorCall = () => integerMinors(
      { values: integerMinorValues, wordCapacity: 32 },
      integers.slice(0, 56),
      { values: Array(8).fill(0n), wordCapacity: 32 },
      new BigUint64Array(6),
      7n,
      8n,
      3n,
    );
    wasm["ZZ.minors7x8k3"] = {
      ms: timed(integerMinorCall),
      value: integerMinorValues.join("|"),
    };

    const rational = rationalEntries(100);
    const rationalPermanent = runtime.function(logical, functions[2]);
    const rationalPermanentNumerator = [0n];
    const rationalPermanentDenominator = [0n];
    const rationalPermanentCall = () => rationalPermanent(
      { values: rationalPermanentNumerator, wordCapacity: 64 },
      { values: rationalPermanentDenominator, wordCapacity: 64 },
      rational.numerators,
      rational.denominators,
      { values: Array(1024).fill(0n), wordCapacity: 64 },
      { values: Array(1024).fill(0n), wordCapacity: 64 },
      10n,
      10n,
    );
    wasm["QQ.permanent10"] = {
      ms: timed(rationalPermanentCall),
      value: `${rationalPermanentNumerator[0]}/${rationalPermanentDenominator[0]}`,
    };

    const rationalMinors = runtime.function(logical, functions[3]);
    const rationalMinorNumerators = Array(count).fill(0n);
    const rationalMinorDenominators = Array(count).fill(0n);
    const rationalMinorCall = () => rationalMinors(
      { values: rationalMinorNumerators, wordCapacity: 64 },
      { values: rationalMinorDenominators, wordCapacity: 64 },
      rational.numerators.slice(0, 56),
      rational.denominators.slice(0, 56),
      { values: Array(8).fill(0n), wordCapacity: 64 },
      { values: Array(8).fill(0n), wordCapacity: 64 },
      new BigUint64Array(6),
      7n,
      8n,
      3n,
    );
    wasm["QQ.minors7x8k3"] = {
      ms: timed(rationalMinorCall, 5),
      value: rationalMinorNumerators.map(
        (value, index) => `${value}/${rationalMinorDenominators[index]}`,
      ).join("|"),
    };

    const primeEntries = new BigUint64Array(
      integers.map((value) => (value % 7n + 7n) % 7n),
    );
    const primePermanent = runtime.function(logical, functions[4]);
    const primePermanentValue = new BigUint64Array(1);
    const primePermanentCall = () => primePermanent(
      primePermanentValue,
      primeEntries,
      new BigUint64Array(1024),
      10n,
      10n,
      7n,
    );
    wasm["GF7.permanent10"] = {
      ms: timed(primePermanentCall),
      value: String(primePermanentValue[0]),
    };

    const primeMinors = runtime.function(logical, functions[5]);
    const primeMinorValues = new BigUint64Array(count);
    const primeMinorCall = () => primeMinors(
      primeMinorValues,
      primeEntries.slice(0, 56),
      new BigUint64Array(8),
      new BigUint64Array(6),
      7n,
      8n,
      3n,
      7n,
    );
    wasm["GF7.minors7x8k3"] = {
      ms: timed(primeMinorCall),
      value: Array.from(primeMinorValues).join("|"),
    };

    for (const name of Object.keys(portable)) {
      assert.equal(wasm[name].value, portable[name].value, name);
    }
    const results = Object.fromEntries(Object.keys(portable).map((name) => [
      name,
      {
        portableCPythonMilliseconds: portable[name].ms,
        wasmMilliseconds: wasm[name].ms,
        speedup: portable[name].ms / wasm[name].ms,
      },
    ]));
    console.log(JSON.stringify({
      schema: "sagejs.benchmark/wasm-combinatorial-invariants-v1",
      workload: "matched packed buffers; median of seven warm calls (five for QQ minors)",
      equivalence: "complete exact output buffers compared",
      route: "wasm-compiled-source",
      boundaryCrossingsPerOperation: 1,
      results,
    }, null, 2));
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
