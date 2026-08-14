#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} = require("node:fs");
const { basename, dirname, join, relative, resolve, sep } = require("node:path");

const {
  hashRegularFile,
  serialize,
} = require("./release-manifest.cjs");
const {
  RECEIPT_SCHEMA: ARTIFACT_ACCEPTANCE_SCHEMA,
  preflightArchive,
} = require("./release-artifact-acceptance.cjs");

const SCHEMA = "sagejs.release-publication-provenance-v1";
const HASH = /^[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;
const VERSION = /^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?$/;
const ACCEPTANCE_SCHEMA = "sagejs.release-artifact-acceptance-v1";
const ACCEPTANCE_CHECKS = Object.freeze([
  "archiveContents",
  "archiveSha256",
  "buildReceiptBinding",
  "exactMathematics",
  "licenseAndSourceInventory",
  "nativeDependencyClosure",
  "relocatedRuntime",
  "signaturePolicy",
]);
const LINUX_RELEASE_CHECKS = Object.freeze([
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
]);

const platforms = {
  "linux-x64": {
    acceptanceSignature: "unsigned-not-applicable",
    arch: "x64",
    signature: "unsigned-linux",
    files: [
      "sagejs-linux-x64.tar.xz",
      "sagejs-linux-x64.tar.xz.sha256",
      "sagejs-linux-x64.report.json",
      "sagejs-linux-x64.release.json",
      "install.sh",
      "sagejs-linux-x64-acceptance.json",
      "sagejs-linux-x64-acceptance.json.sha256",
    ],
    checksums: [["sagejs-linux-x64.tar.xz", "sagejs-linux-x64.tar.xz.sha256"]],
  },
  "linux-arm64": {
    acceptanceSignature: "unsigned-not-applicable",
    arch: "arm64",
    signature: "unsigned-linux",
    files: [
      "sagejs-linux-arm64.tar.xz",
      "sagejs-linux-arm64.tar.xz.sha256",
      "sagejs-linux-arm64.report.json",
      "sagejs-linux-arm64.release.json",
      "sagejs-linux-arm64-acceptance.json",
      "sagejs-linux-arm64-acceptance.json.sha256",
    ],
    checksums: [["sagejs-linux-arm64.tar.xz", "sagejs-linux-arm64.tar.xz.sha256"]],
  },
  "windows-x64": {
    acceptanceSignature: "explicitly-unsigned-authenticode",
    arch: "x64",
    signature: "unsigned-windows",
    files: [
      "sagejs-windows-x64-unsigned.zip",
      "sagejs-windows-x64-unsigned.zip.sha256",
      "sagejs-windows-x64-acceptance.json",
      "sagejs-windows-x64-acceptance.json.sha256",
    ],
    checksums: [[
      "sagejs-windows-x64-unsigned.zip",
      "sagejs-windows-x64-unsigned.zip.sha256",
    ]],
  },
  "macos-arm64": {
    acceptanceSignature: "apple-developer-id",
    arch: "arm64",
    signature: "developer-id-notarized",
    files: [
      "sagejs-macos-arm64.zip",
      "sagejs-macos-arm64.zip.sha256",
      "sagejs-macos-arm64.pkg",
      "sagejs-macos-arm64.pkg.sha256",
      "sagejs-macos-arm64-benchmark.json",
      "sagejs-macos-arm64-benchmark.json.sha256",
      "sagejs-macos-arm64-acceptance.json",
      "sagejs-macos-arm64-acceptance.json.sha256",
    ],
    checksums: [
      ["sagejs-macos-arm64.zip", "sagejs-macos-arm64.zip.sha256"],
      ["sagejs-macos-arm64.pkg", "sagejs-macos-arm64.pkg.sha256"],
      [
        "sagejs-macos-arm64-benchmark.json",
        "sagejs-macos-arm64-benchmark.json.sha256",
      ],
    ],
  },
};

function parseArguments(argv) {
  const options = { sourceArtifacts: {} };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--input") options.inputDirectory = argv[++index];
    else if (argument === "--output") options.outputDirectory = argv[++index];
    else if (argument === "--tag") options.tag = argv[++index];
    else if (argument === "--commit") options.commit = argv[++index];
    else if (argument === "--repository") options.repository = argv[++index];
    else if (argument === "--run-id") options.runId = argv[++index];
    else if (argument === "--run-attempt") options.runAttempt = argv[++index];
    else if (argument === "--source-artifact") {
      const value = argv[++index] || "";
      const match = /^([a-z0-9-]+)=([0-9]+):(sha256:)?([0-9a-f]{64})$/.exec(value);
      if (!match) throw new Error(`invalid --source-artifact ${JSON.stringify(value)}`);
      options.sourceArtifacts[match[1]] = {
        artifactId: match[2],
        artifactDigestSha256: match[4],
      };
    } else {
      throw new Error(`unknown argument ${JSON.stringify(argument)}`);
    }
  }
  return options;
}

function regularFiles(root) {
  const absoluteRoot = resolve(root);
  const rootInformation = lstatSync(absoluteRoot);
  if (!rootInformation.isDirectory() || rootInformation.isSymbolicLink()) {
    throw new Error(`input platform root must be a real directory: ${absoluteRoot}`);
  }
  // Canonicalize the directory before walking it.  In particular, macOS
  // exposes /var through the system-owned /private/var alias, so a directory
  // created by mkdtempSync(tmpdir()) has a different lexical and physical
  // spelling even though the release root itself is not a symlink.  We still
  // reject a symlink in the final path component above and every symlink below.
  const physicalRoot = realpathSync.native(absoluteRoot);
  const files = [];
  const visit = (directory) => {
    for (const name of readdirSync(directory).sort()) {
      const filename = join(directory, name);
      const information = lstatSync(filename);
      if (information.isSymbolicLink()) {
        throw new Error(`release input may not contain a symlink: ${filename}`);
      }
      if (information.isDirectory()) visit(filename);
      else if (information.isFile()) {
        files.push(relative(physicalRoot, filename).split(sep).join("/"));
      } else {
        throw new Error(`release input must contain only ordinary files: ${filename}`);
      }
    }
  };
  visit(physicalRoot);
  return files;
}

function verifyChecksum(root, target, receipt) {
  const text = readFileSync(join(root, receipt), "utf8").trim();
  const match = /^([0-9a-f]{64})  ([^/\\\s]+)$/.exec(text);
  if (!match || match[2] !== basename(target)) {
    throw new Error(`noncanonical checksum receipt ${receipt}`);
  }
  const actual = hashRegularFile(root, join(root, target), target).sha256;
  if (actual !== match[1]) {
    throw new Error(`SHA-256 mismatch for ${target}: expected ${match[1]}, got ${actual}`);
  }
  return actual;
}

function readJson(filename, label) {
  try {
    return JSON.parse(readFileSync(filename, "utf8"));
  } catch (error) {
    throw new Error(`invalid ${label}: ${error.message}`);
  }
}

function verifyAcceptanceReceipt(root, platform, policy, { commit, version }) {
  const name = `sagejs-${platform}-acceptance.json`;
  const checksum = `${name}.sha256`;
  verifyChecksum(root, name, checksum);
  const contents = readFileSync(join(root, name), "utf8");
  const receipt = readJson(join(root, name), `${platform} acceptance receipt`);
  if (contents !== `${JSON.stringify(receipt, null, 2)}\n`) {
    throw new Error(`${platform} acceptance receipt is not canonical JSON`);
  }
  const archive = policy.checksums[0][0];
  const archiveSha256 = verifyChecksum(root, archive, policy.checksums[0][1]);
  assert.equal(receipt.schema, ACCEPTANCE_SCHEMA, `${platform} acceptance schema`);
  assert.equal(receipt.version, version, `${platform} accepted version`);
  assert.equal(receipt.source?.commit, commit, `${platform} accepted source`);
  assert.equal(receipt.target?.arch, policy.arch, `${platform} accepted architecture`);
  assert.equal(
    receipt.target?.platform,
    platform.startsWith("linux-")
      ? "linux"
      : platform.startsWith("macos-")
        ? "darwin"
        : "win32",
    `${platform} accepted platform`,
  );
  assert.equal(receipt.archive?.name, archive, `${platform} accepted archive`);
  assert.equal(receipt.archive?.sha256, archiveSha256, `${platform} accepted archive digest`);
  assert.equal(
    receipt.archive?.size,
    lstatSync(join(root, archive)).size,
    `${platform} accepted archive size`,
  );
  assert.deepEqual(
    Object.keys(receipt.checks || {}).sort(),
    [...ACCEPTANCE_CHECKS].sort(),
    `${platform} acceptance check inventory`,
  );
  assert.equal(
    ACCEPTANCE_CHECKS.every((check) => receipt.checks[check] === true),
    true,
    `${platform} acceptance contains a failed check`,
  );
  assert.equal(
    receipt.signatures?.mode,
    policy.acceptanceSignature,
    `${platform} accepted signature mode`,
  );
  if (platform === "macos-arm64") {
    const [packageName, packageChecksum] = policy.checksums[1];
    const [benchmarkName, benchmarkChecksum] = policy.checksums[2];
    const packageSha256 = verifyChecksum(root, packageName, packageChecksum);
    const benchmarkSha256 = verifyChecksum(root, benchmarkName, benchmarkChecksum);
    assert.deepEqual(
      Object.keys(receipt.signatures?.package || {}).sort(),
      ["name", "sha256"],
      "macos-arm64 accepted package binding",
    );
    assert.equal(
      receipt.signatures.package.name,
      packageName,
      "macos-arm64 accepted package name",
    );
    assert.equal(
      receipt.signatures.package.sha256,
      packageSha256,
      "macos-arm64 accepted package digest",
    );
    assert.deepEqual(
      Object.keys(receipt.benchmark || {}).sort(),
      ["benchmarkSha256", "reportSha256", "samples"],
      "macos-arm64 accepted benchmark binding",
    );
    assert.equal(
      receipt.benchmark.benchmarkSha256,
      benchmarkSha256,
      "macos-arm64 accepted benchmark digest",
    );
  } else {
    assert.equal(receipt.benchmark, null, `${platform} must not claim benchmark evidence`);
    assert.equal(
      Object.hasOwn(receipt.signatures || {}, "package"),
      false,
      `${platform} must not claim package evidence`,
    );
  }
  return receipt;
}

function verifyLinuxReadiness(root, platform, { commit, version }) {
  const prefix = `sagejs-${platform}`;
  const archive = `${prefix}.tar.xz`;
  const checksum = `${archive}.sha256`;
  const reportName = `${prefix}.report.json`;
  const readinessName = `${prefix}.release.json`;
  const report = readJson(join(root, reportName), `${platform} release report`);
  const readiness = readJson(
    join(root, readinessName),
    `${platform} readiness manifest`,
  );
  const expectedArtifacts = Object.fromEntries(
    [archive, checksum, reportName].map((name) => [
      name,
      hashRegularFile(root, join(root, name), name).sha256,
    ]),
  );
  const nodeSource = {
    filename: "node-v26.7.0.tar.xz",
    sha256: "e6b182cbeeab032d1082ca4ac4fe15e3a57de691d3bde78ecf8a761fd56ee356",
    url: "https://nodejs.org/dist/v26.7.0/node-v26.7.0.tar.xz",
    version: "26.7.0",
  };
  assert.deepEqual(readiness, {
    artifacts: expectedArtifacts,
    schema: "sagejs.linux-release-readiness/v1",
  });
  assert.equal(report.schemaVersion, 2, `${platform} report schema`);
  assert.equal(report.artifacts?.archive?.sha256, expectedArtifacts[archive]);
  assert.equal(
    report.buildReceipts?.baseline?.schema,
    "sagejs.linux-baseline-receipt-v1",
    `${platform} baseline schema`,
  );
  assert.equal(
    report.buildReceipts?.baseline?.platform,
    platform,
    `${platform} baseline platform`,
  );
  assert.equal(
    report.buildReceipts?.baseline?.sourceCommit,
    commit,
    `${platform} baseline sourceCommit`,
  );
  assert.deepEqual(
    report.buildReceipts?.baseline?.nodeSource,
    nodeSource,
    `${platform} baseline Node source`,
  );
  const architecture = platform === "linux-arm64" ? "arm64" : "x64";
  for (const name of ["math", "python"]) {
    const receipt = report.buildReceipts?.[name];
    assert.equal(receipt?.sagejsVersion, version, `${platform} ${name} version`);
    assert.equal(receipt?.source?.commit, commit, `${platform} ${name} source`);
    assert.equal(receipt?.target?.platform, "linux", `${platform} ${name} target`);
    assert.equal(receipt?.target?.arch, architecture, `${platform} ${name} architecture`);
    assert.equal(receipt?.toolchain?.seaNode?.version, "26.7.0");
    assert.deepEqual(
      receipt?.toolchain?.seaNode?.source,
      nodeSource,
      `${platform} ${name} Node source`,
    );
  }
  assert.equal(
    report.buildReceipts.math.capabilities?.artifact?.nativeMathematics,
    true,
    `${platform} mathematics SEA capability`,
  );
  assert.equal(
    report.buildReceipts.python.capabilities?.artifact?.nativeMathematics,
    false,
    `${platform} Python SEA capability`,
  );
  assert.deepEqual(
    Object.keys(report.checks || {}).sort(),
    [...LINUX_RELEASE_CHECKS].sort(),
    `${platform} release check inventory`,
  );
  assert.equal(
    LINUX_RELEASE_CHECKS.every((name) => report.checks[name] === true),
    true,
    `${platform} release report contains a failed check`,
  );
}

function zipEntry(archive, entry) {
  const result = spawnSync("unzip", ["-p", archive, entry], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`cannot read ${entry} from ${archive}: ${result.stderr.trim()}`);
  }
  return result.stdout;
}

function releaseLicenseFiles() {
  const directory = resolve(__dirname, "../licenses");
  return readdirSync(directory).sort().map((name) => {
    const information = lstatSync(join(directory, name));
    if (!information.isFile() || information.isSymbolicLink()) {
      throw new Error(`release license inventory must contain regular files: ${name}`);
    }
    return `licenses/${name}`;
  });
}

function verifyUnsignedWindowsArchive(archive, { commit, version }) {
  const root = "sagejs-windows-x64";
  const expectedFiles = [
    "DISTRIBUTION.md",
    "LICENSE",
    "README.md",
    "SHA256SUMS",
    "UNSIGNED-WINDOWS.txt",
    "release.json",
    "sagejs-build-manifest.json",
    "sagejs.exe",
    "sagepython-build-manifest.json",
    "sagepython.exe",
    ...releaseLicenseFiles(),
  ].sort();
  assert.deepEqual(
    preflightArchive(archive, "windows-x64"),
    expectedFiles.map((name) => `${root}/${name}`).sort(),
    "Windows archive file inventory",
  );
  let manifest;
  try {
    manifest = JSON.parse(zipEntry(archive, `${root}/release.json`));
  } catch (error) {
    throw new Error(`invalid Windows release.json: ${error.message}`);
  }
  assert.deepEqual(manifest, {
    schema: "sagejs.windows-release-manifest-v1",
    signature: { scheme: "authenticode", status: "unsigned" },
    sourceCommit: commit,
    target: "windows-x64",
    version,
  });
  const notice = zipEntry(archive, `${root}/UNSIGNED-WINDOWS.txt`);
  if (!/not Authenticode-signed/i.test(notice) || !/SHA-256/i.test(notice)) {
    throw new Error("UNSIGNED-WINDOWS.txt must warn about Authenticode and SHA-256");
  }
}

function verifyWindowsAcceptance(root, { archiveSha256, commit, version }) {
  const receiptName = "sagejs-windows-x64-acceptance.json";
  const receiptSha256 = verifyChecksum(root, receiptName, `${receiptName}.sha256`);
  const receipt = readJson(join(root, receiptName), "Windows acceptance receipt");
  assert.equal(receipt.schema, ARTIFACT_ACCEPTANCE_SCHEMA, "Windows acceptance schema");
  assert.deepEqual(receipt.archive, {
    name: "sagejs-windows-x64-unsigned.zip",
    sha256: archiveSha256,
    size: lstatSync(join(root, "sagejs-windows-x64-unsigned.zip")).size,
  });
  assert.equal(receipt.version, version, "Windows accepted version");
  assert.equal(receipt.source?.commit, commit, "Windows accepted source");
  assert.equal(receipt.target?.platform, "win32", "Windows accepted platform");
  assert.equal(receipt.target?.arch, "x64", "Windows accepted architecture");
  assert.equal(
    receipt.signatures?.mode,
    "explicitly-unsigned-authenticode",
    "Windows signature acceptance",
  );
  assert.deepEqual(
    receipt.signatures?.executables,
    ["sagejs.exe", "sagepython.exe"].map((executable) => ({
      certificateTableOffset: 0,
      certificateTableSize: 0,
      executable,
    })),
    "Windows Authenticode evidence",
  );
  const requiredChecks = [
    "archiveContents",
    "archiveSha256",
    "buildReceiptBinding",
    "exactMathematics",
    "licenseAndSourceInventory",
    "nativeDependencyClosure",
    "relocatedRuntime",
    "signaturePolicy",
  ];
  assert.deepEqual(
    Object.keys(receipt.checks || {}).sort(),
    requiredChecks,
    "Windows acceptance check inventory",
  );
  assert.equal(
    requiredChecks.every((name) => receipt.checks[name] === true),
    true,
    "Windows acceptance contains a failed check",
  );
  return receiptSha256;
}

function assertEmptyOutput(directory) {
  if (!existsSync(directory)) return;
  const information = lstatSync(directory);
  if (!information.isDirectory() || information.isSymbolicLink()) {
    throw new Error(`output must be a real directory: ${directory}`);
  }
  if (readdirSync(directory).length !== 0) {
    throw new Error(`output directory must be empty: ${directory}`);
  }
}

function copyVerified(inputRoot, source, outputRoot, destination) {
  const sourceMetadata = hashRegularFile(inputRoot, source, `release input ${source}`);
  const output = join(outputRoot, destination);
  mkdirSync(dirname(output), { recursive: true });
  copyFileSync(source, output);
  const outputMetadata = hashRegularFile(outputRoot, output, `release output ${destination}`);
  assert.deepEqual(outputMetadata, sourceMetadata, `copy changed ${destination}`);
  return { path: destination.split(sep).join("/"), ...outputMetadata };
}

function preparePublication(options) {
  if (!options.inputDirectory || !options.outputDirectory) {
    throw new Error("--input and --output are required");
  }
  const inputDirectory = resolve(options.inputDirectory);
  const outputDirectory = resolve(options.outputDirectory);
  const tagMatch = /^v(.+)$/.exec(options.tag || "");
  if (!tagMatch || !VERSION.test(tagMatch[1])) {
    throw new Error("release tag must be canonical vMAJOR.MINOR.PATCH");
  }
  const version = tagMatch[1];
  if (!COMMIT.test(options.commit || "")) throw new Error("release commit must be a full Git object id");
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(options.repository || "")) {
    throw new Error("release repository must be OWNER/REPOSITORY");
  }
  if (!/^[0-9]+$/.test(options.runId || "") || !/^[0-9]+$/.test(options.runAttempt || "")) {
    throw new Error("workflow run identity is required");
  }
  assert.deepEqual(
    Object.keys(options.sourceArtifacts || {}).sort(),
    Object.keys(platforms).sort(),
    "all and only supported source artifacts are required",
  );
  assertEmptyOutput(outputDirectory);
  mkdirSync(join(outputDirectory, "assets"), { recursive: true });

  const records = [];
  for (const [platform, policy] of Object.entries(platforms)) {
    const root = join(inputDirectory, platform);
    assert.deepEqual(regularFiles(root), [...policy.files].sort(), `${platform} artifact contents`);
    for (const [target, receipt] of policy.checksums) verifyChecksum(root, target, receipt);
    verifyAcceptanceReceipt(root, platform, policy, {
      commit: options.commit,
      version,
    });
    if (platform.startsWith("linux-")) {
      verifyLinuxReadiness(root, platform, { commit: options.commit, version });
    }
    if (platform === "windows-x64") {
      const archive = join(root, "sagejs-windows-x64-unsigned.zip");
      verifyUnsignedWindowsArchive(archive, {
        commit: options.commit,
        version,
      });
      verifyWindowsAcceptance(root, {
        archiveSha256: hashRegularFile(root, archive, basename(archive)).sha256,
        commit: options.commit,
        version,
      });
    }

    for (const path of policy.files) {
      const source = join(root, ...path.split("/"));
      const destination = join("assets", basename(path));
      records.push({
        ...copyVerified(root, source, outputDirectory, destination),
        platform,
        signature: policy.signature,
      });
    }
  }

  const provenance = {
    schema: SCHEMA,
    source: {
      commit: options.commit,
      repository: options.repository,
      tag: options.tag,
      workflowRun: {
        attempt: Number(options.runAttempt),
        id: Number(options.runId),
      },
    },
    sourceArtifacts: Object.fromEntries(
      Object.entries(options.sourceArtifacts).sort(([left], [right]) => left.localeCompare(right)),
    ),
    policy: {
      macos: "Developer ID signed and Apple-notarized",
      windows: "UNSIGNED: no Authenticode signature; verify SHA-256 before execution",
    },
    artifacts: records
      .map((record) => ({ ...record, path: record.path.replace(/^assets\//, "") }))
      .sort((left, right) => left.path.localeCompare(right.path)),
    version,
  };
  const provenancePath = join(outputDirectory, "assets", "release-provenance.json");
  writeFileSync(provenancePath, serialize(provenance), { mode: 0o644 });
  const provenanceMetadata = hashRegularFile(
    join(outputDirectory, "assets"),
    provenancePath,
    "release provenance",
  );
  writeFileSync(
    `${provenancePath}.sha256`,
    `${provenanceMetadata.sha256}  release-provenance.json\n`,
    { mode: 0o644 },
  );

  const primary = records.filter(({ path }) => !path.endsWith(".sha256"));
  primary.push({ path: "assets/release-provenance.json", ...provenanceMetadata });
  writeFileSync(
    join(outputDirectory, "assets", "SHA256SUMS"),
    `${primary
      .sort((left, right) => left.path.localeCompare(right.path))
      .map(({ path, sha256 }) => `${sha256}  ${basename(path)}`)
      .join("\n")}\n`,
    { mode: 0o644 },
  );
  return provenance;
}

if (require.main === module) {
  try {
    const options = parseArguments(process.argv.slice(2));
    const provenance = preparePublication(options);
    console.log(
      `Prepared Sage.js ${provenance.version} publication from ` +
        `${provenance.source.commit} in ${resolve(options.outputDirectory)}`,
    );
  } catch (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  SCHEMA,
  parseArguments,
  platforms,
  preparePublication,
  regularFiles,
  verifyUnsignedWindowsArchive,
  verifyAcceptanceReceipt,
  verifyChecksum,
  verifyWindowsAcceptance,
};
