#!/usr/bin/env node
// Fail-closed structural check for the production class-group reactor.

import fs from "node:fs";

const file = process.argv[2];
if (!file) throw new Error("usage: verify-wasm.mjs ARTIFACT.wasm");
const bytes = fs.readFileSync(file);
if (bytes.length > 7 * 1024 * 1024) {
  throw new Error(`class-group Wasm exceeds 7 MiB: ${bytes.length} bytes`);
}
const module = new WebAssembly.Module(bytes);
const imports = WebAssembly.Module.imports(module);
if (imports.some(({ kind }) => kind === "memory")) {
  throw new Error("class-group Wasm must not import memory");
}
const exports = new Set(WebAssembly.Module.exports(module).map(({ name }) => name));
for (const name of [
  "memory",
  "sagejs_class_group_abi_version",
  "sagejs_class_group_alloc",
  "sagejs_class_group_dealloc",
  "sagejs_class_group_run_json",
]) {
  if (!exports.has(name)) throw new Error(`class-group Wasm export missing: ${name}`);
}

let cursor = 8;
function uleb() {
  let value = 0;
  let shift = 0;
  while (cursor < bytes.length) {
    const byte = bytes[cursor++];
    value += (byte & 0x7f) * 2 ** shift;
    if ((byte & 0x80) === 0) return value;
    shift += 7;
    if (shift > 49) throw new Error("oversized Wasm unsigned LEB128 value");
  }
  throw new Error("truncated Wasm unsigned LEB128 value");
}

let memories = [];
while (cursor < bytes.length) {
  const id = bytes[cursor++];
  const size = uleb();
  const end = cursor + size;
  if (end > bytes.length) throw new Error("truncated Wasm section");
  if (id === 5) {
    const count = uleb();
    for (let index = 0; index < count; index += 1) {
      const flags = uleb();
      const initial = uleb();
      const maximum = flags & 1 ? uleb() : undefined;
      memories.push({ flags, initial, maximum });
    }
  }
  cursor = end;
}
if (
  memories.length !== 1 ||
  memories[0].flags !== 1 ||
  memories[0].initial !== 256 ||
  memories[0].maximum !== 4096
) {
  throw new Error(`unexpected class-group memory contract: ${JSON.stringify(memories)}`);
}
console.log(JSON.stringify({
  artifact: file,
  bytes: bytes.length,
  importedMemories: 0,
  memories,
}));

