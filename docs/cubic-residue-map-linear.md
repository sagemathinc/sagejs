# Linear-fiber filtering of cubic residue maps

This optimization changes candidate enumeration, not certificate acceptance.
It applies to the existing factor-base search for unital maps from a rank-three
order to $\mathbb F_p$, where the caller has established that $p$ is prime and
has selected an invertible coordinate of the identity.

Write $e_i e_j=\sum_k c_{ijk}e_k$ and $1=\sum_k u_ke_k$.
A candidate has images $v_k$ satisfying $\sum_k u_kv_k=1$.
Eliminate the selected identity coordinate and fix the first free coordinate.
The remaining images have the form $v_k=a_k+b_ky$. Each multiplication equation is

$$
\sum_k c_{ijk}(a_k+b_ky)-(a_i+b_iy)(a_j+b_jy)=0.
$$

When $b_ib_j=0$ modulo $p$, this is $C+Dy=0$. If $D\ne0$, every valid map
must have $y=-C/D$; if $D=0$ and $C\ne0$, no map exists in this fiber.
Otherwise that equation gives no restriction. The helper returns the first
such restriction, or the full interval if none is available. All surviving
candidates still undergo the existing complete multiplicativity check.
Consequently no valid map is lost and no invalid map is added, including in
degenerate fibers. Surviving maps retain the original enumeration order.

The filter uses constant additional scalar storage. Favorable cases reduce
full multiplicativity checks from $p^2$ to at most $p$; the unrestricted case
retains the original quadratic search with additional filtering overhead.
This argument assumes no GRH and does not prove maximality of the order,
generation of the class group, or completeness of a relation lattice.

The focused CPython regression extracts the actual production functions and
compares against exhaustive equations for 253 deterministic cases, including
split algebras, square-zero radicals, inconsistent tensors, and random signed
structure constants. The same production-source helper is also exercised in
ordinary Sage.js execution and in a closed arena-owned probe using generated
JavaScript, GMP, and FLINT integer backends. Every compiled fiber interval is
compared with its CPython counterpart (3,680 fiber intervals per backend).
All four public cubic regression groups passed: receipt authentication and
declines, independent exact replay, pinned nontrivial LMFDB cases, and the
large-regulator survey. Production timing qualification is still required;
exploratory timings on a different experimental closure are not production
performance claims.

Initial main-based qualification passed the clean build, strict Python checks
(382 modules), and both focused tests. The package source allowance remains
unchanged: the complete cubic package uses 483,914 of 485,000 bytes. The
architecture check passed source budgets and native boundary classification,
then encountered an existing forbidden CoWasm reference in
`agents/python-compiler-runtime-value-and-performance-plan.md:124` on the base
revision `d654e3d45`. This is not a passing full architecture receipt.

Reproduce the focused checks with
`node --test test/cubic-residue-map-linear.cjs` and the public regression with
`node --test test/number-field-cubic-native-class-number.cjs`, after preparing
the runtime and FLINT addon. The task contract records both passing runs.
