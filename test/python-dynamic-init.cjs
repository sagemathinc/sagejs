// sagejs-test-tier: integration
"use strict";
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");
const { createSage } = require("../dist/tools/kernel.js");

// Required in both language modes: binding must not depend on Sage preparsing.
for (const mode of ["python", "sage"]) {
  for (const kind of ["positional", "keywords", "allocation"]) {
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
