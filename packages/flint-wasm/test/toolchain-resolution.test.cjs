"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
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
const { dirname, join } = require("node:path");
const test = require("node:test");

const {
  canonicalJson,
  applyRecipeOverrides,
  explicitOverride,
  inspectToolchain,
  installCowasmWrappers,
  loadToolchainLock,
  pathsForCowasm,
  seedMirroredSources,
  sourceMirrorFilename,
  sourceMirrorObjects,
  toolchainLockDigest,
  verifySourcePins,
} = require("../scripts/wasm-toolchain.cjs");
const {
  ffpolySources,
  smalljacSources,
} = require("../scripts/build-smalljac-toolchain.cjs");

test("the committed toolchain lock is complete and content addressed", () => {
  const lock = loadToolchainLock();
  assert.equal(lock.schema, "sagejs.wasm-toolchain-lock/v1");
  assert.match(lock.cowasm.revision, /^[0-9a-f]{40}$/);
  assert.match(lock.cowasm.pnpmLockSha256, /^[0-9a-f]{64}$/);
  assert.match(lock.cowasm.preparedPnpmLockSha256, /^[0-9a-f]{64}$/);
  assert.notEqual(lock.cowasm.pnpmLockSha256, lock.cowasm.preparedPnpmLockSha256);
  assert.equal(lock.wasiSdk.version, "33.0");
  assert.equal(lock.libraries.flint.version, "3.6.0");
  assert.equal(lock.libraries.m4ri.version, "20260122");
  assert.equal(lock.libraries.ffpoly.version, "1.2.7");
  assert.equal(lock.libraries.smalljac.version, "4.1.3");
  assert.equal(lock.sourceMirror.schema, "sagejs.wasm-source-mirror/v1");
  assert.equal(lock.sourceMirror.objects.length, 12);
  assert.equal(sourceMirrorObjects(lock).filter((object) => object.platform).length, 1);
  assert.deepEqual(Object.keys(lock.libraries).sort(), [
    "arb", "ffpoly", "flint", "gmp", "m4ri", "mpc", "mpfr", "smalljac",
  ]);
  assert.match(toolchainLockDigest(lock), /^[0-9a-f]{64}$/);
  const differentlyOrdered = Object.fromEntries(Object.entries(lock).reverse());
  assert.equal(canonicalJson(differentlyOrdered), canonicalJson(lock));
  assert.equal(toolchainLockDigest(differentlyOrdered), toolchainLockDigest(lock));
});

test("the private source mirror seeds exact CoWasm and portable archives", () => {
  const parent = mkdtempSync(join(tmpdir(), "sagejs-wasm-source-mirror-test-"));
  const mirror = join(parent, "mirror");
  const cowasm = join(parent, "cowasm");
  const contents = Buffer.from("content-addressed native source\n");
  const digest = createHash("sha256").update(contents).digest("hex");
  const lock = {
    sourceMirror: {
      objects: [
        {
          id: "library",
          filename: "library.tar.xz",
          sha256: digest,
          cowasmTarget: "upstream/sources/library.tar.xz",
        },
        {
          id: "portable",
          filename: "portable.tar",
          sha256: digest,
          archiveEnvironment: "SAGEJS_TEST_PORTABLE_TARBALL",
        },
      ],
    },
  };
  const environmentBefore = process.env.SAGEJS_TEST_PORTABLE_TARBALL;
  try {
    for (const object of lock.sourceMirror.objects) {
      const filename = sourceMirrorFilename(mirror, object);
      mkdirSync(dirname(filename), { recursive: true });
      writeFileSync(filename, contents);
    }
    seedMirroredSources(cowasm, mirror, lock);
    assert.deepEqual(
      readFileSync(join(cowasm, "upstream", "sources", "library.tar.xz")),
      contents,
    );
    assert.equal(
      process.env.SAGEJS_TEST_PORTABLE_TARBALL,
      sourceMirrorFilename(mirror, lock.sourceMirror.objects[1]),
    );
  } finally {
    if (environmentBefore === undefined) delete process.env.SAGEJS_TEST_PORTABLE_TARBALL;
    else process.env.SAGEJS_TEST_PORTABLE_TARBALL = environmentBefore;
    rmSync(parent, { recursive: true, force: true });
  }
});

test("the reproducible release is pinned to the private source mirror", () => {
  const workflow = readFileSync(
    join(__dirname, "..", "..", "..", ".github", "workflows", "wasm-release.yml"),
    "utf8",
  );
  assert.match(workflow, /environment: sagejs-source-mirror/);
  assert.match(workflow, /source-mirror\.mjs fetch/);
  assert.match(workflow, /SAGEJS_WASM_SOURCE_MIRROR_DIR/);
  assert.doesNotMatch(workflow, /SAGEJS_WASM_SOURCE_MIRROR_DIR:.*runner\.temp/);
  assert.match(workflow, /packages\/flint-wasm\/toolchain\/lock\.json/);
  assert.doesNotMatch(workflow, /packages\/flint-wasm\/release\/toolchain-lock\.json/);
});

test("the portable smalljac recipe includes the reviewed genus-two closure", () => {
  const lock = loadToolchainLock();
  assert.equal(ffpolySources.length, 8);
  assert.equal(smalljacSources.length, 23);
  assert.ok(smalljacSources.includes("smalljac.c"));
  assert.ok(smalljacSources.includes("ecurve.c"));
  for (const required of [
    "smalljac_g23.c",
    "hecurve.c",
    "hecurve1.c",
    "hecurve2.c",
    "hecurve2_ladic.c",
    "jac.c",
    "jacorder.c",
  ]) {
    assert.ok(smalljacSources.includes(required), `missing ${required}`);
  }
  for (const excluded of ["smalljac_parallel.c", "smalljac_moments.c", "STgroups.c"]) {
    assert.equal(smalljacSources.includes(excluded), false);
  }
  assert.deepEqual(
    [lock.libraries.ffpoly.recipe, lock.libraries.smalljac.recipe],
    ["sagejs-portable-smalljac", "sagejs-portable-smalljac"],
  );
  for (const input of [
    "packages/flint/patches/ffpoly-portability.patch",
    "packages/flint/patches/smalljac-portability.patch",
    "packages/flint-wasm/scripts/build-smalljac-toolchain.cjs",
  ]) {
    assert.ok(lock.build.repositoryInputs.includes(input));
  }
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
  assert.equal(paths.libraries.smalljac.prefix, "/explicit/cowasm/sagemath/smalljac/dist/wasi-sdk");
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
      if (name === "arb" || dependency.required === false ||
          dependency.recipe === "sagejs-portable-smalljac") continue;
      const directory = join(temporary, "sagemath", name);
      mkdirSync(directory, { recursive: true });
      const expectedVersion = dependency.recipeBaseVersion ?? dependency.version;
      const expectedDigest = dependency.recipeBaseSourceSha256 ?? dependency.sourceSha256;
      writeFileSync(
        join(directory, "Makefile"),
        `VERSION = ${expectedVersion}\n` +
          (name === "gmp"
            ? "URL = https://gmplib.org/download/gmp/gmp-${VERSION}.tar.bz2\n"
            : "") +
          `TARBALL_SHA256 = ${expectedDigest}\n`,
      );
    }
    const sdkDirectory = join(temporary, "core", "build", "src", "wasi-sdk");
    mkdirSync(sdkDirectory, { recursive: true });
    writeFileSync(join(sdkDirectory, "Makefile"), `VERSION = ${lock.wasiSdk.version}\n`);
    assert.deepEqual(verifySourcePins(temporary, lock, { recipeBase: true }), []);
    applyRecipeOverrides(temporary, lock);
    assert.deepEqual(verifySourcePins(temporary, lock), []);
    assert.match(
      readFileSync(join(temporary, "sagemath", "gmp", "Makefile"), "utf8"),
      /URL = https:\/\/ftp\.gnu\.org\/gnu\/gmp\/gmp-\$\{VERSION\}\.tar\.bz2/,
    );
    const flintMakefile = join(temporary, "sagemath", "flint", "Makefile");
    writeFileSync(flintMakefile, readFileSync(flintMakefile, "utf8").replace("VERSION = 3.6.0", "VERSION = 0"));
    assert.match(verifySourcePins(temporary, lock).join("\n"), /flint: version 0 != 3.6.0/);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
