// sagejs-test-tier: integration
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { createSage } = require("../dist/tools/kernel.js");

test("complete Hom and End over QQ, integral geometry and serialization", {timeout:300000}, async t => {
  const session = await createSage();
  t.after(()=>session.close());
  const code=readFileSync(join(__dirname,"fixtures/modular-abelian-hom.py"),"utf8");
  const result=await session.evaluate(code,{timeout:290000});
  assert.equal(result.stdout.trim(),"certified Hom and End geometry passed");
});

test("complete Hom integral lattices agree with pinned Sage under exact basis transport", {timeout:300000}, async t => {
  const session=await createSage();
  t.after(()=>session.close());
  const oracle=JSON.parse(readFileSync(join(__dirname,"fixtures/modular-abelian-hom-sage.json"),"utf8"));
  const code="import json\noracle=json.loads("+JSON.stringify(JSON.stringify(oracle))+")\n"+
    readFileSync(join(__dirname,"fixtures/modular-abelian-hom-differential.py"),"utf8");
  const result=await session.evaluate(code,{timeout:290000});
  assert.match(result.stdout,/connected quotient model lattices passed/);
});
