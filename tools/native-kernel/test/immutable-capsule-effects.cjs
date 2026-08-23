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

test("prime-source buffers fail closed without effect metadata", async () => {
  const ir = await lowerSource(witnessSource, witnessPath);
  const fn = ir.functions.find((candidate) =>
    candidate.name === "accumulate_prime_words"
  );
  assert.equal(fn.kernelKind, "prime-field-source");
  assert.equal(fn.analysis.effects, undefined);

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
    /uint64NativeBuffer\(source, "source", true\)/,
  );
  assert.doesNotMatch(generated, /analysis\.effects/);

  const absentAnalysis = {
    ...ir,
    functions: ir.functions.map((candidate) =>
      candidate.name === fn.name ? { ...candidate, analysis: undefined } : candidate
    ),
  };
  assert.doesNotThrow(() => generateJavaScript(absentAnalysis, {
    cacheKey: "0123456789abcdef",
    sourceHash: "fedcba9876543210",
    moduleIdentity: "0123456789abcdef",
  }));
});

test("absent effect metadata preserves dynamic, native, and CPython results", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-capsule-effects-"));
  const executable = join(temporary, "immutable_capsule_effects_witness.py");
  const cacheRoot = join(temporary, "cache");
  const checks = String.raw`
import sagejs.runtime as runtime
from sagejs.native import is_compiled

compiled = is_compiled(accumulate_prime_words)
output = runtime.uint64_buffer([0]) if compiled else [0]
source = runtime.uint64_buffer([11, 17, 23]) if compiled else [11, 17, 23]
modulus = runtime.bigint(101) if compiled else 101
assert accumulate_prime_words(output, source, 3, modulus)
assert int(output[0]) == 51
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
      "assert accumulate_prime_words(output, [11, 17, 23], 3, 101)",
      "assert output == [51]",
      "print('cpython-ok')",
      "",
    ].join("\n");
    assert.equal(run(python, ["-I", "-c", pythonChecks]), "cpython-ok");
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
