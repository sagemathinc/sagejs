"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const test = require("node:test");

const {
  BUILD_IMAGE,
  NODE_SOURCE_SHA256,
  NODE_VERSION,
  POLICY_PATH,
  RUNTIME_IMAGE,
  assertPortableMathProfile,
  assertSafeOutputDirectory,
  parseArguments,
} = require("../scripts/linux-baseline/release-inputs.cjs");

test("Linux baseline pins Node source and both container images", () => {
  assert.equal(NODE_VERSION, "26.7.0");
  assert.match(NODE_SOURCE_SHA256, /^[0-9a-f]{64}$/);
  assert.match(BUILD_IMAGE, /manylinux_2_28_x86_64@sha256:[0-9a-f]{64}$/);
  assert.match(RUNTIME_IMAGE, /ubi8\/ubi-minimal@sha256:[0-9a-f]{64}$/);
});

test("Linux baseline excludes libatomic and caps the complete ABI", () => {
  const policy = JSON.parse(readFileSync(POLICY_PATH, "utf8"));
  assert.equal(policy.format, "elf");
  assert.deepEqual(policy.architectures, ["x64"]);
  assert.equal(policy.maximumSymbolVersions.GLIBC, "2.28");
  assert.equal(policy.maximumSymbolVersions.GLIBCXX, "3.4.25");
  assert.equal(policy.maximumSymbolVersions.CXXABI, "1.3.11");
  assert.equal(policy.allowedDependencies.includes("libatomic.so.1"), false);
  assert.deepEqual(policy.allowedRpaths, []);
});

test("the exact official Node 26 comparison demonstrates the libatomic gap", () => {
  const witness = require(
    "../scripts/linux-baseline/official-node-26.7.0-linux-x64.json"
  );
  assert.equal(witness.schema, "sagejs.linux-node-upstream-witness-v1");
  assert.equal(witness.nodeVersion, NODE_VERSION);
  assert.match(witness.archive.sha256, /^[0-9a-f]{64}$/);
  assert.equal(witness.inspection.maximumGlibc, "2.28");
  assert.equal(witness.inspection.dependencies.includes("libatomic.so.1"), true);
  assert.deepEqual(witness.inspection.rpaths, []);
  assert.equal(witness.runtimeProbe.image, RUNTIME_IMAGE);
  assert.equal(witness.runtimeProbe.libatomicPackagePresent, false);
  assert.equal(witness.runtimeProbe.exitStatus, 127);
  assert.match(witness.runtimeProbe.stderrContains, /libatomic\.so\.1/);
});

test("Linux baseline command-line parsing is fail closed", () => {
  assert.deepEqual(parseArguments(["--all-inputs", "--engine", "podman"]), {
    allInputs: true,
    engine: "podman",
    keepImage: false,
    output: require("node:path").join(__dirname, "..", "build", "linux-baseline"),
    sourceRef: "HEAD",
  });
  assert.throws(() => parseArguments(["--engine", "lxc"]), /docker or podman/);
  assert.throws(() => parseArguments(["--unknown"]), /unknown argument/);
  assert.throws(() => assertSafeOutputDirectory("/"), /refusing broad/);
});

test("Container build uses GCC, partial static linking, and the portable math profile", () => {
  const containerfile = readFileSync(
    require("node:path").join(__dirname, "..", "scripts", "linux-baseline", "Containerfile"),
    "utf8",
  );
  assert.match(containerfile, /CC=gcc CXX=g\+\+ \.\/configure .*--partly-static/);
  assert.match(containerfile, /make -j"\$\(nproc\)" install/);
  assert.match(containerfile, /SAGEJS_NATIVE_MATH_PROFILE=portable/);
  assert.match(containerfile, /SAGEJS_FLINT_PREFIX=\/opt\/sagejs-native\/flint/);
  assert.match(containerfile, /LDFLAGS="-static-libgcc -static-libstdc\+\+"/);
  assert.match(containerfile, /SOURCE_DATE_EPOCH=0/);
  assert.match(containerfile, /pnpm --dir packages\/m4ri build/);
});

test("the runtime proof checks that libatomic is genuinely absent", () => {
  const source = readFileSync(
    require("node:path").join(__dirname, "..", "scripts", "linux-baseline", "release-inputs.cjs"),
    "utf8",
  );
  assert.match(source, /"rpm", "-q", "libatomic"/);
  assert.match(source, /runtimeLibatomicPackagePresent: false/);
});

test("the full proof rejects host-tuned mathematics profiles", () => {
  const portable = {
    schema: "sagejs.native-math-profile-v1",
    effectiveProfile: "portable",
    requestedProfile: "portable",
    cpu: null,
    abi: { platform: "linux", arch: "x64" },
    compilers: { c: { nativeFlag: null }, cxx: { nativeFlag: null } },
    buildOptions: {
      gmp: { configure: ["--enable-fat"] },
      fflas: { gmpConfigure: ["--enable-fat"] },
      openblas: { dynamicArch: true },
    },
  };
  assert.equal(assertPortableMathProfile(portable), portable);
  assert.throws(
    () => assertPortableMathProfile({ ...portable, cpu: { model: "builder" } }),
    /Expected values to be strictly equal/,
  );
  const tuned = structuredClone(portable);
  tuned.buildOptions.gmp.cflags = ["-march=native"];
  assert.throws(() => assertPortableMathProfile(tuned), /host CPU compiler flag/);
});
