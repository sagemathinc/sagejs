"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const { generateHostCore } = require("../c-backend.cjs");
const { compileKernel } = require("../compiler.cjs");
const { lowerSource } = require("../ir.cjs");
const {
  wordPromotionCapabilities,
} = require("../word-backend.cjs");

const witnessPath = join(__dirname, "word_helper_chain_witness.py");
const witnessSource = readFileSync(witnessPath, "utf8");
const root = resolve(__dirname, "../../..");
const sagejs = join(root, "bin", "sagejs");

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

function emittedFunction(source, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(
    `(?:SAGEJS_WORD_INLINE|static) int word_${escaped}\\([^;]+\\)\\n\\{`,
  ).exec(source);
  assert.ok(match, `missing emitted word function ${name}`);
  const start = match.index;
  const next = source.indexOf("\n}\n", start);
  assert.notEqual(next, -1, `unterminated emitted word function ${name}`);
  return source.slice(start, next + 3);
}

test("fixed-width mutating helpers stay transitively in the word core", async () => {
  const ir = await lowerSource(witnessSource, witnessPath);
  const capabilities = wordPromotionCapabilities(ir.functions);
  assert.equal(capabilities.get("clear_fixed_span"), false);
  assert.equal(capabilities.get("copy_fixed_span"), false);

  const copy = ir.functions.find((fn) => fn.name === "copy_fixed_span");
  assert.equal(copy.analysis.effects.replaySafe, false);
  assert.deepEqual(copy.analysis.effects.externalWrites, ["storage"]);

  const core = generateHostCore(ir, { moduleIdentity: "89abcdef01234567" });
  assert.equal(core.audit.isolated, true);
  assert.equal(core.audit.hostCallbacks, 0);
  const emittedCopy = emittedFunction(core.source, "copy_fixed_span");
  assert.match(emittedCopy, /word_clear_fixed_span\(/);
  assert.doesNotMatch(emittedCopy, /return SAGEJS_WORD_PROMOTE/);
  assert.doesNotMatch(emittedCopy, /native_clear_fixed_span|mpz_/);
});

test("fixed-width helper chaining agrees in dynamic, native, and CPython", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-word-helper-chain-"));
  const cacheRoot = join(temporary, "cache");
  const executable = join(temporary, "word_helper_chain_witness.py");
  const checks = String.raw`
import sagejs.runtime as runtime
from sagejs.native import is_compiled

compiled = is_compiled(transitive_word_helper_witness)
storage = runtime.uint64_buffer(list(range(32))) if compiled else list(range(32))
accepted = transitive_word_helper_witness(storage, runtime.bigint(101) if compiled else 101)
assert accepted
assert [int(storage[index]) for index in range(20)] == [16, 17, 18, 19] + [0] * 12 + [16, 17, 18, 19]
print("compiled=" + str(compiled))
print("WORD_HELPER_CHAIN_OK")
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
    assert.match(native, /WORD_HELPER_CHAIN_OK/);
    assert.match(dynamic, /WORD_HELPER_CHAIN_OK/);

    const python = process.env.PYTHON ||
      (process.platform === "win32" ? "python" : "python3");
    const cpython = [
      "import sys",
      `sys.path.insert(0, ${JSON.stringify(join(root, "src", "lib"))})`,
      `sys.path.insert(0, ${JSON.stringify(__dirname)})`,
      "from word_helper_chain_witness import transitive_word_helper_witness",
      "storage = list(range(32))",
      "assert transitive_word_helper_witness(storage, 101)",
      "assert storage[:20] == [16, 17, 18, 19] + [0] * 12 + [16, 17, 18, 19]",
      "print('cpython-ok')",
      "",
    ].join("\n");
    assert.equal(run(python, ["-I", "-c", cpython]), "cpython-ok");
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
