cases := [
    <13, [1,2,0,0,0,0,0,1], [0]>,
    <19, [1,2,0,0,0,0,0,1], [0]>,
    <5, [1,1,0,0,0,1], [1,0,1]>
];

for item in cases do
    prime := item[1];
    P<x> := PolynomialRing(GF(prime));
    f := P![GF(prime)!coefficient : coefficient in item[2]];
    h := P![GF(prime)!coefficient : coefficient in item[3]];
    curve := HyperellipticCurve(f, h);
    jacobian := Jacobian(curve);
    group, embedding := AbelianGroup(jacobian);
    printf "%o %o %o\n", prime, #jacobian, Invariants(group);
end for;

quit;
