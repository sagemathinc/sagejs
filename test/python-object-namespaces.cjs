// sagejs-test-tier: unit
// sagejs-test-platform: true
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {readFileSync} = require("node:fs");
const {join} = require("node:path");
const {createSage} = require("../dist/tools/kernel.js");
for (const mode of ["python", "sage"]) {
  test(`object slots and namespace ownership (${mode})`, async context => {
    const session = await createSage({mode});
    context.after(() => session.close());
    const result = await session.evaluate(readFileSync(join(__dirname, "fixtures/python-object-namespaces.py"), "utf8"));
    assert.equal(result.stdout.trim(), "object-namespaces-ok");
    assert.equal(result.stderr ?? "", "");
    const native = await session.evaluate(`
import sagejs.runtime as runtime
native_instance = A()
native_instance.x = 16
runtime.reflect.set(native_instance, "native_private", 19)
assert runtime.reflect.get(native_instance, "x") == 16
native_namespace = native_instance.__dict__
assert runtime.reflect.get(native_instance, "x") == 16
assert "native_private" not in native_namespace
native_namespace["y"] = 17
assert runtime.reflect.get(native_instance, "y") == 17
runtime.reflect.set(native_instance, "z", 18)
assert native_instance.z == 18 and native_namespace["z"] == 18
assert "x" not in runtime.object.getOwnPropertyNames(native_instance)
def native_own_method():
    return 20
def native_replacement_method():
    return 21
native_namespace["method"] = native_own_method
assert runtime.reflect.get(native_instance, "method") is native_own_method
runtime.reflect.set(native_instance, "method", native_replacement_method)
assert native_namespace["method"] is native_replacement_method
assert native_instance.method() == 21
del native_instance.__dict__
assert runtime.reflect.get(native_instance, "native_private") == 19
assert "x" not in dir(native_instance)
print("native-namespace-ok")
`);
    assert.equal(native.stdout.trim(), "native-namespace-ok");
    assert.equal(native.stderr ?? "", "");
  });
}
