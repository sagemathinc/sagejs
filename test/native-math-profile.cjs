"use strict";

const assert = require("node:assert/strict");
const {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
  symlinkSync,
} = require("node:fs");
const { execFileSync } = require("node:child_process");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const test = require("node:test");

const {
  CPU_NATIVE_PROFILE,
  PORTABLE_PROFILE,
  nativeMathBuildProfile,
  nativeMathBuildProvenance,
} = require("../scripts/native-math-profile.cjs");
const {
  nativeArtifactSpecs,
} = require("../scripts/native-worktree-cache.cjs");
const {
  createNativeDependencyReceipt,
  readNativeDependencyReceipt,
  validateNativeDependencyReceipt,
  writeNativeDependencyReceipt,
} = require("../scripts/native-dependency-receipt.cjs");

const compiler = (overrides = {}) => ({
  command: "cc",
  nativeFlag: null,
  nativeFlagSupported: false,
  target: "x86_64-unknown-linux-gnu",
  version: "cc test 1",
  ...overrides,
});

const profile = (overrides = {}) => nativeMathBuildProfile({
  arch: "x64",
  compiler: compiler(),
  cpu: { features: ["avx2", "bmi2"], model: "Test CPU" },
  endianness: "LE",
  environment: {},
  platform: "linux",
  requestedProfile: PORTABLE_PROFILE,
  ...overrides,
});

test("portable math builds remain the default and retain fat GMP", () => {
  const selected = nativeMathBuildProfile({
    arch: "x64",
    compiler: compiler(),
    endianness: "LE",
    environment: {},
    platform: "linux",
  });
  assert.equal(selected.requestedProfile, PORTABLE_PROFILE);
  assert.equal(selected.effectiveProfile, PORTABLE_PROFILE);
  assert.equal(selected.cpu, null);
  assert.ok(selected.buildOptions.gmp.configure.includes("--enable-fat"));
  assert.ok(!selected.buildOptions.flint.cflags.includes("-march=native"));
  assert.equal(
    selected.fingerprint,
    profile({ cpu: { features: [], model: "Another CPU" } }).fingerprint,
  );
  assert.throws(
    () => nativeMathBuildProfile({ environment: {
      SAGEJS_NATIVE_MATH_PROFILE: "surprise",
    } }),
    /must be portable or cpu-native/,
  );
});

test("cpu-native builds tune GMP and FLINT without uniform fat binaries", () => {
  const selected = profile({
    compiler: compiler({
      nativeFlag: "-march=native",
      nativeFlagSupported: true,
    }),
    requestedProfile: CPU_NATIVE_PROFILE,
  });
  assert.equal(selected.effectiveProfile, CPU_NATIVE_PROFILE);
  assert.deepEqual(selected.cpu.features, ["avx2", "bmi2"]);
  assert.ok(!selected.buildOptions.gmp.configure.includes("--enable-fat"));
  assert.ok(selected.buildOptions.gmp.cflags.includes("-march=native"));
  assert.ok(selected.buildOptions.flint.cflags.includes("-march=native"));
  assert.equal(selected.buildOptions.flint.fftSmall, "auto-detect");
});

test("native profile fingerprints cover CPU, ABI, compiler, versions, and options", () => {
  const baseline = profile({
    compiler: compiler({
      nativeFlag: "-march=native",
      nativeFlagSupported: true,
    }),
    requestedProfile: CPU_NATIVE_PROFILE,
  });
  const baselineCompiler = baseline.compilers.c;
  const variants = [
    profile({
      compiler: baselineCompiler,
      cpu: { features: ["avx2"], model: "Different CPU" },
      requestedProfile: CPU_NATIVE_PROFILE,
    }),
    profile({
      arch: "arm64",
      compiler: {
        ...baselineCompiler,
        nativeFlag: "-mcpu=native",
        target: "aarch64-unknown-linux-gnu",
      },
      requestedProfile: CPU_NATIVE_PROFILE,
    }),
    profile({
      compiler: { ...baselineCompiler, version: "cc test 2" },
      requestedProfile: CPU_NATIVE_PROFILE,
    }),
    profile({
      compiler: baselineCompiler,
      cxxCompiler: { ...baselineCompiler, version: "c++ test 2" },
      requestedProfile: CPU_NATIVE_PROFILE,
    }),
    profile(),
  ];
  for (const candidate of variants) {
    assert.notEqual(candidate.fingerprint, baseline.fingerprint);
  }
  assert.equal(baseline.dependencies.flint, "3.6.0");
  assert.ok(baseline.buildOptions.gmp.configure.length > 0);
});

test("Windows requests fall back explicitly to the portable profile", () => {
  const selected = profile({
    compiler: compiler(),
    platform: "win32",
    requestedProfile: CPU_NATIVE_PROFILE,
  });
  assert.equal(selected.requestedProfile, CPU_NATIVE_PROFILE);
  assert.equal(selected.effectiveProfile, PORTABLE_PROFILE);
  assert.match(selected.fallbackReason, /win32\/x64/);
  assert.ok(selected.buildOptions.gmp.configure.includes("--enable-fat"));
});

test("worktree dependency cache keys include the complete math profile", () => {
  const workspace = resolve(__dirname, "..");
  const identity = { native: { toolchain: "test" }, node: { abi: "test" } };
  const portable = profile();
  const native = profile({
    compiler: compiler({
      nativeFlag: "-march=native",
      nativeFlagSupported: true,
    }),
    requestedProfile: CPU_NATIVE_PROFILE,
  });
  const keys = (mathProfile) => new Map(
    nativeArtifactSpecs(workspace, { identity, mathProfile })
      .map(({ id, key }) => [id, key]),
  );
  const portableKeys = keys(portable);
  const nativeKeys = keys(native);
  assert.notEqual(
    portableKeys.get("flint-dependencies"),
    nativeKeys.get("flint-dependencies"),
  );
  assert.notEqual(
    portableKeys.get("fflas-dependencies"),
    nativeKeys.get("fflas-dependencies"),
  );
  assert.notEqual(
    portableKeys.get("graph-dependencies"),
    nativeKeys.get("graph-dependencies"),
  );
  assert.notEqual(
    portableKeys.get("m4ri-dependencies"),
    nativeKeys.get("m4ri-dependencies"),
  );
});

test("provenance distinguishes installed and selected build fingerprints", () => {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-native-profile-"));
  const prefix = join(directory, "prefix");
  const selected = profile();
  try {
    mkdirSync(prefix, { recursive: true });
    writeFileSync(
      join(prefix, ".sagejs-flint-dependencies.json"),
      `${JSON.stringify({ build: { mathBuildProfile: selected } })}\n`,
    );
    const matching = nativeMathBuildProvenance(directory, {
      arch: "x64",
      compiler: compiler(),
      endianness: "LE",
      environment: {},
      platform: "linux",
      prefix,
      requestedProfile: PORTABLE_PROFILE,
    });
    assert.equal(matching.installedMatchesSelected, true);
    const changed = nativeMathBuildProvenance(directory, {
      arch: "x64",
      compiler: compiler({ version: "cc test 2" }),
      endianness: "LE",
      environment: {},
      platform: "linux",
      prefix,
      requestedProfile: PORTABLE_PROFILE,
    });
    assert.equal(changed.installedMatchesSelected, false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("native profile CLI exposes human and structured provenance", () => {
  const root = resolve(__dirname, "..");
  const executable = join(root, "bin", "sagejs");
  const environment = {
    ...process.env,
    SAGEJS_NATIVE_MATH_PROFILE: PORTABLE_PROFILE,
  };
  const human = execFileSync(
    process.execPath,
    [executable, "native", "profile"],
    {
      cwd: root,
      encoding: "utf8",
      env: environment,
    },
  );
  assert.match(human, /Native mathematics dependency profile/);
  assert.match(human, /requested: portable/);
  const structured = JSON.parse(
    execFileSync(
      process.execPath,
      [executable, "native", "profile", "--json"],
      { cwd: root, encoding: "utf8", env: environment },
    ),
  );
  assert.equal(structured.selected.effectiveProfile, PORTABLE_PROFILE);
  assert.match(structured.selected.fingerprint, /^[a-f0-9]{64}$/);
  assert.equal(typeof structured.installedMatchesSelected, "boolean");
});

const receiptCompiler = {
  command: "cc",
  nativeFlag: null,
  nativeFlagSupported: false,
  target: "x86_64-unknown-linux-gnu",
  version: "cc receipt test",
};

function receiptProfile() {
  return nativeMathBuildProfile({
    arch: "x64",
    compiler: receiptCompiler,
    cxxCompiler: { ...receiptCompiler, command: "c++" },
    endianness: "LE",
    environment: {},
    platform: "linux",
  });
}

function receiptExpectation(overrides = {}) {
  return {
    build: {
      cflags: ["-O3", "-fPIC"],
      configure: ["--disable-shared", "--enable-static"],
    },
    dependency: {
      name: "example",
      sha256: "a".repeat(64),
      version: "1.2.3",
    },
    deployment: null,
    interface: { header: "include/example.h", sha256: "b".repeat(64) },
    mathProfile: receiptProfile(),
    package: "example",
    toolchain: { compiler: "cc receipt test" },
    ...overrides,
  };
}

function receiptFixture() {
  const root = mkdtempSync(join(tmpdir(), "sagejs-dependency-receipt-"));
  const prefix = join(root, "prefix");
  const stamp = join(prefix, ".sagejs-example-dependencies.json");
  mkdirSync(join(prefix, "include"), { recursive: true });
  mkdirSync(join(prefix, "lib"), { recursive: true });
  writeFileSync(join(prefix, "include", "example.h"), "header\n");
  writeFileSync(join(prefix, "lib", "libexample.a"), "archive\n");
  return { prefix, root, stamp };
}

test("dependency receipts bind declarations and every installed output byte", () => {
  const item = receiptFixture();
  try {
    const written = writeNativeDependencyReceipt(
      item.stamp,
      receiptExpectation(),
      item.prefix,
    );
    assert.match(written.identitySha256, /^[0-9a-f]{64}$/);
    assert.deepEqual(
      written.outputs.files.map(({ path }) => path),
      ["include/example.h", "lib/libexample.a"],
    );
    assert.deepEqual(
      readNativeDependencyReceipt(item.stamp, {
        expectation: receiptExpectation(),
        prefix: item.prefix,
      }),
      written,
    );

    writeFileSync(join(item.prefix, "lib", "libexample.a"), "tampered\n");
    assert.equal(
      readNativeDependencyReceipt(item.stamp, {
        expectation: receiptExpectation(),
        prefix: item.prefix,
      }),
      null,
    );
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});

test("receipt validation fails closed on profile, target, flags, and identity drift", () => {
  const item = receiptFixture();
  try {
    const receipt = createNativeDependencyReceipt(
      receiptExpectation(),
      item.prefix,
      item.stamp,
    );
    for (const changed of [
      receiptExpectation({ deployment: { macos: "14.0" } }),
      receiptExpectation({
        build: { cflags: ["-O2"], configure: ["--disable-shared"] },
      }),
      receiptExpectation({
        dependency: {
          name: "example",
          sha256: "c".repeat(64),
          version: "1.2.3",
        },
      }),
    ]) {
      assert.throws(
        () => validateNativeDependencyReceipt(receipt, {
          expectation: changed,
        }),
        /does not match the selected build/,
      );
    }
    const forged = structuredClone(receipt);
    forged.build.cflags = ["-Ofast"];
    assert.throws(
      () => validateNativeDependencyReceipt(forged),
      /receipt identity is invalid/,
    );
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});

test("output inventories are deterministic and permit only contained symlinks", () => {
  const first = receiptFixture();
  const second = receiptFixture();
  try {
    symlinkSync("../lib/libexample.a", join(first.prefix, "include", "alias.a"));
    symlinkSync("../lib/libexample.a", join(second.prefix, "include", "alias.a"));
    const a = createNativeDependencyReceipt(
      receiptExpectation(),
      first.prefix,
      first.stamp,
    );
    const b = createNativeDependencyReceipt(
      receiptExpectation(),
      second.prefix,
      second.stamp,
    );
    assert.equal(a.identitySha256, b.identitySha256);
    assert.equal(a.outputs.files[0].type, "symlink");
    rmSync(join(second.prefix, "include", "alias.a"));
    symlinkSync("../../outside", join(second.prefix, "include", "alias.a"));
    assert.throws(
      () => createNativeDependencyReceipt(
        receiptExpectation(),
        second.prefix,
        second.stamp,
      ),
      /symlink escapes its prefix/,
    );
  } finally {
    rmSync(first.root, { recursive: true, force: true });
    rmSync(second.root, { recursive: true, force: true });
  }
});

test("truncated and noncanonical receipt files are rejected without throwing", () => {
  const item = receiptFixture();
  try {
    writeFileSync(item.stamp, readFileSync(__filename).subarray(0, 20));
    assert.equal(readNativeDependencyReceipt(item.stamp), null);
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});
