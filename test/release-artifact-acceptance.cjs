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
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");

const {
  acceptReleaseArtifact,
  parseArguments,
  peCertificateTable,
  validateArchiveMembers,
  validateNativeReceipt,
  validateThirdPartyInventory,
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
  const visit = (base, prefix = "") => {
    const entries = require("node:fs").readdirSync(join(base, prefix), {
      withFileTypes: true,
    });
    return entries.flatMap((entry) => {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      return entry.isDirectory() ? visit(base, path) : [path];
    });
  };
  const files = visit(distribution).filter((name) => name !== "SHA256SUMS").sort();
  writeFileSync(
    join(distribution, "SHA256SUMS"),
    `${files.map((name) => `${hash(readFileSync(join(distribution, name)))}  ${name}`).join("\n")}\n`,
  );
  return { distribution, pair };
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
    const result = verifyInternalChecksums(distribution, {
      executableNames: ["sagejs", "sagepython"],
    });
    assert.ok(result.files.includes("licenses/THIRD-PARTY.json"));
    writeFileSync(join(distribution, "licenses", "undeclared.txt"), "surprise\n");
    assert.throws(
      () => verifyInternalChecksums(distribution, {
        executableNames: ["sagejs", "sagepython"],
      }),
      /internal SHA256SUMS must cover every shipped file/,
    );
  }));

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
    writeFileSync(filename, Buffer.concat([local, central, eocd]));
    assert.equal(zipArchiveMembers(filename)[0].name, name.toString("ascii"));
    const changed = readFileSync(filename);
    changed[30] = ".".charCodeAt(0);
    writeFileSync(filename, changed);
    assert.throws(() => zipArchiveMembers(filename), /local\/central ZIP metadata mismatch/);
  }));

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
    assert.equal(result.dependencies.length, 34);
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
    assert.equal(result.receipt.thirdParty.dependencies.length, 34);
    assert.equal(readFileSync(output, "utf8"), serialize(result.receipt));
    assert.equal(
      readFileSync(`${output}.sha256`, "utf8"),
      `${result.receiptSha256}  acceptance.json\n`,
    );
  }));
