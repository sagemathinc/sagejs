"use strict";

const assert = require("node:assert/strict");
const { execFileSync, spawnSync } = require("node:child_process");
const {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { isAbsolute, join, relative, resolve } = require("node:path");
const { pathToFileURL } = require("node:url");

const { runPnpm } = require("../pnpm-invocation.cjs");

const SUPPORTED_TARGETS = Object.freeze({
  "linux-x64": Object.freeze({
    os: "linux",
    arch: "x64",
    runtimeId: "linux-x64",
    packageName: "@sagemath/sagejs-linux-x64",
    executableSuffix: "",
  }),
  "linux-arm64": Object.freeze({
    os: "linux",
    arch: "arm64",
    runtimeId: "linux-arm64",
    packageName: "@sagemath/sagejs-linux-arm64",
    executableSuffix: "",
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
  return pathToFileURL(resolve(filename)).href;
}

function archiveListing(archive) {
  return execFileSync("tar", ["-tzf", archive], { encoding: "utf8" });
}

function assertArchiveLayout(rootArchive, platformArchive, targetName) {
  const target = SUPPORTED_TARGETS[targetName];
  assert.ok(target, `unknown target ${targetName}`);
  for (const archive of [rootArchive, platformArchive]) {
    assert.ok(existsSync(archive), `missing package archive ${archive}`);
  }

  const rootContents = archiveListing(rootArchive);
  assert.doesNotMatch(rootContents, /\.sagejs-native-kernels\//);
  assert.doesNotMatch(rootContents, /package\/dist\/native-kernels\//);
  assert.match(rootContents, /package\/dist\/numerical\/backend\.cjs/);
  assert.match(rootContents, /package\/dist\/numerical\/cminpack\.wasm/);
  assert.match(rootContents, /package\/dist\/numerical\/nlopt-backend\.cjs/);
  assert.match(rootContents, /package\/dist\/numerical\/nlopt-methods\.wasm/);

  const platformContents = archiveListing(platformArchive);
  const suffix = target.executableSuffix.replace(".", "\\.");
  assert.match(platformContents, new RegExp(`package/bin/sagejs${suffix}$`, "m"));
  assert.match(platformContents, new RegExp(`package/bin/sagepython${suffix}$`, "m"));
  return { rootContents, platformContents };
}

function runProcess(executable, args, options = {}) {
  const started = process.hrtime.bigint();
  const result = spawnSync(executable, args, {
    cwd: options.cwd,
    input: options.input,
    encoding: "utf8",
    env: options.env || process.env,
    timeout: options.timeout || 180_000,
    windowsHide: true,
  });
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
  if (result.error) throw result.error;
  return {
    status: result.status,
    signal: result.signal,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    elapsedMs,
  };
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

function prepareFreshInstall(options) {
  const targetName = options.target || targetForHost();
  const target = resolveTarget(targetName, options);
  const rootArchive = resolve(options.rootArchive);
  const platformArchive = resolve(options.platformArchive);
  assertArchiveLayout(rootArchive, platformArchive, targetName);

  const ownedDirectory = !options.directory;
  const directory = options.directory
    ? resolve(options.directory)
    : mkdtempSync(join(tmpdir(), `sagejs-npm-${targetName}-`));
  mkdirSync(directory, { recursive: true });
  const rootSpec = fileDependency(rootArchive);
  const platformSpec = fileDependency(platformArchive);
  const manifest = {
    private: true,
    dependencies: {
      "@sagemath/sagejs": rootSpec,
      [target.packageName]: platformSpec,
    },
  };
  writeFileSync(join(directory, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(
    join(directory, "pnpm-workspace.yaml"),
    `overrides:\n  ${JSON.stringify(target.packageName)}: ${JSON.stringify(platformSpec)}\n`,
  );
  runPnpm(["install", "--ignore-scripts"], {
    cwd: directory,
    stdio: options.installStdio || "inherit",
  });

  const installedRoot = join(directory, "node_modules", "@sagemath", "sagejs");
  const platformRoot = join(
    directory,
    "node_modules",
    ...target.packageName.split("/"),
  );
  const rootManifest = JSON.parse(readFileSync(join(installedRoot, "package.json"), "utf8"));
  const platformManifest = JSON.parse(
    readFileSync(join(platformRoot, "package.json"), "utf8"),
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
  const directory = options.directory
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
  archiveListing,
  assertArchiveLayout,
  assertSuccessful,
  fileDependency,
  prepareFreshInstall,
  prepareRelocatedSea,
  prepareRelocatedSeaFromInstall,
  resolveTarget,
  runInstalledNode,
  runInstalledKernelPython,
  runInstalledSourceLanguage,
  runInstalledSourcePython,
  runRelocatedSeaLanguage,
  runRelocatedSeaPython,
  targetForHost,
};
