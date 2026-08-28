// Exact Magma oracle for the first non-icosian Hilbert Brandt module.
//
// The ambient basis is allowed to vary because Magma chooses representatives
// while enumerating ideal classes and projective-line orbits.  This script
// prints the complete arithmetic packet needed to reconstruct that basis:
// fundamental-domain points, local unit images, transporter images, mass
// pairing, Eisenstein vectors, ambient operators, and cuspidal operators.

SetSeed(20260828);

Q<x> := PolynomialRing(Rationals());
F<a> := NumberField(x^2 - 3);
OF := Integers(F);
level := [z[1] : z in Factorization(13*OF) |
    Basis(z[1])[2] eq OF![4, 1]][1];
M := HilbertCuspForms(F, level);

prime_data := [* *];
for rational_prime in [2, 3, 11] do
    for entry in Factorization(rational_prime*OF) do
        prime := entry[1];
        if Norm(prime) eq rational_prime then
            label := IntegerToString(rational_prime);
            if rational_prime eq 11 then
                label cat:= Basis(prime)[2] eq OF![5, 1] select "a" else "b";
            end if;
            operator := HeckeOperator(M, prime);
            Append(~prime_data, <label, prime, operator>);
        end if;
    end for;
end for;

split := M`splitting_map;
ideals := M`rids;

print "PACKET_BEGIN";
print "FIELD_POLYNOMIAL", DefiningPolynomial(F);
print "FIELD_DISCRIMINANT", Discriminant(OF);
print "LEVEL_BASIS", [[Integers()!c : c in Eltseq(b)] : b in Basis(level)];

for i in [1 .. #ideals] do
    direct_factor := M`ModFrmHilDirFacts[i];
    print "COMPONENT", i;
    print "FD", [[Integers()!direct_factor`PLD`FD[j][r, 1] : r in [1, 2]]
        : j in [1 .. #direct_factor`PLD`FD]];
    print "STABILIZERS", direct_factor`PLD`StabOrders;
    unit_group, unit_map := UnitGroup(LeftOrder(ideals[i]));
    units := [Algebra(QuaternionOrder(M)) | u @ unit_map : u in unit_group];
    print "UNITS_BEGIN", i;
    for unit in units do
        print [Integers()!c mod 13 : c in Eltseq(unit @ split)];
    end for;
    print "UNITS_END", i;
end for;

order := QuaternionOrder(M);
for datum in prime_data do
    label := datum[1];
    prime := datum[2];
    operator := datum[3];
    print "PRIME_BEGIN", label, Norm(prime),
        [[Integers()!c : c in Eltseq(b)] : b in Basis(prime)];
    print "BIG";
    print M`HeckeBig[prime];
    print "CUSP";
    print operator;
    for record in order`RightIdealClasses do
        if assigned record`tps and IsDefined(record`tps, prime) then
            transporters := record`tps[prime];
            for source, target in [1 .. #ideals] do
                if IsDefined(transporters, <source, target>) then
                    print "TRANSITION_BEGIN", source, target;
                    for transporter in transporters[<source, target>] do
                        print [Integers()!c mod 13
                            : c in Eltseq(transporter @ split)];
                    end for;
                    print "TRANSITION_END", source, target;
                end if;
            end for;
            break;
        end if;
    end for;
    print "PRIME_END", label;
end for;

print "INNER";
print M`InnerProductBig;
print "EISENSTEIN";
print M`eisenstein_basis;
print "PACKET_END";

