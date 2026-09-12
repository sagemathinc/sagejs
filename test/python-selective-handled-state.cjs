// sagejs-test-tier: unit
"use strict";
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { runInNewContext } = require("node:vm");
const { stripTypeScriptTypes } = require("node:module");
const test = require("node:test");
const { createPythonSyntaxFrontend } = require("../dist/tools/python/frontend.js");

// The classifier is exercised from current source, with the real parser.
// This is not a claim that copied/previous compiler artifacts include new emission.
const source = readFileSync(join(__dirname, "../tools/python/handled-state.ts"), "utf8");
const compiled = stripTypeScriptTypes(source).replace(
  "export function generatorNeedsHandledState", "function generatorNeedsHandledState",
) + "\nexports.generatorNeedsHandledState = generatorNeedsHandledState;";
const exportsObject = {};
runInNewContext(compiled, { exports: exportsObject });
const { generatorNeedsHandledState } = exportsObject;

const cases = [
  ["plain yield", "def f():\n    yield 1\n", false],
  ["helper call before yield", "def f():\n    helper()\n    yield current()\n", false],
  ["yield from wrapped child", "def f():\n    yield from child()\n", false],
  ["plain await", "async def f():\n    await child()\n", false],
  ["implicit async-for await", "async def f():\n    async for item in source:\n        consume(item)\n", false],
  ["ordinary loop", "def f(n):\n    for i in range(n):\n        yield i\n", false],
  ["nested handler body excluded", "def f():\n    def inner():\n        try:\n            raise error\n        except Exception:\n            yield 1\n    yield 2\n", false],
  ["nested default is outer expression", "def f():\n    def inner(x=(yield 1)):\n        pass\n    yield 2\n", false],
  ["owned nested default", "def f():\n    try:\n        raise error\n    except Exception:\n        def inner(x=(yield 1)):\n            pass\n", true],
  ["nested decorator evaluated outside body", "def f():\n    @decorate((yield 1))\n    def inner():\n        pass\n    yield 2\n", false],
  ["owned nested decorator", "def f():\n    try:\n        raise error\n    except Exception:\n        @decorate((yield 1))\n        def inner():\n            pass\n", true],
  ["catch selector yields", "def f():\n    try:\n        raise error\n    except (yield ValueError):\n        pass\n", true],
  ["handler exited before yield conservatively retained", "def f():\n    try:\n        operation()\n    except Exception:\n        pass\n    yield 1\n", true],
  ["pending finally", "def f():\n    try:\n        operation()\n    finally:\n        yield 1\n", true],
  ["implicit exceptional async-with exit", "async def f():\n    async with context:\n        operation()\n", true],
  ["owned async-for", "async def f():\n    try:\n        operation()\n    except Exception:\n        async for item in source:\n            pass\n", true],
  ["sync context conservative", "def f():\n    with context:\n        yield 1\n", true],
  ["raw native string", "def f():\n    r'%js yield 1'\n    yield 2\n", true],
  ["raw nested default not skipped", "def f():\n    def inner(x=r'%js native()'):\n        pass\n    yield 2\n", true],
  ["ordinary string conservative", "def f():\n    yield 'hello'\n", true],
  ["class definition conservative", "def f():\n    class C:\n        pass\n    yield 1\n", true],
];

for (const [name, python, expected] of cases) {
  test(`selective ownership proof: ${name}`, async () => {
    const frontend = await createPythonSyntaxFrontend("python");
    try {
      const parsed = frontend.assertValid(python, `<${name}>`);
      try {
        const definition = parsed.tree.rootNode.namedChildren[0];
        assert.equal(generatorNeedsHandledState(definition.childForFieldName("body")), expected);
      } finally { parsed.tree.delete(); }
    } finally { frontend.close(); }
  });
}

test("missing metadata and unknown future syntax cannot earn an exemption", () => {
  assert.equal(generatorNeedsHandledState(null), true);
  assert.equal(generatorNeedsHandledState({ type: "future_statement", namedChildren: [] }), true);
  for (const file of ["functions.py", "loops.py"]) {
    const emitter = readFileSync(join(__dirname, "../src/output", file), "utf8");
    assert.ok(emitter.includes("if self.needs_handled_state is False"));
    assert.ok(emitter.includes("ρσ_handled_state.wrap(js_generator."));
  }
});
