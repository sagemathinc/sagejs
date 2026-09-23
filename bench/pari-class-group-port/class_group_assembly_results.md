# Authentic cubic `class_group_gen` assembly leaf

This checkpoint connects the existing PARI 2.17.4 Smith-transform and
totally-real cubic `nf_cxlog` ports through the exact post-`genback` schedule in
`class_group_gen`. The ordinary Python source constructs:

```text
D,U,V,Ui,Ur,Y,Uir,X,M1,M2
Ga = nfV_cxlog(nf, Ge)
GD = act_arch(M1, C) - diagact_arch(cyc, Ga)
ga = act_arch(M2, C) - act_arch(Ur, Ga)
clg2 = [Ur, ga, GD, Ge, M1, M2]
```

`Ge` is retained as immutable packed factor provenance. The five computed
components occupy typed caller-owned buffers. Final `GD` and `ga` buffers are
transactional: they publish only after the Smith transform, every `nf_cxlog`
column, the implicit zero tail of `Ur`, and both archimedean actions succeed.

## Authentic fixture

The pinned pristine PARI 2.17.4 oracle runs `bnfinit(x^3 - 200*x + 7, 1)` and
extracts the actual accepted state:

- `W` has shape 2 by 2;
- the Smith group is `[24]`, hence class number 24;
- one non-unit Smith generator is active;
- `Ge` is the actual `genback` famat
  `[1/8,1; 1/5,1; [-17,1,0]^T,-1; 40,1]`;
- the first two authentic `C` columns, `nf_get_M`, and every expected matrix
  and logarithmic entry are emitted without decimal conversion.

Thus the check exercises positive-rational suppression and a genuine negative
power of a non-scalar basis element. It is not an empty-generator shape test.

## Differential receipt

Command:

```bash
node bench/pari-class-group-port/check_class_group_assembly.cjs \
  /home/user/upstream/pari-2.17.4 \
  /home/user/upstream/pari-2.17.4.tar.gz
```

Result:

```json
{"fixture":"x^3-200*x+7","classNumber":24,"smithDimension":2,"activeGenerators":1,"authenticGeFactors":4,"backends":["PARI","CPython","javascript","gmp","tagged"],"mutationRejections":4,"traceSha256":"271e77a9fee251cce497c25da0a3def0d1af827b86af82b2c1c9819ff86d7575","sourceSha256":"528a8ef4c156e4fed600ff0cb939d0c19efadebe26a5be636fc761a47918348e","coreBytes":13490420}
```

Every integer and every seven-word real/complex cell agrees exactly. The four
negative controls cover a wrong generator count, an invalid HNF, malformed
factored input, and PARI's 64-bit low-precision frontier. None publishes final
`GD` or `ga` data.

## Precise remaining boundary

This leaf begins with authentic but externally supplied `W`, `C`, and `Ge`.
The missing connected input is generic ideal arithmetic:

1. construct `I = genback(z,nf,Vbase,Uir[:,j])` inside Sage.js;
2. publish its reduced ideal `G[j] = I[1]` and factored multiplier
   `Ge[j] = I[2]` in this packed format;
3. independently replay the principal-ideal identity connecting `G`, `Ge`,
   `Vbase`, and `Uir`;
4. connect the accepted collector's complete `W` and cleaned `C` owners rather
   than importing them from the oracle.

Until those inputs exist, this is an exact assembly leaf and a language/runtime
result, not an end-to-end class-group computation. It is also intentionally
limited to totally real cubics and integral non-scalar basis factors. Mixed
signatures require the complex-place `low_prec(gnorm(z))` path, and general
factored multipliers require rational basis-coordinate normalization.
