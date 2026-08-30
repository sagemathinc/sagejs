// Reproduce the independent rank-four lattice fixture used by C8.
SetSeed(1);
O := QuaternionOrder(37, 2);
ideals := LeftIdealClasses(O);
assert #ideals eq 9;
print "SAGEJS_BRANDT_RANK_FOUR_V1", #ideals;
for i in [1..3] do
    basis := ZBasis(ideals[i]);
    denominators := &cat[
        [ Denominator(c) : c in Eltseq(value) ] : value in basis
    ];
    scale := LCM(denominators);
    rows := [
        [ Integers()!(scale*c) : c in Eltseq(value) ] : value in basis
    ];
    hnf := HermiteForm(Matrix(Integers(), rows));
    print "IDEAL", i;
    print "SCALE", scale;
    print "BASIS", rows;
    print "ROW_HNF", Eltseq(hnf);
end for;
quit;
