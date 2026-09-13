// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { join } = require("node:path");

const { createSage } = require("../dist/tools/kernel.js");

function assertDirectDictionaryInitializer(source) {
  // Imported module factories may legitimately use `.call(this)`. The
  // optimization contract concerns the fixture's own assignment, not those
  // dependencies. Require a direct literal call, rather than merely finding
  // that helper somewhere in the complete emitted program.
  const assignments = [...source.matchAll(
    /^[\t ]*(?:\$ρσ\$py\$)?dictionary_literal_codegen_target\s*=(?!=)([^\n]*)$/gm,
  )];
  assert.equal(assignments.length, 1, "exactly one fixture initializer must be present");
  assert.match(assignments[0][1], /^\s*ρσ_dict_literal\(\[[^\n]*\]\);\s*$/);
}

test("dictionary initializer assertion distinguishes dependencies from its target", () => {
  const dependency = "function dependency() { return other.call(this); }\n";
  assertDirectDictionaryInitializer(dependency +
    '$ρσ$py$dictionary_literal_codegen_target = ρσ_dict_literal([1, "first", true, "last"]);\n');
  assertDirectDictionaryInitializer('dictionary_literal_codegen_target = ρσ_dict_literal([1, "value"]);\n');
  for (const source of [
    'dictionary_literal_codegen_target = (function() { return ρσ_dict_literal([1, "value"]); }).call(this);\n',
    'dependency = ρσ_dict_literal([1, "value"]);\ndictionary_literal_codegen_target = old_literal();\n',
    'dictionary_literal_codegen_target = wrap(ρσ_dict_literal([1, "value"]));\n',
    'dictionary_literal_codegen_target = ρσ_dict_literal([]);\ndictionary_literal_codegen_target = old_literal();\n',
    'dependency = ρσ_dict_literal([1, "value"]);\n',
  ]) {
    assert.throws(() => assertDirectDictionaryInitializer(source), assert.AssertionError);
  }
});

test("the compiler lowers nonempty dictionary literals without an IIFE", () => {
  const compiled = spawnSync(
    process.execPath,
    ["bin/sagejs", "compile", "--python", "--omit-baselib", "--bare"],
    {
      cwd: join(__dirname, ".."),
      input: "dictionary_literal_codegen_target = {1: 'first', True: 'last'}\n",
      encoding: "utf8",
    },
  );
  assert.equal(compiled.status, 0, compiled.stderr);
  assertDirectDictionaryInitializer(compiled.stdout);
});

test("native dictionary construction preserves Python mapping semantics", async (t) => {
  const session = await createSage({ mode: "python" });
  t.after(() => session.close());
  const result = await session.evaluate([
    "empty = {}",
    "value = {1: 'first', True: 'last', 'x': 3}",
    "print(empty, type(empty) is dict, value, len(value))",
    "print(dict([('a', 1)], b=2))",
  ].join("\n"));
  assert.equal(result.stdout.trim(), [
    "{} True {1: 'last', 'x': 3} 2",
    "{'a': 1, 'b': 2}",
  ].join("\n"));
});

test("exact-dict mutation defers to dictionary subclass overrides", async (t) => {
  const session = await createSage({ mode: "python" });
  t.after(() => session.close());
  const result = await session.evaluate([
    "plain = {}",
    "plain['x'] = 5",
    "print(plain)",
    "class Observed(dict):",
    "    def __setitem__(self, key, value):",
    "        self.seen = (key, value)",
    "value = Observed()",
    "value['x'] = 7",
    "print(value, value.seen)",
  ].join("\n"));
  assert.equal(result.stdout.trim(), "{'x': 5}\n{} ('x', 7)");
});

test("dictionary fast paths agree with CPython on keys and construction", async (t) => {
  const source = `
keys = [True, 1, 1.0, False, 0, -0.0, 2**70, float(2**70), 'x', (1, 2)]
d = {}
for index, key in enumerate(keys):
    d[key] = index
print(list(d.items()))
print([d[key] for key in keys])
print(dict(), dict(a=1), dict({'a': 1}, a=2, b=3))
print(dict(iter([('x', 1), ('x', 2), ('y', 3)])))
for source in [None, 7, [('a',)], [('a', 1, 2)]]:
    try:
        dict(source)
    except (TypeError, ValueError) as error:
        print(type(error).__name__)
events = []
def note(value):
    events.append(value)
    return value
d = {note('a'): note(1), note('b'): note(2), note('a'): note(3)}
print(events, list(d.items()))
d = {**d, 'c': 4}
print(list(d.items()))
`;
  // Captured from CPython; running this regression requires only Sage.js.
  const expected = [
    "[(True, 2), (False, 5), (1180591620717411303424, 7), ('x', 8), ((1, 2), 9)]",
    "[2, 2, 2, 5, 5, 5, 7, 7, 8, 9]",
    "{} {'a': 1} {'a': 2, 'b': 3}",
    "{'x': 2, 'y': 3}",
    "TypeError", "TypeError", "ValueError", "ValueError",
    "['a', 1, 'b', 2, 'a', 3] [('a', 3), ('b', 2)]",
    "[('a', 3), ('b', 2), ('c', 4)]",
  ].join("\n");
  const session = await createSage({ mode: "python" });
  t.after(() => session.close());
  const actual = await session.evaluate(source);
  assert.equal(actual.stdout.trim(), expected);
});
