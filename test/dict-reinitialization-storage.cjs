// sagejs-test-tier: unit
// sagejs-test-platform: true
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { createSage } = require("../dist/tools/kernel.js");
const fixture = join(__dirname, "fixtures/dict-reinitialization-storage.py");

for (const mode of ["python", "sage"]) {
  test(`dict reinitialization preserves contents and storage (${mode})`, async (context) => {
    const session = await createSage({ mode });
    context.after(() => session.close());
    const result = await session.evaluate(readFileSync(fixture, "utf8"));
    assert.equal(result.stdout.trim(), "dict-reinitialization-storage-ok");
    assert.equal(result.stderr ?? "", "");
    const storage = await session.evaluate(`
import sagejs.runtime as runtime
mapping = {"old": 1}
values = runtime.reflect.get(mapping, "jsmap")
keys = runtime.reflect.get(mapping, "keymap")
dict.__init__(mapping, new=2)
assert runtime.reflect.get(mapping, "jsmap") is values
assert runtime.reflect.get(mapping, "keymap") is keys
assert mapping == {"old": 1, "new": 2}
uninitialized = runtime.object.create(runtime.reflect.get(dict, "prototype"))
dict.__init__(uninitialized, fresh=3)
assert uninitialized == {"fresh": 3}
print("dict-storage-identity-ok")
`);
    assert.equal(storage.stdout.trim(), "dict-storage-identity-ok");
  });
}
