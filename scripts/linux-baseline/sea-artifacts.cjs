"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const {
  lstatSync,
  readFileSync,
  readdirSync,
} = require("node:fs");
const { basename, join } = require("node:path");

const BUILD_MANIFEST_SCHEMA = "sagejs.release-build-manifest-v1";
const SEA_ARTIFACT_SCHEMA = "sagejs.linux-baseline-sea-artifacts-v1";
const NATIVE_REPORT_SCHEMA = "sagejs.native-binary-inspection-v1";

function sha256(filename) {
  return createHash("sha256").update(readFileSync(filename)).digest("hex");
}

function artifactReceipt(filename) {
  const stat = lstatSync(filename);
  assert.equal(stat.isFile(), true, `${filename} is not a regular file`);
  return {
    bytes: stat.size,
    filename: basename(filename),
    mode: (stat.mode & 0o777).toString(8).padStart(3, "0"),
    sha256: sha256(filename),
  };
}

function compareNumericVersions(left, right) {
  const parse = (value) => String(value).split(".").map((part) => {
    assert.match(part, /^\d+$/, `invalid numeric version ${value}`);
    return Number(part);
  });
  const leftParts = parse(left);
  const rightParts = parse(right);
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

function nativeKey(file) {
  return `${file.sha256}:${file.size}`;
}

function validateManifest(
  manifest,
  name,
  nativeMathematics,
  { inspection, nodeSource, platform, rustToolchain, sourceCommit },
) {
  assert.equal(manifest.schema, BUILD_MANIFEST_SCHEMA);
  assert.equal(manifest.source?.commit, sourceCommit, `${name} source commit mismatch`);
  assert.equal(manifest.source?.dirty, false, `${name} was built from dirty source`);
  assert.equal(manifest.target?.platform, "linux");
  assert.equal(manifest.target?.arch, platform === "linux-arm64" ? "arm64" : "x64");
  assert.equal(manifest.target?.libc?.family, "glibc");
  assert.ok(
    compareNumericVersions(manifest.target.libc.version, "2.28") <= 0,
    `${name} requires glibc ${manifest.target.libc.version}`,
  );
  assert.equal(
    manifest.capabilities?.artifact?.nativeMathematics,
    nativeMathematics,
    `${name} mathematics capability mismatch`,
  );
  assert.equal(manifest.toolchain?.seaNode?.version, nodeSource.version);
  assert.deepEqual(manifest.toolchain?.seaNode?.source, nodeSource);
  assert.deepEqual(manifest.toolchain?.seaNode?.rustToolchain, rustToolchain);

  const report = manifest.toolchain?.nativeBinaries?.report;
  assert.equal(report?.schema, NATIVE_REPORT_SCHEMA);
  assert.equal(report?.ok, true);
  assert.equal(
    report.aggregate.dependencies.some(
      (dependency) => dependency.toLowerCase() === "libatomic.so.1",
    ),
    false,
    `${name} native inputs depend on libatomic.so.1`,
  );
  assert.ok(
    compareNumericVersions(report.aggregate.maximumGlibc, "2.28") <= 0,
    `${name} native inputs require glibc ${report.aggregate.maximumGlibc}`,
  );

  const baselineFiles = new Map(
    inspection.files.map((file) => [nativeKey(file), file]),
  );
  const embeddedAddons = report.files.filter(
    (file) => file.role === "embedded-node-addon",
  );
  assert.ok(embeddedAddons.length > 0, `${name} has no embedded addon evidence`);
  for (const addon of embeddedAddons) {
    const baseline = baselineFiles.get(nativeKey(addon));
    assert.ok(baseline, `${name} addon ${addon.label} is absent from baseline inspection`);
    assert.equal(baseline.architecture, addon.architecture);
    assert.deepEqual(baseline.dependencies, addon.dependencies);
    assert.deepEqual(baseline.requiredSymbolVersions, addon.requiredSymbolVersions);
  }

  const nodeTemplate = report.files.find((file) => file.role === "executable-template");
  const baselineNode = inspection.files.find((file) => file.label === "node");
  assert.ok(nodeTemplate && baselineNode, `${name} Node template evidence is missing`);
  assert.equal(nativeKey(nodeTemplate), nativeKey(baselineNode));
  assert.equal(manifest.toolchain.seaNode.executableSha256, baselineNode.sha256);

  return {
    embeddedAddonInputSetSha256: report.inputSetSha256,
    embeddedAddons: embeddedAddons.map((file) => ({
      bytes: file.size,
      label: file.label,
      sha256: file.sha256,
    })),
    manifestSource: manifest.source,
    nativeInputReportSha256: manifest.toolchain.nativeBinaries.reportSha256,
    target: manifest.target,
  };
}

function validateBaselineSeaArtifacts(directory, options) {
  const seaDirectory = join(directory, "sea");
  const expected = [
    "sagejs",
    "sagejs-build-manifest.json",
    "sagepython",
    "sagepython-build-manifest.json",
  ];
  assert.deepEqual(readdirSync(seaDirectory).sort(), expected);
  const manifests = {
    sagejs: JSON.parse(readFileSync(join(seaDirectory, expected[1]), "utf8")),
    sagepython: JSON.parse(readFileSync(join(seaDirectory, expected[3]), "utf8")),
  };
  const evidence = {
    sagejs: validateManifest(manifests.sagejs, "sagejs", true, options),
    sagepython: validateManifest(manifests.sagepython, "sagepython", false, options),
  };
  assert.deepEqual(
    evidence.sagejs.manifestSource,
    evidence.sagepython.manifestSource,
    "SEA executables have different source identities",
  );
  const artifacts = Object.fromEntries(expected.map((name) => [
    `sea/${name}`,
    artifactReceipt(join(seaDirectory, name)),
  ]));
  for (const name of ["sea/sagejs", "sea/sagepython"]) {
    assert.notEqual(
      Number.parseInt(artifacts[name].mode, 8) & 0o111,
      0,
      `${name} is not executable`,
    );
  }
  return {
    artifacts,
    executables: evidence,
    nodeSource: options.nodeSource,
    platform: options.platform,
    rustToolchain: options.rustToolchain,
    schema: SEA_ARTIFACT_SCHEMA,
    sourceCommit: options.sourceCommit,
  };
}

module.exports = {
  BUILD_MANIFEST_SCHEMA,
  SEA_ARTIFACT_SCHEMA,
  artifactReceipt,
  compareNumericVersions,
  validateBaselineSeaArtifacts,
};
