#!/usr/bin/env node
// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");
const { fileURLToPath } = require("node:url");
const { gzipSync } = require("node:zlib");

const {
  SUPPORTED_TARGETS,
  assertArchiveLayout,
  auditInstalledClosure,
  expectedPublishedRootManifest,
  fileDependency,
  prepareFreshInstall,
  resolveTarget,
  runInstalledNode,
  runProcess,
  runRelocatedSeaLanguage,
  targetForHost,
  validateTarArchive,
} = require("../../scripts/package-qualification/runtime.cjs");
const {
  MARKER,
  numericalSmokeSource,
  parseNumericalSmoke,
} = require("../../scripts/package-qualification/numerical-smoke.cjs");
const {
  cleanupQualification,
} = require("../../scripts/test-npm-package.cjs");

const sourceManifest = JSON.parse(
  readFileSync(join(__dirname, "..", "..", "package.json"), "utf8"),
);

function fixtureRootManifest(version) {
  assert.equal(version, sourceManifest.version);
  return expectedPublishedRootManifest();
}

function fixturePlatformManifest(targetName, version) {
  const target = SUPPORTED_TARGETS[targetName];
  const manifest = {
    name: target.packageName,
    version,
    description: `Sage.js native executables for ${targetName}`,
    repository: sourceManifest.repository,
    homepage: sourceManifest.homepage,
    license: sourceManifest.license,
    os: [target.os],
    cpu: [target.arch],
    bin: {
      [`sagejs-${targetName}`]: `bin/sagejs${target.executableSuffix}`,
      [`sagepython-${targetName}`]: `bin/sagepython${target.executableSuffix}`,
    },
    files: ["bin", "licenses", "LICENSE", "README.md"],
  };
  if (target.libc) manifest.libc = [target.libc];
  return manifest;
}

function writeFixtureFile(root, filename) {
  const output = join(root, "package", filename);
  mkdirSync(join(output, ".."), { recursive: true });
  writeFileSync(output, filename);
}

function pack(directory, archive) {
  execFileSync("tar", ["--format=ustar", "-czf", archive, "package"], {
    cwd: directory,
  });
}

function createArchives(temporary, targetName) {
  const target = SUPPORTED_TARGETS[targetName];
  const version = sourceManifest.version;
  const root = join(temporary, "root");
  const platform = join(temporary, "platform");
  for (const filename of [
    "dist/numerical/backend.cjs",
    "dist/numerical/cminpack.wasm",
    "dist/numerical/nlopt-backend.cjs",
    "dist/numerical/nlopt-methods.wasm",
  ]) {
    writeFixtureFile(root, filename);
  }
  const rootManifest = fixtureRootManifest(version);
  writeFileSync(
    join(root, "package", "package.json"),
    JSON.stringify(rootManifest),
  );

  for (const name of ["sagejs", "sagepython"]) {
    writeFixtureFile(platform, `bin/${name}${target.executableSuffix}`);
  }
  const platformManifest = fixturePlatformManifest(targetName, version);
  writeFileSync(
    join(platform, "package", "package.json"),
    JSON.stringify(platformManifest),
  );

  const rootArchive = join(temporary, "root.tgz");
  const platformArchive = join(temporary, "platform.tgz");
  pack(root, rootArchive);
  pack(platform, platformArchive);
  return {
    platform,
    platformArchive,
    platformManifest,
    root,
    rootArchive,
    rootManifest,
  };
}

function writeOctal(header, offset, length, value) {
  header.write(`${value.toString(8).padStart(length - 1, "0")}\0`, offset, length);
}

function tarHeader({
  data = "",
  linkName = "",
  magic = "ustar\0",
  name,
  prefix = "",
  type = "0",
  version = "00",
}) {
  const content = Buffer.from(data);
  const header = Buffer.alloc(512);
  assert.ok(Buffer.byteLength(name) < 100, `test tar name is too long: ${name}`);
  header.write(name, 0, 100);
  writeOctal(header, 100, 8, type === "5" ? 0o755 : 0o644);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, content.length);
  writeOctal(header, 136, 12, 0);
  header.fill(32, 148, 156);
  header.write(type, 156, 1);
  header.write(linkName, 157, 100);
  header.write(magic, 257, 6);
  header.write(version, 263, 2);
  header.write(prefix, 345, 155);
  let checksum = 0;
  for (const byte of header) checksum += byte;
  header.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148, 8);
  const padding = Buffer.alloc((512 - (content.length % 512)) % 512);
  return Buffer.concat([header, content, padding]);
}

function writeRawTarGz(filename, entries) {
  const archive = Buffer.concat([
    ...entries.map((entry) => Buffer.isBuffer(entry) ? entry : tarHeader(entry)),
    Buffer.alloc(1024),
  ]);
  writeFileSync(filename, gzipSync(archive));
}

test("release targets map to native Node identities and packages", () => {
  assert.deepEqual(Object.keys(SUPPORTED_TARGETS), [
    "linux-x64",
    "linux-arm64",
    "macos-arm64",
    "windows-x64",
  ]);
  assert.equal(targetForHost("linux", "arm64"), "linux-arm64");
  assert.equal(targetForHost("darwin", "arm64"), "macos-arm64");
  assert.equal(targetForHost("win32", "x64"), "windows-x64");
  assert.equal(targetForHost("darwin", "x64"), undefined);
  assert.equal(
    resolveTarget("windows-x64", {
      platform: "win32",
      arch: "x64",
    }).packageName,
    "@sagemath/sagejs-win32-x64",
  );
  assert.throws(
    () => resolveTarget("windows-x64", { platform: "linux", arch: "x64" }),
    /cannot execute windows-x64 package artifacts on linux-x64/,
  );
  assert.throws(() => resolveTarget("plan9-x64"), /unsupported/);
});

test("package file dependencies use portable absolute file URLs", () => {
  const value = fileDependency(join(tmpdir(), "archive with space.tgz"));
  assert.match(value, /^file:\/\//);
  assert.match(value, /archive%20with%20space\.tgz$/);
});

test("archive checks require the root platform edge and exact target metadata", () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-package-layout-"));
  try {
    const fixture = createArchives(temporary, "windows-x64");
    const {
      platform,
      platformArchive,
      platformManifest,
      root,
      rootArchive,
      rootManifest,
    } = fixture;
    assertArchiveLayout(rootArchive, platformArchive, "windows-x64");

    rootManifest.dependencies["unexpected-network-edge"] =
      "https://example.invalid/evil.tgz";
    writeFileSync(
      join(root, "package", "package.json"),
      JSON.stringify(rootManifest),
    );
    pack(root, rootArchive);
    assert.throws(
      () => assertArchiveLayout(rootArchive, platformArchive, "windows-x64"),
      /trusted publish contract/,
    );
    delete rootManifest.dependencies["unexpected-network-edge"];

    delete rootManifest.optionalDependencies["@sagemath/sagejs-win32-x64"];
    writeFileSync(
      join(root, "package", "package.json"),
      JSON.stringify(rootManifest),
    );
    pack(root, rootArchive);
    assert.throws(
      () => assertArchiveLayout(rootArchive, platformArchive, "windows-x64"),
      /must declare exact optional dependency/,
    );

    rootManifest.optionalDependencies["@sagemath/sagejs-win32-x64"] =
      rootManifest.version;
    writeFileSync(
      join(root, "package", "package.json"),
      JSON.stringify(rootManifest),
    );
    pack(root, rootArchive);
    platformManifest.cpu = ["arm64"];
    writeFileSync(
      join(platform, "package", "package.json"),
      JSON.stringify(platformManifest),
    );
    pack(platform, platformArchive);
    assert.throws(
      () => assertArchiveLayout(rootArchive, platformArchive, "windows-x64"),
      /Expected values to be strictly deep-equal/,
    );

    platformManifest.cpu = ["x64"];
    writeFileSync(
      join(platform, "package", "package.json"),
      JSON.stringify(platformManifest),
    );
    pack(platform, platformArchive);
    rmSync(join(root, "package", "dist", "numerical", "nlopt-methods.wasm"));
    pack(root, rootArchive);
    assert.throws(
      () => assertArchiveLayout(rootArchive, platformArchive, "windows-x64"),
      /nlopt-methods/,
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("fresh install rejects a same-user replacement of validated archive bytes", () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-archive-swap-"));
  let consumer;
  try {
    const target = targetForHost();
    assert.ok(target, `unsupported test host ${process.platform}-${process.arch}`);
    const good = createArchives(join(temporary, "good"), target);
    const replacement = createArchives(join(temporary, "replacement"), target);
    writeFileSync(
      join(
        replacement.root,
        "package",
        "dist",
        "numerical",
        "backend.cjs",
      ),
      "EVIL",
    );
    pack(replacement.root, replacement.rootArchive);

    assert.throws(
      () =>
        prepareFreshInstall({
          target,
          rootArchive: good.rootArchive,
          platformArchive: good.platformArchive,
          installRunner(_args, options) {
            consumer = options.cwd;
            const manifest = JSON.parse(
              readFileSync(join(consumer, "package.json"), "utf8"),
            );
            const privateRoot = fileURLToPath(
              manifest.dependencies["@sagemath/sagejs"],
            );
            chmodSync(privateRoot, 0o600);
            copyFileSync(replacement.rootArchive, privateRoot);
          },
        }),
      /validated package archive changed during installation/,
    );
    assert.ok(consumer);
    assert.equal(existsSync(consumer), false);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("archive validation rejects links, traversal, special entries, and collisions", () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-malicious-archive-"));
  try {
    const archive = join(temporary, "malicious.tgz");
    const cases = [
      {
        entries: [{ name: "/etc/passwd", data: "escape" }],
        expected: /absolute path/,
      },
      {
        entries: [{ name: "package/../escape", data: "escape" }],
        expected: /non-canonical path/,
      },
      {
        entries: [{ name: "outside/package", data: "escape" }],
        expected: /outside package/,
      },
      {
        entries: [{
          name: "package/dist/numerical/backend.cjs",
          linkName: "/etc/passwd",
          type: "2",
        }],
        expected: /forbidden type.*2/,
      },
      {
        entries: [{
          name: "package/bin/sagejs",
          linkName: "/etc/passwd",
          type: "2",
        }],
        expected: /forbidden type.*2/,
      },
      {
        entries: [{
          name: "package/hardlink",
          linkName: "package/file",
          type: "1",
        }],
        expected: /forbidden type.*1/,
      },
      {
        entries: [{ name: "package/device", type: "3" }],
        expected: /forbidden type.*3/,
      },
      {
        entries: [{ name: "package/fifo", type: "6" }],
        expected: /forbidden type.*6/,
      },
      {
        entries: [
          { name: "package/duplicate", data: "first" },
          { name: "package/duplicate", data: "second" },
        ],
        expected: /duplicate normalized path/,
      },
      {
        entries: [
          { name: "package/Case", data: "first" },
          { name: "package/case", data: "second" },
        ],
        expected: /duplicate normalized path/,
      },
      {
        entries: [{ name: "package\\windows-escape", data: "escape" }],
        expected: /backslash path separator/,
      },
      {
        entries: [{ name: "package/Σ", data: "sigma" }],
        expected: /portable ASCII/,
      },
      {
        entries: [{ name: "package/ß", data: "sharp s" }],
        expected: /portable ASCII/,
      },
      {
        entries: [{ name: "foo", prefix: "package", magic: "", version: "" }],
        expected: /supported ustar\/00 dialect/,
      },
      {
        entries: [
          { name: "package/before-zero", data: "first" },
          Buffer.alloc(512),
          { name: "package/after-zero", data: "second" },
        ],
        expected: /nonzero block after its end marker/,
      },
    ];
    for (const { entries, expected } of cases) {
      writeRawTarGz(archive, entries);
      assert.throws(() => validateTarArchive(archive), expected);
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("otherwise valid archives cannot replace required files with absolute links", () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-required-link-"));
  try {
    const targetName = "windows-x64";
    const target = SUPPORTED_TARGETS[targetName];
    const version = sourceManifest.version;
    const rootArchive = join(temporary, "root.tgz");
    const platformArchive = join(temporary, "platform.tgz");
    const rootManifest = JSON.stringify(fixtureRootManifest(version));
    const platformManifest = JSON.stringify(
      fixturePlatformManifest(targetName, version),
    );
    const ordinaryRootEntries = [
      { name: "package/package.json", data: rootManifest },
      { name: "package/dist/numerical/backend.cjs", data: "backend" },
      { name: "package/dist/numerical/cminpack.wasm", data: "wasm" },
      { name: "package/dist/numerical/nlopt-backend.cjs", data: "backend" },
      { name: "package/dist/numerical/nlopt-methods.wasm", data: "wasm" },
    ];
    const ordinaryPlatformEntries = [
      { name: "package/package.json", data: platformManifest },
      { name: "package/bin/sagejs.exe", data: "sea" },
      { name: "package/bin/sagepython.exe", data: "sea" },
    ];

    writeRawTarGz(rootArchive, [
      ...ordinaryRootEntries.filter(
        (entry) => entry.name !== "package/dist/numerical/backend.cjs",
      ),
      {
        name: "package/dist/numerical/backend.cjs",
        linkName: "/etc/passwd",
        type: "2",
      },
    ]);
    writeRawTarGz(platformArchive, ordinaryPlatformEntries);
    assert.throws(
      () => assertArchiveLayout(rootArchive, platformArchive, targetName),
      /forbidden type.*2/,
    );

    writeRawTarGz(rootArchive, ordinaryRootEntries);
    writeRawTarGz(platformArchive, [
      ...ordinaryPlatformEntries.filter(
        (entry) => entry.name !== "package/bin/sagejs.exe",
      ),
      {
        name: "package/bin/sagejs.exe",
        linkName: "/etc/passwd",
        type: "2",
      },
    ]);
    assert.throws(
      () => assertArchiveLayout(rootArchive, platformArchive, targetName),
      /forbidden type.*2/,
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("installed closure audit rejects internal and escaping links", () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-installed-closure-"));
  try {
    const consumer = join(temporary, "consumer");
    const closure = join(consumer, "store", "package");
    const external = join(temporary, "external");
    mkdirSync(closure, { recursive: true });
    mkdirSync(external, { recursive: true });
    writeFileSync(join(closure, "ordinary-file"), "safe");
    const linkType = process.platform === "win32" ? "junction" : "dir";
    const internalLink = join(closure, "escape");
    symlinkSync(external, internalLink, linkType);
    assert.throws(
      () => auditInstalledClosure(consumer, closure, "test closure"),
      /symbolic link|reparse point/,
    );
    rmSync(internalLink, { recursive: true, force: true });

    const publicLink = join(consumer, "public-package");
    symlinkSync(closure, publicLink, linkType);
    assert.equal(
      auditInstalledClosure(consumer, publicLink, "test closure").entries,
      2,
    );

    const escapingRoot = join(consumer, "escaping-package");
    symlinkSync(external, escapingRoot, linkType);
    assert.throws(
      () => auditInstalledClosure(consumer, escapingRoot, "test closure"),
      /escaped fresh install/,
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("failed owned installs remove their temporary consumer", () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-package-cleanup-"));
  let consumer;
  try {
    const target = targetForHost();
    assert.ok(target, `unsupported test host ${process.platform}-${process.arch}`);
    const fixture = createArchives(temporary, target);
    assert.throws(
      () =>
        prepareFreshInstall({
          target,
          rootArchive: fixture.rootArchive,
          platformArchive: fixture.platformArchive,
          installRunner(_args, options) {
            consumer = options.cwd;
            const manifest = JSON.parse(
              readFileSync(join(consumer, "package.json"), "utf8"),
            );
            assert.deepEqual(Object.keys(manifest.dependencies), [
              "@sagemath/sagejs",
            ]);
            throw new Error("intentional install failure");
          },
        }),
      /intentional install failure/,
    );
    assert.ok(consumer);
    assert.equal(existsSync(consumer), false);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("keep retains only the named consumer and always removes relocation", () => {
  const calls = [];
  cleanupQualification({
    install: {
      directory: "consumer-directory",
      cleanup() {
        calls.push("install");
      },
    },
    relocated: {
      cleanup() {
        calls.push("relocated");
      },
    },
    keep: true,
    log(message) {
      calls.push(message);
    },
  });
  assert.deepEqual(calls, [
    "relocated",
    "Kept package qualification directory: consumer-directory",
  ]);
});

test("process timeout terminates descendants, not only their parent", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-process-tree-"));
  try {
    const sentinel = join(temporary, "descendant-survived");
    const descendant = [
      'const { writeFileSync } = require("node:fs");',
      `setTimeout(() => writeFileSync(${JSON.stringify(sentinel)}, "alive"), 700);`,
      "setInterval(() => {}, 1000);",
    ].join("\n");
    const parent = [
      'const { spawn } = require("node:child_process");',
      `spawn(process.execPath, ["-e", ${JSON.stringify(descendant)}], { stdio: "ignore" });`,
      "setInterval(() => {}, 1000);",
    ].join("\n");
    const result = runProcess(process.execPath, ["-e", parent], { timeout: 150 });
    assert.equal(result.timedOut, true);
    await new Promise((resolve) => setTimeout(resolve, 900));
    assert.equal(existsSync(sentinel), false);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("bounded stdout and stderr overflow still terminates the owned tree", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-process-overflow-"));
  try {
    const sentinels = [];
    for (const producer of ["stdout", "stderr", "worker"]) {
      const sentinel = join(temporary, `${producer}-descendant-survived`);
      sentinels.push(sentinel);
      const descendant = [
        'const { writeFileSync } = require("node:fs");',
        `setTimeout(() => writeFileSync(${JSON.stringify(sentinel)}, "alive"), 700);`,
        "setInterval(() => {}, 1000);",
      ].join("\n");
      const lines = [
        'const { spawn } = require("node:child_process");',
        `spawn(process.execPath, ["-e", ${JSON.stringify(descendant)}], { stdio: "ignore" });`,
      ];
      if (producer === "worker") {
        lines.push(
          'const { Worker } = require("node:worker_threads");',
          'new Worker(`process.stdout.write("x".repeat(1024 * 1024)); setInterval(() => {}, 1000)`, { eval: true });',
        );
      } else {
        lines.push(
          `process.${producer}.write("x".repeat(1024 * 1024));`,
          "setInterval(() => {}, 1000);",
        );
      }
      let error;
      try {
        runProcess(process.execPath, ["-e", lines.join("\n")], {
          maxBuffer: 1024,
          timeout: 5_000,
        });
      } catch (caught) {
        error = caught;
      }
      assert.match(error?.message || "", /output exceeded 1024 bytes/);
      assert.equal(error.code, "ENOBUFS");
    }
    await new Promise((resolve) => setTimeout(resolve, 900));
    for (const sentinel of sentinels) assert.equal(existsSync(sentinel), false);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test(
  "normal POSIX completion drains descendants in the owned process group",
  { skip: process.platform === "win32" },
  async () => {
    const temporary = mkdtempSync(join(tmpdir(), "sagejs-process-drain-"));
    try {
      const sentinel = join(temporary, "descendant-survived");
      const descendant = [
        'const { writeFileSync } = require("node:fs");',
        `setTimeout(() => writeFileSync(${JSON.stringify(sentinel)}, "alive"), 600);`,
      ].join("\n");
      const parent = [
        'const { spawn } = require("node:child_process");',
        `const child = spawn(process.execPath, ["-e", ${JSON.stringify(descendant)}], { stdio: "ignore" });`,
        "child.unref();",
      ].join("\n");
      const result = runProcess(process.execPath, ["-e", parent]);
      assert.equal(result.status, 0);
      await new Promise((resolve) => setTimeout(resolve, 800));
      assert.equal(existsSync(sentinel), false);
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  },
);

test(
  "an explicitly detached POSIX session remains outside process-group containment",
  { skip: process.platform === "win32" },
  async () => {
    const temporary = mkdtempSync(join(tmpdir(), "sagejs-process-detached-"));
    try {
      const sentinel = join(temporary, "detached-finished");
      const descendant = [
        'const { writeFileSync } = require("node:fs");',
        `setTimeout(() => writeFileSync(${JSON.stringify(sentinel)}, "detached"), 600);`,
      ].join("\n");
      const parent = [
        'const { spawn } = require("node:child_process");',
        `const child = spawn(process.execPath, ["-e", ${JSON.stringify(descendant)}], {`,
        "  detached: true,",
        '  stdio: "ignore",',
        "});",
        "child.unref();",
      ].join("\n");
      const result = runProcess(process.execPath, ["-e", parent]);
      assert.equal(result.status, 0);
      await new Promise((resolve) => setTimeout(resolve, 800));
      assert.equal(readFileSync(sentinel, "utf8"), "detached");
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  },
);

test("the representative smoke covers ordinary Python and both lazy backends", () => {
  const source = numericalSmokeSource();
  assert.match(source, /method="brent"/);
  assert.match(source, /method="cminpack-lmdif"/);
  assert.match(source, /method="nlopt-nelder-mead"/);
  const payload = {
    least_squares: "cminpack-lmdif",
    minimize: "nlopt-nelder-mead",
    root: "brent",
    truth_levels: [
      "validated_approximate",
      "validated_approximate",
      "heuristic",
    ],
  };
  assert.deepEqual(
    parseNumericalSmoke({
      status: 0,
      stdout: `noise\n${MARKER}${JSON.stringify(payload)}\n`,
      stderr: "",
    }),
    payload,
  );
  assert.throws(
    () => parseNumericalSmoke({ status: 0, stdout: "", stderr: "" }),
    /missing numerical smoke marker/,
  );
});

test("the installed Node hook is isolated, machine-readable, and stdin-safe", () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-package-node-hook-"));
  try {
    const installedRoot = join(temporary, "node_modules", "@sagemath", "sagejs");
    mkdirSync(installedRoot, { recursive: true });
    const result = runInstalledNode(
      { directory: temporary, installedRoot },
      [
        'const { readFileSync } = require("node:fs");',
        "process.stdout.write(JSON.stringify({",
        "  input: readFileSync(0, 'utf8'),",
        "  root: process.env.SAGEJS_QUALIFICATION_INSTALLED_ROOT,",
        "}));",
      ].join("\n"),
      { input: "target-side callback" },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {
      input: "target-side callback",
      root: installedRoot,
    });
    assert.ok(result.elapsedMs >= 0);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
  assert.throws(
    () => runRelocatedSeaLanguage({}, "", "octave"),
    /unsupported qualification language/,
  );
});

test(
  "relocated SEA language witnesses can emit their lowered Sage source",
  { skip: process.platform === "win32" },
  () => {
    const temporary = mkdtempSync(join(tmpdir(), "sagejs-relocated-sea-language-"));
    try {
      const executable = join(temporary, "mock-sea");
      writeFileSync(
        executable,
        [
          "#!/usr/bin/env node",
          '"use strict";',
          'const { readFileSync } = require("node:fs");',
          "const args = process.argv.slice(2);",
          "process.stdout.write(JSON.stringify({",
          "  args: args.slice(0, -1),",
          '  source: readFileSync(args.at(-1), "utf8"),',
          "}));",
          "",
        ].join("\n"),
      );
      chmodSync(executable, 0o755);
      const result = runRelocatedSeaLanguage(
        { directory: temporary, executable },
        "integral(@(x) x^2,0,1)",
        "matlab",
        { emitSage: true },
      );
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(JSON.parse(result.stdout), {
        args: ["--emit-sage", "--matlab"],
        source: "integral(@(x) x^2,0,1)",
      });
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  },
);
