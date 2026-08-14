"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const {
  chmodSync,
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
  NODE_SOURCE_FILENAME,
  NODE_SOURCE_SHA256,
  NODE_SOURCE_URL,
  NODE_VERSION,
  OUTPUT_SCHEMA,
  PNPM_TARBALL_INTEGRITY,
  PNPM_TARBALL_SHA512,
  PNPM_TARBALL_URL,
  PNPM_VERSION,
  PLATFORM_CONFIGS,
  POLICY_PATH,
  RUST_RELEASE_DATE,
  RUST_VERSION,
  RUNTIME_IMAGE,
  assertNativeEngineArchitecture,
  assertPortableMathProfile,
  assertSafeOutputDirectory,
  allocatePrivateImage,
  assertNoLibatomic,
  buildReleaseInputs,
  exportGitArchive,
  launchStagedRelease,
  parseArguments,
  platformConfig,
  normalizeContainerArchitecture,
  publishReleaseOutput,
  releaseAuthorityIdentity,
  removeOwnedImage,
  resolveSourceCommit,
  stageReleaseAuthority,
} = require("../scripts/linux-baseline/release-inputs.cjs");
const {
  validateBaselineSeaArtifacts,
} = require("../scripts/linux-baseline/sea-artifacts.cjs");

test("Linux baseline pins Node source and both container images", () => {
  assert.equal(NODE_VERSION, "26.7.0");
  assert.match(NODE_SOURCE_SHA256, /^[0-9a-f]{64}$/);
  assert.equal(NODE_SOURCE_FILENAME, "node-v26.7.0.tar.xz");
  assert.equal(
    NODE_SOURCE_URL,
    "https://nodejs.org/dist/v26.7.0/node-v26.7.0.tar.xz",
  );
  assert.match(BUILD_IMAGE, /manylinux_2_28_x86_64@sha256:[0-9a-f]{64}$/);
  assert.match(RUNTIME_IMAGE, /ubi8\/ubi-minimal@sha256:[0-9a-f]{64}$/);
  assert.equal(GCC_PATH, "/opt/rh/gcc-toolset-14/root/usr/bin/gcc");
  assert.deepEqual(NODE_CONFIGURE_ARGUMENTS, [
    "--prefix=/opt/sagejs-node",
    "--partly-static",
    "--v8-enable-temporal-support",
  ]);
  assert.equal(RUST_VERSION, "1.86.0");
  assert.equal(RUST_RELEASE_DATE, "2025-04-03");
  assert.equal(PNPM_VERSION, "11.9.0");
  assert.equal(PNPM_TARBALL_URL, "https://registry.npmjs.org/pnpm/-/pnpm-11.9.0.tgz");
  assert.match(PNPM_TARBALL_SHA512, /^[0-9a-f]{128}$/);
  assert.equal(
    PNPM_TARBALL_INTEGRITY,
    `sha512-${Buffer.from(PNPM_TARBALL_SHA512, "hex").toString("base64")}`,
  );
});

test("baseline SEA evidence binds executable manifests to inspected native bytes", () => {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-baseline-sea-test-"));
  try {
    const sea = join(directory, "sea");
    mkdirSync(sea);
    const digest = (contents) => createHash("sha256").update(contents).digest("hex");
    const nodeBytes = Buffer.from("node-template");
    const addonBytes = Buffer.from("native-addon");
    const nodeSource = {
      filename: "node-v26.7.0.tar.xz",
      sha256: NODE_SOURCE_SHA256,
      url: NODE_SOURCE_URL,
      version: NODE_VERSION,
    };
    const rustToolchain = platformConfig("linux-x64").rustToolchain;
    const source = {
      commit: "a".repeat(40),
      dirty: false,
      kind: "git-clean",
      tree: "b".repeat(40),
    };
    const nativeFile = (label, role, bytes) => ({
      architecture: "x64",
      dependencies: ["libc.so.6"],
      label,
      requiredSymbolVersions: ["GLIBC_2.28"],
      role,
      sha256: digest(bytes),
      size: bytes.length,
    });
    const nodeFile = nativeFile("sea/node-template", "executable-template", nodeBytes);
    const addonFile = nativeFile("native/addon.node", "embedded-node-addon", addonBytes);
    const report = {
      aggregate: {
        dependencies: ["libc.so.6"],
        maximumGlibc: "2.28",
      },
      files: [addonFile, nodeFile],
      inputSetSha256: "c".repeat(64),
      ok: true,
      schema: "sagejs.native-binary-inspection-v1",
    };
    const manifest = (nativeMathematics) => ({
      capabilities: {
        artifact: { kind: "single-executable", nativeMathematics },
      },
      schema: "sagejs.release-build-manifest-v1",
      source,
      target: {
        arch: "x64",
        libc: { family: "glibc", version: "2.28" },
        platform: "linux",
      },
      toolchain: {
        nativeBinaries: {
          report,
          reportSha256: "d".repeat(64),
        },
        seaNode: {
          executableSha256: digest(nodeBytes),
          rustToolchain,
          source: nodeSource,
          version: "26.7.0",
        },
      },
    });
    for (const [name, contents, mode] of [
      ["sagejs", "math-sea", 0o755],
      ["sagepython", "python-sea", 0o755],
      ["sagejs-build-manifest.json", JSON.stringify(manifest(true)), 0o644],
      ["sagepython-build-manifest.json", JSON.stringify(manifest(false)), 0o644],
    ]) {
      const filename = join(sea, name);
      writeFileSync(filename, contents);
      chmodSync(filename, mode);
    }
    const inspection = {
      files: [
        { ...nodeFile, label: "node" },
        { ...addonFile, label: "addons/hash-addon.node" },
      ],
    };
    const options = {
      inspection,
      nodeSource,
      platform: "linux-x64",
      rustToolchain,
      sourceCommit: source.commit,
    };
    const evidence = validateBaselineSeaArtifacts(directory, options);
    assert.equal(evidence.schema, "sagejs.linux-baseline-sea-artifacts-v1");
    assert.equal(evidence.executables.sagejs.embeddedAddons.length, 1);
    assert.deepEqual(evidence.rustToolchain, rustToolchain);
    assert.throws(
      () => validateBaselineSeaArtifacts(directory, {
        ...options,
        inspection: {
          files: inspection.files.map((file) =>
            file.label === "addons/hash-addon.node"
              ? { ...file, sha256: "e".repeat(64) }
              : file),
        },
      }),
      /absent from baseline inspection/,
    );
    assert.throws(
      () => validateBaselineSeaArtifacts(directory, {
        ...options,
        rustToolchain: {
          ...rustToolchain,
          sha256: "f".repeat(64),
        },
      }),
      /Expected values to be strictly deep-equal/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("Linux baseline pins distinct native x64 and arm64 container authorities", () => {
  assert.deepEqual(Object.keys(PLATFORM_CONFIGS).sort(), ["linux-arm64", "linux-x64"]);
  const x64 = platformConfig("linux-x64");
  const arm64 = platformConfig("linux-arm64");
  assert.equal(x64.arch, "x64");
  assert.equal(x64.containerArchitecture, "amd64");
  assert.match(x64.buildImage, /manylinux_2_28_x86_64@sha256:[0-9a-f]{64}$/);
  assert.match(x64.runtimeImage, /ubi8\/ubi-minimal@sha256:[0-9a-f]{64}$/);
  assert.deepEqual(x64.rustToolchain, {
    filename: "rust-1.86.0-x86_64-unknown-linux-gnu.tar.xz",
    sha256: "6b448b3669e0c74f7f4b87da7da4868a552fcbba1f955032d8925ad2fffb3798",
    target: "x86_64-unknown-linux-gnu",
    url:
      "https://static.rust-lang.org/dist/2025-04-03/" +
      "rust-1.86.0-x86_64-unknown-linux-gnu.tar.xz",
    version: "1.86.0",
  });
  assert.equal(arm64.arch, "arm64");
  assert.equal(arm64.containerArchitecture, "arm64");
  assert.match(arm64.buildImage, /manylinux_2_28_aarch64@sha256:[0-9a-f]{64}$/);
  assert.match(arm64.runtimeImage, /ubi8\/ubi-minimal@sha256:[0-9a-f]{64}$/);
  assert.deepEqual(arm64.rustToolchain, {
    filename: "rust-1.86.0-aarch64-unknown-linux-gnu.tar.xz",
    sha256: "2b97d1e09a1d7fdbed748332879318ee7f41c008837f87ccb44ec045df0a8a1b",
    target: "aarch64-unknown-linux-gnu",
    url:
      "https://static.rust-lang.org/dist/2025-04-03/" +
      "rust-1.86.0-aarch64-unknown-linux-gnu.tar.xz",
    version: "1.86.0",
  });
  assert.notEqual(arm64.buildImage, x64.buildImage);
  assert.notEqual(arm64.runtimeImage, x64.runtimeImage);
  assert.throws(() => platformConfig("linux-riscv64"), /unsupported/);
});

test("Linux baseline rejects an emulated container engine before building", () => {
  assert.equal(normalizeContainerArchitecture("x86_64"), "amd64");
  assert.equal(normalizeContainerArchitecture("aarch64"), "arm64");
  assert.throws(() => normalizeContainerArchitecture("riscv64"), /unsupported/);

  const calls = [];
  const native = assertNativeEngineArchitecture(
    "podman",
    platformConfig("linux-arm64"),
    {
      spawn: (_engine, arguments_) => {
        calls.push(arguments_);
        return {
          status: 0,
          stdout: JSON.stringify({ host: { arch: "aarch64" } }),
          stderr: "",
        };
      },
    },
  );
  assert.deepEqual(native, {
    architecture: "arm64",
    reportedArchitecture: "aarch64",
    selectedPlatform: "linux/arm64",
  });
  assert.deepEqual(calls, [["info", "--format", "json"]]);

  calls.length = 0;
  assert.throws(
    () =>
      assertNativeEngineArchitecture(
        "docker",
        platformConfig("linux-arm64"),
        {
          spawn: (_engine, arguments_) => {
            calls.push(arguments_);
            return {
              status: 0,
              stdout: JSON.stringify({ Architecture: "amd64" }),
              stderr: "",
            };
          },
        },
      ),
    /refusing emulated linux\/arm64 release build on native linux\/amd64/,
  );
  assert.deepEqual(
    calls,
    [["info", "--format", "json"]],
    "architecture mismatch must not launch a container build",
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

test("Linux arm64 baseline excludes libatomic and caps the complete ABI", () => {
  const config = platformConfig("linux-arm64");
  const policy = JSON.parse(readFileSync(config.policyPath, "utf8"));
  assert.equal(policy.format, "elf");
  assert.deepEqual(policy.architectures, ["arm64"]);
  assert.equal(policy.maximumSymbolVersions.GLIBC, "2.28");
  assert.equal(policy.maximumSymbolVersions.GLIBCXX, "3.4.25");
  assert.equal(policy.maximumSymbolVersions.CXXABI, "1.3.11");
  assert.equal(policy.allowedDependencies.includes("libatomic.so.1"), false);
  assert.equal(policy.allowedDependencies.includes("ld-linux-aarch64.so.1"), true);
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
  assert.deepEqual(witness.node.configureArguments, [
    "--prefix=/opt/sagejs-node",
    "--partly-static",
  ]);
  assert.equal(
    witness.node.configureArguments.includes("--v8-enable-temporal-support"),
    false,
    "the historical prototype predates the release Temporal requirement",
  );
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
    "seaArtifacts",
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
    const seaArtifacts = join(directory, "sea-artifacts.cjs");
    writeFileSync(containerfile, "FROM scratch\n");
    writeFileSync(policy, "{}\n");
    writeFileSync(releaseDriver, '"use strict";\n');
    writeFileSync(releaseInspector, '"use strict";\n');
    writeFileSync(seaArtifacts, '"use strict";\n');
    const before = releaseAuthorityIdentity({
      containerfile,
      policy,
      releaseDriver,
      releaseInspector,
      seaArtifacts,
    });
    writeFileSync(policy, '{"tampered":true}\n');
    const after = releaseAuthorityIdentity({
      containerfile,
      policy,
      releaseDriver,
      releaseInspector,
      seaArtifacts,
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
  assert.deepEqual(
    parseArguments([
      "--platform",
      "linux-x64",
      "--all-inputs",
      "--engine",
      "podman",
    ]),
    {
    allInputs: true,
    engine: "podman",
      keepImage: false,
      output: require("node:path").join(__dirname, "..", "build", "linux-baseline"),
      platform: "linux-x64",
    sourceCommit: undefined,
    sourceRef: "HEAD",
    stagedContext: undefined,
    },
  );
  assert.throws(() => parseArguments(["--engine", "lxc"]), /docker or podman/);
  assert.deepEqual(
    parseArguments(["--platform", "linux-arm64"]).platform,
    "linux-arm64",
  );
  assert.match(
    parseArguments(["--platform", "linux-arm64"]).output,
    /linux-baseline-linux-arm64$/,
  );
  assert.throws(
    () => parseArguments(["--platform", "linux-riscv64"]),
    /--platform must be one of/,
  );
  assert.throws(() => parseArguments(["--unknown"]), /unknown argument/);
  assert.throws(() => assertSafeOutputDirectory("/"), /refusing broad/);
});

test("Container build uses GCC, partial static linking, and the portable math profile", () => {
  const containerfile = readFileSync(
    require("node:path").join(__dirname, "..", "scripts", "linux-baseline", "Containerfile"),
    "utf8",
  );
  assert.match(containerfile, /CC=gcc CXX=g\+\+ \.\/configure/);
  assert.match(containerfile, /--partly-static/);
  assert.match(containerfile, /--v8-enable-temporal-support/);
  assert.match(containerfile, /RUST_SOURCE_SHA256/);
  assert.match(containerfile, /sha256sum --check --strict/);
  assert.match(containerfile, /rustc --version \| grep -Fx/);
  assert.match(containerfile, /cargo --version \| grep -Fx/);
  assert.match(containerfile, /typeof Temporal !== "object"/);
  assert.doesNotMatch(containerfile, /sh\.rustup\.rs|curl[^\n]*\|[^\n]*sh/);
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

test("every release container execution states the selected platform", () => {
  const source = readFileSync(
    require("node:path").join(
      __dirname,
      "..",
      "scripts",
      "linux-baseline",
      "release-inputs.cjs",
    ),
    "utf8",
  );
  assert.match(source, /"build",\s*"--platform",\s*containerPlatform\(config\)/);
  assert.match(source, /"create",\s*"--platform",\s*containerPlatform\(config\)/);
  assert.equal(
    [...source.matchAll(/"run",\s*"--rm",\s*"--platform",\s*containerPlatform\(config\)/g)]
      .length,
    4,
    "all four runtime probes must state the selected platform",
  );
  assert.match(source, /containerEngine:\s*{\s*name: engine,\s*\.\.\.engineArchitecture/);
});

test("the runtime proof checks that libatomic is genuinely absent", () => {
  const source = readFileSync(
    require("node:path").join(__dirname, "..", "scripts", "linux-baseline", "release-inputs.cjs"),
    "utf8",
  );
  assert.match(source, /"rpm",\s*"-q",\s*"libatomic"/);
  assert.match(source, /libatomicPackagePresent: false/);
  assert.match(source, /runtimeProbe/);
  assert.match(source, /--build-sea/);
  assert.match(source, /proveSeaTemplate/);
  assert.match(source, /temporal:typeof Temporal/);
  assert.match(source, /temporal:\s*"object"/);
});

test("scratch artifact extraction supplies an inert container command", () => {
  const source = readFileSync(
    require("node:path").join(__dirname, "..", "scripts", "linux-baseline", "release-inputs.cjs"),
    "utf8",
  );
  assert.match(
    source,
    /"create",\s*"--platform",\s*containerPlatform\(config\),\s*image\.tag,\s*"\/release-inputs\/node",\s*"--version"/,
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
  const x64 = platformConfig("linux-x64");
  assert.equal(assertPortableMathProfile(portable, x64), portable);
  assert.throws(
    () => assertPortableMathProfile({ ...portable, cpu: { model: "builder" } }, x64),
    /Expected values to be strictly equal/,
  );
  const tuned = structuredClone(portable);
  tuned.buildOptions.gmp.cflags = ["-march=native"];
  assert.throws(
    () => assertPortableMathProfile(tuned, x64),
    /host CPU compiler flag/,
  );

  const arm = structuredClone(portable);
  arm.abi.arch = "arm64";
  arm.cpuPolicy = { baseline: "armv8-a" };
  arm.buildOptions.gmp = {
    cflags: ["-O3", "-fPIC", "-march=armv8-a"],
    configure: ["--disable-shared", "--enable-static"],
  };
  arm.buildOptions.fflas = {
    archnative: false,
    gmpConfigure: ["--disable-shared", "--enable-static"],
  };
  assert.equal(
    assertPortableMathProfile(arm, platformConfig("linux-arm64")),
    arm,
  );
});
