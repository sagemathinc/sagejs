# Volume-guided, resumable cubic recovery

Status: **experimental, not promoted**. Both variants are slower on the target.
The earlier-checkpoint variant also loses development-field acceptances.
Production mathematical source, certification inequalities, resource limits,
and the production kernel registry are unchanged. PR190 remains draft.

## What was changed

The source-copy builder preserves the complete cheap collector and adds the
previously tested conditional-center iterator only for recovery. It prepares
one immutable expanded plan per ideal and retains one cursor per ideal.
Each visit admits at most four new rows, then moves to the next ideal. Later
rounds resume the same geometric cursor, not a rebuilt or restarted region.
Certification can interrupt a visit after fewer than four rows; the remaining
quota survives that interruption.

Two uninstrumented variants were compiled and measured:

- `recovery`: leave all initial collection targets unchanged.
- `early`: additionally change the staged twelve-factor initial target from
  $n+22$ to $n+6$. Other initial targets remain unchanged.

Neither variant changes the final certificate, permits a fatal status to
resume, or interprets a discovered unit as a completed class-group proof.
The larger regions are discovery heuristics, **not completeness bounds**.
No claim of matching PARI's floating-point bounds exactly is made.

## Exact volume rule

For the positive-definite Gram matrix

$$G=\begin{pmatrix}a&b&c\\b&d&e\\c&e&f\end{pmatrix},
\qquad \delta=ad-b^2,\qquad D=\det G,$$

the LDL diagonal entries are $a,\delta/a,D/\delta$. The diagnostic policy
uses the rational volume parameter $T=478$, close to PARI 2.17.4's
$1500/\pi$, as in the
[independent exact search investigation](cubic-exact-conditional-search.md).
With $S=T^2=228484$, the native integer formula is

$$B=\max\left(2d,
\begin{cases}
\lceil\sqrt{S\delta}\rceil,&S\delta^3<D^2,\\
\lceil\sqrt[3]{SD}\rceil,&S\delta^3\ge D^2.
\end{cases}\right).$$

The branch comparison follows by multiplying the rational LDL comparison by
the positive denominator $\delta^2$. Integer root rounding gives the same
bound as the independent rational oracle. Nonpositive principal minors,
failed bounded root computation, and coordinates exceeding the existing
64-coordinate envelope fail closed. An unprepared plan or one whose old
bound is already at least $B$ supplies no new shell.

Only points with $B_{old}<Q(x)\le B$ are considered. This can omit useful
points in the old region that the cheap prefix never reached. It does not
make an accepted certificate unsound, but it is an important distinction
from using volume-guided search from the start.

## Cursor and state invariants

The parameter matrix has $n$ rows of eleven entries. The state matrix has
$n+1$ rows of six entries: a header with the current ordered ideal position,
and one row per ideal containing the current visit's accepted-row count,
phase, three cursor coordinates, and cumulative candidate count. Phases are
unprepared, active, and exhausted. Candidate counts never reset on revisits.

The conditional iterator retains its monotone virtual-box budget contract.
Skipped infeasible slots consume proposal budget, and every caller checks
the exact before/after difference. This is **not** a PARI small-norm counter.
A full pass over exhausted ideals terminates; an active iterator returning
neither progress nor closure/exhaustion is a fatal contract violation.

Full modular rank is explicitly required: the underlying collector's row
target only stops collection when full rank is known. Without this guard,
using its target as a four-row visit quota would be incorrect. Zero budget,
negative status, and terminal online closure are no-ops.

## Validation and measured results

The CPython scheduler test checks 808 budget splits, one-slot resumptions,
changing certification targets, visit quotas, wraparound, empty regions,
fatal/no-progress exits, and terminal closure. An independently constructed
round-robin stream agrees with all 81 distinct proposals and 54 admitted
mock rows. Two hundred volume plans, including 300-bit rescaling, agree with
the rational oracle; additional cases test both sides of the volume branch
boundary and already-large/invalid plans. AST checks establish that only
the two recovery helpers and allocation dimensions change in `recovery`;
`early` changes one additional initial-target condition.

The existing conditional-iterator suite also passes, including CPython,
JavaScript, GMP, and fmpz comparisons. Both complete new source-copy kernels
compile with zero host callbacks. These tests do not constitute an independent
exact replay of the new full field results.

On the paired, frozen **1,012-field development corpus**, at effort 5:

| Variant | Accepted | Declined | Exceptions | Gains / losses vs baseline |
|---|---:|---:|---:|---:|
| Baseline | 961 | 51 | 0 | — |
| Recovery | 962 | 50 | 0 | 1 / 0 |
| Early | 949 | 63 | 0 | 1 / 13 |

All accepted class numbers and invariant factors agree with corpus data.
The common gain is `3.1.1954455.1`. This is not the reserved unseen holdout,
not a public authenticated-receipt run, and not evidence of 100% coverage.

Two serialized controlled `opt` runs compared each variant with baseline
and fresh PARI `bnfinit(f,0)`. Native calls use preallocated external scratch
and the existing effort sequence 5/1/7/8; 20 warmups, seven alternating-order
rounds, 64 native calls and 256 PARI calls per sample, CPU 0 pinned. No builds
or corpus jobs ran on `opt`. Times below are medians in milliseconds:

| Polynomial | Baseline / recovery / PARI | Baseline / early / PARI |
|---|---|---|
| $x^3-x^2-7x+122$ | 4.262 / 4.940 / 1.547 | 4.294 / 5.323 / 1.547 |
| $x^3+9x-55$ | 1.805 / 1.801 / 1.188 | 1.818 / 1.825 / 1.191 |
| $x^3-x^2+3x-4$ | 1.304 / 1.307 / 1.016 | 1.310 / 1.329 / 1.016 |
| $x^3-x^2-11x-63$ | 2.214 / 2.211 / 1.219 | 2.251 / 2.273 / 1.230 |

Target paired median ratios are 1.168 and 1.240. These are negative diagnostic
results, not public API timings or a new PARI win. One run per variant is
sufficient to reject promotion here, not to assert small control speedups.

## The structural difference exposed by checkpoint traces

A separate, **untimed** instrumented source copy adds an explicitly sized
trace buffer to the public native signature. It records initial discovery
state and each exact closure's row count, upper class number, return status,
and diagnostic phase/reason. The packager rejects instrumented artifacts for
timing. On the target:

- Baseline attempts certification at 26 rows (missing unit), then 27 (success).
- Early attempts at 18, 19, and 22 rows (missing unit), then 26 (success).

Thus the smaller initial prefix produces **four**, not two, full closure
attempts. It still runs the old cheap search before exploring volume shells.
The three-ideal volume-only forensic prefix was never the actual algorithm
of either measured variant.

The first lost field is $x^3-x^2-8x-159$, label `3.1.78223.1`:

- Baseline's 34-row prefix certifies class number 6 in one closure attempt.
- Early's 18-row prefix has full rank and presents an upper group of order 12.
- Its closure returns **0**, phase 8, after valid analytic index computation.
  The logarithmic joint-index interval is approximately $[0.32858,1.05361]$;
  it is insufficient for index one. The positive lower endpoint excludes
  index one. The exact trace retains the integer endpoints and scale.
- The scheduler stops: its recovery guard only admits phase 43/reason 434,
  not valid phase-8 analytic insufficiency. Reason 435 is a stale unit-
  materialization marker, not the reason for the final insufficiency.

This supplies a concrete next regime: **a valid full-rank presentation can
still need more relations after an analytic check**, not merely more unit
evidence. Any extension must authorize that exact status separately from
malformed intervals or failed publication, audit the borrowed-state lifetime,
and recompute the presentation and certificate after resuming. Merely accepting
an analytic interval containing index two would be mathematically wrong.

PARI's `buch2.c` makes this distinction explicitly: `bad_check` separates
insufficient relations from insufficient precision, and the `fupb_RELAT`
branch sets `need = 1` and continues collection. When full rank is already
known, it can rotate the ideal ordering or prioritize primes representing
the surviving class-group generators. Its numerical thresholds are not our
rigorous acceptance inequalities and must not be copied as proof rules.
The inspected PARI 2.17.4 source has SHA-256
`904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac`.

A fresh local PARI debug trace on this lost field reaches class number 6
with 18 relations: four initial rational relations and 4/4/4/2 relations
from ideals numbered 12/11/10/9. It reports 32 small-norm candidates and
19 factorizations, then regulator approximately 5.4333023 and check 1.0190755.
This is an untimed forensic run, not an additional performance sample. It
confirms that 18 suitably chosen rows suffice for PARI here, while our cheap
18-row prefix still presents order 12. All thirteen new early-variant declines
end at phase 8, although only the first has the detailed checkpoint audit.

The next experiment therefore needs two separate controls: authorize valid
analytic-index insufficiency to resume safely, and measure volume-guided
per-ideal collection **before** paying for the old cheap prefix. Neither
change should be credited with the other's gains or allowed to weaken the
final proof.

## Resource cost, provenance, and reproduction

The baseline mathematical source remains SHA-256
`93a41e20e4c7916bb00957ae0322b5378bf16491c317f5eeea2ef3f011a29e2c`.
Recovery source is 449,589 bytes; early source is 449,565. With the 46,619-byte
runtime companion they exceed the existing 485,000-byte allowance by 11,208
and 11,184 bytes. No allowance was raised. After normalizing the main source
path, generated cores are 11,688,685 / 11,686,941 bytes versus 11,398,794 for
baseline. Addons are 20,452,112 versus 20,411,152 bytes. This is added code,
not a generated-code reduction hidden by shorter diagnostic filenames.

Both variants retain 1 MiB resident and 3 MiB temporary limits. The larger
per-ideal foreign matrices do consume additional space; no peak-memory or
arbitrary-pause resource non-regression is claimed. Reusable consolidation
would be required before any future promotion, even if timings were good.

Reproduce from the campaign worktree with fresh output directories:

```sh
node bench/class-unit-groups/diagnose-cubic-volume-batch-build.cjs "$PWD" /scratch/PROJECT/fresh-recovery recovery
node bench/class-unit-groups/diagnose-cubic-volume-batch-build.cjs "$PWD" /scratch/PROJECT/fresh-early early
node --test test/number-field-cubic-volume-batch.cjs test/number-field-cubic-exact-fp-oracle.cjs test/number-field-cubic-conditional-prefix.cjs
```

Use `package-cubic-conditional.cjs` with the baseline cache, candidate
`builds.json`, and a fresh destination. Its `source-builds.json` feeds
`diagnose-cubic-ablation-run.cjs` with the frozen corpus gzip; its portable
bundle feeds `diagnose-cubic-ablation-timing.cjs` on `opt`. The builder accepts
`baseline trace` or `early trace` for untimed checkpoint artifacts;
`diagnose-cubic-volume-batch-trace.cjs` reads the recorded early corpus report
to select the first lost field's actual defining polynomial.

Reports are in `build/cubic-next-evidence/`. SHA-256 digests:

- `volume-batch-corpus-recovery.json`: `622688ae268df937b8d01bb4edb17d4a87967b9905a41cc037b26ba642447460`
- `volume-batch-corpus-early.json`: `c983624f0d0e93891408988d52a299a2bebc58400ecf229d6c33f6b05e64a10d`
- `volume-batch-opt-recovery.json`: `45497ca1cae76c0316fc22507ea78e255e3a6c09aa291d8c61dabce179a1dd2f`
- `volume-batch-opt-early.json`: `b0b3ffc89e48679c2dd14bea602a3695b6e9762994cb4ce1cb8585b093554db3`
- `volume-batch-trace-baseline.json`: `c3b005b1a08c3e029de4391b3dedd5638c0830dbd1b80d2b38101892507459bc`
- `volume-batch-trace-early-v2.json`: `2a8482afba1e3266238e57e2f8ab9520a9b35390435573fab6e090d627af463d`
- `volume-batch-pari-first-loss.log`: `a07e3a05fea9ce4a639d296d2a283914bf4bef24d554be6e3800b0ff60ea507a`

The current builder reproduces both timed mathematical source files exactly.
All four focused tests pass again after a complete local build (8m24s);
Python formatting, architecture checks, and the subsequent build-reusing
documentation check pass. The production pack reused all 42 kernel families;
no candidate was installed. Optional numerical reactors were skipped because
their reproducible Wasm toolchain is absent. The inherited
parallel check still fails on 395 live task records; broad Wasm/toolchain
qualification remains unfinished. No production qualification claim is made.
