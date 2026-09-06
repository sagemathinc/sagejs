// sagejs-test-tier: unit
"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { BUILTINS_STANDALONE_MODULES } = require("../tools/standalone-library.cjs");

test("documentation search is a literal-discovered lazy stdlib module", () => {
  assert.ok(BUILTINS_STANDALONE_MODULES.includes("sagejs._documentation_search"));
  const manifest = JSON.parse(readFileSync(join(__dirname,"../architecture/package-graph.json")));
  const owners = manifest.packages.filter(component =>
    component.files.includes("src/lib/sagejs/_documentation_search.py"));
  assert.equal(owners.length,1);
  assert.equal(owners[0].id,"python-stdlib");
  assert.equal(owners[0].startup,"lazy");
  assert.ok(owners[0].modules.includes("sagejs._documentation_search"));
  const source = readFileSync(join(__dirname,"../src/baselib/builtins.py"),"utf8");
  assert.ok(!source.includes("def _builtins_doc_search_match("));
  assert.ok(!source.includes("def _builtins_doc_summary("));
  const body = source.split("def ρσ_search_doc(")[1].split("\ndef ")[0];
  assert.match(body,/module = __import__\(\s*"sagejs\._documentation_search"/);
  assert.match(body,/Search the docstrings of public objects loaded into Sage\.js\./);
  assert.ok(!body.includes("runtime.documentation_registry()"));
  const lazy = readFileSync(join(__dirname,"../src/lib/sagejs/_documentation_search.py"),"utf8");
  assert.equal((lazy.match(/runtime\.regexp\(/g) ?? []).length,2);
  assert.match(lazy,/def matches_text\(candidate: _Str\)/);
  assert.ok(lazy.indexOf("normalized_needle =") < lazy.indexOf("def matches_text("));
  assert.ok(lazy.indexOf("if runtime.string_find(lowered, needle) != -1:") < lazy.indexOf("normalized_candidate ="));
  assert.ok(!lazy.includes(".replace("));
  assert.match(lazy,/runtime\.reflect\.apply\(runtime\.array\.prototype\.sort, names, \[\]\)/);
  assert.match(lazy,/runtime\.reflect\.apply\(runtime\.array\.prototype\.sort, matches, \[\]\)/);
});

test("combined native separator collapse preserves the original two-pass mapping", () => {
  const original = text => text.replace(/[`_-]+/g," ").replace(/\s+/g," ");
  const combined = text => text.replace(/[`_\s-]+/g," ");
  const alphabet = ["a","`","_","-"," ","\t","\n","\u00a0","\u2003","\u0301","\ud800"];
  let level = [""];
  for (let length=0;length<=4;length++) {
    for (const text of level) assert.equal(combined(text),original(text),JSON.stringify(text));
    if (length<4) level = level.flatMap(prefix=>alphabet.map(character=>prefix+character));
  }
  for (const text of ["--a__\t -b``", "\ufeff\r\n_-", "é😀_𝄞", "a\u2028-\u2029b", "\u0000_-\u200b"]) {
    assert.equal(combined(text),original(text));
  }
});

test("query-hoisted native matching retains raw-NFD first and normalized fallback", () => {
  const original = (query,candidate) => {
    const needle = query.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
    const lowered = candidate.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
    if (lowered.includes(needle)) return true;
    return lowered.replace(/[`_-]+/g," ").replace(/\s+/g," ")
      .includes(needle.replace(/[`_-]+/g," ").replace(/\s+/g," "));
  };
  const optimized = query => {
    const marks = /[\u0300-\u036f]/g;
    const separators = /[`_\s-]+/g;
    const needle = query.toLowerCase().normalize("NFD").replace(marks,"");
    const normalized = needle.replace(separators," ");
    return candidate => {
      const lowered = candidate.toLowerCase().normalize("NFD").replace(marks,"");
      return lowered.includes(needle) || lowered.replace(separators," ").includes(normalized);
    };
  };
  const strings = ["natural logarithm","natúral logarithm","prime_pi","prime-pi","prime pi",
    "Cafe\u0301","café","CAFE","a_- \tb","a  b","  ","\u0301","`_-","𝄞😀","no-match"];
  for (const query of strings) {
    const match = optimized(query);
    for (let repeat=0;repeat<3;repeat++) for (const candidate of strings) {
      assert.equal(match(candidate),original(query,candidate),JSON.stringify({query,candidate,repeat}));
    }
  }
  // Literal multi-space matches remain accepted; source checks above retain
  // the pre-collapse fast path as well as this observable result.
  assert.equal(optimized("a  b")("prefix a  b suffix"),true);
});
