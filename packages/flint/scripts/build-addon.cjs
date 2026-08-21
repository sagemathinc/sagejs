#!/usr/bin/env node
"use strict";

const { createHash } = require("node:crypto");
const {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} = require("node:fs");
const { spawnSync } = require("node:child_process");
const { dirname, join, relative, resolve } = require("node:path");

const packageRoot = resolve(__dirname, "..");
const addonRelativePath = "build/Release/sagejs_flint.node";
const manifestRelativePath = "build/Release/sagejs_flint.manifest.json";
const manifestSchema = "sagejs.flint/direct-addon-v1";
const defaultInputPaths = [
  "binding.gyp",
  "package.json",
  "include",
  "src",
  "scripts/build-addon.cjs",
  "scripts/eclib-source.cjs",
  "scripts/native-prefix.cjs",
  "scripts/windows-clang-builtins.cjs",
];
const relevantEnvironment = [
  "AR",
  "CC",
  "CL",
  "CLANG_CL",
  "CXX",
  "GYP_MSVS_VERSION",
  "LD",
  "SAGEJS_CLANG_BUILTINS",
  "SAGEJS_FLINT_PREFIX",
  "VisualStudioVersion",
];

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizedRelative(root, filename) {
  return relative(root, filename).replaceAll("\\", "/");
}

function inputFiles(root, inputPaths = defaultInputPaths) {
  const files = [];
  function visit(filename) {
    if (!existsSync(filename)) return;
    const status = lstatSync(filename);
    if (status.isSymbolicLink()) {
      throw new Error(
        `FLINT direct-addon input cannot be a symlink: ${normalizedRelative(root, filename)}`,
      );
    }
    if (status.isDirectory()) {
      for (const name of readdirSync(filename).sort()) visit(join(filename, name));
      return;
    }
    if (status.isFile()) files.push(filename);
  }
  for (const inputPath of inputPaths) visit(resolve(root, inputPath));
  return files.sort((left, right) =>
    normalizedRelative(root, left).localeCompare(normalizedRelative(root, right))
  );
}

function addonSourceHash(root = packageRoot, inputPaths = defaultInputPaths) {
  const hash = createHash("sha256");
  for (const filename of inputFiles(root, inputPaths)) {
    hash.update(normalizedRelative(root, filename));
    hash.update("\0");
    hash.update(readFileSync(filename));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function addonBuildIdentity(options = {}) {
  const root = options.packageRoot || packageRoot;
  const environment = options.environment || process.env;
  const versions = options.versions || process.versions;
  return {
    schema: manifestSchema,
    source_hash: addonSourceHash(root, options.inputPaths),
    runtime: {
      architecture: options.arch || process.arch,
      modules: versions.modules,
      napi: versions.napi,
      node: versions.node,
      platform: options.platform || process.platform,
    },
    environment: Object.fromEntries(
      relevantEnvironment
        .filter((name) => environment[name] !== undefined)
        .map((name) => [name, environment[name]]),
    ),
  };
}

function readJson(filename) {
  try {
    return JSON.parse(readFileSync(filename, "utf8"));
  } catch {
    return null;
  }
}

function installedAddonStatus(options = {}) {
  const root = options.packageRoot || packageRoot;
  const addonPath = options.addonPath || join(root, addonRelativePath);
  const manifestPath = options.manifestPath || join(root, manifestRelativePath);
  if (!existsSync(addonPath)) {
    return { status: "absent", reason: "direct addon is absent" };
  }
  const expected = addonBuildIdentity({ ...options, packageRoot: root });
  const actual = readJson(manifestPath);
  if (actual === null) {
    return { status: "stale", reason: "build manifest is missing or invalid" };
  }
  for (const key of ["schema", "source_hash", "runtime", "environment"]) {
    if (JSON.stringify(actual[key]) !== JSON.stringify(expected[key])) {
      return { status: "stale", reason: `build manifest ${key} changed` };
    }
  }
  if (actual.addon_hash !== sha256(readFileSync(addonPath))) {
    return { status: "stale", reason: "direct addon content changed" };
  }
  return { status: "current", reason: null };
}

function writeAddonManifest(options = {}) {
  const root = options.packageRoot || packageRoot;
  const addonPath = options.addonPath || join(root, addonRelativePath);
  const manifestPath = options.manifestPath || join(root, manifestRelativePath);
  if (!existsSync(addonPath)) {
    throw new Error(`FLINT direct addon was not produced at ${addonPath}`);
  }
  const manifest = {
    ...addonBuildIdentity({ ...options, packageRoot: root }),
    addon: normalizedRelative(root, addonPath),
    addon_hash: sha256(readFileSync(addonPath)),
  };
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

function buildDirectAddon(options = {}) {
  const root = options.packageRoot || packageRoot;
  const nodeGyp = join(root, "node_modules", "node-gyp", "bin", "node-gyp.js");
  const spawn = options.spawn || spawnSync;
  const result = spawn(process.execPath, [nodeGyp, "rebuild"], {
    cwd: root,
    env: options.environment || process.env,
    stdio: options.stdio || "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`FLINT direct addon build failed with status ${result.status ?? "none"}`);
  }
}

function reconcileInstalledAddon(options = {}) {
  const root = options.packageRoot || packageRoot;
  const status = installedAddonStatus({ ...options, packageRoot: root });
  if (status.status === "absent") {
    return { status: "skipped-absent", reason: status.reason };
  }
  if (status.status === "current") return status;
  const build = options.build || buildDirectAddon;
  build({ ...options, packageRoot: root });
  const manifest = writeAddonManifest({ ...options, packageRoot: root });
  return { status: "rebuilt", reason: status.reason, manifest };
}

function report(result) {
  if (result.status === "current") {
    process.stdout.write("FLINT direct addon is current.\n");
  } else if (result.status === "rebuilt") {
    process.stdout.write(`Rebuilt FLINT direct addon: ${result.reason}.\n`);
  } else {
    process.stdout.write("Skipped FLINT direct addon: optional addon is not installed.\n");
  }
}

function main(argv = process.argv.slice(2)) {
  if (argv.length === 1 && argv[0] === "--reconcile-installed") {
    report(reconcileInstalledAddon());
    return;
  }
  if (argv.length !== 0) {
    throw new Error("usage: build-addon.cjs [--reconcile-installed]");
  }
  buildDirectAddon();
  writeAddonManifest();
  process.stdout.write("Built FLINT direct addon and source-identity manifest.\n");
}

module.exports = {
  addonBuildIdentity,
  addonSourceHash,
  buildDirectAddon,
  defaultInputPaths,
  installedAddonStatus,
  main,
  manifestRelativePath,
  reconcileInstalledAddon,
  writeAddonManifest,
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.stack || error}\n`);
    process.exitCode = 1;
  }
}
