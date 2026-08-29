// Process-cold Magma benchmark for one Q(sqrt(5)) Hilbert Brandt module.
//
// Environment:
//   MESTRE_HILBERT_LEVEL=389
//   MESTRE_HILBERT_ROOT=238
//   MESTRE_HILBERT_WARM_ITERATIONS=1000

level_norm := StringToInteger(GetEnv("MESTRE_HILBERT_LEVEL"));
root := StringToInteger(GetEnv("MESTRE_HILBERT_ROOT"));
warm_iterations := StringToInteger(GetEnv("MESTRE_HILBERT_WARM_ITERATIONS"));
assert level_norm gt 1 and root ge 0 and warm_iterations gt 0;

Q<x> := PolynomialRing(Rationals());
F<a> := NumberField(x^2 - x - 1);
OF := Integers(F);
level := [entry[1] : entry in Factorization(level_norm*OF) |
    (Integers()!Eltseq(Basis(entry[1])[2])[1] + root) mod level_norm eq 0][1];

started := Cputime();
M := HilbertCuspForms(F, level);
construction_cpu := Cputime(started);
started := Cputime();
T2 := HeckeOperator(M, 2*OF);
t2_cpu := Cputime(started);
started := Cputime();
T3 := HeckeOperator(M, 3*OF);
t3_cpu := Cputime(started);

started := Cputime();
for iteration in [1..warm_iterations] do
    warm := HeckeOperator(M, 2*OF);
    assert warm eq T2;
end for;
warm_batch_cpu := Cputime(started);

printf "HILBERT_BENCH level=%o root=%o cusp_dimension=%o ",
    level_norm, root, Dimension(M);
printf "construction_cpu=%o t2_cpu=%o t3_cpu=%o ",
    construction_cpu, t2_cpu, t3_cpu;
printf "warm_iterations=%o warm_t2_batch_cpu=%o\n",
    warm_iterations, warm_batch_cpu;
for pair in [<2, T2>, <3, T3>] do
    coefficients := Eltseq(CharacteristicPolynomial(pair[2]));
    for position in [1..#coefficients] do
        printf "HILBERT_BENCH_COEFF level=%o index=%o position=%o value=%o\n",
            level_norm, pair[1], position, coefficients[position];
    end for;
end for;
