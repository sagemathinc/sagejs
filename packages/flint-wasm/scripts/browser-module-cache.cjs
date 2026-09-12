"use strict";

// Both browser compiler entry points emit beautified JavaScript. The ordinary
// compiler retains docstrings; dynamic exec/eval uses the compiler's default
// without them. Ship those exact outputs, not the two unused compact variants.
const BROWSER_MODULE_OUTPUT_KEYS = Object.freeze([
  "beautify:true keep_docstrings:true",
  "beautify:true keep_docstrings:false",
]);

// Lossless transport encoding only: neither generated JavaScript nor source
// locations change. The browser restores the exact output strings before the
// compiler sees its normal cache format.
function spliceOutput(baseName, base, target) {
  if (target.length > 64 * 1024 * 1024) return target;
  const lines = base.match(/[^\n]*\n|[^\n]+$/g) || [];
  const other = target.match(/[^\n]*\n|[^\n]+$/g) || [];
  const offsets = [0];
  for (const line of lines) offsets.push(offsets.at(-1) + line.length);
  const index = new Map();
  for (let i = 0; i + 2 < lines.length; ++i) {
    const key = lines.slice(i, i + 3).join("");
    if (key.length >= 64 && !index.has(key)) index.set(key, i);
  }
  const parts = [];
  let literal = "", cursor = 0;
  for (let i = 0; i < other.length;) {
    const position = index.get(other.slice(i, i + 3).join(""));
    if (position === undefined) {
      literal += other[i++];
      continue;
    }
    if (literal) { parts.push(literal); literal = ""; }
    let length = 0;
    while (position + length < lines.length && i + length < other.length &&
        lines[position + length] === other[i + length]) ++length;
    const start = offsets[position], end = offsets[position + length];
    parts.push([start - cursor, end - start]);
    cursor = end;
    i += length;
  }
  if (literal) parts.push(literal);
  const packed = {type: "copy-splice-v1", base: baseName, length: target.length, parts};
  return JSON.stringify(packed).length < JSON.stringify(target).length ? packed : target;
}

function browserModuleCache(cache, name) {
  const outputs = {};
  for (const key of BROWSER_MODULE_OUTPUT_KEYS) {
    if (typeof cache.outputs?.[key] !== "string") {
      throw new Error(`compiled browser module ${name} lacks output ${key}`);
    }
    outputs[key] = cache.outputs[key];
  }
  const base = BROWSER_MODULE_OUTPUT_KEYS[1];
  const target = BROWSER_MODULE_OUTPUT_KEYS[0];
  outputs[target] = spliceOutput(base, outputs[base], outputs[target]);
  return { ...cache, outputs };
}

module.exports = { browserModuleCache, BROWSER_MODULE_OUTPUT_KEYS };
