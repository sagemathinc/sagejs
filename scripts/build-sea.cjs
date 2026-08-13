"use strict";

const { buildSync } = require("esbuild");
const {
  closeSync,
  chmodSync,
  copyFileSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} = require("fs");
const { createHash } = require("crypto");
const { execFileSync } = require("child_process");
const { dirname, join, relative } = require("path");
const {
  canonicalJson,
  createBuildManifest,
  gitSourceIdentity,
  hashRegularFile,
  serialize,
} = require("./release-manifest.cjs");
const {
  standaloneModuleInventory,
} = require("../tools/standalone-library.cjs");
const {
  validateNativeMathBuildProfile,
} = require("./native-math-profile.cjs");
const {
  REPORT_SCHEMA: NATIVE_BINARY_REPORT_SCHEMA,
  assertNativeInputs,
} = require("./release-native-binary-inspector.cjs");
const {
  createSeaNativeDependencyBindings,
  readNativeDependencyReceipt,
  seaNativeDependencyDefinitions,
} = require("./native-dependency-receipt.cjs");

const root = join(__dirname, "..");
const outputDirectory = join(root, "build", "sea");
const bundle = join(outputDirectory, "entry.cjs");
const multiprocessingWorkerBundle = join(
  outputDirectory,
  "multiprocessing-worker.cjs",
);
const kernelWorkerBundle = join(outputDirectory, "kernel-worker.cjs");
const flintAddon = join(
  root,
  "packages",
  "flint",
  "build",
  "Release",
  "sagejs_flint.node",
);
const flintFfiAddon = join(
  root,
  "packages",
  "flint",
  "build",
  "generated-ffi",
  "sagejs_flint_ffi.node",
);
const flintFfiManifest = join(dirname(flintFfiAddon), "manifest.json");
const graphAddon = join(
  root,
  "packages",
  "graph",
  "build",
  "Release",
  "sagejs_graph.node",
);
const graphFfiAddon = join(
  root,
  "packages",
  "graph",
  "build",
  "generated-ffi",
  "sagejs_igraph_ffi.node",
);
const graphFfiManifest = join(dirname(graphFfiAddon), "manifest.json");
const fflasFfiAddon = join(
  root,
  "packages",
  "fflas",
  "build",
  "generated-ffi",
  "sagejs_fflas_ffi.node",
);
const fflasFfiManifest = join(dirname(fflasFfiAddon), "manifest.json");
const m4riFfiAddon = join(
  root,
  "packages",
  "m4ri",
  "build",
  "generated-ffi",
  "sagejs_m4ri_ffi.node",
);
const m4riFfiManifest = join(dirname(m4riFfiAddon), "manifest.json");
const SEA_ASSEMBLY_POLICY = Object.freeze({
  builderArguments: [
    "--predictable",
    "--build-sea",
    "sea-config.json",
  ],
  disableExperimentalSEAWarning: true,
  mainBundleFormat: "commonjs",
  mainBundleTarget: "node22",
  schema: "sagejs.sea-assembly-policy/v1",
  useCodeCache: true,
  useSnapshot: false,
});
const NATIVE_BINARY_RECEIPT_SCHEMA = "sagejs.native-binary-receipt/v1";
const NODE_TEMPLATE_LABEL = "sea/node-template";
const NODE_TEMPLATE_ROLE = "executable-template";
const EMBEDDED_ADDON_ROLE = "embedded-node-addon";

const args = new Set(process.argv.slice(2));
const standaloneModuleDefinition = JSON.stringify(
  standaloneModuleInventory(),
);
const buildPython = args.size === 0 || args.has("--all") || args.has("--python");
const buildMath = args.has("--all") || args.has("--with-flint");
const executableSuffix = process.platform === "win32" ? ".exe" : "";
const [nodeMajor, nodeMinor] = process.versions.node
  .split(".")
  .map((part) => Number(part));
if (nodeMajor < 25 || (nodeMajor === 25 && nodeMinor < 5)) {
  throw new Error(
    "building a Sage.js single executable requires Node.js 25.5 or newer; " +
      "the resulting artifact does not require Node.js on the target system",
  );
}
if (!buildPython && !buildMath) {
  throw new Error(
    "usage: node scripts/build-sea.cjs [--python] [--with-flint] [--all]",
  );
}

function sha256(filename) {
  return createHash("sha256").update(readFileSync(filename)).digest("hex");
}

function assetReceipt(filename) {
  return hashRegularFile(dirname(filename), filename, "SEA input");
}

function sameReceipt(left, right) {
  return left.sha256 === right.sha256 && left.size === right.size;
}

function stageRegularFile(source, destination, label) {
  const before = hashRegularFile(dirname(source), source, label);
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(source, destination);
  chmodSync(destination, statSync(source).mode & 0o777);
  const staged = hashRegularFile(dirname(destination), destination, `staged ${label}`);
  const after = hashRegularFile(dirname(source), source, label);
  if (!sameReceipt(before, staged) || !sameReceipt(before, after)) {
    throw new Error(`${label} changed while staging`);
  }
  return destination;
}

function stageSeaInputs(name, seaNode, mainBundle, assets, options = {}) {
  const stagingRoot = options.outputDirectory || outputDirectory;
  mkdirSync(stagingRoot, { recursive: true });
  const directory = mkdtempSync(join(stagingRoot, `.inputs-${name}-`));
  const stagedAssets = {};
  for (const [asset, filename] of Object.entries(assets).sort(
    ([left], [right]) => left.localeCompare(right),
  )) {
    if (
      asset.startsWith("/") ||
      asset.split("/").some((part) => part === "" || part === "." || part === "..")
    ) {
      throw new Error(`invalid SEA asset name ${asset}`);
    }
    stagedAssets[asset] = stageRegularFile(
      filename,
      join(directory, "assets", ...asset.split("/")),
      `SEA asset ${asset}`,
    );
  }
  return {
    assets: stagedAssets,
    directory,
    mainBundle: stageRegularFile(
      mainBundle,
      join(directory, "main.cjs"),
      "SEA main bundle",
    ),
    seaNode: stageRegularFile(
      seaNode,
      join(directory, `node-template${executableSuffix}`),
      "SEA Node template",
    ),
  };
}

function withSeaBuildLock(lockFilename, callback) {
  mkdirSync(dirname(lockFilename), { recursive: true });
  let descriptor;
  try {
    descriptor = openSync(lockFilename, "wx", 0o600);
  } catch (error) {
    if (error?.code === "EEXIST") {
      throw new Error(
        `another SEA build owns ${lockFilename}; wait for it to finish or ` +
        "remove the lock only after verifying that build is no longer running",
        { cause: error },
      );
    }
    throw error;
  }
  try {
    writeFileSync(descriptor, `${process.pid}\n`);
    return callback();
  } finally {
    closeSync(descriptor);
    unlinkSync(lockFilename);
  }
}
function observeSeaBuilder(executable, options = {}) {
  if (options.builderObservation !== undefined) {
    return structuredClone(options.builderObservation);
  }
  const expression = "JSON.stringify({" +
    "arch:process.arch," +
    "endianness:require('node:os').endianness()," +
    "platform:process.platform," +
    "versions:{modules:process.versions.modules,napi:process.versions.napi,node:process.versions.node}" +
    "})";
  return JSON.parse(execFileSync(executable, ["-p", expression], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }));
}

function nativeBinaryInputs(seaNode, assets) {
  return [
    {
      label: NODE_TEMPLATE_LABEL,
      path: seaNode,
      role: NODE_TEMPLATE_ROLE,
    },
    ...Object.entries(assets)
      .filter(([asset]) => asset.endsWith(".node"))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([asset, path]) => ({
        label: asset,
        path,
        role: EMBEDDED_ADDON_ROLE,
      })),
  ];
}

function nativeBinaryPolicy(builder, labels) {
  const formats = { darwin: "macho", linux: "elf", win32: "pe" };
  const format = formats[builder.platform];
  if (!format) throw new Error(`unsupported native binary platform ${builder.platform}`);
  return {
    architectures: [builder.arch],
    exactArchitectures: true,
    format,
    requiredLabels: [...labels].sort((left, right) => left.localeCompare(right)),
  };
}

function nativeBinaryReceipt(seaNode, assets, builder, options = {}) {
  const inputs = nativeBinaryInputs(seaNode, assets);
  const report = options.nativeBinaryReport === undefined
    ? assertNativeInputs(
        inputs,
        nativeBinaryPolicy(builder, inputs.map(({ label }) => label)),
      )
    : structuredClone(options.nativeBinaryReport);
  if (report?.schema !== NATIVE_BINARY_REPORT_SCHEMA) {
    throw new Error("native binary inspection has an unsupported schema");
  }
  return {
    report,
    reportSha256: createHash("sha256")
      .update(canonicalJson(report))
      .digest("hex"),
    schema: NATIVE_BINARY_RECEIPT_SCHEMA,
  };
}

function targetFromSeaBuilder(executable, options = {}) {
  const builder = observeSeaBuilder(executable, options);
  const supported = new Set([
    "darwin-arm64",
    "linux-arm64",
    "linux-x64",
    "win32-x64",
  ]);
  if (!supported.has(`${builder.platform}-${builder.arch}`)) {
    throw new Error(
      `unsupported SEA builder target ${builder.platform}-${builder.arch}`,
    );
  }
  const report = options.nativeBinaryReport;
  if (report?.schema !== NATIVE_BINARY_REPORT_SCHEMA || report.ok !== true) {
    throw new Error("target identity requires a successful native binary inspection");
  }
  const glibc = report.aggregate?.maximumGlibc ?? null;
  if (builder.platform === "linux" && glibc === null) {
    throw new Error("Linux native binary inspection did not report a GLIBC requirement");
  }
  return {
    arch: builder.arch,
    endianness: builder.endianness,
    libc: builder.platform === "linux"
      ? {
          family: "glibc",
          version: glibc,
        }
      : null,
    nodeAbi: builder.versions.modules,
    nodeNapi: builder.versions.napi,
    platform: builder.platform,
    wordBits: ["arm64", "x64"].includes(builder.arch) ? 64 : null,
  };
}

function nativeMathProfile(rootDirectory, target, options = {}) {
  let profile;
  let stamp = null;
  if (options.nativeMathProfile !== undefined) {
    profile = structuredClone(options.nativeMathProfile);
  } else {
    const defaultPrefix = target.platform === "win32"
      ? join(
          rootDirectory,
          "packages",
          "flint",
          ".native",
          "vcpkg-installed",
          "x64-windows-static-md-release",
        )
      : join(rootDirectory, "packages", "flint", ".native", "prefix");
    const prefix = process.env.SAGEJS_FLINT_PREFIX || defaultPrefix;
    stamp = join(prefix, ".sagejs-flint-dependencies.json");
    if (!existsSync(stamp)) {
      throw new Error(
        `native mathematics build stamp not found at ${relative(rootDirectory, stamp)}`,
      );
    }
    const contents = JSON.parse(readFileSync(stamp, "utf8"));
    profile = contents?.build?.mathBuildProfile ??
      contents?.identity?.mathBuildProfile;
  }
  try {
    return validateNativeMathBuildProfile(profile, target);
  } catch (error) {
    throw new Error(
      `${error.message}${stamp ? `: ${stamp}` : ""}`,
      { cause: error },
    );
  }
}

function nativeDependencyReceiptInputs(rootDirectory, platform) {
  const prefixes = {
    igraph: process.env.SAGEJS_GRAPH_PREFIX || join(
      rootDirectory,
      "packages",
      "graph",
      ".native",
      "prefix",
    ),
    m4ri: process.env.SAGEJS_M4RI_PREFIX || join(
      rootDirectory,
      "packages",
      "m4ri",
      ".native",
      "prefix",
    ),
  };
  const stampNames = {
    igraph: ".sagejs-igraph-1.0.1",
    m4ri: ".sagejs-m4ri-dependencies.json",
  };
  const assets = {};
  const sources = {};
  for (const definition of seaNativeDependencyDefinitions(platform)) {
    const prefix = prefixes[definition.id];
    const stamp = join(prefix, stampNames[definition.id]);
    const receipt = readNativeDependencyReceipt(stamp, { prefix });
    if (receipt === null) {
      throw new Error(
        `${definition.id} native dependency receipt is missing, stale, or ` +
          `does not describe its installed prefix: ${relative(rootDirectory, stamp)}`,
      );
    }
    assets[definition.receiptAsset] = stamp;
    sources[definition.id] = {
      identitySha256: receipt.identitySha256,
      prefix,
      stamp,
    };
  }
  return { assets, sources };
}

function nativeDependencyReceiptAssets(rootDirectory, platform) {
  return nativeDependencyReceiptInputs(rootDirectory, platform).assets;
}

function validateNativeDependencyReceiptSources(sources) {
  if (sources === undefined) return undefined;
  const identities = {};
  for (const [id, source] of Object.entries(sources)) {
    const receipt = readNativeDependencyReceipt(source.stamp, {
      prefix: source.prefix,
    });
    if (
      receipt === null ||
      receipt.identitySha256 !== source.identitySha256
    ) {
      throw new Error(
        `${id} native dependency prefix changed during SEA assembly`,
      );
    }
    identities[id] = receipt.identitySha256;
  }
  return identities;
}

function stableJson(value) {
  if (Array.isArray(value)) return value.map(stableJson);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, stableJson(value[key])]),
    );
  }
  return value;
}

function productionKernelReceipt(rootDirectory, assets) {
  const authorityPath = "architecture/native-kernels.json";
  const authorityFilename = join(rootDirectory, authorityPath);
  const authority = JSON.parse(readFileSync(authorityFilename, "utf8"));
  const logicalSources = [...new Set(
    authority.kernels
      .filter((kernel) => kernel.id?.endsWith("-production"))
      .map((kernel) => kernel.source)
      .map((source) => {
        if (!source.startsWith("src/lib/")) {
          throw new Error(`production kernel source is outside src/lib: ${source}`);
        }
        return source.slice("src/lib/".length);
      }),
  )].sort();
  const indexPath = "native-kernels/index.json";
  const indexFilename = assets[indexPath];
  if (!indexFilename) throw new Error("mathematics SEA omitted native-kernels/index.json");
  const index = JSON.parse(readFileSync(indexFilename, "utf8"));
  const actualSources = Object.keys(index.logicalSources || {}).sort();
  if (JSON.stringify(actualSources) !== JSON.stringify(logicalSources)) {
    throw new Error(
      "production native-kernel index does not exactly match its authority",
    );
  }
  const expectedAssets = new Set([indexPath]);
  for (const source of logicalSources) {
    const record = index.logicalSources[source];
    if (!/^[0-9a-f]{64}$/.test(record?.cacheKey || "")) {
      throw new Error(`production native-kernel ${source} has an invalid cache key`);
    }
    if (!/^[0-9a-f]{64}$/.test(record?.sourceHash || "")) {
      throw new Error(`production native-kernel ${source} has an invalid source hash`);
    }
    const sourceFilename = join(rootDirectory, "src", "lib", ...source.split("/"));
    if (hashRegularFile(
      rootDirectory,
      sourceFilename,
      `production kernel source ${source}`,
    ).sha256 !==
        record.sourceHash) {
      throw new Error(`production native-kernel ${source} is stale`);
    }
    for (const suffix of [
      "index.cjs",
      "build/Release/sagejs_native_kernel.node",
    ]) {
      const asset = `native-kernels/${record.cacheKey}/${suffix}`;
      expectedAssets.add(asset);
      if (!assets[asset]) throw new Error(`mathematics SEA omitted ${asset}`);
    }
  }
  const actualAssets = Object.keys(assets)
    .filter((asset) => asset.startsWith("native-kernels/"));
  if (actualAssets.some((asset) => !expectedAssets.has(asset))) {
    throw new Error("mathematics SEA contains unaccounted production kernel assets");
  }
  return {
    authorityPath,
    authoritySha256: sha256(authorityFilename),
    expected: logicalSources.length,
    indexIdentitySha256: createHash("sha256")
      .update(canonicalJson(index))
      .digest("hex"),
    indexPath,
    indexSha256: sha256(indexFilename),
    logicalSources,
    schema: "sagejs.native-kernel-receipt/v1",
  };
}

function createSeaBuildManifest(options) {
  const builder = observeSeaBuilder(options.seaNode, options);
  const nativeBinaries = nativeBinaryReceipt(
    options.seaNode,
    options.assets,
    builder,
    options,
  );
  const target = targetFromSeaBuilder(options.seaNode, {
    ...options,
    nativeBinaryReport: nativeBinaries.report,
  });
  const embeddedAssets = Object.fromEntries(
    Object.keys(options.assets)
      .filter((asset) => asset !== "release/build-manifest.json")
      .sort()
      .map((asset) => [asset, assetReceipt(options.assets[asset])]),
  );
  const nativeKernels = options.withFlint
    ? productionKernelReceipt(options.root, options.assets)
    : null;
  const mathProfile = options.withFlint
    ? nativeMathProfile(options.root, target, options)
    : null;
  const nativeDependencies = options.withFlint
    ? createSeaNativeDependencyBindings({
        assets: options.assets,
        expectedReceiptIdentities: validateNativeDependencyReceiptSources(
          options.nativeDependencySources,
        ),
        mathProfile,
        maximumMinimumMacos:
          nativeBinaries.report.aggregate.maximumMinimumMacos,
        target,
      })
    : null;
  return createBuildManifest({
    capabilities: {
      artifact: {
        kind: "single-executable",
        nativeMathematics: options.withFlint,
      },
      embeddedAssets: {
        assets: embeddedAssets,
        schema: "sagejs.embedded-assets/v1",
      },
      nativeDependencies,
      nativeKernels,
    },
    sagejsVersion: JSON.parse(
      readFileSync(join(options.root, "package.json"), "utf8"),
    ).version,
    source: options.sourceIdentity || gitSourceIdentity(options.root, {
      allowDirty: true,
    }),
    target,
    toolchain: {
      esbuild: require("esbuild/package.json").version,
      nativeMathProfile: mathProfile,
      nativeBinaries,
      seaNode: {
        executableSha256: sha256(options.seaNode),
        version: observeSeaBuilder(options.seaNode, options).versions.node,
      },
      seaMain: assetReceipt(options.mainBundle),
      seaAssembly: stableJson(
        options.seaAssemblyPolicy || SEA_ASSEMBLY_POLICY,
      ),
    },
  });
}

function runtimeLibc() {
  if (process.platform === "darwin") return "libc";
  if (process.platform === "win32") return "msvc";
  return process.report.getReport().header.glibcVersionRuntime
    ? "glibc"
    : "musl";
}

function zeroMQAddonFilename() {
  const packageDirectory = dirname(require.resolve("zeromq/package.json"));
  const buildDirectory = join(packageDirectory, "build");
  const manifest = JSON.parse(
    readFileSync(join(buildDirectory, "manifest.json"), "utf8"),
  );
  const candidates = Object.entries(manifest)
    .map(([serialized, filename]) => ({
      configuration: JSON.parse(serialized),
      filename: join(buildDirectory, filename),
    }))
    .filter(
      ({ configuration, filename }) =>
        configuration.os === process.platform &&
        configuration.arch === process.arch &&
        configuration.libc === runtimeLibc() &&
        existsSync(filename),
    )
    .sort(
      (left, right) =>
        (right.configuration.abi ?? 0) - (left.configuration.abi ?? 0),
    );
  if (candidates.length === 0) {
    throw new Error(
      `zeromq has no ${process.platform}/${process.arch}/${runtimeLibc()} addon`,
    );
  }
  return candidates[0].filename;
}

function seaBuilderExecutable() {
  if (process.env.SAGEJS_SEA_NODE) return process.env.SAGEJS_SEA_NODE;
  if (
    process.platform !== "darwin" ||
    !process.execPath.includes("/Cellar/node/")
  ) {
    return process.execPath;
  }

  // Homebrew currently compiles Node with SEA disabled. Keep Homebrew Node as
  // the development runtime, but cache the matching official binary solely as
  // the executable template/builder. This also keeps `pnpm bootstrap` a
  // one-command experience on a stock Homebrew Apple Silicon setup.
  const platform = `darwin-${process.arch}`;
  const release = `node-v${process.versions.node}-${platform}`;
  const cache = join(root, "packages", "flint", ".native", "sea-node");
  const directory = join(cache, release);
  const executable = join(directory, "bin", "node");
  if (existsSync(executable)) return executable;

  mkdirSync(cache, { recursive: true });
  const archiveName = `${release}.tar.xz`;
  const archive = join(cache, archiveName);
  const checksums = join(cache, `SHASUMS256-${process.versions.node}.txt`);
  const base = `https://nodejs.org/dist/v${process.versions.node}`;
  execFileSync("curl", [
    "--fail",
    "--location",
    "--retry",
    "3",
    "--output",
    archive,
    `${base}/${archiveName}`,
  ], { stdio: "inherit" });
  execFileSync("curl", [
    "--fail",
    "--location",
    "--retry",
    "3",
    "--output",
    checksums,
    `${base}/SHASUMS256.txt`,
  ], { stdio: "inherit" });
  const expectedLine = readFileSync(checksums, "utf8")
    .split(/\r?\n/)
    .find((line) => line.endsWith(`  ${archiveName}`));
  if (!expectedLine || sha256(archive) !== expectedLine.slice(0, 64)) {
    rmSync(archive, { force: true });
    throw new Error(`SHA-256 verification failed for ${archiveName}`);
  }
  execFileSync("tar", ["-xf", archive, "-C", cache], {
    stdio: "inherit",
  });
  if (!existsSync(executable)) {
    throw new Error(`official Node SEA builder not found at ${executable}`);
  }
  return executable;
}

function collectStandardLibraryAssets() {
  const directory = join(root, "src", "lib");
  const assets = {};
  const visit = (current, prefix = "") => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const relativeName = prefix ? `${prefix}/${entry.name}` : entry.name;
      const filename = join(current, entry.name);
      if (entry.isDirectory()) {
        visit(filename, relativeName);
      } else if (
        entry.isFile() &&
        (entry.name.endsWith(".py") || relativeName === "sage/graphs/data/graphs.db")
      ) {
        assets[`lib/${relativeName}`] = filename;
      }
    }
  };
  visit(directory);
  if (!("lib/urllib/parse.py" in assets)) {
    throw new Error("recursive standard-library packaging omitted urllib.parse");
  }
  return assets;
}

function collectStandardLibraryCacheAssets() {
  const directory = join(root, "dist", "module-cache");
  const assets = {};
  for (const filename of readdirSync(directory)) {
    if (!filename.endsWith(".json")) continue;
    assets[`module-cache/${filename}`] = join(directory, filename);
  }
  return assets;
}

function collectJsonCacheAssets(directoryName) {
  const directory = join(root, "dist", directoryName);
  const assets = {};
  if (!existsSync(directory)) return assets;
  for (const filename of readdirSync(directory)) {
    if (!filename.endsWith(".json")) continue;
    assets[`${directoryName}/${filename}`] = join(directory, filename);
  }
  return assets;
}

function collectNativeKernelAssets() {
  const directory = join(root, "dist", "native-kernels");
  if (!existsSync(directory)) return {};
  const assets = {};
  const visit = (current, prefix = "") => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const relativeName = prefix ? `${prefix}/${entry.name}` : entry.name;
      const filename = join(current, entry.name);
      if (entry.isDirectory()) {
        visit(filename, relativeName);
      } else if (
        entry.isFile() &&
        (relativeName === "index.json" ||
          relativeName.endsWith("/index.cjs") ||
          relativeName.endsWith("/sagejs_native_kernel.node"))
      ) {
        assets[`native-kernels/${relativeName}`] = filename;
      }
    }
  };
  visit(directory);
  return assets;
}

function buildExecutable(name, withFlint, sourceIdentity) {
  if (withFlint && !existsSync(flintAddon)) {
    throw new Error(
      `FLINT addon not found at ${relative(root, flintAddon)}; run ` +
        "`pnpm --dir packages/flint build` first",
    );
  }
  if (withFlint && !existsSync(flintFfiAddon)) {
    throw new Error(
      `generated FLINT FFI addon not found at ${relative(root, flintFfiAddon)}; ` +
        "run `pnpm --dir packages/flint build` first",
    );
  }
  if (withFlint && !existsSync(flintFfiManifest)) {
    throw new Error(
      `generated FLINT FFI manifest not found at ` +
        `${relative(root, flintFfiManifest)}; ` +
        "run `pnpm --dir packages/flint build` first",
    );
  }
  if (withFlint && !existsSync(graphAddon)) {
    throw new Error(
      `igraph addon not found at ${relative(root, graphAddon)}; run ` +
        "`pnpm --dir packages/graph build` first",
    );
  }
  if (withFlint && !existsSync(graphFfiAddon)) {
    throw new Error(
      `generated igraph FFI addon not found at ${relative(root, graphFfiAddon)}; ` +
        "run `pnpm --dir packages/graph build` first",
    );
  }
  if (withFlint && !existsSync(graphFfiManifest)) {
    throw new Error(
      `generated igraph FFI manifest not found at ` +
        `${relative(root, graphFfiManifest)}; ` +
        "run `pnpm --dir packages/graph build` first",
    );
  }
  if (withFlint && !existsSync(fflasFfiAddon)) {
    throw new Error(
      `generated FFLAS FFI addon not found at ${relative(root, fflasFfiAddon)}; ` +
        "run `pnpm --dir packages/fflas build` first",
    );
  }
  if (withFlint && !existsSync(fflasFfiManifest)) {
    throw new Error(
      `generated FFLAS FFI manifest not found at ` +
        `${relative(root, fflasFfiManifest)}; ` +
        "run `pnpm --dir packages/fflas build` first",
    );
  }
  const seaNode = seaBuilderExecutable();
  const builder = observeSeaBuilder(seaNode);
  if (
    withFlint &&
    builder.platform !== "win32" &&
    !existsSync(m4riFfiAddon)
  ) {
    throw new Error(
      `generated M4RI FFI addon not found at ${relative(root, m4riFfiAddon)}; ` +
        "run `pnpm --dir packages/m4ri build` first",
    );
  }
  if (
    withFlint &&
    builder.platform !== "win32" &&
    !existsSync(m4riFfiManifest)
  ) {
    throw new Error(
      `generated M4RI FFI manifest not found at ` +
        `${relative(root, m4riFfiManifest)}; ` +
        "run `pnpm --dir packages/m4ri build` first",
    );
  }
  const output = join(outputDirectory, name);
  const assets = {
    "compiler/compiler.js": join(root, "dist", "compiler", "compiler.js"),
    "compiler/baselib-plain-pretty.js": join(
      root,
      "dist",
      "compiler",
      "baselib-plain-pretty.js",
    ),
    "compiler/task-runtime.js": join(
      root,
      "dist",
      "compiler",
      "task-runtime.js",
    ),
    "runtime-cache/compiler.bin": join(
      root,
      "dist",
      "runtime-cache",
      "compiler.bin",
    ),
    "runtime-cache/runtime-bootstrap-sage.js": join(
      root,
      "dist",
      "runtime-cache",
      "runtime-bootstrap-sage.js",
    ),
    "runtime-cache/runtime-bootstrap-sage.bin": join(
      root,
      "dist",
      "runtime-cache",
      "runtime-bootstrap-sage.bin",
    ),
    "runtime-cache/runtime-bootstrap-python.js": join(
      root,
      "dist",
      "runtime-cache",
      "runtime-bootstrap-python.js",
    ),
    "runtime-cache/runtime-bootstrap-python.bin": join(
      root,
      "dist",
      "runtime-cache",
      "runtime-bootstrap-python.bin",
    ),
    "worker/multiprocessing-worker.cjs": multiprocessingWorkerBundle,
    "worker/kernel-worker.cjs": kernelWorkerBundle,
    "native/zeromq.node": zeroMQAddonFilename(),
    ...collectStandardLibraryAssets(),
    ...collectStandardLibraryCacheAssets(),
    ...collectJsonCacheAssets("lazy-module-cache"),
    ...collectJsonCacheAssets("dynamic-cache"),
    "vendor/plotly.min.js": require.resolve(
      "plotly.js-dist-min/plotly.min.js",
    ),
    "vendor/web-tree-sitter.wasm": join(
      root,
      "dist",
      "vendor",
      "web-tree-sitter.wasm",
    ),
    "vendor/tree-sitter-python.wasm": join(
      root,
      "dist",
      "vendor",
      "tree-sitter-python.wasm",
    ),
    "vendor/tree-sitter-sage.wasm": join(
      root,
      "dist",
      "vendor",
      "tree-sitter-sage.wasm",
    ),
    "vendor/tree-sitter-magma.wasm": join(
      root,
      "dist",
      "vendor",
      "tree-sitter-magma.wasm",
    ),
    "vendor/tree-sitter-macaulay2.wasm": join(
      root,
      "dist",
      "vendor",
      "tree-sitter-macaulay2.wasm",
    ),
    "vendor/tree-sitter-maple.wasm": join(
      root,
      "dist",
      "vendor",
      "tree-sitter-maple.wasm",
    ),
    "vendor/tree-sitter-matlab.wasm": join(
      root,
      "dist",
      "vendor",
      "tree-sitter-matlab.wasm",
    ),
    "vendor/tree-sitter-wolfram.wasm": join(
      root,
      "dist",
      "vendor",
      "tree-sitter-wolfram.wasm",
    ),
  };
  let nativeDependencySources;
  if (withFlint) {
    assets["native/sagejs_flint.node"] = flintAddon;
    assets["native/sagejs_flint_ffi.node"] = flintFfiAddon;
    assets["native/sagejs_flint_ffi_manifest.json"] = flintFfiManifest;
    assets["native/sagejs_graph.node"] = graphAddon;
    assets["native/sagejs_igraph_ffi.node"] = graphFfiAddon;
    assets["native/sagejs_igraph_ffi_manifest.json"] = graphFfiManifest;
    assets["native/sagejs_fflas_ffi.node"] = fflasFfiAddon;
    assets["native/sagejs_fflas_ffi_manifest.json"] = fflasFfiManifest;
    if (builder.platform !== "win32") {
      assets["native/sagejs_m4ri_ffi.node"] = m4riFfiAddon;
      assets["native/sagejs_m4ri_ffi_manifest.json"] = m4riFfiManifest;
    }
    const dependencyInputs = nativeDependencyReceiptInputs(
      root,
      builder.platform,
    );
    Object.assign(assets, dependencyInputs.assets);
    nativeDependencySources = dependencyInputs.sources;
    Object.assign(assets, collectNativeKernelAssets());
  }

  const buildManifestFilename = join(outputDirectory, `${name}-build-manifest.json`);
  const staged = stageSeaInputs(name, seaNode, bundle, assets);
  try {
    const buildManifest = createSeaBuildManifest({
      assets: staged.assets,
      mainBundle: staged.mainBundle,
      nativeDependencySources,
      root,
      seaNode: staged.seaNode,
      sourceIdentity,
      withFlint,
    });
    const stagedManifest = join(staged.directory, "assets", "release", "build-manifest.json");
    mkdirSync(dirname(stagedManifest), { recursive: true });
    writeFileSync(stagedManifest, serialize(buildManifest));
    staged.assets["release/build-manifest.json"] = stagedManifest;

    const configFilename = join(staged.directory, "sea-config.json");
    const relativeAssets = Object.fromEntries(
      Object.keys(staged.assets).sort().map((asset) => [asset, `assets/${asset}`]),
    );
    writeFileSync(
      configFilename,
      `${JSON.stringify(
        {
          main: "main.cjs",
          output: `../${name}`,
          disableExperimentalSEAWarning:
            SEA_ASSEMBLY_POLICY.disableExperimentalSEAWarning,
          // User snapshots currently add more deserialization time than the
          // cached runtime saves, and cannot contain the compiler's vm.Context.
          useSnapshot: SEA_ASSEMBLY_POLICY.useSnapshot,
          useCodeCache: SEA_ASSEMBLY_POLICY.useCodeCache,
          assets: relativeAssets,
        },
        null,
        2,
      )}\n`,
    );
    execFileSync(staged.seaNode, SEA_ASSEMBLY_POLICY.builderArguments, {
      cwd: staged.directory,
      stdio: "inherit",
    });
    const observedAfterBuild = createSeaBuildManifest({
      assets: staged.assets,
      mainBundle: staged.mainBundle,
      nativeDependencySources,
      root,
      seaNode: staged.seaNode,
      sourceIdentity,
      withFlint,
    });
    if (serialize(observedAfterBuild) !== serialize(buildManifest)) {
      rmSync(output, { force: true });
      throw new Error(`staged SEA inputs changed while building ${name}`);
    }
    writeFileSync(buildManifestFilename, serialize(buildManifest));
    if (process.platform === "darwin") {
      execFileSync("codesign", ["--sign", "-", "--force", output], {
        cwd: root,
        stdio: "inherit",
      });
    }
    console.log(
      `Built ${relative(root, output)} (${withFlint ? "with native mathematics" : "Python runtime"})`,
    );
  } finally {
    rmSync(staged.directory, { recursive: true, force: true });
  }
}

function buildAll() {
  rmSync(outputDirectory, { recursive: true, force: true });
  mkdirSync(outputDirectory, { recursive: true });
  const sourceIdentity = gitSourceIdentity(root, { allowDirty: true });

  for (const [entryPoint, outfile] of [
    [join(root, "dist", "tools", "sea-entry.js"), bundle],
    [join(root, "dist", "tools", "kernel-worker.js"), kernelWorkerBundle],
    [
      join(root, "dist", "tools", "multiprocessing-worker.js"),
      multiprocessingWorkerBundle,
    ],
  ]) {
    buildSync({
      entryPoints: [entryPoint],
      outfile,
      bundle: true,
      platform: "node",
      format: "cjs",
      target: "node22",
      sourcemap: false,
      minify: false,
      external: ["plotly.js-dist-min/plotly.min.js"],
      define: {
        __SAGEJS_STANDALONE_MODULES__: standaloneModuleDefinition,
      },
    });
  }

  if (buildPython) {
    buildExecutable(`sagepython${executableSuffix}`, false, sourceIdentity);
  }
  if (buildMath) {
    buildExecutable(`sagejs${executableSuffix}`, true, sourceIdentity);
  }
  const sourceAfterBuild = gitSourceIdentity(root, { allowDirty: true });
  if (JSON.stringify(sourceAfterBuild) !== JSON.stringify(sourceIdentity)) {
    for (const name of ["sagepython", "sagejs"]) {
      rmSync(join(outputDirectory, `${name}${executableSuffix}`), {
        force: true,
      });
    }
    throw new Error("release source changed while building SEA artifacts");
  }
}

function main() {
  return withSeaBuildLock(join(root, "build", ".sea-build.lock"), buildAll);
}

if (require.main === module) main();

module.exports = {
  assetReceipt,
  createSeaBuildManifest,
  EMBEDDED_ADDON_ROLE,
  NATIVE_BINARY_RECEIPT_SCHEMA,
  NODE_TEMPLATE_LABEL,
  NODE_TEMPLATE_ROLE,
  nativeBinaryInputs,
  nativeBinaryPolicy,
  nativeBinaryReceipt,
  nativeDependencyReceiptAssets,
  nativeDependencyReceiptInputs,
  observeSeaBuilder,
  productionKernelReceipt,
  SEA_ASSEMBLY_POLICY,
  stageRegularFile,
  stageSeaInputs,
  targetFromSeaBuilder,
  withSeaBuildLock,
};
