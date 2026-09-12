\\ M0 reference screening, not a detached certificate verifier.
\\ Invoke frontier_case(id, ascending_coefficients, bits, iterations, seed, proof_policy).
\\ Every iteration constructs fresh bnf state; no b.fu or nffactorback.

frontier_json_array(items) = Str("[", strjoin(items, ","), "]");
frontier_json_object(items) = Str("{", strjoin(items, ","), "}");
frontier_json_key(key, encoded) = Str("\"", key, "\":", encoded);
frontier_json_integer(value) = {
  if(type(value) != "t_INT", error("expected exact integer"));
  return(Str("\"", value, "\""));
};
frontier_json_rational(value) = {
  if(type(value) != "t_INT" && type(value) != "t_FRAC", error("expected rational coefficient"));
  return(Str("\"", value, "\""));
};
frontier_json_integers(values) = frontier_json_array(vector(#values, j, frontier_json_integer(values[j])));

frontier_element_coefficients(b, value, n) = {
  my(kind = type(value), polynomial);
  if(kind == "t_POLMOD",
    if(component(value, 1) != b.pol, error("element has a different field modulus")),
    if(kind == "t_COL",
      if(#value != n, error("invalid integral-basis column"));
      for(j = 1, n, frontier_json_rational(value[j])),
      if(kind != "t_INT" && kind != "t_FRAC" && kind != "t_POL", error("unsupported element type"))
    )
  );
  if(kind == "t_POL" && variable(value) != variable(b.pol), error("element has a different variable"));
  polynomial = lift(nfbasistoalg(b, value));
  if(poldegree(polynomial) >= n, error("element degree was not reduced"));
  return(vector(n, j, my(c = polcoef(polynomial, j - 1)); frontier_json_rational(c); c));
};
frontier_json_element(b, value, n) = {
  my(coefficients = frontier_element_coefficients(b, value, n));
  return(frontier_json_array(vector(n, j, frontier_json_rational(coefficients[j]))));
};
frontier_json_ideal(b, value, n) = {
  my(h = idealhnf(b, value));
  if(type(h) != "t_MAT" || matsize(h) != [n, n], error("invalid ideal basis"));
  \\ HNF columns, not rows, are basis elements in b.zk coordinates.
  return(frontier_json_array(vector(n, j, frontier_json_element(b, h[, j], n))));
};
frontier_json_factored(b, value, n) = {
  my(size, rows = List(), coefficients);
  if(type(value) != "t_MAT", error("missing or invalid factored element"));
  size = matsize(value);
  if(size[1] == 0 && (size[2] == 0 || size[2] == 2), return("[]"));
  if(size[2] != 2, error("invalid factorization columns"));
  for(j = 1, size[1],
    frontier_json_integer(value[j, 2]);
    if(value[j, 2] != 0,
      coefficients = frontier_element_coefficients(b, value[j, 1], n);
      if(coefficients == vector(n), error("zero factor"));
      listput(rows, frontier_json_object([
        frontier_json_key("factor", frontier_json_array(vector(n, k, frontier_json_rational(coefficients[k])))),
        frontier_json_key("exponent", frontier_json_integer(value[j, 2]))
      ]))
    )
  );
  return(frontier_json_array(Vec(rows)));
};
frontier_json_decomposition(b, pair, n) = {
  return(frontier_json_object([
    frontier_json_key("coordinates", frontier_json_integers(pair[1])),
    frontier_json_key("generator_product_witness", frontier_json_factored(b, pair[2], n))
  ]));
};
frontier_unit_permutation(m) = vector(m, j, if(j == 1, m, j - 1));
frontier_unit_coordinates(coordinates) = {
  my(p = frontier_unit_permutation(#coordinates));
  return(vector(#p, j, coordinates[p[j]]));
};

frontier_json_compact(b, u, unit_coordinates, class_coordinates, class_powers, probes, decompositions, bits, initial_bits, regulator_text, proof_policy) = {
  my(n = poldegree(b.pol), m = #u[1], p = frontier_unit_permutation(m), basis = b.zk,
     reg_precision = if(type(b.reg) == "t_REAL", Str(bitprecision(b.reg)), "null"));
  return(frontier_json_object([
    frontier_json_key("class_number", frontier_json_integer(b.no)),
    frontier_json_key("class_invariants", frontier_json_integers(b.cyc)),
    frontier_json_key("discriminant", frontier_json_integer(b.disc)),
    frontier_json_key("signature", Str("[", b.sign[1], ",", b.sign[2], "]")),
    frontier_json_key("integral_basis", frontier_json_array(vector(n, j, frontier_json_element(b, basis[j], n)))),
    frontier_json_key("class_generators", frontier_json_array(vector(#b.gen, j, frontier_json_ideal(b, b.gen[j], n)))),
    frontier_json_key("class_coordinates", frontier_json_array(vector(#b.gen, j, frontier_json_integers(class_coordinates[j][1])))),
    frontier_json_key("class_decompositions", frontier_json_array(vector(#b.gen, j, frontier_json_decomposition(b, class_coordinates[j], n)))),
    frontier_json_key("class_power_witnesses", frontier_json_array(vector(#b.gen, j, frontier_json_object([
      frontier_json_key("exponent", frontier_json_integer(b.cyc[j])),
      frontier_json_key("witness", frontier_json_factored(b, class_powers[j], n))
    ])))),
    frontier_json_key("unit_invariants", frontier_json_integers(concat([b.tu[1]], vector(m - 1)))),
    frontier_json_key("torsion_order", frontier_json_integer(b.tu[1])),
    frontier_json_key("units", frontier_json_array(vector(m, j, frontier_json_factored(b, u[1][p[j]], n)))),
    frontier_json_key("unit_coordinates", frontier_json_array(vector(m, j, frontier_json_integers(frontier_unit_coordinates(unit_coordinates[p[j]]))))),
    frontier_json_key("probes", frontier_json_array(vector(#probes, j, frontier_json_ideal(b, probes[j], n)))),
    frontier_json_key("decompositions", frontier_json_array(vector(#probes, j, frontier_json_decomposition(b, decompositions[j], n)))),
    frontier_json_key("regulator", frontier_json_object([
      "\"guarantee\":\"working-precision-approximation\"",
      frontier_json_key("requested_working_bits", Str(bits)),
      frontier_json_key("initial_working_bits", Str(initial_bits)),
      frontier_json_key("value_precision_bits", reg_precision),
      frontier_json_key("text", Str("\"", regulator_text, "\"")),
      frontier_json_key("fundamental_units_policy", Str("\"", proof_policy, "\""))
    ]))
  ]));
};

frontier_json_envelope(id, bits, iterations, seed, compact, proof_policy, certification_ms) = {
  my(v = version());
  return(frontier_json_object([
    "\"schema\":\"sagejs-pari-frontier-screen-v3\"",
    frontier_json_key("id", Str("\"", id, "\"")),
    frontier_json_key("bits", Str(bits)),
    frontier_json_key("iterations", Str(iterations)),
    frontier_json_key("seed", frontier_json_integer(seed)),
    frontier_json_key("proof_policy", Str("\"", proof_policy, "\"")),
    frontier_json_key("proof_execution", if(proof_policy == "conditional-grh", "null", frontier_json_object([
      "\"method\":\"pari-bnfcertify-full\"", "\"flag\":0", "\"last_return\":\"1\"",
      frontier_json_key("completed_iterations", Str(iterations)),
      frontier_json_key("certification_milliseconds", frontier_json_integer(certification_ms))
    ]))), "\"independent_replay\":false",
    "\"witness_semantics\":\"ideal-equals-principal-witness-times-literal-class-generator-product\"",
    "\"class_generator_order\":\"pari-bnf.gen\"",
    "\"unit_generator_order\":\"torsion-first-then-bnfunits-free-order\"",
    "\"element_basis\":\"ascending-powers-of-input-generator\"",
    "\"ideal_basis_layout\":\"outer-array-of-basis-elements\"",
    frontier_json_key("pari_version", Str("[", v[1], ",", v[2], ",", v[3], "]")),
    frontier_json_key("retained_iteration", Str(iterations)),
    frontier_json_key("batch_outputs_complete", if(iterations == 1, "true", "false")),
    frontier_json_key("compact", compact)
  ]));
};

frontier_class_power(b, j) = {
  my(reduced = idealpow(b, [b.gen[j], Mat([1, 1])], b.cyc[j], 1), answer);
  answer = bnfisprincipal(b, reduced[1], 4);
  if(answer[1] != vector(#b.cyc, k, 0)~, error("class power is not principal"));
  \\ Keep the principal multiplier removed by reduction! bnfisprincipal on
  \\ the reduced ideal alone certifies a different ideal.
  return(concat(reduced[2]~, answer[2]~)~);
};

frontier_case(id, coefficients, bits, iterations, seed, proof_policy) = {
  my(started, elapsed, polynomial, b, u, unit_coordinates, class_coordinates,
     probes, decompositions, materialized, class_powers, initial_bits, regulator_text, characters,
     certification_ms = 0, certification_started, certified);
  if(type(id) != "t_STR" || #id == 0, error("invalid request id"));
  characters = Vecsmall(id);
  for(j = 1, #characters,
    if(!((characters[j] >= 97 && characters[j] <= 122) || (characters[j] >= 48 && characters[j] <= 57) || characters[j] == 45 || characters[j] == 46), error("invalid request id"))
  );
  if(type(bits) != "t_INT" || (bits != 100 && bits != 200), error("precision must be 100 or 200"));
  if(type(iterations) != "t_INT" || iterations < 1 || iterations > 10000, error("invalid batch size"));
  if(type(seed) != "t_INT" || seed < 1, error("invalid seed"));
  if(type(proof_policy) != "t_STR" || (proof_policy != "conditional-grh" && proof_policy != "unconditional"), error("invalid proof policy"));
  default(realbitprecision, bits);
  initial_bits = default(realbitprecision);
  setrand(seed);
  started = getwalltime();
  for(iteration = 1, iterations,
    polynomial = Polrev(coefficients);
    b = bnfinit(polynomial, 1);
    if(proof_policy == "unconditional",
      certification_started = getwalltime();
      certified = bnfcertify(b, 0);
      certification_ms += getwalltime() - certification_started;
      if(type(certified) != "t_INT" || certified != 1, error("full bnf certification failed"))
    );
    u = bnfunits(b);
    unit_coordinates = vector(#u[1], j, bnfisunit(b, u[1][j], u));
    for(j = 1, #u[1],
      if(unit_coordinates[j] != vector(#u[1], k, k == j)~,
         error("unit generator round trip failed"))
    );
    class_coordinates = vector(#b.gen, j, bnfisprincipal(b, b.gen[j], 4));
    for(j = 1, #b.gen,
      if(class_coordinates[j][1] != vector(#b.gen, k, k == j)~,
         error("class generator round trip failed"))
    );
    class_powers = vector(#b.gen, j, frontier_class_power(b, j));
    probes = [idealadd(b, 2, Mod(x, polynomial)),
              idealadd(b, 3, Mod(x + 1, polynomial)),
              idealadd(b, 5, Mod(x - 1, polynomial))];
    decompositions = vector(#probes, j, bnfisprincipal(b, probes[j], 4));
    \\ Every iteration serializes exact data inside the measured boundary;
    \\ only the final iteration is retained. Regulator remains approximate.
    if(type(b.reg) != "t_REAL" && type(b.reg) != "t_INT" && type(b.reg) != "t_FRAC", error("invalid regulator scalar"));
    regulator_text = Str(b.reg);
    materialized = frontier_json_compact(b, u, unit_coordinates, class_coordinates,
      class_powers, probes, decompositions, bits, initial_bits, regulator_text, proof_policy);
  );
  elapsed = getwalltime() - started;
  print("FRONTIER_RESULT|", id, "|", bits, "|", iterations, "|", elapsed,
        "|", b.no, "|", b.cyc, "|", b.disc, "|", b.sign, "|", b.tu[1],
        "|", regulator_text);
  print("FRONTIER_COMPACT_JSON|", id, "|", frontier_json_envelope(id, bits, iterations, seed, materialized, proof_policy, certification_ms));
};
