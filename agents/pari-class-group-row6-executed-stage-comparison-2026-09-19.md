# Executed row-6 GMP-only artifact and PARI 2.17.4 stage comparison

> **Performance update:** the subsequent gap-closure campaign reduced the
> exact end-to-end Sage.js median from 62.904 seconds to 13.148 seconds, or
> 3.383x the frozen pristine PARI control. See
> `agents/pari-class-group-row6-gap-closure-2026-09-19.md`. The stage clock
> below remains the exact attribution for the original qualified artifact and
> is retained as the campaign baseline.

## Result

The reviewed phase-lifetime plan is enabled, and the final pruned GMP-only
artifact executes the complete fixed row-6 prepared-field path in one native
call. It computes class number `4`, invariant factors `[2, 2]`, and the
rank-two unit/regulator state. Six exact replay digests agree with the frozen
oracles:

| retained state | SHA-256 |
| --- | --- |
| relations | `2e3b35e24e74052a74c07ef69ae880ae5851225f87a31b7c97f32ea102d944df` |
| logarithms | `7621bb00dbec3637ca1fd64aa07a82a604a95292e9e04e96fed9ef2a7b5bf03a` |
| class H | `8eceed23fcee317f80fa7ab35446e7729865c88de6e99653edfc54f8c5ed4737` |
| class C | `7e5425fd516a7cf7f4d8c8cb0704ad1a674c07be40cad482d25a0167134727a2` |
| raw-to-unit-kernel map | `80c6f56bbd1b46bd99efa54bd438229571d40295e9c1493c1545f338c12ff0f4` |
| raw-to-presentation map | `bb82abc1ef9212e640c019b3ef9106b332881d89cff88b5ad599029522da7014` |

The field is
`x^3 - 2000000000010*x + 2000000000018`, with discriminant
`3555555555596888888888939555555555028`, signature `(3,0)`, and 192-bit
working precision. PARI independently returns class number `4`, invariants
`[2,2]`, unit rank `2`, torsion order `2`, factor-base size `1130`, and the
same regulator mantissa
`3626834249414306903656792336633990244294399400949119764057`.

## Artifact identity and storage

The final non-diagnostic artifact is cache key
`b8e214f44272686492477dcb8ccbe36847a817261a8ee8e5f6f7a53c5fb7bd5d`:

| artifact | bytes | SHA-256 |
| --- | ---: | --- |
| generated core C | 28,016,043 | `a59e9011f0fb93d6c2354e22ec7b375288cb0ed71c075d31acb4ed51912047cb` |
| manifest | 84,231,118 | `ff624ff3a9fffaba84525d3f7120c6a78dd52770211906e2cf8d1d8fbd4475de` |
| native addon | 2,910,912 | `3145653f3ba58302c8c64de27a462ad4956affae558d1f33c5ac898e11a706cb` |

It ran in 62,904,424,963 ns. The observed process peak was 489,696 KiB RSS
and 4,045,496 KiB virtual size. The low RSS relative to the explicit virtual
arena reflects demand paging; it does not weaken the checked byte ledger.

The storage review corrected the ancestry allocation to the live initial
reverse-HNF shape `151 * 979`. The resulting reviewed values are:

| storage quantity | bytes |
| --- | ---: |
| ancestry arena owners | 40,782,308 |
| complete native arena | 1,907,869,980 |
| projected explicit peak including prepared/external/terminal owners | 2,672,158,124 |
| enforced native-arena ceiling | 3,000,000,000 |
| enforced all-explicit-owner ceiling | 3,975,000,000 |

The plan reuses append scratch across its disjoint checkpoint lifetimes but
retains both compact checkpoint transformations because reverse ancestry needs
both. Arena children cannot escape the native root. All live dimensions cross
the arena ABI through checked `uint64` conversions.

## Exact Sage.js stage clock

The diagnostic build adds the selected stage-marker calls and clock to the
same mathematical graph. It has cache key
`fdca071b72abb73ce544845dc057c1d22b104178b3592f3d626e8916e059d8eb`,
28,030,777 bytes of core C, and addon SHA-256
`37fc87d61c0c2a228a39a00150b933992da07a0ce3505013261a7fe7d14d883b`.
It returned the same exact outputs and replay hashes. Its stage totals sum
exactly to the 62,879,388,485 ns inclusive root:

| Sage.js source boundary | exact ns | ms | root share |
| --- | ---: | ---: | ---: |
| preparation, factor base, initial relations | 935,749,063 | 935.749 | 1.488% |
| relation collection | 10,849,630,816 | 10,849.631 | 17.255% |
| initial HNF | 31,826,222,104 | 31,826.222 | 50.615% |
| relation/HNF continuations | 231,890,499 | 231.890 | 0.369% |
| reverse ancestry | 17,135,349,750 | 17,135.350 | 27.251% |
| terminal class and units | 1,900,539,102 | 1,900.539 | 3.023% |
| final publication | 7,151 | 0.007 | 0.000011% |

The clock recorded eight ordered visits (the preparation stage has two
segments), no clock failure, and no kernel failure. Compiler support limits
marker recognition to two selected reachable roots; markers in the rest of the
large private graph compile as no-ops, preventing instrumentation of unrelated
helpers from corrupting this stage vocabulary.

## Exact PARI 2.17.4 stage clock

The matched reference is the pinned PARI 2.17.4 archive with SHA-256
`02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53`.
The instrumented derivative build ID is `90e6274ac7fece73`; its executable has
SHA-256
`6f044374a1a2193b30b3edf2b89c6247fb7b9c540311dda5f0f0630838275483`.
One thread, the identical prepared-`nfinit` boundary, seed `1`, and 192-bit
precision were used. Its source-local totals sum exactly to its
3,900,728,954 ns inclusive stage root:

| PARI `buch2.c` boundary | exact ns | ms | root share | visits |
| --- | ---: | ---: | ---: | ---: |
| relation/retry | 1,100,174,464 | 1,100.174 | 28.204% | 14 |
| sparse HNF/SNF/transform | 2,791,358,200 | 2,791.358 | 71.560% | 14 |
| unit/regulator | 2,193,230 | 2.193 | 0.056% | 2 |
| honesty/generators/final | 667,160 | 0.667 | 0.017% | 3 |
| unattributed remainder | 6,335,900 | 6.336 | 0.162% | 3 |

The instrumented wall clock was 3,900,733,214 ns. The same derivative with
the stage clock disabled took 3,624,970,528 ns, and the pristine-library
control took 3,886,499,614 ns. The clocked run is 0.37% slower than the
separately linked pristine control; the larger difference from its immediately
preceding clock-disabled sample demonstrates the noise in isolated runs.

The final Sage.js artifact is 16.126 times the instrumented PARI sample and
16.185 times the pristine PARI control. The diagnostic Sage.js root gives the
corresponding 16.120 and 16.179 ratios. This is a single exact attribution
run, not a distributional performance claim.

### Boundary caveat

The two tables are exact within each implementation, but their source-local
stage boundaries are not isomorphic. In particular, Sage.js exposes reverse
ancestry as a separate stage, while PARI charges transformation work at
different sites inside its sparse-HNF/SNF stage. Likewise the Sage.js terminal
stage includes correspondence authentication and exact projection work that is
not identical to PARI's narrow unit/regulator clock sites. Consequently no
fabricated row-by-row speed ratio is reported. The honest comparable number is
the complete prepared-field root ratio; the tables identify where to optimize
each implementation.

## Conclusion

This goal succeeds: the storage plan is reviewed and enabled, the final 28 MB
GMP-only artifact executes end to end with exact replay, and the matched PARI
stage comparison is conserved and reproducible. It also gives a sharp next
optimization order: initial HNF, reverse ancestry, then relation collection.
Together those three Sage.js stages account for 95.12% of the root time.

This remains an upstream-assumed language/runtime experiment. It does not turn
PARI's heuristic or GRH-dependent choices into proofs, and it is not yet a
public certified `ClassUnitComputation`.
