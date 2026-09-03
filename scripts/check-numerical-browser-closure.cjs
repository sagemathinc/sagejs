#!/usr/bin/env node
"use strict";

const {
  existsSync,
  readdirSync,
  readFileSync,
} = require("node:fs");
const { join, relative, resolve, sep } = require("node:path");
const { execFileSync } = require("node:child_process");

const DEFAULT_ROOT = resolve(__dirname, "..");
const SUPPORT_ONLY_SEGMENTS = new Set([
  "qualification",
  "release",
  "scripts",
  "test",
]);

function filesBelow(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const filename = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...filesBelow(filename));
    else files.push(filename);
  }
  return files;
}

function numericalModuleName(libraryDirectory, filename) {
  let name = relative(libraryDirectory, filename).split(sep).join("/");
  if (!name.startsWith("sagejs/numerics/") &&
      name !== "sagejs/numerics/__init__.py") return null;
  if (!name.endsWith(".py")) return null;
  name = name.endsWith("/__init__.py")
    ? name.slice(0, -"/__init__.py".length)
    : name.slice(0, -3);
  const segments = name.split("/");
  if (segments.some((segment) =>
    segment.startsWith("_") || SUPPORT_ONLY_SEGMENTS.has(segment)
  )) return null;
  return name.replaceAll("/", ".");
}

function publicNumericalModules(repositoryRoot = DEFAULT_ROOT) {
  const libraryDirectory = join(repositoryRoot, "src", "lib");
  const numericalDirectory = join(libraryDirectory, "sagejs", "numerics");
  let sourceFiles;
  try {
    sourceFiles = execFileSync(
      "git",
      [
        "ls-files",
        "-z",
        "--cached",
        "--others",
        "--exclude-standard",
        "--",
        "src/lib/sagejs/numerics",
      ],
      { cwd: repositoryRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).split("\0").filter(Boolean).map((filename) => join(repositoryRoot, filename));
  } catch (_error) {
    sourceFiles = filesBelow(numericalDirectory);
  }
  return sourceFiles
    .map((filename) => numericalModuleName(libraryDirectory, filename))
    .filter((name) => name !== null)
    .sort();
}

function requiredNumericalBrowserRoots(repositoryRoot = DEFAULT_ROOT) {
  const modules = publicNumericalModules(repositoryRoot);
  const sourceRoot = join(repositoryRoot, "src", "lib", "sagejs", "numerics");
  const directPackages = readdirSync(sourceRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
    .filter((entry) => existsSync(join(sourceRoot, entry.name, "__init__.py")))
    .map((entry) => `sagejs.numerics.${entry.name}`);
  const entryPointSuffixes = new Set([
    "explanations",
    "polynomial_roots",
    "portable",
    "presentation",
    "roots",
    "sweeps",
    "visualization",
  ]);
  return [...new Set([
    "sagejs.numerics",
    ...directPackages,
    ...modules.filter((name) =>
      entryPointSuffixes.has(name.split(".").at(-1))),
  ])].sort();
}

function validateNumericalBrowserClosure({
  repositoryRoot = DEFAULT_ROOT,
  manifest,
  bundle = null,
}) {
  if (manifest === null || typeof manifest !== "object" ||
      !Array.isArray(manifest.imports)) {
    throw new TypeError("browser precompile manifest has no imports array");
  }
  const duplicateImports = manifest.imports.filter(
    (name, index) => manifest.imports.indexOf(name) !== index,
  );
  if (duplicateImports.length !== 0) {
    throw new Error(
      `browser precompile manifest has duplicate roots: ${[
        ...new Set(duplicateImports),
      ].join(", ")}`,
    );
  }
  const expected = publicNumericalModules(repositoryRoot);
  const expectedRoots = requiredNumericalBrowserRoots(repositoryRoot);
  const configured = new Set(manifest.imports);
  const missingRoots = expectedRoots.filter((name) => !configured.has(name));
  if (missingRoots.length !== 0) {
    throw new Error(
      "public numerical modules are not explicit browser lazy roots:\n" +
        missingRoots.map((name) => `  - ${name}`).join("\n"),
    );
  }

  if (bundle !== null) {
    const roots = new Set(bundle?.roots?.package ?? []);
    const modules = new Set(Object.keys(bundle?.modules ?? {}));
    const missingBundleRoots = expectedRoots.filter((name) => !roots.has(name));
    const missingModules = expected.filter((name) => !modules.has(name));
    if (missingBundleRoots.length !== 0 || missingModules.length !== 0) {
      const failures = [];
      if (missingBundleRoots.length !== 0) {
        failures.push(
          "not retained as package roots:\n" +
            missingBundleRoots.map((name) => `  - ${name}`).join("\n"),
        );
      }
      if (missingModules.length !== 0) {
        failures.push(
          "not compiled into the lazy bundle:\n" +
            missingModules.map((name) => `  - ${name}`).join("\n"),
        );
      }
      throw new Error(
        "browser numerical lazy closure is incomplete:\n" + failures.join("\n"),
      );
    }
  }
  return {
    explicitRoots: expectedRoots.length,
    publicModules: expected.length,
  };
}

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  if (index + 1 >= process.argv.length) {
    throw new Error(`${name} requires a filename`);
  }
  return process.argv[index + 1];
}

if (require.main === module) {
  const repositoryRoot = DEFAULT_ROOT;
  const manifest = JSON.parse(readFileSync(
    join(repositoryRoot, "scripts", "precompiled-python-packages.json"),
    "utf8",
  ));
  const bundleFilename = argument("--bundle");
  if (bundleFilename !== null && !existsSync(resolve(bundleFilename))) {
    throw new Error(`lazy-module bundle does not exist: ${bundleFilename}`);
  }
  const bundle = bundleFilename === null
    ? null
    : JSON.parse(readFileSync(resolve(bundleFilename), "utf8"));
  const report = validateNumericalBrowserClosure({
    repositoryRoot,
    manifest,
    bundle,
  });
  console.log(
    `${report.explicitRoots} browser lazy roots cover ` +
      `${report.publicModules} public numerical modules` +
      (bundle === null ? "." : " in the generated bundle."),
  );
}

module.exports = {
  numericalModuleName,
  publicNumericalModules,
  requiredNumericalBrowserRoots,
  validateNumericalBrowserClosure,
};
