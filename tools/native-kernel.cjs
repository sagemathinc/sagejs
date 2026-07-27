"use strict";

const { resolve } = require("node:path");
const { compileKernel } = require("./native-kernel/compiler.cjs");

function main() {
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
  const result = compileKernel({
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

module.exports = { compileKernel };

if (require.main === module) main();
