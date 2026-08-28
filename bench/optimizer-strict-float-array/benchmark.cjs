#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { performance } = require("node:perf_hooks");
const { spawnSync } = require("node:child_process");

const createCompiler = require("../../dist/tools/compiler.js").default;
const { createSage } = require("../../dist/tools/kernel.js");
const {
  createPythonCompilerFrontend,
} = require("../../dist/tools/python/compiler-frontend.js");
const { optimizerCatalog } = require(
  "../../dist/tools/python/optimizer/index.js"
);
const {
  STRICT_FLOAT_ARRAY_PASS,
} = require(
  "../../dist/tools/python/optimizer/domains/strict-binary64-array/index.js"
);
const {
  strictFloatArrayRegionPass,
} = require(
  "../../dist/tools/python/optimizer/passes/strict-float-array-region.js"
);
const {
  verifyStrictFloatArrayPlan,
} = require(
  "../../dist/tools/python/optimizer/verifiers/strict-float-array.js"
);
const { pythonExecutable } = require("../../tools/python-executable.cjs");

const check = process.argv.includes("--check");
const count = check ? 50_000 : 250_000;
const genericCount = check ? 2_000 : 10_000;
const samples = check ? 3 : 7;
const scale = 1.0000001192092896;
const integrated = optimizerCatalog.plugins.some(
  (plugin) => plugin.id === STRICT_FLOAT_ARRAY_PASS,
);

const definition = `
def reduce_binary64(values: tuple[float, ...], total: float, scale: float):
    for value in values:
        total = total*scale + value
    return total
`;
const contractedDefinition = `
from sagejs.compiler import optimize
@optimize(require="${STRICT_FLOAT_ARRAY_PASS}", target="v8")
${definition.trim()}
`;

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

function bits(value) {
  const buffer = new ArrayBuffer(8);
  new DataView(buffer).setFloat64(0, value, true);
  return Buffer.from(buffer).toString("hex");
}

function values(length) {
  return Array.from(
    { length },
    (_unused, index) => ((index % 17) - 8) * 2 ** -20,
  );
}

function oracle(length) {
  let total = -0;
  for (const value of values(length)) total = total * scale + value;
  return bits(total);
}

function options(level) {
  return {
    filename: "strict-float-array.py",
    for_linting: true,
    import_dirs: [],
    optimization_level: level,
    exact_integer_literals: true,
    strict_python_scopes: true,
    scoped_flags: {
      dict_literals: true,
      overload_getitem: true,
      bound_methods: true,
      sequential_definitions: true,
    },
  };
}

function walk(compiler, root, visitor) {
  const ignored = new Set([
    "start", "end", "scope", "thedef", "imports", "globals", "classes",
    "baselib", "optimization_ir", "optimization_region",
    "optimization_contract",
  ]);
  const seen = new Set();
  const visit = (value, ancestors = []) => {
    if (!value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      value.forEach((child) => visit(child, ancestors));
      return;
    }
    if (!(value instanceof compiler.AST_Node)) return;
    visitor(value, ancestors);
    for (const [key, child] of Object.entries(value)) {
      if (!ignored.has(key) && typeof child !== "function") {
        visit(child, [...ancestors, value]);
      }
    }
  };
  visit(root);
}

function recognizeIsolated(compiler, ast) {
  const definitionNode = ast.body.find(
    (node) => node instanceof compiler.AST_Function,
  );
  definitionNode.optimization_contract = {
    requiredPassId: STRICT_FLOAT_ARRAY_PASS,
  };
  let candidate = null;
  strictFloatArrayRegionPass.run(ast, {
    compiler,
    controls: {
      level: "O2",
      disabledPasses: new Set(),
      requiredOptimizations: new Set(),
      explain: false,
    },
    walk(root, visitor) {
      walk(compiler, root, visitor);
    },
    consider(value) {
      candidate = value;
    },
  });
  assert(candidate);
  verifyStrictFloatArrayPlan(candidate.internal);
  return candidate;
}

async function measureCompiler() {
  const cold = [];
  for (let sample = 0; sample < samples; sample += 1) {
    const started = performance.now();
    const compiler = createCompiler();
    const frontend = await createPythonCompilerFrontend(compiler, "python");
    try {
      if (integrated) {
        const ast = frontend.parse(contractedDefinition, options("O2"));
        assert.equal(ast.optimization_ir.regions[0].passId, STRICT_FLOAT_ARRAY_PASS);
      } else {
        recognizeIsolated(
          compiler,
          frontend.parse(definition, options("O0")),
        );
      }
    } finally {
      frontend.close();
    }
    cold.push(performance.now() - started);
  }

  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  const warm = [];
  let targetCodeBytes = null;
  let emittedBytes = null;
  try {
    for (let sample = 0; sample < 31; sample += 1) {
      const started = performance.now();
      if (integrated) {
        const ast = frontend.parse(contractedDefinition, options("O2"));
        const [region] = ast.optimization_ir.regions;
        assert.equal(region.passId, STRICT_FLOAT_ARRAY_PASS);
        if (sample === 30) {
          const output = new compiler.OutputStream({
            beautify: false,
            python: true,
            python_tuples: true,
          });
          ast.print(output);
          emittedBytes = Buffer.byteLength(output.toString());
        }
      } else {
        const candidate = recognizeIsolated(
          compiler,
          frontend.parse(definition, options("O0")),
        );
        targetCodeBytes = candidate.internal.operands.targetCodeBytes;
      }
      if (sample >= 10) warm.push(performance.now() - started);
    }
  } finally {
    frontend.close();
  }
  return {
    mode: integrated ? "integrated-o2" : "isolated-plugin",
    cold_frontend_samples_ms: cold,
    cold_frontend_median_ms: median(cold),
    warm_compile_samples_ms: warm,
    warm_compile_median_ms: median(warm),
    conservative_target_code_bytes: targetCodeBytes,
    complete_emitted_module_bytes: emittedBytes,
  };
}

function matchedJavaScript(length) {
  const input = values(length);
  for (let warmup = 0; warmup < 3; warmup += 1) {
    let total = -0;
    for (const value of input) total = total * scale + value;
    assert.equal(bits(total), oracle(length));
  }
  const observations = [];
  let checksum = null;
  for (let sample = 0; sample < samples; sample += 1) {
    let total = -0;
    const started = performance.now();
    for (const value of input) total = total * scale + value;
    observations.push(performance.now() - started);
    checksum = bits(total);
  }
  return { observations_ms: observations, median_ms: median(observations), checksum };
}

async function sessionAtLevel(level) {
  const previous = process.env.SAGEJS_OPT_LEVEL;
  process.env.SAGEJS_OPT_LEVEL = level;
  try {
    return await createSage({ mode: "python" });
  } finally {
    if (previous === undefined) delete process.env.SAGEJS_OPT_LEVEL;
    else process.env.SAGEJS_OPT_LEVEL = previous;
  }
}

async function measureSage(level, length, useContract) {
  const session = await sessionAtLevel(level);
  try {
    const source = `${useContract ? contractedDefinition : definition}
import time
from array import array
started = time.perf_counter()
values = tuple(float((index % 17)-8) * 2.0**-20 for index in range(${length}))
materialization = time.perf_counter() - started
reduce_binary64(values, -0.0, ${scale})
for sample in range(${samples}):
    started = time.perf_counter()
    answer = reduce_binary64(values, -0.0, ${scale})
    elapsed = time.perf_counter() - started
    print(elapsed, array('d', [answer]).tobytes().hex())
print('materialization', materialization)
`;
    const result = await session.evaluate(source);
    assert.equal(result.stderr ?? "", "");
    const observations = [];
    let checksum = null;
    let materializationMs = null;
    for (const line of result.stdout.trim().split(/\r?\n/)) {
      const fields = line.split(/\s+/);
      if (fields[0] === "materialization") {
        materializationMs = Number(fields[1]) * 1_000;
      } else {
        observations.push(Number(fields[0]) * 1_000);
        checksum = fields[1];
      }
    }
    return {
      observations_ms: observations,
      median_ms: median(observations),
      checksum,
      input_materialization_ms: materializationMs,
    };
  } finally {
    await session.close();
  }
}

function pythonComparisons(length) {
  const source = `
import json, struct, time
COUNT=${length}
SAMPLES=${samples}
SCALE=${scale}
values=tuple(float((i % 17)-8)*2.0**-20 for i in range(COUNT))
def bits(value): return struct.pack('=d', value).hex()
def reduce(values, total, scale):
    for value in values:
        total=total*scale+value
    return total
def measure(fn):
    fn()
    out=[]
    checksum=None
    for _ in range(SAMPLES):
        started=time.perf_counter(); answer=fn(); out.append((time.perf_counter()-started)*1000); checksum=bits(answer)
    return {'samples_ms':out, 'median_ms':sorted(out)[len(out)//2], 'checksum':checksum}
report={'cpython':measure(lambda: reduce(values, -0.0, SCALE))}
try:
    import numpy as np
    packed=np.asarray(values, dtype=np.float64)
    def numpy_reduce():
        total=np.float64(-0.0)
        for value in packed:
            total=np.add(np.multiply(total, np.float64(SCALE)), value)
        return float(total)
    report['numpy']={'version':np.__version__, **measure(numpy_reduce)}
except Exception as error:
    report['numpy']={'available':False, 'reason':type(error).__name__}
try:
    import numba
    import numpy as np
    @numba.njit(fastmath=False)
    def numba_reduce(packed, total, scale):
        for value in packed:
            total=total*scale+value
        return total
    packed=np.asarray(values, dtype=np.float64)
    started=time.perf_counter(); first=numba_reduce(packed, -0.0, SCALE); compile_ms=(time.perf_counter()-started)*1000
    measured=measure(lambda: numba_reduce(packed, -0.0, SCALE))
    report['numba']={'version':numba.__version__, 'first_call_ms':compile_ms, 'first_checksum':bits(first), **measured}
except Exception as error:
    report['numba']={'available':False, 'reason':type(error).__name__}
print(json.dumps(report))
`;
  const result = spawnSync(pythonExecutable(), ["-"], {
    encoding: "utf8",
    input: source,
    timeout: check ? 120_000 : 300_000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

function juliaComparison(length) {
  const probe = spawnSync("julia", ["--version"], { encoding: "utf8" });
  if (probe.error?.code === "ENOENT") return { available: false, reason: "not-installed" };
  if (probe.status !== 0) return { available: false, reason: "version-probe-failed" };
  const source = `
using Printf
count=${length}; samples=${samples}; scale=${scale}
values=Tuple(Float64(mod(i,17)-8)*2.0^-20 for i in 0:count-1)
function reduce64(values, total, scale)
    for value in values
        total=total*scale+value
    end
    total
end
function checksum(value)
    bytes=reinterpret(UInt8, [value])
    join((@sprintf("%02x", byte) for byte in bytes))
end
started=time_ns(); first=reduce64(values, -0.0, scale); first_ms=(time_ns()-started)/1e6
println("first ", first_ms, " ", checksum(first))
for sample in 1:samples
    started=time_ns(); answer=reduce64(values, -0.0, scale); elapsed=(time_ns()-started)/1e6
    println("sample ", elapsed, " ", checksum(answer))
end
`;
  const result = spawnSync("julia", ["--startup-file=no", "-e", source], {
    encoding: "utf8",
    timeout: check ? 120_000 : 300_000,
  });
  if (result.status !== 0) {
    return { available: false, reason: "execution-failed", stderr: result.stderr.trim() };
  }
  const lines = result.stdout.trim().split(/\r?\n/);
  const first = lines[0].split(/\s+/);
  const observations = lines.slice(1).map((line) => Number(line.split(/\s+/)[1]));
  return {
    available: true,
    version: probe.stdout.trim(),
    first_call_ms: Number(first[1]),
    first_checksum: first[2],
    samples_ms: observations,
    median_ms: median(observations),
    checksum: lines.at(-1).split(/\s+/)[2],
  };
}

async function main() {
  const checksum = oracle(count);
  const compiler = await measureCompiler();
  const matched = matchedJavaScript(count);
  const generic = await measureSage("O0", genericCount, false);
  const optimized = integrated
    ? await measureSage("O2", count, true)
    : { available: false, reason: "integration-owned registration pending" };
  const python = pythonComparisons(count);
  const julia = juliaComparison(count);
  for (const comparison of [matched, python.cpython, python.numpy, python.numba, julia]) {
    if (comparison.checksum) comparison.checksum_matches = comparison.checksum === checksum;
  }
  if (optimized.checksum) optimized.checksum_matches = optimized.checksum === checksum;
  generic.checksum_matches = generic.checksum === oracle(genericCount);

  const report = {
    schema: "sagejs.optimizer-strict-float-array-benchmark/v1",
    node: process.version,
    integrated,
    workload:
      "source-ordered binary64 multiply-add reduction over one immutable tuple",
    count,
    generic_count: genericCount,
    samples,
    checksum,
    accounting: {
      optimizer_boundary_crossings: 0,
      optimizer_copied_bytes: 0,
      optimized_liveout_materializations: 1,
      input_tuple_materialization_is_timed_separately: true,
    },
    compiler,
    sagejs_o2: optimized,
    sagejs_o0_prefix: generic,
    matched_javascript: matched,
    cpython: python.cpython,
    numpy: python.numpy,
    numba: python.numba,
    julia,
    interpretation: integrated
      ? "O2 is the registered emitted route; cross-runtime rows are same-checksum measurements, not universal runtime rankings."
      : "The lane plugin is measured in isolation; no Sage.js O2 runtime claim is made until integration registers its verifier and emitter.",
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

  if (check) {
    assert.equal(matched.checksum, checksum);
    assert.equal(python.cpython.checksum, checksum);
    assert.equal(generic.checksum_matches, true);
    assert.ok(compiler.warm_compile_median_ms < 25,
      `strict array compile median is ${compiler.warm_compile_median_ms.toFixed(3)} ms`);
    if (integrated) {
      assert.equal(optimized.checksum, checksum);
      assert.ok(optimized.median_ms < generic.median_ms * count / genericCount,
        "integrated strict array route lost its generic-prefix execution tier");
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
