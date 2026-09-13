// sagejs-test-tier: integration
"use strict";
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");
const test = require("node:test");
const { createSage } = require("../dist/tools/kernel.js");
const { pythonExecutable } = require("../tools/python-executable.cjs");

test("initializer metadata copies retain ordered getter/write pairs", async () => {
  const compiler = require("../dist/tools/compiler.js").default();
  const { createPythonCompilerFrontend } = require(
    "../dist/tools/python/compiler-frontend.js"
  );
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  const fields = ["__argnames__", "__defaults__", "__kwdefaults__",
    "__handles_kwarg_interpolation__", "__kwonly__", "__positional_only__",
    "__varargs__", "__varkw__"];
  try {
    const ast = frontend.parse(
      "class B:\n    def __init__(self, x=1): self.x = x\nclass C(B):\n    pass\n",
      { filename: "<initializer-metadata>", for_linting: true, import_dirs: [],
        strict_python_scopes: true, scoped_flags: { bound_methods: true,
          sequential_definitions: true } },
    );
    const output = new compiler.OutputStream({ omit_baselib: true,
      private_scope: false, write_name: false, beautify: true,
      python_attributes: true });
    ast.print(output);
    const loops = output.get().match(
      /for \(var ρσ_init_attr of \[[^\]]+\]\) \{[^}]+\}/g,
    );
    assert.equal(loops?.length, 3, "declared, forwarded, and winning metadata");
    for (const loop of loops) {
      const names = JSON.parse(loop.match(/of (\[[^\]]+\])/)[1]);
      assert.deepEqual(names, fields);
      const events = [];
      const signature = new Proxy({}, {
        get(_target, key) { events.push(["get", key]); return key; },
        set(_target, key, value) { events.push(["set", key, value]); return true; },
      });
      const makeClass = () => new Proxy({ prototype: { __init__: signature } }, {
        set(_target, key, value) { events.push(["set", key, value]); return true; },
      });
      const headers = [...new Set(loop.match(/ρσ_class_header_\d+/g) || [])];
      const run = new Function("$ρσ$py$B", "$ρσ$py$C", "ρσ_init_signature",
        ...headers, loop);
      const invoke = value => run(makeClass(), makeClass(), value,
        ...headers.map(() => [null, [makeClass()]]));
      // Execute the actual emitted copy block, not a separately maintained
      // equivalent. Proxies expose eager batching or reordered fields.
      invoke(signature);
      assert.deepEqual(events, fields.flatMap(key => [
        ["get", key], ["set", key, key],
      ]));
      if (loop.includes("ρσ_init_signature")) {
        events.length = 0;
        invoke(null);
        assert.deepEqual(events, fields.map(key => ["set", key, undefined]));
      }
    }
  } finally {
    frontend.close();
  }
});

test("class-body initializer fixture passes the CPython oracle", () => {
  const result = spawnSync(pythonExecutable(), [
    "-X", "utf8", join(__dirname, "fixtures", "dynamic-init-class-body.py"),
  ], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  assert.equal(result.stdout.trim(), "dynamic-init-class-body-ok");
});

// Required in both language modes: binding must not depend on Sage preparsing.
for (const mode of ["python", "sage"]) {
  for (const kind of ["positional", "keywords", "allocation", "class-body"]) {
    test(`assigned initializer ${kind} (${mode})`, async (t) => {
      const session = await createSage({ mode });
      t.after(() => session.close());
      const result = await session.evaluate(readFileSync(
        join(__dirname, "fixtures", `dynamic-init-${kind}.py`), "utf8",
      ));
      assert.equal(result.stdout.trim(), `dynamic-init-${kind}-ok`);
    });
  }
}
