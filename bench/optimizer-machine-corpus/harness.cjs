"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const os = require("node:os");
const path = require("node:path");
const { performance } = require("node:perf_hooks");

const { createSage } = require("../../dist/tools/kernel.js");
const createCompiler = require("../../dist/tools/compiler.js").default;
const {
  createPythonCompilerFrontend,
} = require("../../dist/tools/python/compiler-frontend.js");
const { pythonExecutable } = require("../../tools/python-executable.cjs");

const MACHINE_EVIDENCE_SCHEMA = "sagejs.optimizer-machine-evidence/v1";

function median(values) {
  assert.ok(values.length > 0, "median requires observations");
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2
    ? ordered[middle]
    : (ordered[middle - 1] + ordered[middle]) / 2;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function positiveInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new RangeError(`${label} must be a positive integer`);
  }
  return parsed;
}

function positiveScale(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 100) {
    throw new RangeError("scale must be finite, positive, and at most 100");
  }
  return parsed;
}

function workloadSize(spec, scale) {
  return Math.max(spec.minimumSize, Math.round(spec.baseSize * scale));
}

function commonSageTiming(spec, size, samples) {
  return `${spec.sageDefinition(size)}
_resource_before = _machine_resource_count()
_cold_started = time.perf_counter()
${spec.invocation}
_cold_elapsed = time.perf_counter() - _cold_started
_resource_after_cold = _machine_resource_count()
print('COLD|${spec.domain}|' + str(_cold_elapsed) + '|' + _machine_encode(_machine_answer) + '|' + str(_resource_before) + '|' + str(_resource_after_cold))
for _machine_sample in range(${samples}):
    _warm_started = time.perf_counter()
    ${spec.invocation.trim()}
    _warm_elapsed = time.perf_counter() - _warm_started
    print('WARM|${spec.domain}|' + str(_warm_elapsed) + '|' + _machine_encode(_machine_answer))
print('RESOURCE|${spec.domain}|' + str(_resource_after_cold) + '|' + str(_machine_resource_count()))
`;
}

function commonPythonTiming(spec, size, samples) {
  return `${spec.pythonDefinition(size)}
_cold_started = time.perf_counter()
${spec.invocation}
_cold_elapsed = time.perf_counter() - _cold_started
print('COLD|${spec.domain}|' + str(_cold_elapsed) + '|' + _machine_encode(_machine_answer) + '|0|0')
for _machine_sample in range(${samples}):
    _warm_started = time.perf_counter()
    ${spec.invocation.trim()}
    _warm_elapsed = time.perf_counter() - _warm_started
    print('WARM|${spec.domain}|' + str(_warm_elapsed) + '|' + _machine_encode(_machine_answer))
print('RESOURCE|${spec.domain}|0|0')
`;
}

function workloadSpecifications() {
  return [
    {
      domain: "bounded-integer",
      outputKind: "exact-decimal-integer",
      baseSize: 200_000,
      minimumSize: 1_000,
      invocation: "_machine_answer = machine_workload(_machine_size, 17, -1, 19)",
      sageDefinition(size) {
        return `import time
_machine_size = ${size}
def machine_workload(count: int, value: int, multiplier: int, increment: int):
    for index in range(count):
        value = value*multiplier + increment
    return value
def _machine_encode(value):
    return str(value)
def _machine_resource_count():
    return 0`;
      },
      pythonDefinition(size) {
        return this.sageDefinition(size);
      },
      logicalBytes(size) {
        return { input: 32, output: 8, elements: size };
      },
    },
    {
      domain: "strict-binary64-array",
      outputKind: "native-endian-ieee754-bits",
      baseSize: 50_000,
      minimumSize: 1_000,
      invocation: "_machine_answer = machine_workload(_machine_values, 0.125, 0.9999999403953552)",
      sageDefinition(size) {
        return `import time
from array import array
_machine_size = ${size}
_machine_values = array('d', [((index % 17) - 8)/16.0 for index in range(_machine_size)])
def machine_workload(values, accumulator: float, multiplier: float):
    for index in range(len(values)):
        accumulator = accumulator*multiplier + values[index]
    return accumulator
def _machine_encode(value):
    return array('d', [value]).tobytes().hex()
def _machine_resource_count():
    return 0`;
      },
      pythonDefinition(size) {
        return this.sageDefinition(size);
      },
      logicalBytes(size) {
        return { input: size * 8 + 16, output: 8, elements: size };
      },
    },
    {
      domain: "prime-residue-batch",
      outputKind: "canonical-residue-summary",
      baseSize: 10_000,
      minimumSize: 100,
      invocation: "_machine_answer = machine_workload(_machine_values, _machine_output, _machine_multiplier, _machine_increment, _machine_parent)",
      sageDefinition(size) {
        return `import time
_machine_size = ${size}
_machine_parent = Zmod(1009)
_machine_values = tuple(_machine_parent(index*index + 3*index - 7) for index in range(_machine_size))
_machine_output = [_machine_parent(0) for index in range(_machine_size)]
_machine_multiplier = _machine_parent(37)
_machine_increment = _machine_parent(-19)
def machine_workload(values, output, multiplier, increment, parent):
    checksum = parent(0)
    for index in range(len(values)):
        output[index] = values[index]*multiplier + increment
        checksum = checksum + output[index]
    return checksum, output[0], output[-1]
def _machine_encode(value):
    return ','.join(str(int(entry)) for entry in value)
def _machine_resource_count():
    return len(_machine_parent._nativeResourceChildren) if hasattr(_machine_parent, '_nativeResourceChildren') else 0`;
      },
      pythonDefinition(size) {
        return `import time
_machine_size = ${size}
_machine_parent = 1009
_machine_values = tuple((index*index + 3*index - 7) % _machine_parent for index in range(_machine_size))
_machine_output = [0 for index in range(_machine_size)]
_machine_multiplier = 37
_machine_increment = -19
def machine_workload(values, output, multiplier, increment, parent):
    checksum = 0
    for index in range(len(values)):
        output[index] = (values[index]*multiplier + increment) % parent
        checksum = (checksum + output[index]) % parent
    return checksum, output[0], output[-1]
def _machine_encode(value):
    return ','.join(str(entry) for entry in value)
def _machine_resource_count():
    return 0`;
      },
      logicalBytes(size) {
        return { input: size * 8 + 24, output: size * 8 + 24, elements: size };
      },
    },
    {
      domain: "fixed-extension",
      outputKind: "canonical-power-basis-coordinates",
      baseSize: 1_000,
      minimumSize: 20,
      invocation: "_machine_answer = machine_workload(_machine_size)",
      sageDefinition(size) {
        return `import time
_machine_size = ${size}
_machine_polynomial_ring.<x> = PolynomialRing(GF(5))
_machine_parent.<a> = GF(5^3, modulus=x^3 + x + 1)
_machine_a2 = a*a
def machine_workload(count):
    value = _machine_parent(1) + 2*a + 3*_machine_a2
    multiplier = _machine_parent(2) + a + 4*_machine_a2
    increment = _machine_parent(3) + 4*a + _machine_a2
    for index in range(count):
        value = value*multiplier + increment
    return value
def _machine_encode(value):
    return ','.join(str(int(entry)) for entry in value._power_basis_coordinates())
def _machine_resource_count():
    return len(_machine_parent._nativeResourceChildren)`;
      },
      pythonDefinition(size) {
        return `import time
_machine_size = ${size}
def _multiply(left, right):
    product = [0 for index in range(5)]
    for left_index in range(3):
        for right_index in range(3):
            index = left_index + right_index
            product[index] = (product[index] + left[left_index]*right[right_index]) % 5
    for exponent in range(4, 2, -1):
        factor = product[exponent]
        product[exponent - 3] = (product[exponent - 3] - factor) % 5
        product[exponent - 2] = (product[exponent - 2] - factor) % 5
    return product[:3]
def machine_workload(count):
    value = [1, 2, 3]
    multiplier = [2, 1, 4]
    increment = [3, 4, 1]
    for index in range(count):
        value = [(left + right) % 5 for left, right in zip(_multiply(value, multiplier), increment)]
    return value
def _machine_encode(value):
    return ','.join(str(entry) for entry in value)
def _machine_resource_count():
    return 0`;
      },
      logicalBytes(size) {
        return { input: 6 * 8 + 8, output: 3 * 8, elements: size };
      },
    },
    {
      domain: "packed-container",
      outputKind: "signed-int64-buffer-summary",
      baseSize: 100_000,
      minimumSize: 1_000,
      invocation: "_machine_answer = machine_workload(_machine_values, _machine_output)",
      sageDefinition(size) {
        return `import time
from sagejs.native import int64_buffer, int64_zeros
_machine_size = ${size}
_machine_values = int64_buffer(((index % 257) - 128 for index in range(_machine_size)))
_machine_output = int64_zeros(_machine_size)
def machine_workload(values, output):
    checksum = 0
    for index in range(len(values)):
        output[index] = values[index]*-17 + 23
        checksum = checksum + output[index]
    return checksum, output[0], output[-1]
def _machine_encode(value):
    return ','.join(str(entry) for entry in value)
def _machine_resource_count():
    return 0`;
      },
      pythonDefinition(size) {
        return `import time
_machine_size = ${size}
_machine_values = [(index % 257) - 128 for index in range(_machine_size)]
_machine_output = [0 for index in range(_machine_size)]
def machine_workload(values, output):
    checksum = 0
    for index in range(len(values)):
        output[index] = values[index]*-17 + 23
        checksum = checksum + output[index]
    return checksum, output[0], output[-1]
def _machine_encode(value):
    return ','.join(str(entry) for entry in value)
def _machine_resource_count():
    return 0`;
      },
      logicalBytes(size) {
        return { input: size * 8, output: size * 8 + 24, elements: size };
      },
    },
  ];
}

function parserOptions(domain, level) {
  return {
    filename: `<optimizer-machine-corpus:${domain}>`,
    for_linting: true,
    libdir: path.join(__dirname, "..", "..", "src", "lib"),
    import_dirs: [],
    exact_integer_literals: true,
    strict_python_scopes: true,
    scoped_flags: {
      dict_literals: true,
      overload_getitem: true,
      bound_methods: true,
      sequential_definitions: true,
    },
    optimization_level: level,
  };
}

function compilationSource(spec, size) {
  return spec.sageDefinition(size).split("\n")
    .filter((line) => !line.startsWith("import ") && !line.startsWith("from "))
    .join("\n");
}

function detachedRegionEvidence(program) {
  return (program?.regions || []).map((region) => ({
    id: region.id,
    pass_id: region.passId,
    selected: region.selected,
    rejection_reasons: [...region.rejectionReasons],
    mathematical_domain: region.mathematical.domain,
    representation: region.representation.kind,
    target: region.target.kind,
    lowering: region.target.lowering,
    selected_candidate: region.target.selectedCandidate,
    boundary_crossings: region.target.boundaryCrossings,
    copied_bytes: region.target.copiedBytes,
    materializations: region.representation.materializations,
    fallback_id: region.fallbackId,
    candidates: region.target.candidates.map((candidate) => ({
      id: candidate.id,
      kind: candidate.kind,
      availability: candidate.availability,
      rejection_reason: candidate.rejectionReason,
      cost: {
        boundary_crossings: candidate.cost.boundaryCrossings,
        copied_bytes: candidate.cost.copiedBytes,
        allocations: candidate.cost.allocations,
        materializations: candidate.cost.materializations,
        compile_milliseconds: candidate.cost.compileMilliseconds,
        instantiate_milliseconds: candidate.cost.instantiateMilliseconds,
        load_milliseconds: candidate.cost.loadMilliseconds,
        emitted_bytes: candidate.cost.emittedBytes,
      },
    })),
  }));
}

async function measureCompilation(specs, sizes, samples) {
  const compiler = createCompiler();
  const frontendStarted = performance.now();
  const frontend = await createPythonCompilerFrontend(compiler, "sage");
  const frontendReadyMs = performance.now() - frontendStarted;
  const outputOptions = {
    omit_baselib: true,
    beautify: false,
    private_scope: false,
    write_name: false,
    exact_integers: true,
    python_tuples: true,
    python_attributes: true,
  };
  const report = {};
  try {
    for (const spec of specs) {
      // Imports are runtime setup rather than part of the candidate region.  Keeping
      // the measured source import-free also lets the standalone emitter report the
      // workload's generated bytes without bundling unrelated library modules.
      const source = compilationSource(spec, sizes[spec.domain]);
      const observations = { O0: [], O2: [] };
      const emitted = { O0: 0, O2: 0 };
      let optimizerEvidence = [];
      for (let sample = 0; sample < samples; sample += 1) {
        const order = sample % 2 ? ["O0", "O2"] : ["O2", "O0"];
        for (const level of order) {
          const started = performance.now();
          const ast = frontend.parse(source, parserOptions(spec.domain, level));
          const output = new compiler.OutputStream(outputOptions);
          ast.print(output);
          const javascript = output.get();
          observations[level].push(performance.now() - started);
          emitted[level] = Buffer.byteLength(javascript);
          if (level === "O2") {
            optimizerEvidence = detachedRegionEvidence(ast.optimization_ir);
          }
        }
      }
      report[spec.domain] = {
        source_sha256: sha256(source),
        source_bytes: Buffer.byteLength(source),
        samples,
        o0_samples_ms: observations.O0,
        o2_samples_ms: observations.O2,
        o0_median_ms: median(observations.O0),
        o2_median_ms: median(observations.O2),
        emitted_bytes: emitted,
        emitted_o2_minus_o0_bytes: emitted.O2 - emitted.O0,
        optimizer_ir: optimizerEvidence,
        accounting_availability: optimizerEvidence.length
          ? "reported by optimizer IR per considered region"
          : "no optimizer region reported for this source",
      };
    }
  } finally {
    frontend.close();
  }
  return { frontend_ready_ms: frontendReadyMs, domains: report };
}

function parseTimingOutput(stdout, spec, samples) {
  let cold = null;
  let resources = null;
  const warm = [];
  for (const line of stdout.replaceAll("\r\n", "\n").split("\n")) {
    if (line.startsWith(`COLD|${spec.domain}|`)) {
      const [, , seconds, output, before, after] = line.split("|");
      cold = {
        execution_ms: Number(seconds) * 1000,
        output,
        resources_before: Number(before),
        resources_after: Number(after),
      };
    } else if (line.startsWith(`WARM|${spec.domain}|`)) {
      const [, , seconds, output] = line.split("|");
      warm.push({ execution_ms: Number(seconds) * 1000, output });
    } else if (line.startsWith(`RESOURCE|${spec.domain}|`)) {
      const [, , afterCold, afterWarm] = line.split("|");
      resources = { after_cold: Number(afterCold), after_warm: Number(afterWarm) };
    }
  }
  if (!cold || !resources || warm.length !== samples) {
    throw new Error(
      `${spec.domain} timing output is incomplete: ${stdout.slice(0, 1000)}`,
    );
  }
  for (const value of [cold.execution_ms, ...warm.map((entry) => entry.execution_ms)]) {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`${spec.domain} emitted invalid timing ${value}`);
    }
  }
  const outputs = new Set([cold.output, ...warm.map((entry) => entry.output)]);
  if (outputs.size !== 1) throw new Error(`${spec.domain} output changed between samples`);
  return {
    cold_execution_ms: cold.execution_ms,
    warm_samples_ms: warm.map((entry) => entry.execution_ms),
    warm_median_ms: median(warm.map((entry) => entry.execution_ms)),
    output: cold.output,
    resources: {
      before: cold.resources_before,
      after_cold: resources.after_cold,
      after_warm: resources.after_warm,
      cold_delta: resources.after_cold - cold.resources_before,
      warm_delta: resources.after_warm - resources.after_cold,
    },
  };
}

async function sessionAtLevel(level) {
  const previous = process.env.SAGEJS_OPT_LEVEL;
  process.env.SAGEJS_OPT_LEVEL = level;
  try {
    return await createSage();
  } finally {
    if (previous === undefined) delete process.env.SAGEJS_OPT_LEVEL;
    else process.env.SAGEJS_OPT_LEVEL = previous;
  }
}

async function measureSage(spec, size, samples, level) {
  const source = commonSageTiming(spec, size, samples);
  const initializationStarted = performance.now();
  const session = await sessionAtLevel(level);
  const sessionInitializeMs = performance.now() - initializationStarted;
  try {
    const evaluationStarted = performance.now();
    const result = await session.evaluate(source);
    const firstEvaluationTotalMs = performance.now() - evaluationStarted;
    if (result.stderr) throw new Error(result.stderr);
    return {
      level,
      session_initialize_ms: sessionInitializeMs,
      first_evaluation_total_ms: firstEvaluationTotalMs,
      process_to_first_result_ms: sessionInitializeMs + firstEvaluationTotalMs,
      ...parseTimingOutput(result.stdout, spec, samples),
    };
  } finally {
    await session.close();
  }
}

function measureCPython(spec, size, samples) {
  const source = commonPythonTiming(spec, size, samples);
  const started = performance.now();
  const result = spawnSync(pythonExecutable(), ["-"], {
    encoding: "utf8",
    input: source,
    maxBuffer: 16 * 1024 * 1024,
  });
  const processToCompletionMs = performance.now() - started;
  if (result.error || result.status !== 0) {
    throw new Error(
      `CPython ${spec.domain} failed: ${result.error?.message || result.stderr || result.stdout}`,
    );
  }
  return {
    executable: pythonExecutable(),
    process_to_completion_ms: processToCompletionMs,
    ...parseTimingOutput(result.stdout, spec, samples),
  };
}

function gitIdentity(root) {
  const run = (args) => spawnSync("git", args, { cwd: root, encoding: "utf8" });
  const revision = run(["rev-parse", "HEAD"]);
  const tree = run(["rev-parse", "HEAD^{tree}"]);
  const status = run(["status", "--porcelain=v1", "--untracked-files=all"]);
  if (revision.status !== 0 || tree.status !== 0 || status.status !== 0) return null;
  return {
    commit: revision.stdout.trim(),
    tree: tree.stdout.trim(),
    dirty: status.stdout.trim() !== "",
  };
}

function hostIdentity() {
  const cpus = os.cpus();
  return {
    platform: process.platform,
    architecture: process.arch,
    release: os.release(),
    cpu: cpus[0]?.model || "unknown",
    logical_cpus: cpus.length,
    node: process.version,
  };
}

async function runHarness(options = {}) {
  const samples = positiveInteger(options.samples ?? 5, "samples");
  const compileSamples = positiveInteger(
    options.compileSamples ?? samples,
    "compile samples",
  );
  const scale = positiveScale(options.scale ?? 1);
  const allSpecs = workloadSpecifications();
  const selectedDomains = options.domains
    ? new Set(options.domains)
    : new Set(allSpecs.map((spec) => spec.domain));
  const unknown = [...selectedDomains].filter(
    (domain) => !allSpecs.some((spec) => spec.domain === domain),
  );
  if (unknown.length) throw new Error(`unknown machine domains: ${unknown.join(", ")}`);
  const specs = allSpecs.filter((spec) => selectedDomains.has(spec.domain));
  const sizes = Object.fromEntries(
    specs.map((spec) => [spec.domain, workloadSize(spec, scale)]),
  );
  const compilation = await measureCompilation(specs, sizes, compileSamples);
  const domains = [];
  for (const spec of specs) {
    const size = sizes[spec.domain];
    const cpython = measureCPython(spec, size, samples);
    const o0 = await measureSage(spec, size, samples, "O0");
    const o2 = await measureSage(spec, size, samples, "O2");
    assert.equal(o0.output, cpython.output, `${spec.domain}: O0 differs from CPython`);
    assert.equal(o2.output, o0.output, `${spec.domain}: O2 differs from O0`);
    domains.push({
      domain: spec.domain,
      output_kind: spec.outputKind,
      exact_output_or_bits: o2.output,
      size,
      logical_shape: spec.logicalBytes(size),
      compilation: compilation.domains[spec.domain],
      execution: { cpython, sagejs_o0: o0, sagejs_o2: o2 },
      ratios: {
        warm_o0_over_o2: o0.warm_median_ms / o2.warm_median_ms,
        warm_cpython_over_o2: cpython.warm_median_ms / o2.warm_median_ms,
      },
      runtime_accounting: {
        native_resource_delta_o0: o0.resources.warm_delta,
        native_resource_delta_o2: o2.resources.warm_delta,
        copied_bytes: "use optimizer_ir when the selected target reports it",
        materializations: "use optimizer_ir when the selected representation reports it",
        boundary_crossings: "use optimizer_ir when the selected target reports it",
      },
    });
  }
  const root = path.resolve(__dirname, "..", "..");
  return {
    schema: MACHINE_EVIDENCE_SCHEMA,
    source_identity: gitIdentity(root),
    host: hostIdentity(),
    samples,
    compile_samples: compileSamples,
    scale,
    frontend_ready_ms: compilation.frontend_ready_ms,
    domains,
  };
}

module.exports = {
  MACHINE_EVIDENCE_SCHEMA,
  commonPythonTiming,
  commonSageTiming,
  compilationSource,
  detachedRegionEvidence,
  measureCompilation,
  median,
  parseTimingOutput,
  runHarness,
  workloadSize,
  workloadSpecifications,
};
