# PARI-sized initial cutoff experiment

This is a diagnostic experiment, not a public API change, production
qualification, or PARI win. Production defaults remain unchanged.

## Question and construction

For $f=x^3-x^2-11x-63$ (LMFDB `3.1.12716.2`, class group $C_3$),
instrumented PARI 2.17.4 previously reported residue cutoff 768. Compare
Sage.js's initial analytic cutoff 997 with 768, holding the remaining source
fixed at `ca2e588b5053ab14bc6f23612681b6adcd02c140`.

The build driver makes two isolated Python source copies and changes only
`_CUBIC_ANALYTIC_THRESHOLD`. It compiles their actual source bodies, retaining
the exact interval arithmetic, conditional-GRH acceptance test, and refinement
to 1494. Neither result enters the production public receipt/cache path.
Matching the cutoff does not establish that PARI and Sage.js evaluate identical
analytic formulas, use identical arithmetic, or perform identical total work.

The cutoff is a work-selection policy. The unchanged Belabas--Friedman bound
and index-one certificate still govern acceptance; 768 is within the theorem's
stated $X\ge69$ range. No new conjecture or unproved acceptance rule was added.
The target passes at 768, with final upper logarithmic index bound approximately
$0.515393<\log 2$. It does not require refinement. This experiment executes
the existing checker but does **not** independently replay its certificates.

## Controlled diagnostic on opt, 2026-09-08

AMD EPYC 7B13, Linux x64, Node 26.8.1, PARI 2.17.4. The process and its GP
children inherit CPU-0 affinity. OpenBLAS, OMP, and MKL thread limits are one.
Each native variant warms for 100 calls; eleven retained rounds alternate
997/768/PARI and PARI/768/997. Native batches contain 256 calls. Each GP process
warms for 100 calls and times 1,000 fresh `bnfinit(f,0)` calls, seeded once with
`setrand(1)`. Process startup is outside the GP timer. All results agree on
class number 3 and invariant factor 3.

| Implementation | Median ms/call |
| --- | ---: |
| Sage.js native, initial 997 | 2.272816 |
| Sage.js native, initial 768 | 2.151935 |
| PARI `bnfinit(f,0)` | 1.234000 |

The cutoff change reduces the native median by 5.32%. The candidate is still
about 1.74 times PARI's median in this harness.

Both variants retain eight factor-base ideals and thirteen proof relations.
The analytic plan shrinks from 119 terms / 93 values to 97 terms / 75 values.
Thus this experiment reduces analytic work, not relation collection.

These are **not public-call timings**: Sage.js invokes the native
polynomial-to-result program with preallocated external scratch; PARI returns
a richer bnf object. No separate phase timings were collected here. Do not
compare these numbers directly with the earlier public prepared/fresh frontier
ratios, or claim a production speedup from them.

GP executable SHA-256:
`c87bdfb1fa3192bd1281c9975ff2da0783f8e6f747a8304e550bf0288fb81e1d`.
Node executable SHA-256:
`19235a9b678f84729464c52623f92de130a165452747c6826d3fdc13df3abcc3`.

## Frozen corpus diagnostic

On the existing 1,012-field corpus (1,000 frontier fields and 12 smoke fields),
both versions at fixed effort five accept 948 and decline 64, with zero
exceptions, zero coverage changes, and exact agreement with the stored class
numbers and invariants. This is a direct-kernel survey, not the adaptive public
API, independent replay, or an unseen-neighbor qualification.

| Final analytic cutoff | Baseline | Candidate |
| --- | ---: | ---: |
| 0 (no analytic cutoff recorded) | 189 | 189 |
| 997 | 759 | 0 |
| 768 | 0 | 483 |
| 1494 | 0 | 276 |

Thus 276 fields acquire an extra refinement pass. Their performance was not
measured in this survey. A uniform default reduction is not justified by the
target gain. The next useful experiment is a mathematically guarded adaptive
work schedule, not disabling certification or assuming that 768 works uniformly.

## Reproduction and retained evidence

From the recorded source revision, build outside the repository:

```sh
node bench/class-unit-groups/diagnose-cubic-cutoff-build.cjs "$PWD" /scratch/sagejs-runtime/cubic-cutoff-experiment-20260908
```

The build records source hashes and content-addressed native identities in
`builds.json`. On a compatible Linux x64 host, copy that directory and run:

```sh
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 MKL_NUM_THREADS=1 taskset -c 0 node bench/class-unit-groups/diagnose-cubic-cutoff-timing.cjs /path/to/experiment /path/to/gp
```

The runner emits raw samples and detached outputs as JSON. Local evidence is
retained under `build/cubic-next-evidence/` (ignored, not bulk Git data):

- `cutoff768-opt-timing.json`: SHA-256
  `96d7063b1dce7f59dedad818d8ec13a54c7408af34add3e3cce31fda14d1903b`.
- `cutoff768-fixed-effort-survey.json`: SHA-256
  `12560a629f62c48adab3b0cdd19e6e5f35c615cd5f0584247a8ab348239cf69e`.
- `cutoff768-local-pilot.json`: SHA-256
  `4f6f8331d10de937133bf84e8d0b5cc8ac4468e91e384ca43e14f7aa070351b0`.

The corpus diagnostic can be reproduced with
`diagnose-cubic-cutoff-survey.cjs BASELINE_INDEX_CJS CANDIDATE_INDEX_CJS CORPUS_GZIP`.
It checks the frozen corpus logical digest before executing any field.

The local five-field pilot is uncontrolled timing, separate from the opt
result. All five familiar fields accept at 768. The 20 registered unseen
neighbors remain unexecuted by this experiment.
