// sagejs-test-tier: integration
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { createSage } = require("../dist/tools/kernel.js");

test("certified modular abelian morphisms and integral geometry", { timeout: 300000 }, async (t) => {
  const session = await createSage();
  t.after(() => session.close());
  const source = readFileSync(join(__dirname, "fixtures/modular-abelian-morphisms.py"), "utf8");
  const result = await session.evaluate(source, { timeout: 290000 });
  assert.equal(result.stdout.trim(), "integral morphism geometry passed");
});

test("integral maps and oldform-copy isogenies agree with pinned Sage", { timeout: 300000 }, async (t) => {
  const session = await createSage();
  t.after(() => session.close());
  const fixture = JSON.parse(readFileSync(join(__dirname,"fixtures/modular-abelian-morphisms-sage.json"),"utf8"));
  for (const row of fixture.cases) {
    let code;
    if (row.kind === "decomposition") {
      code = `D=J0(${row.level}).oldform_decomposition()\nprint(json.dumps([sorted([[c.source_level(),c.degeneracy_index(),c.dimension()] for c in D]),list(D.isogeny().component_group().invariants())]))`;
    } else if (row.kind === "degeneracy") {
      code = `F=J0(11).degeneracy_map(${row.level},${row.index})\nprint(json.dumps([F.rank(),list(F.component_group().invariants())]))`;
    } else {
      code = `F=J0(${row.level}).hecke_morphism(2)-1\nprint(json.dumps([F.rank(),list(F.component_group().invariants())]))`;
    }
    const result = await session.evaluate("import json\n"+code, { timeout: 290000 });
    assert.deepEqual(JSON.parse(result.stdout), [row.kind === "decomposition" ? row.labels : row.rank,row.invariants], JSON.stringify(row));
  }
});
