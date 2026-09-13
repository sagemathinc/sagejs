// Reproducible Magma benchmark and exact oracle for classical Brandt modules.
//
// Environment:
//   MESTRE_BENCH_PRIMES=37,389
//   MESTRE_BENCH_REPEAT=3
//   MESTRE_BENCH_WARM_ITERATIONS=100000

prime_text := GetEnv("MESTRE_BENCH_PRIMES");
repeat_text := GetEnv("MESTRE_BENCH_REPEAT");
warm_text := GetEnv("MESTRE_BENCH_WARM_ITERATIONS");
primes := prime_text eq "" select [37, 389]
    else [StringToInteger(value) : value in Split(prime_text, ",")];
repetitions := repeat_text eq "" select 3 else StringToInteger(repeat_text);
warm_iterations := warm_text eq "" select 100000 else StringToInteger(warm_text);
assert repetitions gt 0;
assert warm_iterations gt 0;

for p in primes do
    assert IsPrime(p) and p ge 5;
    for use_grams in [true, false] do
        mode := use_grams select "gram-theta" else "neighboring-ideals";
        for sample in [1..repetitions] do
            started := Cputime();
            B := BrandtModule(p, 1 : ComputeGrams := use_grams);
            construction_cpu := Cputime(started);

            started := Cputime();
            T := HeckeOperator(B, 2);
            first_cpu := Cputime(started);

            started := Cputime();
            for iteration in [1..warm_iterations] do
                warm := HeckeOperator(B, 2);
                assert warm eq T;
            end for;
            warm_batch_cpu := Cputime(started);
            warm_cpu := warm_batch_cpu / warm_iterations;

            row_sum := &+[Integers() | T[1, column] : column in [1..Ncols(T)]];
            coefficients := Dimension(B) le 64
                select Eltseq(CharacteristicPolynomial(T))
                else [Integers() | ];
            printf "MESTRE p=%o mode=%o sample=%o dimension=%o ",
                p, mode, sample, Dimension(B);
            printf "construction_cpu=%o first_cpu=%o warm_cpu=%o ",
                construction_cpu, first_cpu, warm_cpu;
            printf "warm_iterations=%o warm_batch_cpu=%o ",
                warm_iterations, warm_batch_cpu;
            printf "trace=%o row_sum=%o charpoly_count=%o\n",
                Trace(T), row_sum, #coefficients;
            for position in [1..#coefficients] do
                printf "COEFF p=%o mode=%o sample=%o index=%o value=%o\n",
                    p, mode, sample, position, coefficients[position];
            end for;
        end for;
    end for;
end for;
