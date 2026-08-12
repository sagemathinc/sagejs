"use strict";

const manifest = require("./build/generated-ffi/manifest.json");
const generated = require(`./build/generated-ffi/${manifest.addon}`);
const binding = Object.create(null);

for (const item of manifest.functions) {
  if (typeof generated[item.export] !== "function") {
    throw new Error(`generated M4RI FFI adapter is missing ${item.export}`);
  }
  binding[item.export] = generated[item.export];
}
for (const resource of manifest.resources || []) {
  const close = resource.close_export;
  if (typeof generated[close] !== "function") {
    throw new Error(`generated M4RI FFI adapter is missing ${close}`);
  }
  binding[close] = generated[close];
  if (resource.host_transfer !== undefined) {
    binding[resource.host_transfer.export] =
      generated[resource.host_transfer.export];
  }
  if (resource.host_ingress !== undefined) {
    binding[resource.host_ingress.export] = generated[resource.host_ingress.export];
  }
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
