\\ Exact toy oracles only: expansion here is intentionally NOT in the worker.
\\ Loaded after pari-screen.gp by the bounded Python diagnostic below.
frontier_assert(condition, message) = if(!condition, error(message));
frontier_reject(action, message) = {
  iferr(action(), exception, return(1));
  error(message);
};
frontier_literal(b, coordinates) = {
  my(result = idealhnf(b, 1));
  for(j = 1, #coordinates, result = idealmul(b, result, idealpow(b, b.gen[j], coordinates[j])));
  return(result);
};
frontier_equation(b, ideal, coordinates, witness) = idealhnf(b, ideal) == idealmul(b, frontier_literal(b, coordinates), nffactorback(b, witness));

frontier_explicit_smoke() = {
  my(b = bnfinit(x^2 + 4, 1), fractional, encoded, reduced, answer, literal, multiplier, mutations = 0,
     polynomials = [x^2 + 4, x^2 + 21, x^2 + 39, x^3 + 14*x - 1, x^4 + 1], u, native, exported, expanded, p);
  frontier_assert(frontier_json_element(b, [0, 1]~, 2) == "[\"0\",\"1/2\"]", "basis column must be converted through b.zk");
  frontier_assert(frontier_json_element(b, 1/2, 2) == "[\"1/2\",\"0\"]", "rational leaf");
  frontier_assert(frontier_json_element(b, x/2, 2) == "[\"0\",\"1/2\"]", "polynomial leaf");
  frontier_assert(frontier_json_element(b, Mod(x/2, b.pol), 2) == "[\"0\",\"1/2\"]", "polmod leaf");
  frontier_reject(() -> frontier_json_element(b, Mod(x, x^2 + 1), 2), "foreign polmod accepted");
  frontier_reject(() -> frontier_json_element(b, Mod(1, x^2 + 1), 2), "foreign scalar polmod accepted");
  frontier_reject(() -> frontier_json_element(b, [0, 1], 2), "vector accepted as element");
  frontier_reject(() -> frontier_json_element(b, [0, 1/2.]~, 2), "inexact basis column accepted");
  frontier_reject(() -> frontier_json_element(b, y, 2), "foreign variable accepted");
  frontier_reject(() -> frontier_json_factored(b, []~, 2), "missing witness accepted as identity");
  frontier_reject(() -> frontier_json_factored(b, Mat([0, -1]), 2), "zero factor accepted");
  frontier_reject(() -> frontier_json_factored(b, Mat([2, 1/2]), 2), "rational exponent accepted");
  frontier_assert(frontier_json_factored(b, matrix(0, 2), 2) == "[]", "empty identity");
  frontier_assert(frontier_json_factored(b, Mat([2, 0]), 2) == "[]", "zero exponent omitted");
  frontier_assert(frontier_json_factored(b, Mat([2, -3]), 2) == "[{\"factor\":[\"2\",\"0\"],\"exponent\":\"-3\"}]", "negative exponent");
  fractional = idealhnf(b, (1 + Mod(x/2, b.pol))/2);
  frontier_assert(fractional == [1, 1/2; 0, 1/2], "asymmetric fractional fixture drift");
  frontier_assert(frontier_json_ideal(b, fractional, 2) == "[[\"1\",\"0\"],[\"1/2\",\"1/4\"]]", "ideal columns or equation-order index lost");
  print("FRONTIER_TEST|rational-basis-modulus-guards|ok");
  for(k = 1, #polynomials,
    b = bnfinit(polynomials[k], 1);
    if(k == 4, frontier_assert(b.cyc == [4, 2], "unequal class order fixture drift"));
    for(j = 1, #b.gen,
      literal = idealpow(b, b.gen[j], b.cyc[j]);
      frontier_assert(frontier_equation(b, literal, vector(#b.gen), frontier_class_power(b, j)), "class power witness failed");
      reduced = idealpow(b, [b.gen[j], Mat([1, 1])], b.cyc[j], 1);
      answer = bnfisprincipal(b, reduced[1], 4);
      multiplier = nffactorback(b, reduced[2]);
      if(idealhnf(b, multiplier) != idealhnf(b, 1),
        mutations++;
        frontier_assert(!frontier_equation(b, literal, answer[1], answer[2]), "dropping reduction multiplier was invisible");
        frontier_assert(idealhnf(b, literal) != idealhnf(b, nfeltdiv(b, nffactorback(b, answer[2]), multiplier)), "inverting reduction multiplier was invisible")
      );
      literal = idealpow(b, b.gen[j], 3);
      answer = bnfisprincipal(b, literal, 4);
      frontier_assert(frontier_equation(b, literal, answer[1], answer[2]), "literal decomposition failed");
      answer[1][j]++;
      frontier_assert(!frontier_equation(b, literal, answer[1], answer[2]), "changed class coordinate was invisible")
    );
    if(k == 3,
      literal = idealpow(b, b.gen[1], 3);
      reduced = idealred(b, [literal, Mat([1, 1])]);
      frontier_assert(reduced[1] != literal, "composite class ideal did not reduce")
    );
    forstep(bits = 100, 200, 100,
      frontier_case(Str("explicit-", k, "-", bits), vector(poldegree(polynomials[k]) + 1, j, polcoef(polynomials[k], j - 1)), bits, 1, 1)
    )
  );
  frontier_assert(mutations > 0, "no nontrivial reduction multiplier exercised");
  print("FRONTIER_TEST|reduction-multiplier-mutations|", mutations);
  b = bnfinit(x^4 + 1, 1); u = bnfunits(b);
  frontier_assert(b.tu[1] == 8 && #u[1] == 2, "torsion-eight fixture drift");
  native = [-2, 3]~;
  expanded = nffactorback(b, vector(#u[1], j, nffactorback(b, u[1][j])), Vec(native));
  frontier_assert(bnfisunit(b, expanded, u) == native, "mixed native coordinates");
  exported = frontier_unit_coordinates(native); p = frontier_unit_permutation(#u[1]);
  frontier_assert(exported == [3, -2], "torsion-last to first mixed coordinates");
  frontier_assert(nffactorback(b, vector(#p, j, nffactorback(b, u[1][p[j]])), exported) == expanded, "mixed exported coordinate replay");
  frontier_assert(nffactorback(b, vector(#p, j, nffactorback(b, u[1][p[j]])), Vec(native)) != expanded, "unpermuted mixed coordinates were invisible");
  print("FRONTIER_TEST|mixed-torsion-coordinate-permutation|ok");
  frontier_case("explicit-batch", [4, 0, 1], 100, 2, 1);
  print("FRONTIER_TEST|version|", version());
  print("FRONTIER_TEST|complete|ok");
};

\\ Receive only coefficient vectors constructed from strictly decoded JSON by
\\ the Python toy oracle. This is not a parser for GP expressions or field labels.
frontier_decode_element(b, coefficients) = Mod(Polrev(coefficients), b.pol);
frontier_decode_ideal(b, basis) = {
  my(columns = vector(#basis, j, nfalgtobasis(b, frontier_decode_element(b, basis[j]))));
  return(idealhnf(b, Mat(columns)));
};
frontier_decode_factored(b, factors) = {
  my(result = Mod(1, b.pol));
  for(j = 1, #factors, result *= frontier_decode_element(b, factors[j][1])^factors[j][2]);
  return(result);
};
frontier_replay_equation(b, ideal_basis, generator_bases, coordinates, factors) = {
  my(result = idealhnf(b, frontier_decode_factored(b, factors)));
  for(j = 1, #coordinates, result = idealmul(b, result, idealpow(b, frontier_decode_ideal(b, generator_bases[j]), coordinates[j])));
  return(frontier_decode_ideal(b, ideal_basis) == result);
};
