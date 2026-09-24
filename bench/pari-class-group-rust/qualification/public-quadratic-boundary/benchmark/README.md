# Native public-quadratic benchmark

This is an isolated, reproducible performance qualification of the complete
imaginary-quadratic route. `panel.json` is the frozen public-input panel;
`run.py` builds the release adapter, runs 15 fresh-process samples per arm and
field, alternates arm order within each pair, checks every exact output, and
writes `receipt.json` with raw clocks, medians, ratios, and build identities.
When run from a dirty integration worktree, the generated receipt is explicitly
marked **pre-promotion** and binds the exact reachable source closure by
content, rather than attributing those bytes to the current Git commit.

The Rust clock covers public coefficient validation, maximal-order
preparation, reduced-form enumeration, group construction, certificate
construction, and a private one-shot authentication of the published result
against the exact in-process group-structure witness. This authentication is
producer-bound and cannot be invoked on external data. The separately exposed
detached verifier re-enumerates the forms and independently replays every
generator translation; correctness campaigns and counterfeit tests exercise
that path, but its deliberate duplicate work is reported separately from the
public fresh-field call. The matched PARI public-call clock covers consecutive
`nfinit0` and `bnfinit0` calls at 192 bits. PARI flag zero computes the same
exact class-group projection and also does the rank-zero unit/regulator work.
Both clocks exclude process startup and JSON projection. A new process
reconstructs the result on every sample; there is no cached-result reuse. PARI
and the frozen answers are absent from the Rust executable.

The runner also builds the retained Rust executable twice with `--locked`,
incremental compilation disabled, a fixed `SOURCE_DATE_EPOCH`, and independent
target directories. It refuses to proceed unless both binary SHA-256 hashes
match. Its source-closure digest includes `run.py`, the panel, both Cargo
manifests and lockfiles, all qualification Rust sources, and every reachable
root-crate Rust/C source plus its build script. The receipt records the CPU
model, process affinity, thread-control environment, available governor/power
policy data, and before/after load averages. This host was not externally
isolated, which is disclosed rather than described as quiet.

Run it from this crate with:

```sh
python3 benchmark/run.py
```

The authenticated PARI 2.17.4 control must already exist at
`../pari-control/build/pari-control`.

## Matched scalar class-number comparison

`run_class_number.py` separately compares the exact scalar Rust count, the
current source-matched Sage.js FLINT `qfbClassNumber` addon, and PARI 2.17.4
`qfbclassno(D,0)` on the same frozen panel. Unlike the full-group comparison
above, none builds class-group invariant factors or ideal maps. PARI's pinned
documentation explicitly guarantees its Shanks routine
for `|D| < 2*10^10`; every panel field is below `10^7`, so this is a matched
*unconditional* class-number comparison. The Rust arm starts with the public
monic polynomial and repeats validation; PARI and FLINT start with its
equivalent discriminant. All clocks exclude process startup and JSON
serialization, but FLINT's clock includes the Node/N-API boundary.

Build the worktree's FLINT native dependencies and direct addon with
`pnpm --dir packages/flint build:deps` and `pnpm --dir packages/flint build:addon`.
Then run `python3 benchmark/run_class_number.py`. It authenticates the pinned
PARI source and current FLINT addon, builds the Rust and PARI executables,
rotates three arms over 15 samples per field,
checks each class number, and writes `class-number-receipt.json`. That receipt
is diagnostic and explicitly unpromoted; it does not supersede the full-group
receipt or establish a release speed claim. On the current host, Rust wins on
the four small fields. After deduplicating `b` and `-b` factorization, it is
still roughly 3–4 times slower than PARI on the three million-scale
discriminants. FLINT is within 1.5 times PARI on one such field but 2.8 and
6.4 times slower on the others, where it materializes more reduced forms.
This identifies scalar enumeration as a performance target and rules out
unconditionally routing every input to either current enumerator.

## Frozen panel and large-class-number selection

The panel includes trivial, cyclic, noncyclic, and rank-four groups, plus the
fixed near-limit `D=-9,999,991`, `h=1,715` case. No retained `h=4,352` input was
available. Before any campaign timing, the following deterministic replacement
rule was fixed: in PARI 2.17.4, call `setrand(20260920)`, take at most 50,000
draws of `d=8000000+random(2000001)`, increment each `d` until its residue mod 4
is 0 or 3, discard nonfundamental `D=-d`, and retain the first field for which
`qfbclassno(D)>=4000`. Draw 12 selects `D=-8,173,415`, polynomial
`x^2-x+2,043,354`, with `h=4,378` and cyclic group `C4378`. This oracle was used
only to freeze a benchmark input and expected differential projection.

The panel also froze `D=-9,013,587` as a prospective PARI 5--100 ms member.
Python `Random(20260922)` generated at most 1,000 outer draws in the same
8,000,000--10,000,000 interval, redrawing to an admissible residue, discarding
nonfundamental discriminants, and making one public-call measurement per
survivor. The maximum discovery measurement was 5.234 ms at outer draw 869,
which nominated this field before the campaign. Its independent 15-sample
campaign median determines its actual band. If no field has a 5--100 ms
campaign median, the runner marks that coverage and the corresponding native
target failed/not established; it does not relabel process startup or treat
the slow discovery outlier as campaign evidence.

## Targets

For PARI medians below 5 ms, the tiny-field target is Rust no slower than the
larger of twice PARI or PARI plus 2 ms. For a genuine 5--100 ms member, the
native target requires geometric-mean Rust/PARI ratio at most 1.5, p90 ratio at
most 2, and no individual ratio over 3. The receipt evaluates these rules
literally. If there is no qualifying 5--100 ms field, the native target cannot
pass.

## Tiny batch throughput

The frozen batch campaign runs 15 fresh-process samples for each of the four
structural tiny fields (trivial, cyclic, noncyclic, and rank four), with 100
independent coefficient-only computations per sample. Every computation
reconstructs and verifies the result; there is no memoized answer. This is a
Rust-only throughput measurement, not a Rust/PARI ratio. Measured throughput
belongs only in the generated second-step receipt.

## Promotion workflow

The integration owner must promote evidence in two steps:

1. Commit and freeze the engine, benchmark adapter, runner, panel, both
   manifests/lockfiles, and all other reachable sources, excluding the current
   pre-promotion receipt.
2. From a clean checkout of that frozen commit, rerun `benchmark/run.py` and
   require `promotionEligible: true`, an empty reachable-source status, equal
   independent-build binary hashes, and all exact checks. Commit that generated
   receipt separately as the evidence commit.

Until step 2, the content-addressed receipt is useful diagnostic evidence but
must not be described as bound to or promoted from the dirty `gitCommit` value.
