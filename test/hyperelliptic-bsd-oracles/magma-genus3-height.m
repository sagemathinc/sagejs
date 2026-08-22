// External genus-3 canonical-height and regulator oracle.
//
// Reproduced with Magma V2.18-5 on x86_64 Linux.  Sage.js works on the
// integral generalized model y^2 + y = f(x).  Magma V2.18-5's Arakelov
// implementation requires y^2 = F(x), so we transport by Y = 2*y + 1.
// This curve isomorphism preserves the canonical principal polarization.

SetColumns(0);

Qx<x> := PolynomialRing(Rationals());
f := x^7 - 9*x^6 + 28*x^5 - 32*x^4 + x^3 + 17*x^2 - 6*x;
h := Qx ! 1;
F := h^2 + 4*f;
u := x*(x - 1)*(x - 2);
v := Qx ! 1;

C := HyperellipticCurve(F);
J := Jacobian(C);
P := J ! [u, v];

height50 := CanonicalHeight(P : Precision := 50);
height100 := CanonicalHeight(P : Precision := 100);
height160 := CanonicalHeight(P : Precision := 160);
pairing160 := HeightPairing(P, P : Precision := 160);
matrix160 := HeightPairingMatrix([P] : Precision := 160);
regulator160 := Regulator([P] : Precision := 160);

major, minor, patch := GetVersion();
printf "magma_version=%o.%o-%o\n", major, minor, patch;
printf "original_model=y^2+y=f(x)\n";
printf "original_f=%o\n", f;
printf "completion_map=Y=2*y+1\n";
printf "completed_model=Y^2=F(x)\n";
printf "completed_F=%o\n", F;
printf "genus=%o\n", Genus(C);
printf "completed_discriminant=%o\n", Discriminant(F);
printf "completed_discriminant_factorization=%o\n", Factorization(Integers() ! Abs(Discriminant(F)));
printf "original_mumford=(u,0)\n";
printf "completed_mumford=%o\n", P;
printf "canonical_height_50=%o\n", height50;
printf "canonical_height_100=%o\n", height100;
printf "canonical_height_160=%o\n", height160;
printf "height_pairing_160=%o\n", pairing160;
printf "height_matrix_11_160=%o\n", matrix160[1, 1];
printf "regulator_rank1_160=%o\n", regulator160;

quit;
