# Certified genus-3 oracle and benchmark protocol

This directory contains independent development evidence for the certified
genus-3 local-factor pipeline. None of Sage, PARI, or Magma is a Sage.js
runtime dependency.

## Exact corpus

[`genus3-certified-oracle.json`](../../test/data/hyperelliptic-rforest/genus3-certified-oracle.json)
freezes 20 good reductions of four genus-3 models:

- odd degree and even degree;
- sparse and dense coefficients;
- the generalized equation `y^2+x^2*y=x^7-x+1`;
- primes from 5 through 10007.

Every record stores the full `det(1-T*Frob)` polynomial, its three rforest
residues, `L(1)=#J(F_p)`, `L(-1)=#J_twist(F_p)`, and `#C(F_p)`. Sage
10.9.post1 with PARI 2.17.1 produced all records through
`frobenius_polynomial()`, whose implementation calls PARI
`hyperellcharpoly`. Magma 2.18-5 independently reproduced every record with
`p <= 101` using `LPolynomial` and `#Points`.

The checked-in test deliberately needs no external CAS. It checks all exact
functional-equation and cardinality identities, compares every residue with a
fresh rforest traversal, and runs exhaustive exact candidate completion on the
cross-CAS small-prime subset:

```sh
node --test test/hyperelliptic-genus3-certified-oracle.cjs
```

This corpus is an oracle sample, not a claim that 20 points prove the whole
implementation. The full stream also has to match across the supported
platforms, and unresolved rows must use the exact fallback.

The handwritten Jacobian search kernel has a second, independent differential
gate:

```sh
node --test test/hyperelliptic-genus3-jacobian-search-differential.cjs
```

That test constructs canonical Mumford divisors with the ordinary Python
Cantor law, including zero, inverse, doubling, same-input addition,
non-coprime `u` cases, deterministic scalar combinations, and a completed-
square generalized model. It compares native element-order certificates with
the ordinary law, exercises not-found/resource/cancellation/invalid-input
statuses, and repeats searches in independent Node workers to detect shared
mutable state. The fixtures are generated deterministically at test time and
do not depend on PARI, Magma, or network access.

The direct addon probe also passes on Linux x86-64, Linux aarch64, macOS
arm64, and native Windows x86-64. Every platform returned order 94 with
factorization `2*47` over `F_3`, order 764 with factorization `2^2*191` for
the generalized `F_11` model, and identical resource-limit and cancellation
statuses. This probe caught and fixed a Node-API BigInt size-query error that
the C-only kernel test could not expose.

## Stage benchmark

Run the complete acceptance workload with:

```sh
node bench/rforest/benchmark-genus3-certified.cjs
```

The defaults are one sample each through `10^4`, `10^5`, and `10^6`. The
`--quick` smoke test stops at 101; useful development subsets are:

```sh
node bench/rforest/benchmark-genus3-certified.cjs --quick
node bench/rforest/benchmark-genus3-certified.cjs \
  --limits 10000 --stages raw,candidates
node bench/rforest/benchmark-genus3-certified.cjs \
  --quick --allow-incomplete
```

The JSON result keeps the following stages separate:

1. `raw_rforest` calls the packed native bridge directly and SHA-256 hashes
   every returned buffer.
2. `candidates` includes the checked Python boundary and exact Weil-candidate
   enumeration. It records row count, total/max candidates, and a deterministic
   digest of the candidate-count stream.
3. `certification` calls `rforest_genus3_local_factors`, records primary and
   twist sample/operation counts, sums any stage timing instrumentation, and
   digests every uniquely completed polynomial.
4. `public` constructs a fresh curve and consumes `local_data(...)` with
   `cache_size=0`, including exact per-row fallback, the research record
   schema, and public polynomial construction. It uses `algorithm='auto'`
   through the measured endpoint 100000 and explicit `algorithm='rforest'`
   above it.

Missing certification or public APIs make the benchmark fail. The
`--allow-incomplete` switch exists only so an implementation lane can measure
finished earlier stages. A valid acceptance receipt uses no such switch.

Each result records OS, architecture, Node version, backend capability, CPU
and wall time, RSS, row counts, and exact-stream digests. Compare digests, not
timings, across Linux x64/arm64, macOS arm64, and native Windows x64. Compare
timings only for like hosts and builds. The public stage is the default-selection
gate: a fast raw remainder forest does not compensate for slow certification
or widespread fallback.

The pre-certification baseline on the same Linux x86-64 host was:

| Stage | Limit | Rows | Wall time | Exact digest |
| --- | ---: | ---: | ---: | --- |
| raw rforest | 10000 | 1229 | 316.955 ms | `a7c9918ed5f317aca3581bc31e6c0e121e99ce99d9997ee579a40916ae562486` |
| raw rforest | 100000 | 9592 | 6386.673 ms | `6fb94e04ed80b8964cd1c8356950d0d8b3c91e13e42873ab22f795d34733922d` |
| raw rforest | 1000000 | 78498 | 132786.735 ms | `e2a9385cb24018539272494a6245aa4c0c016b54e7243191d9688a2b367b5b1a` |
| candidates | 101 | 24 | 3362.210 ms | count digest `3279588448590785459017807028135743382` |
| candidates | 1009 | 165 | 52043.354 ms | count digest `153946097821799377117130024943921925723` |

At 1009 the candidate stream contained 17545 candidates in total and at most
215 for one prime. A run through 10000 was stopped after 75 seconds rather
than consuming a development host indefinitely. This directly establishes
that the old transpiled-Python enumeration is not a viable `10^6` path; the
new completion work must accelerate it before a full acceptance receipt can
exist. The raw times also show why the limit must remain an explicit benchmark
dimension instead of extrapolating from a 100-prime smoke test.

After integrating the native candidate and Jacobian kernels, an intermediate
exact implementation took 6.18 s through 101. Most of that time was redundant
ordinary-Python work: it eagerly constructed 24 sample divisors and repeated
the exact-order proof already performed by the native factor-and-strip
routine. The production path now constructs one deterministic divisor first,
expands the sample only if multiple candidate orders survive, verifies the
native prime factorization and its product independently, and accepts the
kernel's exact `e*D=0` and `(e/q)*D!=0` checks. Injected certificate providers
still receive the full ordinary-Python group-law recheck.

On the same Linux x86-64 host, the optimized exact public stream took 0.901 s
through 101 and 2.534 s through 1009. Through 10000 it returned 1225 factors
in 34.030 s; four singular supplied-model rows were omitted, one row used the
exact fallback, and the other 1224 were uniquely certified. The exact stream
digest was `109634041913073816655618606802201078531`. The separately measured
certification pass took 33.817 s, with 4.033 s in candidate lifting and 7.587
s in primary native certificate search. Raw rforest took 314.132 ms. The
public benchmark recorded `algorithm='auto'`, so this is a selector receipt,
not merely an explicit-backend timing. Streaming completed rows instead of
retaining their Jacobian certificates reduced peak RSS for this run from about
660 MB to 478 MB.

That complete through-10000 receipt originally defined the deliberately
bounded interval `auto` envelope. With all three native capabilities present,
`auto` selects
the certified path for odd-degree genus-3 one-off primes throughout the
checked native range and for intervals ending at the measured automatic
ceiling. It fails
closed to the exact reference backend for even-degree models, missing native
capabilities, characteristic-two singleton requests, and larger intervals.
Explicit `algorithm='rforest'` remains available beyond the measured
interval envelope. The larger default benchmark dimensions remain useful for
deciding when that envelope can be expanded; results are measured rather than
extrapolated.

The replacement native exact enumerator was separately measured by
`pnpm bench:hyperelliptic-genus3-candidates` on the same development host. Its
one-row wall times were 2.7 ms, 2.2 ms, 5.9 ms, 27 ms, and 166 ms at
`p=101`, `1009`, `10007`, `100003`, and `1000003`, respectively. Those
numbers isolate candidate lifting; they do not include the rforest traversal,
primary/twist Jacobian witnesses, exact fallback, or public polynomial
construction. They therefore remove candidate enumeration as the obvious
scaling blocker without serving as an end-to-end acceptance result.

### Through-100000 automatic-selector receipt

The candidate enumerator now accepts a packed window of residue triples in
one source-transparent native call. Each row has a fixed candidate bound and
falls back to the already-proved single-row path if it is exceptional. This
retains exact arbitrary-precision inequalities while avoiding thousands of
compiler crossings and allocations.

On 2026-08-19, the complete four-stage gate for `y^2=x^7+x+1` through
100000 passed on Linux x86-64 / Node 26.7.0:

| Stage | Wall time | Rows | Peak RSS | Exact digest |
| --- | ---: | ---: | ---: | --- |
| raw rforest | 5.826 s | 9592 | 260 MB | SHA-256 `6fb94e04ed80b8964cd1c8356950d0d8b3c91e13e42873ab22f795d34733922d` |
| candidate lifts | 108.326 s | 9588 | 508 MB | `98151161505875232667123644541309019308` |
| exact certification | 881.647 s | 9592 | 689 MB | `3728105193022836152423678822391807418` |
| public `auto` stream | 958.669 s | 9592 | 749 MB | `3728105193022836152423678822391807418` |

There were 9587 uniquely certified rows, one exact fallback, and four honest
omissions caused by singular reductions of the supplied integral model. The
public stream used `cache_size=0` and ended with zero curve-cache entries. Its
digest agrees with the independent certification stage. The four stages ran
sequentially in one process, so later RSS includes benchmark diagnostics
retained from earlier stages; 749 MB is the cumulative harness peak, not a
claim that every standalone stream uses that much memory. The complete
machine-readable receipt is
[`hyperelliptic-genus3-auto-100k-2026-08-19.json`](../results/hyperelliptic-genus3-auto-100k-2026-08-19.json).

This receipt expands the automatic odd-degree genus-3 interval envelope to
100000. The next performance target is streaming candidate completion and
certificate production in smaller internal windows so diagnostic or public
callers need not retain all 10,696,699 candidate triples at once.

## One-off oracle measurements

On the Linux x86-64 development host, a cold `frobenius_polynomial()` call for
`y^2+x^2*y=x^7-x+1` gave:

| p | Sage 10.9.post1 / PARI 2.17.1 median of 3 |
| ---: | ---: |
| 11 | 2.669 ms |
| 1009 | 300.845 ms |
| 10007 | 4083.071 ms |

Each repetition constructed a fresh finite-field curve so Sage's polynomial
cache could not turn later samples into lookup timings. A separate run at
`p=100003` and `p=1000003` exhausted PARI's configured 1 GiB stack. These are
host/toolchain observations, not complexity claims.

On the same host, after warming module initialization with one unrelated
factor, Sage.js's explicit certified `rforest` backend took 179 ms at `p=11`,
986 ms at `p=1009`, 782 ms at `p=10007`, 1.50 s at `p=100003`, and 6.03 s at
`p=1000003`. Thus PARI remains decisively better for very small one-off
primes, while the certified Sage.js path overtakes this installed PARI by
`p=10007` and continues through the two examples where PARI exhausted its
configured stack. These measurements do not alter the separate dense-stream
`auto` gate.

Magma 2.18-5 produced all `p <= 101` oracle rows, but its first
`LPolynomial` computation for the odd sparse curve at `p=1009` was manually
stopped after 100 seconds. The currently installed version is valuable as an
independent small-case oracle, not as a competitive performance baseline.

## Competing backend audit

### PARI `hyperellcharpoly`

PARI exposes an exact library call for `y^2=P(x)` and generalized
`y^2+Q(x)y=P(x)` over finite fields. It is the current Sage implementation and
the strongest one-off reference tested here. Its millisecond-to-seconds curve
above is compelling below roughly `10^4`; its stack behavior and per-prime
scaling do not replace an average-polynomial dense traversal. The
[PARI documentation](https://pari.math.u-bordeaux.fr/dochtml/html-stable/Arithmetic_functions.html)
also documents the related `hyperellpadicfrobenius` interface.

PARI is embeddable, but adding it solely for this feature is not currently the
portable choice. The upstream project distributes Windows executables, while
its own [Windows guidance](https://pari.math.u-bordeaux.fr/faq.html) recommends
WSL for serious use and says pthread PARI is very slow on Windows. That does
not satisfy Sage.js's native-Windows product path without a separate library,
threading, cancellation, and packaging project. Keep PARI as the exact oracle
and revisit it only as a repository-wide dependency decision.

### Magma Jacobian and point-counting machinery

Magma exposes Jacobian arithmetic, bounded point order, Jacobian order,
Euler factors, deformation point counting, and group structure in one mature
system; see its [hyperelliptic curve handbook](https://magma-maths.org/documentation/text1607.htm).
That validates the architecture of rforest residues followed by exact group
certification. Its proprietary license rules it out as a runtime dependency.
The installed 2.18-5 build is also too old to characterize current Magma
performance.

### `hypellfrob` / Kedlaya--Harvey

David Harvey's [hypellfrob 2.1.1](https://web.maths.unsw.edu.au/~davidharvey/code/hypellfrob/)
is a 2008 C++ library using NTL and zn_poly. It computes the whole zeta
function by Monsky--Washnitzer Frobenius and is a legitimate one-off algorithm
comparison. It is old, adds two native dependency families, and supports only
odd-degree models in the comparison described by Harvey--Sutherland. Reviving
it would be a separate portability project, not a shortcut for this pipeline.

The Harvey--Sutherland
[remainder-forest paper](https://doi.org/10.1112/S1461157014000187)
reports that optimized Kedlaya was faster than genus-3 Jacobian group
computation beyond `2^16` for one-prime work, while the remainder forest was
substantially faster for its all-primes Hasse--Witt workload. This supports a
hybrid policy: rforest for dense intervals, an exact one-off fallback, and
benchmarks before selecting a one-off threshold.

### dormant smalljac genus 3

The pinned smalljac source retains the shape of the desired coefficient and
group search, but the audited version has no complete linked genus-3 group-law
closure. It remains useful algorithmic provenance. Making it a production
backend requires restoring those operations, fixed-width/Windows validation,
sanitizers, and differential testing; it is more work than using the already
verified Sage.js Jacobian law.

### higher Frobenius congruences

Computing coefficients modulo `p^2` or higher can collapse much of the lift
set before group search, but neither rforest's present ABI nor a ready,
portable library supplies those congruences. This is promising follow-up
research after stage timings identify candidate enumeration or certification
as the bottleneck. It must not weaken the current exhaustive candidate proof.

## Decision

Use the existing rforest traversal plus exact Weil enumeration and
primary/twist Jacobian certificates as the production dense-range path. Keep
PARI and Magma as development oracles. Retain exact point counting as the
deterministic per-row fallback. Benchmark a PARI-like p-adic backend later for
one-off primes, but do not delay or complicate the portable certified stream
by adding a large external runtime dependency now.
