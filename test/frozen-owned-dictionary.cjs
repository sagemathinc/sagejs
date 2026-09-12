// sagejs-test-tier: unit
// sagejs-test-platform: true
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const { createSage } = require("../dist/tools/kernel.js");

for (const mode of ["python", "sage"]) {
  test(`frozen instance dictionaries retain guarded shallow authority (${mode})`, async (context) => {
    const session = await createSage({ mode });
    context.after(() => session.close());
    const result = await session.evaluate(
      readFileSync(join(__dirname, "fixtures/frozen-owned-dictionary.py"), "utf8"),
    );
    assert.equal(result.stdout.trim(), "frozen-owned-dictionary-ok");
    assert.equal(result.stderr ?? "", "");
  });

  test(`retained namespace aliases do not retain frozen owners (${mode})`, () => {
    const result = spawnSync(process.execPath, ["--expose-gc", "-e", `
      const assert = require("node:assert/strict");
      const { createSage } = require("./dist/tools/kernel.js");
      (async () => {
        const session = await createSage({ mode: ${JSON.stringify(mode)} });
        try {
          await session.evaluate(\`
import sagejs.runtime as runtime
class Record:
    pass
def make_alias(expose_first):
    owner = Record()
    owner.value = 1
    if expose_first:
        alias = owner.__dict__
    runtime.object.freeze(owner)
    alias = owner.__dict__
    reference = runtime.reflect.construct(runtime.weak_ref_class, [owner])
    return alias, reference
aliases = [make_alias(False), make_alias(True)]
def make_shared_alias():
    alias = {"value": 1}
    references = []
    for index in range(3):
        owner = Record()
        owner.__dict__ = alias
        runtime.object.freeze(owner)
        references.append(runtime.reflect.construct(runtime.weak_ref_class, [owner]))
    return alias, references
shared_alias, shared_references = make_shared_alias()
\`);
          let collected = false;
          for (let attempt = 0; attempt < 20; attempt++) {
            // Separate evaluations cross host jobs, releasing WeakRef keep-alive.
            const check = await session.evaluate(\`
runtime.reflect.apply(runtime.reflect.get(runtime.global_object, "gc"), runtime.undefined, [])
print(all(reference.deref() is runtime.undefined for alias, reference in aliases) and all(reference.deref() is runtime.undefined for reference in shared_references))
\`);
            if (check.stdout.trim() === "True") { collected = true; break; }
          }
          assert.equal(collected, true, "guard retained a frozen owner");
          await session.evaluate(\`
for alias, reference in aliases:
    alias["value"] = 2
    assert alias == {"value": 2}
shared_alias["value"] = 2
assert shared_alias == {"value": 2}
\`);
        } finally { await session.close(); }
      })().catch((error) => { console.error(error); process.exitCode = 1; });
    `], { cwd: join(__dirname, ".."), encoding: "utf8", timeout: 60000 });
    assert.equal(result.status, 0, result.stderr || String(result.error ?? ""));
  });
}
