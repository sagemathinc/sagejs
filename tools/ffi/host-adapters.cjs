"use strict";

const { join } = require("node:path");

function resourceTypes(declaration) {
  return new Set(declaration.resources.map((resource) => resource.python_name));
}

function generatedHostFunctions(declaration) {
  const resources = resourceTypes(declaration);
  return declaration.functions.filter((fn) =>
    !resources.has(fn.signature.return_type) &&
    fn.signature.parameters.every((parameter) =>
      !resources.has(parameter.type)
    )
  );
}

function generatedHostAdapterPath(root, declaration) {
  const packageName = declaration.library.dynamic.package
    .replace(/^@sagemath\/sagejs-/, "");
  return join(root, "packages", packageName, "generated", "ffi_host.py");
}

function generatedHostAdapterSource(declaration) {
  const functions = generatedHostFunctions(declaration);
  const moduleName = declaration.library.python_module;
  const imported = functions.map((fn) =>
    `    ${fn.python_name} as _ffi_${fn.python_name},`
  ).join("\n");
  const types = new Set(["native"]);
  for (const fn of functions) {
    for (const parameter of fn.signature.parameters) {
      if (["Integer", "IntegerBuffer", "UInt64Buffer", "uint64"].includes(
        parameter.type,
      )) types.add(parameter.type);
    }
    if (["Integer", "IntegerBuffer", "UInt64Buffer", "uint64"].includes(
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
