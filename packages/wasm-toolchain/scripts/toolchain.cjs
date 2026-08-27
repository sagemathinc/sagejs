#!/usr/bin/env node
"use strict";

const { createHash } = require("node:crypto");
const { spawnSync, execFileSync } = require("node:child_process");
const {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} = require("node:fs");
const { dirname, join, relative, resolve } = require("node:path");
const { buildLibraries, setCommandObserver } = require("../recipes/libraries.cjs");
const { buildSmalljac } = require("../recipes/smalljac.cjs");

const packageRoot = resolve(__dirname, "..");
const repositoryRoot = resolve(packageRoot, "..", "..");
const lockFilename = join(packageRoot, "lock.json");
const markerName = "receipt.json";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sha256File(filename) {
  return sha256(readFileSync(filename));
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map(
      (key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`,
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

function platformKey(platform = process.platform, architecture = process.arch) {
  const os = platform === "darwin" ? "darwin" : platform;
  const arch = architecture === "x64" ? "x64" : architecture === "arm64" ? "arm64" : architecture;
  return `${os}-${arch}`;
}

function assertObjectShape(value, { name, required, optional = [] }) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
  const allowed = new Set([...required, ...optional]);
  const unexpected = Object.keys(value).filter((key) => !allowed.has(key));
  const missing = required.filter((key) => !(key in value));
  if (unexpected.length || missing.length) {
    throw new Error(
      `${name} shape differs` +
      (missing.length ? `; missing ${missing.join(", ")}` : "") +
      (unexpected.length ? `; unexpected ${unexpected.join(", ")}` : ""),
    );
  }
}

function assertStringArray(value, name) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new Error(`${name} must be an array of strings`);
  }
}

function loadLock(filename = lockFilename) {
  const lock = JSON.parse(readFileSync(filename, "utf8"));
  assertObjectShape(lock, {
    name: "toolchain lock",
    required: [
      "$schema", "schema", "sourceCatalog", "canonicalBuilder", "wasiSdk",
      "libraries", "build",
    ],
  });
  if (lock.$schema !== "./lock.schema.json" ||
      lock.schema !== "sagejs.wasm-toolchain-lock/v2") {
    throw new Error(`unsupported Sage.js Wasm toolchain lock in ${filename}`);
  }
  assertObjectShape(lock.wasiSdk, {
    name: "toolchain lock wasiSdk",
    required: ["version", "target", "sources"],
  });
  if (lock.wasiSdk.target !== "wasm32-wasip1") {
    throw new Error("the Sage.js Wasm toolchain target must be wasm32-wasip1");
  }
  if (lock.canonicalBuilder !== "linux-x64" ||
      lock.sourceCatalog !== "../../tools/source-mirror/catalog.json") {
    throw new Error("the Sage.js Wasm toolchain lock has an invalid root policy");
  }
  if (typeof lock.wasiSdk.version !== "string") {
    throw new Error("toolchain lock wasiSdk.version must be a string");
  }
  assertObjectShape(lock.wasiSdk.sources, {
    name: "toolchain lock wasiSdk.sources",
    required: ["linux-x64", "linux-arm64", "darwin-x64", "darwin-arm64"],
  });
  for (const [platform, source] of Object.entries(lock.wasiSdk.sources)) {
    if (typeof source !== "string" || !source) {
      throw new Error(`toolchain lock has an invalid SDK source for ${platform}`);
    }
  }
  if (lock.libraries === null || typeof lock.libraries !== "object" ||
      Array.isArray(lock.libraries) || Object.keys(lock.libraries).length === 0) {
    throw new Error("toolchain lock libraries must be a nonempty object");
  }
  for (const [name, dependency] of Object.entries(lock.libraries)) {
    assertObjectShape(dependency, {
      name: `toolchain lock library ${name}`,
      required: ["version", "source", "prefix", "archiveName"],
      optional: ["required"],
    });
    if (![dependency.version, dependency.source, dependency.prefix,
          dependency.archiveName].every((value) => typeof value === "string") ||
        !/^prefixes\/[a-z0-9-]+$/.test(dependency.prefix) ||
        !/^lib[A-Za-z0-9_]+\.a$/.test(dependency.archiveName) ||
        (dependency.required !== undefined && typeof dependency.required !== "boolean")) {
      throw new Error(`toolchain lock library ${name} is invalid`);
    }
  }
  assertObjectShape(lock.build, {
    name: "toolchain lock build policy",
    required: [
      "target", "jobs", "cFlags", "linkFlags", "emulationLibraries",
      "repositoryInputs",
    ],
  });
  if (lock.build.target !== "wasm32-wasip1" ||
      !Number.isInteger(lock.build.jobs) || lock.build.jobs < 1 || lock.build.jobs > 64) {
    throw new Error("toolchain lock build target or job count is invalid");
  }
  for (const field of ["cFlags", "linkFlags", "emulationLibraries", "repositoryInputs"]) {
    assertStringArray(lock.build[field], `toolchain lock build.${field}`);
    if (new Set(lock.build[field]).size !== lock.build[field].length) {
      throw new Error(`toolchain lock build.${field} contains duplicates`);
    }
  }
  if (lock.build.repositoryInputs.length === 0 ||
      lock.build.repositoryInputs.some((value) =>
        value.startsWith("/") || value.split("/").includes(".."))) {
    throw new Error("toolchain lock repository inputs are invalid");
  }
  return lock;
}

function loadCatalog(lock = loadLock()) {
  const filename = resolve(packageRoot, ...lock.sourceCatalog.split("/"));
  const catalog = JSON.parse(readFileSync(filename, "utf8"));
  assertObjectShape(catalog, {
    name: "source catalog",
    required: ["$schema", "schema", "r2Prefix", "objects"],
  });
  if (catalog.$schema !== "./catalog.schema.json" ||
      catalog.schema !== "sagejs.source-catalog/v2" ||
      typeof catalog.r2Prefix !== "string" || !/^[a-z0-9][a-z0-9/-]+$/.test(catalog.r2Prefix) ||
      catalog.r2Prefix.endsWith("/") || catalog.r2Prefix.includes("//") ||
      !Array.isArray(catalog.objects) || catalog.objects.length === 0) {
    throw new Error(`unsupported source catalog in ${filename}`);
  }
  const ids = new Set();
  for (const object of catalog.objects) {
    assertObjectShape(object, {
      name: "source catalog object",
      required: ["id", "filename", "sha256", "upstreamUrls"],
      optional: ["platform", "archiveEnvironment"],
    });
    if (!/^[a-z0-9][a-z0-9-]+$/.test(object.id ?? "") || ids.has(object.id)) {
      throw new Error(`invalid or duplicate source object ${object.id ?? "missing"}`);
    }
    if (!/^[0-9a-f]{64}$/.test(object.sha256 ?? "")) {
      throw new Error(`${object.id} lacks a complete SHA-256 identity`);
    }
    if (!Array.isArray(object.upstreamUrls) || object.upstreamUrls.length === 0 ||
        new Set(object.upstreamUrls).size !== object.upstreamUrls.length ||
        object.upstreamUrls.some((url) => !url.startsWith("https://"))) {
      throw new Error(`${object.id} lacks authenticated HTTPS bootstrap locations`);
    }
    if (typeof object.filename !== "string" || object.filename.includes("/") ||
        object.filename === "." || object.filename === ".." ||
        (object.platform !== undefined &&
         !["linux-x64", "linux-arm64", "darwin-x64", "darwin-arm64"].includes(
           object.platform,
         )) ||
        (object.archiveEnvironment !== undefined &&
         !/^SAGEJS_[A-Z0-9_]+_TARBALL$/.test(object.archiveEnvironment))) {
      throw new Error(`${object.id} has unsafe catalog metadata`);
    }
    ids.add(object.id);
  }
  return { ...catalog, filename };
}

function selectedSources(lock = loadLock(), catalog = loadCatalog(lock), platform = platformKey()) {
  const sourceIds = new Set([
    lock.wasiSdk.sources[platform],
    ...Object.values(lock.libraries).map((dependency) => dependency.source),
  ]);
  if (sourceIds.has(undefined)) {
    throw new Error(`WASI SDK ${lock.wasiSdk.version} does not support ${platform}`);
  }
  const byId = new Map(catalog.objects.map((object) => [object.id, object]));
  const selected = {};
  for (const id of [...sourceIds].sort()) {
    const object = byId.get(id);
    if (!object) throw new Error(`source catalog lacks ${id}`);
    if (object.platform && object.platform !== platform) {
      throw new Error(`${id} targets ${object.platform}, not ${platform}`);
    }
    selected[id] = object;
  }
  return selected;
}

function toolchainDigest(
  lock = loadLock(),
  catalog = loadCatalog(lock),
  platform = platformKey(),
) {
  const inputs = lock.build.repositoryInputs.map((name) => {
    const filename = resolve(repositoryRoot, ...name.split("/"));
    if (!existsSync(filename)) throw new Error(`toolchain input is missing: ${name}`);
    return { path: name, sha256: sha256File(filename) };
  });
  return sha256(canonicalJson({
    lock,
    platform,
    sources: selectedSources(lock, catalog, platform),
    inputs,
    resolverSha256: sha256File(__filename),
  }));
}

function gitCommonDirectory(root = repositoryRoot) {
  return resolve(execFileSync(
    "git",
    ["rev-parse", "--path-format=absolute", "--git-common-dir"],
    { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  ).trim());
}

function defaultCacheRoot(root = repositoryRoot) {
  return resolve(
    process.env.SAGEJS_WASM_TOOLCHAIN_CACHE ||
      join(gitCommonDirectory(root), "sagejs-wasm-toolchains"),
  );
}

function cacheRoot(lock = loadLock(), root = repositoryRoot) {
  return join(defaultCacheRoot(root), "v2", toolchainDigest(lock));
}

function explicitRoot(environment = process.env) {
  return environment.SAGEJS_WASM_TOOLCHAIN_ROOT
    ? resolve(environment.SAGEJS_WASM_TOOLCHAIN_ROOT)
    : null;
}

function pathsForRoot(root, lock = loadLock()) {
  const libraries = {};
  for (const [name, dependency] of Object.entries(lock.libraries)) {
    libraries[name] = { ...dependency, prefix: join(root, ...dependency.prefix.split("/")) };
  }
  return {
    root,
    sdk: join(root, "sdk"),
    clang: join(root, "sdk", "bin", "clang"),
    clangxx: join(root, "sdk", "bin", "clang++"),
    llvmAr: join(root, "sdk", "bin", "llvm-ar"),
    llvmRanlib: join(root, "sdk", "bin", "llvm-ranlib"),
    llvmStrip: join(root, "sdk", "bin", "llvm-strip"),
    wasmLd: join(root, "sdk", "bin", "wasm-ld"),
    sysroot: join(root, "sdk", "share", "wasi-sysroot"),
    fenvCompatibility: join(packageRoot, "patches", "sagejs_wasi_fenv_compat.h"),
    libraries,
  };
}

function requiredFiles(paths, lock) {
  const files = [
    paths.clang,
    paths.clangxx,
    paths.llvmAr,
    paths.llvmRanlib,
    paths.llvmStrip,
    paths.wasmLd,
    paths.sysroot,
  ];
  for (const [name, dependency] of Object.entries(lock.libraries)) {
    if (dependency.required === false) continue;
    const prefix = paths.libraries[name].prefix;
    files.push(join(prefix, "include"));
    files.push(join(prefix, "lib", dependency.archiveName));
  }
  return files;
}

function inspectToolchain({ root = repositoryRoot, environment = process.env } = {}) {
  const lock = loadLock();
  const platform = platformKey();
  const catalog = loadCatalog(lock);
  const sources = selectedSources(lock, catalog, platform);
  const digest = toolchainDigest(lock, catalog, platform);
  const override = explicitRoot(environment);
  const preparedRoot = override || cacheRoot(lock, root);
  const paths = pathsForRoot(preparedRoot, lock);
  const problems = requiredFiles(paths, lock)
    .filter((filename) => !existsSync(filename))
    .map((filename) => `missing ${relative(preparedRoot, filename)}`);
  let receipt = null;
  try {
    receipt = JSON.parse(readFileSync(join(preparedRoot, markerName), "utf8"));
  } catch {}
  if (receipt?.schema !== "sagejs.wasm-prepared-toolchain/v2" ||
      receipt?.lockDigest !== digest || receipt?.platform !== platform) {
    problems.push("prepared toolchain receipt is missing or differs");
  } else if (problems.length === 0) {
    const sdkSource = lock.wasiSdk.sources[platform];
    if (receipt.wasiSdk?.version !== lock.wasiSdk.version ||
        receipt.wasiSdk?.source !== sdkSource ||
        receipt.wasiSdk?.sourceSha256 !== sources[sdkSource].sha256) {
      problems.push("prepared toolchain receipt differs for the WASI SDK source");
    }
    const expectedTools = {
      clangSha256: paths.clang,
      clangxxSha256: paths.clangxx,
      llvmArSha256: paths.llvmAr,
      llvmRanlibSha256: paths.llvmRanlib,
      llvmStripSha256: paths.llvmStrip,
      wasmLdSha256: paths.wasmLd,
    };
    for (const [field, filename] of Object.entries(expectedTools)) {
      if (receipt.wasiSdk?.[field] !== sha256File(filename)) {
        problems.push(`prepared toolchain receipt differs for ${field}`);
      }
    }
    const expectedLibraries = Object.entries(lock.libraries)
      .filter(([, dependency]) => dependency.required !== false)
      .map(([name]) => name)
      .sort();
    if (JSON.stringify(Object.keys(receipt.libraries ?? {}).sort()) !==
        JSON.stringify(expectedLibraries)) {
      problems.push("prepared toolchain receipt has an unexpected library set");
    } else {
      for (const name of expectedLibraries) {
        const dependency = lock.libraries[name];
        const library = receipt.libraries[name];
        const prefix = paths.libraries[name].prefix;
        if (library.version !== dependency.version ||
            library.source !== dependency.source ||
            library.sourceSha256 !== sources[dependency.source].sha256 ||
            library.archiveSha256 !== sha256File(
              join(prefix, "lib", dependency.archiveName),
            ) ||
            library.headersSha256 !== treeDigest(join(prefix, "include"))) {
          problems.push(`prepared toolchain receipt differs for ${name}`);
        }
      }
    }
    if (!Array.isArray(receipt.commands) || receipt.commands.length === 0) {
      problems.push("prepared toolchain receipt lacks normalized build commands");
    }
  }
  return {
    schema: "sagejs.wasm-toolchain-status/v2",
    ready: problems.length === 0,
    source: override ? "explicit-override" : "content-addressed-cache",
    root: preparedRoot,
    lockDigest: digest,
    platform,
    problems,
    lock,
    paths,
    receipt,
  };
}

function resolveToolchain(options = {}) {
  const status = inspectToolchain(options);
  if (!status.ready) {
    throw new Error(
      `Sage.js WebAssembly toolchain is not ready at ${status.root}:\n` +
      status.problems.map((problem) => `- ${problem}`).join("\n") +
      "\nRun `pnpm --dir packages/wasm-toolchain toolchain:prepare`.",
    );
  }
  return status;
}

function run(command, args, { cwd, capture = false } = {}) {
  process.stdout.write(`+ ${command} ${args.join(" ")}\n`);
  const result = spawnSync(command, args, {
    cwd,
    encoding: capture ? "utf8" : undefined,
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} exited with status ${result.status ?? "unknown"}` +
      (capture ? `\n${result.stdout}${result.stderr}` : ""),
    );
  }
  return capture ? result.stdout.trim() : "";
}

function sourceFilename(root, object) {
  return join(resolve(root), object.sha256, object.filename);
}

function verifySource(filename, object) {
  if (!existsSync(filename) || !statSync(filename).isFile()) {
    throw new Error(`source object is missing: ${object.id}`);
  }
  const actual = sha256File(filename);
  if (actual !== object.sha256) {
    throw new Error(`${object.id} digest ${actual} != ${object.sha256}`);
  }
  return filename;
}

function acquireSource(object, sourceCache) {
  const mirror = process.env.SAGEJS_WASM_SOURCE_MIRROR_DIR;
  if (mirror) return verifySource(sourceFilename(mirror, object), object);
  const destination = sourceFilename(sourceCache, object);
  mkdirSync(dirname(destination), { recursive: true });
  try {
    return verifySource(destination, object);
  } catch {}
  let failure = null;
  for (const url of object.upstreamUrls) {
    const temporary = `${destination}.download-${process.pid}`;
    rmSync(temporary, { force: true });
    try {
      run("curl", [
        "--silent",
        "--show-error",
        "--fail-with-body",
        "--location",
        "--retry", "5",
        "--retry-all-errors",
        "--connect-timeout", "30",
        "--output", temporary,
        url,
      ]);
      verifySource(temporary, object);
      renameSync(temporary, destination);
      return destination;
    } catch (error) {
      rmSync(temporary, { force: true });
      failure = error;
    }
  }
  throw new Error(`unable to acquire ${object.id}: ${failure?.message ?? "no source"}`);
}

function treeDigest(directory) {
  const hash = createHash("sha256");
  function visit(current) {
    for (const entry of readdirSync(current, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const filename = join(current, entry.name);
      const name = relative(directory, filename).replaceAll("\\", "/");
      if (entry.isDirectory()) visit(filename);
      else if (entry.isFile()) {
        hash.update(name); hash.update("\0"); hash.update(readFileSync(filename)); hash.update("\0");
      }
    }
  }
  visit(directory);
  return hash.digest("hex");
}

function validatePrefixes(paths, lock) {
  const checked = new Set();
  for (const [name, dependency] of Object.entries(lock.libraries)) {
    if (dependency.required === false) continue;
    const prefix = paths.libraries[name].prefix;
    if (checked.has(prefix)) continue;
    checked.add(prefix);
    const archive = join(prefix, "lib", dependency.archiveName);
    if (!existsSync(archive)) throw new Error(`${name} archive was not installed`);
    const unexpected = [];
    function visit(directory) {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const filename = join(directory, entry.name);
        if (entry.isDirectory()) visit(filename);
        else if (entry.isFile()) {
          const relativeName = relative(prefix, filename).replaceAll("\\", "/");
          const first = readFileSync(filename).subarray(0, 4);
          const executable = first.equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46])) ||
            first.equals(Buffer.from([0xcf, 0xfa, 0xed, 0xfe])) ||
            first.subarray(0, 2).equals(Buffer.from("MZ"));
          const extraArchive = relativeName.startsWith("lib/") &&
            relativeName.endsWith(".a") && filename !== archive;
          if (/\.(?:so|dylib|dll|la|pc|o)$/.test(entry.name) || executable || extraArchive) {
            unexpected.push(filename);
          }
        } else unexpected.push(filename);
      }
    }
    visit(prefix);
    if (unexpected.length) {
      throw new Error(`${name} installed undeclared metadata/shared objects:\n${unexpected.join("\n")}`);
    }
  }
}

function receiptFor(context, commands) {
  const libraries = {};
  for (const [name, dependency] of Object.entries(context.lock.libraries)) {
    if (dependency.required === false) continue;
    const prefix = context.paths.libraries[name].prefix;
    libraries[name] = {
      version: dependency.version,
      source: dependency.source,
      sourceSha256: context.sources[dependency.source].sha256,
      archiveSha256: sha256File(join(prefix, "lib", dependency.archiveName)),
      headersSha256: treeDigest(join(prefix, "include")),
    };
  }
  const firstLine = run(context.paths.clang, ["--version"], { capture: true }).split(/\r?\n/)[0];
  const normalizedCommands = commands.map(({
    command,
    arguments: args,
    cwd,
    environment,
  }) => {
    const normalize = (input) => {
      let value = String(input);
      for (const [id, filename] of Object.entries(context.archivesById)) {
        value = value.replaceAll(filename, `$SOURCE_ARCHIVE/${id}`);
      }
      return value
        .replaceAll(context.paths.root, "$TOOLCHAIN_ROOT")
        .replaceAll(context.sourceCache, "$SOURCE_CACHE")
        .replaceAll(repositoryRoot, "$REPOSITORY_ROOT");
    };
    return {
      command: normalize(command),
      arguments: args.map(normalize),
      cwd: normalize(cwd),
      environment: Object.fromEntries(
        Object.entries(environment).sort(([left], [right]) =>
          left.localeCompare(right)
        ).map(([name, value]) => [name, normalize(value)]),
      ),
    };
  });
  return {
    schema: "sagejs.wasm-prepared-toolchain/v2",
    lockDigest: context.digest,
    platform: context.platform,
    canonicalBuilder: context.lock.canonicalBuilder,
    wasiSdk: {
      version: context.lock.wasiSdk.version,
      source: context.lock.wasiSdk.sources[context.platform],
      sourceSha256: context.sources[context.lock.wasiSdk.sources[context.platform]].sha256,
      clangVersion: firstLine,
      clangSha256: sha256File(context.paths.clang),
      clangxxSha256: sha256File(context.paths.clangxx),
      llvmArSha256: sha256File(context.paths.llvmAr),
      llvmRanlibSha256: sha256File(context.paths.llvmRanlib),
      llvmStripSha256: sha256File(context.paths.llvmStrip),
      wasmLdSha256: sha256File(context.paths.wasmLd),
    },
    libraries,
    commands: normalizedCommands,
  };
}

function prepareToolchain({ root = repositoryRoot } = {}) {
  if (explicitRoot()) {
    throw new Error("unset SAGEJS_WASM_TOOLCHAIN_ROOT before preparing the content-addressed toolchain");
  }
  if (process.platform === "win32") {
    throw new Error("Windows consumes the authenticated Wasm artifact and does not prepare Autoconf libraries");
  }
  const before = inspectToolchain({ root });
  if (before.ready) return before;
  const destination = cacheRoot(before.lock, root);
  const parent = dirname(destination);
  mkdirSync(parent, { recursive: true });
  const lockDirectory = `${parent}.prepare-lock`;
  try {
    mkdirSync(lockDirectory);
  } catch (error) {
    if (error?.code === "EEXIST") {
      throw new Error(`another process is preparing ${destination}`);
    }
    throw error;
  }
  const temporary = join(parent, `.prepare-${process.pid}`);
  const sourceCache = join(defaultCacheRoot(root), "sources-v2");
  try {
    rmSync(temporary, { recursive: true, force: true });
    mkdirSync(temporary, { recursive: true });
    const catalog = loadCatalog(before.lock);
    const sources = selectedSources(before.lock, catalog, before.platform);
    const archivesById = {};
    for (const [id, object] of Object.entries(sources)) {
      archivesById[id] = acquireSource(object, sourceCache);
    }
    const sdkObject = sources[before.lock.wasiSdk.sources[before.platform]];
    mkdirSync(join(temporary, "sdk"), { recursive: true });
    run("tar", ["-xf", archivesById[sdkObject.id], "-C", join(temporary, "sdk"), "--strip-components=1"]);
    const paths = pathsForRoot(temporary, before.lock);
    const work = join(temporary, ".build");
    mkdirSync(work, { recursive: true });
    const context = {
      digest: before.lockDigest,
      lock: before.lock,
      paths,
      platform: before.platform,
      sources,
      sourceCache,
      archivesById,
      work,
    };
    const archives = {};
    for (const [name, dependency] of Object.entries(before.lock.libraries)) {
      archives[name] = archivesById[dependency.source];
    }
    const commands = [];
    setCommandObserver((command) => commands.push(command));
    try {
      buildLibraries(context, archives);
      buildSmalljac(context, archives);
    } finally {
      setCommandObserver(null);
    }
    rmSync(work, { recursive: true, force: true });
    validatePrefixes(paths, before.lock);
    writeFileSync(join(temporary, markerName), `${JSON.stringify(receiptFor(context, commands), null, 2)}\n`);
    rmSync(destination, { recursive: true, force: true });
    renameSync(temporary, destination);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
    rmSync(lockDirectory, { recursive: true, force: true });
  }
  return resolveToolchain({ root });
}

function toolchainReceiptIdentity(status = resolveToolchain()) {
  return {
    lockDigest: status.lockDigest,
    platform: status.platform,
    preparedReceiptSha256: sha256File(join(status.root, markerName)),
    wasiSdk: status.receipt.wasiSdk,
    libraries: status.receipt.libraries,
  };
}

function wasmKernelToolchain(options = {}) {
  const status = resolveToolchain(options);
  return {
    clang: status.paths.clang,
    target: status.lock.build.target,
    sysroot: status.paths.sysroot,
    gmpPrefix: status.paths.libraries.gmp.prefix,
    flintPrefix: status.paths.libraries.flint.prefix,
    mpfrPrefix: status.paths.libraries.mpfr.prefix,
    mpcPrefix: status.paths.libraries.mpc.prefix,
  };
}

function printableStatus(status) {
  return {
    schema: status.schema,
    ready: status.ready,
    source: status.source,
    root: status.root,
    lockDigest: status.lockDigest,
    platform: status.platform,
    problems: status.problems,
  };
}

function main() {
  const command = process.argv[2] || "status";
  const json = process.argv.includes("--json");
  let status;
  if (command === "prepare") status = prepareToolchain();
  else if (command === "status") status = inspectToolchain();
  else if (command === "path") {
    process.stdout.write(`${resolveToolchain().root}\n`);
    return;
  } else if (command === "cache-path") {
    process.stdout.write(`${cacheRoot()}\n`);
    return;
  } else {
    throw new Error("usage: toolchain.cjs [status [--json]|prepare [--json]|path|cache-path]");
  }
  process.stdout.write(json
    ? `${JSON.stringify(printableStatus(status), null, 2)}\n`
    : `Sage.js WebAssembly toolchain: ${status.ready ? "ready" : "not prepared"}\n  root: ${status.root}\n  identity: ${status.lockDigest}\n${status.problems.map((problem) => `  - ${problem}\n`).join("")}`);
  if (!status.ready) process.exitCode = 1;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  cacheRoot,
  canonicalJson,
  defaultCacheRoot,
  explicitRoot,
  inspectToolchain,
  loadCatalog,
  loadLock,
  pathsForRoot,
  platformKey,
  prepareToolchain,
  resolveToolchain,
  selectedSources,
  sourceFilename,
  toolchainDigest,
  toolchainReceiptIdentity,
  verifySource,
  wasmKernelToolchain,
};
