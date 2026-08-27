"use strict";

const assert = require("node:assert/strict");
const {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");

const {
  canonicalJson,
  explicitRoot,
  inspectToolchain,
  loadCatalog,
  loadLock,
  pathsForRoot,
  selectedSources,
  sourceFilename,
  toolchainDigest,
  verifySource,
} = require("../scripts/toolchain.cjs");
const {
  compareReceipts,
  semanticReceipt,
} = require("../scripts/compare-receipts.cjs");
const {
  ffpolySources,
  reproduciblePathFlags,
  reproducibleSourceFlags,
  smalljacSources,
} = require("../recipes/smalljac.cjs");
const {
  compilerEnvironment,
  normalizeGeneratedMacro,
  subprocessEnvironment,
} = require("../recipes/libraries.cjs");

test("the v2 lock and neutral source catalog are complete", () => {
  const lock = loadLock();
  const catalog = loadCatalog(lock);
  assert.equal(lock.schema, "sagejs.wasm-toolchain-lock/v2");
  assert.equal(lock.wasiSdk.target, "wasm32-wasip1");
  assert.equal(lock.wasiSdk.version, "33.0");
  assert.equal(lock.canonicalBuilder, "linux-x64");
  assert.deepEqual(Object.keys(lock.libraries).sort(), [
    "arb", "ffpoly", "flint", "gmp", "m4ri", "mpc", "mpfr", "smalljac",
  ]);
  assert.equal(catalog.schema, "sagejs.source-catalog/v2");
  assert.equal(catalog.objects.length, 15);
  assert.equal(new Set(catalog.objects.map(({ id }) => id)).size, catalog.objects.length);
  for (const object of catalog.objects) {
    assert.match(object.sha256, /^[0-9a-f]{64}$/);
    assert.ok(object.upstreamUrls.every((url) => url.startsWith("https://")));
  }
  assert.match(toolchainDigest(lock, catalog), /^[0-9a-f]{64}$/);
});

test("the lock loader rejects unknown and malformed policy", () => {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-wasm-lock-v2-test-"));
  const original = JSON.parse(readFileSync(join(__dirname, "..", "lock.json"), "utf8"));
  const filename = join(directory, "lock.json");
  try {
    writeFileSync(filename, `${JSON.stringify({ ...original, legacyRoot: true })}\n`);
    assert.throws(() => loadLock(filename), /unexpected legacyRoot/);
    const malformed = structuredClone(original);
    malformed.build.jobs = 0;
    writeFileSync(filename, `${JSON.stringify(malformed)}\n`);
    assert.throws(() => loadLock(filename), /job count/);
    malformed.build.jobs = 8;
    malformed.libraries.gmp.prefix = "../host";
    writeFileSync(filename, `${JSON.stringify(malformed)}\n`);
    assert.throws(() => loadLock(filename), /library gmp is invalid/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("the selected toolchain contains only the SDK and mathematical sources", () => {
  const lock = loadLock();
  const catalog = loadCatalog(lock);
  const sources = selectedSources(lock, catalog, "linux-x64");
  assert.deepEqual(Object.keys(sources), [
    "ffpoly",
    "flint",
    "gmp-wasm",
    "m4ri",
    "mpc",
    "mpfr",
    "smalljac",
    "wasi-sdk-linux-x64",
  ]);
  assert.doesNotMatch(canonicalJson(sources), /git-bundle/i);
});

test("semantic paths depend only on the resolved Sage.js root", () => {
  const paths = pathsForRoot("/prepared/sagejs-wasm");
  assert.equal(paths.clang, "/prepared/sagejs-wasm/sdk/bin/clang");
  assert.equal(paths.sysroot, "/prepared/sagejs-wasm/sdk/share/wasi-sysroot");
  assert.equal(paths.libraries.flint.prefix, "/prepared/sagejs-wasm/prefixes/flint");
  assert.equal(paths.libraries.smalljac.prefix, "/prepared/sagejs-wasm/prefixes/smalljac");
});

test("the direct compiler policy is explicit and contains no compatibility driver", () => {
  const lock = loadLock();
  const paths = pathsForRoot("/prepared/sagejs-wasm", lock);
  const environment = compilerEnvironment(
    { lock, paths },
    "/temporary/upstream-source",
    { ABI: "standard" },
  );
  assert.match(environment.CC, /clang --target=wasm32-wasip1 --sysroot=/);
  assert.match(environment.CXX, /clang\+\+ --target=wasm32-wasip1 --sysroot=/);
  assert.match(environment.CFLAGS, /-ffile-prefix-map=.*=\/sagejs\/native-source/);
  assert.match(environment.CFLAGS, /-fdebug-prefix-map=.*=\/sagejs\/toolchain/);
  assert.match(environment.CFLAGS, /-fmacro-prefix-map=.*=\/sagejs\/wasm-toolchain/);
  assert.equal(environment.AR, "/prepared/sagejs-wasm/sdk/bin/llvm-ar");
  assert.equal(environment.RANLIB, "/prepared/sagejs-wasm/sdk/bin/llvm-ranlib");
  assert.equal(environment.SOURCE_DATE_EPOCH, "1704067200");
  assert.equal(environment.ABI, "standard");
});

test("generated compiler metadata is canonical and fails closed", () => {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-wasm-header-v2-test-"));
  const filename = join(directory, "generated.h");
  try {
    writeFileSync(filename, "#define BUILD_CC \"/temporary/clang\"\n");
    normalizeGeneratedMacro(filename, "BUILD_CC", "clang --target=wasm32-wasip1");
    assert.equal(
      readFileSync(filename, "utf8"),
      "#define BUILD_CC \"clang --target=wasm32-wasip1\"\n",
    );
    assert.throws(
      () => normalizeGeneratedMacro(filename, "MISSING", "value"),
      /exactly once/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("library recipes do not inherit ambient compiler or configure policy", () => {
  const environment = subprocessEnvironment({ CC: "/sdk/bin/clang" });
  assert.equal(environment.CC, "/sdk/bin/clang");
  assert.equal(
    environment.PATH,
    process.platform === "darwin"
      ? "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
      : "/usr/local/bin:/usr/bin:/bin",
  );
  assert.equal(environment.CONFIG_SITE, "/dev/null");
  assert.equal(environment.MAKEFLAGS, "");
  assert.equal(environment.PKG_CONFIG_PATH, "");
  assert.equal(environment.CPATH, "");
  assert.equal(environment.LIBRARY_PATH, "");
  for (const name of [
    "CFLAGS",
    "CPPFLAGS",
    "CXXFLAGS",
    "LD_LIBRARY_PATH",
    "DYLD_LIBRARY_PATH",
  ]) {
    assert.equal(Object.hasOwn(environment, name), false);
  }
});

test("only the new explicit root is recognized and incomplete roots fail closed", () => {
  assert.equal(explicitRoot({}), null);
  assert.equal(explicitRoot({ LEGACY_TOOLCHAIN_ROOT: "/legacy" }), null);
  assert.equal(explicitRoot({ SAGEJS_WASM_TOOLCHAIN_ROOT: "/new" }), "/new");
  const root = mkdtempSync(join(tmpdir(), "sagejs-wasm-toolchain-v2-test-"));
  try {
    const status = inspectToolchain({
      environment: { SAGEJS_WASM_TOOLCHAIN_ROOT: root },
    });
    assert.equal(status.ready, false);
    assert.equal(status.source, "explicit-override");
    assert.ok(status.problems.some((problem) => problem.includes("sdk/bin/clang")));
    assert.ok(status.problems.some((problem) => problem.includes("receipt")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("source objects are content addressed and tampering is rejected", () => {
  const root = mkdtempSync(join(tmpdir(), "sagejs-wasm-source-v2-test-"));
  const object = {
    id: "fixture",
    filename: "fixture.tar.xz",
    sha256: "69aa9bda028e0bdd0aa9643efb90f650374150ccafc9e51f6edf2a37f5bf23db",
  };
  const filename = sourceFilename(root, object);
  try {
    mkdirSync(join(filename, ".."), { recursive: true });
    writeFileSync(filename, "sagejs source fixture\n");
    assert.equal(verifySource(filename, object), filename);
    writeFileSync(filename, "tampered\n");
    assert.throws(() => verifySource(filename, object), /digest/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the portable ffpoly and smalljac closure remains reviewed", () => {
  assert.equal(ffpolySources.length, 8);
  assert.equal(smalljacSources.length, 23);
  for (const required of [
    "smalljac.c", "ecurve.c", "smalljac_g23.c", "hecurve.c", "hecurve1.c",
    "hecurve2.c", "hecurve2_ladic.c", "jac.c", "jacorder.c",
  ]) assert.ok(smalljacSources.includes(required), `missing ${required}`);
  for (const excluded of ["smalljac_parallel.c", "smalljac_moments.c", "STgroups.c"])
    assert.equal(smalljacSources.includes(excluded), false);
  assert.deepEqual(reproducibleSourceFlags("/tmp/source"), [
    "-ffile-prefix-map=/tmp/source=/sagejs/native-source",
    "-fdebug-prefix-map=/tmp/source=/sagejs/native-source",
    "-fmacro-prefix-map=/tmp/source=/sagejs/native-source",
  ]);
  assert.deepEqual(reproduciblePathFlags("/tmp/toolchain", "/sagejs/toolchain"), [
    "-ffile-prefix-map=/tmp/toolchain=/sagejs/toolchain",
    "-fdebug-prefix-map=/tmp/toolchain=/sagejs/toolchain",
    "-fmacro-prefix-map=/tmp/toolchain=/sagejs/toolchain",
  ]);
});

test("cross-host receipts require identical semantic libraries and headers", () => {
  const hash = "a".repeat(64);
  const receipt = (platform) => ({
    schema: "sagejs.wasm-prepared-toolchain/v2",
    lockDigest: platform === "linux-x64" ? "b".repeat(64) : "c".repeat(64),
    platform,
    canonicalBuilder: "linux-x64",
    wasiSdk: {
      version: "33.0",
      source: `wasi-sdk-${platform}`,
      sourceSha256: platform === "linux-x64" ? "d".repeat(64) : "e".repeat(64),
      clangVersion: "clang version 22.1.0",
      clangSha256: platform === "linux-x64" ? "f".repeat(64) : "0".repeat(64),
    },
    libraries: {
      gmp: {
        version: "6.2.1",
        source: "gmp-wasm",
        sourceSha256: hash,
        archiveSha256: hash,
        headersSha256: hash,
      },
    },
    commands: [],
  });
  const reference = receipt("linux-x64");
  const candidate = receipt("darwin-arm64");
  assert.deepEqual(semanticReceipt(candidate), semanticReceipt(reference));
  assert.deepEqual(compareReceipts(reference, [candidate]).compared, [{
    platform: "darwin-arm64",
    lockDigest: "c".repeat(64),
  }]);
  candidate.libraries.gmp.headersSha256 = "1".repeat(64);
  assert.throws(
    () => compareReceipts(reference, [candidate]),
    /semantic toolchain receipt differs for darwin-arm64/,
  );
});
