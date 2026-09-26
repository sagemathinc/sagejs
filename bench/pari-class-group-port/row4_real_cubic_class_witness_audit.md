# Row 4 compact order-two class witness

This cut closes the class-generator witness for real-cubic development-panel
row 4 without repeating the obsolete common-denominator exponentiation that
timed out after 600 seconds.

The authenticated presentation owner has

```text
Cl(K) = Z/2Z
W = [2]
```

and retains a 567-entry exact vector `c` with 397 nonzero entries.  The largest
entry has only 33 bits, but directly expanding
`product(alpha_j ** c_j)` creates a needlessly enormous intermediate.  The new
boundary instead proves and retains the mathematically equivalent compact
witness:

```text
R*c = 2*e_2
(alpha_j) = product_i(P_i ** R[i,j])  for every used j
therefore product_j(alpha_j ** c_j) = P_2 ** 2.
```

Negative entries of `c` are exact signed exponents, so this is an equality of
fractional principal ideals, not a numerical or hash-only check.  All 397 used
principal relations are independently replayed from their algebraic generator
and prime-ideal factors.  This takes 2,671 small exact ideal multiplications.
The selected generator is the first terminal factor, source index 2:

```text
P = [5,2,1; 0,1,0; 0,0,1]
P^2 = [25,17,6; 0,1,0; 0,0,1].
```

The presentation `[2]` proves that this factor is nontrivial and has exact
order two; the only proper divisor, one, is rejected.  The immutable witness
is:

```text
/tmp/row4-class-witness-owner/
  row4-real-cubic-class-witness-dd9f39ffd204329908a5acd0117e61d9431aa814c17b702a4c992172676cde3a.json
SHA-256 dd9f39ffd204329908a5acd0117e61d9431aa814c17b702a4c992172676cde3a
17,828 bytes, mode 0444
```

The source presentation owner has SHA-256
`122f1a9f8731f3c6d7202426c4f1c9b133bff815091aff55dce0166c6c53bcfa`.
Its separately capped reconstruction took 13.827 seconds.  The full witness
checker, including two idempotent publications, seven output mutations, and
three semantic input mutations, took 2.247 seconds wall time with an observed
process-tree peak RSS of 175,456 KiB.  Both commands used `timeout 600` and
`prlimit` caps of 4 GiB AS, 4 GiB RSS, and 600 CPU seconds.

Run the focused checker with:

```bash
node bench/pari-class-group-port/check_row4_real_cubic_class_witness.cjs \
  /tmp/row4-class-witness-input/row4-real-cubic-presentation-122f1a9f8731f3c6d7202426c4f1c9b133bff815091aff55dce0166c6c53bcfa.json \
  122f1a9f8731f3c6d7202426c4f1c9b133bff815091aff55dce0166c6c53bcfa
```

This completes the exact row-4 class witness in compact/factored form.  It
does **not** claim an eagerly expanded algebraic generator, units, full PARI
correspondence, independent certification of the upstream bounds, or a public
complete class-and-unit result.  The owner records those flags honestly.
