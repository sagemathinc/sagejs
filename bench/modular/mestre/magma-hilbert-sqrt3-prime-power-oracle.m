// Independent Magma oracle for the Q(sqrt(3)), level 13a^2 old/new packet.
//
// Magma deliberately uses its downward-trace algorithm when the level prime
// has exponent at least two.  The invariant comparison is the cuspidal and
// new dimensions plus characteristic polynomials away from the level; the
// concrete ambient basis is printed only as diagnostic provenance because
// quaternion ideal and orbit representatives are not canonical across runs.

SetSeed(20260828);

Q<x> := PolynomialRing(Rationals());
F<a> := NumberField(x^2 - 3);
OF := Integers(F);
level_prime := [z[1] : z in Factorization(13*OF) |
    Basis(z[1])[2] eq OF![4, 1]][1];

M := HilbertCuspForms(F, level_prime^2);
N := NewSubspace(M);

print "PACKET_BEGIN";
print "FIELD_POLYNOMIAL", DefiningPolynomial(F);
print "LEVEL_BASIS", [[Integers()!c : c in Eltseq(b)]
    : b in Basis(level_prime^2)];
print "CUSP_DIMENSION", Dimension(M);
print "NEW_DIMENSION", Dimension(N);
print "NEW_BASIS_DIAGNOSTIC";
print N`basis_matrix;

for rational_prime in [2, 3] do
    prime := [z[1] : z in Factorization(rational_prime*OF) |
        Norm(z[1]) eq rational_prime][1];
    operator := HeckeOperator(N, prime);
    print "HECKE_BEGIN", rational_prime;
    print operator;
    print "CHARPOLY", CharacteristicPolynomial(operator);
    print "HECKE_END", rational_prime;
end for;

print "PACKET_END";

