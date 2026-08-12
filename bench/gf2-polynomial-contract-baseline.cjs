#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const os = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");
const sagejs = process.env.SAGEJS_EXECUTABLE || resolve(root, "bin", "sagejs");
const sage = process.env.SAGE_EXECUTABLE || "/home/user/sagelite/sage";
const check = process.argv.includes("--check");
const outputIndex = process.argv.indexOf("--output");
const outputPath =
  outputIndex === -1 ? null : resolve(process.argv[outputIndex + 1]);
const warmups = Number(process.env.SAGEJS_GF2_POLY_WARMUPS || 3);
const samples = Number(process.env.SAGEJS_GF2_POLY_SAMPLES || 7);

const workload = String.raw`
import json
import time

R = PolynomialRing(GF(2), "x")
n = 4096
m = 1024
v = [((i*i*1103515245 + i*12345 + 6789)//65536) % 2 for i in range(n)] + [1]
w = [((i*i*1664525 + i*1013904223 + 333)//65536) % 2 for i in range(n)] + [1]
u = [((i*i*22695477 + i + 555)//65536) % 2 for i in range(m)] + [1]
f = R(v)
g = R(w)
h = R(u)
dividend = f*h + g[:m]
persistence_packet = dumps(f)


def packed_polynomial_hex(value):
    coefficients = value.list()
    packed = []
    for offset in range(0, len(coefficients), 8):
        byte = 0
        for bit in range(min(8, len(coefficients) - offset)):
            byte |= (1 if coefficients[offset + bit] != 0 else 0) << bit
        packed.append(byte)
    return str(value.degree()) + ":" + bytes(packed).hex()


def exact_digest(value):
    if isinstance(value, tuple):
        return "(" + ";".join(exact_digest(part) for part in value) + ")"
    if isinstance(value, list):
        return packed_polynomial_hex(R(value))
    return packed_polynomial_hex(value)


def measure(operation, iterations):
    for _index in range(__WARMUPS__):
        operation()
    timings = []
    for _sample in range(__SAMPLES__):
        started = time.perf_counter()
        for _index in range(iterations):
            result = operation()
        timings.append(1000 * (time.perf_counter() - started) / iterations)
    timings.sort()
    return {
        "median_ms": timings[len(timings) // 2],
        "samples_ms": timings,
        "iterations_per_sample": iterations,
    }


operations = {
    "construction": (lambda: R(v), 25),
    "add": (lambda: f + g, 100),
    "multiply": (lambda: f * g, 25),
    "divrem": (lambda: dividend.quo_rem(h), 20),
    "gcd": (lambda: f.gcd(g), 5),
    "xgcd": (lambda: f.xgcd(g), 5),
    "list": (lambda: f.list(), 20),
    "format": (lambda: repr(f), 10),
    "persistence_dump": (lambda: dumps(f), 10),
    "persistence_load": (lambda: loads(persistence_packet), 10),
}

measurements = {}
results = {}
for name, case in operations.items():
    operation, iterations = case
    measurements[name] = measure(operation, iterations)
    value = operation()
    if name == "format":
        results[name] = {
            "characters": len(value),
            "text_checksum": sum((index + 1) * ord(character) for index, character in enumerate(value)),
        }
    elif name == "persistence_dump":
        results[name] = {"bytes": len(value)}
    elif name == "persistence_load":
        results[name] = {"exact_polynomial": exact_digest(value)}
    else:
        results[name] = {"exact_polynomial": exact_digest(value)}

quotient, remainder = dividend.quo_rem(h)
xgcd_value, left_cofactor, right_cofactor = f.xgcd(g)
print("GF2_POLY_BASELINE " + json.dumps({
    "runtime": "__RUNTIME__",
    "persistence_format": "__PERSISTENCE__",
    "polynomial_type": str(type(f)),
    "parent": str(R),
    "degree": n,
    "divisor_degree": m,
    "warmups": __WARMUPS__,
    "samples": __SAMPLES__,
    "measurements": measurements,
    "results": results,
    "identities": {
        "divrem": quotient*h + remainder == dividend and remainder.degree() < h.degree(),
        "xgcd": left_cofactor*f + right_cofactor*g == xgcd_value,
        "persistence": loads(persistence_packet) == f,
    },
}, sort_keys=True, separators=(",", ":")))
`;

function commandOutput(command, args = []) {
  const result = spawnSync(command, args, { encoding: "utf8", timeout: 10_000 });
  if (result.error || result.status !== 0) return null;
  return result.stdout.trim() || null;
}

function fileSha256(path) {
  if (!path || !existsSync(path)) return null;
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function lastNonemptyLine(value) {
  return value?.split(/\r?\n/).filter(Boolean).at(-1) || null;
}

function sageMathBuildIdentity() {
  const module = lastNonemptyLine(
    commandOutput(sage, [
      "-c",
      "import sage.rings.polynomial.polynomial_gf2x as m; print(m.__file__)",
    ]),
  );
  return {
    executable: resolve(sage),
    executable_sha256: fileSha256(resolve(sage)),
    gf2x_module: module,
    gf2x_module_sha256: fileSha256(module),
    linkage: module
      ? commandOutput("ldd", [module])?.split(/\r?\n/).map((line) => line.trim())
      : null,
    note: "The installed Polynomial_GF2X extension statically contains its NTL/GF2X backend; its module hash is the retained backend build identity.",
  };
}

function resultDigests(result) {
  const copy = structuredClone(result);
  for (const operation of Object.values(copy.results)) {
    if (operation.exact_polynomial === undefined) continue;
    const exact = operation.exact_polynomial;
    operation.exact_polynomial = {
      sha256: createHash("sha256").update(exact).digest("hex"),
      encoded_bytes: Buffer.byteLength(exact),
    };
  }
  return copy;
}

function runRuntime(name, executable, args, persistenceFormat) {
  assert.ok(existsSync(executable), `${name} executable not found: ${executable}`);
  const source = `${name === "sagemath" ? "from sage.all import *\n" : ""}${workload
    .replaceAll("__RUNTIME__", name)
    .replaceAll("__PERSISTENCE__", persistenceFormat)
    .replaceAll("__WARMUPS__", String(warmups))
    .replaceAll("__SAMPLES__", String(samples))}`;
  const directory = mkdtempSync(join(os.tmpdir(), "sagejs-gf2-poly-baseline-"));
  const path = join(directory, "workload.py");
  try {
    writeFileSync(path, source);
    const result = spawnSync(executable, [...args, path], {
      cwd: root,
      encoding: "utf8",
      timeout: 180_000,
      env: { ...process.env, SAGEJS_FORBID_POLYNOMIAL_NAPI: "1" },
    });
    if (result.error) throw result.error;
    assert.equal(
      result.status,
      0,
      `${name} failed:\n${result.stdout}\n${result.stderr}`,
    );
    const line = result.stdout
      .split(/\r?\n/)
      .find((entry) => entry.startsWith("GF2_POLY_BASELINE "));
    assert.ok(line, `${name} did not emit its measurement record`);
    return {
      source_sha256: createHash("sha256").update(source).digest("hex"),
      ...JSON.parse(line.slice("GF2_POLY_BASELINE ".length)),
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function cpuFlags() {
  if (!existsSync("/proc/cpuinfo")) return [];
  const match = readFileSync("/proc/cpuinfo", "utf8").match(/^flags\s*:\s*(.*)$/m);
  if (!match) return [];
  const interesting = new Set([
    "pclmulqdq",
    "vpclmulqdq",
    "avx2",
    "avx512f",
    "sse4_2",
    "aes",
  ]);
  return match[1].split(/\s+/).filter((flag) => interesting.has(flag));
}

const sagejsResult = runRuntime("sagejs", sagejs, ["--python"], "SagePack");
const sageResult = runRuntime(
  "sagemath",
  sage,
  [],
  "Sage pickle/persistence (not SagePack)",
);
const sageMathBuild = sageMathBuildIdentity();

const comparable = ["construction", "add", "multiply", "divrem", "gcd", "list"];
if (check) {
  for (const name of comparable) {
    assert.equal(
      sagejsResult.results[name].exact_polynomial,
      sageResult.results[name].exact_polynomial,
      `${name} result differs`,
    );
  }
  assert.ok(sagejsResult.identities.divrem && sageResult.identities.divrem);
  assert.ok(sagejsResult.identities.xgcd && sageResult.identities.xgcd);
  assert.ok(
    sagejsResult.identities.persistence && sageResult.identities.persistence,
  );
}

const report = {
  schema: "sagejs.benchmark/gf2-polynomial-contract-baseline-v1",
  generated_at: new Date().toISOString(),
  repository: {
    commit: commandOutput("git", ["rev-parse", "HEAD"]),
    dirty: Boolean(commandOutput("git", ["status", "--porcelain"])),
    benchmark_harness_sha256: fileSha256(__filename),
    contract_sha256: fileSha256(
      resolve(root, ".agents", "tasks", "gf2-polynomial-contract.json"),
    ),
  },
  host: {
    platform: process.platform,
    architecture: process.arch,
    node: process.version,
    cpu_model: os.cpus()[0]?.model || null,
    logical_cpus: os.cpus().length,
    memory_bytes: os.totalmem(),
    selected_isa_flags: cpuFlags(),
  },
  workload: {
    source_sha256: createHash("sha256").update(workload).digest("hex"),
    degree: 4096,
    divisor_degree: 1024,
    warmups,
    samples,
    exact_result_encoding: "degree:canonical-low-to-high-packed-bit-hex",
  },
  backends: {
    sagejs: {
      public_representation: "UInt64-per-coefficient GF(p) packed storage",
      advanced_backend: "generated FLINT nmod_poly packed adapters",
      flint: "3.6.0",
      build_commit: commandOutput("git", ["rev-parse", "HEAD"]),
      executable: resolve(sagejs),
      executable_sha256: fileSha256(resolve(sagejs)),
      flint_declaration_sha256: fileSha256(
        resolve(root, "ffi", "flint.ffi.py"),
      ),
      generated_flint_abi_sha256: fileSha256(
        resolve(root, "ffi", "flint.ffi.json"),
      ),
      dependency_lock_sha256: fileSha256(resolve(root, "pnpm-lock.yaml")),
    },
    sagemath: {
      version: commandOutput(sage, ["--version"]),
      public_representation: sageResult.polynomial_type,
      advanced_backend:
        "NTL GF2X (NTL may use the optional gf2x multiplication library)",
      build_identity: sageMathBuild,
    },
  },
  persistence_comparison: {
    sagejs: "SagePack",
    sagemath: "Sage pickle/persistence; timings and bytes are not a SagePack comparison",
  },
  runtimes: {
    sagejs: resultDigests(sagejsResult),
    sagemath: resultDigests(sageResult),
  },
};

const reportText = `${JSON.stringify(report, null, 2)}\n`;
if (outputPath) writeFileSync(outputPath, reportText);
console.log(reportText.trimEnd());
