// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

test("prepared QQ Mumford reductions are exact, bounded, and cancellable", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      [
        "from sagejs.hyperelliptic_curves.torsion import (",
        " PreparedRationalReductionBatch, RationalReductionCancelledError,",
        " rational_mumford_fingerprint,",
        ")",
        "R=PolynomialRing(QQ,'x')",
        "x=R.gen()",
        "J=HyperellipticCurve(x^5+x+1).jacobian()",
        "Q=J((0,1))",
        "assert rational_mumford_fingerprint(J,Q) == rational_mumford_fingerprint(J,J(list(Q.uv())))",
        "assert rational_mumford_fingerprint(J,Q) != rational_mumford_fingerprint(J,2*Q)",
        "prepared=PreparedRationalReductionBatch(J,(Q,2*Q),max_memory_bytes=4096)",
        "row=prepared.reduce_prime(5)",
        "assert row['prime'] == 5 and len(row['divisors']) == 2",
        "assert 2*row['divisors'][0] == row['divisors'][1]",
        "chunks=tuple(prepared.iter_chunks((5,11),chunk_size=1))",
        "assert tuple(chunk[0]['prime'] for chunk in chunks) == (5,11)",
        "try:",
        " PreparedRationalReductionBatch(J,(Q,),max_memory_bytes=1)",
        " assert False",
        "except NotImplementedError:",
        " pass",
        "cancelled=PreparedRationalReductionBatch(J,(Q,),cancel=lambda: True)",
        "try:",
        " cancelled.reduce_prime(5)",
        " assert False",
        "except RationalReductionCancelledError:",
        " pass",
        "K=HyperellipticCurve(x^7+x+1).jacobian()",
        "P=K((0,1))",
        "g3=PreparedRationalReductionBatch(K,(P,3*P)).reduce_prime(5)",
        "assert 3*g3['divisors'][0] == g3['divisors'][1]",
        "[row['algorithm'],len(chunks),len(g3['divisors'])]",
      ].join("\n"),
    );
    assert.equal(
      result.repr,
      "['prepared-many-prime-mumford-reduction/v1', 2, 2]",
    );
  } finally {
    await session.close();
  }
});

test("saturation reuses reductions and exact division filters replay", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      [
        "from sagejs.hyperelliptic_curves.saturation import (",
        " saturate_subgroup, search_rational_mumford_division,",
        " verify_division_search_certificate,",
        ")",
        "R=PolynomialRing(QQ,'x')",
        "x=R.gen()",
        "J=HyperellipticCurve(x^5+x+1).jacobian()",
        "Q=J((0,1))",
        "calls=[]",
        "def provider(jacobian,basis,prime):",
        " calls.append((prime,len(basis)))",
        " return {'invariants':(30,), 'point_coordinates':((1,),)}",
        "S=saturate_subgroup(J,(Q,),primes=(2,3,5),reduction_primes=(7,11),reduction_provider=provider,use_height_pairing=False)",
        "assert calls == [(7,1),(11,1)]",
        "assert S.diagnostics['reduction_cache_misses'] == 2",
        "assert S.diagnostics['reduction_cache_hits'] == 4",
        "P=2*Q",
        "search=search_rational_mumford_division(J,P,2,numerator_bound=1,denominator_bound=1,max_candidate_tuples=100,filter_primes=(5,),filter_chunk_size=8)",
        "assert search['status'] == 'found' and search['point'] == Q",
        "assert search['used_filter_primes'] == (5,)",
        "assert search['exact_division_tests'] <= search['valid_mumford_divisors']",
        "assert verify_division_search_certificate(J,P,search)",
        "[len(calls),S.diagnostics['reduction_cache_hits'],search['used_filter_primes']]",
      ].join("\n"),
      { timeout: 120_000 },
    );
    assert.equal(result.repr, "[2, 4, (5,)]");
  } finally {
    await session.close();
  }
});
