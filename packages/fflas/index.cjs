"use strict";

const manifest = require("./build/generated-ffi/manifest.json");
const generated = require(`./build/generated-ffi/${manifest.addon}`);
const binding = Object.create(null);

for (const item of manifest.functions) {
  if (typeof generated[item.export] !== "function") {
    throw new Error(`generated FFLAS FFI adapter is missing ${item.export}`);
  }
  binding[item.export] = generated[item.export];
}

Object.defineProperty(binding, "__sagejs_ffi_oracles__", {
  value: Object.freeze(Object.create(null)),
  enumerable: false,
});
Object.defineProperty(binding, "__sagejs_ffi_manifest__", {
  value: Object.freeze(manifest),
  enumerable: false,
});

module.exports = binding;
