#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const process = require("node:process");
const { spawnSync } = require("node:child_process");

const repositoryRoot = path.resolve(__dirname, "..");
const packageRoot = path.join(repositoryRoot, "packages", "flint-wasm");

const FFLAS_DISPOSITIONS = Object.freeze([
  ["ffi:fflas:modular_float_available", null],
  ["ffi:fflas:modular_float_mul", "ffi:flint:nmod_mat_mul"],
  ["ffi:fflas:modular_float_rank", "ffi:flint:nmod_mat_rank"],
  ["ffi:fflas:modular_float_rref", "ffi:flint:nmod_mat_rref"],
  ["ffi:fflas:modular_float_right_nullspace", "ffi:flint:nmod_mat_right_kernel"],
  ["ffi:fflas:modular_double_available", null],
  ["ffi:fflas:modular_double_mul", "ffi:flint:nmod_matrix_mul"],
  ["ffi:fflas:modular_double_rank", "ffi:flint:nmod_matrix_rank"],
  ["ffi:fflas:modular_double_rref", "ffi:flint:nmod_matrix_rref"],
  ["ffi:fflas:modular_double_right_nullspace", "ffi:flint:nmod_matrix_right_kernel"],
].map(([capability, wasmCapability]) => Object.freeze({
  capability,
  wasmCapability,
  disposition: wasmCapability === null
    ? "desktop-backend-probe-not-a-public-mathematical-operation"
    : "desktop-optional-implementation-public-wasm-covered-by-flint",
})));

const REQUIRED_WASM_CAPABILITIES = Object.freeze({
  float: Object.freeze([
    "ffi:flint:nmod_mat_mul",
    "ffi:flint:nmod_mat_rank",
    "ffi:flint:nmod_mat_rref",
    "ffi:flint:nmod_mat_right_kernel",
  ]),
  double: Object.freeze([
    "ffi:flint:nmod_matrix_mul",
    "ffi:flint:nmod_matrix_rank",
    "ffi:flint:nmod_matrix_rref",
    "ffi:flint:nmod_matrix_right_kernel",
  ]),
});

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function option(argv, name, fallback) {
  const index = argv.indexOf(name);
  if (index < 0) return fallback;
  if (index + 1 >= argv.length) throw new Error(`${name} requires a value`);
  return argv[index + 1];
}

function positiveInteger(value, name, minimum = 1) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum) {
    throw new Error(`${name} must be an integer at least ${minimum}`);
  }
  return parsed;
}

function integerList(value, name, minimum = 1) {
  const values = String(value).split(",").filter(Boolean).map((item) =>
    positiveInteger(item.trim(), name, minimum));
  if (values.length === 0) throw new Error(`${name} must not be empty`);
  return [...new Set(values)];
}

function pythonSource({ size, modulus, samples }) {
  const nullity = Math.max(8, Math.floor(size / 4));
  if (size - nullity < 24) throw new Error("matrix size leaves too few wide rows");
  return `import json
import time

size = ${size}
modulus = ${modulus}
samples = ${samples}
wide_rows = size - ${nullity}
field = GF(modulus)

def triangular_pair(shift):
    lower = []
    upper = []
    for row in range(size):
        for column in range(size):
            if column > row:
                lower.append(0)
            elif column == row:
                lower.append(1)
            else:
                lower.append((104729*row + 13007*column + shift) % modulus)
            if column < row:
                upper.append(0)
            elif column == row:
                upper.append((row + shift) % (modulus - 1) + 1)
            else:
                upper.append((65537*row + 8191*column + 3*shift) % modulus)
    return matrix(field, size, size, lower) * matrix(field, size, size, upper)

left = triangular_pair(17)
right = triangular_pair(43)
left_entries = left.list()
wide_entries = left_entries[:wide_rows*size]

def median(values):
    values.sort()
    return values[len(values)//2]

def timed_mul():
    elapsed = []
    result = None
    for _ in range(samples):
        started = time.perf_counter()
        result = left * right
        elapsed.append(1000*(time.perf_counter() - started))
    return median(elapsed), result

def timed_rank():
    elapsed = []
    result = None
    for _ in range(samples):
        source = matrix(field, size, size, left_entries)
        started = time.perf_counter()
        result = source.rank()
        elapsed.append(1000*(time.perf_counter() - started))
    return median(elapsed), result

def timed_rref():
    elapsed = []
    result = None
    for _ in range(samples):
        source = matrix(field, wide_rows, size, wide_entries)
        started = time.perf_counter()
        result = source.rref()
        elapsed.append(1000*(time.perf_counter() - started))
    return median(elapsed), result

def timed_nullspace():
    elapsed = []
    result = None
    for _ in range(samples):
        source = matrix(field, wide_rows, size, wide_entries)
        started = time.perf_counter()
        result = source.right_kernel_matrix()
        elapsed.append(1000*(time.perf_counter() - started))
    return median(elapsed), result

# One untimed call per operation resolves lazy modules and warms the exact route.
left * right
matrix(field, size, size, left_entries).rank()
matrix(field, wide_rows, size, wide_entries).rref()
matrix(field, wide_rows, size, wide_entries).right_kernel_matrix()

mul_ms, product = timed_mul()
rank_ms, rank = timed_rank()
rref_ms, reduced = timed_rref()
nullspace_ms, kernel = timed_nullspace()
wide = matrix(field, wide_rows, size, wide_entries)
assert rank == size
assert reduced.rank() == wide_rows
assert kernel.nrows() == size - wide_rows
assert wide * kernel.transpose() == zero_matrix(field, wide_rows, kernel.nrows())

def integers(matrix_value):
    return [int(value) for value in matrix_value.list()]

print('__FFLAS_WASM_DISPOSITION__' + json.dumps({
    'size': size,
    'modulus': modulus,
    'samples': samples,
    'shape': {'square': [size, size], 'wide': [wide_rows, size]},
    'timings_ms': {
        'mul': mul_ms,
        'rank': rank_ms,
        'rref': rref_ms,
        'nullspace': nullspace_ms,
    },
    'mathematical': {
        'rank': rank,
        'wide_rank': reduced.rank(),
        'nullity': kernel.nrows(),
    },
    'exact': {
        'product': integers(product),
        'rref': integers(reduced),
        'nullspace': integers(kernel),
    },
}, sort_keys=True, separators=(',', ':')))
`;
}

function parsePayload(stdout) {
  const marker = "__FFLAS_WASM_DISPOSITION__";
  const line = stdout.split("\n").find((item) => item.startsWith(marker));
  if (line === undefined) throw new Error(`benchmark payload is missing:\n${stdout}`);
  const payload = JSON.parse(line.slice(marker.length));
  const exactSha256 = sha256(JSON.stringify(payload.exact));
  delete payload.exact;
  return { ...payload, exact_sha256: exactSha256 };
}

function nativeRoutes(stderr) {
  const routes = {};
  for (const match of stderr.matchAll(
    /\[sagejs native\] Matrix\.(multiply|rank|rref|right_kernel)[^\n]* -> ([^\s]+)/g,
  )) {
    const operation = match[1] === "right_kernel" ? "nullspace" : match[1];
    routes[operation] ??= [];
    if (!routes[operation].includes(match[2])) routes[operation].push(match[2]);
  }
  return routes;
}

function runNative(configuration) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-fflas-wasm-"));
  try {
    const filename = path.join(directory, "workload.sage");
    fs.writeFileSync(filename, pythonSource(configuration));
    const result = spawnSync(process.execPath, [path.join(repositoryRoot, "bin", "sagejs"), filename], {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: { ...process.env, SAGEJS_NATIVE_TRACE: "1", OPENBLAS_NUM_THREADS: "1" },
      maxBuffer: 64 * 1024 * 1024,
    });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return {
      host: "native-node",
      ...parsePayload(result.stdout),
      routes: nativeRoutes(result.stdout),
    };
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function checkedWasmRoutes(instrumentation, modulus) {
  assert.ok(instrumentation && Array.isArray(instrumentation.routes));
  const required = modulus < 256
    ? REQUIRED_WASM_CAPABILITIES.float
    : REQUIRED_WASM_CAPABILITIES.double;
  const byId = new Map(instrumentation.routes.map((route) => [route.capability_id, route]));
  for (const id of required) {
    const route = byId.get(id);
    assert.ok(route, `public workload did not observe ${id}`);
    assert.equal(route.selected_route, "receipt-backed-wasm-artifact");
    assert.equal(route.execution_target, "wasm-artifact");
  }
  return {
    boundary_crossings: instrumentation.boundary_crossings,
    copied_bytes: instrumentation.copied_bytes,
    routes: instrumentation.routes.filter((route) =>
      required.includes(route.capability_id)),
  };
}

async function runNodeWasm(session, configuration) {
  const started = performance.now();
  const result = await session.evaluate(pythonSource(configuration), { timeout: 300_000 });
  return {
    host: "node-wasm",
    wall_ms: performance.now() - started,
    ...parsePayload(result.stdout),
    instrumentation: checkedWasmRoutes(result.instrumentation, configuration.modulus),
  };
}

async function runBrowser(page, engine, configuration) {
  const result = await page.evaluate(
    ([source]) => window.__sagejsTest.evaluate(source, 300_000),
    [pythonSource(configuration)],
  );
  return {
    host: `browser-${engine}`,
    wall_ms: result.duration_ms,
    ...parsePayload(result.stdout),
    instrumentation: checkedWasmRoutes(result.instrumentation, configuration.modulus),
  };
}

function compareRecords(records) {
  assert.ok(records.length >= 2);
  const expected = records[0];
  for (const record of records.slice(1)) {
    assert.equal(record.exact_sha256, expected.exact_sha256,
      `${record.host} exact result differs from ${expected.host}`);
    assert.deepEqual(record.mathematical, expected.mathematical,
      `${record.host} mathematical invariants differ from ${expected.host}`);
  }
  const native = records.find((record) => record.host === "native-node");
  const ratios = {};
  if (native) {
    for (const record of records) {
      if (record === native) continue;
      ratios[record.host] = Object.fromEntries(
        Object.keys(native.timings_ms).map((operation) => [
          operation,
          record.timings_ms[operation] / native.timings_ms[operation],
        ]),
      );
    }
  }
  const performance = {};
  for (const record of records.filter(({ host }) => host !== "native-node")) {
    const operationResults = Object.fromEntries(
      Object.entries(record.timings_ms).map(([operation, milliseconds]) => {
        const ratio = ratios[record.host]?.[operation] ?? null;
        return [operation, {
          milliseconds,
          ratio_to_native: ratio,
          absolute_budget_ms: 250,
          ratio_budget: 20,
          passed: milliseconds <= 250 && ratio !== null && ratio <= 20,
        }];
      }),
    );
    performance[record.host] = operationResults;
  }
  return {
    exact_match: true,
    ratios_to_native: ratios,
    performance,
    performance_passed: Object.values(performance).every((operations) =>
      Object.values(operations).every(({ passed }) => passed)),
  };
}

async function main(argv = process.argv.slice(2)) {
  const quick = argv.includes("--quick");
  const check = argv.includes("--check");
  const sizes = integerList(option(argv, "--sizes", quick ? "64,128" : "64,128,256,512"), "--sizes", 32);
  const moduli = integerList(option(argv, "--moduli", "97,65537"), "--moduli", 2);
  const samples = positiveInteger(option(argv, "--samples", quick ? "3" : "5"), "--samples");
  const engines = option(argv, "--engines", "chromium").split(",").filter(Boolean);
  const output = option(argv, "--output", null);
  const { createSage } = await import(path.join(packageRoot, "node-kernel.mjs"));
  const {
    createBrowserWasmServer,
    executablePathFor,
  } = await import(path.join(packageRoot, "test", "browser-wasm-support.mjs"));
  const playwright = await import("playwright-core");
  const manifest = JSON.parse(fs.readFileSync(
    path.join(packageRoot, "dist", "production-manifest.json"), "utf8"));
  const report = {
    schema: "sagejs.wasm-fflas-disposition/v1",
    generated_at: new Date().toISOString(),
    artifact_identity: manifest.identity,
    source_revision: spawnSync("git", ["rev-parse", "HEAD"], {
      cwd: repositoryRoot, encoding: "utf8",
    }).stdout.trim(),
    environment: {
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
      cpu: os.cpus()[0]?.model ?? "unknown",
      logical_cpus: os.cpus().length,
    },
    methodology: {
      sizes,
      moduli,
      samples,
      warmups_per_operation: 1,
      statistic: "warm median wall milliseconds",
      exactness: "SHA-256 over every canonical product, RREF, and right-nullspace residue",
      native_route: "public automatic dispatch to generated FFLAS/FFPACK where its reviewed crossover applies",
      wasm_route: "public automatic dispatch to receipt-backed FLINT Wasm boundaries",
      reviewed_performance_target: "every warm operation through 512x512 is at most 250 ms and 20x its matched native route",
    },
    reviewed_dispositions: FFLAS_DISPOSITIONS,
    cases: [],
  };

  const nodeSession = await createSage();
  const browsers = [];
  const server = engines.length === 0 ? null : await createBrowserWasmServer();
  try {
    for (const engine of engines) {
      const browserType = playwright[engine];
      if (!browserType) throw new Error(`unsupported browser engine ${engine}`);
      const executablePath = executablePathFor(engine, browserType);
      if (!executablePath) throw new Error(`${engine} is unavailable`);
      const browser = await browserType.launch({
        executablePath,
        headless: true,
        args: engine === "chromium" ? ["--no-sandbox", "--disable-dev-shm-usage"] : [],
      });
      const page = await browser.newPage();
      await page.goto(`${server.origin}/browser-wasm-harness.html`, { waitUntil: "load" });
      await page.waitForFunction(() => window.__sagejsReady !== undefined);
      await page.evaluate(() => window.__sagejsReady);
      browsers.push({ engine, browser, page });
    }

    for (const modulus of moduli) {
      for (const size of sizes) {
        const configuration = { size, modulus, samples };
        const records = [
          runNative(configuration),
          await runNodeWasm(nodeSession, configuration),
        ];
        for (const { engine, page } of browsers) {
          records.push(await runBrowser(page, engine, configuration));
        }
        const comparison = compareRecords(records);
        if (check) {
          assert.equal(comparison.performance_passed, true,
            `reviewed performance target failed for GF(${modulus}) size ${size}`);
        }
        report.cases.push({
          id: `gf-${modulus}-${size}`,
          modulus,
          size,
          records,
          comparison,
        });
        process.stderr.write(`measured GF(${modulus}) ${size}x${size}\n`);
      }
    }
  } finally {
    await nodeSession.close();
    for (const { page, browser } of browsers) {
      await page.close();
      await browser.close();
    }
    await server?.close();
  }

  const encoded = `${JSON.stringify(report, null, 2)}\n`;
  if (output !== null) {
    const filename = path.resolve(repositoryRoot, output);
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, encoded);
  }
  process.stdout.write(encoded);
  return report;
}

module.exports = {
  FFLAS_DISPOSITIONS,
  REQUIRED_WASM_CAPABILITIES,
  checkedWasmRoutes,
  compareRecords,
  parsePayload,
  pythonSource,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack ?? error);
    process.exitCode = 1;
  });
}
