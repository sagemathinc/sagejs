"use strict";

const { buildSync } = require("esbuild");
const {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} = require("fs");
const { createHash } = require("crypto");
const { execFileSync, spawnSync } = require("child_process");
const { tmpdir } = require("os");
const { dirname, join, relative } = require("path");
const {
  BASELIB_STANDALONE_CACHE_MODULES,
  BUILTINS_STANDALONE_MODULES,
  MATRIX_STANDALONE_MODULES,
} = require("../tools/standalone-library.cjs");

const root = join(__dirname, "..");
const outputDirectory = join(root, "build", "sea");
const bundle = join(outputDirectory, "entry.cjs");
const configFilename = join(outputDirectory, "sea-config.json");
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
const productionPackAddon = join(
  root,
  "dist",
  "native-kernels",
  "pack",
  "sagejs_native_kernel_pack.node",
);

const embeddedStandaloneLibraryBanner = `globalThis.__sagejs_embedded_standalone_library__ = ${JSON.stringify(
  {
    builtins: BUILTINS_STANDALONE_MODULES,
    matrix: MATRIX_STANDALONE_MODULES,
    cache: BASELIB_STANDALONE_CACHE_MODULES,
  },
)};`;

const args = new Set(process.argv.slice(2));
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

function prepareSeaBuilderExecutable() {
  const source = seaBuilderExecutable();
  // Official Windows Node releases do not carry an ELF/Mach-O symbol table;
  // their debug information is distributed separately in PDB files.
  if (process.platform === "win32") {
    return { executable: source, cleanup() {} };
  }

  const directory = mkdtempSync(join(tmpdir(), "sagejs-sea-node-"));
  const executable = join(directory, "node");
  try {
    copyFileSync(source, executable);
    chmodSync(executable, 0o755);
    if (process.platform === "darwin") {
      // `-x` removes local symbols while retaining the dynamic symbols needed
      // by native addons. Stripping invalidates Apple's upstream signature, so
      // install an ad-hoc signature before using this copy as the SEA template.
      execFileSync("strip", ["-x", executable], { stdio: "inherit" });
      execFileSync("codesign", ["--sign", "-", "--force", executable], {
        stdio: "inherit",
      });
    } else if (process.platform === "linux") {
      execFileSync("strip", ["--strip-unneeded", executable], {
        stdio: "inherit",
      });
    } else {
      return {
        executable: source,
        cleanup: () =>
          rmSync(directory, { recursive: true, force: true }),
      };
    }
    const before = statSync(source).size;
    const after = statSync(executable).size;
    console.log(
      `Stripped Node SEA base: ${(before / 2 ** 20).toFixed(1)} MiB -> ` +
        `${(after / 2 ** 20).toFixed(1)} MiB`,
    );
    return {
      executable,
      cleanup: () => rmSync(directory, { recursive: true, force: true }),
    };
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}

function validateWindowsRenamedNativeHost(executable, addons) {
  if (process.platform !== "win32" || addons.length === 0) return;
  const directory = mkdtempSync(join(tmpdir(), "sagejs-sea-host-test-"));
  const renamed = join(directory, "sagejs-native-host-test.exe");
  const probe = join(directory, "load-addon.cjs");
  try {
    copyFileSync(executable, renamed);
    const version = spawnSync(executable, ["--version"], {
      encoding: "utf8",
    }).stdout.trim() || "unknown version";
    for (const addon of addons) {
      writeFileSync(probe, `require(${JSON.stringify(addon)});\n`);
      const result = spawnSync(renamed, [probe], {
        cwd: root,
        encoding: "utf8",
      });
      if (result.status !== 0) {
        throw new Error(
          `Windows SEA host ${version} cannot load ` +
            `${relative(root, addon)} after its executable is renamed ` +
            `(status ${result.status ?? result.signal ?? "unknown"}). ` +
            "Use a current official Node release or set SAGEJS_SEA_NODE " +
            "to one that passes native-addon rename loading.",
        );
      }
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function sharedRuntimeBootstrapSource() {
  const sage = join(
    root,
    "dist",
    "runtime-cache",
    "runtime-bootstrap-sage.js",
  );
  const python = join(
    root,
    "dist",
    "runtime-cache",
    "runtime-bootstrap-python.js",
  );
  if (!readFileSync(sage).equals(readFileSync(python))) {
    throw new Error(
      "Sage and Python runtime bootstrap sources diverged; the SEA shared " +
        "bootstrap asset must be redesigned before packaging either source",
    );
  }
  return sage;
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
  const index = JSON.parse(readFileSync(join(directory, "index.json"), "utf8"));
  if (
    index.schema !== "sagejs.native-cache/v4" ||
    index.complete !== true ||
    !Array.isArray(index.packs) ||
    index.packs.length !== 1
  ) {
    throw new Error(
      "SEA releases require one complete production native mathematics pack",
    );
  }
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
          relativeName === "pack/index.json" ||
          relativeName === "pack/sagejs_native_kernel_pack.node")
      ) {
        assets[`native-kernels/${relativeName}`] = filename;
      }
    }
  };
  visit(directory);
  if (
    !("native-kernels/pack/index.json" in assets) ||
    !("native-kernels/pack/sagejs_native_kernel_pack.node" in assets)
  ) {
    throw new Error("production native mathematics pack is incomplete");
  }
  return assets;
}

function buildExecutable(name, withFlint, seaNode) {
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
    "runtime-cache/runtime-bootstrap.js": sharedRuntimeBootstrapSource(),
    "runtime-cache/runtime-bootstrap-sage.bin": join(
      root,
      "dist",
      "runtime-cache",
      "runtime-bootstrap-sage.bin",
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
  if (withFlint) {
    assets["native/sagejs_flint.node"] = flintAddon;
    assets["native/sagejs_flint_ffi.node"] = flintFfiAddon;
    assets["native/sagejs_flint_ffi_manifest.json"] = flintFfiManifest;
    assets["native/sagejs_graph.node"] = graphAddon;
    assets["native/sagejs_igraph_ffi.node"] = graphFfiAddon;
    assets["native/sagejs_igraph_ffi_manifest.json"] = graphFfiManifest;
    Object.assign(assets, collectNativeKernelAssets());
  }

  writeFileSync(
    configFilename,
    `${JSON.stringify(
      {
        main: bundle,
        output,
        disableExperimentalSEAWarning: true,
        // User snapshots currently add more deserialization time than the
        // cached runtime saves, and cannot contain the compiler's vm.Context.
        useSnapshot: false,
        useCodeCache: true,
        assets,
      },
      null,
      2,
    )}\n`,
  );
  execFileSync(seaNode, ["--build-sea", configFilename], {
    cwd: root,
    stdio: "inherit",
  });
  if (process.platform === "darwin") {
    execFileSync("codesign", ["--sign", "-", "--force", output], {
      cwd: root,
      stdio: "inherit",
    });
  }
  console.log(
    `Built ${relative(root, output)} (${withFlint ? "with native mathematics" : "Python runtime"})`,
  );
}

rmSync(outputDirectory, { recursive: true, force: true });
mkdirSync(outputDirectory, { recursive: true });

buildSync({
  entryPoints: [join(root, "dist", "tools", "sea-entry.js")],
  outfile: bundle,
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  sourcemap: false,
  minify: false,
  banner: { js: embeddedStandaloneLibraryBanner },
  external: ["plotly.js-dist-min/plotly.min.js"],
});

buildSync({
  entryPoints: [join(root, "dist", "tools", "kernel-worker.js")],
  outfile: kernelWorkerBundle,
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  sourcemap: false,
  minify: false,
  banner: { js: embeddedStandaloneLibraryBanner },
  external: ["plotly.js-dist-min/plotly.min.js"],
});

buildSync({
  entryPoints: [join(root, "dist", "tools", "multiprocessing-worker.js")],
  outfile: multiprocessingWorkerBundle,
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  sourcemap: false,
  minify: false,
  banner: { js: embeddedStandaloneLibraryBanner },
  external: ["plotly.js-dist-min/plotly.min.js"],
});

const seaBuilder = prepareSeaBuilderExecutable();
try {
  validateWindowsRenamedNativeHost(seaBuilder.executable, [
    zeroMQAddonFilename(),
    ...(buildMath
      ? [
        flintAddon,
        flintFfiAddon,
        graphAddon,
        graphFfiAddon,
        productionPackAddon,
      ]
      : []),
  ]);
  if (buildPython) {
    buildExecutable(
      `sagepython${executableSuffix}`,
      false,
      seaBuilder.executable,
    );
  }
  if (buildMath) {
    buildExecutable(`sagejs${executableSuffix}`, true, seaBuilder.executable);
  }
} finally {
  seaBuilder.cleanup();
}
