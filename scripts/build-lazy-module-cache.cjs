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
const { dirname, join, relative, resolve, sep } = require("node:path");
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
const packageTemporary = join(temporary, "packages");
const taskTemporary = join(temporary, "tasks");
const packageDynamicTemporary = join(temporary, "dynamic-packages");
const taskDynamicTemporary = join(temporary, "dynamic-tasks");
const filenameMarker = "__sagejs_precompiled_module_filename__";
const taskManifestFilename = "task-runtime-modules.json";
const moduleNamePattern =
  /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/;

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

function cacheResource(name) {
  return `${name.replaceAll(".", "-")}.json`;
}

function portableModuleFilename(name, sourceFilename) {
  const normalizedSource = sourceFilename.replaceAll("\\", "/");
  const suffix = normalizedSource.endsWith("/__init__.py")
    ? "/__init__.py"
    : ".py";
  return `/__sagejs_task_modules__/${name.replaceAll(".", "/")}${suffix}`;
}

function compileImports(imports, moduleDirectory, dynamicDirectory) {
  if (imports.length === 0) return;
  const result = spawnSync(
    process.execPath,
    [join(root, "bin", "sagejs"), "--python"],
    {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        XDG_CACHE_HOME: temporary,
        SAGEJS_DYNAMIC_CACHE_DIR: dynamicDirectory,
        SAGEJS_PRECOMPILED_DYNAMIC_CACHE_DIR: join(
          temporary,
          "missing-dynamic",
        ),
        SAGEJS_PRECOMPILED_MODULE_CACHE_DIR: join(
          temporary,
          "missing-modules",
        ),
      },
      input: `${imports.map((name) => `import ${name}`).join("\n")}\n`,
      stdio: ["pipe", "ignore", "inherit"],
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);

  const generated = join(
    temporary,
    "sagejs",
    "modules",
  );
  if (!existsSync(generated)) {
    throw new Error("precompilation did not create a module cache");
  }
  mkdirSync(moduleDirectory, { recursive: true });
  for (const cacheFilename of filesBelow(generated)) {
    if (!cacheFilename.endsWith(".json")) continue;
    const relativeFilename = relative(generated, cacheFilename);
    const destination = join(moduleDirectory, relativeFilename);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(cacheFilename, destination);
  }
  rmSync(generated, { recursive: true, force: true });
}

function copyCompiledModules(moduleDirectory, taskModules) {
  let count = 0;
  for (const cacheFilename of filesBelow(moduleDirectory)) {
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
    const resource = cacheResource(name);
    const record = {
      version: cached.version,
      signature: cached.signature,
      mode: cached.mode,
      module: name,
      javascriptTemplate,
    };
    const outputFilename = join(outputDirectory, resource);
    if (existsSync(outputFilename)) {
      const existing = JSON.parse(readFileSync(outputFilename, "utf8"));
      if (JSON.stringify(existing) !== JSON.stringify(record)) {
        throw new Error(`conflicting precompiled output for ${name}`);
      }
    } else {
      writeFileSync(outputFilename, JSON.stringify(record));
      count += 1;
    }
    if (taskModules) {
      taskModules[name] = {
        resource,
        version: cached.version,
        signature: cached.signature,
        mode: cached.mode,
        filename: portableModuleFilename(name, cached.filename),
      };
    }
  }
  return count;
}

function copyDynamicPrograms(directory) {
  let count = 0;
  for (const cacheFilename of filesBelow(directory)) {
    if (!cacheFilename.endsWith(".json")) continue;
    copyFileSync(
      cacheFilename,
      join(dynamicOutputDirectory, cacheFilename.split(sep).at(-1)),
    );
    count += 1;
  }
  return count;
}

rmSync(outputDirectory, { recursive: true, force: true });
rmSync(dynamicOutputDirectory, { recursive: true, force: true });
mkdirSync(outputDirectory, { recursive: true });
mkdirSync(dynamicOutputDirectory, { recursive: true });

try {
  const packageImports = manifest.imports ?? [];
  const taskImports = manifest.taskRuntimeImports ?? [];
  for (const [kind, imports] of [
    ["package", packageImports],
    ["task-runtime", taskImports],
  ]) {
    if (!Array.isArray(imports) || imports.some(
      (name) => typeof name !== "string" || !moduleNamePattern.test(name)
    )) throw new TypeError(`invalid ${kind} precompile import list`);
  }

  compileImports(
    packageImports,
    packageTemporary,
    packageDynamicTemporary,
  );
  compileImports(taskImports, taskTemporary, taskDynamicTemporary);

  let moduleCount = copyCompiledModules(packageTemporary);
  const taskModules = Object.create(null);
  moduleCount += copyCompiledModules(taskTemporary, taskModules);

  for (const name of [...packageImports, ...taskImports]) {
    const expected = join(
      outputDirectory,
      cacheResource(name),
    );
    if (!existsSync(expected)) {
      throw new Error(`precompilation did not produce ${name}`);
    }
  }

  const sortedTaskModules = Object.fromEntries(
    Object.entries(taskModules).sort(([left], [right]) =>
      left.localeCompare(right)
    ),
  );
  writeFileSync(
    join(outputDirectory, taskManifestFilename),
    JSON.stringify({
      schema: "sagejs.task-runtime-modules/v1",
      roots: [...taskImports].sort(),
      modules: sortedTaskModules,
    }),
  );

  const dynamicCount =
    copyDynamicPrograms(packageDynamicTemporary) +
    copyDynamicPrograms(taskDynamicTemporary);
  console.log(
    `Precompiled ${moduleCount} lazy Python modules and ` +
      `${dynamicCount} dynamic programs; authorized ` +
      `${Object.keys(sortedTaskModules).length} multiprocessing modules`,
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
