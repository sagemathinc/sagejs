// sagejs-test-tier: unit
// sagejs-test-platform: true
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { createSage } = require("../dist/tools/kernel.js");

const source = `
assert repr(ValueError()) == 'ValueError()'
assert repr(ValueError('x')) == "ValueError('x')"
assert repr(ValueError(1, 'x')) == "ValueError(1, 'x')"
assert repr(ValueError((1,))) == 'ValueError((1,))'
calls = []
class Argument:
    def __init__(self, value):
        self.value = value
    def __repr__(self):
        calls.append(self.value)
        return 'argument-' + self.value
error = ValueError(Argument('a'), Argument('b'))
calls.clear()
assert repr(error) == 'ValueError(argument-a, argument-b)'
assert calls == ['a', 'b']
print('exception-repr-ok')
`;

for (const mode of ["python", "sage"]) {
  test(`exception repr formats arguments once without a singleton tuple comma (${mode})`, async context => {
    const python = spawnSync("python3", ["-c", source], { encoding: "utf8" });
    assert.equal(python.status, 0, python.stderr);
    const session = await createSage({ mode });
    context.after(() => session.close());
    const result = await session.evaluate(source);
    assert.equal(result.stdout, python.stdout);
    assert.equal(result.stderr ?? "", "");
  });
}
