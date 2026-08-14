"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const {
  chmodSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");
const { strToU8, zipSync } = require("fflate");

const {
  acceptReleaseArtifact,
  assertInstallerHasNoScripts,
  extractArchive,
  parseArguments,
  peCertificateTable,
  RUST_TOOLCHAIN_AUTHORITIES,
  TARGETS,
  validateArchiveMembers,
  validateBenchmarkStatistics,
  validateNativeReceipt,
  validateTargetMetadata,
  validateThirdPartyInventory,
  validateZipExtra,
  verifyChecksum,
  verifyInternalChecksums,
  zipArchiveMembers,
} = require("../scripts/release-artifact-acceptance.cjs");
const {
  canonicalJson,
  createBuildManifest,
  serialize,
} = require("../scripts/release-manifest.cjs");

const root = join(__dirname, "..");
const commit = "a".repeat(40);
const tree = "b".repeat(40);
const version = require("../package.json").version;
const nativeVersions = {
  ffpoly: "1.2.7",
  fflasFfpack: "2.5.0",
  flint: "3.6.0",
  givaro: "4.2.2",
  gmp: "6.3.0",
  mpc: "1.4.1",
  mpfr: "4.2.2",
  openblas: "0.3.33",
  smalljac: "4.1.3",
};
const nodeSource = {
  filename: "node-v26.7.0.tar.xz",
  sha256: "e6b182cbeeab032d1082ca4ac4fe15e3a57de691d3bde78ecf8a761fd56ee356",
  url: "https://nodejs.org/dist/v26.7.0/node-v26.7.0.tar.xz",
  version: "26.7.0",
};
const rustToolchain = RUST_TOOLCHAIN_AUTHORITIES["linux-x64"];

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function source() {
  return {
    commit,
    contentSha256: "c".repeat(64),
    dirty: false,
    kind: "git-clean",
    tree,
  };
}

function target() {
  return {
    arch: "x64",
    endianness: "LE",
    libc: { family: "glibc", version: "2.28" },
    nodeAbi: "141",
    nodeNapi: "10",
    platform: "linux",
    wordBits: 64,
  };
}

function nativeBinaries(dependencies = ["libc.so.6", "libm.so.6"], glibc = "2.28") {
  const report = {
    aggregate: {
      architectures: ["x64"],
      dependencies,
      formats: ["elf"],
      maximumGlibc: glibc,
      maximumMinimumMacos: null,
      maximumSymbolVersions: { GLIBC: glibc },
    },
    files: [{
      architecture: "x64",
      dependencies,
      format: "elf",
      label: "node-template",
      maximumGlibc: glibc,
      role: "sea-node-template",
      sha256: "d".repeat(64),
      size: 1,
    }],
    inputSetSha256: "e".repeat(64),
    ok: true,
    policy: {
      architectures: ["x64"],
      exactArchitectures: true,
      format: "elf",
      requiredLabels: ["node-template"],
    },
    schema: "sagejs.native-binary-inspection-v1",
    violations: [],
  };
  return {
    report,
    reportSha256: hash(canonicalJson(report)),
    schema: "sagejs.native-binary-receipt/v1",
  };
}

function buildReceipt(nativeMathematics, binaries = nativeBinaries()) {
  return createBuildManifest({
    capabilities: {
      artifact: { kind: "single-executable", nativeMathematics },
      embeddedAssets: { assets: {}, schema: "sagejs.embedded-assets/v1" },
      nativeDependencies: nativeMathematics
        ? { bindings: {}, schema: "sagejs.sea-native-dependency-bindings-v1" }
        : null,
      nativeKernels: nativeMathematics ? { fixture: true } : null,
    },
    sagejsVersion: version,
    source: source(),
    target: target(),
    toolchain: {
      nativeBinaries: binaries,
      nativeMathProfile: nativeMathematics
        ? { dependencies: nativeVersions, schema: "fixture" }
        : null,
      seaNode: {
        executableSha256: "d".repeat(64),
        rustToolchain,
        source: nodeSource,
        version: "26.7.0",
      },
    },
  });
}

function receipts() {
  return { math: buildReceipt(true), python: buildReceipt(false) };
}

function withTemporary(callback) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-release-accept-test-"));
  try {
    return callback(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function copyLicenseInventory(distribution) {
  cpSync(join(root, "licenses"), join(distribution, "licenses"), {
    recursive: true,
  });
}

function visitDistribution(base, prefix = "") {
  const entries = require("node:fs").readdirSync(join(base, prefix), {
    withFileTypes: true,
  });
  return entries.flatMap((entry) => {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    return entry.isDirectory() ? visitDistribution(base, path) : [path];
  }).sort();
}

function writeInternalChecksums(distribution) {
  const files = visitDistribution(distribution).filter((name) => name !== "SHA256SUMS");
  writeFileSync(
    join(distribution, "SHA256SUMS"),
    `${files.map((name) => `${hash(readFileSync(join(distribution, name)))}  ${name}`).join("\n")}\n`,
  );
}

function recordedArtifact(distribution, name) {
  const filename = join(distribution, name);
  const status = statSync(filename);
  return {
    bytes: status.size,
    filename: name.split("/").at(-1),
    mode: (status.mode & 0o777).toString(8).padStart(3, "0"),
    sha256: hash(readFileSync(filename)),
  };
}

function writeLinuxBaselineMetadata(distribution, pair) {
  const artifacts = {};
  for (const [name, archiveName] of Object.entries({
    "sea/sagejs": "sagejs",
    "sea/sagejs-build-manifest.json": "sagejs-build-manifest.json",
    "sea/sagepython": "sagepython",
    "sea/sagepython-build-manifest.json": "sagepython-build-manifest.json",
  })) artifacts[name] = recordedArtifact(distribution, archiveName);
  const executableEvidence = (receipt) => ({
    embeddedAddonInputSetSha256: receipt.toolchain.nativeBinaries.report.inputSetSha256,
    embeddedAddons: receipt.toolchain.nativeBinaries.report.files
      .filter((file) => file.role === "embedded-node-addon")
      .map((file) => ({ bytes: file.size, label: file.label, sha256: file.sha256 })),
    manifestSource: receipt.source,
    nativeInputReportSha256: receipt.toolchain.nativeBinaries.reportSha256,
    target: receipt.target,
  });
  const baseline = {
    authority: {
      containerfile: { sha256: "1".repeat(64) },
      policy: { sha256: "2".repeat(64) },
      releaseDriver: { sha256: "3".repeat(64) },
      releaseInspector: { sha256: "4".repeat(64) },
      seaArtifacts: { sha256: "5".repeat(64) },
    },
    buildImage: "manylinux-fixture@sha256:" + "6".repeat(64),
    compiler: { family: "gcc", version: "14.2.1" },
    configureArguments: ["--partly-static", "--v8-enable-temporal-support"],
    containerEngine: { architecture: "amd64", name: "podman" },
    inspection: { aggregate: { dependencies: ["libc.so.6"] } },
    nativeMathProfile: pair.math.toolchain.nativeMathProfile,
    nodeSource,
    platform: "linux-x64",
    pnpmDistribution: {
      integrity: "sha512-fixture",
      sha512: "7".repeat(128),
      url: "https://registry.npmjs.org/pnpm/-/pnpm-11.9.0.tgz",
      version: "11.9.0",
    },
    policy: { format: "elf" },
    requestedSourceRef: commit,
    runtimeImage: "ubi-fixture@sha256:" + "8".repeat(64),
    runtimeProbe: { exitStatus: 0, observation: { node: "v26.7.0", temporal: "object" } },
    rustToolchain,
    schema: "sagejs.linux-baseline-receipt-v1",
    seaArtifacts: {
      artifacts,
      executables: {
        sagejs: executableEvidence(pair.math),
        sagepython: executableEvidence(pair.python),
      },
      nodeSource,
      platform: "linux-x64",
      rustToolchain,
      schema: "sagejs.linux-baseline-sea-artifacts-v1",
      sourceCommit: commit,
    },
    seaProbe: {
      inspection: pair.math.toolchain.nativeBinaries.report,
      observed: { ok: "sagejs-linux-sea-ok", temporal: "object" },
      stdout: '{"ok":"sagejs-linux-sea-ok","temporal":"object"}',
    },
    sourceCommit: commit,
  };
  writeFileSync(
    join(distribution, "linux-baseline-receipt.json"),
    `${JSON.stringify(baseline, null, 2)}\n`,
  );
  return baseline;
}

function writeDistribution(directory) {
  const distribution = join(directory, "sagejs-linux-x64");
  mkdirSync(distribution);
  copyLicenseInventory(distribution);
  for (const name of ["LICENSE", "README.md", "DISTRIBUTION.md"]) {
    writeFileSync(join(distribution, name), `${name}\n`);
  }
  for (const name of ["sagejs", "sagepython"]) {
    writeFileSync(join(distribution, name), "fixture executable\n", { mode: 0o755 });
    chmodSync(join(distribution, name), 0o755);
  }
  const pair = receipts();
  writeFileSync(join(distribution, "sagejs-build-manifest.json"), serialize(pair.math));
  writeFileSync(join(distribution, "sagepython-build-manifest.json"), serialize(pair.python));
  writeLinuxBaselineMetadata(distribution, pair);
  writeInternalChecksums(distribution);
  return { distribution, pair };
}

function writeWindowsDistribution(directory) {
  const distribution = join(directory, "sagejs-windows-x64");
  mkdirSync(distribution);
  copyLicenseInventory(distribution);
  for (const name of ["LICENSE", "README.md", "DISTRIBUTION.md"]) {
    writeFileSync(join(distribution, name), `${name}\n`);
  }
  for (const name of ["sagejs.exe", "sagepython.exe"]) {
    writeFileSync(join(distribution, name), "fixture executable\n");
  }
  const pair = receipts();
  writeFileSync(join(distribution, "sagejs-build-manifest.json"), serialize(pair.math));
  writeFileSync(join(distribution, "sagepython-build-manifest.json"), serialize(pair.python));
  writeFileSync(
    join(distribution, "UNSIGNED-WINDOWS.txt"),
    "These Windows executables are not Authenticode-signed.\n" +
      "Verify the published SHA-256 checksum before running them.\n",
  );
  const manifest = {
    schema: "sagejs.windows-release-manifest-v1",
    signature: { scheme: "authenticode", status: "unsigned" },
    sourceCommit: commit,
    target: "windows-x64",
    version,
  };
  writeFileSync(join(distribution, "release.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  writeInternalChecksums(distribution);
  return { distribution, manifest, pair };
}

test("release arguments require explicit target floors and signing state", () => {
  const values = parseArguments([
    "--target", "linux-x64",
    "--archive", "candidate.tar.xz",
    "--checksum", "candidate.tar.xz.sha256",
    "--expected-version", version,
    "--expected-commit", commit,
    "--maximum-glibc", "2.28",
    "--signature", "unsigned",
    "--output", "acceptance.json",
  ]);
  assert.equal(values.target, "linux-x64");
  assert.throws(
    () => parseArguments([
      "--target", "macos-arm64",
      "--archive", "candidate.zip",
      "--benchmark", "candidate-benchmark.json",
      "--benchmark-checksum", "candidate-benchmark.json.sha256",
      "--checksum", "candidate.zip.sha256",
      "--expected-version", version,
      "--expected-commit", commit,
      "--maximum-macos", "13.5",
      "--signature", "unsigned",
      "--output", "acceptance.json",
    ]),
    /publishable macOS artifact must be Developer ID signed/,
  );
});

test("external archive checksums bind both bytes and basename", () =>
  withTemporary((directory) => {
    const archive = join(directory, "sagejs-linux-x64.tar.xz");
    const sidecar = `${archive}.sha256`;
    writeFileSync(archive, "archive bytes");
    writeFileSync(sidecar, `${hash("archive bytes")}  sagejs-linux-x64.tar.xz\n`);
    assert.equal(verifyChecksum(archive, sidecar), hash("archive bytes"));
    writeFileSync(archive, "changed bytes");
    assert.throws(() => verifyChecksum(archive, sidecar), /SHA-256 mismatch/);
    writeFileSync(sidecar, `${hash("changed bytes")}  another.tar.xz\n`);
    assert.throws(() => verifyChecksum(archive, sidecar), /checksum names/);
  }));

test("archive inventory covers every file and every executable bit", () =>
  withTemporary((directory) => {
    const { distribution } = writeDistribution(directory);
    const result = verifyInternalChecksums(distribution, TARGETS["linux-x64"]);
    assert.ok(result.files.includes("licenses/THIRD-PARTY.json"));
    writeFileSync(join(distribution, "licenses", "undeclared.txt"), "surprise\n");
    assert.throws(
      () => verifyInternalChecksums(distribution, TARGETS["linux-x64"]),
      /internal SHA256SUMS must cover every shipped file/,
    );
  }));

test("Linux archive metadata is required and binds baseline source and Node authority", () => {
  withTemporary((directory) => {
    const { distribution, pair } = writeDistribution(directory);
    const options = {
      "expected-commit": commit,
      "expected-version": version,
      target: "linux-x64",
    };
    const evidence = validateTargetMetadata(distribution, pair, options);
    assert.equal(evidence.schema, "sagejs.linux-baseline-receipt-v1");

    const filename = join(distribution, "linux-baseline-receipt.json");
    const baseline = JSON.parse(readFileSync(filename, "utf8"));
    baseline.sourceCommit = "f".repeat(40);
    writeFileSync(filename, `${JSON.stringify(baseline, null, 2)}\n`);
    assert.throws(
      () => validateTargetMetadata(distribution, pair, options),
      /invalid release identity/,
    );
  });
  withTemporary((directory) => {
    const { distribution, pair } = writeDistribution(directory);
    const filename = join(distribution, "linux-baseline-receipt.json");
    const baseline = JSON.parse(readFileSync(filename, "utf8"));
    baseline.nodeSource.sha256 = "0".repeat(64);
    writeFileSync(filename, `${JSON.stringify(baseline, null, 2)}\n`);
    assert.throws(
      () => validateTargetMetadata(distribution, pair, {
        "expected-commit": commit,
        "expected-version": version,
        target: "linux-x64",
      }),
      /Node authority differs/,
    );
  });
  withTemporary((directory) => {
    const { distribution, pair } = writeDistribution(directory);
    const filename = join(distribution, "linux-baseline-receipt.json");
    const baseline = JSON.parse(readFileSync(filename, "utf8"));
    baseline.rustToolchain.sha256 = "0".repeat(64);
    writeFileSync(filename, `${JSON.stringify(baseline, null, 2)}\n`);
    assert.throws(
      () => validateTargetMetadata(distribution, pair, {
        "expected-commit": commit,
        "expected-version": version,
        target: "linux-x64",
      }),
      /Rust authority differs/,
    );
  });
  withTemporary((directory) => {
    const { distribution, pair } = writeDistribution(directory);
    const filename = join(distribution, "linux-baseline-receipt.json");
    const baseline = JSON.parse(readFileSync(filename, "utf8"));
    baseline.seaArtifacts.artifacts["sea/sagejs"].sha256 = "0".repeat(64);
    writeFileSync(filename, `${JSON.stringify(baseline, null, 2)}\n`);
    assert.throws(
      () => validateTargetMetadata(distribution, pair, {
        "expected-commit": commit,
        "expected-version": version,
        target: "linux-x64",
      }),
      /sea\/sagejs differs from archive/,
    );
  });
  withTemporary((directory) => {
    const { distribution, pair } = writeDistribution(directory);
    const filename = join(distribution, "linux-baseline-receipt.json");
    const baseline = JSON.parse(readFileSync(filename, "utf8"));
    baseline.seaArtifacts.executables.sagejs.nativeInputReportSha256 = "0".repeat(64);
    writeFileSync(filename, `${JSON.stringify(baseline, null, 2)}\n`);
    assert.throws(
      () => validateTargetMetadata(distribution, pair, {
        "expected-commit": commit,
        "expected-version": version,
        target: "linux-x64",
      }),
      /executable evidence differs/,
    );
  });
  withTemporary((directory) => {
    const { distribution, pair } = writeDistribution(directory);
    const filename = join(distribution, "linux-baseline-receipt.json");
    const baseline = JSON.parse(readFileSync(filename, "utf8"));
    delete baseline.inspection.aggregate.dependencies;
    writeFileSync(filename, `${JSON.stringify(baseline, null, 2)}\n`);
    assert.throws(
      () => validateTargetMetadata(distribution, pair, {
        "expected-commit": commit,
        "expected-version": version,
        target: "linux-x64",
      }),
      /no dependency inventory/,
    );
  });
  withTemporary((directory) => {
    const { distribution, pair } = writeDistribution(directory);
    const filename = join(distribution, "linux-baseline-receipt.json");
    const baseline = JSON.parse(readFileSync(filename, "utf8"));
    baseline.seaProbe.observed.temporal = "undefined";
    writeFileSync(filename, `${JSON.stringify(baseline, null, 2)}\n`);
    assert.throws(
      () => validateTargetMetadata(distribution, pair, {
        "expected-commit": commit,
        "expected-version": version,
        target: "linux-x64",
      }),
      /Temporal observation differs/,
    );
  });
  withTemporary((directory) => {
    const { distribution, pair } = writeDistribution(directory);
    const filename = join(distribution, "linux-baseline-receipt.json");
    const baseline = JSON.parse(readFileSync(filename, "utf8"));
    delete baseline.seaProbe.inspection.aggregate.dependencies;
    writeFileSync(filename, `${JSON.stringify(baseline, null, 2)}\n`);
    assert.throws(
      () => validateTargetMetadata(distribution, pair, {
        "expected-commit": commit,
        "expected-version": version,
        target: "linux-x64",
      }),
      /SEA Temporal probe is invalid/,
    );
  });
  withTemporary((directory) => {
    const { distribution } = writeDistribution(directory);
    rmSync(join(distribution, "linux-baseline-receipt.json"));
    assert.throws(
      () => verifyInternalChecksums(distribution, TARGETS["linux-x64"]),
      /missing linux-baseline-receipt.json/,
    );
  });
  withTemporary((directory) => {
    const { distribution } = writeDistribution(directory);
    writeFileSync(join(distribution, "release.json"), "{}\n");
    assert.throws(
      () => verifyInternalChecksums(distribution, TARGETS["linux-x64"]),
      /unexpected archive entry release.json/,
    );
  });
});

test("Windows archive metadata is required and binds explicit unsigned evidence", () => {
  const options = {
    "expected-commit": commit,
    "expected-version": version,
    target: "windows-x64",
  };
  withTemporary((directory) => {
    const { distribution, pair } = writeWindowsDistribution(directory);
    verifyInternalChecksums(distribution, TARGETS["windows-x64"]);
    const evidence = validateTargetMetadata(distribution, pair, options);
    assert.deepEqual(evidence.signature, { scheme: "authenticode", status: "unsigned" });
  });
  withTemporary((directory) => {
    const { distribution } = writeWindowsDistribution(directory);
    rmSync(join(distribution, "UNSIGNED-WINDOWS.txt"));
    assert.throws(
      () => verifyInternalChecksums(distribution, TARGETS["windows-x64"]),
      /missing UNSIGNED-WINDOWS.txt/,
    );
  });
  withTemporary((directory) => {
    const { distribution, pair } = writeWindowsDistribution(directory);
    writeFileSync(join(distribution, "UNSIGNED-WINDOWS.txt"), "unsigned\n");
    assert.throws(
      () => validateTargetMetadata(distribution, pair, options),
      /notice differs/,
    );
  });
  withTemporary((directory) => {
    const { distribution, manifest, pair } = writeWindowsDistribution(directory);
    manifest.signature.status = "signed";
    writeFileSync(join(distribution, "release.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    assert.throws(
      () => validateTargetMetadata(distribution, pair, options),
      /invalid identity/,
    );
  });
  withTemporary((directory) => {
    const { distribution } = writeWindowsDistribution(directory);
    writeFileSync(join(distribution, "linux-baseline-receipt.json"), "{}\n");
    assert.throws(
      () => verifyInternalChecksums(distribution, TARGETS["windows-x64"]),
      /unexpected archive entry linux-baseline-receipt.json/,
    );
  });
});

test("archive preflight rejects traversal, links, and duplicate members", () => {
  assert.deepEqual(
    validateArchiveMembers([
      { directory: true, name: "sagejs-linux-x64/", regular: false },
      { directory: false, name: "sagejs-linux-x64/sagejs", regular: true },
    ], "sagejs-linux-x64"),
    ["sagejs-linux-x64", "sagejs-linux-x64/sagejs"],
  );
  assert.throws(
    () => validateArchiveMembers([
      { directory: false, name: "sagejs-linux-x64/../escape", regular: true },
    ], "sagejs-linux-x64"),
    /unsafe archive member/,
  );
  assert.throws(
    () => validateArchiveMembers([
      { directory: false, name: "sagejs-linux-x64/link", regular: false },
    ], "sagejs-linux-x64"),
    /link or special entry/,
  );
  assert.throws(
    () => validateArchiveMembers([
      { directory: false, name: "sagejs-linux-x64/sagejs", regular: true },
      { directory: false, name: "sagejs-linux-x64/sagejs", regular: true },
    ], "sagejs-linux-x64"),
    /duplicate archive member/,
  );
});

test("ZIP preflight binds each local header to its safe central entry", () =>
  withTemporary((directory) => {
    const name = Buffer.from("sagejs-windows-x64/sagejs.exe", "ascii");
    const data = Buffer.from("x");
    const local = Buffer.alloc(30 + name.length + data.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt32LE(1, 18);
    local.writeUInt32LE(1, 22);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    data.copy(local, 30 + name.length);
    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt32LE(1, 20);
    central.writeUInt32LE(1, 24);
    central.writeUInt16LE(name.length, 28);
    name.copy(central, 46);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(1, 8);
    eocd.writeUInt16LE(1, 10);
    eocd.writeUInt32LE(central.length, 12);
    eocd.writeUInt32LE(local.length, 16);
    const filename = join(directory, "valid.zip");
    const valid = Buffer.concat([local, central, eocd]);
    writeFileSync(filename, valid);
    assert.equal(zipArchiveMembers(filename)[0].name, name.toString("ascii"));
    for (const unsupported of [0x40, 0x2000]) {
      const changedFlags = Buffer.from(valid);
      changedFlags.writeUInt16LE(unsupported, 6);
      changedFlags.writeUInt16LE(unsupported, local.length + 8);
      writeFileSync(filename, changedFlags);
      assert.throws(() => zipArchiveMembers(filename), /encrypted, streamed/);
    }
    const changed = Buffer.from(valid);
    changed[30] = ".".charCodeAt(0);
    writeFileSync(filename, changed);
    assert.throws(() => zipArchiveMembers(filename), /local\/central ZIP metadata mismatch/);
  }));

test("Node Rust corpus retains the utf8_iter copyright attribution", () => {
  const corpus = readFileSync(
    join(root, "licenses", "NODE-26.7.0-RUST-CRATES-LICENSES.txt"),
    "utf8",
  );
  assert.match(corpus, /source file: deps\/crates\/vendor\/utf8_iter-v1\/COPYRIGHT/);
  assert.match(corpus, /Copyright Mozilla Foundation/);
  assert.match(corpus, /adapted from the\nCharIndices implementation/);
});

test("ZIP preflight accepts the rooted fflate Windows producer", () =>
  withTemporary((directory) => {
    const filename = join(directory, "windows.zip");
    writeFileSync(filename, zipSync({
      "sagejs-windows-x64": {
        "UNSIGNED-WINDOWS.txt": strToU8("unsigned\n"),
        "sagejs.exe": strToU8("PE fixture\n"),
      },
    }));
    assert.deepEqual(
      zipArchiveMembers(filename).map(({ name }) => name),
      [
        "sagejs-windows-x64/",
        "sagejs-windows-x64/UNSIGNED-WINDOWS.txt",
        "sagejs-windows-x64/sagejs.exe",
      ],
    );
    const extracted = join(directory, "expanded");
    assert.equal(
      extractArchive(filename, "windows-x64", extracted),
      join(extracted, "sagejs-windows-x64"),
    );
    assert.equal(
      readFileSync(join(extracted, "sagejs-windows-x64", "sagejs.exe"), "utf8"),
      "PE fixture\n",
    );
  }));

test("ZIP preflight accepts signed data descriptors and binds their sizes", () =>
  withTemporary((directory) => {
    const name = Buffer.from("sagejs-macos-arm64/sagejs", "ascii");
    const data = Buffer.from("x");
    const crc = 0x8cdc1683;
    const local = Buffer.alloc(30 + name.length + data.length + 16);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 6);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    data.copy(local, 30 + name.length);
    const descriptor = 30 + name.length + data.length;
    local.writeUInt32LE(0x08074b50, descriptor);
    local.writeUInt32LE(crc, descriptor + 4);
    local.writeUInt32LE(1, descriptor + 8);
    local.writeUInt32LE(1, descriptor + 12);
    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(8, 8);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(1, 20);
    central.writeUInt32LE(1, 24);
    central.writeUInt16LE(name.length, 28);
    name.copy(central, 46);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(1, 8);
    eocd.writeUInt16LE(1, 10);
    eocd.writeUInt32LE(central.length, 12);
    eocd.writeUInt32LE(local.length, 16);
    const filename = join(directory, "streamed.zip");
    writeFileSync(filename, Buffer.concat([local, central, eocd]));
    assert.equal(zipArchiveMembers(filename)[0].name, name.toString("ascii"));
    const changed = readFileSync(filename);
    changed.writeUInt32LE(2, descriptor + 8);
    writeFileSync(filename, changed);
    assert.throws(() => zipArchiveMembers(filename), /invalid streamed ZIP descriptor/);
  }));

test("ZIP preflight rejects unreviewed Unix and semantic extra fields", () => {
  const unknown = Buffer.alloc(4);
  unknown.writeUInt16LE(0x756e, 0);
  assert.throws(
    () => validateZipExtra(unknown, 0, unknown.length, "candidate", "central"),
    /unsupported ZIP extra field/,
  );
  const dittoCentral = Buffer.alloc(12);
  dittoCentral.writeUInt16LE(0x5855, 0);
  dittoCentral.writeUInt16LE(8, 2);
  assert.doesNotThrow(
    () => validateZipExtra(dittoCentral, 0, dittoCentral.length, "candidate", "central"),
  );
  assert.throws(
    () => validateZipExtra(dittoCentral, 0, dittoCentral.length, "candidate", "local"),
    /unsupported ZIP extra field/,
  );
});

test("third-party inventory binds Node and every complete notice", () =>
  withTemporary((directory) => {
    const distribution = join(directory, "distribution");
    mkdirSync(distribution);
    copyLicenseInventory(distribution);
    const result = validateThirdPartyInventory(
      distribution,
      receipts(),
      { target: "linux-x64" },
    );
    assert.equal(result.dependencies.length, 36);
    assert.equal(
      result.nodeSource.sha256,
      nodeSource.sha256,
    );
    assert.equal(result.npmPackages, 68);
    writeFileSync(join(distribution, "licenses", "LGPL-3.0.txt"), "changed\n");
    assert.throws(
      () => validateThirdPartyInventory(distribution, receipts(), { target: "linux-x64" }),
      /notice is absent or changed: LGPL-3.0.txt/,
    );
  }));

test("third-party inventory rejects a stale SEA Node builder", () =>
  withTemporary((directory) => {
    const distribution = join(directory, "distribution");
    mkdirSync(distribution);
    copyLicenseInventory(distribution);
    const stale = receipts();
    stale.python.toolchain.seaNode.version = "26.5.1";
    assert.throws(
      () => validateThirdPartyInventory(distribution, stale, { target: "linux-x64" }),
      /Node license inventory does not match both SEA builder receipts/,
    );
  }));

test("native dependency acceptance rejects libatomic and newer GLIBC", () => {
  const ordinary = buildReceipt(true, nativeBinaries([
    "libc.so.6", "libgcc_s.so.1", "libm.so.6", "libstdc++.so.6",
  ]));
  assert.equal(
    validateNativeReceipt(
      ordinary,
      { target: "linux-x64", "maximum-glibc": "2.28" },
      "sagejs",
    ).maximumGlibc,
    "2.28",
  );
  const atomic = buildReceipt(true, nativeBinaries(["libatomic.so.1", "libc.so.6"]));
  assert.throws(
    () => validateNativeReceipt(
      atomic,
      { target: "linux-x64", "maximum-glibc": "2.28" },
      "sagejs",
    ),
    /non-system runtime dependencies: libatomic.so.1/,
  );
  const newer = buildReceipt(true, nativeBinaries(["libc.so.6"], "2.38"));
  assert.throws(
    () => validateNativeReceipt(
      newer,
      { target: "linux-x64", "maximum-glibc": "2.28" },
      "sagejs",
    ),
    /requires GLIBC 2.38/,
  );
});

test("PE certificate-table evidence distinguishes unsigned from signed bytes", () =>
  withTemporary((directory) => {
    const make = (name, signed) => {
      const bytes = Buffer.alloc(signed ? 0x208 : 0x200);
      bytes.writeUInt16LE(0x5a4d, 0);
      bytes.writeUInt32LE(0x80, 0x3c);
      bytes.write("PE\0\0", 0x80, "binary");
      bytes.writeUInt16LE(0x20b, 0x80 + 24);
      if (signed) {
        bytes.writeUInt32LE(0x200, 0x80 + 24 + 112 + 8 * 4);
        bytes.writeUInt32LE(8, 0x80 + 24 + 112 + 8 * 4 + 4);
      }
      const filename = join(directory, name);
      writeFileSync(filename, bytes);
      return filename;
    };
    assert.deepEqual(peCertificateTable(make("unsigned.exe", false)), {
      offset: 0,
      size: 0,
    });
    assert.deepEqual(peCertificateTable(make("signed.exe", true)), {
      offset: 0x200,
      size: 8,
    });
  }));

test("macOS installer acceptance rejects privileged package scripts", () =>
  withTemporary((directory) => {
    assert.doesNotThrow(() => assertInstallerHasNoScripts(directory, "<pkg-info/>"));
    mkdirSync(join(directory, "Scripts"));
    assert.throws(
      () => assertInstallerHasNoScripts(directory, "<pkg-info/>"),
      /privileged install scripts/,
    );
    rmSync(join(directory, "Scripts"), { recursive: true });
    assert.throws(
      () => assertInstallerHasNoScripts(directory, "<pkg-info><scripts/></pkg-info>"),
      /privileged install scripts/,
    );
  }));

test("macOS benchmark acceptance rejects empty and inconsistent samples", () => {
  const statistics = (samples) => ({
    maximum_ms: Math.max(...samples),
    median_ms: [...samples].sort((left, right) => left - right)[Math.floor(samples.length / 2)],
    minimum_ms: Math.min(...samples),
    samples_ms: samples,
  });
  const valid = {
    cold: statistics([4, 6, 5]),
    process_startup: statistics([1, 3, 2]),
    warm: statistics([2, 4, 3]),
  };
  assert.equal(validateBenchmarkStatistics(valid), 3);
  assert.throws(
    () => validateBenchmarkStatistics({ ...valid, cold: statistics([]) }),
    /invalid cold samples/,
  );
  assert.throws(
    () => validateBenchmarkStatistics({ ...valid, warm: statistics([1]) }),
    /sample counts differ/,
  );
  assert.throws(
    () => validateBenchmarkStatistics({
      ...valid,
      process_startup: { ...valid.process_startup, median_ms: 99 },
    }),
    /inconsistent process_startup statistics/,
  );
});

test("final acceptance emits one checksum-bound canonical receipt", () =>
  withTemporary((directory) => {
    const { distribution } = writeDistribution(directory);
    const archive = join(directory, "sagejs-linux-x64.tar.xz");
    const checksum = `${archive}.sha256`;
    const output = join(directory, "acceptance.json");
    writeFileSync(archive, "final archive bytes");
    writeFileSync(checksum, `${hash("final archive bytes")}  sagejs-linux-x64.tar.xz\n`);
    const result = acceptReleaseArtifact(
      {
        archive,
        checksum,
        "expected-commit": commit,
        "expected-version": version,
        "maximum-glibc": "2.28",
        output,
        signature: "unsigned",
        target: "linux-x64",
      },
      {
        assertHostTarget: () => {},
        extractArchive: () => distribution,
        verifyRuntime: () => ({
          mathematicsReportSha256: "f".repeat(64),
          nativeWitnesses: [],
          pythonSelfTest: "Sage.js Jupyter SEA runtime passed.",
          versions: { sagejs: `sagejs ${version}`, sagepython: `sagejs ${version}` },
        }),
        verifySignatures: () => ({ mode: "unsigned-not-applicable" }),
      },
    );
    assert.equal(result.receipt.checks.licenseAndSourceInventory, true);
    assert.equal(result.receipt.source.commit, commit);
    assert.equal(result.receipt.thirdParty.dependencies.length, 36);
    assert.equal(readFileSync(output, "utf8"), serialize(result.receipt));
    assert.equal(
      readFileSync(`${output}.sha256`, "utf8"),
      `${result.receiptSha256}  acceptance.json\n`,
    );
  }));
