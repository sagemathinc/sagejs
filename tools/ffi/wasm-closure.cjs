"use strict";

const { createHash } = require("node:crypto");
const { generatedWasmResourceAdapter } = require("./wasm-adapters.cjs");

function fail(message) {
  throw new Error(`generated Wasm FFI closure: ${message}`);
}

function resourceIdsForFunctions(declaration, functions) {
  const byType = new Map(
    declaration.resources.map((resource) => [resource.python_name, resource]),
  );
  const byId = new Map(
    declaration.resources.map((resource) => [resource.id, resource]),
  );
  const ids = new Set();
  for (const fn of functions) {
    for (const type of [
      fn.signature.return_type,
      ...fn.signature.parameters.map((parameter) => parameter.type),
    ]) {
      const resource = byType.get(type);
      if (resource !== undefined) ids.add(resource.id);
    }
  }
  for (const id of Array.from(ids)) {
    let resource = byId.get(id);
    while (resource?.owner !== null && resource?.owner !== undefined) {
      ids.add(resource.owner);
      resource = byId.get(resource.owner);
    }
  }
  return declaration.resources
    .filter((resource) => ids.has(resource.id))
    .map((resource) => resource.id);
}

function selectedDeclarations(registry, selections) {
  if (selections === undefined) {
    return registry.libraries.map((declaration) => ({ declaration, selection: null }));
  }
  if (!Array.isArray(selections) || selections.length === 0) {
    fail("selections must be a nonempty array when supplied");
  }
  const modules = new Set();
  return selections.map((selection) => {
    const declaration = registry.byId.get(selection.library);
    if (declaration === undefined) fail(`unknown library ${selection.library}`);
    const module = selection.module || declaration.library.id;
    if (!/^[a-z][a-z0-9-]*$/.test(module) || modules.has(module)) {
      fail(`invalid or duplicate ownership module ${module}`);
    }
    modules.add(module);
    return { declaration, selection };
  });
}

function selectionsFromAdapterInputs(document, registry) {
  if (["sagejs.wasm-adapter-inputs/v2", "sagejs.wasm-adapter-inputs/v3"].includes(document?.schema)) {
    if (document.policy !== "all-declared-wasm" || registry === undefined ||
        document.modules === null || typeof document.modules !== "object" ||
        Array.isArray(document.modules)) fail("invalid complete adapter-input document");
    const groups = Object.entries(document.modules).map(([module, entry]) => {
      if (entry === null || typeof entry !== "object" ||
          typeof entry.declaration !== "string" ||
          typeof entry.ownershipDomain !== "string" ||
          (document.schema.endsWith("/v2") && (module !== entry.declaration || entry.functions !== undefined))) {
        fail(`invalid adapter-input module ${module}`);
      }
      const declaration = registry.byId.get(entry.declaration);
      if (declaration === undefined) fail(`unknown library ${entry.declaration}`);
      const selection = { library: entry.declaration, module,
        ownershipDomain: entry.ownershipDomain, functionIds: entry.functions };
      if (selection.functionIds !== undefined) candidateFunctions(declaration, selection);
      return selection;
    });
    // One remainder group per library owns all functions not assigned to an
    // explicit specialist. Full coverage is checked after adapter generation.
    const defaults = new Set();
    for (const group of groups) {
      if (group.functionIds !== undefined) continue;
      if (defaults.has(group.library)) fail(`multiple remainder groups for ${group.library}`);
      defaults.add(group.library);
      const selected = new Set(groups.filter((other) => other.library === group.library && other !== group)
        .flatMap((other) => other.functionIds || []));
      group.functionIds = registry.byId.get(group.library).functions
        .filter((fn) => fn.targets.wasm && !selected.has(fn.id)).map((fn) => fn.id);
    }
    return groups;
  }
  if (document?.schema !== "sagejs.wasm-adapter-inputs/v1" ||
      document.modules === null || typeof document.modules !== "object" ||
      Array.isArray(document.modules)) {
    fail("invalid sagejs.wasm-adapter-inputs/v1 document");
  }
  return Object.entries(document.modules).map(([module, entry]) => {
    if (entry === null || typeof entry !== "object" ||
        entry.declaration !== module ||
        typeof entry.ownershipDomain !== "string" ||
        !Array.isArray(entry.resources) || !Array.isArray(entry.functions)) {
      fail(`invalid adapter-input module ${module}`);
    }
    return Object.freeze({
      library: entry.declaration,
      module,
      ownershipDomain: entry.ownershipDomain,
      resourceIds: Object.freeze([...entry.resources]),
      functionIds: Object.freeze([...entry.functions]),
    });
  });
}

function candidateFunctions(declaration, selection) {
  const candidates = declaration.functions.filter(
    (fn) => fn.targets.wasm === true,
  );
  if (selection?.functionIds === undefined) return candidates;
  if (!Array.isArray(selection.functionIds) ||
      selection.functionIds.length === 0) {
    fail(`${declaration.library.id}.functionIds must be a nonempty array`);
  }
  const wanted = new Set(selection.functionIds);
  const known = new Map(declaration.functions.map((fn) => [fn.id, fn]));
  for (const id of wanted) {
    const fn = known.get(id);
    if (fn === undefined) fail(`unknown ${declaration.library.id} function ${id}`);
    if (fn.targets.wasm !== true) {
      fail(`${declaration.library.id} function ${id} is not declared for Wasm`);
    }
  }
  return candidates.filter((fn) => wanted.has(fn.id));
}

function probeFunction(declaration, fn) {
  const resources = resourceIdsForFunctions(declaration, [fn]);
  try {
    generatedWasmResourceAdapter(declaration, {
      resourceIds: resources,
      functionIds: [fn.id],
    });
    return null;
  } catch (error) {
    return String(error?.message || error);
  }
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map(
    (key) => [key, canonical(value[key])],
  ));
}

/**
 * Build the declaration-derived linker and adapter closure consumed by the
 * distribution build. Unsupported declared-Wasm functions remain explicit
 * facts; `strict` turns those facts into a release gate.
 */
function generatedWasmClosure(registry, options = {}) {
  if (options.selections !== undefined && options.adapterInputs !== undefined) {
    fail("supply selections or adapterInputs, not both");
  }
  const selections = options.adapterInputs === undefined
    ? options.selections : selectionsFromAdapterInputs(options.adapterInputs, registry);
  const declarations = selectedDeclarations(registry, selections);
  const artifacts = new Map();
  const libraries = [];
  const functionsOwned = new Set();
  const resourcesOwned = new Map();
  for (const { declaration, selection } of declarations) {
    const module = selection?.module || declaration.library.id;
    const moduleMetadata = module === declaration.library.id ? {} : { module };
    const candidates = candidateFunctions(declaration, selection);
    for (const fn of candidates) {
      const identity = `${declaration.library.id}:${fn.id}`;
      if (functionsOwned.has(identity)) fail(`function ${identity} belongs to multiple modules`);
      functionsOwned.add(identity);
    }
    const rejected = [];
    const accepted = [];
    for (const fn of candidates) {
      const reason = probeFunction(declaration, fn);
      if (reason === null) accepted.push(fn);
      else rejected.push(Object.freeze({ id: fn.id, reason }));
    }
    if (options.strict === true && rejected.length !== 0) {
      fail(`${declaration.library.id} has unsupported declared-Wasm ` +
        `functions: ${rejected.map((item) => item.id).join(", ")}`);
    }
    if (accepted.length === 0) {
      libraries.push(Object.freeze({
        library: declaration.library.id,
        ...moduleMetadata,
        ownership_domain: selection?.ownershipDomain || declaration.library.id,
        declaration: declaration.identity,
        resources: Object.freeze([]),
        functions: Object.freeze([]),
        rejected: Object.freeze(rejected),
        exports: Object.freeze([]),
        headers: Object.freeze([]),
        dependencies: Object.freeze([]),
      }));
      continue;
    }
    const inferredResources = resourceIdsForFunctions(declaration, accepted);
    const explicitlySelected = selection?.resourceIds;
    const resourceIds = explicitlySelected === undefined
      ? inferredResources
      : Array.from(new Set([...explicitlySelected, ...inferredResources]));
    for (const id of resourceIds) {
      const identity = `${declaration.library.id}:${id}`;
      const owner = resourcesOwned.get(identity);
      if (owner !== undefined) {
        fail(`resource ${identity} crosses ownership modules ${owner} and ${module}`);
      }
      resourcesOwned.set(identity, module);
    }
    const artifact = generatedWasmResourceAdapter(declaration, {
      resourceIds,
      functionIds: accepted.map((fn) => fn.id),
    });
    artifacts.set(module, artifact);
    libraries.push(Object.freeze({
      library: declaration.library.id,
      ...moduleMetadata,
      ownership_domain: selection?.ownershipDomain || declaration.library.id,
      declaration: declaration.identity,
      resources: Object.freeze(resourceIds),
      functions: Object.freeze(accepted.map((fn) => fn.id)),
      rejected: Object.freeze(rejected),
      exports: artifact.manifest.exports,
      headers: Object.freeze(
        Array.from(new Set(declaration.library.native.headers)).sort(),
      ),
      dependencies: Object.freeze(
        Array.from(new Set(declaration.library.native.dependencies)).sort(),
      ),
    }));
  }
  if (options.requireComplete === true || options.adapterInputs?.policy === "all-declared-wasm") {
    const included = new Set(libraries.flatMap((library) =>
      library.functions.map((id) => `${library.library}:${id}`),
    ));
    for (const { declaration } of declarations) {
      for (const fn of declaration.functions.filter((fn) => fn.targets.wasm === true)) {
        const identity = `${declaration.library.id}:${fn.id}`;
        if (!included.has(identity)) fail(`complete closure omits ${identity}`);
      }
    }
  }
  const manifestBase = {
    schema: "sagejs.ffi/wasm-production-closure-v1",
    protocol: {
      wasm: "wasm32-wasip1-reactor",
      handles: "generation-tagged-module-local-u64",
      packed_buffers: "little-endian-copy-in-transactional-copy-out",
      views: "borrowed-root-retained-and-invalidated",
      memory_growth: "no-retained-linear-memory-views",
      statuses: "bounded-six-code-domain",
    },
    libraries,
  };
  const hash = createHash("sha256")
    .update(JSON.stringify(canonical(manifestBase)))
    .digest("hex");
  const manifest = Object.freeze({ ...manifestBase, hash });
  return Object.freeze({
    manifest,
    manifestSource: `${JSON.stringify(manifest, null, 2)}\n`,
    artifacts,
  });
}

module.exports = {
  generatedWasmClosure,
  resourceIdsForFunctions,
  selectionsFromAdapterInputs,
};
