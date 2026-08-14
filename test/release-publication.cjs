"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { dirname, join } = require("node:path");
const test = require("node:test");
const { strToU8, zipSync } = require("fflate");

const {
  SCHEMA,
  platforms,
  preparePublication,
  regularFiles,
} = require("../scripts/prepare-release-publication.cjs");
const {
  createWindowsReleaseZip,
} = require("../scripts/create-windows-release-zip.cjs");

const COMMIT = "0123456789abcdef0123456789abcdef01234567";
const VERSION = "1.2.3";
const LINUX_RELEASE_CHECKS = [
  "artifactBoundBuildReceipts",
  "cacheAndTemporaryBounds",
  "corruptInstallRejected",
  "deterministicReleaseArchive",
  "exactMathematics",
  "installer",
  "installerUpgrade",
  "m4riNativeWitness",
  "nativeCapabilities",
  "noAdjacentRuntime",
  "noExternalNode",
  "pythonRuntime",
];
const ACCEPTANCE_CHECKS = [
  "archiveContents",
  "archiveSha256",
  "buildReceiptBinding",
  "exactMathematics",
  "licenseAndSourceInventory",
  "nativeDependencyClosure",
  "relocatedRuntime",
  "signaturePolicy",
];

function sha256(filename) {
  return createHash("sha256").update(readFileSync(filename)).digest("hex");
}

function windowsArchive(root, archive, overrides = {}) {
  const directory = join(root, "sagejs-windows-x64");
  rmSync(directory, { force: true, recursive: true });
  rmSync(archive, { force: true });
  mkdirSync(directory, { recursive: true });
  const manifest = {
    schema: "sagejs.windows-release-manifest-v1",
    signature: { scheme: "authenticode", status: "unsigned" },
    sourceCommit: COMMIT,
    target: "windows-x64",
    version: VERSION,
    ...overrides,
  };
  writeFileSync(join(directory, "release.json"), `${JSON.stringify(manifest)}\n`);
  writeFileSync(
    join(directory, "UNSIGNED-WINDOWS.txt"),
    "These executables are not Authenticode-signed. Verify SHA-256 first.\n",
  );
  writeFileSync(join(directory, "sagejs.exe"), "sagejs exe\n");
  writeFileSync(join(directory, "sagepython.exe"), "sagepython exe\n");
  for (const name of ["sagejs", "sagepython"]) {
    writeFileSync(
      join(directory, `${name}-build-manifest.json`),
      `${JSON.stringify({
        sagejsVersion: VERSION,
        schema: "sagejs.release-build-manifest-v1",
        source: { commit: COMMIT },
        target: { arch: "x64", platform: "win32" },
      })}\n`,
    );
  }
  for (const name of ["DISTRIBUTION.md", "LICENSE", "README.md"]) {
    writeFileSync(join(directory, name), readFileSync(join(__dirname, "..", name)));
  }
  mkdirSync(join(directory, "licenses"), { recursive: true });
  const sourceLicenses = join(__dirname, "../licenses");
  for (const name of readdirSync(sourceLicenses)) {
    writeFileSync(join(directory, "licenses", name), readFileSync(join(sourceLicenses, name)));
  }
  const files = [];
  const collect = (current, prefix = "") => {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort(
      (left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
    )) {
      const relativeName = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) collect(join(current, entry.name), relativeName);
      else files.push(relativeName);
    }
  };
  collect(directory);
  writeFileSync(
    join(directory, "SHA256SUMS"),
    `${files.map((name) => `${sha256(join(directory, ...name.split("/")))}  ${name}`).join("\n")}\n`,
  );
  createWindowsReleaseZip(directory, archive);
}

function writeAdversarialZip(archive, entry) {
  if (entry !== "sagejs-windows-x64/release.json") {
    writeFileSync(archive, zipSync({ [entry]: strToU8("bad") }));
    return;
  }
  const alternate = "sagejs-windows-x64/notices.json";
  const duplicate = Buffer.from(entry, "ascii");
  const original = Buffer.from(alternate, "ascii");
  assert.equal(original.length, duplicate.length);
  const bytes = Buffer.from(zipSync({
    [entry]: strToU8("first"),
    [alternate]: strToU8("second"),
  }));
  let replacements = 0;
  for (let offset = bytes.indexOf(original); offset >= 0; offset = bytes.indexOf(original, offset)) {
    duplicate.copy(bytes, offset);
    offset += duplicate.length;
    replacements += 1;
  }
  assert.equal(replacements, 2, "fixture must replace local and central ZIP names");
  writeFileSync(archive, bytes);
}

function writeLinuxEvidence(directory, platform) {
  const prefix = `sagejs-${platform}`;
  const archive = `${prefix}.tar.xz`;
  const checksum = `${archive}.sha256`;
  const reportName = `${prefix}.report.json`;
  const architecture = platform === "linux-arm64" ? "arm64" : "x64";
  const nodeSource = {
    filename: "node-v26.7.0.tar.xz",
    sha256: "e6b182cbeeab032d1082ca4ac4fe15e3a57de691d3bde78ecf8a761fd56ee356",
    url: "https://nodejs.org/dist/v26.7.0/node-v26.7.0.tar.xz",
    version: "26.7.0",
  };
  const receipt = (nativeMathematics) => ({
    capabilities: { artifact: { nativeMathematics } },
    sagejsVersion: VERSION,
    source: { commit: COMMIT },
    target: { arch: architecture, platform: "linux" },
    toolchain: { seaNode: { source: nodeSource, version: "26.7.0" } },
  });
  const report = {
    artifacts: {
      archive: { sha256: sha256(join(directory, archive)) },
    },
    buildReceipts: {
      baseline: {
        nodeSource,
        platform,
        schema: "sagejs.linux-baseline-receipt-v1",
        sourceCommit: COMMIT,
      },
      math: receipt(true),
      python: receipt(false),
    },
    checks: Object.fromEntries(LINUX_RELEASE_CHECKS.map((name) => [name, true])),
    schemaVersion: 2,
  };
  writeFileSync(join(directory, reportName), `${JSON.stringify(report)}\n`);
  writeFileSync(
    join(directory, checksum),
    `${sha256(join(directory, archive))}  ${archive}\n`,
  );
  const artifacts = Object.fromEntries(
    [archive, checksum, reportName].map((name) => [name, sha256(join(directory, name))]),
  );
  writeFileSync(
    join(directory, `${prefix}.release.json`),
    `${JSON.stringify({
      artifacts,
      schema: "sagejs.linux-release-readiness/v1",
    })}\n`,
  );
}

function writeAcceptanceEvidence(directory, platform, policy) {
  const archive = policy.checksums[0][0];
  const name = `sagejs-${platform}-acceptance.json`;
  const macos = platform === "macos-arm64";
  const packageName = macos ? policy.checksums[1][0] : null;
  const benchmarkName = macos ? policy.checksums[2][0] : null;
  const receipt = {
    archive: {
      name: archive,
      sha256: sha256(join(directory, archive)),
      size: readFileSync(join(directory, archive)).length,
    },
    benchmark: macos
      ? {
          benchmarkSha256: sha256(join(directory, benchmarkName)),
          reportSha256: "b".repeat(64),
          samples: [{ milliseconds: 1 }],
        }
      : null,
    checks: Object.fromEntries(ACCEPTANCE_CHECKS.map((check) => [check, true])),
    schema: "sagejs.release-artifact-acceptance-v1",
    signatures: {
      mode: policy.acceptanceSignature,
      ...(platform === "windows-x64"
        ? {
            executables: ["sagejs.exe", "sagepython.exe"].map((executable) => ({
              certificateTableOffset: 0,
              certificateTableSize: 0,
              executable,
            })),
          }
        : {}),
      ...(macos
        ? {
            package: {
              name: packageName,
              sha256: sha256(join(directory, packageName)),
            },
          }
        : {}),
    },
    source: { commit: COMMIT },
    target: {
      arch: policy.arch,
      platform: platform.startsWith("linux-")
        ? "linux"
        : platform.startsWith("macos-")
          ? "darwin"
          : "win32",
    },
    version: VERSION,
  };
  writeFileSync(join(directory, name), `${JSON.stringify(receipt, null, 2)}\n`);
  writeFileSync(
    join(directory, `${name}.sha256`),
    `${sha256(join(directory, name))}  ${name}\n`,
  );
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "sagejs-release-publication-"));
  const input = join(root, "input");
  const output = join(root, "output");
  for (const [platform, policy] of Object.entries(platforms)) {
    const directory = join(input, platform);
    mkdirSync(directory, { recursive: true });
    for (const path of policy.files) {
      if (
        path.endsWith(".sha256") ||
        path.endsWith(".release.json") ||
        path.endsWith("-acceptance.json")
      ) continue;
      const filename = join(directory, path);
      mkdirSync(dirname(filename), { recursive: true });
      if (path === "sagejs-windows-x64-unsigned.zip") {
        windowsArchive(root, filename);
      } else {
        writeFileSync(filename, `${platform}:${path}\n`);
      }
    }
    for (const [target, receipt] of policy.checksums) {
      writeFileSync(
        join(directory, receipt),
        `${sha256(join(directory, target))}  ${target}\n`,
      );
    }
    if (platform.startsWith("linux-")) writeLinuxEvidence(directory, platform);
    writeAcceptanceEvidence(directory, platform, policy);
  }
  const sourceArtifacts = Object.fromEntries(
    Object.keys(platforms).map((platform, index) => [
      platform,
      { artifactDigestSha256: String(index + 1).repeat(64), artifactId: String(100 + index) },
    ]),
  );
  const options = {
    commit: COMMIT,
    inputDirectory: input,
    outputDirectory: output,
    repository: "sagemathinc/sagejs",
    runAttempt: "2",
    runId: "987654",
    sourceArtifacts,
    tag: `v${VERSION}`,
  };
  return {
    cleanup: () => rmSync(root, { force: true, recursive: true }),
    input,
    options,
    output,
    root,
  };
}

test("publication assembly accepts exactly four identity-bound platform artifacts", () => {
  const workspace = fixture();
  try {
    const provenance = preparePublication(workspace.options);
    assert.equal(provenance.schema, SCHEMA);
    assert.equal(provenance.source.commit, COMMIT);
    assert.equal(provenance.source.workflowRun.id, 987654);
    assert.match(provenance.policy.windows, /^UNSIGNED:/);
    assert.equal(provenance.artifacts.length, 25);
    assert.equal(
      provenance.artifacts.find(({ path }) => path === "sagejs-windows-x64-unsigned.zip")
        .signature,
      "unsigned-windows",
    );
    const sums = readFileSync(join(workspace.output, "assets", "SHA256SUMS"), "utf8");
    for (const name of [
      "sagejs-linux-x64.tar.xz",
      "sagejs-linux-arm64.tar.xz",
      "sagejs-windows-x64-unsigned.zip",
      "sagejs-macos-arm64.zip",
      "sagejs-macos-arm64.pkg",
      "release-provenance.json",
    ]) {
      assert.match(sums, new RegExp(`  ${name.replaceAll(".", "\\.")}\\n`));
    }
    const persisted = JSON.parse(
      readFileSync(join(workspace.output, "assets", "release-provenance.json"), "utf8"),
    );
    assert.deepEqual(persisted, provenance);
  } finally {
    workspace.cleanup();
  }
});

test("publication inventory accepts a real root beneath a canonical parent alias", (t) => {
  const root = mkdtempSync(join(tmpdir(), "sagejs-release-parent-alias-"));
  try {
    const physicalParent = join(root, "physical");
    const platformRoot = join(physicalParent, "platform");
    const aliasParent = join(root, "alias");
    mkdirSync(platformRoot, { recursive: true });
    writeFileSync(join(platformRoot, "artifact"), "release artifact\n");
    try {
      symlinkSync(
        physicalParent,
        aliasParent,
        process.platform === "win32" ? "junction" : "dir",
      );
    } catch (error) {
      if (process.platform === "win32" && error.code === "EPERM") {
        t.skip("creating a directory junction requires permission on this runner");
        return;
      }
      throw error;
    }
    assert.deepEqual(regularFiles(join(aliasParent, "platform")), ["artifact"]);
    const rootAlias = join(root, "platform-link");
    symlinkSync(
      platformRoot,
      rootAlias,
      process.platform === "win32" ? "junction" : "dir",
    );
    assert.throws(() => regularFiles(rootAlias), /must be a real directory/);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("unexpected intermediate artifacts and checksum tampering fail closed", () => {
  const unexpected = fixture();
  try {
    writeFileSync(join(unexpected.input, "macos-arm64", "tested-sea.tar"), "private input\n");
    assert.throws(
      () => preparePublication(unexpected.options),
      /macos-arm64 artifact contents/,
    );
  } finally {
    unexpected.cleanup();
  }

  const tampered = fixture();
  try {
    writeFileSync(join(tampered.input, "linux-arm64", "sagejs-linux-arm64.tar.xz"), "changed\n");
    assert.throws(() => preparePublication(tampered.options), /SHA-256 mismatch/);
  } finally {
    tampered.cleanup();
  }
});

test("publication requires source-bound passing native acceptance receipts", () => {
  for (const [mutate, expected] of [
    [
      (receipt) => { receipt.source.commit = "f".repeat(40); },
      /accepted source|strictEqual/,
    ],
    [
      (receipt) => { receipt.archive.sha256 = "f".repeat(64); },
      /accepted archive digest|strictEqual/,
    ],
    [
      (receipt) => { receipt.archive.size += 1; },
      /accepted archive size|strictEqual/,
    ],
    [
      (receipt) => { receipt.checks.exactMathematics = false; },
      /contains a failed check/,
    ],
    [
      (receipt) => { receipt.signatures.mode = "unsigned-not-applicable"; },
      /accepted signature mode|strictEqual/,
    ],
    [
      (receipt) => { receipt.signatures.package.sha256 = "f".repeat(64); },
      /accepted package digest|strictEqual/,
    ],
    [
      (receipt) => { receipt.benchmark.benchmarkSha256 = "f".repeat(64); },
      /accepted benchmark digest|strictEqual/,
    ],
  ]) {
    const workspace = fixture();
    try {
      const platform = "macos-arm64";
      const name = `sagejs-${platform}-acceptance.json`;
      const filename = join(workspace.input, platform, name);
      const receipt = JSON.parse(readFileSync(filename, "utf8"));
      mutate(receipt);
      writeFileSync(filename, `${JSON.stringify(receipt, null, 2)}\n`);
      writeFileSync(
        `${filename}.sha256`,
        `${sha256(filename)}  ${name}\n`,
      );
      assert.throws(() => preparePublication(workspace.options), expected);
    } finally {
      workspace.cleanup();
    }
  }
});

test("publication rejects a mixed macOS package or benchmark with refreshed sidecars", () => {
  for (const [name, expected] of [
    ["sagejs-macos-arm64.pkg", /accepted package digest|strictEqual/],
    ["sagejs-macos-arm64-benchmark.json", /accepted benchmark digest|strictEqual/],
  ]) {
    const workspace = fixture();
    try {
      const directory = join(workspace.input, "macos-arm64");
      const filename = join(directory, name);
      writeFileSync(filename, `${readFileSync(filename, "utf8")}mixed artifact\n`);
      writeFileSync(
        `${filename}.sha256`,
        `${sha256(filename)}  ${name}\n`,
      );
      assert.throws(() => preparePublication(workspace.options), expected);
    } finally {
      workspace.cleanup();
    }
  }
});

test("Linux readiness evidence is source-bound and fail-closed", () => {
  for (const [field, value, expected] of [
    ["sourceCommit", "f".repeat(40), /baseline.*sourceCommit|strictEqual/],
    ["platform", "linux-x64", /baseline.*platform|strictEqual/],
  ]) {
    const workspace = fixture();
    try {
      const platform = "linux-arm64";
      const filename = join(
        workspace.input,
        platform,
        `sagejs-${platform}.report.json`,
      );
      const report = JSON.parse(readFileSync(filename, "utf8"));
      report.buildReceipts.baseline[field] = value;
      writeFileSync(filename, `${JSON.stringify(report)}\n`);
      const readinessFilename = join(
        workspace.input,
        platform,
        `sagejs-${platform}.release.json`,
      );
      const readiness = JSON.parse(readFileSync(readinessFilename, "utf8"));
      readiness.artifacts[`sagejs-${platform}.report.json`] = sha256(filename);
      writeFileSync(readinessFilename, `${JSON.stringify(readiness)}\n`);
      assert.throws(() => preparePublication(workspace.options), expected);
    } finally {
      workspace.cleanup();
    }
  }
});

test("Linux release checks and capabilities are an exact ratchet", () => {
  for (const [mutate, expected] of [
    [
      (report) => { delete report.checks.pythonRuntime; },
      /release check inventory/,
    ],
    [
      (report) => { report.checks.unreviewedCheck = true; },
      /release check inventory/,
    ],
    [
      (report) => { report.checks.exactMathematics = false; },
      /contains a failed check/,
    ],
    [
      (report) => {
        report.buildReceipts.math.capabilities.artifact.nativeMathematics = false;
      },
      /mathematics SEA capability/,
    ],
    [
      (report) => {
        report.buildReceipts.python.capabilities.artifact.nativeMathematics = true;
      },
      /Python SEA capability/,
    ],
  ]) {
    const workspace = fixture();
    try {
      const platform = "linux-x64";
      const filename = join(
        workspace.input,
        platform,
        `sagejs-${platform}.report.json`,
      );
      const report = JSON.parse(readFileSync(filename, "utf8"));
      mutate(report);
      writeFileSync(filename, `${JSON.stringify(report)}\n`);
      const readinessFilename = join(
        workspace.input,
        platform,
        `sagejs-${platform}.release.json`,
      );
      const readiness = JSON.parse(readFileSync(readinessFilename, "utf8"));
      readiness.artifacts[`sagejs-${platform}.report.json`] = sha256(filename);
      writeFileSync(readinessFilename, `${JSON.stringify(readiness)}\n`);
      assert.throws(() => preparePublication(workspace.options), expected);
    } finally {
      workspace.cleanup();
    }
  }
});

test("Windows publication requires the explicit unsigned archive contract", () => {
  const workspace = fixture();
  try {
    const archive = join(
      workspace.input,
      "windows-x64",
      "sagejs-windows-x64-unsigned.zip",
    );
    windowsArchive(workspace.root, archive, {
      signature: { scheme: "authenticode", status: "signed" },
    });
    writeFileSync(
      `${archive}.sha256`,
      `${sha256(archive)}  sagejs-windows-x64-unsigned.zip\n`,
    );
    writeAcceptanceEvidence(
      join(workspace.input, "windows-x64"),
      "windows-x64",
      platforms["windows-x64"],
    );
    assert.throws(() => preparePublication(workspace.options), /status: 'signed'/);
  } finally {
    workspace.cleanup();
  }
});

test("Windows publication requires exact native acceptance evidence", () => {
  for (const mutate of [
    (receipt) => { receipt.source.commit = "f".repeat(40); },
    (receipt) => { delete receipt.checks.relocatedRuntime; },
    (receipt) => { receipt.signatures.executables[0].certificateTableSize = 8; },
  ]) {
    const workspace = fixture();
    try {
      const directory = join(workspace.input, "windows-x64");
      const name = "sagejs-windows-x64-acceptance.json";
      const filename = join(directory, name);
      const receipt = JSON.parse(readFileSync(filename, "utf8"));
      mutate(receipt);
      writeFileSync(filename, `${JSON.stringify(receipt)}\n`);
      writeFileSync(
        `${filename}.sha256`,
        `${sha256(filename)}  ${name}\n`,
      );
      assert.throws(() => preparePublication(workspace.options));
    } finally {
      workspace.cleanup();
    }
  }
});

test("Windows ZIP duplicate and traversal entries fail before publication", () => {
  for (const [entry, expected] of [
    ["sagejs-windows-x64/release.json", /duplicate archive member/],
    ["../debug.pdb", /unsafe archive member/],
  ]) {
    const workspace = fixture();
    try {
      const archive = join(
        workspace.input,
        "windows-x64",
        "sagejs-windows-x64-unsigned.zip",
      );
      writeAdversarialZip(archive, entry);
      writeFileSync(
        `${archive}.sha256`,
        `${sha256(archive)}  sagejs-windows-x64-unsigned.zip\n`,
      );
      writeAcceptanceEvidence(
        join(workspace.input, "windows-x64"),
        "windows-x64",
        platforms["windows-x64"],
      );
      assert.throws(() => preparePublication(workspace.options), expected);
    } finally {
      workspace.cleanup();
    }
  }
});

test("tag, source artifact identity, and nonempty output are enforced", () => {
  const missingIdentity = fixture();
  try {
    delete missingIdentity.options.sourceArtifacts["linux-arm64"];
    assert.throws(() => preparePublication(missingIdentity.options), /source artifacts are required/);
  } finally {
    missingIdentity.cleanup();
  }

  const badTag = fixture();
  try {
    badTag.options.tag = "release-1.2.3";
    assert.throws(() => preparePublication(badTag.options), /canonical vMAJOR/);
  } finally {
    badTag.cleanup();
  }

  const nonempty = fixture();
  try {
    mkdirSync(nonempty.output, { recursive: true });
    writeFileSync(join(nonempty.output, "old"), "old\n");
    assert.throws(() => preparePublication(nonempty.options), /must be empty/);
  } finally {
    nonempty.cleanup();
  }
});
