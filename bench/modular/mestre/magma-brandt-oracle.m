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

// A coefficient-field packet used to test more than characteristic
// polynomials.  Magma's Brandt matrices act on row vectors, hence the
// transpose in the right-kernel calculation.  The same vector and Hecke
// values must be obtained by both of Magma's independent construction modes.
Q<x> := PolynomialRing(Rationals());
for use_grams in [true, false] do
    B := BrandtModule(67, 1 : ComputeGrams := use_grams);
    K<a> := NumberField(x^2 + 3*x + 1);
    T2 := ChangeRing(HeckeOperator(B, 2), K);
    packet := Nullspace(Transpose(T2 - a*IdentityMatrix(K, Dimension(B))));
    assert Dimension(packet) eq 1;
    v := Basis(packet)[1];
    printf "ALGEBRAIC p=67 grams=%o field=%o vector=%o\n",
        use_grams, DefiningPolynomial(K), v;
    for ell in [2, 3, 5, 7, 11] do
        image := v * ChangeRing(HeckeOperator(B, ell), K);
        pivot := Min([i : i in [1..#Eltseq(v)] | v[i] ne 0]);
        eigenvalue := image[pivot] / v[pivot];
        assert image eq eigenvalue*v;
        printf "EIGENVALUE ell=%o value=%o\n", ell, eigenvalue;
    end for;
end for;
