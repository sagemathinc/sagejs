// sagejs-test-tier: unit
"use strict";
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { resolve } = require("node:path");
const test = require("node:test");

const source = `
class Base:
    def inherited(self, n: int=2) -> int:
        """Inherited method documentation."""
        return n

class Child(Base):
    def own(self, text: str='hello'):
        """Own method documentation."""
        return text
    @property
    def dangerous(self):
        raise AssertionError("help executed a property")

class Masked(Base):
    @property
    def inherited(self):
        raise AssertionError("help executed an overriding property")

class NonMethod(Base):
    inherited = 17

print("CHILD CLASS")
help(Child)
print("CHILD INSTANCE")
help(Child())
print("MASKED CLASS")
help(Masked)
print("NONMETHOD CLASS")
help(NonMethod)
print("END")
`;

for (const mode of [[], ["--python"]]) {
  test(`class help safely lists lazy and inherited methods (${mode[0] || "sage"})`, () => {
    const result = spawnSync(process.execPath, [resolve(__dirname, "../bin/sagejs"), ...mode], {
      input: source, encoding: "utf8", timeout: 30000,
      cwd: resolve(__dirname, ".."),
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, "");
    const sections = result.stdout.split(/CHILD CLASS|CHILD INSTANCE|MASKED CLASS|NONMETHOD CLASS|END/);
    for (const section of sections.slice(1, 3)) {
      assert.match(section, /Methods:/);
      assert.match(section, /inherited\(n: int=2\) -> int/);
      assert.match(section, /Inherited method documentation\./);
      assert.match(section, /own\(text: str='hello'\)/);
      assert.match(section, /Own method documentation\./);
      assert.doesNotMatch(section, /dangerous\(/);
    }
    for (const section of sections.slice(3, 5)) {
      assert.doesNotMatch(section, /inherited\(|Inherited method documentation/);
    }
  });
}
