# Authentic cubic precision rebuild

## Closed source cut

This lane closes the `Sunits_archclean` half of PARI 2.17.4
`bnfnewprec_shallow` for the authentic real cubic

```text
x^3 - 20018*x + 20034.
```

The ordinary Python root
`pari_cubic_sunit_precision_rebuild` consumes only:

- the refreshed prepared number-field embedding;
- the 73 exact atomic generators `X` retained by the resident BNF;
- the exact column-major `73 x 2` transform `U`; and
- caller-owned scratch and output storage.

It follows the pristine source order:

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

and the complete pristine diagnostic trace has SHA-256

```text
97f4b52b4aec474c965a84d63ca14130238e4e9ca10b324ea3f7a0999edc216b.
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

## Exact remaining frontier

The p2,240 embedding is still supplied by the pristine differential oracle;
it is the sole high-precision floating input to this source cut. Thus this is
not yet a complete no-oracle `bnfnewprec` implementation.

The first unclosed call is `base1.c:nfnewprec_shallow -> make_M_G`. For this
field that path computes an extraprecision allowance, calls
`get_roots(T, r1, prec)`, and evaluates the exact integral basis

```text
[1, x, x^2 + 2*x - 13345]
```

at the ordered roots. Existing translated arithmetic has the needed 2,496-bit
scalar capacity, but Sage.js has no source-corresponding p2,240 polynomial-root
producer: the current `real_root.py` computes numeric nth roots and stops at
384 bits; it is not PARI's ordered polynomial-root refinement.

The next narrow lane should retain the three ordered 192-bit roots only as
seeds, refine them transactionally against the exact cubic and disjoint root
intervals, and then translate `make_M`. Until that root-ordering and rounding
cut agrees exactly with pristine `get_roots`, replacing the injected embedding
would hide rather than close the remaining precision dependency.
