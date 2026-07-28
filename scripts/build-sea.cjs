"use strict";

const { buildSync } = require("esbuild");
const {
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} = require("fs");
const { execFileSync } = require("child_process");
const { join, relative } = require("path");

const root = join(__dirname, "..");
const outputDirectory = join(root, "build", "sea");
const bundle = join(outputDirectory, "entry.cjs");
const configFilename = join(outputDirectory, "sea-config.json");
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

function collectStandardLibraryAssets() {
  const directory = join(root, "src", "lib");
  const assets = {};
  for (const filename of readdirSync(directory)) {
    if (!filename.endsWith(".py")) continue;
    assets[`lib/${filename}`] = join(directory, filename);
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
    ...collectStandardLibraryAssets(),
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
  execFileSync(process.execPath, ["--build-sea", configFilename], {
    cwd: root,
    stdio: "inherit",
  });
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
});

if (buildPython) buildExecutable("sagepython", false);
if (buildMath) buildExecutable("sagejs", true);
