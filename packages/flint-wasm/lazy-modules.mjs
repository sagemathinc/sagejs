const SCHEMA = "sagejs.lazy-module-bundle/v1";
const VIRTUAL_ROOT = "/__sagejs_lazy_modules__";
const FILENAME_MARKER = `${VIRTUAL_ROOT}/__SAGEJS_MODULE_FILENAME__`;
const PACKAGE_PATH_MARKER = `${VIRTUAL_ROOT}/__SAGEJS_PACKAGE_PATH__`;
const MODULE_NAME =
  /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/;
const SHA1 = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const RESERVED_SEGMENTS = new Set(["__proto__", "prototype", "constructor"]);
const PROVENANCE = Object.freeze({
  generator: "scripts/build-lazy-module-cache.cjs",
  config: "scripts/precompiled-python-packages.json",
});

function plainRecord(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value, expected) {
  if (!plainRecord(value)) return false;
  return JSON.stringify(Object.keys(value).sort()) ===
    JSON.stringify([...expected].sort());
}

function canonicalName(name) {
  return typeof name === "string" &&
    MODULE_NAME.test(name) &&
    name.split(".").every((segment) => !RESERVED_SEGMENTS.has(segment));
}

function canonicalPaths(name, isPackage) {
  const stem = `${VIRTUAL_ROOT}/${name.replaceAll(".", "/")}`;
  return isPackage
    ? { filename: `${stem}/__init__.py`, packagePath: stem }
    : { filename: `${stem}.py`, packagePath: null };
}

function requireDigest(value, pattern, description) {
  if (typeof value !== "string" || !pattern.test(value)) {
    throw new TypeError(`lazy module ${description} is invalid`);
  }
}

export function validateLazyModuleBundle(document) {
  if (
    !exactKeys(document, ["schema", "generator", "config", "roots", "modules"]) ||
    document.schema !== SCHEMA ||
    !plainRecord(document.modules)
  ) {
    throw new TypeError("invalid Sage.js lazy-module bundle");
  }
  for (const provenance of ["generator", "config"]) {
    const record = document[provenance];
    if (!exactKeys(record, ["path", "sha256"]) ||
        record.path !== PROVENANCE[provenance]) {
      throw new TypeError(`lazy module ${provenance} provenance is invalid`);
    }
    requireDigest(record.sha256, SHA256, `${provenance} digest`);
  }
  if (!exactKeys(document.roots, ["package", "taskRuntime"])) {
    throw new TypeError("lazy module roots are invalid");
  }
  const roots = {};
  for (const kind of ["package", "taskRuntime"]) {
    const names = document.roots[kind];
    if (!Array.isArray(names) ||
        JSON.stringify(names) !== JSON.stringify([...new Set(names)].sort()) ||
        names.some((name) => !canonicalName(name))) {
      throw new TypeError(`lazy module ${kind} roots are invalid`);
    }
    roots[kind] = Object.freeze([...names]);
  }
  const names = Object.keys(document.modules);
  if (JSON.stringify(names) !== JSON.stringify([...names].sort())) {
    throw new TypeError("lazy module records are not canonically ordered");
  }
  for (const root of [...roots.package, ...roots.taskRuntime]) {
    if (!Object.hasOwn(document.modules, root)) {
      throw new TypeError(`lazy module root has no record: ${root}`);
    }
  }
  const modules = Object.create(null);
  for (const [name, record] of Object.entries(document.modules)) {
    if (!canonicalName(name) || !exactKeys(record, [
      "resource", "resourceSha256", "source", "sourceSha256", "signature",
      "version", "mode", "package", "filename", "packagePath",
      "javascriptTemplate",
    ])) {
      throw new TypeError(`invalid lazy module name ${JSON.stringify(name)}`);
    }
    const expectedResource = `${name.replaceAll(".", "-")}.json`;
    const expected = canonicalPaths(name, record.package === true);
    const expectedSource = `${name.replaceAll(".", "/")}${
      record.package ? "/__init__" : ""
    }.py`;
    if (
      record.resource !== expectedResource ||
      record.source !== expectedSource ||
      record.version === "" ||
      typeof record.version !== "string" ||
      record.mode !== "python" ||
      typeof record.package !== "boolean" ||
      record.filename !== expected.filename ||
      record.packagePath !== expected.packagePath ||
      typeof record.javascriptTemplate !== "string" ||
      !record.javascriptTemplate.includes(JSON.stringify(FILENAME_MARKER)) ||
      (record.package
        ? !record.javascriptTemplate.includes(JSON.stringify(PACKAGE_PATH_MARKER))
        : record.javascriptTemplate.includes(JSON.stringify(PACKAGE_PATH_MARKER)))
    ) {
      throw new TypeError(`lazy module ${name} has invalid provenance`);
    }
    requireDigest(record.resourceSha256, SHA256, `${name} resource digest`);
    requireDigest(record.sourceSha256, SHA256, `${name} source digest`);
    requireDigest(record.signature, SHA1, `${name} source signature`);
    modules[name] = Object.freeze({ ...record });
  }
  return Object.freeze({
    schema: SCHEMA,
    generator: Object.freeze({ ...document.generator }),
    config: Object.freeze({ ...document.config }),
    roots: Object.freeze(roots),
    modules: Object.freeze(modules),
  });
}

export async function fetchLazyModuleBundle(url) {
  const response = await fetch(String(url));
  if (!response.ok) {
    throw new Error(
      `unable to load Sage.js lazy modules (${response.status})`,
    );
  }
  return validateLazyModuleBundle(await response.json());
}

function importError(globalObject, name) {
  const message = `No module named '${name}'`;
  const ImportErrorClass = globalObject.ImportError;
  if (typeof ImportErrorClass === "function") {
    return new ImportErrorClass(message);
  }
  return Object.assign(new Error(message), { name: "ImportError" });
}

export function installLazyModuleLoader(
  bundle,
  {
    globalObject = globalThis,
    evaluate = globalObject.eval,
    install = (name, value) => {
      globalObject[name] = value;
    },
  } = {},
) {
  const validated = validateLazyModuleBundle(bundle);
  if (typeof evaluate !== "function") {
    throw new TypeError("lazy module evaluator must be callable");
  }
  const load = function loadLazyModule(name) {
    if (!canonicalName(name)) {
      throw new TypeError(`invalid lazy module name ${JSON.stringify(name)}`);
    }
    const registry = globalObject.ρσ_modules;
    if (registry === null || typeof registry !== "object") {
      throw new Error("Sage.js module registry is not initialized");
    }
    if (Object.prototype.hasOwnProperty.call(registry, name)) {
      return registry[name];
    }
    const record = validated.modules[name];
    if (record === undefined) throw importError(globalObject, name);

    const separator = name.lastIndexOf(".");
    const parentName = separator < 0 ? "" : name.slice(0, separator);
    const childName = separator < 0 ? "" : name.slice(separator + 1);
    const parent = parentName ? load(parentName) : undefined;
    if (Object.prototype.hasOwnProperty.call(registry, name)) {
      return registry[name];
    }
    const namespace = Object.create(null);
    registry[name] = namespace;
    if (parent !== undefined && childName) parent[childName] = namespace;
    const previous = globalObject.__sagejs_current_module_namespace__;
    globalObject.__sagejs_current_module_namespace__ = namespace;
    try {
      const javascript = record.javascriptTemplate
        .replaceAll(JSON.stringify(FILENAME_MARKER), JSON.stringify(record.filename))
        .replaceAll(
          JSON.stringify(PACKAGE_PATH_MARKER),
          JSON.stringify(record.packagePath ?? ""),
        );
      Reflect.apply(evaluate, globalObject, [
        `(function(){\n${javascript}\n}).call(globalThis);`,
      ]);
    } catch (error) {
      delete registry[name];
      if (parent !== undefined && childName) delete parent[childName];
      throw error;
    } finally {
      if (previous === undefined) {
        delete globalObject.__sagejs_current_module_namespace__;
      } else {
        globalObject.__sagejs_current_module_namespace__ = previous;
      }
    }
    if (!Object.prototype.hasOwnProperty.call(registry, name)) {
      throw new Error(`lazy module ${name} did not register itself`);
    }
    return registry[name];
  };
  install("__sagejs_load_module__", load);
  return load;
}

export const lazyModuleProtocol = Object.freeze({
  schema: SCHEMA,
  virtualRoot: VIRTUAL_ROOT,
  filenameMarker: FILENAME_MARKER,
  packagePathMarker: PACKAGE_PATH_MARKER,
});
