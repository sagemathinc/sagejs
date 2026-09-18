# Prepared degree-five index-prime descriptor audit

The reusable maximal-order path now supports degrees three through five.  For
the row-21 quintic it computes, rather than imports, the decompositions at all
three primes dividing the equation-order index `846 = 2 * 3^2 * 47`.

One source-transparent native function composes the translated PARI 2.17.4
`pradical`, recursive quotient splitting, complementary-image, uniformizer and
antiuniformizer routines.  It reuses a fixed 12,000-entry scratch owner and
publishes sorted packed `p,e,f,u,tau` records only after the entire prime has
succeeded.  The live results are:

```text
p=2   3 primes above p   residue degrees 1,2,2   e=1,1,1
p=3   2 primes above p   residue degrees 1,1     e=2,3
p=47  3 primes above p   residue degrees 1,2,2   e=1,1,1
```

The frozen PARI factor base retains all five descriptors over 2 and 3 and only
the norm-47 descriptor over 47; their retained ramification/residue metadata
agrees.  Exact uniformizer coordinates can differ while defining the same prime
ideal, so this cut does not claim byte-for-byte `LP` identity or a completed
factor base.  A later packet-HNF comparison must establish ideal identity.

The widening is deliberately limited to the actually reached exact-linear-
algebra chain.  The optimized source-style root graph remains bounded by degree
four and prime 37; a direct atomic evaluation corridor handles degrees three
through five only through prime 47.  Descriptor sorting still admits at most
four descriptors, and the degree-five uniformizer path rejects residue degree
four before mutation.  The exact scalar embedding branch has a dedicated
degree-five fifth-power control.  General degree-five defining-polynomial
factorization remains the next blocker: the historical Flx graph is
structurally bounded to degree four, and the first experimental replacement
exceeded the 600-second integration budget. Consequently this cut is a
dependency result, not the row-21 prepared root.

The connected check authenticates frozen panel row 21, compiles the complete
source-transparent graph, and computes eight descriptors.  It also rejects a
degree-six call atomically, verifies the exact degree-five norm `6^5 = 7776`,
and rejects the unsupported degree-five residue-degree-four uniformizer
corridor.  Its current identities are:

```text
prepared SHA256  63378e8424e81d0d5653d965ef18a518b78ec7f78b66f57afcc55052849ac95f
source SHA256    0187a14cd534f7cb42c026d87ab45713e82a3ba939362cd1d3bcc4ddc5b6cf2f
core SHA256      93bf5492019b3d45dd887976414066859edb2319e7a816dd8d206ab9947e4dab
```

The independent polynomial-root differential covers 3,614 cases in CPython,
JavaScript, GMP, and tagged native modes against the pinned PARI 2.17.4 source
oracle.  Degree-five primes 2, 3, 5, and 47 and degree-three/four prime 47 are
included.  Descriptor ordering additionally covers 767 synthetic degree-
three/four/five orderings and nine invalid controls; earlier actual descriptor
corpus evidence is unchanged, while this widening run intentionally used the
synthetic corpus to isolate the new degree-five frontier.

Reproduce with:

```sh
node bench/pari-class-group-port/check_prepared_index_prime.cjs
```

This is correctness/dependency evidence, not a qualified timing result.
