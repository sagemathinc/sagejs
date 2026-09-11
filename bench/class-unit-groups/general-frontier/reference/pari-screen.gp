\\ M0 reference screening, not a detached certificate verifier.
\\ Invoke frontier_case(id, ascending_coefficients, bits, iterations, seed).
\\ Every iteration constructs fresh bnf state; no b.fu or nffactorback.

frontier_class_power(b, j) = {
  my(reduced = idealpow(b, [b.gen[j], Mat([1, 1])], b.cyc[j], 1), answer);
  answer = bnfisprincipal(b, reduced[1], 4);
  if(answer[1] != vector(#b.cyc, k, 0)~, error("class power is not principal"));
  \\ Keep the principal multiplier removed by reduction! bnfisprincipal on
  \\ the reduced ideal alone certifies a different ideal.
  return(concat(reduced[2]~, answer[2]~)~);
};

frontier_case(id, coefficients, bits, iterations, seed) = {
  my(started, elapsed, polynomial, b, u, unit_coordinates, class_coordinates,
     probes, decompositions, materialized, class_powers);
  if(bits != 100 && bits != 200, error("precision must be 100 or 200"));
  if(iterations < 1 || iterations > 100000, error("invalid batch size"));
  default(realbitprecision, bits);
  setrand(seed);
  started = getwalltime();
  for(iteration = 1, iterations,
    polynomial = Polrev(coefficients);
    b = bnfinit(polynomial, 1);
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
    \\ Materialize compact data inside the measured boundary. Native GP text
    \\ remains explicitly tagged; it is not an independent replay format.
    materialized = Str([b.no, b.cyc, b.disc, b.sign, b.zk, b.gen, b.tu, u[1],
                        unit_coordinates, class_coordinates, class_powers, probes,
                        decompositions, b.reg]);
  );
  elapsed = getwalltime() - started;
  print("FRONTIER_RESULT|", id, "|", bits, "|", iterations, "|", elapsed,
        "|", b.no, "|", b.cyc, "|", b.disc, "|", b.sign, "|", b.tu[1],
        "|", b.reg);
  print("FRONTIER_COMPACT|", id, "|", materialized);
};
