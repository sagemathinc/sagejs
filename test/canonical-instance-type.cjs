// sagejs-test-tier: unit
// sagejs-test-platform: true
"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const { execFileSync } = require("node:child_process");
const { mkdtempSync, readFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { createSage } = require("../dist/tools/kernel.js");

test("canonical ownership does not conflate classes in separate sessions", async context => {
  const first = await createSage({ mode: "python" });
  const second = await createSage({ mode: "python" });
  context.after(async () => { await first.close(); await second.close(); });
  for (const session of [first, second]) {
    await session.evaluate(`
class SameName:
    pass
value = SameName()
value.constructor = str
value.__python_type__ = int
`);
  }
  for (const session of [first, second, first]) {
    await session.evaluate("assert type(value) is SameName");
  }
});

test("canonical instance ownership finalizer is available in standalone output", context => {
  const root = join(__dirname, "..");
  const fixture = join(__dirname, "fixtures/canonical-instance-type.py");
  const scratch = mkdtempSync(join(tmpdir(), "sagejs-canonical-type-"));
  context.after(() => rmSync(scratch, { recursive: true, force: true }));
  const output = join(scratch, "canonical-type.cjs");
  execFileSync(process.execPath, [join(root, "bin/sagejs-source.cjs"), "compile", "--python", "--output", output, fixture], {
    cwd: root, timeout: 120000, maxBuffer: 16 * 1024 * 1024, stdio: "pipe",
  });
  const stdout = execFileSync(process.execPath, [output], {
    cwd: scratch, encoding: "utf8", timeout: 120000, maxBuffer: 1024 * 1024,
  });
  assert.equal(stdout.trim(), "canonical-instance-type-ok");
});

for (const mode of ["python", "sage"]) {
  test(`fresh callable reassignment uses its new class in sessions (${mode})`, async context => {
    const session = await createSage({mode});
    context.after(() => session.close());
    await session.evaluate(`
class A:
    def __call__(self):
        return 19
class B:
    def __call__(self):
        return 23
a = A()
a.__class__ = B
assert type(a) is B
assert a() == 23
`);
  });
  for (const name of ["metaclass-lifecycle", "dynamic-callable"]) {
    test(`canonical type ${name} (${mode})`, async context => {
      const session = await createSage({mode});
      context.after(() => session.close());
      const result = await session.evaluate(readFileSync(join(__dirname, `fixtures/canonical-type-${name}.py`), "utf8"));
      assert.match(result.stdout, /passed/);
      assert.equal(result.stderr ?? "", "");
    });
  }
  test(`canonical instance type ignores shadowable representation fields (${mode})`, async context => {
    const session = await createSage({ mode });
    context.after(() => session.close());
    const result = await session.evaluate(readFileSync(join(__dirname, "fixtures/canonical-instance-type.py"), "utf8"));
    assert.equal(result.stderr ?? "", "");
    assert.equal(result.stdout.trim(), "canonical-instance-type-ok");
  });

  test(`known sequence and callable proxy adapters retain public type (${mode})`, async context => {
    const session = await createSage({ mode });
    context.after(() => session.close());
    const result = await session.evaluate(`
import sagejs.runtime as runtime

@runtime.sequence_class
class SequenceOwner:
    def __len__(self):
        return 1
    def __getitem__(self, index):
        return 31

sequence = SequenceOwner()
assert type(sequence) is SequenceOwner
sequence.constructor = int
sequence.__python_type__ = str
assert type(sequence) is SequenceOwner
assert sequence[0] == 31

@runtime.sequence_class
class CallableSequenceOwner:
    def __len__(self):
        return 1
    def __getitem__(self, index):
        return 37
    def __call__(self):
        return 41

combined = CallableSequenceOwner()
assert type(combined) is CallableSequenceOwner
combined.constructor = int
combined.__python_type__ = str
assert type(combined) is CallableSequenceOwner
assert combined[0] == 37
assert combined() == 41
print('canonical-proxy-type-ok')
`);
    assert.equal(result.stderr ?? "", "");
    assert.equal(result.stdout.trim(), "canonical-proxy-type-ok");
  });
}
