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
const test = require("node:test");

const { compileKernel } = require("../compiler.cjs");
const { lowerSource } = require("../ir.cjs");
const { generateJavaScript } = require("../js-backend.cjs");

const root = resolve(__dirname, "../../..");
const sagejs = join(root, "bin", "sagejs");
const witnessPath = join(__dirname, "immutable_capsule_effects_witness.py");
const witnessSource = readFileSync(witnessPath, "utf8");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    timeout: 120_000,
    ...options,
    env: { ...process.env, ...options.env },
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

test("prime-source buffers prove transitive positional write effects", async () => {
  const ir = await lowerSource(witnessSource, witnessPath);
  const fn = ir.functions.find((candidate) =>
    candidate.name === "accumulate_prime_words"
  );
  assert.equal(fn.kernelKind, "prime-field-source");
  assert.deepEqual(fn.analysis.effects.externalWrites, ["output", "scratch"]);
  assert.deepEqual(
    ir.functions.find((candidate) =>
      candidate.name === "accumulate_prime_row"
    ).analysis.effects.externalWrites,
    [],
  );
  assert.deepEqual(
    ir.functions.find((candidate) =>
      candidate.name === "publish_prime_word"
    ).analysis.effects.externalWrites,
    ["output", "scratch"],
  );

  const generated = generateJavaScript(ir, {
    cacheKey: "0123456789abcdef",
    sourceHash: "fedcba9876543210",
    moduleIdentity: "0123456789abcdef",
  });
  assert.match(
    generated,
    /uint64NativeBuffer\(output, "output", true\)/,
  );
  assert.match(
    generated,
    /uint64NativeBuffer\(source, "source", false\)/,
  );
  assert.match(
    generated,
    /uint64NativeBuffer\(scratch, "scratch", true\)/,
  );
  assert.doesNotMatch(generated, /analysis\.effects/);

  const absentAnalysis = {
    ...ir,
    functions: ir.functions.map((candidate) =>
      candidate.name === fn.name ? { ...candidate, analysis: undefined } : candidate
    ),
  };
  const absentGenerated = generateJavaScript(absentAnalysis, {
    cacheKey: "0123456789abcdef",
    sourceHash: "fedcba9876543210",
    moduleIdentity: "0123456789abcdef",
  });
  assert.match(
    absentGenerated,
    /uint64NativeBuffer\(source, "source", true\)/,
  );
});

test("production Cantor batches borrow only proved read-only inputs", async () => {
  const sourcePath = join(
    root,
    "src",
    "lib",
    "sagejs",
    "hyperelliptic_curves",
    "jacobian_kernels.py",
  );
  const ir = await lowerSource(readFileSync(sourcePath, "utf8"), sourcePath);
  const productionFunctions = [
    {
      name: ["packed", "cantor", "copy", "batch"].join("_"),
      readOnly: ["model", "left", "right"],
    },
    {
      name: ["packed", "cantor", "add", "batch"].join("_"),
      readOnly: ["model", "left", "right"],
    },
    {
      name: ["packed", "cantor", "scalar", "batch"].join("_"),
      readOnly: ["model", "elements", "scalar_words", "scalar_signs"],
    },
  ];
  for (const { name, readOnly } of productionFunctions) {
    const fn = ir.functions.find((candidate) => candidate.name === name);
    assert.deepEqual(fn.analysis.effects.externalWrites, ["output", "statuses"]);
    const generated = generateJavaScript({ ...ir, functions: [fn] }, {
      cacheKey: "0123456789abcdef",
      sourceHash: "fedcba9876543210",
      moduleIdentity: "0123456789abcdef",
    });
    for (const parameter of ["output", "statuses"]) {
      assert.match(
        generated,
        new RegExp(`uint64NativeBuffer\\(${parameter}, "${parameter}", true\\)`),
      );
    }
    for (const parameter of readOnly) {
      assert.match(
        generated,
        new RegExp(`uint64NativeBuffer\\(${parameter}, "${parameter}", false\\)`),
      );
    }
  }
});

test("transitive effects preserve dynamic, native, CPython, and lease results", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-capsule-effects-"));
  const executable = join(temporary, "immutable_capsule_effects_witness.py");
  const cacheRoot = join(temporary, "cache");
  const checks = String.raw`
import sagejs.runtime as runtime
from sagejs.native import is_compiled

compiled = is_compiled(accumulate_prime_words)
output = runtime.uint64_buffer([0]) if compiled else [0]
scratch = runtime.uint64_buffer([0]) if compiled else [0]
owner = object()
model = "neutral-model-v1"
capsule = runtime.immutable_uint64_capsule(
    runtime.uint64_buffer([11, 17, 23]), owner, model, "neutral-row-v1", 3
)
source = (
    runtime.immutable_uint64_capsule_lease(
        capsule, owner, model, "neutral-row-v1", 3
    )
    if compiled
    else runtime.immutable_uint64_capsule_copy(
        capsule, owner, model, "neutral-row-v1", 3
    )
)
modulus = runtime.bigint(101) if compiled else 101
assert accumulate_prime_words(output, source, scratch, 3, modulus)
assert int(output[0]) == 51
assert int(scratch[0]) == 51
if compiled:
    rejected = False
    try:
        accumulate_prime_words(source, output, scratch, 1, modulus)
    except TypeError:
        rejected = True
    assert rejected
print("compiled=" + str(compiled))
print("IMMUTABLE_CAPSULE_EFFECTS_OK")
`;
  try {
    writeFileSync(executable, `${witnessSource}\n${checks}`);
    const compiled = await compileKernel({ sourcePath: executable, cacheRoot });
    assert.ok(compiled.addonPath);
    const native = run(process.execPath, [sagejs, executable], {
      env: {
        SAGEJS_NATIVE_CACHE_DIR: cacheRoot,
        SAGEJS_NATIVE_REQUIRED: "1",
      },
    });
    const dynamic = run(process.execPath, [sagejs, executable], {
      env: {
        SAGEJS_NATIVE_CACHE_DIR: cacheRoot,
        SAGEJS_NATIVE_DISABLE: "1",
      },
    });
    assert.match(native, /compiled=True/);
    assert.match(dynamic, /compiled=False/);
    assert.match(native, /IMMUTABLE_CAPSULE_EFFECTS_OK/);
    assert.match(dynamic, /IMMUTABLE_CAPSULE_EFFECTS_OK/);

    const python = process.env.PYTHON ||
      (process.platform === "win32" ? "python" : "python3");
    const sourceLibrary = join(root, "src", "lib");
    const witnessDirectory = join(root, "tools", "native-kernel", "test");
    const pythonChecks = [
      "import sys",
      `sys.path.insert(0, ${JSON.stringify(sourceLibrary)})`,
      `sys.path.insert(0, ${JSON.stringify(witnessDirectory)})`,
      "from immutable_capsule_effects_witness import accumulate_prime_words",
      "output = [0]",
      "scratch = [0]",
      "assert accumulate_prime_words(output, [11, 17, 23], scratch, 3, 101)",
      "assert output == [51]",
      "assert scratch == [51]",
      "print('cpython-ok')",
      "",
    ].join("\n");
    assert.equal(run(python, ["-I", "-c", pythonChecks]), "cpython-ok");
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
