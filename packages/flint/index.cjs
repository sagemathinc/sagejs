"use strict";

const legacy = require("./build/Release/sagejs_flint.node");
const manifest = require("./build/generated-ffi/manifest.json");
const generated = require(`./build/generated-ffi/${manifest.addon}`);
const binding = Object.create(null);

for (const name of Reflect.ownKeys(legacy)) binding[name] = legacy[name];

function publishGenerated(name, description = "adapter") {
  if (typeof generated[name] !== "function") {
    throw new Error(`generated FLINT FFI ${description} is missing ${name}`);
  }
  binding[name] = generated[name];
}

for (const item of manifest.functions) publishGenerated(item.export);
for (const resource of manifest.resources || []) {
  publishGenerated(resource.close_export, "resource close adapter");
  const transfer = resource.host_transfer;
  if (transfer !== undefined) {
    if (transfer.kind !== "copied_bytes") {
      throw new Error(`unsupported FLINT host transfer ${transfer.kind}`);
    }
    publishGenerated(transfer.export, "host transfer adapter");
  }
}

Object.defineProperty(binding, "__sagejs_ffi_manifest__", {
  value: Object.freeze(manifest),
  enumerable: false,
});

/* Diagnostic hard boundaries for architecture tests. Generated declarations
 * remain callable while accidental use of a legacy mathematical N-API surface
 * fails at its first call. */
const forbidMatrix = process.env.SAGEJS_FORBID_MATRIX_NAPI === "1";
const forbidIntegerMatrix = process.env.SAGEJS_FORBID_ZZ_MATRIX_NAPI === "1";
const forbidRationalMatrix = process.env.SAGEJS_FORBID_QQ_MATRIX_NAPI === "1";
const forbidPolynomial = process.env.SAGEJS_FORBID_POLYNOMIAL_NAPI === "1";

function isForbidden(property) {
  if (typeof property !== "string") return false;
  if (forbidMatrix &&
      (property === "nmodMatrix" || property === "nmodMatrixPacked" ||
       /^matrix[A-Z]/.test(property))) return true;
  if (forbidIntegerMatrix &&
      (property === "zzMatrix" || property === "zzMatrixPacked" ||
       property === "zzMatrixExportPacked" ||
       property === "zzMatrixToQQ")) return true;
  if (forbidRationalMatrix &&
      (property === "qqMatrix" || property === "qqMatrixPacked" ||
       property === "qqMatrixExportPacked" ||
       property === "zzMatrixToQQ")) return true;
  return forbidPolynomial &&
    (/^(?:zz|qq|nmod)Poly[A-Z]/.test(property) ||
     /^poly[A-Z]/.test(property));
}

module.exports = forbidMatrix || forbidIntegerMatrix || forbidRationalMatrix ||
    forbidPolynomial
  ? new Proxy(Object.create(null), {
    has(_target, property) {
      return Reflect.has(binding, property);
    },
    get(_target, property) {
      if (isForbidden(property)) {
        return function forbiddenLegacyNapi() {
          throw new Error(`forbidden legacy mathematical N-API call: ${property}`);
        };
      }
      return Reflect.get(binding, property);
    },
  })
  : binding;
