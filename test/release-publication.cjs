"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { dirname, join } = require("node:path");
const test = require("node:test");

const {
  SCHEMA,
  platforms,
  preparePublication,
} = require("../scripts/prepare-release-publication.cjs");

const COMMIT = "0123456789abcdef0123456789abcdef01234567";
const VERSION = "1.2.3";

function sha256(filename) {
  return createHash("sha256").update(readFileSync(filename)).digest("hex");
}

function windowsArchive(root, archive, overrides = {}) {
  const directory = join(root, ".windows-archive");
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
  for (const name of ["DISTRIBUTION.md", "LICENSE", "README.md"]) {
    writeFileSync(join(directory, name), readFileSync(join(__dirname, "..", name)));
  }
  mkdirSync(join(directory, "licenses"), { recursive: true });
  const sourceLicenses = join(__dirname, "../licenses");
  for (const name of readdirSync(sourceLicenses)) {
    writeFileSync(join(directory, "licenses", name), readFileSync(join(sourceLicenses, name)));
  }
  execFileSync("python3", [
    "-c",
    "import pathlib,sys,zipfile; root=pathlib.Path(sys.argv[2]); " +
      "z=zipfile.ZipFile(sys.argv[1], 'w'); " +
      "[z.write(p, p.relative_to(root)) for p in sorted(root.rglob('*'))]; z.close()",
    archive,
    directory,
  ]);
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
    checks: { exactMathematics: true, installer: true },
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

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "sagejs-release-publication-"));
  const input = join(root, "input");
  const output = join(root, "output");
  for (const [platform, policy] of Object.entries(platforms)) {
    const directory = join(input, platform);
    mkdirSync(directory, { recursive: true });
    for (const path of policy.files) {
      if (path.endsWith(".sha256") || path.endsWith(".release.json")) continue;
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
    assert.equal(provenance.artifacts.length, 17);
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
    assert.throws(() => preparePublication(workspace.options), /status: 'signed'/);
  } finally {
    workspace.cleanup();
  }
});

test("Windows ZIP duplicate and traversal entries fail before publication", () => {
  for (const [entry, expected] of [
    ["release.json", /duplicate entries/],
    ["../debug.pdb", /unsafe path/],
  ]) {
    const workspace = fixture();
    try {
      const archive = join(
        workspace.input,
        "windows-x64",
        "sagejs-windows-x64-unsigned.zip",
      );
      execFileSync("python3", [
        "-c",
        "import sys,warnings,zipfile; warnings.filterwarnings('ignore'); " +
          "z=zipfile.ZipFile(sys.argv[1], 'a'); " +
          "z.writestr(sys.argv[2], b'bad'); z.close()",
        archive,
        entry,
      ]);
      writeFileSync(
        `${archive}.sha256`,
        `${sha256(archive)}  sagejs-windows-x64-unsigned.zip\n`,
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
