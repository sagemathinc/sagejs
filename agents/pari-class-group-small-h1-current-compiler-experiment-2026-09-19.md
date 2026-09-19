# Small H1 current-compiler experiment (2026-09-19)

## Question

What happens on the frozen, much smaller real cubic

```text
x^3 - 20018*x + 20034
```

where PARI completes the prepared-field computation in roughly ten
milliseconds?

This experiment uses the existing sanitized prepared owner graph, seed 1,
PARI 2.17.4, and the current compiler after the row-6 campaign. Compilation,
module loading, input construction, and output validation are outside each
native sample.

## Important qualification

The current H1 root does **not** complete the unit-reconstruction suffix. It
does complete relation collection, HNF, the live owner bridge, and the class
witness, proving the frozen field has class number 1. It then makes six unit
precision attempts through 3,456 bits and stops because the next retry exceeds
the reviewed 4,096-bit resource cap.

Consequently the most useful comparison below is deliberately asymmetric:

- Sage.js: authenticated class-group prefix, stopping immediately after the
  class witness;
- PARI: the complete prepared `bnfinit0(nf, 0)` computation, including units.

The ratio is therefore a lower bound on the present complete Sage.js gap, not
an end-to-end competitive claim.

## Results

All times are wall-clock nanoseconds from seven warm native calls in one
process. The median is the fourth sorted sample.

| implementation / boundary | samples (ms, ascending) | median |
|---|---|---:|
| Sage.js authenticated class prefix | 1,614.632; 1,614.784; 1,620.359; 1,634.500; 1,634.518; 1,642.940; 1,703.552 | 1,634.500 ms |
| PARI complete prepared field | 10.582; 10.671; 10.697; 10.699; 11.226; 11.406; 14.320 | 10.699 ms |

The prefix-only ratio is **152.778x PARI**.

For context, allowing the Sage.js root to enter its ultimately unsuccessful
unit retry loop gives samples of 2,676.951, 2,677.354, 2,688.312, 2,689.312,
2,691.570, 2,706.153, and 2,759.687 ms, with a median of **2,689.312 ms**.
That number is not a class-group timing because the call returns status 4
without publishing a complete answer.

The class-prefix terminal evidence is stable across all samples:

```text
HNF state:    [0, 7, 66, 0, 7, 8, 0, 73, 0]
bridge state: [0, 0, 0, 0, 0, 7, 1, 0, 73, 8, 48, 48, 2, 7, 7, 0]
```

The ordinary full attempt terminates with:

```text
final status: 4
precision authority: [1, 6, 3456, 3, 3, 73, 15, 7, 2, 7, 2, 0, 0, 0, 0, 4096]
```

## Artifact

The experiment uses a GMP-only graph, since the adapter invokes only `.gmp`.
The retained artifact has cache key
`49621f8877a5783a3e849743dbe9ed3c88abbe8cd86a6a00bca3c570c622337d`:

- generated `kernel_core.c`: approximately 30 MB;
- native addon: approximately 2.8 MB;
- JavaScript loader: approximately 6.6 MB.

This is substantially smaller than the old duplicated tagged/GMP H1 graph,
but code-size reduction alone does not make the tiny computation competitive.

## What this establishes

1. The row-6 result is real but is not yet a general small-field result.
   Row 6 amortizes specialized bounded arithmetic over large relation and HNF
   work. H1 remains on general paths whose fixed and exact-arithmetic costs
   dominate a ten-millisecond PARI computation.
2. The small-field problem is not merely startup or compilation. The measured
   1.63 seconds is inside the warm native root.
3. Unit reconstruction is independently unfinished for the current H1 path.
   It adds about another second before failing its precision corridor, but
   removing it would still leave a roughly 153x class-prefix gap.
4. The next useful campaign should profile and specialize this prefix rather
   than raising the unit precision cap. A higher cap cannot repair the already
   dominant 1.63-second relation/HNF/class cost.
5. A competitive implementation will need at least two execution regimes:
   small fields need low fixed overhead and compact direct algorithms, while
   row-6-scale fields benefit from the current bounded-storage graph
   specialization.

## Compiler and boundary issues exposed

Recompiling H1 against the current graph also exposed stale seams hidden by old
artifacts:

- exact public dimensions had to be authenticated once before entering the
  private `int64` HNF ABI;
- the word and tagged emitters lacked the already-defined
  `IntegerBuffer -> int64` checked-load IR operation;
- the H1 adapter was still generating an unreachable tagged copy of the exact
  graph;
- `cleanarch` rejected exact zero even though zero is the common logarithm
  representation's valid additive identity.

These are useful compiler cleanups, but none changes the central performance
conclusion above.
