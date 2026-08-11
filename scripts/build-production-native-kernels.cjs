#!/usr/bin/env node

"use strict";

const {
  copyFileSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { createHash } = require("node:crypto");
const { join, relative, resolve } = require("node:path");

const { compileKernel } = require("../tools/native-kernel/compiler.cjs");

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

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const production = manifest.kernels.filter((kernel) =>
    kernel.id.endsWith("-production"),
  );
  if (production.length === 0) {
    throw new Error("native kernel manifest has no production kernels");
  }
  const duplicateSources = production.filter(
    (kernel, index) =>
      production.findIndex((other) => other.source === kernel.source) !== index,
  );
  if (duplicateSources.length !== 0) {
    throw new Error(
      `duplicate production source ${duplicateSources[0].source}`,
    );
  }

  mkdirSync(options.cacheRoot, { recursive: true });
  const built = [];
  for (const kernel of production) {
    const absoluteSource = join(root, kernel.source);
    const logicalSource = sourceKey(kernel.source);
    const compiled = await compileKernel({
      sourcePath: absoluteSource,
      sourceKey: logicalSource,
      cacheRoot: options.cacheRoot,
    });
    const actualFunctions = compiled.ir.functions.map((fn) => fn.name);
    const missingFunctions = kernel.functions.filter(
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
      logicalSource,
      sourceHash: createHash("sha256")
        .update(readFileSync(absoluteSource))
        .digest("hex"),
      outputPath: compiled.outputPath,
    });
    process.stdout.write(
      `${compiled.cached ? "cached" : "built"} ${kernel.id} ` +
        `(${actualFunctions.length} functions)\n`,
    );
  }

  // Publish only runtime inputs. The persistent build cache also contains C,
  // headers, provenance, and node-gyp state for inspection and incremental
  // rebuilds; shipped runtimes need the wrapper and its native addon.
  rmSync(options.outputRoot, { recursive: true, force: true });
  mkdirSync(options.outputRoot, { recursive: true });
  const index = {
    schema: "sagejs.native-cache/v2",
    sources: {},
    logicalSources: {},
  };
  for (const item of built) {
    const sourceRecord = {
      cacheKey: item.cacheKey,
      sourceHash: item.sourceHash,
    };
    index.sources[item.absoluteSource] = sourceRecord;
    index.logicalSources[item.logicalSource] = sourceRecord;
    const destination = join(options.outputRoot, item.cacheKey);
    mkdirSync(join(destination, "build", "Release"), { recursive: true });
    copyFileSync(
      join(item.outputPath, "index.cjs"),
      join(destination, "index.cjs"),
    );
    copyFileSync(
      join(
        item.outputPath,
        "build",
        "Release",
        "sagejs_native_kernel.node",
      ),
      join(
        destination,
        "build",
        "Release",
        "sagejs_native_kernel.node",
      ),
    );
  }
  writeFileSync(
    join(options.outputRoot, "index.json"),
    `${JSON.stringify(index, null, 2)}\n`,
  );
  process.stdout.write(
    `Published ${built.length} production kernel modules at ` +
      `${relative(root, options.outputRoot)}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
