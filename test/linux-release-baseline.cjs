"use strict";

const assert = require("node:assert/strict");
const {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");

const {
  BUILD_IMAGE,
  NODE_CONFIGURE_ARGUMENTS,
  NODE_SOURCE_SHA256,
  NODE_VERSION,
  OUTPUT_SCHEMA,
  POLICY_PATH,
  RUNTIME_IMAGE,
  assertPortableMathProfile,
  assertSafeOutputDirectory,
  parseArguments,
  publishReleaseOutput,
  releaseAuthorityIdentity,
} = require("../scripts/linux-baseline/release-inputs.cjs");

test("Linux baseline pins Node source and both container images", () => {
  assert.equal(NODE_VERSION, "26.7.0");
  assert.match(NODE_SOURCE_SHA256, /^[0-9a-f]{64}$/);
  assert.match(BUILD_IMAGE, /manylinux_2_28_x86_64@sha256:[0-9a-f]{64}$/);
  assert.match(RUNTIME_IMAGE, /ubi8\/ubi-minimal@sha256:[0-9a-f]{64}$/);
  assert.deepEqual(NODE_CONFIGURE_ARGUMENTS, [
    "--prefix=/opt/sagejs-node",
    "--partly-static",
  ]);
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

test("the GCC Node 26 witness removes libatomic at the same glibc floor", () => {
  const witness = require(
    "../scripts/linux-baseline/gcc-node-26.7.0-linux-x64.json"
  );
  assert.equal(witness.schema, "sagejs.linux-node-gcc-witness-v1");
  assert.equal(witness.historicalPrototype, true);
  assert.match(witness.recipeCommit, /^[0-9a-f]{40}$/);
  for (const value of Object.values(witness.authority)) {
    assert.match(value.sha256, /^[0-9a-f]{64}$/);
  }
  assert.equal(witness.node.version, NODE_VERSION);
  assert.equal(witness.node.sourceSha256, NODE_SOURCE_SHA256);
  assert.deepEqual(witness.node.configureArguments, NODE_CONFIGURE_ARGUMENTS);
  assert.equal(witness.build.image, BUILD_IMAGE);
  assert.equal(witness.build.compiler.version, "14.2.1");
  assert.match(witness.inspection.sha256, /^[0-9a-f]{64}$/);
  assert.equal(witness.inspection.maximumSymbolVersions.GLIBC, "2.28");
  assert.equal(witness.inspection.dependencies.includes("libatomic.so.1"), false);
  assert.deepEqual(witness.inspection.rpaths, []);
  assert.equal(witness.runtimeProbe.image, RUNTIME_IMAGE);
  assert.equal(witness.runtimeProbe.libatomicPackagePresent, false);
  assert.equal(witness.runtimeProbe.exitStatus, 0);
  assert.equal(witness.runtimeProbe.stdout, `v${NODE_VERSION}`);
  assert.match(witness.seaProbe.sha256, /^[0-9a-f]{64}$/);
  assert.equal(witness.seaProbe.dependencies.includes("libatomic.so.1"), false);
  assert.equal(witness.seaProbe.maximumSymbolVersions.GLIBC, "2.28");
  assert.equal(witness.seaProbe.runtimeImage, RUNTIME_IMAGE);
  assert.equal(witness.seaProbe.exitStatus, 0);
  assert.equal(witness.seaProbe.stdout, "gcc-node-sea-ok");
});

test("release receipts bind every authoritative recipe input", () => {
  const identity = releaseAuthorityIdentity();
  assert.deepEqual(Object.keys(identity).sort(), [
    "containerfile",
    "policy",
    "releaseDriver",
  ]);
  for (const value of Object.values(identity)) {
    assert.match(value.sha256, /^[0-9a-f]{64}$/);
  }

  const directory = mkdtempSync(join(tmpdir(), "sagejs-linux-authority-test-"));
  try {
    const containerfile = join(directory, "Containerfile");
    const policy = join(directory, "policy.json");
    const releaseDriver = join(directory, "driver.cjs");
    writeFileSync(containerfile, "FROM scratch\n");
    writeFileSync(policy, "{}\n");
    writeFileSync(releaseDriver, '"use strict";\n');
    const before = releaseAuthorityIdentity({ containerfile, policy, releaseDriver });
    writeFileSync(policy, '{"tampered":true}\n');
    const after = releaseAuthorityIdentity({ containerfile, policy, releaseDriver });
    assert.notEqual(before.policy.sha256, after.policy.sha256);
    assert.equal(before.containerfile.sha256, after.containerfile.sha256);
    assert.equal(before.releaseDriver.sha256, after.releaseDriver.sha256);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("release publication refuses unowned output and replaces owned output", () => {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-linux-publish-test-"));
  try {
    const source = join(directory, "source");
    const output = join(directory, "output");
    mkdirSync(source);
    writeFileSync(join(source, "node"), "candidate");
    mkdirSync(output);
    writeFileSync(join(output, "valuable.txt"), "preserve me");
    assert.throws(
      () => publishReleaseOutput(source, output, { schema: "test" }),
      /refusing to replace unowned/,
    );
    assert.equal(readFileSync(join(output, "valuable.txt"), "utf8"), "preserve me");

    rmSync(output, { recursive: true });
    publishReleaseOutput(source, output, { schema: "test" });
    assert.equal(readFileSync(join(output, "node"), "utf8"), "candidate");
    assert.equal(
      JSON.parse(readFileSync(join(output, ".sagejs-linux-baseline-output.json"))).schema,
      OUTPUT_SCHEMA,
    );
    writeFileSync(join(source, "node"), "replacement");
    publishReleaseOutput(source, output, { schema: "test-2" });
    assert.equal(readFileSync(join(output, "node"), "utf8"), "replacement");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
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
  assert.match(source, /libatomicPackagePresent: false/);
  assert.match(source, /runtimeProbe/);
  assert.match(source, /--build-sea/);
  assert.match(source, /proveSeaTemplate/);
});

test("scratch artifact extraction supplies an inert container command", () => {
  const source = readFileSync(
    require("node:path").join(__dirname, "..", "scripts", "linux-baseline", "release-inputs.cjs"),
    "utf8",
  );
  assert.match(
    source,
    /\["create", tag, "\/release-inputs\/node", "--version"\]/,
  );
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
