// sagejs-test-tier: integration
"use strict";
const assert = require("node:assert/strict");
const {spawnSync} = require("node:child_process");
const test = require("node:test");
const {createSage} = require("../dist/tools/kernel.js");
const {pythonExecutable} = require("../tools/python-executable.cjs");

const source = `
events = []
class Slot:
    def __get__(self, instance, owner):
        events.append("slot")
        return lambda value: value + 1
class Base:
    __call__ = Slot()
class Child(Base):
    pass
obj = Child()
obj.__call__ = lambda value: -1
def argument():
    events.append("argument")
    return 4
assert (obj if True else None)(argument()) == 5
assert events == ["argument", "slot"]
events.clear()
def bad_argument():
    events.append("argument-error")
    raise ValueError("argument")
try:
    (obj if True else None)(bad_argument())
except ValueError:
    pass
else:
    raise AssertionError("missing argument error")
assert events == ["argument-error"]
class Plain:
    pass
plain = Plain()
plain.__call__ = lambda value: 99
events.clear()
try:
    (plain if True else None)(argument())
except TypeError:
    pass
else:
    raise AssertionError("instance-only callable accepted")
assert events == ["argument"]
print("combined-call-slots-ok")
`;

test("combined compound/type-slot ordering matches CPython", () => {
  const result = spawnSync(pythonExecutable(), ["-X", "utf8", "-c", source], {
    encoding: "utf8", timeout: 30000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "combined-call-slots-ok\n");
  assert.equal(result.stderr, "");
});

for (const mode of ["python", "sage"]) {
  test(`${mode}: compound targets use type slots after arguments`, async (t) => {
    const session = await createSage({mode});
    t.after(() => session.close());
    let stderr = "";
    session.on("stderr", text => { stderr += text; });
    const result = await session.evaluate(source);
    assert.equal(result.stdout, "combined-call-slots-ok\n");
    assert.equal(stderr, "");
  });
}
