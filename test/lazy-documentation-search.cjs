// sagejs-test-tier: integration
"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const { execFileSync } = require("node:child_process");
const { mkdtempSync, readFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { createSage } = require("../dist/tools/kernel.js");

for (const mode of ["python", "sage"]) {
  test(`documentation search loads on demand with live builtins state (${mode})`, async context => {
    const session = await createSage({mode});
    context.after(() => session.close());
    const before = await session.evaluate(`
import sys
assert 'sagejs._documentation_search' not in sys.modules
assert 'Search the docstrings of public objects loaded into Sage.js.' in search_doc.__doc__
help(search_doc)
assert 'sagejs._documentation_search' not in sys.modules
`);
    assert.match(before.stdout,/Search the docstrings of public objects loaded into Sage\.js\./);
    const first = await session.evaluate("search_doc('natural logarithm')");
    assert.match(first.stdout,/log2 -- The natural logarithm of `2`\./);
    await session.evaluate(`
assert 'sagejs._documentation_search' in sys.modules
_search_module = sys.modules['sagejs._documentation_search']
_core = __import__('sagejs._baselib.builtins', fromlist=['ρσ_search_doc'])
assert search_doc is _core.ρσ_search_doc
_original_doc = _core._builtins_doc
def _changed_doc(value=None):
    original = _original_doc(value)
    if 'The natural logarithm of ' in original:
        return 'Live-documentation-change marker.'
    return original
_core._builtins_doc = _changed_doc
`);
    try {
      const changed = await session.evaluate("search_doc('live documentation change')");
      assert.match(changed.stdout,/log2 -- Live-documentation-change marker\./);
    } finally {
      await session.evaluate("_core._builtins_doc = _original_doc");
    }
    const repeated = await session.evaluate(`
search_doc('natural logarithm')
assert sys.modules['sagejs._documentation_search'] is _search_module
try:
    search_doc('')
except ValueError:
    pass
else:
    raise AssertionError('empty documentation query accepted')
`);
    assert.equal(repeated.stdout,first.stdout);
    assert.match((await session.evaluate("help(search_doc)")).stdout,/Search the docstrings of public objects loaded into Sage\.js\./);
  });
}

test("documentation search preserves standalone output and class descriptor safety", async context => {
  const root = join(__dirname,"..");
  const fixture = join(__dirname,"fixtures/documentation-search.py");
  const scratch = mkdtempSync(join(tmpdir(),"sagejs-documentation-standalone-"));
  context.after(() => rmSync(scratch,{recursive:true,force:true}));
  const output = join(scratch,"documentation.cjs");
  const session = await createSage({mode:"python"});
  context.after(() => session.close());
  const reference = await session.evaluate(readFileSync(fixture,"utf8"));
  assert.equal(reference.stderr ?? "","");
  assert.match(reference.stdout,/log2 -- The natural logarithm of `2`\./);
  assert.match(reference.stdout,/documentation-search-profile-ok/);
  execFileSync(process.execPath,[join(root,"bin/sagejs-source.cjs"),"compile","--python",
    "--output",output,fixture],{cwd:root,timeout:120000,maxBuffer:16*1024*1024,stdio:"pipe"});
  const standalone = execFileSync(process.execPath,[output],{
    cwd:scratch,encoding:"utf8",timeout:120000,maxBuffer:1024*1024,
  });
  // These profiles can have different loaded documentation inventories. Both
  // must find the established registry witness without invoking a class getter.
  assert.match(standalone,/log2 -- The natural logarithm of `2`\./);
  assert.match(standalone,/documentation-search-profile-ok/);
});
