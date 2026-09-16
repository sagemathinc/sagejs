import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createSage } from "../node-kernel.mjs";

test("portable complete Hom and End geometry with Sage lattice oracle", {timeout:300000}, async t=>{
  const session=await createSage({timeout:290000});
  t.after(()=>session.close());
  const fixture=name=>readFileSync(new URL("../../../test/fixtures/"+name,import.meta.url),"utf8");
  const result=await session.evaluate(fixture("modular-abelian-hom.py"));
  assert.equal(result.stdout.trim(),"certified Hom and End geometry passed");
  const oracle=JSON.parse(fixture("modular-abelian-hom-sage.json"));
  const differential=await session.evaluate("import json\noracle=json.loads("+JSON.stringify(JSON.stringify(oracle))+")\n"+fixture("modular-abelian-hom-differential.py"));
  assert.match(differential.stdout,/connected quotient model lattices passed/);
});
