"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { mkdtempSync, readFileSync, writeFileSync } = require("node:fs");
const { createServer } = require("node:http");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawn } = require("node:child_process");
const test = require("node:test");
const { zipSync, strToU8 } = require("fflate");

const { runPackageCli } = require("../dist/tools/python-packages.js");

function child(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const process = spawn(command, args, options);
    let stdout = "";
    let stderr = "";
    process.stdout.on("data", (data) => stdout += data);
    process.stderr.on("data", (data) => stderr += data);
    process.on("error", reject);
    process.on("close", (status) => resolve({ status, stdout, stderr }));
    if (options.input) process.stdin.end(options.input);
  });
}

test("pure wheel installation feeds the default Sage.js import path", async (t) => {
  const wheelName = "sagejs_demo-1.0-py3-none-any.whl";
  const wheel = zipSync({
    "sagejs_demo/__init__.py": strToU8(
      "value = 42\n\ndef greet(name):\n    return 'hello ' + name\n",
    ),
    "sagejs_demo-1.0.dist-info/METADATA": strToU8(
      "Metadata-Version: 2.1\nName: sagejs-demo\nVersion: 1.0\n",
    ),
    "sagejs_demo-1.0.dist-info/WHEEL": strToU8(
      "Wheel-Version: 1.0\nRoot-Is-Purelib: true\nTag: py3-none-any\n",
    ),
  });
  const digest = createHash("sha256").update(wheel).digest("hex");
  const server = createServer((request, response) => {
    if (request.url === "/pypi/sagejs-demo/1.0/json") {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        info: { name: "sagejs-demo", version: "1.0", requires_dist: [] },
        urls: [{
          filename: wheelName,
          packagetype: "bdist_wheel",
          url: `http://127.0.0.1:${server.address().port}/${wheelName}`,
          digests: { sha256: digest },
        }],
      }));
      return;
    }
    if (request.url === `/${wheelName}`) {
      response.end(wheel);
      return;
    }
    response.statusCode = 404;
    response.end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());

  const target = mkdtempSync(join(tmpdir(), "sagejs-packages-"));
  await runPackageCli({
    files: ["install", "sagejs-demo==1.0"],
    target,
    index_url: `http://127.0.0.1:${server.address().port}/pypi`,
  });
  assert.match(
    readFileSync(join(target, "sagejs_demo", "__init__.py"), "utf8"),
    /value = 42/,
  );

  const result = await child(
    process.execPath,
    [join(__dirname, "..", "bin", "sagejs-source.cjs"), "--python"],
    {
      env: { ...process.env, SAGEJS_SITE_PACKAGES: target },
      input: "import sagejs_demo\nprint(sagejs_demo.greet('world'))\n",
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "hello world");
});

test("package-facing Python introspection and scope semantics", async () => {
  const source = [
    "import traceback",
    "import types",
    "class Example:",
    "    pass",
    "def identity(value):",
    "    return value",
    "assert isinstance(identity, types.FunctionType)",
    "assert not isinstance(Example, types.FunctionType)",
    "assert isinstance(Example, type)",
    "assert identity.__doc__ is None",
    "assert identity.__annotations__ == {}",
    "assert identity.__kwdefaults__ is None",
    "assert identity.__dict__ == {}",
    "identity.custom_attribute = 17",
    "assert identity.__dict__ == {'custom_attribute': 17}",
    "assert (False & False) is False",
    "assert (False | True) is True",
    "assert (True ^ True) is False",
    "assert abs(((1 << 100) ** 0.5) - 2 ** 50) < 1e-9",
    "assert int(1e30) // 2 > 0",
    "try:",
    "    int(float('inf'))",
    "except OverflowError:",
    "    pass",
    "else:",
    "    raise AssertionError('int(infinity) must fail')",
    "class ChainedTarget:",
    "    pass",
    "first = ChainedTarget()",
    "second = ChainedTarget()",
    "marker = ChainedTarget()",
    "first.child = ChainedTarget()",
    "second.child = ChainedTarget()",
    "first.child.value = second.child.value = marker",
    "assert first.child.value is marker",
    "assert second.child.value is marker",
    "events = []",
    "class ObservableTarget:",
    "    def __setattr__(self, name, value):",
    "        events.append(name)",
    "        object.__setattr__(self, name, value)",
    "observable = ObservableTarget()",
    "observable.left = observable.right = marker",
    "assert events == ['left', 'right']",
    "class DictSubclass(dict):",
    "    pass",
    "subclass_mapping = DictSubclass({'key': 1})",
    "assert list(dict.__iter__(subclass_mapping)) == ['key']",
    "class Allocated:",
    "    def __new__(cls, value):",
    "        answer = object.__new__(cls)",
    "        answer.allocated = value",
    "        return answer",
    "DynamicAllocated = type('DynamicAllocated', (Allocated,), {})",
    "assert DynamicAllocated(23).allocated == 23",
    "DynamicTuple = type('DynamicTuple', (tuple,), {})",
    "assert tuple(DynamicTuple([1, 2, 3])) == (1, 2, 3)",
    "shared_values = [0]",
    "shared = shared_values[0] = 17",
    "assert shared == 17 and shared_values == [17]",
    "class DynamicSet(set):",
    "    pass",
    "def dynamic_contains(self, item):",
    "    return item == 'needle'",
    "DynamicSet.__contains__ = dynamic_contains",
    "assert 'needle' in DynamicSet() and 'other' not in DynamicSet()",
    "class LazyList(list):",
    "    def __new__(cls, source):",
    "        class MaterializedList(list):",
    "            pass",
    "        pending = [source]",
    "        def lazy_iter(self):",
    "            if pending:",
    "                list.extend(self, pending.pop())",
    "                delattr(MaterializedList, '__iter__')",
    "            return list.__iter__(self)",
    "        MaterializedList.__iter__ = lazy_iter",
    "        return MaterializedList()",
    "lazy_values = LazyList([3, 5, 8])",
    "assert type(lazy_values).__name__ == 'MaterializedList'",
    "assert list(lazy_values) == [3, 5, 8]",
    "try:",
    "    set",
    "except NameError:",
    "    from builtins import set as set",
    "assert set([1, 1, 2]) == {1, 2}",
    "class ReboundConstructor:",
    "    pass",
    "ReboundConstructor = rebound_instance = ReboundConstructor()",
    "assert ReboundConstructor is rebound_instance",
    "assert type(rebound_instance).__name__ == 'ReboundConstructor'",
    "class ReflectedAlias:",
    "    def __rdiv__(self, other):",
    "        return other + 40",
    "ReflectedAlias.__rtruediv__ = ReflectedAlias.__rdiv__",
    "assert 2 / ReflectedAlias() == 42",
    "values = [item for item in range(3)]",
    "assert values == [0, 1, 2]",
    "assert 'item' not in globals()",
    "assert 'a\\tb'.expandtabs(4) == 'a   b'",
    "try:",
    "    identity(1, 2)",
    "except TypeError as error:",
    "    assert error.__traceback__ is not None",
    "    assert error.with_traceback(None) is error",
    "else:",
    "    raise AssertionError('argument binding must fail')",
    "print('compatible')",
    "",
  ].join("\n");
  const directory = mkdtempSync(join(tmpdir(), "sagejs-package-semantics-"));
  const program = join(directory, "check.py");
  writeFileSync(program, source);
  const result = await child(
    process.execPath,
    [join(__dirname, "..", "bin", "sagejs-source.cjs"), program],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "compatible");
});
