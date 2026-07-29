"use strict";

const {
  copyFileSync,
  mkdirSync,
  readdirSync,
  rmSync,
} = require("node:fs");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = join(__dirname, "..");
const libraryDirectory = join(root, "src", "lib");
const outputDirectory = join(root, "dist", "module-cache");
const temporaryDirectory = join(root, "dist", "module-cache-build");

function compilerCacheFilename(sourceFilename) {
  return (
    sourceFilename
      .replaceAll("\\", "/")
      .replaceAll("/", "-")
      .replace(/^-+/, "") + ".json"
  );
}

const modules = readdirSync(libraryDirectory)
  .filter((filename) => filename.endsWith(".py"))
  .map((filename) => filename.slice(0, -3))
  .sort();

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
    input: `${modules.map((name) => `import ${name}`).join("\n")}\n`,
    stdio: ["pipe", "ignore", "inherit"],
  },
);
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

for (const name of modules) {
  const sourceFilename = join(libraryDirectory, `${name}.py`);
  const generated = join(
    temporaryDirectory,
    compilerCacheFilename(sourceFilename),
  );
  copyFileSync(generated, join(outputDirectory, `${name}.json`));
}

rmSync(temporaryDirectory, { recursive: true, force: true });
console.log(`Precompiled ${modules.length} standard-library modules`);
