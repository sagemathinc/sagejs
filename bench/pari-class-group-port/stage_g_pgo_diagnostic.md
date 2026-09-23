# Stage G PGO diagnostic

## Result

Profile-guided optimization makes the unchanged Stage G source consistently
faster and materially smaller on this frozen workload:

```text
Stage G baseline pooled geometric mean   2.157860873 ms/catalog
Stage G PGO pooled geometric mean        2.115734553 ms/catalog
PGO / baseline                           0.980477740
```

All 14 alternating pairs across two fresh processes favor PGO. Object text
falls by 14.32% and linked ELF `.text` by 9.26%.

This is a **diagnostic, nonportable profile result**, not an adopted build
mode. The profile is tied to one compiler, filesystem identity, binary shape,
and a narrow four-packet training corpus. It also labels exported kernels that
the catalog does not exercise as cold. Its value is to reveal optimization
facts that a generic compiler policy may be able to express safely.

Exact samples and the section/symbol census are in
[`stage_g_pgo_diagnostic.json`](./stage_g_pgo_diagnostic.json).

## Identical source and training protocol

The baseline artifact is `/tmp/sagejs-stage-a-catalog-XFCs0p`; the PGO artifact
is `/tmp/sagejs-stage-g-pgo-bi56XJ`. Both contain exactly the same generated
`kernel_core.c`, with SHA-256:

```text
1db8d76a096ff7076f1811f0beb0ccdf4064685e280f6a35cb09cd7026213252
```

The baseline uses the normal `-O3 -fPIC -Wall -Wextra
-ffunction-sections -fdata-sections` flags. The candidate was first built with
profile generation, trained for 500 rounds over all four frozen packets—2,000
catalog calls in total—and rebuilt with:

```text
-fprofile-generate=/tmp/sagejs-stage-g-pgo-profile
-fprofile-use=/tmp/sagejs-stage-g-pgo-profile
-fprofile-correction
```

The resulting 47,604-byte `kernel.gcda` has SHA-256
`9acba00b6233b39379d4460382cee52e4d8f5d24d1e6621b193bb57914d8f592`.
The diagnostic used GCC 15.2.0.

Exact output replay for all four frozen packets passed through
`/tmp/measure-stage-h-split.cjs`. No mathematical or generated source changed.

## Timing

Two fresh processes each ran seven alternating baseline/PGO pairs:

| process | baseline GM (ms) | PGO GM (ms) | PGO/baseline |
|---|---:|---:|---:|
| 1 | 2.167714898 | 2.119912345 | 0.977947952 |
| 2 | 2.148051644 | 2.111564995 | 0.983014073 |
| pooled | 2.157860873 | 2.115734553 | 0.980477740 |

Every individual ratio is below one. They range from `0.975938875` to
`0.988905445`, so the 1.952% pooled improvement is not driven by one favorable
pair or process.

## Binary and section shape

| measure | baseline | PGO | delta |
|---|---:|---:|---:|
| object `.text*` bytes | 199,489 | 170,919 | -28,570 (-14.32%) |
| linked ELF `.text` bytes | 322,704 | 292,816 | -29,888 (-9.26%) |
| object file bytes | 347,176 | 359,192 | +12,016 |
| linked addon bytes | 354,880 | 326,208 | -28,672 |
| hot-text bytes | 35,437 | 42,266 | +6,829 |
| unlikely-text bytes | 1,953 | 119,858 | +117,905 |
| other text bytes | 162,099 | 8,795 | -153,304 |
| unlikely-text sections | 1 | 192 | +191 |

The larger relocatable object is not a contradiction: PGO emits many more
named sections and associated metadata, while the linked executable discards
that overhead and retains substantially less machine text.

The baseline places 81.26% of object text in ordinary text sections, 17.76% in
hot sections, and 0.98% in unlikely text. PGO changes those shares to 5.15%,
24.73%, and 70.13%, respectively. This is extensive hot/cold partitioning, not
a small instruction substitution.

PGO also creates 21 named `.cold` symbol fragments totaling 24,080 bytes. The
largest are:

| cold fragment | bytes |
|---|---:|
| checked `int64_pari_flxq_powu` | 6,017 |
| checked `int64_pari_flx_small_degfact` | 3,123 |
| tagged catalog entry | 3,065 |
| checked `int64_pari_flxq_powers` | 2,246 |
| checked `int64_pari_flx_mul` | 2,225 |
| checked `int64_pari_flx_gcd` | 1,937 |
| checked `int64_pari_flxq_sqr` | 1,702 |
| checked `_int64_pari_flx_divrem` | 1,109 |

The object SHA-256 changes from
`016ce9fce6fa46fc140da4b145932d61b13695d38617d92ff9f1b153a9a8f73e` to
`1e6dfeb2d6d2e2f00a96b186a3e97661250000d9b06cb3665ac46fb33c9992fc`;
the linked addon changes from
`ccb5adfd23d2652b401b23608a48a0c86dc79fa7c8bd8fedfb5fd8c806bf6bbf` to
`3532e33fe58821476e4b1742e0b34d5b21c33a3f29a616cb4d4dbbef761fc552`.

## Interpretation

The profile gives GCC three related advantages:

1. It lays out the actually executed catalog path densely and moves failure,
   fallback, and infrequent branches into cold fragments.
2. It makes profile-specific inlining and cloning decisions inside the checked
   graph, reducing the total instruction footprint even though hot text grows.
3. It optimizes uncalled exported kernels for size and places many of them
   wholly in unlikely sections.

The third effect is not a generic truth about those exports. They are cold only
relative to this training program; another consumer may call them directly.
Consequently the full 14.32% object-text reduction and 1.95% speedup cannot be
claimed as a workload-independent compiler improvement. The experiment does,
however, strongly suggest that separating semantically exceptional paths from
normal checked-region execution can improve instruction locality.

## Portable follow-up

Generic compiler facts can approximate the safe part of this result, but not
the entire profile:

- Mark status failures, raises, overflow failures, bounds failures, failed
  checked-region dispatch, and authenticated guarded-direct fallbacks as
  unlikely edges. These are semantic control-flow categories, not function-name
  or benchmark-specific guesses.
- Outline sufficiently large failure continuations into cold helpers so the
  successful path remains contiguous. Keep exact exception and mutation
  behavior in the outlined path.
- Feed branch likelihood through a small backend abstraction with correct
  GCC/Clang hints and a no-op MSVC fallback. Native Windows x64 must remain a
  first-class supported path.
- Do not mark whole exported mathematical kernels cold merely because this
  catalog profile did not call them. Whole-function temperature needs a real
  closed-world entry contract or separate per-entry compilation.
- Re-run the same source-identical A/B protocol after each generic fact. Require
  semantic replay, section/symbol inspection, and fresh-process timing; a size
  reduction alone is not evidence that hot-path layout improved.

The best first experiment is likelihood plus cold outlining for failure exits
inside checked private functions. It directly targets the large `.cold`
fragments observed here while avoiding nonportable `.gcda` inputs and false
claims about unrelated public entry points. PGO itself should remain a local
diagnostic tool, not the default build or an adopted Stage G result.
