// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const { copyFileSync, mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");
const { test } = require("node:test");
const { executeAssertion } = require("../tools/python-compat/assertion-runner.cjs");
const { executionBytes } = require("../tools/python-compat/evidence.cjs");
const { isolatedEnvironment } = require("../scripts/run-python-compat.cjs");

test("nested class constructor storage is hygienic without renaming source reads", async () => {
  const { default: createCompiler } = require("../dist/tools/compiler.js");
  const { createPythonCompilerFrontend } = require("../dist/tools/python/compiler-frontend.js");
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const ast = frontend.parse("class Choice:\n    pass\nclass Outer:\n    class Choice:\n        pass\n", {
      filename: "<nested-class-storage>", for_linting: true, import_dirs: [],
      strict_python_scopes: true, exact_integer_literals: true,
      scoped_flags: { dict_literals: true, overload_getitem: true,
        bound_methods: true, sequential_definitions: true },
    });
    const original = ast.body[0];
    const nested = ast.body[1].body.find(node => node instanceof compiler.AST_Class);
    assert.equal(original.name.name, "Choice");
    assert.equal(nested.name.name, "Choice", "public source name is unchanged");
    assert.ok(nested.name.thedef, "nested constructor has an internal storage binding");
    assert.notEqual(nested.name.thedef.name, original.name.name);
    assert.match(nested.name.thedef.name, /\$/);
    assert.equal(nested.name.clone().thedef, nested.name.thedef);
  } finally { frontend.close(); }
});

for (const executionMode of ["script", "lazy-module"]) {
  test(`nested class bases resolve the enclosing class namespace: ${executionMode}`, async () => {
    const scratch = mkdtempSync(join(tmpdir(), "sagejs-nested-class-bases-"));
    try {
      const moduleFile = join(scratch, "nested_class_bases.py");
      copyFileSync(join(__dirname, "fixtures/python-nested-class-bases.py"), moduleFile);
      let program = moduleFile;
      if (executionMode === "lazy-module") {
        program = join(scratch, "main.py");
        writeFileSync(program, "import nested_class_bases\n");
      }
      const result = await executeAssertion(process.execPath,
        ["--max-old-space-size=512", join(__dirname, "../bin/sagejs-source.cjs"), "--python", program],
        { cwd: scratch, env: { ...isolatedEnvironment(scratch), SAGEJS_SITE_PACKAGES: scratch },
          timeoutMs: 30000, maxOutputBytes: 1048576 });
      assert.equal(result.error, null, JSON.stringify(result.error));
      assert.equal(result.timedOut, false);
      assert.equal(result.outputLimited, false);
      assert.equal(result.signal, null);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(executionBytes(result, "stdout").length, 0, result.stdout);
      assert.equal(executionBytes(result, "stderr").length, 0, result.stderr);
    } finally {
      // A late cache-cleanup receipt can race directory removal after the
      // fixture exits. Retry removal briefly; do not retry its assertions.
      rmSync(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  });
}
