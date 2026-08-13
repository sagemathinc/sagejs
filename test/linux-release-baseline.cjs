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
});

test("Container build uses GCC, partial static linking, and the portable math profile", () => {
  const containerfile = readFileSync(
    require("node:path").join(__dirname, "..", "scripts", "linux-baseline", "Containerfile"),
    "utf8",
  );
  assert.match(containerfile, /CC=gcc CXX=g\+\+ \.\/configure .*--partly-static/);
  assert.match(containerfile, /SAGEJS_NATIVE_MATH_PROFILE=portable/);
  assert.match(containerfile, /LDFLAGS="-static-libgcc -static-libstdc\+\+"/);
  assert.match(containerfile, /pnpm --dir packages\/m4ri build/);
});
