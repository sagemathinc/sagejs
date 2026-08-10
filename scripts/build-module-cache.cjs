"use strict";

const {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
} = require("node:fs");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const {
  BASELIB_STANDALONE_CACHE_MODULES,
  BASELIB_STANDALONE_MODULES,
} = require("../tools/standalone-library.cjs");

const root = join(__dirname, "..");
const libraryDirectory = join(root, "src", "lib");
const outputDirectory = join(root, "dist", "module-cache");
const temporaryDirectory = join(root, "dist", "module-cache-build");

function compilerCacheFilename(sourceFilename) {
  return (
    sourceFilename
      .replaceAll("\\", "/")
      .replace(/[<>:"|?*\x00-\x1f]/g, "-")
      .replaceAll("/", "-")
      .replace(/^-+/, "") + ".json"
  );
}

function sourceFilenameForModule(name) {
  const base = join(libraryDirectory, ...name.split("."));
  const moduleFilename = `${base}.py`;
  if (existsSync(moduleFilename)) return moduleFilename;
  const packageFilename = join(base, "__init__.py");
  if (existsSync(packageFilename)) return packageFilename;
  throw new Error(`source for cached module ${name} does not exist`);
}

const standardModules = readdirSync(libraryDirectory)
  .filter((filename) => filename.endsWith(".py"))
  .map((filename) => filename.slice(0, -3))
  .sort();
const modules = [
  ...standardModules.map((name) => ({
    name,
    sourceFilename: join(libraryDirectory, `${name}.py`),
  })),
  ...BASELIB_STANDALONE_CACHE_MODULES.map((name) => ({
    name,
    sourceFilename: sourceFilenameForModule(name),
  })),
];
const requestedModules = [
  ...standardModules,
  ...BASELIB_STANDALONE_MODULES,
];

rmSync(outputDirectory, { recursive: true, force: true });
rmSync(temporaryDirectory, { recursive: true, force: true });
mkdirSync(outputDirectory, { recursive: true });
mkdirSync(temporaryDirectory, { recursive: true });

const result = spawnSync(
  process.execPath,
  [
    join(root, "bin", "sagejs"),
    "compile",
    "--sage",
    "--omit-baselib",
    "--cache-dir",
    temporaryDirectory,
  ],
  {
    cwd: root,
    encoding: "utf8",
    input: `${requestedModules.map((name) => `import ${name}`).join("\n")}\n`,
    stdio: ["pipe", "ignore", "inherit"],
  },
);
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

for (const { name, sourceFilename } of modules) {
  const generated = join(
    temporaryDirectory,
    compilerCacheFilename(sourceFilename),
  );
  copyFileSync(generated, join(outputDirectory, `${name}.json`));
}

rmSync(temporaryDirectory, { recursive: true, force: true });
console.log(
  `Precompiled ${standardModules.length} standard-library modules and ` +
  `${BASELIB_STANDALONE_CACHE_MODULES.length} baselib dependencies`,
);
