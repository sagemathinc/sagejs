# Modular-symbol correctness and performance dashboard

Run the human-readable dashboard with:

```sh
pnpm bench:modular-symbols
```

Agents and automation can request stable structured output:

```sh
pnpm bench:modular-symbols -- --json
```

The dashboard currently separates three operations because conflating them
would give misleading performance numbers:

- canonical construction and indexing of `P1List(N)`;
- the weight-2 `Gamma0(N)` Manin `S`/`R` relation quotient over the
  machine-word field `GF(65521)`;
- construction of the full weight-2 rational modular-symbol space.

The modular-symbol cases include prime level 389 and the substantially more
revealing composite level 1000. The latter has 1,800 projective cosets and
exposes presentation and linear-algebra costs that the small prime-level case
can hide.

Sage.js and SageMath run the same `.sage` benchmark source. PARI/GP is used
for its public `msinit`/`msdim` rational modular-symbol interface when `gp` is
installed. eclib is reported explicitly but is not assigned a synthetic
timing: its public modular-symbol programs specialize in weight-2 newform and
elliptic-curve workflows rather than exposing these same operations.

Set `SAGELITE_SAGE`, `PARI_GP`, or both to compare specific installations.
Unavailable tools are reported as such rather than silently omitted.

## Implementation lineage

The native Sage.js `P1List` follows Sage-compatible canonical representatives
and ordering. Its allocation and indexing strategy was informed by:

- William Stein's original Sage Cython implementation,
  `src/sage/modular/modsym/p1list.pyx`;
- William Stein's later JSage/Zig experiment,
  `lib/src/modular/p1list.zig`, especially its preallocation strategy;
- Manin's two-term and three-term presentation of modular symbols.

The native implementation first computes
`#P1(Z/NZ) = N product_(p | N) (1 + 1/p)`, allocates the representative array
once, and builds a fixed-size open-addressed lookup table. The sparse relation
builder likewise counts relation orbits and allocates compressed-row storage
once. Dense FLINT rank is only a first correctness backend; scalable sparse
exact linear algebra is the next distinct layer of this project.

PARI/GP provides an independent correctness and performance reference through
its `msinit` implementation for even-weight `Gamma0(N)` modular symbols. Its
weight-2 path constructs a connected fundamental domain and eliminates paired
interior and boundary edges structurally; it does not compute the rank of the
full Manin relation matrix. This is both a performance baseline and the design
reference for Sage.js's next native presentation layer. eclib remains an
important reference for the specialized weight-2/newform pipeline and its
linear algebra.
