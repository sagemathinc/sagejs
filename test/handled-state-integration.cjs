// sagejs-test-tier: integration
"use strict";
const assert = require("node:assert/strict");
const {readFileSync} = require("node:fs");
const {join} = require("node:path");
const {spawnSync} = require("node:child_process");
const test = require("node:test");
const {pythonExecutable} = require("../tools/python-executable.cjs");
const {createSage} = require("../dist/tools/kernel.js");

const cases = [
  ["named default belongs to unowned outer", "def outer():\n    def inner(x=(yield 1)):\n        return x\n    yield inner()\n", [[true, false], [false, undefined]], 0],
  ["lambda default belongs to owned outer", "def outer():\n    try:\n        raise error\n    except Exception:\n        inner = lambda x=(yield 1): x\n        yield inner()\n", [[true, true], [false, undefined]], 1],
  ["nested handler owns only its generator", "def outer():\n    def inner():\n        try:\n            raise error\n        except Exception:\n            yield 1\n    yield from inner()\n", [[true, false], [true, true]], 1],
  ["plain coroutine remains generator without ownership", "async def outer():\n    await child()\n", [[true, false]], 0],
  ["context coroutine retains ownership", "async def outer():\n    async with context:\n        operation()\n", [[true, true]], 1],
];

for (const [name, source, expected, wrappers] of cases) {
  test(`scope/ownership cross-product: ${name}`, async () => {
    const compiler = require("../dist/tools/compiler.js").default();
    const frontend = await require("../dist/tools/python/compiler-frontend.js")
      .createPythonCompilerFrontend(compiler, "python");
    try {
      const ast = frontend.parse(source, {filename: `<${name}>`, for_linting: true, import_dirs: []});
      const seen = new Set();
      const metadata = [];
      const visit = node => {
        if (!node || typeof node !== "object" || seen.has(node)) return;
        seen.add(node);
        if (node instanceof compiler.AST_Lambda) {
          metadata.push([node.is_generator, node.needs_handled_state]);
        }
        for (const [key, value] of Object.entries(node)) {
          if (!["start", "end", "scope", "thedef", "parent_scope"].includes(key)) visit(value);
        }
      };
      visit(ast);
      assert.deepEqual(metadata, expected);
      const output = new compiler.OutputStream({omit_baselib: true, write_name: false,
        private_scope: false, beautify: true, python_attributes: true});
      ast.print(output);
      assert.equal((output.get().match(/ρσ_handled_state\.wrap\(js_generator\./g) ?? []).length, wrappers);
    } finally { frontend.close(); }
  });
}

const source = `
import sys
owned = ValueError("owned")
caller = TypeError("caller")
def values():
    try:
        raise owned
    except ValueError:
        function = lambda value=(yield 1): value
        assert sys.exception() is owned
        yield function()
        def named(value=(yield 2)):
            assert sys.exception() is owned
            return value
        yield named()
        assert sys.exception() is owned
generator = values()
assert next(generator) == 1
assert sys.exception() is None
try:
    raise caller
except TypeError:
    assert generator.send(42) == 42
    assert sys.exception() is caller
    assert next(generator) == 2
    assert sys.exception() is caller
    assert generator.send(43) == 43
    generator.close()
    assert sys.exception() is caller
assert sys.exception() is None
print("handled-scope-integration-ok")
`;
const openFixture = readFileSync(join(__dirname, "fixtures/python-nested-yield-default-open.py"), "utf8");

test("combined default/handler identity and formerly open fixture pass CPython", () => {
  const result = spawnSync(pythonExecutable(), ["-X", "utf8", "-c", source + openFixture],
    {encoding: "utf8", timeout: 30000});
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  assert.equal(result.stdout, "handled-scope-integration-ok\n");
});

for (const mode of ["python", "sage"]) {
  test(`${mode}: combined owned defaults preserve resumer state and final values`, async t => {
    const session = await createSage({mode});
    t.after(() => session.close());
    let stderr = "";
    session.on("stderr", text => { stderr += text; });
    const result = await session.evaluate(source + openFixture);
    assert.equal(result.stdout, "handled-scope-integration-ok\n");
    assert.equal(stderr, "");
  });
}
