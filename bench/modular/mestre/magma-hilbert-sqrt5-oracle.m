// Exact and timed Magma oracle for the Q(sqrt(5)) icosian corpus.

SetSeed(20260828);

Q<x> := PolynomialRing(Rationals());
F<a> := NumberField(x^2 - x - 1);
OF := Integers(F);
levels := [<31, 19>, <389, 238>, <809, 467>, <2011, 736>];
repetitions := 3;
warm_iterations := 1000;

for datum in levels do
    p := datum[1];
    root := datum[2];
    level := [entry[1] : entry in Factorization(p*OF) |
        (Integers()!Eltseq(Basis(entry[1])[2])[1] + root) mod p eq 0][1];
    for sample in [1..repetitions] do
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

        printf "HILBERT level=%o root=%o sample=%o cusp_dimension=%o ",
            p, root, sample, Dimension(M);
        printf "construction_cpu=%o t2_cpu=%o t3_cpu=%o ",
            construction_cpu, t2_cpu, t3_cpu;
        printf "warm_iterations=%o warm_t2_batch_cpu=%o\n",
            warm_iterations, warm_batch_cpu;
        if sample eq 1 then
            for pair in [<2, T2>, <3, T3>] do
                coefficients := Eltseq(CharacteristicPolynomial(pair[2]));
                for position in [1..#coefficients] do
                    printf "HILBERT_COEFF level=%o index=%o position=%o value=%o\n",
                        p, pair[1], position, coefficients[position];
                end for;
            end for;
        end if;
    end for;
end for;
