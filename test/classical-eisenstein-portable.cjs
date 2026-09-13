// sagejs-test-tier: unit
// sagejs-test-portable: false
"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const { createSage } = require("../dist/tools/kernel.js");

test("portable Eisenstein divisor sieve agrees with FLINT normalizations", async (t) => {
  const sage = await createSage();
  t.after(() => sage.close());
  const result = await sage.evaluate([
    "from sagejs.modular_forms.qexp import _classical_eisenstein_qexp",
    "for k in [2,4,6,12,24]:",
    "    for p in [0,1,8,65]:",
    "        for norm in ['linear','constant','integral']:",
    "            a = _classical_eisenstein_qexp(k,p,QQ,'q',norm)",
    "            b = eisenstein_series_qexp(k,p,normalization=norm)",
    "            assert a == b, (k,p,norm,a,b)",
    "assert _classical_eisenstein_qexp(12,8,ZZ,'q','integral') == eisenstein_series_qexp(12,8,K=ZZ,normalization='integral')",
    "True",
  ].join("\n"));
  assert.equal(result.repr, "True");
});
