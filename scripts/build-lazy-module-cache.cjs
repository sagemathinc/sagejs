#!/usr/bin/env node
"use strict";

const {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join, relative, resolve, sep } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");
const libraryDirectory = join(root, "src", "lib");
const outputDirectory = join(root, "dist", "lazy-module-cache");
const dynamicOutputDirectory = join(root, "dist", "dynamic-cache");
const manifest = JSON.parse(readFileSync(
  join(__dirname, "precompiled-python-packages.json"),
  "utf8",
));
const temporary = mkdtempSync(join(tmpdir(), "sagejs-python-precompile-"));
const dynamicTemporary = join(temporary, "dynamic");
const filenameMarker = "__sagejs_precompiled_module_filename__";

function filesBelow(directory) {
  const answer = [];
  if (!existsSync(directory)) return answer;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const filename = join(directory, entry.name);
    if (entry.isDirectory()) answer.push(...filesBelow(filename));
    else answer.push(filename);
  }
  return answer;
}

function moduleName(filename) {
  let name = relative(libraryDirectory, filename).split(sep).join("/");
  if (name.startsWith("../") || !name.endsWith(".py")) return;
  name = name.endsWith("/__init__.py")
    ? name.slice(0, -"/__init__.py".length)
    : name.slice(0, -3);
  return name.replaceAll("/", ".");
}

rmSync(outputDirectory, { recursive: true, force: true });
rmSync(dynamicOutputDirectory, { recursive: true, force: true });
mkdirSync(outputDirectory, { recursive: true });
mkdirSync(dynamicOutputDirectory, { recursive: true });

try {
  const result = spawnSync(
    process.execPath,
    [join(root, "bin", "sagejs"), "--python"],
    {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        XDG_CACHE_HOME: temporary,
        SAGEJS_DYNAMIC_CACHE_DIR: dynamicTemporary,
        SAGEJS_PRECOMPILED_DYNAMIC_CACHE_DIR: join(temporary, "missing-dynamic"),
        SAGEJS_PRECOMPILED_MODULE_CACHE_DIR: join(temporary, "missing-modules"),
      },
      input: `${manifest.imports.map((name) => `import ${name}`).join("\n")}\n`,
      stdio: ["pipe", "ignore", "inherit"],
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);

  const moduleCacheRoot = join(temporary, "sagejs", "modules");
  let moduleCount = 0;
  for (const cacheFilename of filesBelow(moduleCacheRoot)) {
    if (!cacheFilename.endsWith(".json")) continue;
    const cached = JSON.parse(readFileSync(cacheFilename, "utf8"));
    const name = moduleName(cached.filename);
    if (!name || typeof cached.javascript !== "string") continue;
    const filenameLiteral = JSON.stringify(cached.filename);
    if (!cached.javascript.includes(filenameLiteral)) {
      throw new Error(`compiled module ${name} does not contain its filename`);
    }
    const javascriptTemplate = cached.javascript.replaceAll(
      filenameLiteral,
      JSON.stringify(filenameMarker),
    );
    writeFileSync(
      join(outputDirectory, `${name.replaceAll(".", "-")}.json`),
      JSON.stringify({
        version: cached.version,
        signature: cached.signature,
        mode: cached.mode,
        module: name,
        javascriptTemplate,
      }),
    );
    moduleCount += 1;
  }

  for (const name of manifest.imports) {
    const expected = join(
      outputDirectory,
      `${name.replaceAll(".", "-")}.json`,
    );
    if (!existsSync(expected)) {
      throw new Error(`precompilation did not produce ${name}`);
    }
  }

  let dynamicCount = 0;
  for (const cacheFilename of filesBelow(dynamicTemporary)) {
    if (!cacheFilename.endsWith(".json")) continue;
    copyFileSync(cacheFilename, join(dynamicOutputDirectory, cacheFilename.split(sep).at(-1)));
    dynamicCount += 1;
  }
  console.log(
    `Precompiled ${moduleCount} lazy Python modules and ` +
      `${dynamicCount} dynamic programs`,
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
