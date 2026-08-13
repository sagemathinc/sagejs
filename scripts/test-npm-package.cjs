#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const {
  closeSync,
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} = require("node:fs");
const { homedir, tmpdir } = require("node:os");
const { join, relative, resolve, sep } = require("node:path");

const { runPnpm } = require("./pnpm-invocation.cjs");

const PLATFORM_ARCHIVES = Object.freeze({
  "darwin-arm64": "sagejs-macos-arm64.tgz",
  "linux-arm64": "sagejs-linux-arm64.tgz",
  "linux-x64": "sagejs-linux-x64.tgz",
  "win32-x64": "sagejs-windows-x64.tgz",
});

const PLATFORM_PACKAGES = Object.freeze({
  "darwin-arm64": "@sagemath/sagejs-darwin-arm64",
  "linux-arm64": "@sagemath/sagejs-linux-arm64",
  "linux-x64": "@sagemath/sagejs-linux-x64",
  "win32-x64": "@sagemath/sagejs-win32-x64",
});

function hostPlatform(platform = process.platform, arch = process.arch) {
  const id = `${platform}-${arch}`;
  const packageName = PLATFORM_PACKAGES[id];
  if (!packageName) {
    throw new Error(`no native npm release package exists for ${id}`);
  }
  return {
    id,
    packageName,
    archive: PLATFORM_ARCHIVES[id],
    executableSuffix: platform === "win32" ? ".exe" : "",
  };
}

function isWithin(parent, child) {
  const path = relative(resolve(parent), resolve(child));
  return path === "" || (!path.startsWith(`..${sep}`) && path !== "..");
}

function isolatedEnvironment(root, { withoutCompiler = false } = {}) {
  const home = join(root, "home");
  const cache = join(root, "cache");
  const temporary = join(root, "tmp");
  const emptyPath = join(root, "empty-path");
  for (const directory of [home, cache, temporary, emptyPath]) {
    mkdirSync(directory, { recursive: true });
  }
  const environment = {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    XDG_CACHE_HOME: cache,
    npm_config_cache: join(cache, "npm"),
    NPM_CONFIG_CACHE: join(cache, "npm"),
    npm_config_registry: "http://127.0.0.1:9",
    NPM_CONFIG_REGISTRY: "http://127.0.0.1:9",
    SAGEJS_NATIVE_CACHE_DIR: join(cache, "sagejs-native"),
    TMP: temporary,
    TEMP: temporary,
    TMPDIR: temporary,
    NODE_PATH: "",
  };
  if (withoutCompiler) {
    environment.PATH = emptyPath;
    environment.CC = join(emptyPath, "missing-cc");
    environment.CXX = join(emptyPath, "missing-cxx");
  }
  return environment;
}

function installedDependencyOverrides() {
  const roots = JSON.parse(
    runPnpm(["list", "--json", "--depth", "Infinity"], {
      cwd: resolve(__dirname, ".."),
      encoding: "utf8",
    }),
  );
  const overrides = {};
  const visit = (dependency) => {
    if (!dependency || typeof dependency !== "object") return;
    const { from: name, version } = dependency;
    if (
      name &&
      version &&
      !name.startsWith("@sagemath/") &&
      !version.includes(":")
    ) {
      if (overrides[name] && overrides[name] !== version) {
        throw new Error(
          `the validated package graph contains both ${name}@${overrides[name]} ` +
            `and ${name}@${version}`,
        );
      }
      overrides[name] = version;
    }
    for (const kind of ["dependencies", "optionalDependencies"]) {
      for (const child of Object.values(dependency[kind] || {})) visit(child);
    }
  };
  for (const root of roots) {
    for (const kind of ["dependencies", "optionalDependencies"]) {
      for (const dependency of Object.values(root[kind] || {})) visit(dependency);
    }
  }
  assert.ok(Object.keys(overrides).length > 0, "validated dependency graph is empty");
  return overrides;
}

function writeManifest(directory, rootArchive, native, overrides) {
  const dependencies = {
    "@sagemath/sagejs": `file:${rootArchive}`,
  };
  if (native) dependencies[native.packageName] = `file:${native.archive}`;
  writeFileSync(
    join(directory, "package.json"),
    `${JSON.stringify({ private: true, dependencies }, null, 2)}\n`,
  );
  // pnpm 11 moved overrides from package.json to pnpm-workspace.yaml. JSON is
  // valid YAML, and avoids adding a YAML serializer to this release gate.
  writeFileSync(
    join(directory, "pnpm-workspace.yaml"),
    `${JSON.stringify({ packages: ["."], overrides }, null, 2)}\n`,
  );
}

function pnpmStorePath() {
  if (process.env.SAGEJS_TEST_PNPM_STORE) {
    return resolve(process.env.SAGEJS_TEST_PNPM_STORE);
  }
  return resolve(runPnpm(["store", "path"], { encoding: "utf8" }).trim());
}

function pnpmCachePath() {
  if (process.env.SAGEJS_TEST_PNPM_CACHE) {
    return resolve(process.env.SAGEJS_TEST_PNPM_CACHE);
  }
  return resolve(
    process.env.XDG_CACHE_HOME || join(homedir(), ".cache"),
    "pnpm",
  );
}

function installOffline(directory, environment, store, packageManagerCache) {
  runPnpm(
    [
      "install",
      "--offline",
      "--ignore-scripts",
      "--no-optional",
      "--store-dir",
      store,
      "--cache-dir",
      packageManagerCache,
    ],
    { cwd: directory, env: environment, stdio: "inherit" },
  );
}

function installedPackage(directory, packageName) {
  const path = join(directory, "node_modules", ...packageName.split("/"));
  assert.ok(existsSync(path), `${packageName} was not installed`);
  const resolved = realpathSync(path);
  assert.ok(
    isWithin(directory, resolved),
    `${packageName} escaped the isolated installation: ${resolved}`,
  );
  return { path, resolved };
}

function run(executable, arguments_, options = {}) {
  return spawnSync(executable, arguments_, {
    cwd: options.cwd,
    env: options.env,
    encoding: "utf8",
    timeout: options.timeout || 60_000,
  });
}

function assertSucceeded(result, label) {
  assert.equal(
    result.status,
    0,
    `${label} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
}

function rootLauncher(installation, name = "sagejs") {
  return join(
    installation,
    "node_modules",
    "@sagemath",
    "sagejs",
    "bin",
    name,
  );
}

function runPortableWitness(installation, environment) {
  const program = join(installation, "portable-witness.sage");
  writeFileSync(
    program,
    [
      'print(2 + 3, "portable-release-witness")',
      "",
    ].join("\n"),
  );
  const result = run(process.execPath, [rootLauncher(installation), program], {
    cwd: installation,
    env: {
      ...environment,
      SAGEJS_NATIVE_DISABLE: "1",
      SAGEJS_USE_SOURCE: "1",
    },
  });
  assertSucceeded(result, "compiler-free portable CLI witness");
  assert.match(result.stdout, /5 portable-release-witness/);
}

function assertMissingPlatformDiagnostic(installation, environment, native) {
  const result = run(
    process.execPath,
    [rootLauncher(installation), "--jupyter-kernel-self-test"],
    { cwd: installation, env: environment },
  );
  assert.notEqual(result.status, 0, "missing native package silently ran source");
  assert.match(result.stderr, new RegExp(native.packageName.replace("/", "\\/")));
  assert.match(result.stderr, /optional dependencies enabled/);
  assert.doesNotMatch(result.stderr, /MODULE_NOT_FOUND/);
}

function runProgrammaticWitness(installation, environment) {
  const program = join(installation, "programmatic-witness.cjs");
  writeFileSync(
    program,
    `"use strict";\n` +
      `const assert = require("node:assert/strict");\n` +
      `const createCompiler = require("@sagemath/sagejs");\n` +
      `const { createPythonCompilerFrontend } = require("@sagemath/sagejs/frontend");\n` +
      `const { createSage } = require("@sagemath/sagejs/kernel");\n` +
      `(async () => {\n` +
      `  const compiler = createCompiler();\n` +
      `  const frontend = await createPythonCompilerFrontend(compiler, "python");\n` +
      `  const ast = frontend.parse("print(2 + 3)");\n` +
      `  assert.ok(ast);\n` +
      `  frontend.close();\n` +
      `  const sage = await createSage();\n` +
      `  try {\n` +
      `    const result = await sage.evaluate("2 + 3");\n` +
      `    assert.equal(result.repr, "5");\n` +
      `  } finally {\n` +
      `    await sage.close();\n` +
      `  }\n` +
      `  console.log("Sage.js isolated programmatic API passed.");\n` +
      `})().catch((error) => { console.error(error); process.exitCode = 1; });\n`,
  );
  const result = run(process.execPath, [program], {
    cwd: installation,
    env: { ...environment, SAGEJS_NATIVE_DISABLE: "1" },
    timeout: 120_000,
  });
  assertSucceeded(result, "isolated programmatic API witness");
  assert.match(result.stdout, /Sage\.js isolated programmatic API passed\./);
}

function assertNativeApiDiagnostic(installation, environment) {
  const program = join(installation, "native-api-diagnostic.cjs");
  writeFileSync(
    program,
    `"use strict";\n` +
      `const { createSage } = require("@sagemath/sagejs/kernel");\n` +
      `(async () => {\n` +
      `  const sage = await createSage();\n` +
      `  try { await sage.evaluate("matrix(ZZ, 2, [1,2,3,4]).det()"); }\n` +
      `  finally { await sage.close(); }\n` +
      `})().catch((error) => { console.error(error.message); process.exitCode = 7; });\n`,
  );
  const result = run(process.execPath, [program], {
    cwd: installation,
    env: environment,
    timeout: 120_000,
  });
  assert.equal(result.status, 7, "native npm JavaScript API unexpectedly succeeded");
  assert.match(result.stderr, /published Sage\.js JavaScript API/);
  assert.match(result.stderr, /self-contained sagejs and sagepython/);
  assert.doesNotMatch(result.stderr, /Cannot find module/);
}

function runNativeWitness(installation, environment) {
  const program = join(installation, "native-witness.sage");
  writeFileSync(
    program,
    [
      "A = matrix(ZZ, 2, [1, 2, 3, 4])",
      "B = matrix(QQ, 2, [1/2, 1/3, 2/5, 3/7])",
      "C = matrix(QQ, 3, [1, 2, 3, 0, 1, 4, 5, 6, 0])",
      "print(A.det(), B.det(), C.rref().rank())",
      "",
    ].join("\n"),
  );
  const selfTest = run(
    process.execPath,
    [rootLauncher(installation), "--jupyter-kernel-self-test"],
    { cwd: installation, env: environment },
  );
  assertSucceeded(selfTest, "native Jupyter self-test");
  assert.equal(selfTest.stdout.trim(), "Sage.js Jupyter SEA runtime passed.");

  const result = run(process.execPath, [rootLauncher(installation), program], {
    cwd: installation,
    env: environment,
  });
  assertSucceeded(result, "native exact-mathematics witness");
  assert.match(result.stdout, /-2 17\/210 3/);

  const pythonProgram = join(installation, "native-witness.py");
  writeFileSync(pythonProgram, 'print(5 / 2, "sagepython-release-witness")\n');
  const python = run(
    process.execPath,
    [rootLauncher(installation, "sagepython"), pythonProgram],
    { cwd: installation, env: environment },
  );
  assertSucceeded(python, "native sagepython witness");
  assert.equal(python.stdout.trim(), "2.5 sagepython-release-witness");
}

function replaceLinkWithCopy(packagePath) {
  const source = realpathSync(packagePath);
  assert.ok(lstatSync(packagePath).isSymbolicLink(), "pnpm package is not linked");
  unlinkSync(packagePath);
  cpSync(source, packagePath, { recursive: true });
}

function corruptArchive(source, output) {
  copyFileSync(source, output);
  const size = statSync(output).size;
  assert.ok(size > 16, "archive is unexpectedly short");
  const descriptor = openSync(output, "r+");
  try {
    const byte = Buffer.alloc(1);
    readSync(descriptor, byte, 0, 1, size - 8);
    byte[0] ^= 0xff;
    writeSync(descriptor, byte, 0, 1, size - 8);
  } finally {
    closeSync(descriptor);
  }
}

function assertCorruptArchiveRejected(
  root,
  archive,
  environment,
  store,
  packageManagerCache,
  native,
) {
  const directory = join(root, "corrupt-archive-install");
  mkdirSync(directory, { recursive: true });
  const corrupted = join(root, "corrupt-native.tgz");
  corruptArchive(archive, corrupted);
  writeFileSync(
    join(directory, "package.json"),
    `${JSON.stringify(
      {
        private: true,
        dependencies: { [native.packageName]: `file:${corrupted}` },
      },
      null,
      2,
    )}\n`,
  );
  const invocation = process.env.npm_execpath || "pnpm";
  const arguments_ = [
    "install",
    "--offline",
    "--ignore-scripts",
    "--no-optional",
    "--store-dir",
    store,
    "--cache-dir",
    packageManagerCache,
  ];
  const result = invocation.endsWith(".js") || invocation.endsWith(".cjs")
    ? spawnSync(process.execPath, [invocation, ...arguments_], {
        cwd: directory,
        env: environment,
        encoding: "utf8",
      })
    : spawnSync(invocation, arguments_, {
        cwd: directory,
        env: environment,
        encoding: "utf8",
      });
  assert.notEqual(result.status, 0, "pnpm accepted a corrupted platform archive");
}

function removeInstallation(directory) {
  rmSync(join(directory, "node_modules"), { recursive: true, force: true });
  rmSync(join(directory, "pnpm-lock.yaml"), { force: true });
}

function validateManifests(installation, native) {
  const root = installedPackage(installation, "@sagemath/sagejs");
  const platform = installedPackage(installation, native.packageName);
  const rootManifest = JSON.parse(
    readFileSync(join(root.resolved, "package.json"), "utf8"),
  );
  const platformManifest = JSON.parse(
    readFileSync(join(platform.resolved, "package.json"), "utf8"),
  );
  assert.equal(platformManifest.version, rootManifest.version);
  assert.equal(rootManifest.optionalDependencies[native.packageName], rootManifest.version);
  assert.deepEqual(platformManifest.os, [process.platform]);
  assert.deepEqual(platformManifest.cpu, [process.arch]);
  return { root, platform, rootManifest, platformManifest };
}

function parseArguments(arguments_) {
  if (arguments_.includes("--help")) return { help: true };
  const positional = arguments_.filter((argument) => !argument.startsWith("--"));
  const platform = hostPlatform();
  return {
    help: false,
    keep: arguments_.includes("--keep"),
    rootArchive: resolve(positional[0] || "build/release/npm/sagejs.tgz"),
    nativeArchive: resolve(
      positional[1] || join("build", "release", "npm", platform.archive),
    ),
    platform,
  };
}

function main(arguments_ = process.argv.slice(2)) {
  const options = parseArguments(arguments_);
  if (options.help) {
    console.log(
      "Usage: node scripts/test-npm-package.cjs " +
        "[ROOT_ARCHIVE] [PLATFORM_ARCHIVE] [--keep]",
    );
    return;
  }
  for (const archive of [options.rootArchive, options.nativeArchive]) {
    if (!existsSync(archive)) throw new Error(`missing release archive ${archive}`);
  }

  const temporaryRoot = mkdtempSync(join(tmpdir(), "sagejs-npm-release-test-"));
  const initial = join(temporaryRoot, "initial-install");
  const relocated = join(temporaryRoot, "relocated-install");
  mkdirSync(initial, { recursive: true });
  const environment = isolatedEnvironment(temporaryRoot);
  const noCompiler = isolatedEnvironment(temporaryRoot, { withoutCompiler: true });
  const store = pnpmStorePath();
  const packageManagerCache = pnpmCachePath();
  // Consumers normally resolve published dependency ranges through npm. The
  // release gate instead reconstructs the exact graph validated by this
  // checkout and proves that graph installs with the registry unreachable.
  const overrides = installedDependencyOverrides();
  const native = { ...options.platform, archive: options.nativeArchive };

  try {
    console.log("[1/8] Installing the source package offline without optional natives");
    writeManifest(initial, options.rootArchive, undefined, overrides);
    installOffline(initial, environment, store, packageManagerCache);
    installedPackage(initial, "@sagemath/sagejs");
    assert.ok(
      !existsSync(join(initial, "node_modules", ...native.packageName.split("/"))),
      "source-only install unexpectedly resolved a platform package",
    );
    assertMissingPlatformDiagnostic(initial, noCompiler, native);
    runPortableWitness(initial, noCompiler);
    runProgrammaticWitness(initial, noCompiler);

    console.log("[2/8] Upgrading the isolated install with its platform package");
    writeManifest(initial, options.rootArchive, native, overrides);
    installOffline(initial, environment, store, packageManagerCache);
    validateManifests(initial, native);
    runNativeWitness(initial, noCompiler);
    assertNativeApiDiagnostic(initial, noCompiler);

    console.log("[3/8] Relocating the complete installation");
    renameSync(initial, relocated);
    validateManifests(relocated, native);
    runNativeWitness(relocated, noCompiler);
    runProgrammaticWitness(relocated, noCompiler);
    assertNativeApiDiagnostic(relocated, noCompiler);

    console.log("[4/8] Exercising the explicit source override");
    const platform = installedPackage(relocated, native.packageName);
    replaceLinkWithCopy(platform.path);
    const nativeExecutable = join(
      platform.path,
      "bin",
      `sagejs${native.executableSuffix}`,
    );
    const missingExecutable = `${nativeExecutable}.missing`;
    renameSync(nativeExecutable, missingExecutable);
    runPortableWitness(relocated, noCompiler);
    renameSync(missingExecutable, nativeExecutable);

    console.log("[5/8] Rejecting a corrupt installed native executable");
    const originalExecutable = readFileSync(nativeExecutable);
    writeFileSync(nativeExecutable, "not a Sage.js executable\n", { mode: 0o755 });
    const corruptResult = run(
      process.execPath,
      [rootLauncher(relocated), "--jupyter-kernel-self-test"],
      { cwd: relocated, env: noCompiler },
    );
    assert.notEqual(
      corruptResult.status,
      0,
      "a corrupt native executable silently fell back to source",
    );
    writeFileSync(nativeExecutable, originalExecutable, { mode: 0o755 });

    console.log("[6/8] Reinstalling from the original offline archives");
    removeInstallation(relocated);
    installOffline(relocated, environment, store, packageManagerCache);
    validateManifests(relocated, native);
    runNativeWitness(relocated, noCompiler);

    console.log("[7/8] Uninstalling and reinstalling both public packages");
    runPnpm(
      [
        "remove",
        "@sagemath/sagejs",
        native.packageName,
        "--store-dir",
        store,
        "--cache-dir",
        packageManagerCache,
      ],
      { cwd: relocated, env: environment, stdio: "inherit" },
    );
    assert.ok(!existsSync(rootLauncher(relocated)), "Sage.js survived uninstall");
    writeManifest(relocated, options.rootArchive, native, overrides);
    installOffline(relocated, environment, store, packageManagerCache);
    validateManifests(relocated, native);
    runNativeWitness(relocated, noCompiler);

    console.log("[8/8] Rejecting a corrupted platform package archive");
    assertCorruptArchiveRejected(
      temporaryRoot,
      options.nativeArchive,
      environment,
      store,
      packageManagerCache,
      native,
    );
    console.log(
      `Clean ${native.id} npm release install, upgrade, relocation, ` +
        "fallback, reinstall, and uninstall validation passed.",
    );
  } finally {
    if (options.keep) {
      console.log(`Retained release test directory ${temporaryRoot}`);
    } else {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  }
}

if (require.main === module) main();

module.exports = {
  assertCorruptArchiveRejected,
  corruptArchive,
  hostPlatform,
  installOffline,
  installedDependencyOverrides,
  isWithin,
  isolatedEnvironment,
  main,
  parseArguments,
  validateManifests,
};
