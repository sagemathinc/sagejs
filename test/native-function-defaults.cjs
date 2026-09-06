// sagejs-test-tier: specialized
"use strict";

const assert = require("node:assert/strict");
const { existsSync, mkdtempSync, writeFileSync } = require("node:fs");
const { createRequire } = require("node:module");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const root = resolve(__dirname, "..");
const requireFromRoot = createRequire(join(root, "package.json"));
const nativeApi = requireFromRoot("@sagemath/sagejs/native");
const { compileKernel } = require(join(root, "tools/native-kernel/compiler.cjs"));
const { removeLoadedNativeCache } = require(join(root, "test/helpers/native-cache-cleanup.cjs"));

const source = `from sagejs.native import native

@native
def add(a: int, b: int = 2) -> int:
    return a + b
`;

test("compiled native functions retain source-owned live defaults", { timeout: 300_000 }, async () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-native-defaults-"));
  const cacheRoot = join(temporary, "native-cache");
  const sourcePath = join(temporary, "native_defaults_witness.py");
  writeFileSync(sourcePath, source);
  try {
    const first = await nativeApi.compile({ sourcePath, cacheRoot });
    const second = await compileKernel({ sourcePath, cacheRoot });
    assert.equal(first.cached, false, "fresh isolated native cache");
    assert.equal(second.cached, true, "same source reuses its compiled artifact");
    assert.equal(second.cacheKey, first.cacheKey);
    assert.equal(second.modulePath, first.modulePath);
    assert.ok(first.addonPath && existsSync(first.addonPath), "actual native addon exists");

    for (const scenario of [
      { name: "native", compiled: "True", available: "True", mode: "native", disable: "0", autoload: "1" },
      { name: "native-disabled", compiled: "True", available: "False", mode: "auto", disable: "1", autoload: "1" },
      { name: "source-only", compiled: "False", available: "None", mode: "auto", disable: "1", autoload: "0" },
    ]) {
      const scriptPath = join(temporary, `${scenario.name}.py`);
      writeFileSync(scriptPath, `import sys
sys.path.insert(0, ${JSON.stringify(temporary)})
from native_defaults_witness import add
from sagejs.native import execution_mode, is_compiled

assert is_compiled(add) is ${scenario.compiled}
assert getattr(add, "nativeAvailable", None) is ${scenario.available}
source = getattr(add, "__sagejs_native_source__", add)
assert not is_compiled(source)
if is_compiled(add):
    assert add.__wrapped__ is source
    assert source is not add
else:
    assert source is add
if getattr(add, "nativeAvailable", False):
    assert execution_mode(add, 3, 4) == "native"

assert add.__defaults__ == (2,)
assert add.__defaults__ is source.__defaults__
assert add(3, 4) == source(3, 4) == 7
assert add(3) == source(3) == 5
assert execution_mode(add, 3) == "dynamic"
assert add(a=3) == 5
assert add(a=3, b=4) == 7
arguments = {"a": 3}
assert add(**arguments) == 5
assert arguments == {"a": 3}

defaults = (10, 20)
add.__defaults__ = defaults
assert add.__defaults__ is source.__defaults__ is defaults
assert add() == source() == 30
assert add(3) == source(3) == 23
assert add(b=7) == 17
assert add(3, 4) == 7

# Type annotations do not enforce Python argument types. A string default
# proves omission/keyword calls use the actual source binder/body, not frozen
# numeric IR defaults or a numerical marshaller which only accepts integers.
source.__defaults__ = ("tail",)
assert add.__defaults__ is source.__defaults__
assert add("head") == source("head") == "headtail"
assert add(a="head") == "headtail"
assert add(a="head", b="end") == "headend"
assert add(3, 4) == 7

add.__defaults__ = None
assert source.__defaults__ is None
for arguments, keywords in [((3,), {}), ((), {"a": 3}), ((), {})]:
    try:
        add(*arguments, **keywords)
    except TypeError:
        pass
    else:
        raise AssertionError("removed default was still consumed")
assert add(3, 4) == source(3, 4) == 7
source.__defaults__ = (8,)
assert add(3) == 11
assert add(a=3) == 11
del add.__defaults__
assert add.__defaults__ is source.__defaults__ is None
try:
    add(3)
except TypeError:
    pass
else:
    raise AssertionError("deleted default was still consumed")
assert add(3, 4) == 7
assert is_compiled(add) is ${scenario.compiled}
assert getattr(add, "nativeAvailable", None) is ${scenario.available}
print("native-defaults-${scenario.name}-ok")
`);
      const result = spawnSync(process.execPath, [
        join(root, "bin/sagejs-source.cjs"), "--python", scriptPath,
      ], {
        cwd: root,
        encoding: "utf8",
        timeout: 90_000,
        maxBuffer: 8 * 1024 * 1024,
        env: {
          ...process.env,
          SAGEJS_NATIVE_CACHE_DIR: cacheRoot,
          XDG_CACHE_HOME: join(temporary, "module-cache", scenario.name),
          SAGEJS_NATIVE_MODE: scenario.mode,
          SAGEJS_NATIVE_DISABLE: scenario.disable,
          SAGEJS_NATIVE_AUTOLOAD: scenario.autoload,
          SAGEJS_NATIVE_REQUIRED: scenario.name === "native" ? "1" : "0",
          SAGEJS_NATIVE_WARN_FALLBACK: "0",
        },
      });
      if (result.error) throw result.error;
      assert.equal(result.status, 0, `${scenario.name}\n${result.stdout}\n${result.stderr}`);
      assert.equal(result.stdout.trim(), `native-defaults-${scenario.name}-ok`);
    }
  } finally {
    removeLoadedNativeCache(temporary);
  }
});
