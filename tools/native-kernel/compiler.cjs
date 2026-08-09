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
const windowsTriplet = "x64-windows-static-md-release";
const nativePrefix = resolve(
  process.env.SAGEJS_FLINT_PREFIX ||
    (process.platform === "win32"
      ? join(
          root,
          "packages",
          "flint",
          ".native",
          "vcpkg-installed",
          windowsTriplet,
        )
      : join(root, "packages", "flint", ".native", "prefix")),
);
const nativeInclude = join(root, "packages", "flint", "include");
const header = join(nativeInclude, "sagejs", "native.h");
const mpcVersion = process.platform === "win32" ? "1.3.1" : "1.4.1";
const nativeMpcLibrary = join(
  nativePrefix,
  "lib",
  process.platform === "win32" ? "mpc.lib" : "libmpc.a",
);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function writeDiscoveryIndex(cacheRoot, sourcePath, sourceHash, cacheKey) {
  const indexPath = join(cacheRoot, "index.json");
  let index = {
    schema: "sagejs.native-cache/v1",
    sources: {},
  };
  try {
    const current = JSON.parse(readFileSync(indexPath, "utf8"));
    if (
      current?.schema === index.schema &&
      current.sources !== null &&
      typeof current.sources === "object"
    ) {
      index = current;
    }
  } catch (_error) {}
  index.sources[sourcePath] = { cacheKey, sourceHash };
  writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
}

function backendFingerprint() {
  return sha256(
    [
      readFileSync(__filename),
      readFileSync(join(__dirname, "ir.cjs")),
      readFileSync(join(__dirname, "integer-ir.cjs")),
      readFileSync(join(__dirname, "exact-analysis.cjs")),
      readFileSync(join(__dirname, "prime-field-ir.cjs")),
      readFileSync(join(__dirname, "prime-field-backend.cjs")),
      readFileSync(join(__dirname, "prime-source-ir.cjs")),
      readFileSync(join(__dirname, "prime-source-optimize.cjs")),
      readFileSync(join(__dirname, "prime-source-backend.cjs")),
      readFileSync(join(__dirname, "provenance.cjs")),
      readFileSync(join(__dirname, "word-backend.cjs")),
      readFileSync(join(__dirname, "tagged-backend.cjs")),
      readFileSync(join(__dirname, "c-backend.cjs")),
      readFileSync(join(__dirname, "js-backend.cjs")),
      readFileSync(header),
    ].join("\0"),
  );
}

function toolchainFingerprint() {
  const compiler = process.env.CC ||
    (process.platform === "win32" ? "ClangCL" : "cc");
  const version = process.platform === "win32"
    ? "selected by node-gyp"
    : spawnSync(compiler, ["--version"], { encoding: "utf8" })
      .stdout?.split("\n", 1)[0] || "unknown";
  return {
    compiler,
    version,
    cflags: process.env.CFLAGS || "",
    cxx: process.env.CXX || "",
    cxxflags: process.env.CXXFLAGS || "",
    ldflags: process.env.LDFLAGS || "",
  };
}

function primeFieldTuning() {
  const specifications = [
    ["blockThresholdU32", "SAGEJS_NATIVE_PRIME_BLOCK_THRESHOLD_U32", 32, 1, 4096],
    ["blockThresholdU64", "SAGEJS_NATIVE_PRIME_BLOCK_THRESHOLD_U64", 320, 1, 4096],
    ["panelU32", "SAGEJS_NATIVE_PRIME_PANEL_U32", 20, 1, 128],
    ["panelU64", "SAGEJS_NATIVE_PRIME_PANEL_U64", 48, 1, 128],
    ["columnTile", "SAGEJS_NATIVE_PRIME_COLUMN_TILE", 512, 1, 4096],
    ["shoupThreshold", "SAGEJS_NATIVE_PRIME_SHOUP_THRESHOLD", 4, 1, 128],
  ];
  return Object.fromEntries(specifications.map(
    ([name, environment, fallback, minimum, maximum]) => {
      const text = process.env[environment];
      const value = text === undefined ? fallback : Number(text);
      if (!Number.isInteger(value) || value < minimum || value > maximum) {
        throw new RangeError(
          `${environment} must be an integer from ${minimum} through ${maximum}`,
        );
      }
      return [name, value];
    },
  ));
}

function sourceBoundsCheck() {
  const text = process.env.SAGEJS_NATIVE_SOURCE_BOUNDS_CHECK;
  if (text === undefined) return true;
  if (text === "0") return false;
  if (text === "1") return true;
  throw new RangeError(
    "SAGEJS_NATIVE_SOURCE_BOUNDS_CHECK must be 0 or 1",
  );
}

function bindingGyp(ir, sourceBoundsChecked) {
  const usesPrimeField = ir.functions.some(
    (fn) => ["prime-field-matrix", "prime-field-source"].includes(fn.kernelKind),
  );
  const usesSpecializedPrimeField = ir.functions.some(
    (fn) => fn.kernelKind === "prime-field-matrix",
  );
  const matrixOnly = ir.functions.every(
    (fn) => ["prime-field-matrix", "prime-field-source"].includes(fn.kernelKind),
  );
  const tuning = usesSpecializedPrimeField ? primeFieldTuning() : null;
  const target = {
    target_name: "sagejs_native_kernel",
    win_delay_load_hook: "false",
    sources: ["kernel.c"],
    include_dirs: [join(nativePrefix, "include"), nativeInclude],
    defines: [
      "NAPI_VERSION=8",
      ...(usesSpecializedPrimeField
        ? [
          `SAGEJS_PRIME_BLOCK_THRESHOLD_U32=${tuning.blockThresholdU32}`,
          `SAGEJS_PRIME_BLOCK_THRESHOLD_U64=${tuning.blockThresholdU64}`,
          `SAGEJS_PRIME_PANEL_U32=${tuning.panelU32}`,
          `SAGEJS_PRIME_PANEL_U64=${tuning.panelU64}`,
          `SAGEJS_PRIME_COLUMN_TILE=${tuning.columnTile}`,
          `SAGEJS_PRIME_SHOUP_THRESHOLD=${tuning.shoupThreshold}`,
        ]
        : []),
      ...(sourceBoundsChecked === null
        ? []
        : [`SAGEJS_NATIVE_SOURCE_BOUNDS_CHECK=${sourceBoundsChecked ? 1 : 0}`]),
    ],
  };
  if (process.platform === "win32") {
    target.libraries = [
      ...(!matrixOnly
        ? [
          nativeMpcLibrary,
          join(nativePrefix, "lib", "mpfr.lib"),
          join(nativePrefix, "lib", "gmp.lib"),
        ]
        : []),
    ];
    target.configurations = {
      Release: {
        ...(usesPrimeField ? { msbuild_toolset: "ClangCL" } : {}),
        msvs_settings: {
          VCCLCompilerTool: { RuntimeLibrary: 2 },
        },
      },
    };
    target.msvs_settings = {
      VCCLCompilerTool: { Optimization: 3, WarningLevel: 3 },
    };
  } else {
    target.libraries = [
      ...(!matrixOnly
        ? [
          nativeMpcLibrary,
          join(nativePrefix, "lib", "libmpfr.a"),
          join(nativePrefix, "lib", "libgmp.a"),
        ]
        : []),
      "-lm",
    ];
    target.cflags = [
      "-O3",
      "-fPIC",
      "-Wall",
      "-Wextra",
      "-ffunction-sections",
      "-fdata-sections",
    ];
    if (process.platform === "darwin") {
      target.xcode_settings = {
        GCC_OPTIMIZATION_LEVEL: "3",
        MACOSX_DEPLOYMENT_TARGET: "13.0",
      };
    } else {
      target.ldflags = [
        "-Wl,--gc-sections",
        "-Wl,--exclude-libs,ALL",
        "-Wl,--strip-all",
      ];
    }
  }
  return {
    targets: [target],
  };
}

async function compileKernel(options) {
  const sourcePath = resolve(options.sourcePath);
  const source = readFileSync(sourcePath, "utf8");
  const sourceHash = sha256(source);
  const ir = await lowerSource(source, sourcePath, {
    functions: options.functions,
  });
  const usesSpecializedPrimeField = ir.functions.some(
    (fn) => fn.kernelKind === "prime-field-matrix",
  );
  const usesSourcePrimeField = ir.functions.some(
    (fn) => fn.kernelKind === "prime-field-source",
  );
  const tuning = usesSpecializedPrimeField ? primeFieldTuning() : null;
  const sourceBoundsChecked = usesSourcePrimeField ? sourceBoundsCheck() : null;
  const identity = {
    sourcePath,
    source,
    ir,
    nativeAbi: NATIVE_ABI_VERSION,
    backend: backendFingerprint(),
    platform: process.platform,
    architecture: process.arch,
    nodeModulesAbi: process.versions.modules,
    toolchain: toolchainFingerprint(),
    primeFieldTuning: tuning,
    sourceBoundsChecked,
    mpfr: "4.2.2",
    mpc: mpcVersion,
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
    writeDiscoveryIndex(cacheRoot, sourcePath, sourceHash, cacheKey);
    return {
      addonPath,
      cacheKey,
      cached: true,
      ir,
      modulePath,
      outputPath,
    };
  }

  const matrixOnly = ir.functions.every(
    (fn) => ["prime-field-matrix", "prime-field-source"].includes(fn.kernelKind),
  );
  if (!matrixOnly && !existsSync(nativeMpcLibrary)) {
    throw new Error(
      "native MPC dependencies are not built; run " +
        "pnpm --dir packages/flint build",
    );
  }
  mkdirSync(outputPath, { recursive: true });
  const cSource = generateC(ir);
  const { generatedCSourceMap } = require("./provenance.cjs");
  const cSourceMap = generatedCSourceMap(cSource);
  writeFileSync(join(outputPath, "kernel.c"), cSource);
  writeFileSync(
    join(outputPath, "binding.gyp"),
    `${JSON.stringify(bindingGyp(ir, sourceBoundsChecked), null, 2)}\n`,
  );
  writeFileSync(
    modulePath,
    generateJavaScript(ir, {
      cacheKey,
      primeFieldTuning: tuning,
      sourceBoundsChecked,
      sourceHash,
      sourcePath,
    }),
  );
  writeFileSync(
    manifestPath,
    `${JSON.stringify(
      {
        cacheKey,
        nativeAbi: NATIVE_ABI_VERSION,
        primeFieldTuning: tuning,
        sourceBoundsChecked,
        sourcePath,
        cSourceMap,
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
  writeDiscoveryIndex(cacheRoot, sourcePath, sourceHash, cacheKey);
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
