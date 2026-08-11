"use strict";

const { join } = require("node:path");

function resourceTypes(declaration) {
  return new Set(declaration.resources.map((resource) => resource.python_name));
}

function generatedHostFunctions(declaration, options = {}) {
  const resources = new Map(
    declaration.resources.map((resource) => [resource.python_name, resource]),
  );
  const viewOwners = new Set(
    declaration.resources
      .filter((resource) => resource.owner !== null)
      .map((resource) => resource.owner),
  );
  const eligible = declaration.functions.filter((fn) => [
    fn.signature.return_type,
    ...fn.signature.parameters.map((parameter) => parameter.type),
  ].every((type) => {
    const resource = resources.get(type);
    return resource === undefined ||
      (resource.ownership === "owned" && !viewOwners.has(resource.id));
  }));
  if (options.functionIds === undefined) return eligible;
  if (!Array.isArray(options.functionIds)) {
    throw new TypeError("functionIds must be an array");
  }
  const selected = new Set(options.functionIds);
  const known = new Set(declaration.functions.map((fn) => fn.id));
  for (const id of selected) {
    if (!known.has(id)) {
      throw new Error(`unknown ${declaration.library.id} FFI function ${id}`);
    }
  }
  const result = eligible.filter((fn) => selected.has(fn.id));
  if (result.length !== selected.size) {
    const generated = new Set(result.map((fn) => fn.id));
    const unsupported = Array.from(selected).filter((id) => !generated.has(id));
    throw new Error(
      `selected FFI functions cannot use generated host adapters: ${unsupported.join(", ")}`,
    );
  }
  return result;
}

function generatedHostAdapterPath(root, declaration) {
  const packageName = declaration.library.dynamic.package
    .replace(/^@sagemath\/sagejs-/, "");
  return join(root, "packages", packageName, "generated", "ffi_host.py");
}

function generatedHostAdapterSource(declaration, options = {}) {
  const functions = generatedHostFunctions(declaration, options);
  const moduleName = declaration.library.python_module;
  const resources = resourceTypes(declaration);
  const referencedResources = Array.from(new Set(functions.flatMap((fn) => [
    fn.signature.return_type,
    ...fn.signature.parameters.map((parameter) => parameter.type),
  ]).filter((type) => resources.has(type)))).sort();
  const imported = [
    ...referencedResources.map((name) => `    ${name},`),
    ...functions.map((fn) =>
      `    ${fn.python_name} as _ffi_${fn.python_name},`
    ),
  ].join("\n");
  const types = new Set(["native"]);
  for (const fn of functions) {
    for (const parameter of fn.signature.parameters) {
      if (resources.has(parameter.type)) continue;
      if (["Integer", "IntegerBuffer", "UInt64Buffer", "uint64"].includes(
        parameter.type,
      )) types.add(parameter.type);
    }
    if (!resources.has(fn.signature.return_type) &&
      ["Integer", "IntegerBuffer", "UInt64Buffer", "uint64"].includes(
      fn.signature.return_type,
    )) types.add(fn.signature.return_type);
  }
  const nativeImports = Array.from(types).sort().join(", ");
  const wrappers = functions.map((fn) => {
    const params = fn.signature.parameters.map((parameter) =>
      `    ${parameter.name}: ${parameter.type},`
    ).join("\n");
    const args = fn.signature.parameters.map((parameter) =>
      `        ${parameter.name},`
    ).join("\n");
    return `@native\n` +
      `def ${fn.dynamic.export}(\n${params}\n) -> ` +
      `${fn.signature.return_type}:\n` +
      `    return _ffi_${fn.python_name}(\n${args}\n    )`;
  }).join("\n\n\n");
  return `"""Generated checked host adapters for ${declaration.library.id}.

This file is derived from the CPython-parseable declaration source.  Do not
edit it directly; run \`sagejs ffi generate ${declaration.library.id}\`.
The native compiler lowers these actual typed bodies into one host adapter
whose core calls the declared foreign symbols without a host callback.
"""

from __future__ import annotations

from ${moduleName} import (
${imported}
)
from sagejs.native import ${nativeImports}


${wrappers}
`;
}

module.exports = {
  generatedHostAdapterPath,
  generatedHostAdapterSource,
  generatedHostFunctions,
};
