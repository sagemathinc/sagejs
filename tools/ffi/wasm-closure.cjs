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
  if (selections === undefined) return registry.libraries;
  if (!Array.isArray(selections) || selections.length === 0) {
    fail("selections must be a nonempty array when supplied");
  }
  return selections.map((selection) => {
    const declaration = registry.byId.get(selection.library);
    if (declaration === undefined) fail(`unknown library ${selection.library}`);
    return declaration;
  });
}

function selectionsFromAdapterInputs(document) {
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

function selectionFor(declaration, selections) {
  if (selections === undefined) return null;
  return selections.find(
    (selection) => selection.library === declaration.library.id,
  ) || null;
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
    ? options.selections : selectionsFromAdapterInputs(options.adapterInputs);
  const declarations = selectedDeclarations(registry, selections);
  const artifacts = new Map();
  const libraries = [];
  for (const declaration of declarations) {
    const selection = selectionFor(declaration, selections);
    const candidates = candidateFunctions(declaration, selection);
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
    const artifact = generatedWasmResourceAdapter(declaration, {
      resourceIds,
      functionIds: accepted.map((fn) => fn.id),
    });
    artifacts.set(declaration.library.id, artifact);
    libraries.push(Object.freeze({
      library: declaration.library.id,
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
