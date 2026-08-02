"use strict";

const { buildSync } = require("esbuild");
const {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} = require("fs");
const { createHash } = require("crypto");
const { execFileSync } = require("child_process");
const { join, relative } = require("path");

const root = join(__dirname, "..");
const outputDirectory = join(root, "build", "sea");
const bundle = join(outputDirectory, "entry.cjs");
const configFilename = join(outputDirectory, "sea-config.json");
const multiprocessingWorkerBundle = join(
  outputDirectory,
  "multiprocessing-worker.cjs",
);
const flintAddon = join(
  root,
  "packages",
  "flint",
  "build",
  "Release",
  "sagejs_flint.node",
);

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
  for (const filename of readdirSync(directory)) {
    if (!filename.endsWith(".py")) continue;
    assets[`lib/${filename}`] = join(directory, filename);
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

function buildExecutable(name, withFlint) {
  if (withFlint && !existsSync(flintAddon)) {
    throw new Error(
      `FLINT addon not found at ${relative(root, flintAddon)}; run ` +
        "`pnpm --dir packages/flint build` first",
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
    "worker/multiprocessing-worker.cjs": multiprocessingWorkerBundle,
    ...collectStandardLibraryAssets(),
    ...collectStandardLibraryCacheAssets(),
    "vendor/plotly.min.js": require.resolve(
      "plotly.js-dist-min/plotly.min.js",
    ),
    "vendor/web-tree-sitter.wasm": join(
      root,
      "dist",
      "vendor",
      "web-tree-sitter.wasm",
    ),
    "vendor/tree-sitter-magma.wasm": join(
      root,
      "dist",
      "vendor",
      "tree-sitter-magma.wasm",
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
  if (withFlint) assets["native/sagejs_flint.node"] = flintAddon;

  writeFileSync(
    configFilename,
    `${JSON.stringify(
      {
        main: bundle,
        output,
        disableExperimentalSEAWarning: true,
        useSnapshot: false,
        useCodeCache: true,
        assets,
      },
      null,
      2,
    )}\n`,
  );
  const seaNode = seaBuilderExecutable();
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
    `Built ${relative(root, output)} (${withFlint ? "with FLINT" : "Python runtime"})`,
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
  external: ["plotly.js-dist-min/plotly.min.js"],
});

if (buildPython) buildExecutable(`sagepython${executableSuffix}`, false);
if (buildMath) buildExecutable(`sagejs${executableSuffix}`, true);
