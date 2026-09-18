"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const adapter = require("../bench/pari-class-group-port/generic_phase6_pari_prepared_adapter.cjs");

test("generic PARI adapter admits only the five reviewed frozen fields", () => {
  assert.deepEqual(Object.keys(adapter.ROWS), ["8", "10", "11", "18", "20"]);
  assert.throws(() => adapter.frozenFieldSpecification(23), /unsupported/);
  const changed = structuredClone(adapter.ROWS[8]);
  changed.polynomialAscending[0] = "-20035";
  assert.throws(() => adapter.validateFrozenFieldSpecification(changed),
    /differs from its reviewed frozen field specification/);
  for (const row of [8, 10, 11, 18, 20]) {
    const spec = adapter.frozenFieldSpecification(row);
    assert(Object.isFrozen(spec)); assert(Object.isFrozen(spec.polynomialAscending));
  }
  assert.equal(adapter.ROWS[10].fieldId,
    "generated-sha256-984793770b4a15a79fbc9984fe352fbc867491917733c78bdba3b1856c18e3a7");
});

test("generic helper source isolates the prepared bnfinit0 clock", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "bench",
    "pari-class-group-port", "generic_phase6_pari_prepared_adapter.c"), "utf8");
  assert.match(source, /nf = nfinit0\(gp_read_str\(argv\[3\]\), 0,/);
  assert.match(source, /prepared_stack = avma;[\s\S]*READY/);
  assert.match(source, /avma = prepared_stack;[\s\S]*emit_run\(/);
  assert.match(source, /setrand\(gp_read_str\(seed\)\);[\s\S]*clock_gettime\(CLOCK_MONOTONIC, &begin\);[\s\S]*bnf = bnfinit0\(nf, 0,[\s\S]*clock_gettime\(CLOCK_MONOTONIC, &end\);/);
});

test("generic PARI adapter computes all five exact projections",
  { timeout: 600_000 }, async () => {
    const build = adapter.buildHelper();
    for (const row of [8, 10, 11, 18, 20]) {
      const client = new adapter.HelperClient(adapter.ROWS[row], build);
      try {
        await client.ready();
        await assert.rejects(client.run("0"), /positive decimal integer/);
        const first = await client.run("1");
        adapter.validateProjection(adapter.ROWS[row], first.projection);
        const second = await client.run("1");
        assert.deepEqual(second.projection, first.projection);
        assert.deepEqual(second.rng, first.rng,
          "restoring the prepared stack and RNG must replay deterministically");
      } finally { await client.close(); }
    }
  });
