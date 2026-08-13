"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  cmakeOptions,
  expectedBuild,
  igraphLtoSetting,
} = require("../scripts/build-deps.cjs");
const {
  nativeMathBuildProfile,
} = require("../../../scripts/native-math-profile.cjs");

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
  assert.ok(linux.build.cmake.includes("-DIGRAPH_ENABLE_LTO=ON"));

  const windows = expectedBuild({
    arch: "x64",
    mathProfile: profile("win32"),
    platform: "win32",
  });
  assert.deepEqual(windows.build.cflags, []);
  assert.equal(windows.build.generatorArchitecture, "x64");
  assert.ok(windows.build.cmake.includes("-DIGRAPH_ENABLE_LTO=OFF"));

  const darwin = expectedBuild({
    arch: "arm64",
    macosDeploymentTarget: "13.5",
    mathProfile: profile("darwin", "arm64"),
    platform: "darwin",
  });
  assert.deepEqual(darwin.deployment, { macos: "13.5" });
});
