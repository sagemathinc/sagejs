"use strict";

const assert = require("node:assert/strict");
const {
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");

const {
  canonicalJson,
  applyRecipeOverrides,
  explicitOverride,
  inspectToolchain,
  installCowasmWrappers,
  loadToolchainLock,
  pathsForCowasm,
  toolchainLockDigest,
  verifySourcePins,
} = require("../scripts/wasm-toolchain.cjs");

test("the committed toolchain lock is complete and content addressed", () => {
  const lock = loadToolchainLock();
  assert.equal(lock.schema, "sagejs.wasm-toolchain-lock/v1");
  assert.match(lock.cowasm.revision, /^[0-9a-f]{40}$/);
  assert.equal(lock.wasiSdk.version, "33.0");
  assert.equal(lock.libraries.flint.version, "3.6.0");
  assert.equal(lock.libraries.m4ri.version, "20260122");
  assert.deepEqual(Object.keys(lock.libraries).sort(), ["arb", "flint", "gmp", "m4ri", "mpc", "mpfr"]);
  assert.match(toolchainLockDigest(lock), /^[0-9a-f]{64}$/);
  const differentlyOrdered = Object.fromEntries(Object.entries(lock).reverse());
  assert.equal(canonicalJson(differentlyOrdered), canonicalJson(lock));
  assert.equal(toolchainLockDigest(differentlyOrdered), toolchainLockDigest(lock));
});

test("prepared compiler wrappers survive an atomic checkout rename", () => {
  const parent = mkdtempSync(join(tmpdir(), "sagejs-wasm-wrappers-test-"));
  const staged = join(parent, ".cowasm-prepare");
  const published = join(parent, "cowasm");
  const lock = loadToolchainLock();
  try {
    for (const sourceName of Object.values(lock.build.wrapperSources)) {
      const filename = join(staged, ...sourceName.split("/"));
      mkdirSync(join(filename, ".."), { recursive: true });
      writeFileSync(filename, "#!/usr/bin/env python3\n");
    }
    installCowasmWrappers(staged, lock);
    for (const name of Object.keys(lock.build.wrapperSources)) {
      const filename = join(staged, "bin", name);
      assert.equal(lstatSync(filename).isSymbolicLink(), true);
      assert.equal(readlinkSync(filename).startsWith("/"), false);
    }
    require("node:fs").renameSync(staged, published);
    for (const name of Object.keys(lock.build.wrapperSources)) {
      assert.equal(readFileSync(join(published, "bin", name), "utf8"), "#!/usr/bin/env python3\n");
    }
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test("toolchain paths derive only from the resolved root", () => {
  const lock = loadToolchainLock();
  const paths = pathsForCowasm("/explicit/cowasm", lock);
  assert.equal(paths.clang, "/explicit/cowasm/core/build/build/wasi-sdk/dist/wasi-sdk-next/native/bin/clang");
  assert.equal(paths.libraries.flint.prefix, "/explicit/cowasm/sagemath/flint/dist/wasi-sdk");
  assert.equal(paths.libraries.m4ri.prefix, "/explicit/cowasm/sagemath/m4ri/dist/wasi-sdk");
});

test("the local override is explicit and conflicting legacy configuration fails", () => {
  assert.equal(explicitOverride({}), null);
  assert.equal(explicitOverride({ SAGEJS_WASM_TOOLCHAIN_ROOT: "/a" }), "/a");
  assert.equal(explicitOverride({ SAGEJS_COWASM_ROOT: "/a" }), "/a");
  assert.throws(
    () => explicitOverride({ SAGEJS_WASM_TOOLCHAIN_ROOT: "/a", SAGEJS_COWASM_ROOT: "/b" }),
    /name different toolchains/,
  );
});

test("an explicit unprepared checkout fails closed without ambient discovery", () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-wasm-toolchain-test-"));
  try {
    const status = inspectToolchain({
      environment: { SAGEJS_WASM_TOOLCHAIN_ROOT: temporary },
    });
    assert.equal(status.source, "explicit-override");
    assert.equal(status.root, temporary);
    assert.equal(status.ready, false);
    assert.ok(status.problems.some((problem) => problem.includes("checkout")));
    assert.ok(status.problems.some((problem) => problem.includes("WASI SDK clang")));
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("source dependency pin verification detects exact version and digest drift", () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-wasm-pins-test-"));
  const lock = loadToolchainLock();
  try {
    for (const [name, dependency] of Object.entries(lock.libraries)) {
      if (name === "arb" || dependency.required === false) continue;
      const directory = join(temporary, "sagemath", name);
      mkdirSync(directory, { recursive: true });
      const expectedVersion = dependency.recipeBaseVersion ?? dependency.version;
      const expectedDigest = dependency.recipeBaseSourceSha256 ?? dependency.sourceSha256;
      writeFileSync(
        join(directory, "Makefile"),
        `VERSION = ${expectedVersion}\nTARBALL_SHA256 = ${expectedDigest}\n`,
      );
    }
    const sdkDirectory = join(temporary, "core", "build", "src", "wasi-sdk");
    mkdirSync(sdkDirectory, { recursive: true });
    writeFileSync(join(sdkDirectory, "Makefile"), `VERSION = ${lock.wasiSdk.version}\n`);
    assert.deepEqual(verifySourcePins(temporary, lock, { recipeBase: true }), []);
    applyRecipeOverrides(temporary, lock);
    assert.deepEqual(verifySourcePins(temporary, lock), []);
    const flintMakefile = join(temporary, "sagemath", "flint", "Makefile");
    writeFileSync(flintMakefile, readFileSync(flintMakefile, "utf8").replace("VERSION = 3.6.0", "VERSION = 0"));
    assert.match(verifySourcePins(temporary, lock).join("\n"), /flint: version 0 != 3.6.0/);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
