"use strict";

const { resolve } = require("node:path");
const { compileKernel } = require("./native-kernel/compiler.cjs");
const {
  analyzeKernel,
  auditKernels,
  emitKernelC,
  explainKernel,
} = require("./native-kernel/introspection.cjs");

async function compile(options) {
  if (options === null || typeof options !== "object") {
    throw new TypeError("native compile options must be an object");
  }
  if (typeof options.sourcePath !== "string" || !options.sourcePath) {
    throw new TypeError("native compile sourcePath must be a non-empty string");
  }
  if (
    options.functions !== undefined &&
    (!Array.isArray(options.functions) ||
      options.functions.some(
        (name) => typeof name !== "string" ||
          !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name),
      ))
  ) {
    throw new TypeError("native compile functions must be function names");
  }
  return compileKernel({
    ...options,
    sourcePath: resolve(options.sourcePath),
    cacheRoot:
      options.cacheRoot === undefined
        ? undefined
        : resolve(options.cacheRoot),
  });
}

async function main() {
  if (process.argv.length !== 3) {
    process.stderr.write(
      "Usage: node tools/native-kernel.cjs <kernel-config.cjs>\n",
    );
    process.exitCode = 2;
    return;
  }
  const configPath = resolve(process.argv[2]);
  const config = require(configPath);
  const base = require("node:path").dirname(configPath);
  const result = await compile({
    ...config,
    sourcePath: resolve(base, config.sourcePath),
    cacheRoot:
      config.cacheRoot === undefined
        ? undefined
        : resolve(base, config.cacheRoot),
  });
  process.stdout.write(
    `${result.cached ? "cached" : "built"} ${result.modulePath}\n`,
  );
}

async function analyze(options) {
  return analyzeKernel({
    ...options,
    sourcePath: resolve(options.sourcePath),
  });
}

async function explain(options) {
  return explainKernel({
    ...options,
    sourcePath: resolve(options.sourcePath),
  });
}

async function emitC(options) {
  return emitKernelC({
    ...options,
    sourcePath: resolve(options.sourcePath),
  });
}

async function audit(options) {
  return auditKernels({
    ...options,
    sourcePath: resolve(options.sourcePath),
  });
}

module.exports = {
  analyze,
  audit,
  compile,
  compileKernel,
  emitC,
  explain,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
