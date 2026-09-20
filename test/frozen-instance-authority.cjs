// sagejs-test-tier: unit
// sagejs-test-platform: true
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { createSage } = require("../dist/tools/kernel.js");

test("ordinary class construction leaves identity lazy", async () => {
  const compiler = require("../dist/tools/compiler.js").default();
  const { createPythonCompilerFrontend } = require(
    "../dist/tools/python/compiler-frontend.js"
  );
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const ast = frontend.parse("class Example:\n    pass\n", {
      filename: "<lazy-instance-identity>",
    });
    const output = new compiler.OutputStream({
      omit_baselib: true,
      write_name: false,
      beautify: true,
      python_attributes: true,
    });
    ast.print(output);
    const javascript = output.get();
    assert.doesNotMatch(javascript, /ρσ_object_id/);
    assert.match(javascript, /ρσ_id\(this\)/);
  } finally {
    frontend.close();
  }
});

for (const mode of ["python", "sage"]) {
  test(`failed instance namespace transitions retain authority (${mode})`, async (context) => {
    const session = await createSage({ mode });
    context.after(() => session.close());
    const result = await session.evaluate(
      readFileSync(join(__dirname, "fixtures/frozen-instance-authority.py"), "utf8"),
    );
    assert.equal(result.stdout.trim(), "frozen-instance-authority-ok");
    assert.equal(result.stderr ?? "", "");
  });
}
