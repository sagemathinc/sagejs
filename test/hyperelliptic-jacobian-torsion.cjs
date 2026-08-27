// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

test("rational branch factors certify all genus-2 two-torsion", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      [
        "from sagejs.hyperelliptic_curves.torsion import (",
        "    rational_mumford_data, rational_mumford_from_data,",
        "    rational_two_torsion, verify_two_torsion_certificate,",
        ")",
        "R=PolynomialRing(QQ,'x')",
        "x=R.gen()",
        "C=HyperellipticCurve(x^5-x)",
        "J=C.jacobian()",
        "T=rational_two_torsion(J)",
        "assert T.dimension == 3 and T.order == 8",
        "assert T.invariants == (2,2,2) and len(T.generators) == 3",
        "assert all((2*D).is_zero() and not D.is_zero() for D in T.generators)",
        "assert verify_two_torsion_certificate(J,T.certificate)",
        "data=rational_mumford_data(J,T.generators[0])",
        "assert rational_mumford_from_data(J,data) == T.generators[0]",
        "[T.dimension,T.order,T.factor_degrees,T.invariants]",
      ].join("\n"),
    );
    assert.equal(result.repr, "[3, 8, (1, 1, 1, 2), (2, 2, 2)]");
  } finally {
    await session.close();
  }
});

test("generalized models use the completed branch polynomial", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      [
        "from sagejs.hyperelliptic_curves.torsion import rational_two_torsion",
        "R=PolynomialRing(QQ,'x')",
        "x=R.gen()",
        "h=x",
        "f=(x^5-x-h^2)/4",
        "J=HyperellipticCurve(f,h).jacobian()",
        "T=rational_two_torsion(J)",
        "assert T.order == 8 and T.factor_degrees == (1,1,1,2)",
        "assert all(2*D == J.zero() for D in T.generators)",
        "[T.order,T.factor_degrees]",
      ].join("\n"),
    );
    assert.equal(result.repr, "[8, (1, 1, 1, 2)]");
  } finally {
    await session.close();
  }
});

test("reduction bounds exclude their own residue characteristic", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      [
        "from sagejs.hyperelliptic_curves.torsion import _corrected_reduction_bound",
        "rows=[",
        " {'prime':'3','jacobian_order':'3'},",
        " {'prime':'5','jacobian_order':'9'},",
        "]",
        "upper,raw,corrections=_corrected_reduction_bound(rows)",
        "assert raw == 3 and upper == 9",
        "assert corrections[0]['added_exponent'] == 1",
        "def val(n,p):",
        " e=0",
        " while n%p == 0:",
        "  n//=p",
        "  e+=1",
        " return e",
        "for orders in [(72,180,350),(27,45,63),(80,150,196),(11,121,1331)]:",
        " test_rows=[{'prime':str(p),'jacobian_order':str(n)} for p,n in zip((3,5,7),orders)]",
        " test_upper,_,_=_corrected_reduction_bound(test_rows)",
        " for ell in (2,3,5,7,11):",
        "  expected=min(val(n,ell) for p,n in zip((3,5,7),orders) if p != ell)",
        "  assert val(test_upper,ell) == expected",
        "[raw,upper,corrections]",
      ].join("\n"),
    );
    assert.equal(
      result.repr,
      "[3, 9, ({'prime': '3', 'gcd_valuation': 1, " +
        "'other_reductions_minimum_valuation': 2, 'added_exponent': 1}, " +
        "{'prime': '5', 'gcd_valuation': 0, " +
        "'other_reductions_minimum_valuation': 0, 'added_exponent': 0})]",
    );
  } finally {
    await session.close();
  }
});

test(
  "good-prime certificates and supplied divisors give honest bounds",
  { timeout: 120_000 },
  async () => {
    const session = await createSage();
    try {
      const result = await session.evaluate(
        [
          "from sagejs.hyperelliptic_curves.torsion import (",
          " certify_supplied_torsion, torsion_bound,",
          " verify_torsion_bound_certificate, verify_torsion_result_certificate,",
          ")",
          "R=PolynomialRing(QQ,'x')",
          "x=R.gen()",
          "J=HyperellipticCurve(x^5-x).jacobian()",
          "B=torsion_bound(J,primes=[3,7],algorithm='exhaustive')",
          "assert B.lower_bound == B.upper_bound == B.order() == 8 and B.exact",
          // PARI hyperellcharpoly oracle: x^4-2*x^2+9 and x^4+14*x^2+49.
          "rows=B.upper_bound_certificate['good_reductions']",
          "assert rows[0]['lpolynomial_coefficients_ascending'] == ('1','0','-2','0','9')",
          "assert rows[0]['jacobian_order'] == '8'",
          "assert rows[1]['lpolynomial_coefficients_ascending'] == ('1','0','14','0','49')",
          "assert rows[1]['jacobian_order'] == '64'",
          "assert verify_torsion_bound_certificate(J,B.upper_bound_certificate)",
          "assert verify_torsion_result_certificate(J,B.certificate)",
          "bad_bound=dict(B.upper_bound_certificate)",
          "bad_bound['theorem']='untrusted theorem text'",
          "try:",
          " verify_torsion_bound_certificate(J,bad_bound)",
          " assert False",
          "except ValueError:",
          " pass",
          "bad_bound=dict(B.upper_bound_certificate)",
          "bad_rows=[dict(row) for row in bad_bound['good_reductions']]",
          "bad_rows[0]['algorithm']='auto'",
          "bad_bound['good_reductions']=tuple(bad_rows)",
          "try:",
          " verify_torsion_bound_certificate(J,bad_bound)",
          " assert False",
          "except ArithmeticError:",
          " pass",
          "Jbad=HyperellipticCurve(x^5-5*x).jacobian()",
          "Auto=torsion_bound(Jbad,count=2,max_prime=7,algorithm='exhaustive')",
          "assert tuple(row['prime'] for row in Auto.upper_bound_certificate['good_reductions']) == ('3','7')",
          "assert Auto.upper_bound_certificate['skipped_candidates'][0]['prime'] == '5'",
          "bad_auto=dict(Auto.upper_bound_certificate)",
          "bad_skips=[dict(row) for row in bad_auto['skipped_candidates']]",
          "bad_skips[0]['reason'] += ' tampered'",
          "bad_auto['skipped_candidates']=tuple(bad_skips)",
          "try:",
          " verify_torsion_bound_certificate(Jbad,bad_auto)",
          " assert False",
          "except ArithmeticError:",
          " pass",
          "A=certify_supplied_torsion(J,[],bound=B)",
          "assert A.lower_bound == 8 and A.upper_bound == B.upper_bound",
          "assert verify_torsion_result_certificate(J,A.certificate)",
          "forged=dict(A.certificate)",
          "generator_certificates=list(forged['generator_order_certificates'])",
          "first=dict(generator_certificates[0])",
          "witnesses=list(first['reduction_witnesses'])",
          "witness=dict(witnesses[0])",
          "witness['reduction_order']='999'",
          "witnesses[0]=witness",
          "first['reduction_witnesses']=tuple(witnesses)",
          "generator_certificates[0]=first",
          "forged['generator_order_certificates']=tuple(generator_certificates)",
          "try:",
          " verify_torsion_result_certificate(J,forged)",
          " assert False",
          "except ArithmeticError:",
          " pass",
          "[B.lower_bound,B.upper_bound,B.exact,A.invariants]",
        ].join("\n"),
        { timeout: 120_000 },
      );
      assert.match(result.repr, /^\[8, \d+, (True|False), \(2, 2, 2\)\]$/);
    } finally {
      await session.close();
    }
  },
);

test(
  "supplied odd torsion and dependent inputs replay to the same subgroup",
  { timeout: 120_000 },
  async () => {
    const session = await createSage();
    try {
      const result = await session.evaluate(
        [
          "from sagejs.hyperelliptic_curves.torsion import (",
          " certify_supplied_torsion, rational_mumford_data, torsion_bound,",
          " verify_torsion_result_certificate,",
          ")",
          "R=PolynomialRing(QQ,'x')",
          "x=R.gen()",
          "u=x^2-2*x-2",
          "v=x^3-2*x^2-2*x-2",
          // Since f=v^2-u^3, div(y-v) proves that (u,v mod u) has order 3.
          "J=HyperellipticCurve(v^2-u^3).jacobian()",
          "D=J([u,v%u])",
          "assert not D.is_zero() and (3*D).is_zero() and not (2*D).is_zero()",
          "B=torsion_bound(J,count=3,max_prime=11,algorithm='exhaustive')",
          "assert B.bounds() == (2,6)",
          "A=certify_supplied_torsion(J,[D,2*D,D,J.zero()],bound=B)",
          "assert A.exact and A.order() == 6 and A.invariants == (6,)",
          "assert len(A.certificate['supplied_generators']) == 4",
          "assert len(A.certificate['input_generator_order_certificates']) == 3",
          "assert verify_torsion_result_certificate(J,A.certificate)",
          "for proof in A.certificate['input_generator_order_certificates']:",
          " for witness in proof['reduction_witnesses']:",
          "  if witness['status'] == 'verified':",
          "   assert int(witness['finite_jacobian_order']) % int(witness['reduction_order']) == 0",
          "   q=int(witness['specialization_kernel_quotient'])",
          "   p=int(witness['prime'])",
          "   while q > 1 and q % p == 0:",
          "    q //= p",
          "   assert q == 1",
          "forged=dict(A.certificate)",
          "supplied=list(forged['supplied_generators'])",
          "supplied[0]=rational_mumford_data(J,J.zero())",
          "forged['supplied_generators']=tuple(supplied)",
          "try:",
          " verify_torsion_result_certificate(J,forged)",
          " assert False",
          "except ArithmeticError:",
          " pass",
          "[B.bounds(),A.invariants,A.order()]",
        ].join("\n"),
        { timeout: 120_000 },
      );
      assert.equal(result.repr, "[(2, 6), (6,), 6]");
    } finally {
      await session.close();
    }
  },
);

test(
  "genus-3 bounds include the complete rational two-torsion lower bound",
  { timeout: 120_000 },
  async () => {
    const session = await createSage();
    try {
      const result = await session.evaluate(
        [
          "from sagejs.hyperelliptic_curves.torsion import (",
          " rational_two_torsion, torsion_bound, verify_torsion_result_certificate,",
          ")",
          "R=PolynomialRing(QQ,'z')",
          "z=R.gen()",
          "J=HyperellipticCurve(z^7-z).jacobian()",
          "T=rational_two_torsion(J)",
          "assert T.dimension == 4 and T.order == 16",
          "B=torsion_bound(J,primes=[5,11],algorithm='exhaustive')",
          // PARI hyperellcharpoly oracles give finite orders 160 and 1728.
          "rows=B.upper_bound_certificate['good_reductions']",
          "assert rows[0]['lpolynomial_coefficients_ascending'] == ('1','2','-1','-12','-5','50','125')",
          "assert rows[0]['jacobian_order'] == '160'",
          "assert rows[1]['lpolynomial_coefficients_ascending'] == ('1','0','33','0','363','0','1331')",
          "assert rows[1]['jacobian_order'] == '1728'",
          "assert B.lower_bound == 16 and B.upper_bound == 32 and not B.exact",
          "try:",
          " B.order()",
          " assert False",
          "except ValueError:",
          " pass",
          "assert verify_torsion_result_certificate(J,B.certificate)",
          "[T.dimension,T.order,B.lower_bound,B.upper_bound]",
        ].join("\n"),
        { timeout: 120_000 },
      );
      assert.equal(result.repr, "[4, 16, 16, 32]");
    } finally {
      await session.close();
    }
  },
);

test("QQ Mumford certificates reject tampering and nontorsion", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      [
        "from sagejs.hyperelliptic_curves.torsion import (",
        " certify_supplied_torsion, rational_mumford_data,",
        " rational_mumford_from_data, torsion_bound,",
        ")",
        "R=PolynomialRing(QQ,'x')",
        "x=R.gen()",
        "J=HyperellipticCurve(x^5-x).jacobian()",
        "D=J([x,0])",
        "data=rational_mumford_data(J,D)",
        "bad=dict(data)",
        "bad['u_coefficients_ascending']=({'numerator':'1','denominator':'2'}, {'numerator':'1','denominator':'1'})",
        "try:",
        " rational_mumford_from_data(J,bad)",
        " assert False",
        "except (ValueError,ArithmeticError):",
        " pass",
        "B=torsion_bound(J,primes=[3,7],algorithm='exhaustive')",
        "C=HyperellipticCurve(x^5-x+1)",
        "K=C.jacobian()",
        "P=K.point_to_divisor((0,1))",
        "BK=torsion_bound(K,primes=[3,5],algorithm='exhaustive')",
        "try:",
        " certify_supplied_torsion(K,[P],bound=BK)",
        " assert False",
        "except ValueError as error:",
        " assert 'not torsion' in str(error)",
        "True",
      ].join("\n"),
      { timeout: 120_000 },
    );
    assert.equal(result.repr, "True");
  } finally {
    await session.close();
  }
});
