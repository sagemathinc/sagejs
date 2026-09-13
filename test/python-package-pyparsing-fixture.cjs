// sagejs-test-tier: unit
"use strict";
const assert = require("node:assert/strict");
const { test } = require("node:test");
const { loadManifest } = require("../scripts/run-pure-python-packages.cjs");

test("pinned pyparsing smoke uses nondeprecated DelimitedList without changing its workflow", () => {
  const entry = loadManifest().manifest.packages.find((item) => item.name === "pyparsing");
  assert.equal(entry.version, "3.3.2");
  assert.equal(entry.wheel, "pyparsing-3.3.2-py3-none-any.whl");
  assert.equal(entry.sha256, "850ba148bd908d7e2411587e247a1e4f0327839c40e2e5e6d05a007ecc69911d");
  assert.equal(entry.source, "from pyparsing import Word, nums, DelimitedList\ninteger = Word(nums).set_parse_action(lambda tokens: int(tokens[0]))\nprint(DelimitedList(integer).parse_string('2, 3, 5, 7').as_list())\n");
  assert.equal(entry.stdout, "[2, 3, 5, 7]\n");
});
