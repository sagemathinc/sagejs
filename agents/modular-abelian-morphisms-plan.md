# Modular abelian varieties: morphisms and integral geometry

Scope: weight $2$, $\Gamma_0$, over $\QQ$, and finite products of the existing
Jacobian, embedded-constituent and connected-quotient models. Build on main
`c4c126d09`; do not replace integral geometry by rational Hecke signatures.

## Representation and proof

For $f:A\to B$, the matrix $F$ has $2\dim A$ rows and $2\dim B$ columns,
and acts on integral homology on the right. Store an immutable exact integer
matrix, endpoints, and a replayable construction. Certified primitives are
identity, zero, scalar multiplication, Hecke correspondences, canonical
inclusions/quotients, product injections/projections, and geometric degeneracy
maps. Sums and compositions inherit algebraicity. A matrix supplied with
certified generators is admitted only after exact membership in their rational
span and integrality: a rational homomorphism preserving integral homology is
an actual homomorphism. This is not a claim to enumerate the entire Hom ring.
Checking finitely many commutators alone is never a morphism certificate.

## Kernels, images and isogenies

Let $I=\ZZ^{2\dim A}F$ and $I^{\mathrm{sat}}=(I\otimes\QQ)\cap
\ZZ^{2\dim B}$. Keep both lattices. The connected kernel has lattice
$\ker(F)\cap\ZZ^{2\dim A}$ and the image variety has lattice
$I^{\mathrm{sat}}$ in $B$-coordinates. The finite geometric component group is
$I^{\mathrm{sat}}/I$, computed by nonzero Smith factors of $F$. Do not label
this abstract geometric group as rational torsion points, or choose a canonical
finite subgroup complement when none is given.

Surjectivity of varieties is rational full target rank. Injectivity requires
zero connected kernel AND trivial finite kernel. Keep separately named integral
homology predicates. For an isogeny, the degree is $|\det F|$, equal to the
product of Smith factors; it is not the square root of that determinant.
The zero-dimensional cases and the zero map must obey the same formulas.

Products use ordered block coordinates, preserve repeated factors, and carry
the product Hodge structure by construction. Kernel/image subvarieties may be
diagonals in products or individual oldform copies and need not be invariant
under every bad-prime Hecke operator. Unsupported restrictions must fail rather
than silently substituting an isotypic component.

## Degeneracy-labelled decomposition

Construct actual level-lowering pushforwards and level-raising transfers on
Manin symbols, using exact coset representatives as in Sage. Do not transpose
an arbitrary matrix without a polarization. Certify transfer/pushforward
composition by the covering degree; test good-prime intertwining. Generate
copies of each new constituent at every lower level $M\mid N$, indexed by
$d\mid N/M$. Saturate each embedded copy but retain the raw map image and its
finite kernel separately. Certify the sum has dimension $\dim J_0(N)$ and
publish an explicit product-to-Jacobian isogeny.

## Acceptance and performance

- [x] Reconcile the existing roadmap without treating planned work as done.
- [x] Products, certified matrix maps, arithmetic and serialization by replay.
- [x] Connected kernels, finite components, images and isogeny degrees.
- [x] Raising/lowering maps and labelled oldform decomposition.
- [x] Sage exact corpus (including $[2]$, diagonal maps, singular Hecke maps,
  $J_0(33)$, $J_0(44)$, prime powers, repeated copies and tampering).
- [x] Native and browser shared positive/adversarial corpus.
- [x] Forced larger-level benchmarks, with construction/cold computation/warm
  reuse and identical mathematical outputs reported separately.

Implemented in [PR #230](https://github.com/sagemathinc/sagejs/pull/230).
See `docs/modular-abelian-morphisms.md` and
`bench/modular/abelian-varieties/morphisms-performance.md`. Composite-level
decomposition-isogeny performance parity with Sage remains a follow-up; the
measured Hecke-map and decomposition workloads are explicitly separated.

Use existing Hermite/Smith and exact matrix primitives; avoid expensive Smith
transformation matrices when only invariant factors are needed. No new C math.
Pin oracle versions and exact outputs, not numerical approximations. Compare
basis-independent invariants unless an explicit lattice-basis bridge is known.

Sources: Sage's local `sage/modular/abvar/{abvar,morphism}.py` and
`sage/modular/modsym/ambient.py`; online
[morphism reference](https://doc.sagemath.org/html/en/reference/modabvar/sage/modular/abvar/morphism.html).
