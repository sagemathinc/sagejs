# Modular abelian variety differential corpus

The initial weight-$2$, $\Gamma_0(N)/\mathbf Q$ object layer is checked against
two independent systems:

```sh
/home/user/bin/sage bench/modular/abelian-varieties/sage-oracle.py
/home/user/bin/magma -b bench/modular/abelian-varieties/magma-oracle.m
```

Both scripts report the dimension of $J_0(N)$ and the characteristic
polynomials of $T_2$ and $T_3$ on weight-$2$ cusp forms for
$N=11,33,37,43,67,97$.  Their common exact output is normalized in
`test/fixtures/modular-abelian-varieties-sage-magma.json` and checked through
the public Sage.js API by `test/modular-abelian-varieties.cjs`.

Sage additionally supplies decomposition dimensions.  At level $33$, Sage.js
reports dimensions $1+2$ rather than Sage's $1+1+1$: the two old copies form
one rational full-Hecke isotypic component in the current implementation.
The total dimension and the full $T_2,T_3$ polynomials agree exactly.  This is
an explicit decomposition-granularity distinction, not an oracle mismatch.

The fixture is provenance, not runtime delegation.  Sage.js performs every
construction using its own exact modular-symbol and FLINT lattice code.

## Larger-level performance

Run the systems sequentially in fresh processes, with only the unrelated
$J_0(11)$ used for library warmup:

```sh
node bench/modular/abelian-varieties/performance.cjs --sage=/home/user/bin/sage --levels=389,1009,2003 --samples=3
node bench/modular/abelian-varieties/performance.cjs --sage=/home/user/bin/sage --levels=389,1009 --samples=3 --workload=quotient
node bench/modular/abelian-varieties/performance.cjs --sage=/home/user/bin/sage --levels=389,1009 --samples=1 --workload=pipeline
```

Options also include `--systems=sagejs`, `--systems=sage`, a per-process
`--timeout=300` in seconds, and `--output=results.json` to retain the complete
report (including partial progress). JSON lines retain individual stage times, source
hashes, runtime/host identities, and incomplete timeout observations. Exact
dimensions, factor dimensions, and (for the pipeline and quotient workloads)
full homology $T_2$ polynomials are compared, not matrix entries in unrelated
bases. The larger Sage polynomials at $1009$ and $2003$ are also pinned in the
integration tests. Default native backends are used; these are not claims
about the all-dynamic or browser backend, or pinned single-core timings.

The default workload forces decomposition **and every factor lattice**.
`pipeline` first constructs integral modular-symbol homology and integral
$T_2$; its later timings benefit from those caches. In Sage, merely asking
`J0(N).lattice()` can return an abstract $\mathbf Z^{2g}$ immediately, so the
pipeline explicitly forces `modular_symbols().integral_structure()`.
Interpreter startup and the $T_2$ comparison are outside the stage timings.

`quotient` chooses the smallest-degree newform (the default levels have a
unique such factor), then forces the connected quotient lattice and its map
from $J_0(N)$. Sage's `AbelianVariety(f)` is an embedded subvariety, so the
matched Sage operation is `J.quotient(AbelianVariety(f).complement())`, **not**
timing that constructor alone. Newform selection is reported separately.

The rebuilt-runtime measurements on Linux x64, AMD EPYC 7B13, Node 26.8.1
and installed Sage 10.9.post1 show the scaling reversal. These are medians
of three fresh processes, summing decomposition and factor-lattice times:

| Level | Dimension | Sage.js | Sage | Sage / Sage.js |
| --- | --- | --- | --- | --- |
| $389$ | $32$ | 0.378 s | 0.232 s | 0.61 |
| $1009$ | $83$ | 1.142 s | 1.412 s | 1.24 |
| $2003$ | $167$ | 5.417 s | 15.846 s | 2.93 |

The [raw decomposition report](performance-decomposition-linux-x64.json)
contains all samples. At level $2003$, the original pipeline had not
finished decomposition when its 180-second process limit expired; that
baseline had already constructed integral $T_2$. The new cold workload is
therefore faster despite not receiving that cache. Level $389$ remains a
small-case counterexample. These are scoped comparisons, not a claim that
every operation and every level beats Sage, or a timing guarantee on a
shared host.

The [raw quotient report](performance-quotient-linux-x64.json) gives these
three-run medians, including the exact connected quotient lattice and map:

| Level | Quotient dimension | Sage.js quotient | Sage quotient | Sage.js including selection | Sage including selection |
| --- | --- | --- | --- | --- | --- |
| $389$ | $1$ | 0.809 s | 1.730 s | 1.327 s | 1.984 s |
| $1009$ | $37$ | 2.557 s | 9.193 s | 3.953 s | 10.183 s |

At level $1009$ the quotient map has size $166\times74$. Although bare
decomposition at $389$ is still slower, its connected quotient is faster.
The benchmark runner is the reproducible authority for fresh measurements.

At $N=2003$, the dimension-$75$ connected quotient and its $334\times150$
map take **16.247 s** in Sage.js, or **24.920 s** including newform selection
([three fresh Sage.js runs](performance-quotient-2003-linux-x64.json)). The
matched Sage run takes **76.290 s**, or **84.564 s** including selection
([raw Sage observation and earlier Sage.js timeout](performance-quotient-2003-before-cyclic-linux-x64.json)).
This largest Sage comparison is a single run, not a three-run median. All
three final Sage.js runs agree with its full degree-$150$ homology $T_2$
polynomial and quotient-map dimensions. The earlier Sage.js process timed
out at 300 seconds during quotient construction; the diagnostic isolated
the Smith-form surjectivity check as the remaining memory/time bottleneck.

The reports record the then-current base commit and the hashes of the
mathematical working-tree sources actually measured; the final reports
include `newforms.py` as well as the modular-symbol and abelian-variety files.

## Why the decomposition changed

On weight-$2$ sign-zero homology, a simple abelian constituent has Hecke
polynomial $f^2$, with one copy in each star sign. The generic modular-symbol
stopping rule expects multiplicity one and consequently keeps processing
already-separated constituents. The abelian-variety implementation instead
checks multiplicity two and exact zero trace of the restricted star
involution, certifying equal sign dimensions. Repeated oldform components
remain active and retain bad-prime refinement. Already-simple factors do not
need an expensive extra $U_N$ calculation at prime level.

Polynomial evaluation uses blocks of length about $\sqrt{\deg f}$, reducing
dense matrix multiplications. Each kernel is paired with the complementary
row image of $f(T)$; subsequent calculations use that smaller space, and the
last annihilator need not be evaluated at all. Primary ranks are checked
exactly. Denominator clearing and integral conversion use existing bulk
matrix operations. All of this is ordinary Python; no C implementation,
native dependency, or public object-model change was added.

Connected quotients now certify integral surjectivity by checking that the
nonzero-row Hermite basis of the image is the identity. This is equivalent
to all Smith invariants being one, but does not compute unnecessary Smith
transformation matrices. At level $2003$, the Smith check alone caused an
otherwise nearly completed quotient construction to exceed the five-minute
process limit.

Newforms use a square cyclic-vector Krylov basis rather than flattening all
$d$ powers of a $d\times d$ primitive Hecke operator into a $d\times d^2$
system. Irreducibility of its degree-$d$ polynomial makes every nonzero row
cyclic. Commutation with the primitive operator and equality on that cyclic
row certify equality on the entire module. The implementation checks
commutation exactly, so matrices outside the Hecke algebra cannot pass by
agreeing on just one row; newform certificates retain full-operator meaning.

The sign-dimension checks also exposed an existing modular-symbol bug:
proper cuspidal constituents returned the entire ambient cuspidal sign
space. The implementation now intersects with the defining constituent;
the public `modular_symbols(sign=1/-1)` regressions cover this correction.
