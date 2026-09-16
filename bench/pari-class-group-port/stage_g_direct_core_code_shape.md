# Stage-G direct-core code-shape matrix

Date: 2026-09-16

## Conclusion

The corrected Stage-G emitter already gives GCC the best machine shape found in
this bounded experiment. Its ordinary hot-inline source becomes one 57-byte
outlined, constant-propagated and scalar-replaced direct core with two call
relocations. Relative to Stage E, Stage G has 10 fewer bytes of object text, 40
fewer bytes of linked ELF text, and one fewer object call instruction.

Explicit `noinline` produces the same machine census. Replacing all three
proved-safe checked loop latches with raw signed additions also produces the
same machine census. Forcing `always_inline` removes the two direct-core
relocations, but grows object text by 59 bytes and linked text by 160 bytes
relative to current Stage G. It therefore fails the frozen machine gate.

No tested source shape improves on current Stage G. The generic emission policy
is to retain the hot-inline direct core and allow GCC to outline and specialize
it. There is no evidence for an explicit attribute or unsafe raw-latch language
feature here.

## Corrected frozen identities

- Compiler: `c085e4b2a1bdb9cf4fd416fe1669de800328ebe7`.
- Fixture SHA-256:
  `f61f6aed8d229a2fc10a6336559e97a23d58758151481fb1dfc09fb84a906312`.
- Stage-E generated-core SHA-256:
  `04923fbaef0dd5f2b67aedbd3d016ef2c54e26d0ebaab65032224955f1804853`.
- Stage-G generated-core SHA-256:
  `1db8d76a096ff7076f1811f0beb0ccdf4064685e280f6a35cb09cd7026213252`.

The corrected compiler preserves Stage-E fixed-view virtualization throughout
the private graph: the static counts of materialized UInt64 descriptor locals,
data assignments, length assignments, and offset adjustments are all zero.
An earlier `35a1acbfd` artifact that rematerialized views in unrelated multiply
and divide/remainder helpers is invalid evidence and is intentionally excluded
from this matrix.

## Direct-result boundary

Stage G rewrites exactly three proved private copy edges in
`int64_pari_flxq_powu` to a scalar direct-result core. Public and unproved calls
retain the ordinary checked function. The direct source signature is:

```c
int64_t direct_copy(UInt64Buffer w, int64_t a, int64_t da, int64_t out)
```

It has no status pointer, output pointer, failure label, status mutation, view
validation, or element bounds failure. It returns `da` directly. Its source
still uses the three checked `int64` loop latches emitted for ordinary Python
range semantics.

At `-O3`, GCC specializes the direct body for the proved call contexts and
emits:

```text
sagejs_direct_..._flx_copy__local_fast_0.constprop.0.isra.0
size: 57 bytes
object relocations to core: 2
```

The three source call sites become two surviving direct-core relocations after
IPA. At the same time, checked-private copy relocations fall from 23 to 21, so
the total object relocation count for every `flx_copy` implementation remains
113.

## Bounded matrix

Every candidate is a disposable mechanical transformation of the corrected
Stage-G generated C. The Python, IR, proofs, call-edge selection, algorithms,
inputs, ordinary fallback, public API, and generated `-O3` flags are held
constant.

| Shape | Direct symbol | Direct relocs | All copy relocs | Object calls | Object text | ELF text | Machine-gate result |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Stage E | absent | 0 | 113 | 1,771 | 212,853 B | 347,495 B | control |
| Current G, hot-inline source | 57 B | 2 | 113 | **1,770** | **212,843 B** | **347,455 B** | pass |
| Explicit `noinline` core | 57 B | 2 | 113 | 1,770 | 212,843 B | 347,455 B | equal to current |
| Explicit `always_inline` core | absent | 0 | 111 | 1,770 | 212,902 B | 347,615 B | reject: text growth |
| Raw proved latches | 57 B | 2 | 113 | 1,770 | 212,843 B | 347,455 B | equal to current |
| `noinline` plus raw latches | 57 B | 2 | 113 | 1,770 | 212,843 B | 347,455 B | equal to current |

The raw-latch variants replace only these three operations inside the proved
direct body:

```c
if (!sagejs_word_add_int64(index, step, &index))
    break;
```

with `index += step`. They are diagnostics under the existing interval proof,
not safe general C lowering. Their identical output proves that GCC already
eliminates the checked-latch abstraction in the specialized direct core.

Likewise, explicit `noinline` is unnecessary: GCC already chooses effective
outlining from the hot-inline source. `always_inline` removes two call edges
but duplicates enough body and surrounding specialization to lose the code-size
gate without reducing the total object call count.

## Exact semantic replay

All four candidates match Stage E on:

- four frozen packets through JavaScript, GMP, and tagged backends: 12
  comparisons;
- all 7,081 active tagged outputs and every post-call buffer;
- nine malformed packets through all three backends: 27 comparisons;
- 15 public-copy cases through all three backends: 45 comparisons.

The public-copy panel includes degrees outside and inside the direct clone's
proved range, invalid source and output offsets, left and right overlap, exact
overlap, and disjoint copy. This confirms that the experiment does not make the
unchecked direct core reachable from the public interface.

## Timing disposition

The corrected current Stage G was measured independently over two seven-pair
acceptance runs. Every one of the 14 pairs favored Stage G:

```text
pooled Stage E geometric mean: 2.175907735 ms
pooled Stage G geometric mean: 2.155084161 ms
G / E:                         0.990429937
```

This is a real 0.957% improvement, but it misses the frozen acceptance bound
`G / E <= 0.990` by `0.000429937`, or about 0.043 percentage points.

No matrix candidate received additional timing. The no-inline and raw-latch
forms are machine-equivalent to current Stage G, while the always-inline form
fails the preceding code-size gate. Running a timing campaign cannot turn any
of these shapes into a stronger admissible candidate.

## Implication

The remaining acceptance miss is not attributable to:

- failure to force the direct core out of line;
- failure to force the direct core inline;
- the three checked range-latch additions; or
- extra static copy call relocations.

Stage G has successfully established the intended private direct-result ABI
and a compact specialized implementation. Any further campaign should expand
proved direct-result edges or address a different demonstrated cost. It should
not add attributes or raw arithmetic merely to perturb GCC's already favorable
choice.

## Disposable reproduction notes

The built artifacts were:

```text
Stage E                  /tmp/sagejs-stage-a-catalog-syWGCM
Stage G current          /tmp/sagejs-stage-a-catalog-hF0oNK
explicit noinline        /tmp/sagejs-stage-g-shape-noinline-qeKghG
explicit always_inline   /tmp/sagejs-stage-g-shape-always-inline-R6tIBD
raw latches              /tmp/sagejs-stage-g-shape-raw-latch-w56ZbQ
noinline + raw latches   /tmp/sagejs-stage-g-shape-noinline-raw-latch-kzZdDJ
```

These paths are disposable. The transformed generated-core hashes, in matrix
order after current Stage G, are:

```text
40b92651c1c24b8f5a0eb0b331b22712163d3a8f508e38b34a82a8ab1911fd6e
a51e998388a3edb1e9956d73faf96b8f2f395b8be57cc286a5c6ea8e6b742f2a
7433e6379683c2db2b0c0c1370dfd0eb9bb0dcc4433fccb25b92240642a1b652
2fecad3f47be7fe6a7402900428fe18cc41994a952fd5c5cc87624f7c0cba107
```

Semantic replay used:

```bash
node bench/pari-class-group-port/benchmark_virtualized_fixed_views.cjs \
  /tmp/sagejs-int64-prime-degree-catalog-fcTr9K/fixtures.json \
  /tmp/sagejs-stage-a-catalog-syWGCM \
  CANDIDATE_DIRECTORY \
  --validate-only
```
