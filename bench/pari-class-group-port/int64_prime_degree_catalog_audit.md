# Explicit signed storage: frozen catalog experiment

## Question

Does replacing exact signed degree, offset, count, status, and loop storage with
checked `int64` scalars and `Int64Buffer` close the splitting-degree gap, while
leaving the eager 1,230-prime algorithm and its outputs unchanged?

This is an experiment, not a new production implementation.  The existing
`bounded_*` graph is the baseline and remains unchanged.

## Storage and algorithm

- Residue polynomials remain in `UInt64Buffer` with `uint64` coefficients.
- Every admitted signed catalog owner uses `Int64Buffer`; signed scalar
  degrees, offsets, counts, sentinels, and loop indices use `int64`.
- Defining coefficients and the index remain exact at ingress.
- Characteristic two remains the frozen exact F2x implementation.  Two tiny
  exact staging buffers receive its at-most-four degree/exponent entries,
  which are checked and copied into signed bounded storage.
- The odd-prime exponent contract is deliberately narrowed to the catalog's
  already enforced `p <= 3037000493` corridor.
- Because the initial int64 surface has no signed shift or `bit_length`, three
  small ordinary-Python helpers express those operations by division.  This
  preserves the source powering schedule and results.
- Exact convolution accumulators, exact input reduction, the modular-inverse
  helper, length preflights, and the characteristic-two island remain exact.
  This experiment therefore makes no GMP-free claim.

## Differential result

Run:

```sh
node bench/pari-class-group-port/check_int64_prime_degree_catalog.cjs
```

CPython, JavaScript, GMP, and tagged backends agree with the frozen analytic
fixture for prime counts `[1230, 63, 64, 63]`.  The complete first-field state
is `[0, 1230, 1833, 2270]`; all grouped and full degree outputs agree.

Final evidence directory:
`/tmp/sagejs-int64-prime-degree-catalog-hYjeNg`.  The fixture catalog SHA-256
is `c9ee35c9a64e22c7a0485af5a2015e8e15532352356a6c17c4f0fd7c4584ff07`.

The generated core cache key is
`329e4d03629299dd428e739c9f5cfa72496d426458348862e051bcf99f2ca9d2` and
its SHA-256 is
`d84d03b4e650e02ff4acf3da7d33396885b33a588ea35a285398c6fabcbf624a`.
The emitted Flx multiply has seven direct word-buffer accesses, no exact-buffer
index helper, no heap call, but still four `mpz_t` locals and 21 static GMP
operations.  The complete generated multi-backend core has 201 `mpz_t` locals,
1,885 static GMP-operation sites, 1,920 checked signed add/subtract/multiply helper
sites, and 18 heap-call sites; those totals include exact ingress, validation,
F2x, and all backend variants.

## Timing result

The benchmark excludes packing and compilation, uses three warmup batches and
seven alternating retained pairs, and calibrates each arm independently so
every retained batch exceeds one second.  It reports
`qualifiedTiming: false` because this is a shared-host diagnostic.

```sh
node bench/pari-class-group-port/benchmark_int64_prime_degree_catalog.cjs \
  /tmp/sagejs-int64-prime-degree-catalog-hYjeNg/fixtures.json gmp
node bench/pari-class-group-port/benchmark_int64_prime_degree_catalog.cjs \
  /tmp/sagejs-int64-prime-degree-catalog-hYjeNg/fixtures.json tagged
```

On GMP, the int64 candidate took 19.27--19.45 ms per catalog versus
105.59--106.80 ms for the bounded-residue baseline.  The seven-pair geometric
mean ratio is **0.1823187909928469**, a **5.48x speedup**.

On tagged, the candidate took 13.68--14.02 ms versus 81.63--83.43 ms.  The
geometric mean ratio is **0.16669202899237848**, a **6.00x speedup**.

An independent confirmatory run pinned to CPU 15 used 88 candidate and 18
baseline repetitions per retained batch.  It measured 13.72--13.90 ms versus
83.78--84.75 ms, with geometric mean ratio **0.16404210110266917** (a
**6.10x speedup**).  Every arm again exceeded one second; both runs remain
shared-host diagnostics rather than qualified release measurements.

The earlier 7.7 ms PARI observation is for the larger accepted-class-candidate
boundary, so comparing the 14 ms catalog alone with it is useful orientation
but not a matched ratio.  The separately measured PARI output-contract catalog
is about 2.03 ms, placing this tagged candidate about 6.8x behind that control
and about 10x behind the 1.39 ms same-algorithm fixed-storage C ceiling.
Explicit signed storage therefore removes most of the catalog's *measured
excess over that C ceiling*, but it does not close the splitting-degree gap.
The remaining exact islands and compiler surface costs are now small enough to
investigate individually.

## Compiler findings

The port required explicit annotations for intermediates such as
`scratch + 81`; an `int64` operand alone did not make an unannotated temporary
or call argument machine-sized.  Native signed `bit_length` and shifts are
also absent.  `len(buffer)` is unsigned, so mixed signed length preflights
still promote.  These are concrete, bounded compiler improvements suggested
by the experiment; they are not algorithm changes.

The next experiment should isolate the remaining exact accumulator and
modular-inverse sites before changing mathematics.  Separately, the same
explicit-storage/reuse discipline should be tested in the real resident HNF
kernel, as required by the campaign goal.
