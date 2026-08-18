# Elliptic-curve analytic-rank oracle harness

This directory contains an offline, developer-only differential and benchmark
harness for probable analytic rank over `QQ`. Sage/PARI and Magma are oracle
processes; neither is a Sage.js runtime dependency or an ordinary CI
requirement.

The curve data is pinned in
`test/data/elliptic-analytic-rank/curves.json`. It contains decimal-string
a-invariants (to avoid JavaScript integer rounding), conductor, functional
equation sign, expected probable rank, leading derivative, provenance, and
test-tier annotations. The harness never contacts LMFDB or any other network
service.

## Run it

The defaults match the development installations used to capture the baseline:

```bash
node bench/elliptic-analytic-rank/run-oracles.cjs --tier core \
  --samples 5 --require-sage --require-magma
```

Paths are configurable, and missing optional systems produce explicit
`unavailable` records. The harness also probes `$LCALC_ORACLE` (or `lcalc` on
`PATH`):

```bash
SAGE_ORACLE=/path/to/sage MAGMA_ORACLE=/path/to/magma \
  node bench/elliptic-analytic-rank/run-oracles.cjs --tier all
```

Check exact stable fields against the checked-in receipt:

```bash
node bench/elliptic-analytic-rank/run-oracles.cjs --tier all --check \
  --require-sage --require-magma
```

Regenerate a candidate receipt after deliberately changing the manifest or
oracle versions:

```bash
node bench/elliptic-analytic-rank/run-oracles.cjs --tier all \
  --require-sage --require-magma \
  --output /tmp/elliptic-analytic-rank-oracles.json
```

Review its versions, settings, warnings, ranks, derivatives, coefficient
prefixes, and manifest digest before replacing the pinned receipt. Do not
blindly update a baseline after an oracle disagreement.

The standalone Sage adapter can also be run directly. It starts Sage once and
evaluates the whole selected tier in that process:

```bash
/path/to/sage -python bench/elliptic-analytic-rank/sage_oracle.py \
  --manifest test/data/elliptic-analytic-rank/curves.json \
  --tier core --samples 5
```

## Result semantics

All ranks in this corpus are **probable numerical analytic ranks**. A numerical
zero test does not prove that a derivative vanishes. In particular, the
`234446a1` rank-4 result and the optional rank-5 stress result must not be
described as unconditional proofs of their orders of vanishing.

Sage/PARI returns the first nonzero derivative `L^(r)(E, 1)`. Magma 2.18-5
returns the Taylor coefficient `L^(r)(E, 1) / r!`. The Magma adapter records its
raw value and multiplies it by `r!` before making the cross-oracle comparison.
This is visible on the rank-2 motivating curve:

| System | Raw convention | Raw value | Normalized derivative |
| --- | --- | ---: | ---: |
| Sage 10.9/PARI 2.17.1 | `L^(2)(1)` | 14.7552475203802700 | 14.7552475203802700 |
| Magma 2.18-5 | `L^(2)(1)/2!` | 7.37762376019013288 | 14.75524752038026577 |

The manifest's `zero_sum_upper_bounds` are a separate contract. Those bounds
are conditional on GRH and are not analytic-rank values. The optional
`raw_sum` fields are Sage 10.9's verbose sinc-squared zero sums before ceiling
and root-parity adjustment.

## Corpus tiers

- `core` has ranks 0 through 4, the motivating conductor-1,008,811 curve, and
  the pathologically low-zero curve `256944c1`.
- `quick` adds small reduction/model fixtures suitable for frequent local
  checks.
- `models` targets a nonminimal model and additive reduction at 2 and 3.
- `stress` contains a probable rank-5 example and a conductor above `10^12`.
- `all` selects every record and is used for the pinned baseline.

The pathological curve deliberately has a zero-sum upper bound 2 at
`Delta <= 2`; its probable analytic rank is 0. Sage's documentation reports
that the bound first becomes strictly less than 2 around `Delta = 2.815`.
Those larger values require exponentially more prime coefficients, so the
ordinary harness pins the cheaper failure behavior and leaves larger Delta
tests to an opt-in stress run.

## Benchmark methodology

Each oracle is one persistent process covering all selected curves. Timings
inside that process distinguish:

1. curve construction;
2. analytic rank on a freshly constructed object;
3. a same-object repeat (reported separately because it may exercise caches);
4. for Sage, exact coefficient generation through a configurable `anlist`
   cutoff;
5. total process wall time, which includes cold startup and shutdown.

Sage uses `time.perf_counter()` wall time. The installed Magma 2.18-5 exposes
coarse `Cputime()` values, often zero for sub-10 ms work, so Magma timings are
comparative approximations rather than performance gates. The receipt records
which clock was used. Numerical-kernel time cannot be isolated through these
public external APIs and is therefore not fabricated; the Sage.js
implementation benchmark must measure that boundary in-process.

Use at least five warmed samples for performance reports. A one-sample run is
appropriate for regenerating stable oracle values. Never mix same-object
repeats into fresh-object medians, and never compare total process time against
an in-process numerical kernel.

On the capture host, a five-sample run of the motivating curve measured a
10.25 ms Sage/PARI fresh-object median and a 10 ms Magma median. Magma's value
is quantized by its coarse CPU clock; the one-process wall totals were 1.17 s
and 0.32 s respectively, including startup, ten analytic-rank evaluations, and
shutdown. These numbers describe the external oracles, not Sage.js acceptance
gates.

The checked-in baseline captures one-sample stable data, including the first 64
exact `a_n` values as a prefix plus SHA-256 digest. Timing fields are retained
as historical context but ignored by `--check`.

No standalone `lcalc` executable was present during the baseline capture; the
Sage `lcalc` wrapper failed for the same reason because it shells out to that
program. The harness records this as an explicit capability skip. Even when an
executable is found, it is not counted as an oracle result until a future
adapter records its coefficient request/cutoff and verifies that the supplied
coefficients are sufficient; lcalc can otherwise warn and return an inaccurate
rank.

## Adding a curve

1. Pin all five a-invariants, conductor, sign, probable rank, derivative, and
   source URL or published source in the manifest.
2. Use decimal strings for every invariant and conductor.
3. Give the curve a focused tier and explain what failure it is meant to find.
4. Run Sage/PARI and an independent implementation family where available.
5. Check the leading-value convention before comparing derivatives.
6. Review raw disagreements; never widen the comparison tolerance merely to
   make a fixture pass.
7. Regenerate and review the offline baseline. Tests must remain network-free.
