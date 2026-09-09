// sagejs-test-tier: unit
// sagejs-test-platform: true
"use strict";
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { resolve } = require("node:path");
const test = require("node:test");

function child(body) {
  const result = spawnSync(process.execPath, ["-e", `(${body.toString()})().catch(e => { console.error(e); process.exitCode = 1; })`], {
    cwd: resolve(__dirname, ".."), encoding: "utf8", timeout: 60_000,
  });
  assert.equal(result.status, 0, `${result.error || ""}\n${result.stdout}\n${result.stderr}`);
}

test("grammar loads share concurrent success, retry failure, and clean up failed binding", () => child(async function () {
  const assert = require("node:assert/strict");
  const { Language, Parser } = require("web-tree-sitter");
  const originalLoad = Language.load, originalDelete = Parser.prototype.delete;
  let loads = 0, deleted = 0;
  Language.load = async function (...args) {
    if (++loads === 1) throw new Error("injected grammar load failure");
    return originalLoad.apply(this, args);
  };
  Parser.prototype.delete = function () { deleted++; return originalDelete.call(this); };
  const { createTreeSitterParser } = require("./dist/tools/foreign/tree-sitter.js");
  const failed = await Promise.allSettled(Array.from({ length: 16 }, () => createTreeSitterParser("tree-sitter-python.wasm")));
  assert(failed.every(r => r.status === "rejected" && /injected grammar/.test(r.reason.message)));
  assert.equal(loads, 1);
  const parsers = await Promise.all(Array.from({ length: 32 }, () => createTreeSitterParser("tree-sitter-python.wasm")));
  assert.equal(loads, 2);
  for (const parser of parsers) {
    const tree = parser.parse("answer = 42\n");
    assert.equal(tree.rootNode.hasError, false);
    tree.delete(); parser.delete();
  }
  const originalSet = Parser.prototype.setLanguage;
  Parser.prototype.setLanguage = function () { throw new Error("injected grammar binding failure"); };
  await assert.rejects(createTreeSitterParser("tree-sitter-python.wasm"), /binding failure/);
  assert.equal(deleted, 33);
  Parser.prototype.setLanguage = originalSet;
  const sage = await createTreeSitterParser("tree-sitter-sage.wasm");
  assert.equal(loads, 3);
  sage.delete();
}));

test("syntax clients own returned trees; compiler and rejected trees have all-exit cleanup", () => child(async function () {
  const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), os = require("node:os");
  const { Parser, Tree } = require("web-tree-sitter");
  const parse = Parser.prototype.parse, destroy = Tree.prototype.delete;
  const live = new Set(); let created = 0, deleted = 0;
  Parser.prototype.parse = function (...args) {
    const tree = parse.apply(this, args);
    if (tree) { live.add(tree); created++; }
    return tree;
  };
  Tree.prototype.delete = function () {
    assert(live.delete(this), "tree must be deleted exactly once"); deleted++;
    return destroy.call(this);
  };
  const { createPythonSyntaxFrontend } = require("./dist/tools/python/frontend.js");
  const syntax = await createPythonSyntaxFrontend("python");
  const retained = syntax.assertValid("answer = 42\n");
  const recovered = syntax.parse("def broken(:\n pass\n");
  assert(recovered.diagnostics.length > 0);
  for (const bad of ["def broken(:\n pass\n", "if True:", "def f():\n  pass\n pass\n"]) {
    assert.throws(() => syntax.assertValid(bad)); assert.equal(live.size, 2);
  }
  syntax.close();
  assert.equal(retained.tree.rootNode.text, "answer = 42\n");
  assert.equal(recovered.tree.rootNode.hasError, true);
  retained.tree.delete(); recovered.tree.delete(); assert.equal(live.size, 0);

  const compiler = require("./dist/tools/compiler.js").default();
  const { createPythonCompilerFrontend } = require("./dist/tools/python/compiler-frontend.js");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-parser-lifetime-"));
  try {
    fs.writeFileSync(path.join(directory, "good.py"), "value = 42\n");
    fs.writeFileSync(path.join(directory, "bad_syntax.py"), "def broken(:\n pass\n");
    fs.writeFileSync(path.join(directory, "bad_lowering.py"), "nonlocal value\n");
    for (const mode of ["python", "sage"]) {
      const frontend = await createPythonCompilerFrontend(compiler, mode);
      try {
        for (let i = 0; i < 16; i++) {
          const options = { filename: path.join(directory, "main.py"), import_dirs: [directory] };
          const ast = frontend.parse("import good\nanswer = good.value\n", options);
          assert.equal(live.size, 0);
          const output = new compiler.OutputStream({ omit_baselib: true, beautify: true });
          ast.print(output); assert.match(output.get(), /42/);
          for (const source of ["def broken(:\n pass\n", "nonlocal value\n", "import bad_syntax\n", "import bad_lowering\n"]) {
            assert.throws(() => frontend.parse(source, options), undefined, source);
            assert.equal(live.size, 0, source);
          }
          // Unresolved imports deliberately lower to dynamic runtime imports.
          const dynamic = frontend.parse("import absent_module\n", options);
          assert.equal(dynamic.imports.absent_module.dynamic, true);
          assert.equal(live.size, 0);
        }
      } finally { frontend.close(); }
    }
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  assert(created > 200);
  assert.equal(created, deleted);
}));

test("partial frontend construction and diagnostic failures release their owners", () => child(async function () {
  const assert = require("node:assert/strict");
  const { Parser, Tree } = require("web-tree-sitter");
  const { createPythonCompilerFrontend } = require("./dist/tools/python/compiler-frontend.js");
  const { createPythonSyntaxFrontend } = require("./dist/tools/python/frontend.js");
  const originalSet = Parser.prototype.setLanguage, originalDelete = Parser.prototype.delete;
  let bindings = 0, parsersDeleted = 0;
  Parser.prototype.setLanguage = function (...args) {
    if (++bindings === 2) throw new Error("injected second parser binding failure");
    return originalSet.apply(this, args);
  };
  Parser.prototype.delete = function () { parsersDeleted++; return originalDelete.call(this); };
  await assert.rejects(createPythonCompilerFrontend({}, "sage"), /second parser/);
  assert.equal(parsersDeleted, 2);
  Parser.prototype.setLanguage = originalSet;

  const frontend = await createPythonSyntaxFrontend("python");
  const root = Object.getOwnPropertyDescriptor(Tree.prototype, "rootNode");
  const destroy = Tree.prototype.delete;
  let treesDeleted = 0;
  Tree.prototype.delete = function () { treesDeleted++; return destroy.call(this); };
  Object.defineProperty(Tree.prototype, "rootNode", {
    ...root, get() { throw new Error("injected diagnostic traversal failure"); },
  });
  try {
    assert.throws(() => frontend.parse("answer = 42\n"), /diagnostic traversal/);
    assert.throws(() => frontend.assertValid("answer = 42\n"), /diagnostic traversal/);
    assert.equal(treesDeleted, 2);
  } finally { Object.defineProperty(Tree.prototype, "rootNode", root); }
  const result = frontend.assertValid("answer = 42\n");
  assert.equal(result.tree.rootNode.hasError, false);
  result.tree.delete(); frontend.close();
  assert.equal(treesDeleted, 3);
  assert.equal(parsersDeleted, 3);
}));
