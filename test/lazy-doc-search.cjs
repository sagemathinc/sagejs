// sagejs-test-tier: unit
// sagejs-test-platform: true
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {createSage} = require("../dist/tools/kernel.js");

test("documentation search loads lazily and preserves repeated queries", async t => {
  const session = await createSage({mode: "python"});
  t.after(() => session.close());
  const setup = await session.evaluate(`
import sys
assert 'sagejs._documentation_search' not in sys.modules
search_doc('sum')
assert 'sagejs._documentation_search' in sys.modules
from sagejs._documentation_search import _builtins_doc_search_match
assert _builtins_doc_search_match('cafe', 'Café')
assert _builtins_doc_search_match('some value', 'some_value')
`);
  assert.match(setup.stdout, /theta2_qexp -- Return/);
  const repeated = await session.evaluate("search_doc('sum')");
  assert.equal(repeated.stdout, setup.stdout);
  const rejected = await session.evaluate(`
try:
    search_doc('')
except ValueError:
    print('empty query rejected')
else:
    raise AssertionError('empty query accepted')
`);
  assert.equal(rejected.stdout.trim(), "empty query rejected");
});
