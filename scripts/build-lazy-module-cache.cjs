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
const { createHash } = require("node:crypto");
const {
  LAZY_MODULE_BUNDLE_SCHEMA,
  PRECOMPILED_MODULE_FILENAME,
  PRECOMPILED_PACKAGE_PATH,
  assertLazyModuleName,
  canonicalizeJavascriptTemplate,
  provenanceRecord,
  validateLazyModuleBundle,
} = require("./lazy-module-provenance.cjs");

const root = resolve(__dirname, "..");
const libraryDirectory = join(root, "src", "lib");
const outputDirectory = join(root, "dist", "lazy-module-cache");
const bundleFilename = join(root, "dist", "lazy-modules.json");
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
const taskManifestFilename = "task-runtime-modules.json";
const compilerFilename = join(root, "dist", "compiler", "compiler.js");

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

function digest(algorithm, value) {
  return createHash(algorithm).update(value).digest("hex");
}

function sourceResource(sourceFilename) {
  const resource = relative(libraryDirectory, sourceFilename)
    .split(sep)
    .join("/");
  if (resource.startsWith("../") || resource === "..") {
    throw new Error(`compiled source is outside src/lib: ${sourceFilename}`);
  }
  return resource;
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

function copyCompiledModules(moduleDirectory, taskModules, bundleModules) {
  let count = 0;
  for (const cacheFilename of filesBelow(moduleDirectory)) {
    if (!cacheFilename.endsWith(".json")) continue;
    const cached = JSON.parse(readFileSync(cacheFilename, "utf8"));
    const name = moduleName(cached.filename);
    if (!name || typeof cached.javascript !== "string") continue;
    assertLazyModuleName(name);
    const canonical = canonicalizeJavascriptTemplate({
      name,
      sourceFilename: cached.filename,
      javascript: cached.javascript,
      repositoryRoot: root,
    });
    const source = sourceResource(cached.filename);
    const sourceContents = readFileSync(join(libraryDirectory, source));
    const sourceSignature = digest("sha1", sourceContents);
    if (sourceSignature !== cached.signature) {
      throw new Error(`compiled source signature is stale for ${name}`);
    }
    const resource = cacheResource(name);
    const record = {
      schema: "sagejs.lazy-module-template/v1",
      version: cached.version,
      signature: cached.signature,
      mode: cached.mode,
      module: name,
      package: canonical.package,
      filenameMarker: PRECOMPILED_MODULE_FILENAME,
      packagePathMarker:
        canonical.package ? PRECOMPILED_PACKAGE_PATH : null,
      javascriptTemplate: canonical.javascriptTemplate,
    };
    const recordContents = JSON.stringify(record);
    const outputFilename = join(outputDirectory, resource);
    if (existsSync(outputFilename)) {
      const existing = JSON.parse(readFileSync(outputFilename, "utf8"));
      if (JSON.stringify(existing) !== JSON.stringify(record)) {
        throw new Error(`conflicting precompiled output for ${name}`);
      }
    } else {
      writeFileSync(outputFilename, recordContents);
      count += 1;
    }
    const bundleRecord = {
      resource,
      resourceSha256: digest("sha256", recordContents),
      source,
      sourceSha256: digest("sha256", sourceContents),
      signature: cached.signature,
      version: cached.version,
      mode: cached.mode,
      package: canonical.package,
      filename: canonical.filename,
      packagePath: canonical.packagePath,
      javascriptTemplate: canonical.javascriptTemplate,
    };
    if (Object.hasOwn(bundleModules, name) &&
        JSON.stringify(bundleModules[name]) !== JSON.stringify(bundleRecord)) {
      throw new Error(`conflicting lazy-module provenance for ${name}`);
    }
    bundleModules[name] = bundleRecord;
    if (taskModules) {
      taskModules[name] = {
        resource,
        version: cached.version,
        signature: cached.signature,
        mode: cached.mode,
        package: canonical.package,
        filename: canonical.filename,
        packagePath: canonical.packagePath,
        source,
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
rmSync(bundleFilename, { force: true });
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
      (name) => {
        try {
          assertLazyModuleName(name, `${kind} precompile import`);
          return false;
        } catch (_error) {
          return true;
        }
      }
    )) throw new TypeError(`invalid ${kind} precompile import list`);
  }

  compileImports(
    packageImports,
    packageTemporary,
    packageDynamicTemporary,
  );
  compileImports(taskImports, taskTemporary, taskDynamicTemporary);

  const bundleModules = Object.create(null);
  let moduleCount = copyCompiledModules(
    packageTemporary,
    undefined,
    bundleModules,
  );
  const taskModules = Object.create(null);
  moduleCount += copyCompiledModules(
    taskTemporary,
    taskModules,
    bundleModules,
  );

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
      left < right ? -1 : left > right ? 1 : 0
    ),
  );
  writeFileSync(
    join(outputDirectory, taskManifestFilename),
    JSON.stringify({
      schema: "sagejs.task-runtime-modules/v3",
      compilerSha256: digest("sha256", readFileSync(compilerFilename)),
      roots: [...taskImports].sort(),
      modules: sortedTaskModules,
    }),
  );

  const sortedBundleModules = Object.fromEntries(
    Object.entries(bundleModules).sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0
    ),
  );
  const bundle = {
    schema: LAZY_MODULE_BUNDLE_SCHEMA,
    generator: provenanceRecord(root, __filename),
    config: provenanceRecord(
      root,
      join(__dirname, "precompiled-python-packages.json"),
    ),
    roots: {
      package: [...new Set(packageImports)].sort(),
      taskRuntime: [...new Set(taskImports)].sort(),
    },
    modules: sortedBundleModules,
  };
  validateLazyModuleBundle(bundle, { repositoryRoot: root });
  writeFileSync(bundleFilename, `${JSON.stringify(bundle)}\n`);

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
