// sagejs-test-tier: unit
// sagejs-test-platform: true
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {createSage} = require("../dist/tools/kernel.js");

test("help loads lazily and renders documented objects without invoking properties", async t => {
  const session = await createSage({mode: "python"});
  t.after(() => session.close());
  await session.evaluate(`
import sys
assert 'sagejs._documentation_search' not in sys.modules
getter_reads = []
def documented(value=3):
    """Return a documented value."""
    return value
class Documented:
    """A documented class."""
    def method(self, value=4):
        """Return a documented method value."""
        return value
    @property
    def guarded(self):
        getter_reads.append('guarded')
        raise AssertionError('help invoked a property')
instance = Documented()
`);
  const welcome = "Welcome to Sage.js help.  " +
    "Call help(object) for information about an object.\n";
  assert.equal((await session.evaluate("help()")).stdout, welcome);
  await session.evaluate("assert 'sagejs._documentation_search' in sys.modules");
  assert.equal((await session.evaluate("help()")).stdout, welcome);

  const functionHelp = (await session.evaluate("help(documented)")).stdout;
  assert.match(functionHelp, /^Help on function documented in module __main__:\n/);
  assert.match(functionHelp, /\ndocumented\(value=3\)\n/);
  assert.match(functionHelp, /\n    Return a documented value\.\n/);
  assert.equal((await session.evaluate("help(documented)")).stdout, functionHelp);

  const classHelp = (await session.evaluate("help(Documented)")).stdout;
  assert.match(classHelp, /^Help on class Documented:\n/);
  assert.match(classHelp, /\nclass Documented\(\)/);
  assert.match(classHelp, /\n    A documented class\.\n/);

  const instanceHelp = (await session.evaluate("help(instance)")).stdout;
  assert.match(instanceHelp, /^Help on Documented object:\n/);
  assert.match(instanceHelp, /\nclass Documented\(\)/);
  assert.match(instanceHelp, /\n    A documented class\.\n/);

  const methodHelp = (await session.evaluate("help(instance.method)")).stdout;
  assert.match(methodHelp, /^Help on method method in module __main__:\n/);
  assert.match(methodHelp, /\nmethod\(value=4\)\n/);
  assert.match(methodHelp, /\n    Return a documented method value\.\n/);
  assert.equal((await session.evaluate("getter_reads")).repr, "[]");
});
