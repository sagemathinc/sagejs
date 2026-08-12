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
const { compileKernel } = require("../tools/native-kernel/compiler.cjs");

const root = resolve(__dirname, "..");
const fixture = join(root, "test", "fixtures", "native-resource-finalizer");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || root,
    encoding: "utf8",
    timeout: options.timeout || 60_000,
    ...options,
  });
  assert.equal(
    result.status,
    0,
    `command failed:\n${result.stdout}\n${result.stderr}`,
  );
  return result.stdout.trim();
}

function buildFixture(args = []) {
  const directory = mkdtempSync(
    join(tmpdir(), "sagejs-native-resource-finalizer-"),
  );
  writeFileSync(
    join(directory, "fixture.c"),
    readFileSync(join(fixture, "fixture.c.txt")),
  );
  writeFileSync(
    join(directory, "binding.gyp"),
    readFileSync(join(fixture, "binding.gyp")),
  );
  const nodeGyp = require.resolve("node-gyp/bin/node-gyp.js", {
    paths: [join(root, "packages", "flint")],
  });
  try {
    run(process.execPath, [nodeGyp, "rebuild", ...args], { cwd: directory });
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }
  const configuration = args.includes("--debug") ? "Debug" : "Release";
  return {
    addon: join(
      directory,
      "build",
      configuration,
      "native_resource_finalizer_fixture.node",
    ),
    directory,
  };
}

test("mixed resource and prime-field adapters compile together", async () => {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-mixed-finalizer-"));
  try {
    const sourcePath = join(directory, "mixed.py");
    const hostPath = join(root, "packages", "flint", "generated", "ffi_host.py");
    writeFileSync(sourcePath, readFileSync(hostPath, "utf8") + `

from sagejs.native import PrimeFieldDecomposition, PrimeFieldMatrix


def _prime_field_factor_fallback(source):
    return source


@native
def ffiMixedPrimeFieldFactor(
    source: PrimeFieldMatrix,
) -> PrimeFieldDecomposition:
    return _prime_field_factor_fallback(source)
`);
    const compiled = await compileKernel({
      sourcePath,
      cacheRoot: join(directory, "cache"),
    });
    const addon = require(compiled.addonPath);
    assert.equal(typeof addon.ffiMixedPrimeFieldFactor, "function");
    assert.equal(typeof addon.ffiFmpqMatrixCreate, "function");
    const result = JSON.parse(run(process.execPath, ["--expose-gc", "-e", `
      const assert = require("node:assert/strict");
      const addon = require(${JSON.stringify(compiled.addonPath)});
      let matrix = addon.ffiFmpqMatrixCreate(4n, 4n);
      assert.ok(addon.__sagejsFfiResourceExternalMemory(matrix) > 0n);
      addon.ffiFmpqMatrixClose(matrix);
      assert.equal(addon.__sagejsFfiResourceExternalMemory(matrix), 0n);
      addon.ffiFmpqMatrixClose(matrix);
      assert.equal(addon.__sagejsFfiResourceExternalMemory(matrix), 0n);
      assert.throws(() => addon.ffiFmpqMatrixRank(matrix), /closed/);
      matrix = null;
      global.gc();
      setImmediate(() => {
        global.gc();
        setImmediate(() => process.stdout.write(JSON.stringify({ ok: true })));
      });
    `]));
    assert.deepEqual(result, { ok: true });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("basic finalizers clear once and post holder cleanup", () => {
  const built = buildFixture();
  try {
    const output = run(process.execPath, ["--expose-gc", "-e", `
    const assert = require("node:assert/strict");
    const addon = require(${JSON.stringify(built.addon)});
    const exact = (value) => Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, Number(item)]),
    );
    let explicitlyClosed = addon.allocate(1024 * 1024);
    addon.close(explicitlyClosed);
    addon.close(explicitlyClosed);
    assert.deepEqual(exact(addon.stats()), {
      clears: 1,
      posts: 0,
      frees: 0,
      fallbackFrees: 0,
      activeBytes: 0,
    });
    explicitlyClosed = null;

    const count = 48;
    const bytes = 2 * 1024 * 1024;
    for (let index = 0; index < count; index += 1) addon.allocate(bytes);
    const expected = count + 1;
    let turns = 0;
    const poll = () => {
      global.gc();
      setImmediate(() => {
        turns += 1;
        const stats = exact(addon.stats());
        if (stats.frees === expected || turns === 100) {
          assert.deepEqual(stats, {
            clears: expected,
            posts: expected,
            frees: expected,
            fallbackFrees: 0,
            activeBytes: 0,
          });
          process.stdout.write(JSON.stringify({ ...stats, turns }));
        } else {
          poll();
        }
      });
    };
    poll();
  `]);
    const result = JSON.parse(output);
    assert.equal(result.clears, 49);
    assert.equal(result.activeBytes, 0);
  } finally {
    rmSync(built.directory, { recursive: true, force: true });
  }
});

test("worker termination clears native data without ordinary Node-API", () => {
  const built = buildFixture();
  try {
    const output = run(process.execPath, ["--expose-gc", "-e", `
    const assert = require("node:assert/strict");
    const { Worker } = require("node:worker_threads");
    const addonPath = ${JSON.stringify(built.addon)};
    const addon = require(addonPath);
    const count = 32;
    const worker = new Worker(\`
      const { parentPort } = require("node:worker_threads");
      const addon = require(\${JSON.stringify(addonPath)});
      globalThis.resources = Array.from(
        { length: \${count} }, () => addon.allocate(1024 * 1024),
      );
      parentPort.postMessage("ready");
    \`, { eval: true });
    worker.once("message", async () => {
      await worker.terminate();
      let turns = 0;
      const poll = () => {
        global.gc();
        setImmediate(() => {
          turns += 1;
          const stats = Object.fromEntries(Object.entries(addon.stats()).map(
            ([key, value]) => [key, Number(value)],
          ));
          if (stats.frees === count || turns === 100) {
            assert.equal(stats.clears, count);
            assert.equal(stats.frees, count);
            assert.equal(stats.activeBytes, 0);
            process.stdout.write(JSON.stringify({ ...stats, turns }));
          } else {
            poll();
          }
        });
      };
      poll();
    });
  `]);
    const result = JSON.parse(output);
    assert.equal(result.clears, 32);
    assert.equal(result.activeBytes, 0);
  } finally {
    rmSync(built.directory, { recursive: true, force: true });
  }
});

test("resource finalization survives ASan and UBSan lifecycle schedules", {
  skip: process.platform !== "linux" || process.arch !== "x64",
}, () => {
  const built = buildFixture(["--debug", "--", "-Dsagejs_sanitize=1"]);
  try {
    const compiler = process.env.CC || "cc";
    const asan = run(compiler, ["-print-file-name=libasan.so"]);
    const ubsan = run(compiler, ["-print-file-name=libubsan.so"]);
    assert.notEqual(asan, "libasan.so", "the compiler did not locate libasan");
    assert.notEqual(ubsan, "libubsan.so", "the compiler did not locate libubsan");
    const output = run("/lib64/ld-linux-x86-64.so.2", [
    "--preload",
    `${asan}:${ubsan}`,
    process.execPath,
    "--expose-gc",
    "-e",
    `
    const assert = require("node:assert/strict");
    const addon = require(${JSON.stringify(built.addon)});
    const count = 24;
    for (let index = 0; index < count; index += 1) {
      const explicit = addon.allocate(64 * 1024);
      if ((index & 1) === 0) addon.close(explicit);
    }
    let turns = 0;
    const poll = () => {
      global.gc();
      setImmediate(() => {
        turns += 1;
        const stats = Object.fromEntries(Object.entries(addon.stats()).map(
          ([key, value]) => [key, Number(value)],
        ));
        if (stats.frees === count || turns === 100) {
          assert.equal(stats.clears, count);
          assert.equal(stats.posts, count);
          assert.equal(stats.frees, count);
          assert.equal(stats.activeBytes, 0);
          process.stdout.write(JSON.stringify({ ...stats, turns }));
        } else {
          poll();
        }
      });
    };
    poll();
  `], {
    env: {
      ...process.env,
      ASAN_OPTIONS: "abort_on_error=1:detect_leaks=0:strict_string_checks=1",
      UBSAN_OPTIONS: "halt_on_error=1:print_stacktrace=1",
    },
  });
    const result = JSON.parse(output);
    assert.equal(result.frees, 24);
  } finally {
    rmSync(built.directory, { recursive: true, force: true });
  }
});
