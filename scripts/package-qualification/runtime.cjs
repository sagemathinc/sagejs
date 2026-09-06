"use strict";

const assert = require("node:assert/strict");
const { execFileSync, spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const {
  chmodSync,
  closeSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  openSync,
  readSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { createRequire } = require("node:module");
const { dirname, isAbsolute, join, relative, resolve } = require("node:path");

const { runPnpm } = require("../pnpm-invocation.cjs");

const processSupervisor = join(__dirname, "process-supervisor.cjs");
const archiveValidator = join(__dirname, "archive-validator.cjs");
const trustedRootManifest = JSON.parse(
  readFileSync(join(__dirname, "..", "..", "package.json"), "utf8"),
);
const trustedWorkspaceVersions = new Map();
for (const entry of readdirSync(join(__dirname, "..", "..", "packages"))) {
  const manifestPath = join(
    __dirname,
    "..",
    "..",
    "packages",
    entry,
    "package.json",
  );
  if (!existsSync(manifestPath)) continue;
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.name && manifest.version) {
    trustedWorkspaceVersions.set(manifest.name, manifest.version);
  }
}

const SUPPORTED_TARGETS = Object.freeze({
  "linux-x64": Object.freeze({
    os: "linux",
    arch: "x64",
    runtimeId: "linux-x64",
    packageName: "@sagemath/sagejs-linux-x64",
    executableSuffix: "",
    libc: "glibc",
  }),
  "linux-arm64": Object.freeze({
    os: "linux",
    arch: "arm64",
    runtimeId: "linux-arm64",
    packageName: "@sagemath/sagejs-linux-arm64",
    executableSuffix: "",
    libc: "glibc",
  }),
  "macos-arm64": Object.freeze({
    os: "darwin",
    arch: "arm64",
    runtimeId: "darwin-arm64",
    packageName: "@sagemath/sagejs-darwin-arm64",
    executableSuffix: "",
  }),
  "windows-x64": Object.freeze({
    os: "win32",
    arch: "x64",
    runtimeId: "win32-x64",
    packageName: "@sagemath/sagejs-win32-x64",
    executableSuffix: ".exe",
  }),
});

function targetForHost(platform = process.platform, arch = process.arch) {
  return Object.entries(SUPPORTED_TARGETS).find(
    ([, target]) => target.os === platform && target.arch === arch,
  )?.[0];
}

function resolveTarget(name, options = {}) {
  const target = SUPPORTED_TARGETS[name];
  if (!target) {
    throw new Error(
      `unsupported package qualification target ${JSON.stringify(name)}; ` +
        `expected one of ${Object.keys(SUPPORTED_TARGETS).join(", ")}`,
    );
  }
  const platform = options.platform || process.platform;
  const arch = options.arch || process.arch;
  if (!options.allowCrossTarget && (target.os !== platform || target.arch !== arch)) {
    throw new Error(
      `cannot execute ${name} package artifacts on ${platform}-${arch}; ` +
        "run this qualification on the matching persistent host",
    );
  }
  return target;
}

function fileDependency(filename) {
  // pnpm's file: dependency protocol takes a filesystem path, not a URL:
  // percent escapes are treated literally (including Windows RUNNER~1 paths).
  const absolute = resolve(filename);
  return `file:${process.platform === "win32" ? absolute.replaceAll("\\", "/") : absolute}`;
}

function fileDigest(filename) {
  const hash = createHash("sha256");
  const descriptor = openSync(filename, "r");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    for (;;) {
      const count = readSync(descriptor, buffer, 0, buffer.length, null);
      if (count === 0) break;
      hash.update(buffer.subarray(0, count));
    }
  } finally {
    closeSync(descriptor);
  }
  return hash.digest("hex");
}

function assertArchiveDigests(archives, expected) {
  for (const archive of archives) {
    assert.equal(
      fileDigest(archive),
      expected.get(archive),
      `validated package archive changed during installation: ${archive}`,
    );
  }
}

function archiveJson(archive, filename) {
  return JSON.parse(
    execFileSync("tar", ["-xOzf", archive, `package/${filename}`], {
      encoding: "utf8",
    }),
  );
}

function validateTarArchive(archive) {
  const result = assertSuccessful(
    runProcess(process.execPath, [archiveValidator, resolve(archive)], {
      maxBuffer: 64 * 1024 * 1024,
      timeout: 180_000,
    }),
    `validate package archive ${archive}`,
  );
  return JSON.parse(result.stdout);
}

function memberMap(validation) {
  return new Map(validation.members.map((member) => [member.path, member]));
}

function requireRegularMember(members, path) {
  assert.equal(
    members.get(path)?.type,
    "file",
    `package archive requires regular file ${path}`,
  );
}

function expectedPublishedRootManifest() {
  const expected = JSON.parse(JSON.stringify(trustedRootManifest));
  // pnpm intentionally omits this development-only field and the recursive
  // prepack hook from packed output.
  delete expected.packageManager;
  delete expected.scripts?.prepack;
  for (const section of [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies",
  ]) {
    for (const [name, reference] of Object.entries(expected[section] || {})) {
      if (!reference.startsWith("workspace:")) continue;
      const version = trustedWorkspaceVersions.get(name);
      assert.ok(version, `missing trusted workspace version for ${name}`);
      expected[section][name] = version;
    }
  }
  return expected;
}

function assertManifestPolicy(rootManifest, platformManifest, targetName, target) {
  // Pin the complete manifest to the source checkout trust anchor, including
  // every dependency reference and execution-affecting field. The only pack
  // transformations allowed are pnpm's documented workspace-version rewrite
  // and omission of the development-only packageManager field.
  assert.deepEqual(
    rootManifest,
    expectedPublishedRootManifest(),
    "root package manifest differs from the trusted publish contract",
  );

  const expectedPlatform = {
    name: target.packageName,
    version: rootManifest.version,
    description: `Sage.js native executables for ${targetName}`,
    repository: trustedRootManifest.repository,
    homepage: trustedRootManifest.homepage,
    license: trustedRootManifest.license,
    os: [target.os],
    cpu: [target.arch],
    bin: {
      [`sagejs-${targetName}`]: `bin/sagejs${target.executableSuffix}`,
      [`sagepython-${targetName}`]: `bin/sagepython${target.executableSuffix}`,
    },
    files: ["bin", "licenses", "LICENSE", "README.md"],
  };
  if (target.libc) expectedPlatform.libc = [target.libc];
  assert.deepEqual(
    platformManifest,
    expectedPlatform,
    "platform package manifest differs from the release-package contract",
  );
}

function assertArchiveLayout(rootArchive, platformArchive, targetName) {
  const target = SUPPORTED_TARGETS[targetName];
  assert.ok(target, `unknown target ${targetName}`);
  for (const archive of [rootArchive, platformArchive]) {
    assert.ok(existsSync(archive), `missing package archive ${archive}`);
  }

  const rootValidation = validateTarArchive(rootArchive);
  const rootMembers = memberMap(rootValidation);
  for (const path of rootMembers.keys()) {
    assert.doesNotMatch(path, /\.sagejs-native-kernels\//);
    assert.doesNotMatch(path, /^package\/dist\/native-kernels\//);
  }
  for (const path of [
    "package/package.json",
    "package/dist/numerical/backend.cjs",
    "package/dist/numerical/cminpack.wasm",
    "package/dist/numerical/nlopt-backend.cjs",
    "package/dist/numerical/nlopt-methods.wasm",
  ]) {
    requireRegularMember(rootMembers, path);
  }

  const rootManifest = archiveJson(rootArchive, "package.json");
  assert.equal(rootManifest.name, "@sagemath/sagejs");
  assert.equal(
    rootManifest.optionalDependencies?.[target.packageName],
    rootManifest.version,
    `root package must declare exact optional dependency ` +
      `${target.packageName}@${rootManifest.version}`,
  );

  const platformValidation = validateTarArchive(platformArchive);
  const platformMembers = memberMap(platformValidation);
  for (const path of [
    "package/package.json",
    `package/bin/sagejs${target.executableSuffix}`,
    `package/bin/sagepython${target.executableSuffix}`,
  ]) {
    requireRegularMember(platformMembers, path);
  }
  const platformManifest = archiveJson(platformArchive, "package.json");
  assert.equal(platformManifest.name, target.packageName);
  assert.equal(platformManifest.version, rootManifest.version);
  assert.deepEqual(platformManifest.os, [target.os]);
  assert.deepEqual(platformManifest.cpu, [target.arch]);
  if (target.libc) assert.deepEqual(platformManifest.libc, [target.libc]);
  assert.deepEqual(platformManifest.bin, {
    [`sagejs-${targetName}`]: `bin/sagejs${target.executableSuffix}`,
    [`sagepython-${targetName}`]: `bin/sagepython${target.executableSuffix}`,
  });
  assertManifestPolicy(rootManifest, platformManifest, targetName, target);
  return { rootManifest, rootValidation, platformManifest, platformValidation };
}

function runProcess(executable, args, options = {}) {
  const timeoutMs = options.timeout || 180_000;
  assert.equal(
    Number.isSafeInteger(timeoutMs) && timeoutMs > 0,
    true,
    `invalid process timeout ${JSON.stringify(timeoutMs)}`,
  );
  const maxOutputBytes = options.maxBuffer || 16 * 1024 * 1024;
  assert.equal(
    Number.isSafeInteger(maxOutputBytes) && maxOutputBytes > 0,
    true,
    `invalid process output limit ${JSON.stringify(maxOutputBytes)}`,
  );
  const metadataDirectory = mkdtempSync(join(tmpdir(), "sagejs-process-"));
  const metadataPath = join(metadataDirectory, "result.json");
  const started = process.hrtime.bigint();
  try {
    const supervisor = spawnSync(
      process.execPath,
      [
        processSupervisor,
        metadataPath,
        String(timeoutMs),
        String(maxOutputBytes),
        executable,
        ...args,
      ],
      {
        cwd: options.cwd,
        input: options.input,
        encoding: "utf8",
        env: options.env || process.env,
        // The supervisor captures bounded child output in metadata, so its own
        // stdout/stderr remain diagnostic-only and cannot trigger ENOBUFS while
        // leaving the supervised process group alive.
        maxBuffer: 1024 * 1024,
        windowsHide: true,
      },
    );
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
    if (supervisor.error) throw supervisor.error;
    assert.equal(
      existsSync(metadataPath),
      true,
      `process supervisor failed with status ${supervisor.status}: ` +
        `${supervisor.stderr || supervisor.stdout || "no output"}`,
    );
    const metadata = JSON.parse(readFileSync(metadataPath, "utf8"));
    const stdout = Buffer.from(metadata.stdout || "", "base64").toString("utf8");
    const stderr = Buffer.from(metadata.stderr || "", "base64").toString("utf8");
    if (metadata.spawnError) {
      const error = new Error(metadata.spawnError.message);
      error.code = metadata.spawnError.code;
      throw error;
    }
    if (metadata.treeKillError) {
      const error = new Error(
        `failed to terminate supervised process tree: ` +
          metadata.treeKillError.message,
      );
      error.code = metadata.treeKillError.code;
      throw error;
    }
    if (metadata.outputExceeded) {
      const error = new Error(
        `supervised process output exceeded ${metadata.maxOutputBytes} bytes`,
      );
      error.code = "ENOBUFS";
      error.stdout = stdout;
      error.stderr = stderr;
      throw error;
    }
    return {
      status: metadata.status,
      signal: metadata.signal,
      stdout,
      stderr,
      elapsedMs,
      timedOut: Boolean(metadata.timedOut),
    };
  } finally {
    rmSync(metadataDirectory, { recursive: true, force: true });
  }
}

function assertSuccessful(result, description) {
  assert.equal(
    result.status,
    0,
    `${description} failed` +
      (result.signal ? ` with signal ${result.signal}` : "") +
      `\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
  return result;
}

function writeProgram(directory, prefix, source, extension = "py") {
  const filename = join(
    directory,
    `${prefix}-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.${extension}`,
  );
  writeFileSync(filename, source);
  return filename;
}

function assertContained(parent, child) {
  const relation = relative(realpathSync(parent), realpathSync(child));
  assert.equal(
    relation === "" || (!relation.startsWith("..") && !isAbsolute(relation)),
    true,
    `${child} escaped fresh install ${parent}`,
  );
}

function auditInstalledClosure(consumerDirectory, installedPath, label) {
  const consumer = realpathSync(consumerDirectory);
  const closure = realpathSync(installedPath);
  assertContained(consumer, closure);
  const pending = [closure];
  let entries = 0;
  while (pending.length > 0) {
    const current = pending.pop();
    const stats = lstatSync(current);
    assert.equal(
      stats.isSymbolicLink(),
      false,
      `${label} contains a symbolic link or Windows reparse point: ${current}`,
    );
    assertContained(closure, realpathSync(current));
    assertContained(consumer, realpathSync(current));
    if (stats.isDirectory()) {
      for (const name of readdirSync(current)) pending.push(join(current, name));
    } else {
      assert.equal(
        stats.isFile(),
        true,
        `${label} contains a non-file special entry: ${current}`,
      );
    }
    entries += 1;
    assert.ok(entries <= 100_000, `${label} exceeds 100000 installed entries`);
  }
  return { closure, entries };
}

function prepareFreshInstall(options) {
  const targetName = options.target || targetForHost();
  const target = resolveTarget(targetName, options);
  const rootArchiveSource = resolve(options.rootArchive);
  const platformArchiveSource = resolve(options.platformArchive);

  const ownedDirectory = !options.directory;
  let directory;
  try {
    directory = options.directory
      ? resolve(options.directory)
      : mkdtempSync(join(tmpdir(), `sagejs-npm-${targetName}-`));
    mkdirSync(directory, { recursive: true });
    // Bind installation to private copies of exactly the bytes validated
    // below. A caller cannot swap an external archive between validation and
    // pnpm extraction.
    const archiveDirectory = join(
      directory,
      `qualification-archives-${process.pid}-${Date.now()}`,
    );
    mkdirSync(archiveDirectory, { mode: 0o700 });
    chmodSync(archiveDirectory, 0o700);
    const rootArchive = join(archiveDirectory, "sagejs-root.tgz");
    const platformArchive = join(archiveDirectory, "sagejs-platform.tgz");
    copyFileSync(rootArchiveSource, rootArchive);
    copyFileSync(platformArchiveSource, platformArchive);
    chmodSync(rootArchive, 0o400);
    chmodSync(platformArchive, 0o400);
    const archives = [rootArchive, platformArchive];
    const archiveDigests = new Map(
      archives.map((archive) => [archive, fileDigest(archive)]),
    );
    const archiveLayout = assertArchiveLayout(
      rootArchive,
      platformArchive,
      targetName,
    );
    // Detect a same-user replacement even if it races validation itself.
    assertArchiveDigests(archives, archiveDigests);
    const rootSpec = fileDependency(rootArchive);
    const platformSpec = fileDependency(platformArchive);
    const manifest = {
      private: true,
      dependencies: {
        "@sagemath/sagejs": rootSpec,
      },
    };
    writeFileSync(
      join(directory, "package.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    writeFileSync(
      join(directory, "pnpm-workspace.yaml"),
      `overrides:\n  ${JSON.stringify(target.packageName)}: ${JSON.stringify(platformSpec)}\n`,
    );
    const installRunner = options.installRunner || runPnpm;
    try {
      installRunner(["install", "--ignore-scripts"], {
        cwd: directory,
        stdio: options.installStdio || "inherit",
      });
    } catch (error) {
      // Qualification adapters pipe output to protect their JSON protocol.
      // Preserve the causal package-manager error when that subprocess fails.
      throw new Error(`Fresh npm installation failed: ${error.message}\n${error.stdout || ""}\n${error.stderr || ""}`, { cause: error });
    }
    // Do not inspect or execute any installed candidate bytes unless pnpm
    // consumed the exact archive files validated above.
    assertArchiveDigests(archives, archiveDigests);

    const installedRoot = join(directory, "node_modules", "@sagemath", "sagejs");
    auditInstalledClosure(directory, installedRoot, "installed @sagemath/sagejs");
    const rootManifest = JSON.parse(
      readFileSync(join(installedRoot, "package.json"), "utf8"),
    );
    assert.deepEqual(
      rootManifest,
      archiveLayout.rootManifest,
      "installed root manifest differs from validated archive manifest",
    );
    // Resolve from pnpm's real package location so transitive optional
    // dependencies are found beside the root package in its virtual-store
    // snapshot. Resolving from the consumer symlink would only search the
    // consumer's top-level scope.
    const installedRequire = createRequire(
      join(realpathSync(installedRoot), "package.json"),
    );
    const platformManifestPath = installedRequire.resolve(
      `${target.packageName}/package.json`,
    );
    const platformRoot = dirname(platformManifestPath);
    auditInstalledClosure(directory, platformRoot, `installed ${target.packageName}`);
    const platformManifest = JSON.parse(
      readFileSync(platformManifestPath, "utf8"),
    );
    assert.deepEqual(
      platformManifest,
      archiveLayout.platformManifest,
      "installed platform manifest differs from validated archive manifest",
    );
    assert.equal(rootManifest.name, "@sagemath/sagejs");
    assert.equal(platformManifest.name, target.packageName);
    assert.equal(platformManifest.version, rootManifest.version);
    assertContained(directory, installedRoot);
    assertContained(directory, platformRoot);

    return {
      kind: "fresh-npm-install",
      target: targetName,
      targetConfig: target,
      directory,
      installedRoot,
      platformRoot,
      version: rootManifest.version,
      ownedDirectory,
      cleanup() {
        if (ownedDirectory) rmSync(directory, { recursive: true, force: true });
      },
    };
  } catch (error) {
    if (ownedDirectory && directory) {
      rmSync(directory, { recursive: true, force: true });
    }
    throw error;
  }
}

function runInstalledSourcePython(context, source, options = {}) {
  return runInstalledSourceLanguage(context, source, "python", options);
}

const LANGUAGE_ARGUMENTS = Object.freeze({
  python: Object.freeze({ argument: "--python", extension: "py" }),
  sage: Object.freeze({ argument: null, extension: "sage" }),
  magma: Object.freeze({ argument: "--magma", extension: "m" }),
  matlab: Object.freeze({ argument: "--matlab", extension: "matlab" }),
  wolfram: Object.freeze({ argument: "--wolfram", extension: "wl" }),
});

function languageConfiguration(language) {
  const configuration = LANGUAGE_ARGUMENTS[language];
  if (!configuration) {
    throw new Error(
      `unsupported qualification language ${JSON.stringify(language)}; ` +
        `expected one of ${Object.keys(LANGUAGE_ARGUMENTS).join(", ")}`,
    );
  }
  return configuration;
}

function runInstalledSourceLanguage(context, source, language, options = {}) {
  const configuration = languageConfiguration(language);
  const program = writeProgram(
    context.directory,
    "installed-source",
    source,
    configuration.extension,
  );
  try {
    const args = [join(context.installedRoot, "bin", "sagejs-source.cjs")];
    if (configuration.argument) args.push(configuration.argument);
    args.push(program);
    return runProcess(
      process.execPath,
      args,
      {
        cwd: context.directory,
        timeout: options.timeout,
        env: {
          ...process.env,
          SAGEJS_NATIVE_DISABLE: "1",
          ...(options.env || {}),
        },
      },
    );
  } finally {
    rmSync(program, { force: true });
  }
}

function runInstalledNode(context, source, options = {}) {
  const program = join(
    context.directory,
    `installed-node-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.cjs`,
  );
  writeFileSync(program, source);
  try {
    return runProcess(process.execPath, [program, ...(options.args || [])], {
      cwd: context.directory,
      input: options.input,
      timeout: options.timeout,
      env: {
        ...process.env,
        SAGEJS_QUALIFICATION_INSTALLED_ROOT: context.installedRoot,
        ...(options.env || {}),
      },
    });
  } finally {
    rmSync(program, { force: true });
  }
}

function runInstalledKernelPython(context, source, options = {}) {
  const runner = join(context.directory, "run-installed-kernel.cjs");
  if (!existsSync(runner)) {
    writeFileSync(
      runner,
      [
        '"use strict";',
        'const { readFileSync } = require("node:fs");',
        'const { createSage } = require("@sagemath/sagejs");',
        "(async () => {",
        '  const sage = await createSage({ mode: "python" });',
        "  try {",
        '    const source = readFileSync(0, "utf8");',
        '    const result = await sage.evaluate(source, { language: "python" });',
        '    process.stdout.write(result.stdout || "");',
        "  } finally {",
        "    await sage.close();",
        "  }",
        "})().catch((error) => {",
        "  console.error(error && error.stack || error);",
        "  process.exitCode = 1;",
        "});",
        "",
      ].join("\n"),
    );
  }
  return runProcess(process.execPath, [runner], {
    cwd: context.directory,
    input: source,
    timeout: options.timeout,
    env: { ...process.env, ...(options.env || {}) },
  });
}

function prepareRelocatedSea(options) {
  const targetName = options.target || targetForHost();
  const target = resolveTarget(targetName, options);
  const input = resolve(options.executable);
  assert.ok(existsSync(input), `missing SEA executable ${input}`);
  const ownedDirectory = !options.directory;
  let directory;
  try {
    directory = options.directory
      ? resolve(options.directory)
      : mkdtempSync(join(tmpdir(), `sagejs-sea-${targetName}-`));
    mkdirSync(directory, { recursive: true });
    const executable = join(directory, `sagepython${target.executableSuffix}`);
    copyFileSync(input, executable);
    if (target.os !== "win32") chmodSync(executable, 0o755);
    return {
      kind: "relocated-sea",
      target: targetName,
      targetConfig: target,
      directory,
      executable,
      ownedDirectory,
      cleanup() {
        if (ownedDirectory) rmSync(directory, { recursive: true, force: true });
      },
    };
  } catch (error) {
    if (ownedDirectory && directory) {
      rmSync(directory, { recursive: true, force: true });
    }
    throw error;
  }
}

function prepareRelocatedSeaFromInstall(context, options = {}) {
  const input = join(
    context.platformRoot,
    "bin",
    `sagepython${context.targetConfig.executableSuffix}`,
  );
  return prepareRelocatedSea({
    executable: input,
    target: context.target,
    directory: options.directory,
  });
}

function runRelocatedSeaPython(context, source, options = {}) {
  return runRelocatedSeaLanguage(context, source, "python", options);
}

function runRelocatedSeaLanguage(context, source, language, options = {}) {
  const configuration = languageConfiguration(language);
  const program = writeProgram(
    context.directory,
    "relocated-sea",
    source,
    configuration.extension,
  );
  try {
    const args = [];
    if (options.emitSage === true) args.push("--emit-sage");
    if (configuration.argument) args.push(configuration.argument);
    args.push(program);
    return runProcess(context.executable, args, {
      cwd: context.directory,
      timeout: options.timeout,
      env: { ...process.env, ...(options.env || {}) },
    });
  } finally {
    rmSync(program, { force: true });
  }
}

module.exports = {
  SUPPORTED_TARGETS,
  archiveJson,
  assertArchiveLayout,
  assertSuccessful,
  auditInstalledClosure,
  expectedPublishedRootManifest,
  fileDependency,
  prepareFreshInstall,
  prepareRelocatedSea,
  prepareRelocatedSeaFromInstall,
  resolveTarget,
  runProcess,
  runInstalledNode,
  runInstalledKernelPython,
  runInstalledSourceLanguage,
  runInstalledSourcePython,
  runRelocatedSeaLanguage,
  runRelocatedSeaPython,
  targetForHost,
  validateTarArchive,
};
