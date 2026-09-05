// Independent Magma oracle for the weight-2 Gamma0 modular-abelian corpus.

SetColumns(0);

for level in [11, 33, 37, 43, 67, 97] do
    space := CuspidalSubspace(ModularForms(Gamma0(level), 2));
    t2 := CharacteristicPolynomial(HeckeOperator(space, 2));
    t3 := CharacteristicPolynomial(HeckeOperator(space, 3));
    printf "SAGEJS_ABVAR_MAGMA|%o|%o|%o|%o\n",
        level, Dimension(space), t2, t3;
end for;

quit;
