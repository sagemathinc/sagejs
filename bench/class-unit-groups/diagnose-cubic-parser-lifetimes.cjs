"use strict";
// Read-only diagnostic; changes no production source or generated artifact.
const assert = require("node:assert/strict"), fs = require("node:fs");
const crypto = require("node:crypto"), path = require("node:path");
const [mode, countText = "256", workload = "small", ...extra] = process.argv.slice(2);
assert.equal(extra.length, 0);
const root = path.resolve(__dirname, "../..");
assert(["baseline", "cache", "delete", "both"].includes(mode));
assert(["small", "cubic"].includes(workload));
const count = Number(countText); assert(Number.isInteger(count) && count > 0 && count <= 1024);
const memories = [], OriginalMemory = WebAssembly.Memory;
WebAssembly.Memory = class extends OriginalMemory {
  constructor(options) { super(options); memories.push(this); }
};
const { Language } = require("web-tree-sitter");
const load = Language.load, languages = new Map();
let requests = 0, loads = 0;
Language.load = async function (bytes) {
  requests++;
  const key = crypto.createHash("sha256").update(bytes).digest("hex");
  if (mode === "cache" || mode === "both") {
    if (!languages.has(key)) { loads++; languages.set(key, load.call(this, bytes)); }
    return languages.get(key);
  }
  loads++; return load.call(this, bytes);
};
const frontendPath = path.join(root, "dist/tools/python/frontend.js");
const { createPythonSyntaxFrontend } = require(frontendPath);
const source = workload === "small" ? "def f(x):\n    return x + 1\n" :
  fs.readFileSync(path.join(root, "src/lib/sagejs/number_fields/cubic_class_number_native.py"), "utf8");
const hash = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const provenance = { diagnostic_only: true, production_fix: false,
  node: process.version, source_sha256: hash(source),
  frontend_sha256: hash(fs.readFileSync(frontendPath)),
  driver_sha256: hash(fs.readFileSync(__filename)) };
let completed = 0;
const snapshot = () => ({ ...provenance, mode, workload, completed, requests, loads,
  wasm_memory_bytes: memories.map(m => m.buffer.byteLength), rss: process.memoryUsage().rss });
(async () => {
  for (let i = 0; i < count; i++) {
    const frontend = await createPythonSyntaxFrontend(i % 2 ? "python" : "sage");
    const parsed = frontend.assertValid(source);
    assert.equal(parsed.diagnostics.length, 0);
    if (mode === "delete" || mode === "both") parsed.tree.delete();
    frontend.close(); completed++;
    if (completed % 32 === 0) console.log(JSON.stringify(snapshot()));
  }
  console.log(JSON.stringify({ ...snapshot(), status: "pass" }));
})().catch(error => { console.log(JSON.stringify({ ...snapshot(), status: "fail", error: String(error) })); process.exitCode = 1; });
