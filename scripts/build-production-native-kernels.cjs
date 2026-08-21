#!/usr/bin/env node

"use strict";

const {
  copyFileSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} = require("node:fs");
const { createHash } = require("node:crypto");
const { join, relative, resolve } = require("node:path");

const {
  compileKernel,
  foreignCompilationInputs,
} = require("../tools/native-kernel/compiler.cjs");
const {
  PACK_FILENAME,
  buildProductionPack,
} = require("../tools/native-kernel/production-pack.cjs");
const { lowerSource } = require("../tools/native-kernel/ir.cjs");

const root = resolve(__dirname, "..");
const manifestPath = join(root, "architecture", "native-kernels.json");
const defaultCacheRoot = join(
  root,
  "packages",
  "flint",
  ".native",
  "production-kernels",
);
const defaultOutputRoot = join(root, "dist", "native-kernels");

function usage() {
  process.stderr.write(
    "usage: build-production-native-kernels.cjs " +
      "[--cache-root PATH] [--output PATH]\n",
  );
  process.exit(2);
}

function parseArguments(arguments_) {
  const options = {
    cacheRoot: defaultCacheRoot,
    outputRoot: defaultOutputRoot,
  };
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--cache-root") {
      if (++index >= arguments_.length) usage();
      options.cacheRoot = resolve(arguments_[index]);
    } else if (argument === "--output") {
      if (++index >= arguments_.length) usage();
      options.outputRoot = resolve(arguments_[index]);
    } else {
      usage();
    }
  }
  return options;
}

function sourceKey(source) {
  const prefix = "src/lib/";
  if (!source.startsWith(prefix)) {
    throw new Error(`production kernel is outside ${prefix}: ${source}`);
  }
  return source.slice(prefix.length);
}

function unavailableOptionalLibrary(error) {
  const message = String(error?.message ?? error);
  return /(?:ENOENT|ENOTDIR|does not resolve)/.test(message);
}

function functionsWithoutUnavailableLibraries(
  functions,
  librariesByFunction,
  unavailable,
) {
  return functions.filter((name) =>
    !(librariesByFunction.get(name) ?? []).some((library) =>
      unavailable.has(library)
    )
  );
}

async function availableProductionFunctions(kernel, source, sourcePath) {
  const optional = new Set(kernel.optional_foreign_libraries ?? []);
  if (optional.size === 0) return kernel.functions;

  const librariesByFunction = new Map();
  const libraries = new Map();
  for (const name of kernel.functions) {
    const ir = await lowerSource(source, sourcePath, { functions: [name] });
    const ids = (ir.foreignLibraries ?? []).map((library) => library.id);
    librariesByFunction.set(name, ids);
    for (const library of ir.foreignLibraries ?? []) {
      if (optional.has(library.id)) libraries.set(library.id, library);
    }
  }

  const unavailable = new Set();
  for (const [id, library] of libraries) {
    try {
      foreignCompilationInputs({ foreignLibraries: [library] });
    } catch (error) {
      if (!unavailableOptionalLibrary(error)) throw error;
      unavailable.add(id);
    }
  }
  return functionsWithoutUnavailableLibraries(
    kernel.functions,
    librariesByFunction,
    unavailable,
  );
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const productionDescriptors = manifest.kernels.filter((kernel) =>
    kernel.id.endsWith("-production"),
  );
  if (productionDescriptors.length === 0) {
    throw new Error("native kernel manifest has no production kernels");
  }
  const productionBySource = new Map();
  for (const descriptor of productionDescriptors) {
    let kernel = productionBySource.get(descriptor.source);
    if (kernel === undefined) {
      kernel = { ...descriptor, ids: [descriptor.id], functions: [] };
      productionBySource.set(descriptor.source, kernel);
    } else {
      kernel.ids.push(descriptor.id);
    }
    for (const name of descriptor.functions) {
      if (kernel.functions.includes(name)) {
        throw new Error(
          `duplicate production function ${descriptor.source}:${name}`,
        );
      }
      kernel.functions.push(name);
    }
  }
  const production = [...productionBySource.values()];

  mkdirSync(options.cacheRoot, { recursive: true });
  const built = [];
  const missingCapabilities = [];
  for (const kernel of production) {
    const absoluteSource = join(root, kernel.source);
    const logicalSource = sourceKey(kernel.source);
    const source = readFileSync(absoluteSource, "utf8");
    const functions = await availableProductionFunctions(
      kernel,
      source,
      absoluteSource,
    );
    const skippedFunctions = kernel.functions.filter(
      (name) => !functions.includes(name),
    );
    if (skippedFunctions.length !== 0) {
      for (const descriptor of productionDescriptors.filter(
        (item) => item.source === kernel.source,
      )) {
        const missing = descriptor.functions.filter((name) =>
          skippedFunctions.includes(name)
        );
        if (missing.length !== 0) {
          missingCapabilities.push({ kernel: descriptor.id, functions: missing });
        }
      }
    }
    if (functions.length === 0) {
      process.stdout.write(
        `skipped ${kernel.id}: optional native dependencies unavailable\n`,
      );
      continue;
    }
    const compiled = await compileKernel({
      sourcePath: absoluteSource,
      sourceKey: logicalSource,
      cacheRoot: options.cacheRoot,
      functions,
    });
    const actualFunctions = compiled.ir.functions.map((fn) => fn.name);
    const missingFunctions = functions.filter(
      (name) => !actualFunctions.includes(name),
    );
    if (missingFunctions.length !== 0) {
      throw new Error(
        `${kernel.id} production functions were not compiled: ` +
          missingFunctions.join(", "),
      );
    }
    built.push({
      absoluteSource,
      cacheKey: compiled.cacheKey,
      moduleIdentity: compiled.moduleIdentity,
      logicalSource,
      sourceHash: createHash("sha256")
        .update(readFileSync(absoluteSource))
        .digest("hex"),
      nativeAbi: compiled.nativeAbi,
      foreignDeclarations: compiled.foreignDeclarations,
      foreignInputs: compiled.foreignInputs,
      exceptionShields: compiled.exceptionShields,
      ir: compiled.ir,
      outputPath: compiled.outputPath,
      shimSourcePath: compiled.shimSourcePath,
      shimHeaderPath: compiled.shimHeaderPath,
    });
    process.stdout.write(
      `${compiled.cached ? "cached" : "built"} ${kernel.ids.join("+")} ` +
        `(${actualFunctions.length} functions` +
        `${skippedFunctions.length === 0 ? "" : `; skipped ${skippedFunctions.join(", ")}`})\n`,
    );
  }

  const pack = buildProductionPack({
    items: built,
    cacheRoot: options.cacheRoot,
  });

  // Publish only runtime inputs. The persistent build cache retains each
  // standalone addon for dynamic development and differential testing. A
  // production runtime ships one content-addressed mathematics pack instead.
  rmSync(options.outputRoot, { recursive: true, force: true });
  mkdirSync(options.outputRoot, { recursive: true });
  const index = {
    schema: "sagejs.native-cache/v4",
    complete:
      built.length === production.length && missingCapabilities.length === 0,
    expectedKernels: production.length,
    missingCapabilities,
    packs: [{
      packKey: pack.packKey,
      packAbi: pack.manifest.packAbi,
      nativeAbi: pack.manifest.nativeAbi,
      bytes: pack.manifest.bytes,
      sha256: pack.manifest.sha256,
      kernels: pack.manifest.kernels.map((kernel) => kernel.cacheKey),
    }],
    sources: {},
    logicalSources: {},
  };
  for (const item of built) {
    const sourceRecord = {
      cacheKey: item.cacheKey,
      moduleIdentity: item.moduleIdentity,
      packKey: pack.packKey,
      sourceHash: item.sourceHash,
      nativeAbi: item.nativeAbi,
      foreignDeclarations: item.foreignDeclarations,
    };
    index.sources[item.absoluteSource] = sourceRecord;
    index.logicalSources[item.logicalSource] = sourceRecord;
    const destination = join(options.outputRoot, item.cacheKey);
    mkdirSync(destination, { recursive: true });
    copyFileSync(
      join(item.outputPath, "index.cjs"),
      join(destination, "index.cjs"),
    );
  }
  const packDestination = join(options.outputRoot, "pack");
  mkdirSync(packDestination, { recursive: true });
  copyFileSync(pack.addonPath, join(packDestination, PACK_FILENAME));
  copyFileSync(pack.manifestPath, join(packDestination, "index.json"));
  const standaloneAddons = built.map((item) => ({
    source: item.logicalSource,
    bytes: statSync(join(
      item.outputPath,
      "build",
      "Release",
      "sagejs_native_kernel.node",
    )).size,
  })).sort((left, right) =>
    right.bytes - left.bytes || left.source.localeCompare(right.source)
  );
  const standaloneBytes = standaloneAddons.reduce(
    (total, addon) => total + addon.bytes,
    0,
  );
  const sizeReport = {
    schema: "sagejs.native-pack-size/v1",
    platform: process.platform,
    architecture: process.arch,
    kernels: built.length,
    standaloneBytes,
    packBytes: pack.manifest.bytes,
    savedBytes: standaloneBytes - pack.manifest.bytes,
    packToStandaloneRatio: pack.manifest.bytes / standaloneBytes,
    largestStandaloneAddons: standaloneAddons.slice(0, 10),
  };
  writeFileSync(
    join(options.outputRoot, "size-report.json"),
    `${JSON.stringify(sizeReport, null, 2)}\n`,
  );
  writeFileSync(
    join(options.outputRoot, "index.json"),
    `${JSON.stringify(index, null, 2)}\n`,
  );
  process.stdout.write(
    `Published ${built.length} production kernel modules at ` +
      `${relative(root, options.outputRoot)} in one ` +
      `${(pack.manifest.bytes / 2 ** 20).toFixed(2)} MiB native pack\n`,
  );
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  availableProductionFunctions,
  functionsWithoutUnavailableLibraries,
  unavailableOptionalLibrary,
};
