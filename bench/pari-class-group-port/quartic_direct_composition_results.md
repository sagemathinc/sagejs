# Quartic signed-genback direct composition

This lane closes the runtime fixture boundary between the authentic quartic
signed-`genback` leaf and mixed-signature `nf_cxlog`/class assembly for

```text
x^4 - 200000002*x - 200000002.
```

The ordinary-Python public root receives only prepared-field data, the
relation HNF/log matrix, the first three factor-base prime ideals, the integral
basis multiplication table, and rounded T2. It then:

1. computes Smith data and obtains the authentic columns `(1,0,0)` and
   `(-2,-1,-1)`;
2. runs seven exact rounded-T2/LLL reductions;
3. computes the two reduced generator ideals and seven ordered compact factors;
4. computes their `(2,1)` logarithms; and
5. assembles class invariants `[24,8]`, `Ga`, `GD`, and `ga`.

Neither PARI generator ideals nor PARI compact factors are accepted by the
root. PARI 2.17.4 is used only by the checker as an independent oracle.

## Differential result

The checker agrees exactly across pristine PARI 2.17.4, CPython, JavaScript,
GMP, and tagged native execution for:

- both 4-by-4 generator ideals;
- factor offsets `[0,0,7]` and all seven kinds, coordinate/denominator records,
  and exponents;
- class invariants `[24,8]` and class number `192`;
- every packed real/complex word of `Ga`, `GD`, and `ga`.

The generated native core SHA-256 from the recorded run was
`0c2db0a38075f49ba7ec1a3fd4679511d06d5b14c84115d3f80efa625b2a56e6`.

## Ownership and failure behavior

All exact and real workspaces remain explicit caller-owned buffers. The public
generator/factor/class/log buffers are publication owners: the root writes
them only after signed reduction and logarithmic assembly both succeed. A
corrupted first prime ideal is rejected on CPython, JavaScript, GMP, and tagged
execution, while every publication owner retains its sentinel contents.

This is correctness evidence, not a qualified timing result. It deliberately
does not alter the shared final-result schema or durable replay runner.

## Reproduction

```bash
node bench/pari-class-group-port/check_quartic_direct_composition.cjs \
  /scratch/sagejs-runtime/pari-class-group-e2e-20260916/toolchains/src/pari-2.17.4-phase0 \
  /home/user/upstream/pari-2.17.4.tar.gz
```
