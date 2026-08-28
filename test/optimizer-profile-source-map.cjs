// sagejs-test-tier: unit
// sagejs-test-platform: true
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { default: createCompiler } = require("../dist/tools/compiler.js");
const {
  createPythonCompilerFrontend,
} = require("../dist/tools/python/compiler-frontend.js");
const {
  authenticateOptimizerProfileMap,
  CompilerProfileMapCollector,
  semanticAstFingerprint,
  validOptimizerProfileMap,
} = require("../dist/tools/python/optimizer/profile-map.js");

const source = `
def outer(n: int):
    total = 0
    for i in range(n):
        for j in range(i):
            total = total + j
    def inner(m: int):
        while m:
            m = m - 1
        return m
    return total + inner(n)
`;

test("compiler emits balanced nested function and loop spans", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const ast = frontend.parse(source, {
      filename: "src/lib/profile-fixture.py",
      for_linting: true,
      import_dirs: [],
      exact_integer_literals: true,
      strict_python_scopes: true,
      scoped_flags: {
        dict_literals: true,
        overload_getitem: true,
        bound_methods: true,
        sequential_definitions: true,
      },
    });
    const collector = new CompilerProfileMapCollector(
      source,
      "src/lib/profile-fixture.py",
      process.cwd(),
    );
    const output = new compiler.OutputStream({
      omit_baselib: true,
      beautify: true,
      source_map: collector,
      python_attributes: true,
      exact_integers: true,
    });
    ast.print(output);
    const javascript = output.get();
    const map = collector.finish(javascript, "sagejs-profile:///fixture.js");
    assert.ok(validOptimizerProfileMap(map));
    authenticateOptimizerProfileMap(map, javascript, source);
    const functions = map.spans.filter((span) => span.category !== "loop");
    const loops = map.spans.filter((span) => span.category === "loop");
    assert.deepEqual(functions.map((span) => span.identity.qualifiedName), ["outer", "outer.inner"]);
    assert.deepEqual(loops.map((span) => span.identity.range.startLine), [4, 5, 8]);
    assert.ok(loops.every((span) => span.generated.end.offset > span.generated.start.offset));
    assert.ok(loops[1].generated.start.offset > loops[0].generated.start.offset);
    assert.ok(loops[1].generated.end.offset < loops[0].generated.end.offset);
    for (let index = 1; index < map.segments.length; index += 1) {
      assert.ok(
        map.segments[index - 1].generated.end.offset <=
          map.segments[index].generated.start.offset,
      );
    }
    assert.ok(map.segments.some((segment) =>
      segment.mapping.candidates[0].regionId === loops[1].identity.id
    ));

    assert.throws(
      () => authenticateOptimizerProfileMap(map, `${javascript}\n// shifted`, source),
      /stale optimizer profile map/,
    );
    assert.throws(
      () => authenticateOptimizerProfileMap(map, javascript, `${source}\n# shifted`),
      /stale optimizer profile map/,
    );
  } finally {
    frontend.close();
  }
});

test("semantic AST fingerprints ignore provenance without changing literals", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  const options = {
    filename: "/one/checkout/a.py",
    for_linting: true,
    import_dirs: [],
    strict_python_scopes: true,
  };
  try {
    const left = frontend.parse('def f():\n    return "a  b"\n', options).body[0];
    const moved = frontend.parse('def f():\n\n    return "a  b"\n', {
      ...options,
      filename: "/different/checkout/a.py",
    }).body[0];
    const changed = frontend.parse('def f():\n    return "a b"\n', options).body[0];
    assert.equal(semanticAstFingerprint(left), semanticAstFingerprint(moved));
    assert.notEqual(semanticAstFingerprint(left), semanticAstFingerprint(changed));
  } finally {
    frontend.close();
  }
});

test("map collector detects an unbalanced compiler callback", () => {
  const collector = new CompilerProfileMapCollector("pass\n", "fixture.py");
  const node = new (class AST_Function {})();
  node.start = { line: 1, col: 0 };
  collector.push(node, {
    line: 1,
    column: 0,
    offset: 0,
  });
  assert.throws(() => collector.finish("", "fixture.js"), /not balanced/);
});
