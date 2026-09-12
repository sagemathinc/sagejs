---
title: "Morphisms, finite kernels, and isogenies"
---
# Exact maps between modular abelian varieties

This extends the [modular abelian variety models](modular-abelian-varieties.md)
over $\mathbf Q$. A morphism has an exact integer matrix on homology **and a
construction proving algebraicity**. An arbitrary integer matrix is not enough.

## Products and map arithmetic

```sage
sage: E = J0(11)
sage: P = E * E
sage: i0, i1 = P.injection(0), P.injection(1)
sage: p0, p1 = P.projection(0), P.projection(1)
sage: p0*i0 == E.identity_morphism()
True
sage: i0*p0 + i1*p1 == P.identity_morphism()
True
sage: diagonal = i0 + i1
sage: diagonal.image().dimension()
1
```

Indices are zero-based and factor order matters. Matrices act on row vectors;
`f*g` means $f\circ g$, so its matrix is `g.matrix()*f.matrix()`.
`E**r` constructs repeated products; `E**0` is the zero-dimensional product.
For a sum of maps with different domain and codomain, supply the parented zero:
`sum(maps, A.zero_morphism(B))`. A numerical scalar is only added as a multiple
of the identity for endomorphisms.
Products and kernel/image subvarieties expose `modular_symbols()` as a rational
homology subspace/direct-sum view, not as a single ambient Manin presentation.
Use the original factors for signed Manin-symbol computations.

## Connected and finite kernels

```sage
sage: f = E.multiplication_by(2)
sage: (f.is_surjective(), f.is_injective(), f.is_isogeny(), f.degree())
(True, False, True, 4)
sage: f.component_group().invariants()
(2, 2)
sage: g = 2*p0
sage: (g.connected_kernel().dimension(), g.component_group().invariants())
(1, (2, 2))
```

`kernel()` returns `(finite_components, connected_kernel)`. The finite object
records the abstract **geometric** component group, not the rational torsion
points or a chosen embedded complement to the connected kernel.

For row-action matrix $F$, the integral image is $I=\mathbf Z^a F$ and
$\pi_0(\ker f)=I^{\mathrm{sat}}/I$. `image_lattice()` keeps the nonsaturated
image; `saturated_image_lattice()` and `image().lattice()` describe the image
variety, respectively in target homology coordinates and the ambient embedding.
`kernel_lattice()` is in domain homology coordinates. Do not silently identify
these coordinate systems.

`is_surjective()` tests surjectivity of varieties (full rational target rank).
`is_injective()` additionally requires a trivial finite kernel.
`is_homology_surjective()` and `is_homology_injective()` are the distinct
integral-linear predicates. The degree of an isogeny is $|\det F|$, not its
square root. `degree()` rejects maps with a positive-dimensional kernel or
proper image.

## Certified explicit matrices

```sage
sage: T = J0(37).hecke_morphism(2)
sage: T.connected_kernel().dimension()
1
sage: E.hom(2*identity_matrix(ZZ,2)) == E.multiplication_by(2)
True
sage: E.hom(identity_matrix(ZZ,2), generators=[E.multiplication_by(2)]) == E.identity_morphism()
True
```

For `A.hom(F, B, generators=[...])`, the matrix must be integral and lie in
the exact rational span of the supplied certified maps from $A$ to $B$.
An integral rational homomorphism is an actual homomorphism. With no generators,
endomorphisms use the identity span; maps between different parents admit only
zero. This does **not** enumerate the complete Hom or endomorphism ring.
`verify()` replays the construction; optional `verify(hecke_bound)` also checks
good-prime intertwining. Finite commutator checks are not the algebraicity proof.

## Geometric degeneracy maps and labelled copies

```sage
sage: up = J0(11).degeneracy_map(33, 1)
sage: down = J0(33).degeneracy_map(11, 1)
sage: down*up == J0(11).multiplication_by(4)
True
sage: D = J0(33).oldform_decomposition()
sage: [(c.source_level(), c.degeneracy_index(), c.dimension()) for c in D]
[(11, 1, 1), (11, 3, 1), (33, 1, 1)]
sage: D.isogeny().is_isogeny()
True
```

Each `copy.map()` retains the original degeneracy map; `copy.variety()` is its
connected image, with saturated lattice and an integral inclusion. The source
constituent is labelled by lower level, constituent index and degeneracy index.
`D.isogeny()` sums the inclusions from their ordered product. The existing
`decomposition()` remains the full-Hecke isotypic computation: it solves a
different problem and may group old copies together. An individual old copy
need not be stable under a bad-prime Hecke operator; unsupported restrictions
raise an error.

## Serialization and limits

```sage
sage: loads(dumps(diagonal)) == diagonal
True
sage: loads(dumps(g.connected_kernel())) == g.connected_kernel()
True
```

Serialization stores data-only construction recipes and checks reconstructed
endpoints and matrices. It does not execute serialized code or trust an
unverified matrix. Maps, ordered products, and kernel/image varieties preserve
their integral models. This slice does not add polarizations, periods, rational
torsion-point algorithms, or component groups of Néron models; the finite kernel
components above are different objects.

See the [qualification and benchmark report](../bench/modular/abelian-varieties/morphisms-performance.md)
for exact Sage comparisons and native/browser checks. The Hecke-map workloads
are substantially faster than Sage in the measured larger cases, while the
new composite-level decomposition isogenies remain slower; timings are
reported separately.

The following compact check is executed by the documentation test runner:

```sage test
E = J0(11)
P = E * E
i0, i1 = P.injection(0), P.injection(1)
p0, p1 = P.projection(0), P.projection(1)
assert i0*p0 + i1*p1 == P.identity_morphism()
assert (2*p0).kernel()[0].invariants() == (2, 2)
assert (2*p0).kernel()[1].dimension() == 1
assert E.multiplication_by(2).degree() == 4
D = J0(33).oldform_decomposition()
assert [(c.source_level(), c.degeneracy_index()) for c in D] == [(11, 1), (11, 3), (33, 1)]
assert D.isogeny().component_group().invariants() == (3, 15)
assert loads(dumps(i0+i1)) == i0+i1
```

The transfer construction and integral kernel description follow
[Sage's modular-abelian-variety implementation](https://doc.sagemath.org/html/en/reference/modabvar/sage/modular/abvar/morphism.html).

Composite-level decomposition now saturates small-rank images through the
dual column lattice and computes transfers by batched Manin-generator
reduction. The product isogeny stacks the exact factor inclusions, retaining
a replayable construction certificate. These optimizations do not replace
`image_lattice()` by its saturation or change the geometric kernel group.

Large nonsingular isogeny matrices use exact modular-HNF preconditioning
before Smith reduction. The denominator of the inverse supplies a proved
cokernel annihilator; no guessed modulus or change to the map is involved.
See the [performance report](../bench/modular/abelian-varieties/decomposition-performance.md)
for Sage comparisons and the remaining small-level cold-setup gap.
