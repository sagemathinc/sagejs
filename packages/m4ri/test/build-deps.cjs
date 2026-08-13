"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  configureOptions,
  expectedBuild,
  portableCacheBytes,
  selectedEnvironment,
} = require("../scripts/build-deps.cjs");
const {
  CPU_NATIVE_PROFILE,
  nativeMathBuildProfile,
} = require("../../../scripts/native-math-profile.cjs");

function profile(platform, arch = "x64", cpuNative = false) {
  const flag = arch === "arm64" ? "-mcpu=native" : "-march=native";
  const compiler = {
    command: "cc",
    nativeFlag: cpuNative ? flag : null,
    nativeFlagSupported: cpuNative,
    target: `${arch}-test-${platform}`,
    version: "test compiler",
  };
  return nativeMathBuildProfile({
    arch,
    compiler,
    cxxCompiler: { ...compiler, command: "c++" },
    cpu: { features: ["test-feature"], model: "test CPU" },
    endianness: "LE",
    environment: {},
    platform,
    ...(cpuNative ? { requestedProfile: CPU_NATIVE_PROFILE } : {}),
  });
}

test("M4RI dependency declaration preserves portable and tuned semantics", () => {
  const portable = expectedBuild({
    arch: "x64",
    mathProfile: profile("linux"),
    platform: "linux",
  });
  assert.equal(portable.package, "m4ri");
  assert.equal(portable.dependency.version, "20260122");
  assert.equal(
    portable.dependency.sha256,
    "7e033ca1fd36be8861e2f67d9d124c398fc0d830209bb0226462485876346404",
  );
  assert.equal(
    portable.build.instructionPolicy,
    "x86-64-v1",
  );
  assert.ok(!portable.build.cflags.includes("-march=native"));
  assert.equal(portable.toolchain.archiver.command, "ar");
  assert.equal(portable.toolchain.ranlib.command, "ranlib");
  assert.deepEqual(portable.build.cachePolicy, {
    kind: "fixed-portable",
    ...portableCacheBytes,
  });
  assert.ok(
    portable.build.configure.includes("--with-cachesize=32768:262144:8388608"),
  );

  const tuned = expectedBuild({
    arch: "x64",
    mathProfile: profile("linux", "x64", true),
    platform: "linux",
  });
  assert.equal(tuned.mathProfile.effectiveProfile, CPU_NATIVE_PROFILE);
  assert.ok(tuned.build.cflags.includes("-march=native"));
  assert.equal(
    tuned.build.instructionPolicy,
    "compiler-native",
  );
  assert.deepEqual(tuned.build.cachePolicy, { kind: "configure-detected" });
  assert.ok(!configureOptions(tuned.mathProfile).some((option) =>
    option.startsWith("--with-cachesize=")));
});

test("M4RI declaration binds deployment target and Windows capability", () => {
  const darwin = expectedBuild({
    arch: "arm64",
    macosDeploymentTarget: "13.5",
    mathProfile: profile("darwin", "arm64"),
    platform: "darwin",
  });
  assert.deepEqual(darwin.deployment, { macos: "13.5" });
  assert.equal(
    darwin.build.instructionPolicy,
    "apple-silicon-m1",
  );

  const windows = expectedBuild({
    arch: "x64",
    mathProfile: profile("win32"),
    platform: "win32",
  });
  assert.equal(windows.capability, false);
  assert.deepEqual(windows.build.cflags, []);
  assert.deepEqual(windows.build.configure, []);
});

test("M4RI declaration binds inherited build environment", () => {
  const baseline = expectedBuild({
    arch: "x64",
    environment: { LDFLAGS: "-Wl,baseline" },
    mathProfile: profile("linux"),
    platform: "linux",
  });
  const changed = expectedBuild({
    arch: "x64",
    environment: { LDFLAGS: "-Wl,changed" },
    mathProfile: profile("linux"),
    platform: "linux",
  });
  assert.notDeepEqual(baseline.build.environment, changed.build.environment);
  assert.equal(changed.build.environment.LDFLAGS, "-Wl,changed");
  assert.equal(selectedEnvironment({}).CPPFLAGS, null);
  assert.throws(
    () => selectedEnvironment({ CONFIG_SITE: "/tmp/site" }),
    /CONFIG_SITE is unsupported/,
  );
  assert.throws(
    () => selectedEnvironment({ DESTDIR: "/tmp/stage" }),
    /DESTDIR is unsupported/,
  );
});
