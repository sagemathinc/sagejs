"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { parseArguments, pariGroupBody } = require("./run-public-sagejs-pari.cjs");

test("PARI proof mode defaults to the historical conditional comparator", () => {
  assert.equal(parseArguments([]).pariProof, "conditional");
  assert.equal(pariGroupBody("conditional").includes("bnfcertify"), false);
});

test("certified group comparator checks the full PARI bnf result", () => {
  const options = parseArguments(["--operation", "group", "--pari-proof", "certified"]);
  assert.equal(options.pariProof, "certified");
  assert.match(pariGroupBody(options.pariProof), /bnfinit\(nf,0\);if\(bnfcertify\(b\)!=1/);
  assert.match(pariGroupBody(options.pariProof), /print\(\[nf\.disc,b\.no,Vecrev\(b\.clgp\[2\]\)\]\)/);
});

test("invalid or inapplicable PARI proof modes fail closed", () => {
  assert.throws(() => parseArguments(["--pari-proof", "unknown"]), /--pari-proof/);
  assert.throws(() => parseArguments([
    "--operation", "class-number", "--pari-proof", "certified",
  ]), /requires --operation group/);
});
