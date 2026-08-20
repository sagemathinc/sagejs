# Certified hyperelliptic local data at bad odd primes

For a curve over `QQ`, `local_lpolynomial(p)` intentionally remains the
good-reduction API. At a bad prime the Euler numerator is instead

\[
P_p(T)=\det(1-T\operatorname{Frob}_p\mid
H^1_{\mathrm{et}}(C_{\overline{\mathbf Q}_p},\mathbf Q_\ell)^{I_p}).
\]

Its degree can be smaller than `2*C.genus()`. Use `local_reduction`,
`local_euler_factor`, or `conductor_exponent` when bad reduction is possible:

```sage
sage: R.<x> = QQ[]
sage: C = HyperellipticCurve(x^5 + x^2 + 19)
sage: data = C.local_reduction(19)
sage: data.euler_factor
-19*T^3 + 27*T^2 - 9*T + 1
sage: data.conductor_exponent
1
sage: data.reduction_type
'semistable_nodal'
sage: data.toric_rank
1
sage: C.local_euler_factor(19) == data.euler_factor
True
sage: C.conductor_exponent(19)
1
```

The degree-three answer is expected: one dimension of `H^1` is lost on
taking inertia invariants. In particular, evaluating this polynomial at
`T=1` does **not** give the order of the singular plane model's Jacobian.

## What is certified

`algorithm="auto"` tries the following disjoint proofs.

1. **Good reduction.** Smooth proper base change gives the ordinary degree
   `2g` Frobenius polynomial and conductor exponent zero.
2. **Genus-2 almost-good reduction at odd `p`.** The curve has bad reduction
   but its Jacobian has good reduction. Sage.js implements Algorithms 1--7
   of Maistret--Sutherland. The answer has degree four and conductor exponent
   zero. The split cases use two smalljac elliptic computations over `F_p`;
   the nonsplit case uses one over `F_(p^2)` through smalljac's quadratic
   number-field path.
3. **Tame semistable ordinary nodal reduction in genus 2 or 3.** For the
   checked completed integral model, Sage.js proves that the special fibre has
   ordinary nodes and either one geometrically integral component or two
   geometrically rational components. It computes the normalization Euler
   factor and multiplies it by
   `det(1-T*Frob | H^1(dual graph))`. The tame conductor exponent is the
   first Betti number of that graph.
4. **Split semistable cluster pictures in genus 2 or 3.** If the completed
   branch polynomial splits over `QQ` with `p`-integral roots, Sage.js builds
   the full cluster tree from exact valuations. It verifies the semistability
   depth and parity criteria, constructs every principal component over
   `F_p`, and computes the signed Frobenius action on graph homology from the
   cluster theta characters. This includes arbitrarily deep nested split
   clusters, not just a nodal plane special fibre.

Every successful object has `certified == True` and a `certificate`
dictionary. For semistable reduction it records the factorization of the
special fibre, the normalization polynomial and factor, every Frobenius node
orbit and branch sign, the graph factor, and any integral or Möbius model
change. For almost-good reduction it records the cluster type, normalized
branch polynomial, refinement depths, and elliptic factors.

```sage
sage: cert = data.certificate
sage: cert['normalization_euler_coefficients']
[1, -8, 19]
sage: cert['dual_graph_euler_coefficients']
[1, -1]
sage: cert['node_orbits'][0]['branch_sign']
1
```

The multiplication
`(1 - 8*T + 19*T^2)*(1 - T)` is the displayed bad Euler factor.

Two-component fibres retain the sign with which Frobenius exchanges the
components. For example, PARI 2.18 independently gives the same two answers:

```sage
sage: q = x^3 + x + 1
sage: A = HyperellipticCurve(q^2 + 19*x).local_reduction(19)
sage: B = HyperellipticCurve(2*q^2 + 19*x).local_reduction(19)
sage: (A.euler_factor, A.conductor_exponent)
(T^2 + T + 1, 2)
sage: (B.euler_factor, B.conductor_exponent)
(T^2 - T + 1, 2)
```

Nested split pictures retain the component curves as well. The two genus-2
answers below are independently reproduced by PARI 2.18; multiplying the
equation by the nonsquare `2` twists both the elliptic component and the
graph Frobenius sign.

```sage
sage: p = 5
sage: f = (x-1)*(x-(1+p^2))*(x-(1-p^2))*x*(x-p)
sage: d = HyperellipticCurve(f).local_reduction(p)
sage: (d.euler_factor, d.conductor_exponent)
(-5*T^3 + 3*T^2 + T + 1, 1)
sage: d.certificate['component_curves'][1]['genus']
1
sage: d.certificate['toric_basis'][0]['frobenius_sign']
1
sage: HyperellipticCurve(2*f).local_euler_factor(p)
5*T^3 + 3*T^2 - T + 1
```

## Almost-good stress case

The following example is from the published Genus2Euler hard corpus. The
older general Magma algorithm took about 4511 seconds in the recorded run;
the specialized algorithm is effectively immediate.

```sage
sage: p = 8131969
sage: f = R([3320785780, -7763596804, 7758075841,
....:        2345392066, -6413138499, 5155080768, 967540608])
sage: C = HyperellipticCurve(f)
sage: d = C.local_reduction(p)
sage: d.reduction_type
'almost_good_type_1'
sage: d.conductor_exponent
0
sage: d.euler_factor
66128919816961*T^4 - 57118950256*T^3 + 28598082*T^2 - 7024*T + 1
```

## Explicit algorithms and honest failure

The algorithm may be selected explicitly:

```sage
sage: C.local_reduction(19, algorithm='semistable')
LocalReductionData(prime=19, reduction_type='semistable_nodal', ...)
```

The accepted names are `good`, `almost_good`, `semistable`, and `auto`.
An input outside the theorem's hypotheses raises
`LocalReductionUnsupportedError`; its `diagnostics` attribute lists the exact
failed attempts. Sage.js does not silently count points on a singular
special fibre.

Bad reduction at `p=2`, wild inertia, nonsplit nested clusters requiring
residual root extensions, and general potentially semistable reduction are
not yet claimed by this API. These cases need additional inertia and
component-graph data; returning the naive singular-fibre numerator would be
mathematically wrong.

## Provenance

The almost-good implementation follows C. Maistret and A. V. Sutherland,
*Computing Euler factors of genus 2 curves at odd primes of almost good
reduction*, Research in Number Theory 11 (2025), and their MIT-licensed
Genus2Euler reference implementation. The license notice is shipped as
`licenses/Genus2Euler-MIT.txt`.

The semistable factorization uses the standard normalization/dual-graph
description of inertia invariants, consistent with the cluster-picture theory
of Dokchitser--Dokchitser--Maistret--Morgan. Regression values are checked
against PARI/GP `genus2charpoly` and `genus2red` where applicable, plus direct
normalization and graph calculations in genus 3. Nested genus-3 cluster trees,
principal-component genera, conductor exponents, and Frobenius signs were also
differentially checked against the Sage ClusterPictures reference
implementation.
