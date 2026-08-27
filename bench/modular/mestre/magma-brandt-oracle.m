// Exact Magma oracle for the classical Mestre/Brandt acceptance corpus.
//
// Run with Magma 2.18-5 or newer. Both construction modes are intentional:
// the default uses reduced Gram theta series, while ComputeGrams := false
// uses the neighboring-ideal graph algorithm.

SetSeed(20260827);

for p in [11, 37, 67] do
    for use_grams in [true, false] do
        started := Cputime();
        B := BrandtModule(p, 1 : ComputeGrams := use_grams);
        printf "BEGIN p=%o grams=%o dimension=%o construction_cpu=%o\n",
            p, use_grams, Dimension(B), Cputime(started);
        print "PAIRING";
        print InnerProductMatrix(B);
        for ell in [2, 3, 5] do
            if ell ne p then
                started := Cputime();
                T := HeckeOperator(B, ell);
                printf "HECKE ell=%o first_cpu=%o\n", ell, Cputime(started);
                print T;
                print "CHARPOLY_COEFFICIENTS", Eltseq(CharacteristicPolynomial(T));
            end if;
        end for;
        print "END";
    end for;
end for;

