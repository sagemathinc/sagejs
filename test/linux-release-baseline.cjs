"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { spawnSync } = require("node:child_process");
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
  GCC_PATH,
  NODE_CONFIGURE_ARGUMENTS,
  NODE_SOURCE_SHA256,
  NODE_VERSION,
  OUTPUT_SCHEMA,
  PNPM_TARBALL_INTEGRITY,
  PNPM_TARBALL_SHA512,
  PNPM_TARBALL_URL,
  PNPM_VERSION,
  POLICY_PATH,
  RUNTIME_IMAGE,
  assertPortableMathProfile,
  assertSafeOutputDirectory,
  allocatePrivateImage,
  assertNoLibatomic,
  buildReleaseInputs,
  exportGitArchive,
  launchStagedRelease,
  parseArguments,
  publishReleaseOutput,
  releaseAuthorityIdentity,
  removeOwnedImage,
  resolveSourceCommit,
  stageReleaseAuthority,
} = require("../scripts/linux-baseline/release-inputs.cjs");

test("Linux baseline pins Node source and both container images", () => {
  assert.equal(NODE_VERSION, "26.7.0");
  assert.match(NODE_SOURCE_SHA256, /^[0-9a-f]{64}$/);
  assert.match(BUILD_IMAGE, /manylinux_2_28_x86_64@sha256:[0-9a-f]{64}$/);
  assert.match(RUNTIME_IMAGE, /ubi8\/ubi-minimal@sha256:[0-9a-f]{64}$/);
  assert.equal(GCC_PATH, "/opt/rh/gcc-toolset-14/root/usr/bin/gcc");
  assert.deepEqual(NODE_CONFIGURE_ARGUMENTS, [
    "--prefix=/opt/sagejs-node",
    "--partly-static",
  ]);
  assert.equal(PNPM_VERSION, "11.9.0");
  assert.equal(PNPM_TARBALL_URL, "https://registry.npmjs.org/pnpm/-/pnpm-11.9.0.tgz");
  assert.match(PNPM_TARBALL_SHA512, /^[0-9a-f]{128}$/);
  assert.equal(
    PNPM_TARBALL_INTEGRITY,
    `sha512-${Buffer.from(PNPM_TARBALL_SHA512, "hex").toString("base64")}`,
  );
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
  const reachable = spawnSync(
    "git",
    ["merge-base", "--is-ancestor", witness.recipeCommit, "HEAD"],
    { stdio: "ignore" },
  );
  assert.equal(
    reachable.status,
    0,
    "the historical recipe commit must be reachable from the release source",
  );
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
  assert.equal(witness.seaProbe, undefined);

  for (const [name, path] of Object.entries({
    containerfile: "scripts/linux-baseline/Containerfile",
    policy: "scripts/linux-baseline/linux-x64-glibc-2.28-policy.json",
    releaseDriver: "scripts/linux-baseline/release-inputs.cjs",
  })) {
    const bytes = spawnSync("git", ["show", `${witness.recipeCommit}:${path}`], {
      encoding: null,
    });
    assert.equal(bytes.status, 0);
    assert.equal(
      createHash("sha256").update(bytes.stdout).digest("hex"),
      witness.authority[name].sha256,
    );
  }
});

test("release receipts bind every authoritative recipe input", () => {
  const identity = releaseAuthorityIdentity();
  assert.deepEqual(Object.keys(identity).sort(), [
    "containerfile",
    "policy",
    "releaseDriver",
    "releaseInspector",
  ]);
  for (const value of Object.values(identity)) {
    assert.match(value.sha256, /^[0-9a-f]{64}$/);
  }

  const directory = mkdtempSync(join(tmpdir(), "sagejs-linux-authority-test-"));
  try {
    const containerfile = join(directory, "Containerfile");
    const policy = join(directory, "policy.json");
    const releaseDriver = join(directory, "driver.cjs");
    const releaseInspector = join(directory, "inspector.cjs");
    writeFileSync(containerfile, "FROM scratch\n");
    writeFileSync(policy, "{}\n");
    writeFileSync(releaseDriver, '"use strict";\n');
    writeFileSync(releaseInspector, '"use strict";\n');
    const before = releaseAuthorityIdentity({
      containerfile,
      policy,
      releaseDriver,
      releaseInspector,
    });
    writeFileSync(policy, '{"tampered":true}\n');
    const after = releaseAuthorityIdentity({
      containerfile,
      policy,
      releaseDriver,
      releaseInspector,
    });
    assert.notEqual(before.policy.sha256, after.policy.sha256);
    assert.equal(before.containerfile.sha256, after.containerfile.sha256);
    assert.equal(before.releaseDriver.sha256, after.releaseDriver.sha256);
    assert.equal(before.releaseInspector.sha256, after.releaseInspector.sha256);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("staged authority remains immutable when live inputs change", () => {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-linux-stage-test-"));
  try {
    const sources = join(directory, "sources");
    const staged = join(directory, "staged");
    mkdirSync(sources);
    const containerfile = join(sources, "Containerfile");
    const policy = join(sources, "policy.json");
    const releaseDriver = join(sources, "driver.cjs");
    const releaseInspector = join(sources, "inspector.cjs");
    writeFileSync(containerfile, "FROM scratch\n");
    writeFileSync(policy, '{"format":"elf"}\n');
    writeFileSync(releaseDriver, '"use strict";\n');
    writeFileSync(releaseInspector, '"use strict";\n');
    const sourceCommit = "a".repeat(40);
    const authority = stageReleaseAuthority(staged, {
      containerfile,
      policy,
      releaseDriver,
      releaseInspector,
      sourceCommit,
    });
    writeFileSync(containerfile, "FROM changed\n");
    writeFileSync(policy, '{"format":"changed"}\n');
    writeFileSync(releaseDriver, 'throw Error("changed");\n');
    writeFileSync(releaseInspector, 'throw Error("changed");\n');
    assert.equal(readFileSync(authority.paths.containerfile, "utf8"), "FROM scratch\n");
    assert.deepEqual(JSON.parse(readFileSync(authority.paths.policy, "utf8")), {
      format: "elf",
    });
    assert.equal(authority.sourceCommit, sourceCommit);
    assert.deepEqual(
      authority.identity,
      releaseAuthorityIdentity(authority.paths),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("source references resolve once to an immutable commit", () => {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-linux-ref-test-"));
  try {
    const git = (...arguments_) =>
      spawnSync("git", arguments_, {
        cwd: directory,
        encoding: "utf8",
        env: {
          ...process.env,
          GIT_AUTHOR_EMAIL: "test@example.invalid",
          GIT_AUTHOR_NAME: "Test",
          GIT_COMMITTER_EMAIL: "test@example.invalid",
          GIT_COMMITTER_NAME: "Test",
        },
      });
    assert.equal(git("init", "--quiet").status, 0);
    writeFileSync(join(directory, "value"), "first\n");
    assert.equal(git("add", "value").status, 0);
    assert.equal(git("commit", "--quiet", "-m", "first").status, 0);
    const first = resolveSourceCommit("HEAD", { root: directory });
    writeFileSync(join(directory, "value"), "second\n");
    assert.equal(git("commit", "--quiet", "-am", "second").status, 0);
    const second = resolveSourceCommit("HEAD", { root: directory });
    assert.notEqual(first, second);
    assert.match(first, /^[0-9a-f]{40}$/);
    const archive = join(directory, "first.tar");
    exportGitArchive(first, archive, { root: directory });
    const archived = spawnSync("tar", ["-xOf", archive, "value"], {
      encoding: "utf8",
    });
    assert.equal(archived.status, 0);
    assert.equal(archived.stdout, "first\n");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("the launcher executes staged driver bytes after the live file changes", () => {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-linux-launch-test-"));
  try {
    const git = (...arguments_) =>
      spawnSync("git", arguments_, {
        cwd: directory,
        encoding: "utf8",
        env: {
          ...process.env,
          GIT_AUTHOR_EMAIL: "test@example.invalid",
          GIT_AUTHOR_NAME: "Test",
          GIT_COMMITTER_EMAIL: "test@example.invalid",
          GIT_COMMITTER_NAME: "Test",
        },
      });
    assert.equal(git("init", "--quiet").status, 0);
    writeFileSync(join(directory, "tracked"), "value\n");
    assert.equal(git("add", "tracked").status, 0);
    assert.equal(git("commit", "--quiet", "-m", "source").status, 0);

    const containerfile = join(directory, "Containerfile");
    const policy = join(directory, "policy.json");
    const releaseDriver = join(directory, "release-inputs.cjs");
    const releaseInspector = join(directory, "release-native-binary-inspector.cjs");
    writeFileSync(containerfile, "FROM scratch\n");
    writeFileSync(policy, "{}\n");
    writeFileSync(releaseDriver, 'console.log("staged")\n');
    writeFileSync(releaseInspector, 'module.exports = {}\n');
    let stagedDriver;
    const status = launchStagedRelease(["--help"], {
      authoritySources: { containerfile, policy, releaseDriver, releaseInspector },
      beforeExec: () => writeFileSync(releaseDriver, 'console.log("changed")\n'),
      executable: "node",
      root: directory,
      spawn: (_executable, arguments_) => {
        stagedDriver = arguments_[0];
        assert.equal(readFileSync(stagedDriver, "utf8"), 'console.log("staged")\n');
        return { status: 0 };
      },
    });
    assert.equal(status, 0);
    assert.equal(readFileSync(releaseDriver, "utf8"), 'console.log("changed")\n');
    assert.equal(stagedDriver.includes(".authority/release-inputs.cjs"), true);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("authoritative builds fail closed outside the staged process", () => {
  assert.throws(
    () =>
      buildReleaseInputs({
        engine: "definitely-not-invoked",
        output: join(tmpdir(), "not-created"),
        sourceCommit: "a".repeat(40),
        stagedContext: "/not/used",
      }),
    /require the staged launcher process/,
  );
});

test("libatomic is an explicit artifact and SEA rejection invariant", () => {
  const report = { aggregate: { dependencies: ["libc.so.6"] } };
  assert.equal(assertNoLibatomic(report, "candidate"), report);
  assert.throws(
    () =>
      assertNoLibatomic(
        { aggregate: { dependencies: ["libatomic.so.1"] } },
        "candidate",
      ),
    /depends on libatomic\.so\.1/,
  );
});

test("private image tags are unique and cleanup is ownership checked", () => {
  const calls = [];
  const values = [Buffer.alloc(24, 1), Buffer.alloc(24, 2)];
  const spawn = (_engine, arguments_) => {
    calls.push(arguments_);
    if (arguments_[0] === "image" && arguments_[1] === "inspect") {
      if (arguments_[2].endsWith(Buffer.alloc(24, 1).toString("hex"))) {
        return { status: 0, stdout: "[]" };
      }
      return { status: 1, stdout: "" };
    }
    return { status: 0, stdout: "" };
  };
  const image = allocatePrivateImage("podman", {
    randomBytes: () => values.shift(),
    spawn,
  });
  assert.match(image.token, /^[0-9a-f]{48}$/);
  assert.equal(calls.filter((call) => call[1] === "inspect").length, 2);

  assert.equal(
    removeOwnedImage("podman", image, {
      spawn: (_engine, arguments_) =>
        arguments_[1] === "inspect"
          ? { status: 0, stdout: JSON.stringify([{ Config: { Labels: {} } }]) }
          : assert.fail("unowned image must not be deleted"),
    }),
    false,
  );
  const ownedCalls = [];
  assert.equal(
    removeOwnedImage("podman", image, {
      spawn: (_engine, arguments_) => {
        ownedCalls.push(arguments_);
        return arguments_[1] === "inspect"
          ? {
              status: 0,
              stdout: JSON.stringify([
                {
                  Config: {
                    Labels: {
                      "org.sagemath.sagejs.linux-baseline.token": image.token,
                    },
                  },
                },
              ]),
            }
          : { status: 0, stdout: "" };
      },
    }),
    true,
  );
  assert.equal(ownedCalls.some((call) => call[1] === "rm"), true);
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
    sourceCommit: undefined,
    sourceRef: "HEAD",
    stagedContext: undefined,
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
  assert.doesNotMatch(containerfile, /\bnpm install --global/);
  assert.match(containerfile, /PNPM_TARBALL_SHA512/);
  assert.match(containerfile, /sha512sum --check --strict/);
  assert.match(containerfile, /\/opt\/sagejs-pnpm\/bin\/pnpm\.mjs/);
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
    /\["create", image\.tag, "\/release-inputs\/node", "--version"\]/,
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
