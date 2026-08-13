"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  cmakeOptions,
  expectedBuild,
  igraphLtoSetting,
  reusableCmakeReceipt,
  selectedEnvironment,
} = require("../scripts/build-deps.cjs");
const {
  nativeMathBuildProfile,
} = require("../../../scripts/native-math-profile.cjs");
const {
  commandIdentity,
  nativeDependencyExpectation,
} = require("../../../scripts/native-dependency-receipt.cjs");

function profile(platform, arch = "x64") {
  const compiler = {
    command: "cc",
    nativeFlag: null,
    nativeFlagSupported: false,
    target: `${arch}-test-${platform}`,
    version: "test compiler",
  };
  return nativeMathBuildProfile({
    arch,
    compiler,
    cxxCompiler: { ...compiler, command: "c++" },
    endianness: "LE",
    environment: {},
    platform,
  });
}

test("igraph dependency LTO remains compatible with the generated linker", () => {
  assert.equal(igraphLtoSetting("win32"), "OFF");
  assert.equal(igraphLtoSetting("linux"), "ON");
  assert.equal(igraphLtoSetting("darwin"), "ON");

  assert.ok(cmakeOptions("win32").includes("-DIGRAPH_ENABLE_LTO=OFF"));
  assert.ok(cmakeOptions("linux").includes("-DIGRAPH_ENABLE_LTO=ON"));
});

test("igraph declaration binds inherited CMake and linker environment", () => {
  const baseline = expectedBuild({
    arch: "x64",
    environment: { CMAKE_GENERATOR: "Ninja", LDFLAGS: "-Wl,baseline" },
    mathProfile: profile("linux"),
    platform: "linux",
  });
  const changed = expectedBuild({
    arch: "x64",
    environment: {
      CMAKE_GENERATOR: "Unix Makefiles",
      LDFLAGS: "-Wl,changed",
    },
    mathProfile: profile("linux"),
    platform: "linux",
  });
  assert.notDeepEqual(baseline.build.environment, changed.build.environment);
  assert.equal(changed.build.environment.CMAKE_GENERATOR, "Unix Makefiles");
  assert.equal(changed.build.environment.LDFLAGS, "-Wl,changed");
  assert.equal(selectedEnvironment({}).CMAKE_TOOLCHAIN_FILE, null);
});

test("igraph rejects unbounded install and toolchain indirection", () => {
  assert.throws(
    () => selectedEnvironment({ DESTDIR: "/tmp/stage" }),
    /DESTDIR is unsupported/,
  );
  assert.throws(
    () => selectedEnvironment({ CMAKE_TOOLCHAIN_FILE: "/tmp/toolchain.cmake" }),
    /CMAKE_TOOLCHAIN_FILE is unsupported/,
  );
});

test("igraph receipt declaration binds profile, target, source, and flags", () => {
  const linux = expectedBuild({
    arch: "x64",
    mathProfile: profile("linux"),
    platform: "linux",
  });
  assert.equal(linux.package, "igraph");
  assert.equal(linux.dependency.version, "1.0.1");
  assert.equal(
    linux.dependency.sha256,
    "969f2d7d22f67e788d8638c9a8c96615f50d7819c08978b3ef4a787bb6daa96c",
  );
  assert.deepEqual(linux.deployment, null);
  assert.ok(linux.build.cflags.includes("-O3"));
  assert.equal(linux.build.instructionPolicy, "x86-64-v1");
  assert.equal(linux.toolchain.archiver.command, "ar");
  assert.ok(linux.build.cmake.includes("-DIGRAPH_ENABLE_LTO=ON"));

  const windows = expectedBuild({
    arch: "x64",
    mathProfile: profile("win32"),
    platform: "win32",
  });
  assert.deepEqual(windows.build.cflags, []);
  assert.equal(windows.build.instructionPolicy, "windows-x64");
  assert.equal(windows.build.generatorArchitecture, "x64");
  assert.ok(windows.build.cmake.includes("-DIGRAPH_ENABLE_LTO=OFF"));

  const darwin = expectedBuild({
    arch: "arm64",
    macosDeploymentTarget: "13.5",
    mathProfile: profile("darwin", "arm64"),
    platform: "darwin",
  });
  assert.deepEqual(darwin.deployment, { macos: "13.5" });
  assert.equal(darwin.build.instructionPolicy, "apple-silicon-m1");
});

test("Windows reuse verifies both compilers and binary tools", () => {
  const expected = expectedBuild({
    arch: "x64",
    environment: {},
    mathProfile: profile("win32"),
    platform: "win32",
  });
  const executable = commandIdentity(process.execPath, []);
  const receipt = nativeDependencyExpectation({
    ...expected,
    toolchain: {
      archiver: executable,
      build: commandIdentity("cmake"),
      compilers: {
        c: executable,
        cxx: executable,
        generator: "Visual Studio 17 2022",
        generatorInstance: "C:/VS",
        generatorPlatform: "x64",
        generatorToolset: "v143",
        selection: "cmake-configured-toolchain",
      },
      linker: executable,
      ranlib: null,
    },
  });
  receipt.identitySha256 = "0".repeat(64);
  receipt.outputs = { files: [], identitySha256: "0".repeat(64), schema: "test" };
  assert.equal(reusableCmakeReceipt(receipt, expected), true);
  receipt.toolchain.compilers.cxx = { ...executable, output: "changed" };
  assert.equal(reusableCmakeReceipt(receipt, expected), false);
});
