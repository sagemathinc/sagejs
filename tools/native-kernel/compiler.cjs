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
      readFileSync(join(__dirname, "c-backend.cjs")),
      readFileSync(join(__dirname, "js-backend.cjs")),
      readFileSync(header),
    ].join("\0"),
  );
}

function bindingGyp() {
  const target = {
    target_name: "sagejs_native_kernel",
    win_delay_load_hook: "false",
    sources: ["kernel.c"],
    include_dirs: [join(nativePrefix, "include"), nativeInclude],
    defines: ["NAPI_VERSION=8"],
  };
  if (process.platform === "win32") {
    target.libraries = [
      nativeMpcLibrary,
      join(nativePrefix, "lib", "mpfr.lib"),
      join(nativePrefix, "lib", "gmp.lib"),
    ];
    target.configurations = {
      Release: {
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
      nativeMpcLibrary,
      join(nativePrefix, "lib", "libmpfr.a"),
      join(nativePrefix, "lib", "libgmp.a"),
      "-lm",
    ];
    target.cflags = ["-O3", "-fPIC", "-Wall", "-Wextra"];
    if (process.platform === "darwin") {
      target.xcode_settings = {
        GCC_OPTIMIZATION_LEVEL: "3",
        MACOSX_DEPLOYMENT_TARGET: "13.0",
      };
    } else {
      target.ldflags = ["-Wl,--exclude-libs,ALL"];
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
  const identity = {
    sourcePath,
    source,
    ir,
    nativeAbi: NATIVE_ABI_VERSION,
    backend: backendFingerprint(),
    platform: process.platform,
    architecture: process.arch,
    nodeModulesAbi: process.versions.modules,
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

  if (!existsSync(nativeMpcLibrary)) {
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
    generateJavaScript(ir, { cacheKey, sourceHash, sourcePath }),
  );
  writeFileSync(
    manifestPath,
    `${JSON.stringify(
      {
        cacheKey,
        nativeAbi: NATIVE_ABI_VERSION,
        sourcePath,
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
