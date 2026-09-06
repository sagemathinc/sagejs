// sagejs-test-tier: specialized
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const test = require("node:test");

const { compileKernel } = require("../compiler.cjs");

const root = resolve(__dirname, "../../..");

const source = String.raw`
from sagejs.native import NativeExactArena, native, uint64


@native
def checkpoint_exhaustion_witness(
    value: int,
    scale: int,
    memory_limit: uint64,
    temporary_limit: uint64,
) -> int:
    with NativeExactArena(memory_limit, temporary_limit) as arena:
        values = arena.integer_vector(1, 0)
        values[0] = value
        values.addmul(0, scale, scale)
        return values[0]
`;

test("checkpoint exhaustion is catchable as Python MemoryError", {
  timeout: 120_000,
}, async (t) => {
  const temporary = mkdtempSync(
    join(tmpdir(), "sagejs-native-exhaustion-bridge-"),
  );
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  const sourcePath = join(temporary, "checkpoint_exhaustion_witness.py");
  const scriptPath = join(temporary, "catch_checkpoint_exhaustion.sage");
  writeFileSync(sourcePath, source);
  const compiled = await compileKernel({
    sourcePath,
    cacheRoot: join(temporary, "cache"),
  });
  const wrapper = readFileSync(compiled.modulePath, "utf8");
  const memoryMappingStart = wrapper.lastIndexOf(
    'if (message.includes("NativeIntegerVector memory limit")',
  );
  assert.notEqual(memoryMappingStart, -1);
  const memoryMapping = wrapper.slice(
    memoryMappingStart,
    wrapper.indexOf(
      'if (message.includes("NativeIntegerVector index")',
      memoryMappingStart,
    ),
  );
  assert.match(
    memoryMapping,
    /NativeExactArena checkpoint allocation failed/,
  );
  assert.match(
    memoryMapping,
    /NativeExactArena temporary capacity exhausted/,
  );
  assert.match(memoryMapping, /nativeRaise\("MemoryError", message\)/);

  writeFileSync(scriptPath, String.raw`
kernel = require(${JSON.stringify(compiled.modulePath)})

try:
    kernel.checkpoint_exhaustion_witness.fmpz(
        1, 1 << 1048576, 32 << 20, 1
    )
except BaseException as error:
    print(type(error).__name__)
    print(isinstance(error, MemoryError))
    print(str(error))
else:
    raise AssertionError("undersized temporary arena unexpectedly passed")
`);
  const result = spawnSync(
    process.execPath,
    [join(root, "bin", "sagejs"), scriptPath],
    {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        SAGEJS_HYPERELLIPTIC_AUTO_RECEIPT_POLICY: "off",
        SAGEJS_NATIVE_REQUIRED: "1",
      },
      timeout: 120_000,
    },
  );
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.deepEqual(result.stdout.trim().split("\n"), [
    "MemoryError",
    "True",
    "NativeExactArena temporary capacity exhausted after retry",
  ]);
});
