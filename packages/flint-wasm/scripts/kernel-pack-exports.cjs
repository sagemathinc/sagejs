"use strict";

const RUNTIME_EXPORT_KEYS = Object.freeze([
  "allocate",
  "deallocate",
  "resultU64",
  "resultFloat64",
  "resultLimbs",
  "resultLength",
  "resultSign",
  "lastMessage",
]);

function requiredRuntimeExports(kernel) {
  return RUNTIME_EXPORT_KEYS.map((key) => {
    const name = kernel.runtime?.[key];
    if (typeof name !== "string" || name.length === 0) {
      throw new Error(
        `compiled Wasm kernel ${kernel.id ?? "<unknown>"} ` +
          `lacks runtime export ${key}`,
      );
    }
    return name;
  });
}

function kernelPackExports(kernels, ownershipExports = []) {
  const exports = [...ownershipExports];
  for (const kernel of kernels) {
    const functions = kernel.functions.filter(
      (fn) => fn.status === "compiled-source",
    );
    if (functions.length === 0) continue;
    exports.push(...requiredRuntimeExports(kernel));
    for (const fn of functions) {
      const name = fn.bridge?.export;
      if (typeof name !== "string" || name.length === 0) {
        throw new Error(
          `compiled Wasm kernel ${kernel.id ?? "<unknown>"}:${fn.name} ` +
            "lacks its call export",
        );
      }
      exports.push(name);
    }
  }
  return [...new Set(exports)].sort();
}

module.exports = {
  RUNTIME_EXPORT_KEYS,
  kernelPackExports,
};
