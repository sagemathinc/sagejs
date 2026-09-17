# Authentic cubic precision rebuild

## Closed source cut

This lane closes the `Sunits_archclean` half of PARI 2.17.4
`bnfnewprec_shallow` for the authentic real cubic

```text
x^3 - 20018*x + 20034.
```

The ordinary Python roots `pari_cubic_embedding_precision_rebuild` and
`pari_cubic_sunit_precision_rebuild` consume only:

- the three ordered p320 roots retained by the neutral resident BNF;
- the 73 exact atomic generators `X` retained by the resident BNF;
- the exact column-major `73 x 2` transform `U`; and
- caller-owned scratch and output storage.

The embedding producer first certifies dyadic root brackets against the exact
cubic and rounds the three simple roots to p2,176. This exact isolation is an
arithmetic-leaf substitution for PARI's Uspensky/Newton refinement. It then
follows `make_M`: ordinary Horner for the small root and inverse Horner for the
two roots of magnitude greater than four. The latter detail, and PARI's exact
integer/real addition semantics, reproduce the cancellation-grown p2,240
middle basis value. The log producer then follows the pristine source order:

1. evaluate every exact atom at the three real embeddings;
2. run the real branch of `nf_cxlog` at up to 2,240 input bits;
3. form `RgM_ZM_mul(M, U)` without reassociation; and
4. run totally-real cubic `cleanarch` at 2,176 bits.

No high-precision unit logarithm, phase, expanded unit, or final class-group
answer is an input. The source-transparent logarithm path includes the one
additional 2,368-bit square-root work word required by this field. Failed
atom evaluation or ambiguous phase recovery may change scratch, but neither
the public 42-word log matrix nor the six phase bits.

## Differential result

`check_cubic_precision_rebuild.cjs` rebuilds a neutral resident BNF at 192
requested bits and extracts its exact `X,U` owners. It then asks pristine PARI
2.17.4 for the independent `bnfnewprec(..., 2048)` result. The exact retained
state has SHA-256

```text
73759685621162c87cc202ec97c41f3dd165005f81d6cf6595f27d2cdb50d885
```

and the complete pristine diagnostic trace, now including resident and retry
roots and embeddings, has SHA-256

```text
f3f8054a12e31dded8dbb701d3f41e274bd079cdec2d1fc2a738f4417920be89.
```

CPython, generated JavaScript, native GMP storage, and tagged native storage
all reproduce every one of the six PARI p2,176 real triples and all six phase
bits exactly. The checker also compares all 219 atomic real logarithms and the
six pre-`cleanarch` transformed entries, so agreement is not an accidental
final cancellation. A zero exact atom exercises transactional failure on all
four runtimes.

Run:

```bash
node bench/pari-class-group-port/check_cubic_precision_rebuild.cjs \
  /home/user/upstream/pari-2.17.4 \
  /home/user/upstream/pari-2.17.4.tar.gz
```

## Closed floating-input frontier

The pristine p2,240 embedding is comparison data only. Runtime execution now
starts from the resident ordered roots, exact polynomial, and exact integral
basis

```text
[1, x, x^2 + 2*x - 13345]
```

and reproduces all nine `nf_get_M` entries exactly before rebuilding logs.
The p320 resident values are neutral prepared state, not retry-precision oracle
data. Both producers publish their public matrices only after complete
success. This closes the sole floating-input dependency in the frozen cubic
precision retry; later unit reconstruction remains a separate source cut.
