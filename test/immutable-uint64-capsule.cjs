"use strict";

const assert = require("node:assert/strict");
const {
  mkdtempSync,
  readFileSync,
  rmSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const { generateHostCore } = require("../tools/native-kernel/c-backend.cjs");
const { compileKernel } = require("../tools/native-kernel/compiler.cjs");
const { lowerSource } = require("../tools/native-kernel/ir.cjs");
const capsuleRuntime = require(
  "../dist/tools/immutable-uint64-capsule.js",
);

const root = resolve(__dirname, "..");
const sagejs = join(root, "bin", "sagejs");
const witnessPath = join(
  root,
  "tools",
  "native-kernel",
  "test",
  "immutable_uint64_capsule_witness.py",
);
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

function boundCapsule(values = [11n, 17n, 23n]) {
  const owner = Object.freeze({ identity: "neutral-owner" });
  const capsule = capsuleRuntime.createImmutableUInt64Capsule(
    values,
    owner,
    "neutral-model/v1",
    "uint64-row/v1",
    3,
  );
  return { owner, capsule };
}

test("immutable uint64 capsules hide owned storage and enforce exact binding", () => {
  assert.equal(
    Reflect.has(capsuleRuntime, "borrowImmutableUInt64Lease"),
    false,
  );
  const source = new BigUint64Array([11n, 17n, 23n]);
  const { owner, capsule } = boundCapsule(source);
  source[0] = 99n;

  assert.equal(Object.getPrototypeOf(capsule), null);
  assert.equal(Object.isFrozen(capsule), true);
  assert.deepEqual(Reflect.ownKeys(capsule), []);
  assert.equal(Reflect.get(capsule, "length"), undefined);
  assert.equal(Reflect.get(capsule, "0"), undefined);
  assert.equal(Reflect.set(capsule, "0", 1n), false);

  const copy = capsuleRuntime.copyImmutableUInt64Capsule(
    capsule,
    owner,
    "neutral-model/v1",
    "uint64-row/v1",
    3,
  );
  assert.deepEqual([...copy], [11n, 17n, 23n]);
  copy[0] = 101n;
  assert.deepEqual(
    [...capsuleRuntime.copyImmutableUInt64Capsule(
      capsule,
      owner,
      "neutral-model/v1",
      "uint64-row/v1",
      3,
    )],
    [11n, 17n, 23n],
  );

  for (const binding of [
    [Object.freeze({}), "neutral-model/v1", "uint64-row/v1", 3],
    [owner, "other-model/v1", "uint64-row/v1", 3],
    [owner, "neutral-model/v1", "other-format/v1", 3],
    [owner, "neutral-model/v1", "uint64-row/v1", 4],
  ]) {
    assert.throws(
      () => capsuleRuntime.authorizeImmutableUInt64Capsule(
        capsule,
        ...binding,
      ),
      /binding mismatch/,
    );
  }
  assert.throws(
    () => capsuleRuntime.authorizeImmutableUInt64Capsule(
      Object.freeze(Object.create(null)),
      owner,
      "neutral-model/v1",
      "uint64-row/v1",
      3,
    ),
    /not an immutable uint64 capsule/,
  );
});

test("capsule owners are write-once and reject forgeries or transplants", () => {
  const first = boundCapsule();
  assert.throws(
    () => capsuleRuntime.createImmutableUInt64Capsule(
      [29n, 31n, 37n],
      first.owner,
      "neutral-model/v1",
      "uint64-row/v1",
      3,
    ),
    /owner is already registered/,
  );
  assert.deepEqual(
    [...capsuleRuntime.copyImmutableUInt64Capsule(
      first.capsule,
      first.owner,
      "neutral-model/v1",
      "uint64-row/v1",
      3,
    )],
    [11n, 17n, 23n],
  );

  const secondOwner = Object.freeze({ identity: "second-owner" });
  const secondCapsule = capsuleRuntime.createImmutableUInt64Capsule(
    [29n, 31n, 37n],
    secondOwner,
    "second-model/v1",
    "second-row/v1",
    3,
  );
  assert.throws(
    () => capsuleRuntime.authorizeImmutableUInt64Capsule(
      secondCapsule,
      first.owner,
      "neutral-model/v1",
      "uint64-row/v1",
      3,
    ),
    /binding mismatch/,
  );
  assert.throws(
    () => capsuleRuntime.copyImmutableUInt64Capsule(
      first.capsule,
      secondOwner,
      "second-model/v1",
      "second-row/v1",
      3,
    ),
    /binding mismatch/,
  );
  assert.throws(
    () => capsuleRuntime.copyImmutableUInt64Capsule(
      Object.freeze(Object.create(null)),
      first.owner,
      "neutral-model/v1",
      "uint64-row/v1",
      3,
    ),
    /not an immutable uint64 capsule/,
  );

  const recoverableOwner = Object.freeze({ identity: "recoverable-owner" });
  assert.throws(
    () => capsuleRuntime.createImmutableUInt64Capsule(
      [-1n],
      recoverableOwner,
      "recoverable-model/v1",
      "recoverable-row/v1",
      1,
    ),
    /outside unsigned 64-bit/,
  );
  const recovered = capsuleRuntime.createImmutableUInt64Capsule(
    [41n],
    recoverableOwner,
    "recoverable-model/v1",
    "recoverable-row/v1",
    1,
  );
  assert.deepEqual(
    [...capsuleRuntime.copyImmutableUInt64Capsule(
      recovered,
      recoverableOwner,
      "recoverable-model/v1",
      "recoverable-row/v1",
      1,
    )],
    [41n],
  );

  const reentrantOwner = Object.freeze({ identity: "reentrant-owner" });
  let reentrantAttempts = 0;
  const reentrantSource = Object.create(null);
  Object.defineProperty(reentrantSource, "length", {
    get() {
      reentrantAttempts += 1;
      return capsuleRuntime.createImmutableUInt64Capsule(
        [43n],
        reentrantOwner,
        "reentrant-model/v1",
        "reentrant-row/v1",
        1,
      );
    },
  });
  assert.throws(
    () => capsuleRuntime.createImmutableUInt64Capsule(
      reentrantSource,
      reentrantOwner,
      "reentrant-model/v1",
      "reentrant-row/v1",
      1,
    ),
    /owner is already registered/,
  );
  assert.equal(reentrantAttempts, 1);
  assert.doesNotThrow(() => capsuleRuntime.createImmutableUInt64Capsule(
    [43n],
    reentrantOwner,
    "reentrant-model/v1",
    "reentrant-row/v1",
    1,
  ));
});

test("authorized leases borrow read-only storage in native kernels", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-immutable-u64-"));
  try {
    const compiled = await compileKernel({
      sourcePath: witnessPath,
      cacheRoot: join(temporary, "cache"),
    });
    assert.ok(compiled.addonPath);
    const wrapper = capsuleRuntime.configureImmutableUInt64KernelWrapper(
      require(compiled.modulePath),
    );
    const { owner, capsule } = boundCapsule();
    const lease = capsuleRuntime.authorizeImmutableUInt64Capsule(
      capsule,
      owner,
      "neutral-model/v1",
      "uint64-row/v1",
      3,
    );
    assert.equal(Object.getPrototypeOf(lease), null);
    assert.deepEqual(Reflect.ownKeys(lease), []);
    assert.equal(Object.isFrozen(lease), true);

    const nativeOutput = new BigUint64Array(1);
    assert.equal(
      wrapper.immutable_uint64_checksum.tagged(nativeOutput, lease, 3n),
      true,
    );
    assert.equal(nativeOutput[0], 51n);

    const dynamicOutput = [0];
    const copied = capsuleRuntime.copyImmutableUInt64Capsule(
      capsule,
      owner,
      "neutral-model/v1",
      "uint64-row/v1",
      3,
    );
    assert.equal(
      wrapper.immutable_uint64_checksum.javascript(
        dynamicOutput,
        copied,
        3n,
      ),
      true,
    );
    assert.equal(dynamicOutput[0], 51n);
    assert.throws(
      () => wrapper.immutable_uint64_checksum.javascript(
        [0],
        lease,
        3n,
      ),
      /dynamic fallback requires an owned copy/,
    );

    assert.throws(
      () => wrapper.immutable_uint64_mutation_probe.tagged(lease, 7n),
      /read-only/,
    );
    assert.throws(
      () => wrapper.immutable_uint64_checksum(
        new BigUint64Array(1),
        Object.freeze(Object.create(null)),
        3n,
      ),
      /source must/,
    );

    const ir = await lowerSource(witnessSource, witnessPath);
    const core = generateHostCore(ir, { moduleIdentity: "13579bdf2468ace0" });
    assert.equal(core.audit.isolated, true);
    assert.equal(core.audit.hostCallbacks, 0);
    const wrapperSource = readFileSync(compiled.modulePath, "utf8");
    assert.match(wrapperSource, /immutableUInt64LeaseBorrow/);
    assert.match(wrapperSource, /immutable UInt64Buffer lease is read-only/);
    assert.match(
      wrapperSource,
      /__sagejsConfigureImmutableUInt64Capsules/,
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("capsule storage is collectible after capsules and leases expire", () => {
  const runtimePath = require.resolve(
    "../dist/tools/immutable-uint64-capsule.js",
  );
  const script = String.raw`
const runtime = require(${JSON.stringify(runtimePath)});

function allocate() {
  const owner = Object.freeze({});
  const capsule = runtime.createImmutableUInt64Capsule(
    [1n, 2n, 3n], owner, "gc-model/v1", "gc-row/v1", 1);
  const lease = runtime.authorizeImmutableUInt64Capsule(
    capsule, owner, "gc-model/v1", "gc-row/v1", 1);
  return [new WeakRef(owner), new WeakRef(capsule), new WeakRef(lease)];
}

(async () => {
  const references = allocate();
  for (let attempt = 0; attempt < 400; attempt += 1) {
    await new Promise((resolve) => setImmediate(resolve));
    global.gc();
    if (references.every((reference) => reference.deref() === undefined)) {
      process.stdout.write("COLLECTED\n");
      return;
    }
    new BigUint64Array(4096);
  }
  throw new Error("immutable capsule storage was retained");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
`;
  assert.equal(run(process.execPath, ["--expose-gc", "-e", script]), "COLLECTED");
});

test("mathematical Python uses bound copies without exposing storage", () => {
  const source = String.raw`
import sagejs.runtime as runtime

owner = object()
capsule = runtime.immutable_uint64_capsule(
    [11, 17, 23], owner, "python-model/v1", "python-row/v1", 3
)
copy = runtime.immutable_uint64_capsule_copy(
    capsule, owner, "python-model/v1", "python-row/v1", 3
)
assert [int(copy[index]) for index in range(3)] == [11, 17, 23]
copy[0] = runtime.bigint(99)
fresh = runtime.immutable_uint64_capsule_copy(
    capsule, owner, "python-model/v1", "python-row/v1", 3
)
assert [int(fresh[index]) for index in range(3)] == [11, 17, 23]

lease = runtime.immutable_uint64_capsule_lease(
    capsule, owner, "python-model/v1", "python-row/v1", 3
)
assert "11" not in repr(capsule)
assert "11" not in repr(lease)
print("PYTHON_CAPSULE_OPAQUE_OK")
`;
  assert.match(
    run(process.execPath, [sagejs, "--python"], { input: source }),
    /PYTHON_CAPSULE_OPAQUE_OK/,
  );
});

test("mathematical Python catches capsule boundary errors", () => {
  const source = String.raw`
import sagejs.runtime as runtime

owner = object()
capsule = runtime.immutable_uint64_capsule(
    [11, 17, 23], owner, "catch-model/v1", "catch-row/v1", 3
)
caught = []
try:
    runtime.immutable_uint64_capsule_copy(
        capsule, owner, "wrong-model/v1", "catch-row/v1", 3
    )
except ValueError:
    caught.append("binding")
try:
    runtime.immutable_uint64_capsule(
        [29], owner, "catch-model/v1", "catch-row/v1", 1
    )
except ValueError:
    caught.append("duplicate")
try:
    runtime.immutable_uint64_capsule(
        None, object(), "catch-model/v1", "catch-row/v1", 0
    )
except TypeError:
    caught.append("source")
try:
    runtime.immutable_uint64_capsule_lease(
        None, owner, "catch-model/v1", "catch-row/v1", 3
    )
except (TypeError, ValueError):
    caught.append("capsule")
assert caught == ["binding", "duplicate", "source", "capsule"]
print("PYTHON_CAPSULE_ERRORS_OK")
`;
  assert.match(
    run(process.execPath, [sagejs, "--python"], { input: source }),
    /PYTHON_CAPSULE_ERRORS_OK/,
  );
});

test("neutral witness remains ordinary CPython", () => {
  const python = process.env.PYTHON ||
    (process.platform === "win32" ? "python" : "python3");
  const sourceLibrary = join(root, "src", "lib");
  const witnessDirectory = join(root, "tools", "native-kernel", "test");
  const checks = [
    "import sys",
    `sys.path.insert(0, ${JSON.stringify(sourceLibrary)})`,
    `sys.path.insert(0, ${JSON.stringify(witnessDirectory)})`,
    "from immutable_uint64_capsule_witness import *",
    "output = [0]",
    "assert immutable_uint64_checksum(output, [11, 17, 23], 3)",
    "assert output == [51]",
    "probe = [0]",
    "assert immutable_uint64_mutation_probe(probe, 7)",
    "assert probe == [7]",
    "print('cpython-ok')",
    "",
  ].join("\n");
  assert.equal(run(python, ["-I", "-c", checks]), "cpython-ok");
});
