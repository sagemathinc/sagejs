# Row 14 resident matched-kernel clock

This experiment closes the previously documented process-boundary mismatch for
development-panel row 14.  It proves one exact resident boundary.  It does not
publish a performance ratio because an alternating timing campaign has not yet
run.

## Boundary

Both sides start with the number field prepared at 192-bit precision.  PARI
restores its prepared stack and clocks `bnfinit0(nf, 0)`.  Sage.js authenticates
and hydrates the neutral prepared-number-field envelope, compiles and warms all
native graphs, and only then starts its clock.  The Sage.js clock contains:

1. initial factor-base and rational-relation construction;
2. relation collection and incremental HNF;
3. analytic acceptance and terminal relation/unit lattice construction;
4. rank-two unit-lattice reduction and authentic flag-zero `getfu`; and
5. Smith transforms and class-generator reconstruction from live ideals.

It stops at the first instant after the class generators have been constructed.
Subprocess startup, filesystem access, owner hashing, prepared-input
authentication, native compilation/warmup, W0 differential checks, detached
certification, semantic mutation checks, and JSON publication are outside the
clock.  The resident path is implemented by
[`row14_matched_kernel_clock_host.cjs`](row14_matched_kernel_clock_host.cjs);
[`check_row14_matched_kernel_clock.cjs`](check_row14_matched_kernel_clock.cjs)
owns the reference comparison and publication.

The narrow host refactors expose the already tested computations as in-process
functions while retaining their original CLI wrappers and default digest
checks.  The PARI helper explicitly selects one worker after `pari_init`,
matching the single resident Sage.js worker and avoiding unrelated worker-stack
reservations under the 4-GiB limit.

## Exact result

The capped Linux run completed with class number 192 and normalized invariant
factors `[8, 24]`.  Against pinned pristine PARI 2.17.4 it agreed on both class
generator ideal HNF matrices, the exact regulator, torsion, terminal work
shape, and all 66 words of the terminal RNG state.  The six logarithms agreed
by 115, 111, 110, 113, 113, and 112 leading bits; the fail-closed threshold is
96 bits.  Five independent mutations of the class number, generator ideal,
regulator, logarithm, and RNG state are rejected after the clock.

## Single-run observation

Under a 4-GiB address-space limit and 600-second CPU limit, the exact-boundary
proof observed:

```text
Sage.js resident mathematical kernel                 91.109736691 s
  initial root and live state                         1.382778671 s
  factor metadata projection                          0.002119470 s
  relation collection and incremental HNF            89.392067233 s
  accepted live-state projection                       0.000146340 s
  analytic acceptance and terminal lattice             0.255483406 s
  unit lattice and flag-zero getfu                      0.016000226 s
  class-group generator reconstruction                 0.061141345 s
PARI 2.17.4 resident single-thread bnfinit0             2.023787590 s
maximum RSS: Sage.js / PARI                      1,537,452 / 227,372 KiB
```

These are single observations, not a qualified comparison.  In particular,
the dominant 89.392-second stage is presently an aggregate: the resident Gate-C
API does not expose exclusive collector versus `hnfspec`/`hnfadd` clocks.
Splitting it requires new instrumentation and another expensive run.  This
audit records that limitation instead of attributing the time speculatively.

## Remaining asymmetries and next experiment

The external mathematical boundary now matches, but internal representations
do not: Sage.js creates multiple bounded GMP, `int64`, and floating work buffers
inside the kernel, while PARI resets and reuses its stack.  The two programs may
also reach the same certified result through different internal scheduling.
Those facts matter for diagnosis, but they do not add non-mathematical work to
the Sage.js clock.

The decisive result is localization: more than 98% of the Sage.js interval is
now the connected relation/HNF stage.  Compilation, process launch, immutable
owner publication, replay, and terminal unit/class reconstruction are not the
explanation for the remaining gap.  The next run should add allocation-free
exclusive counters around relation collection and `hnfspec`/`hnfadd`, then
apply the bounded-storage/private-call-graph work specifically to the dominant
leaf.  Only after another boundary audit should an alternating campaign of at
least seven pairs publish a ratio.

## Reproduction

```bash
/usr/bin/prlimit --as=$((4*1024*1024*1024)) --cpu=600 -- \
  node bench/pari-class-group-port/check_row14_matched_kernel_clock.cjs
```
