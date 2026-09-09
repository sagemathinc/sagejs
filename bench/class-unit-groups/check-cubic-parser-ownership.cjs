"use strict";
// Production compiler stress probe: observe ownership without changing it.
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve, join } = require("node:path");
const { createHash } = require("node:crypto");
const root = resolve(__dirname, "../..");
const [countText = "128", ...extra] = process.argv.slice(2);
const count = Number(countText);
assert.equal(extra.length, 0);
assert(Number.isInteger(count) && count > 0 && count <= 1024);
const memories = [], OriginalMemory = WebAssembly.Memory;
WebAssembly.Memory = class extends OriginalMemory {
  constructor(options) { super(options); memories.push(this); }
};
const { Language, Parser, Tree } = require("web-tree-sitter");
const load = Language.load, parse = Parser.prototype.parse, destroy = Tree.prototype.delete;
let loads = 0, created = 0, deleted = 0;
const live = new Set();
Language.load = function (...args) { loads++; return load.apply(this, args); };
Parser.prototype.parse = function (...args) {
  const tree = parse.apply(this, args);
  if (tree) { created++; live.add(tree); }
  return tree;
};
Tree.prototype.delete = function () {
  assert(live.delete(this), "each compiler tree must be disposed exactly once");
  deleted++; return destroy.call(this);
};
const hash = data => createHash("sha256").update(data).digest("hex");
const sourcePath = join(root, "src/lib/sagejs/number_fields/cubic_class_number_native.py");
const source = readFileSync(sourcePath, "utf8");
const compiler = require(join(root, "dist/tools/compiler.js")).default();
const { createPythonCompilerFrontend } = require(join(root, "dist/tools/python/compiler-frontend.js"));
const provenance = {
  node: process.version, source_sha256: hash(source), driver_sha256: hash(readFileSync(__filename)),
  compiler_inputs: Object.fromEntries([
    "dist/tools/foreign/tree-sitter.js", "dist/tools/python/frontend.js",
    "dist/tools/python/compiler-frontend.js", "dist/tools/python/module-resolver.js",
    "dist/compiler/compiler.js",
  ].map(name => [name, hash(readFileSync(join(root, name)))])),
};
let completed = 0;
const snapshot = () => ({ ...provenance, completed, loads, created, deleted, live: live.size,
  wasm_memory_bytes: memories.map(m => m.buffer.byteLength), rss: process.memoryUsage().rss });
(async () => {
  for (let i = 0; i < count; i++) {
    const frontend = await createPythonCompilerFrontend(compiler, i % 2 ? "python" : "sage");
    try {
      const ast = frontend.parse(source, { filename: sourcePath });
      assert.equal(live.size, 0);
      assert(ast.body.length > 100);
      assert.equal(ast.start.file, sourcePath);
      assert.throws(() => frontend.parse("nonlocal invalid_at_module_level\n"), SyntaxError);
      assert.equal(live.size, 0);
    } finally { frontend.close(); }
    completed++;
    if (completed % 16 === 0) console.log(JSON.stringify(snapshot()));
  }
  assert.equal(loads, 2);
  assert.equal(created, deleted);
  console.log(JSON.stringify({ ...snapshot(), status: "pass" }));
})().catch(error => {
  console.log(JSON.stringify({ ...snapshot(), status: "fail", error: String(error) }));
  process.exitCode = 1;
});
