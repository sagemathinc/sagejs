// sagejs-test-tier: unit
// sagejs-test-platform: true
"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join, resolve } = require("node:path");
const Module = require("node:module");
const { spawnSync } = require("node:child_process");
const { transformSync } = require("esbuild");
const { pythonExecutable } = require("../tools/python-executable.cjs");
const { prepareWorkspaceBundles } = require("../tools/native-kernel/workspace-bundles.cjs");

// Compile this checkout's producer in memory; an explicit read-only seed may
// provide its existing parser/AST dependencies before the coordinated build.
const root = join(__dirname, "..");
const seed = resolve(process.env.SAGEJS_KEYWORD_GROUP_COMPILER_ROOT || root);
const sourcePath = join(root, "tools/python/lowerer.ts");
const producer = new Module(sourcePath, module);
producer.filename = sourcePath;
producer.paths = module.paths;
producer.require = name => name.startsWith("./")
  ? require(join(seed, "dist/tools/python", name)) : require(name);
producer._compile(transformSync(readFileSync(sourcePath, "utf8"), {
  loader: "ts", format: "cjs", target: "es2022",
}).code, sourcePath);

async function main() {
  const compiler = require(join(seed, "dist/tools/compiler.js")).default();
  const { PythonCstLowerer } = producer.exports;
  const { createPythonCompilerFrontend } = require(join(seed, "dist/tools/python/compiler-frontend.js"));
  const options = { filename: "<keyword-groups>", for_linting: true, import_dirs: [],
    strict_python_scopes: true, scoped_flags: { dict_literals: true } };
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  const sage = await createPythonCompilerFrontend(compiler, "sage");
  function lower(source, selected = frontend) {
    const syntax = selected.syntax.assertValid(source, options.filename);
    return new PythonCstLowerer(compiler, syntax, { ...options, jsage: selected === sage })
      .lowerModule(selected.parse(source, options)).ast;
  }
  function calls(ast, name) {
    const found = [];
    ast.walk({ _visit(node, descend) {
      if (node instanceof compiler.AST_Call && node.expression.name === name) found.push(node);
      if (descend) descend();
    } });
    return found;
  }
  try {
    const cases = [
      "f(a=effect(1), b=effect(2), **effect(3), c=effect(4), **effect(5))",
      "f(**effect(1), a=effect(2), b=effect(3))",
      "f(a=effect(1), *effect(2), b=effect(3))",
      "f(**effect(1), **effect(2))", "f(a=effect(1))", "f()",
    ];
    const oracle = spawnSync(pythonExecutable(), ["-c", `
import ast, json, sys
assert sys.version_info[:2] == (3, 14)
result = []
for source in json.loads(sys.argv[1]):
    groups = []
    explicit = mapping = 0
    for keyword in ast.parse(source).body[0].value.keywords:
        if keyword.arg is None:
            groups.append(dict(kind="mapping", index=mapping))
            mapping += 1
        else:
            if groups and groups[-1]["kind"] == "explicit":
                groups[-1]["count"] += 1
            else:
                groups.append(dict(kind="explicit", start=explicit, count=1))
            explicit += 1
    result.append(groups)
print(json.dumps(result))
`, JSON.stringify(cases)], { encoding: "utf8" });
    assert.equal(oracle.status, 0, oracle.stderr || String(oracle.error));
    const expected = JSON.parse(oracle.stdout);
    cases.forEach((source, index) => {
      const ast = lower(source);
      const call = calls(ast, "f")[0];
      assert.deepEqual(call.args.keyword_groups, expected[index], source);
      assert.equal(calls(ast, "effect").length, (source.match(/effect\(/g) || []).length,
        "order metadata must not introduce a second expression traversal");
      assert.deepEqual(call.clone().args.keyword_groups, expected[index]);
      assert.deepEqual(JSON.parse(JSON.stringify(call.args.keyword_groups)), expected[index]);
    });
    for (const expression of ["Factory(a=effect(1), **effect(2))", "Factory(**effect(1), a=effect(2))"]) {
      const ast = lower(`R.<x> = ${expression}\n`, sage);
      const call = calls(ast, "Factory")[0];
      const last = call.args.keyword_groups.at(-1);
      assert.equal(last.kind, "explicit");
      assert.equal(call.args.kwargs[last.start + last.count - 1][0].name, "names");
      assert.equal(last.count, expression.startsWith("Factory(**") ? 2 : 1);
    }
    const ast = lower("from sagejs.native import NativeWorkspace, NativeIntegerVector\n" +
      "class Scratch(NativeWorkspace):\n    values: NativeIntegerVector\n" +
      "def project(scratch: Scratch):\n    f(a=effect(1), **effect(2), b=effect(3))\n");
    const fn = ast.body.find(node => node instanceof compiler.AST_Function);
    const projected = prepareWorkspaceBundles(ast.body, compiler, new Map(), "<groups>").lower(fn).fn;
    const originalCall = calls(ast, "f")[0];
    const projectedCall = calls(projected, "f")[0];
    assert.deepEqual(projectedCall.args.keyword_groups, originalCall.args.keyword_groups);
    assert.notEqual(projectedCall.args.keyword_groups, originalCall.args.keyword_groups);
    assert.equal(calls(projected, "effect").length, 3);
    console.log("Ordered keyword producer: CPython groups, one-time traversal, clone, JSON metadata, Sage synthesis, and workspace projection passed.");
  } finally { frontend.close(); sage.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
