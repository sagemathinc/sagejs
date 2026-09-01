---
title: "Correctness argument for the native complex-cubic class group"
---
# Correctness argument for the native complex-cubic class group

This note records the mathematical contract of
`certified_complex_cubic_class_group_v1`. It is part of the implementation:
changes to the accepted domain, proof receipt, or acceptance test must update
this argument and its regression tests.

The result is **exact conditional on GRH**. It is not an unconditional proof
and it is not justified merely by agreement with PARI, Magma, Hecke, or LMFDB.
The exact assumption carried by every successful receipt is

> $\zeta_K(s)$ and $\zeta_{\mathbb Q}(s)$ are nonzero whenever
> $\operatorname{Re}(s) > \tfrac12$.

This is the hypothesis in Belabas--Friedman, Theorem 1. All ideal arithmetic,
relations, Smith normal form, units, and interval endpoints are exact. GRH is
used in two named places: to certify the field-specific Belabas--Diaz y
Diaz--Friedman factor-base cutoff, and to turn a finite Euler calculation into
a rigorous enclosure for the Dedekind-zeta residue.

## Claim and accepted domain

The public adapter starts with a Sage.js `NumberField` defined by a monic
integral irreducible cubic $f \in \mathbb Z[x]$. The native program currently
accepts only complex cubics, so the field discriminant satisfies $D_K < 0$.
On success it
returns the order and invariant factors of the ordinary ideal class group.

The implementation has explicit finite envelopes for the discriminant
factorization, Minkowski bound, factor base, relation search, unit search,
analytic cutoff, integer widths, resident arena, and temporary arena. Exceeding
any envelope is a decline, not evidence for a result. The public adapter then
uses the ordinary exact implementation. A raw native output buffer has no
mathematical authority: only the adapter can issue an immutable receipt bound
to the live irreducible field.

## Proof ledger

The accepted result follows from the following chain.

### 1. The ring is the maximal order

The field-analysis producer proposes an integral basis for an order
$\mathcal O$. A
separately defined source-transparent checker is compiled into the same closed
native call graph. It independently checks:

- the defining polynomial and its exact discriminant;
- a complete, pairwise-coprime factorization of the absolute equation-order
  discriminant inside the accepted bounded domain;
- the canonical HNF basis, denominator, equation-order index, and identity
  $$\operatorname{disc}(\mathbb Z[a])
    = [\mathcal O : \mathbb Z[a]]^2\operatorname{disc}(\mathcal O);$$
- integral multiplication in $\mathcal O$; and
- at every prime whose discriminant exponent can permit a nontrivial index,
  the canonical $p$-radical and a full-rank multiplier-ring fixed-point
  witness.

The Round-2 fixed-point criterion says that the checked multiplier order is no
larger than $\mathcal O$, hence $\mathcal O$ is $p$-maximal. A prime dividing
the index would
occur to exponent at least two in the equation-order discriminant, so checking
all such primes proves global maximality. The compact FLINT projection is only
a representation producer; it is not this proof authority.

### 2. The factor base generates the class group

For a complex cubic, Minkowski's theorem gives an integral ideal in every
class with norm at most

$$
\frac{8}{9\pi}\sqrt{|D_K|}.
$$

The program first computes this unconditional fallback using the elementary
strict bound $\pi > 28/9$, hence $8/(9\pi) < 2/7$, and an integer upper bound
for $\sqrt{|D_K|}$. When this integer bound is at most $8$, it retains the
unconditional bound directly: traversing such a tiny factor base is cheaper
than proving a second conditional bound, and no assumption is needed. For a
larger Minkowski bound it searches for a smaller field-specific cutoff $C$
using the explicit GRH criterion of Belabas--Diaz y Diaz--Friedman. In
signature $(1,1)$ it accepts $C$ only after outward-rounded interval arithmetic
proves

$$
c_D+\frac{c_N+2S_B(C)}{\log C}-2S_A(C)<0,
$$

where

$$
c_N=4G+\frac{3\pi^2}{2},\qquad
c_D=\log|D_K|-3\bigl(\gamma+\log(8\pi)\bigr)-\frac\pi2,
$$

and $S_A(C),S_B(C)$ are the finite prime-ideal-power sums in the theorem. The
prime splitting data are recomputed in the certified maximal order. Bounds for
$G$, $\gamma$, $\pi$, and every logarithm are rational or dyadic and rounded in
the direction that makes the inequality harder to satisfy. If no smaller $C$
is proved, the program retains the unconditional Minkowski cutoff.

The lower bound for Euler's constant is itself elementary. If
$a_n=H_n-\log n$, then

$$
a_n-\gamma
=\sum_{k\ge n}\left(\log(1+1/k)-\frac1{k+1}\right)
<\sum_{k\ge n}\frac1{2k(k+1)}
=\frac1{2n}.
$$

The strict termwise inequality follows by differentiating both sides of
$\log(1+x)-x/(1+x)<x^2/(2(1+x))$ for $x>0$. Thus the native program uses the
fully rational/dyadic enclosure
$\gamma>H_{32}-\log 32-1/64$. This is tight enough to retain genuinely
field-specific cutoffs near the theorem boundary without importing a decimal
table or trusting binary floating-point comparisons.

The factor base contains every degree-one prime ideal needed up to the selected
proved bound.
This suffices in degree three. An inert degree-three prime ideal is $(p)$ and
is principal. In splitting type $(1,2)$, the degree-two prime class is the
inverse of the degree-one prime class because their product is $(p)$.
Completely split and ramified degree-one primes are represented by all exact
multiplicative maps $\mathcal O \to \mathbb F_p$. Thus the free group on the
retained factor base surjects onto $\operatorname{Cl}(\mathcal O)$.
The degree-two factor in type $(1,2)$ is retained only when its norm $p^2$ is
within the proved bound; this rule is identical for Minkowski and GRH bounds.

The factor base is allowed to be empty. If every rational prime through the
selected generator bound is inert, its unique prime ideal is $(p)$ and is
principal. There are then no nontrivial generators, so the zero-dimensional
factor-base presentation proves that the class group is trivial. The program
publishes this conclusion immediately: no relation, unit, regulator, or
analytic-index calculation is part of this proof. Its receipt distinguishes an
unconditional Minkowski bound from a smaller bound proved under GRH.

### 3. Exact principal relations give an upper group

Every admitted row is obtained from an exact element of $\mathcal O$. The native code
checks its norm and exact ideal valuations, so the row represents a principal
ideal. If $L$ is the lattice generated by those rows and $F$ is the free
factor-base lattice, then

$$
L \subseteq \ker\!\left(F \longrightarrow
  \operatorname{Cl}(\mathcal O)\right).
$$

Consequently $F/L$ surjects onto $\operatorname{Cl}(\mathcal O)$. Exact HNF
and Smith reduction compute $F/L$. If it has order $1$, the class group is
already proved trivial, and the program publishes this exact presentation
without computing a unit, regulator, or analytic index. As with an empty
factor base, the receipt distinguishes an unconditional Minkowski generator
bound from a GRH-conditional generator bound. Otherwise those normal forms
give invariant factors and order $\widehat h$, so

$$
\widehat h = r h
$$

for a positive integer relation index $r$ and the true class number $h$.

In factor-base dimensions one and two, the collector tracks the gcd of entries
or of $2\times2$ minors. A gcd of $1$ stops the bounded search early, but it is
only a scheduling signal: exact HNF and Smith reduction independently recheck
rank and index before publication.

The relation search follows PARI's `small_norm` geometry without trusting its
output: it LLL-reduces individual prime ideals and then a bounded sequence of
products $P_0^eP_j$ from a small multiplier sub-factor-base. The products are
only search devices. Every resulting element is admitted through the exact
norm and containment checks above. A rational-prime row $(p)$ is recorded only
when every prime ideal above $p$ is represented; in particular, a retained
degree-one factor of splitting type $(1,2)$ does not create the false relation
$(p)=P_1$ when its norm-$p^2$ companion lies outside the selected factor base.

The broader individual-ideal stage reproduces PARI 2.15.4's factor-base
permutation. It stably sorts prime ideals by norm and builds a sub-factor-base
of at least three eligible ideals whose norm product exceeds the certified
generator bound. When all local factors above a rational prime are represented,
the last such factor is omitted from this sub-factor-base because the other
factors and $(p)$ already determine its class. The permutation places the
sub-factor-base first, these locally redundant factors second, and all remaining
ideals last; relation search traverses it backward. This permutation affects
only proposal order. It cannot authorize a relation or a result.

For an unramified prime of splitting type $(1,2)$, the native program also
constructs the complementary norm-$p^2$ ideal explicitly. If $P$ is the
degree-one prime, it solves for the normalized residue idempotent $e$ with
$e=1$ in the complementary factor and $eP=0$ modulo $p$, and sets
$Q=p\mathcal O+\mathbf Z e$. It accepts this lattice only after exact HNF,
$\det Q=p^2$, and the lattice identity $PQ=p\mathcal O$ have all been checked.

The candidate schedule in $Q$ is a finite exact version of PARI's reduced-ideal
ellipsoid. Let $B$ be the integer embedding approximation after LLL and let
$G=BB^{\mathsf T}$. Depending on whether the first reduced row is scalar, the
program uses the same $\max(8G_{00},2G_{11})$ or
$\min(8G_{00},2G_{11})$ bound as PARI. From

$$
x^{\mathsf T}Gx\le M
\quad\Longrightarrow\quad
x_i^2\le M(G^{-1})_{ii}
=M\frac{\operatorname{cof}_{ii}(G)}{\det G},
$$

it derives a checked finite coordinate box, then retains exactly the primitive,
nonscalar vectors inside the ellipsoid, modulo sign. The approximate embedding
therefore influences only which candidates are proposed. Exact norm evaluation,
smoothness, ideal containment, and the independent proof replay remain the
correctness authority for every admitted relation.

Relation compaction retains the class-lattice support plus a bounded tail of
six redundant witnesses. Those extra rows preserve ordinary short unit
dependencies without making every HNF transform operate on the full collection
matrix. If that compact dependency lattice yields no exact unit, the program
conditionally expands to the same canonical class support plus eighteen final
witnesses and attempts exact unit reconstruction there. It never makes the
exceptional HNF/LLL/log workspace operate on the entire raw collection matrix.

Relation effort remains adaptive. For factor bases of dimension at most $11$,
the host first invokes the closed native program with the three largest
canonical factor-base ideals and no compound multiplier. Larger bases start
with every adjacent ideal because a fixed three-ideal prefix is structurally
too narrow to justify a duplicate exact setup. Only an exact relation-rank,
unit-rank, or analytic-index failure authorizes a second attempt. That attempt
visits the four largest canonical ideals and every certified residue-degree-two
complement of a retained degree-one ideal. Further exact failures authorize the
first five and then eight ideals in the source-derived PARI permutation, every
certified residue-degree-two complement, and the union of the compact shell
with the full checked reduced-ideal ellipsoid. The next failure authorizes those
searches for every factor-base ideal. Remaining failures then authorize
prefixes of one, two, and four compound multipliers. Each retry owns a fresh
exact arena and independently repeats every mathematical check; no partially
trusted relation state crosses the boundary. The detached receipt records the
compound prefix actually used, not merely the effort authorized by the call.

### 4. The retained element gives an upper regulator

A complex cubic has signature $(1,1)$, unit rank one, and exactly two roots of
unity: a root of unity maps to a real root of unity under the real embedding,
so it is $+1$ or $-1$. The program retains the exact principal element behind
every relation. Zero rows of the exact HNF transform give integral relation
dependencies; multiplying positive-exponent witnesses and exactly dividing by
the negative-exponent product reconstructs algebraic units in $\mathcal O$.
As an opportunistic shortcut, the program also searches exact maximal-order
coordinates by increasing coordinate-$\ell_1$ shells through score $9$.
Every candidate on the first populated shell is checked to have norm $+1$ or
$-1$, and the candidate with the smallest rigorously disjoint positive
logarithm on that shell is selected. If no unit occurs in those cheap shells,
the search stops: the program recovers a unit from the exact relation
dependencies instead of enlarging a speculative coordinate box. Thus the
score cutoff affects only scheduling, not the accepted mathematical regime.
Whichever path supplies the retained unit, it generates a finite-index
subgroup of the unit lattice. If its rigorously enclosed logarithm is
$\widehat R$, then

$$
\widehat R = qR
$$

for a positive integer unit index $q$ and the true regulator $R$.

### 5. Belabas--Friedman encloses the zeta residue under GRH

Let $\kappa_K$ be the residue of $\zeta_K(s)$ at $s=1$. At the fixed cutoff
$X=997$, the program computes the required prime-ideal-power terms from the
exact multiplication algebra of the certified maximal order. In particular,
index primes are not analyzed from the possibly misleading defining
polynomial.

Belabas--Friedman Theorem 1 states, under the GRH hypothesis above and for
$X \geq 69$, that $\log \kappa_K$ differs from their explicit finite
expression $f_K(X)$ by at most

$$
\frac{2.324\log |D_K|}{\sqrt X\log(3X)}
\left(
  \left(1+\frac{3.88}{\log(X/9)}\right)
  \left(1+\frac{2}{\sqrt{\log |D_K|}}\right)^2
  + \frac{4.26(n-1)}{\sqrt X\log |D_K|}
\right),
$$

where $n=[K:\mathbb Q]=3$ here.

The implementation evaluates the finite expression and this error bound with
outward-rounded dyadic intervals.

### 6. The analytic class-number formula proves both indices are one

For signature $(1,1)$ and torsion order $2$, the analytic class-number formula
is

$$
\kappa_K = \frac{2\pi hR}{\sqrt{|D_K|}}.
$$

Combining the exact algebraic upper quantities with the zeta-residue enclosure
gives an interval containing

$$
\log\!\left(
  \frac{2\pi\widehat h\widehat R}
       {\sqrt{|D_K|}\,\kappa_K}
\right)
= \log(rq).
$$

The program accepts only if the interval's upper endpoint is strictly less
than a separately enclosed lower bound for $\log 2$. Since $rq$ is a positive
integer, this proves $rq=1$, and hence $r=q=1$. Therefore the Smith
group is the complete class group and the retained unit is fundamental.

## Interval arithmetic

Published real intervals use signed integer endpoints with scale $2^{64}$.
Division, multiplication, logarithm series, the Machin formula for $\pi$, and
the Belabas--Friedman finite and error terms round outward. FLINT/Arb supplies
isolated rigorous logarithm and square-root balls through a declared resource;
the source-transparent program consumes only certified endpoints. Any failed
sign, containment, precision, shape, or capacity check causes a decline.

The final host check deliberately repeats a weaker rational consequence,
$\mathrm{upper}<2/3<\log 2$, before it gives the native output authority. This is
defense in depth; it cannot promote a declined native computation.

## Receipt, replay, and trusted base

The version-one detached receipt records the polynomial, field discriminant,
class invariants, unit coordinates, selected generator bound, factor-base and
relation sizes, theorem name, and explicit assumptions. Full relation proofs
also record the successful compound-multiplier prefix and dyadic analytic
intervals. Empty-generator-base proofs leave those inapplicable fields zero.
The receipt is an audit record, not yet a standalone proof object: it does not
contain all ideal relations or local Euler witnesses.

`receipt.verify()` is intentionally independent of the native program. It
reconstructs the maximal order, checks the unit norm, and recomputes the class
group through the ordinary exact implementation, requiring an unconditional
result for the particular field. External agreement is also tested against a
versioned LMFDB corpus and PARI/Magma/Hecke oracles, but those comparisons are
regressions, not premises in the proof above.

The current trusted computing base still includes:

- the mathematical theorems stated above, including GRH as an explicit
  assumption;
- the source-transparent Python checker and compiler lowering;
- generated native lifecycle and arena code;
- GMP and FLINT exact arithmetic, FLINT/Arb interval arithmetic, and their host
  adapters; and
- the JavaScript/Python adapter that binds the result to the live field and
  fails closed.

The compiler manifest records the path and SHA-256 digest of every imported
`@native` source dependency. This makes the closed program inspectable and
prevents an edited checker from silently reusing an artifact compiled from a
different source.

## Formalization path

A useful Lean effort should begin with a small certificate checker rather than
formalizing the optimized search procedure.

1. Define cubic orders, ideals, valuation rows, and the finite-abelian-group
   presentation; verify maximal-order fixed points, principal relations, Smith
   invariants, and the unit norm from a detached certificate.
2. Formalize the complex-cubic specialization of Minkowski's theorem and the
   factor-base coverage argument.
3. Verify dyadic endpoint arithmetic and the final positive-integer
   $\mathrm{upper}<\log 2$ lemma.
4. Treat Belabas--Friedman Theorem 1 initially as one named GRH-conditional
   theorem boundary. Formalizing its explicit-formula proof can be a later,
   independently scoped project.

That staged checker would substantially reduce the software trusted by a
research result while preserving the fast native producer. It would also make
the remaining analytic assumption impossible to hide behind an implementation
label.

## References

- Karim Belabas and Eduardo Friedman, “Computing the residue of the Dedekind
  zeta function,” *Mathematics of Computation* 84 (2015), 357--369,
  [arXiv:1305.0035](https://arxiv.org/abs/1305.0035), Theorem 1.
- Karim Belabas, Francisco Diaz y Diaz, and Eduardo Friedman, “Small
  generators of the ideal class group,” *Mathematics of Computation* 77
  (2008), 1185--1197,
  [author PDF](https://www.math.u-bordeaux.fr/~kbelabas/research/OnBach.pdf).
- [Certified number-field maximal orders](number-field-maximal-orders.md), for
  the general Round-2 certificate contract.
- [Number-field class and unit groups](number-field-class-unit-groups.md), for
  public proof-mode and GRH semantics.
