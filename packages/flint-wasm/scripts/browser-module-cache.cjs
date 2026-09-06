"use strict";

// Both browser compiler entry points emit beautified JavaScript. The ordinary
// compiler retains docstrings; dynamic exec/eval uses the compiler's default
// without them. Ship those exact outputs, not the two unused compact variants.
const BROWSER_MODULE_OUTPUT_KEYS = Object.freeze([
  "beautify:true keep_docstrings:true",
  "beautify:true keep_docstrings:false",
]);

function browserModuleCache(cache, name) {
  const outputs = {};
  for (const key of BROWSER_MODULE_OUTPUT_KEYS) {
    if (typeof cache.outputs?.[key] !== "string") {
      throw new Error(`compiled browser module ${name} lacks output ${key}`);
    }
    outputs[key] = cache.outputs[key];
  }
  return { ...cache, outputs };
}

module.exports = { browserModuleCache, BROWSER_MODULE_OUTPUT_KEYS };
