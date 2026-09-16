# Frozen vector429 HNF storage-reuse A/B

## Question

Does explicit storage reuse transfer from the splitting-degree experiment to
real exact HNF arithmetic? This benchmark isolates the authentic mixed-quotient
HNF from vector429's p=2 OM computation. Its input is a frozen 128 by 64 exact
integer matrix: 64 scalar-identity rows followed by 64 quotient rows.

Both arms perform the same 32 two-row HNF updates with the same readable Python
elimination algorithm and the same generated native compiler flags:

- **repeated boundary:** call `_packed_row_hnf_once` 32 times, publishing the
  64-row HNF and constructing source, output, and workspace buffers at each
  boundary;
- **fused reuse:** call `packed_incremental_row_hnf_in_place` once and retain
  its 66-row output plus two-row workspace through all 32 updates.

The candidate changes storage lifetime and boundary placement, not the HNF
algorithm.

## Exactness

The matrix is frozen in
`vector429_p2_mixed_quotient_matrix.json`. Its canonical decimal serialization
has SHA-256
`3bd0c8960ebe4c48b4eba7f1339b0b8c15d725770380fd98791bfa780ab49d6c`.

The benchmark checked exact equality after every one of the 32 two-row
prefixes. It also authenticated the final lower row-HNF against the independent
frozen PARI vector429 lattice, rather than merely comparing the two Sage.js
arms. The final basis:

1. has determinant `2^(11*64 - 332) = 2^372`, the covolume implied by the
   p=2 denominator and certified local index valuation;
2. contains all 64 PARI numerator rows reduced modulo `2^11`;
3. contains all 64 rows of `2^11 I`.

Containment and equal full-rank covolume prove equality of the lattices. The
authenticated final HNF serialization has SHA-256
`76045901ddfe9ba76d70cbe2aecac28121417a54b2163e5d2aacae57f248b994`.

## Materialization accounting

These are exact logical counts from the two ordinary Python wrappers. Reserved
bytes sum the requested per-entry capacity across calls; they are neither peak
RSS nor direct `malloc` telemetry.

| Metric | repeated boundary | fused reuse | reduction |
| --- | ---: | ---: | ---: |
| native calls | 32 | 1 | 32x |
| `IntegerBuffer` constructions | 96 | 3 | 32x |
| source entries packed | 135,168 | 8,192 | 16.5x |
| output entries materialized | 135,168 | 4,224 | 32x |
| HNF entries published to Python | 131,072 | 4,096 | 32x |
| cumulative output/workspace capacity | 571,539,456 bytes | 17,860,608 bytes | 32x |

The arithmetic still uses exact arbitrary-size integers. No bounded scalar
substitution or weakened overflow rule is involved.

## Pinned alternating timing

The release native pack was built from
`e48766134a040087074c0fd5d8ada0eb31d5aa92` with its normal `-O3` production
flags. Measurements ran on an AMD EPYC 7B13 under Linux, Node 26.8.1, pinned by
`taskset` to CPU 0. One warmup per arm preceded seven alternating AB/BA pairs.
Complete result construction was timed; exact comparisons were outside the
timed interval.

| arm | mean | median | range | sample SD |
| --- | ---: | ---: | ---: | ---: |
| repeated boundary | 3.4153 s | 3.3697 s | 3.3248–3.5437 s | 0.0912 s |
| fused reuse | 0.5210 s | 0.5086 s | 0.4903–0.5723 s | 0.0296 s |

The fused candidate is **0.15256x the baseline time**, a **6.555x speedup**.
Raw nanosecond pairs, in AB/BA/AB/BA/AB/BA/AB order, were:

```text
baseline:  [3369740032, 3429415936, 3543727872, 3324837632,
            3362911488, 3536120064, 3340154368]
candidate: [ 572315648,  508621312,  490306048,  552215808,
             513581568,  505153024,  504967424]
```

## Conclusion

Storage reuse transfers strongly to this real HNF workload. The 6.6x gain is
not a faster mathematical algorithm: it comes from retaining exact storage and
keeping the 32-stage private call graph inside one authenticated native
boundary. This is qualitatively different from reusing only the destination of
one FLINT HNF call, which cannot remove FLINT's private scratch allocations.

The result supports extending the compiler's authenticated private-graph model
to larger exact workflows: validate shape and ownership once, keep buffers
resident across stages, and publish only the final exact object. It does not
imply that every HNF workflow has this ratio; this matrix is deliberately the
real vector429 case that previously paid 32 publication boundaries.

## Reproduce

After `pnpm build && pnpm native:prepare`:

```sh
bench/pari-class-group-port/run_hnf_fused_reuse_benchmark.sh --verify-only
bench/pari-class-group-port/run_hnf_fused_reuse_benchmark.sh --pairs=7
```
