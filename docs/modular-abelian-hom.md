# Hom spaces and endomorphism rings over QQ

The design follows [Sage's modular abelian Hom-space formalism](https://doc.sagemath.org/html/en/reference/modabvar/sage/modular/abvar/homspace.html).

`Hom(A, B)` computes all rationally defined homomorphisms between supported
weight-two Gamma0 modular abelian varieties. `End(A)` is the full integral
endomorphism order over QQ, not merely the image of the Hecke algebra.

```sage
A = J0(11)
E = End(A)
E.rank()                       # 1: End_Q(A) = ZZ
E(2) == A.multiplication_by(2)  # True
E.coordinates(E(2))
```

The Hom group is an additive ZZ-lattice. Its `base_ring()` is QQ, the field of
definition of the varieties; `lattice().base_ring()` is ZZ. `basis_matrix()`
has one flattened integral homology matrix per row, in row-major order.
`gens()` returns actual morphisms; `rank()` and `gens()` force computation.
Merely constructing a Hom parent is lazy.

Decompositions, coefficient-field bases and Hom parents are cached in the
session. Repeated queries reuse exact work; long sweeps over many distinct
levels retain that data until the session ends. Cold benchmark processes do
not benefit from these caches across samples.

## Repeated factors and noncommutative rings

```sage
P = A**2
E = P.endomorphism_ring()
E.rank()                       # 4: M_2(ZZ)
u = P.injection(0) * P.projection(1)
v = P.injection(1) * P.projection(0)
u in E                         # True
u*v == v*u                     # False
E.from_coordinates(E.coordinates(u)) == u  # True
table = E.multiplication_table()
```

Composition follows Sage: `f*g` means first `g`, then `f`. Homology vectors
act on the right, so its matrix is `g.matrix()*f.matrix()`.

```sage
End(J0(23)).rank()              # 2: a quadratic coefficient field order
End(J0(33)).rank()              # 5: repeated old copies plus a new factor
Hom(J0(11), J0(23)).rank()      # 0
Hom(J0(11), J0(22)).rank()      # 2
```

Membership reconstructs every matrix entry after solving a small pivot
system. An integral matrix, or a matrix commuting with selected operators,
is not automatically a geometric homomorphism:

```sage
matrix(ZZ, [[1, 0], [0, 0]]) in End(A)  # False
```

## Quotient models, subvarieties and complementary isogenies

```sage
Q = AbelianVariety(CuspForms(23).newforms()[0])
S = Q.embedded_subvariety()
Hom(Q, S).rank()                # 2
Q.quotient_map() in Hom(J0(23), Q)  # True
f = A.multiplication_by(3)
g = f.complementary_isogeny()
f*g == A.multiplication_by(3)  # True
```

The complementary isogeny is the least positive integral scalar multiple of
the rational inverse. The connected quotient retains its own integral lattice;
it is not identified with the embedded isogenous factor. Products, connected
kernels and images use their existing geometric inclusions.

## Why this is complete and certified

The computation transports coefficient-field bases through the labelled
newform-copy isogeny decomposition. Distinct simple QQ-isogeny classes have
zero Hom; repeated copies contribute full matrix blocks over the coefficient
field. Irreducible Hecke polynomials certify simple factors. A deterministic
primitive-element fallback handles packets not separated by one operator.
For subvarieties and quotients, Poincare reducibility over QQ supplies the
complete ambient rational Hom span; exact image-containment constraints then
restrict it. Integral saturation in homology produces the full Hom lattice.
No arbitrary matrix commutant is used as a geometricity certificate.

Integral gluing matters: the rational product decomposition does not imply
that the Jacobian's endomorphism order is the product of the factors' orders.
The implementation transports before saturating. It does not claim a maximal
number-field order or endomorphisms over an algebraic closure.

`verify()` rechecks the geometric transport and saturation. Serialization
stores endpoints and canonical Hom lattices or integral generator coordinates,
then reconstructs and compares them on load. Altered matrices or lattice
certificates are rejected; no serialized assertion of completeness is trusted.

```sage
H = Hom(J0(11), J0(22))
loads(dumps(H)) == H           # True
loads(dumps(H.gen())) == H.gen()  # True
```

The Sage differential corpus compares integral lattices after explicit
unimodular Manin/homology basis transport, rather than comparing unrelated
matrix entries or just ranks. Connected-quotient model oracles use Sage's
simple-factor End lattice, rational transport and integral saturation because
Sage's generic lattice-variety Hom path fails for those models.
