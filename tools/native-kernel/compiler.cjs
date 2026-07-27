"use strict";

const { createHash } = require("node:crypto");
const {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} = require("node:fs");
const { dirname, join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const { lowerSource } = require("./ir.cjs");
const {
  NATIVE_ABI_VERSION,
  generateC,
} = require("./c-backend.cjs");
const { generateJavaScript } = require("./js-backend.cjs");

const root = resolve(__dirname, "..", "..");
const nativePrefix = resolve(
  process.env.SAGEJS_FLINT_PREFIX ||
    join(root, "packages", "flint", ".native", "prefix"),
);
const nativeInclude = join(root, "packages", "flint", "include");
const header = join(nativeInclude, "sagejs", "native.h");

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function backendFingerprint() {
  return sha256(
    [
      readFileSync(__filename),
      readFileSync(join(__dirname, "ir.cjs")),
      readFileSync(join(__dirname, "c-backend.cjs")),
      readFileSync(join(__dirname, "js-backend.cjs")),
      readFileSync(header),
    ].join("\0"),
  );
}

function bindingGyp() {
  return {
    targets: [
      {
        target_name: "sagejs_native_kernel",
        sources: ["kernel.c"],
        include_dirs: [join(nativePrefix, "include"), nativeInclude],
        libraries: [
          join(nativePrefix, "lib", "libmpc.a"),
          join(nativePrefix, "lib", "libmpfr.a"),
          "-lgmp",
          "-lm",
        ],
        defines: ["NAPI_VERSION=8"],
        cflags: ["-O3", "-fPIC", "-Wall", "-Wextra"],
        ldflags: ["-Wl,--exclude-libs,ALL"],
      },
    ],
  };
}

function compileKernel(options) {
  const sourcePath = resolve(options.sourcePath);
  const source = readFileSync(sourcePath, "utf8");
  const signatures = options.signatures || {};
  const ir = lowerSource(source, sourcePath, signatures);
  const identity = {
    source,
    signatures,
    ir,
    nativeAbi: NATIVE_ABI_VERSION,
    backend: backendFingerprint(),
    platform: process.platform,
    architecture: process.arch,
    nodeModulesAbi: process.versions.modules,
    mpfr: "4.2.2",
    mpc: "1.4.1",
  };
  const cacheKey = sha256(JSON.stringify(identity));
  const cacheRoot = resolve(
    options.cacheRoot ||
      join(dirname(sourcePath), ".sagejs-native-kernels"),
  );
  const outputPath = join(cacheRoot, cacheKey);
  const addonPath = join(
    outputPath,
    "build",
    "Release",
    "sagejs_native_kernel.node",
  );
  const modulePath = join(outputPath, "index.cjs");
  const manifestPath = join(outputPath, "manifest.json");
  if (
    existsSync(addonPath) &&
    existsSync(modulePath) &&
    existsSync(manifestPath)
  ) {
    return {
      addonPath,
      cacheKey,
      cached: true,
      ir,
      modulePath,
      outputPath,
    };
  }

  if (!existsSync(join(nativePrefix, "lib", "libmpc.a"))) {
    throw new Error(
      "native MPC dependencies are not built; run " +
        "pnpm --dir packages/flint build",
    );
  }
  mkdirSync(outputPath, { recursive: true });
  writeFileSync(join(outputPath, "kernel.c"), generateC(ir));
  writeFileSync(
    join(outputPath, "binding.gyp"),
    `${JSON.stringify(bindingGyp(), null, 2)}\n`,
  );
  writeFileSync(
    modulePath,
    generateJavaScript(ir, { cacheKey }),
  );
  writeFileSync(
    manifestPath,
    `${JSON.stringify(
      {
        cacheKey,
        nativeAbi: NATIVE_ABI_VERSION,
        sourcePath,
        signatures,
        ir,
      },
      null,
      2,
    )}\n`,
  );

  const nodeGyp = require.resolve("node-gyp/bin/node-gyp.js", {
    paths: [join(root, "packages", "flint")],
  });
  const build = spawnSync(process.execPath, [nodeGyp, "rebuild"], {
    cwd: outputPath,
    encoding: "utf8",
  });
  if (build.status !== 0) {
    process.stderr.write(build.stdout);
    process.stderr.write(build.stderr);
    throw new Error(`node-gyp exited with status ${build.status}`);
  }
  return {
    addonPath,
    cacheKey,
    cached: false,
    ir,
    modulePath,
    outputPath,
  };
}

module.exports = {
  NATIVE_ABI_VERSION,
  compileKernel,
};
