# Exact-integer input to PARI's binary64 discriminant logarithm

This translates PARI 2.17.4 `rootpol.c:mydbllog2i`'s 64-bit word path and
the natural-log conversion used for Buchall's LOGD. It preserves the upstream
approximation, rather than claiming a newly correctly rounded logarithm.
Only the top two integer words affect the floating computation. Each word
converts as an unsigned 64-bit integer, preserving C's conversion semantics;
the full discriminant is never first converted to binary64.

The 661-case differential check covers signs, word boundaries, signed-word
boundaries, integers beyond binary64's finite range, random multiword values,
and ignored low words. CPython, generated JavaScript, GMP and tagged native
outputs agree exactly with the linked PARI control on this corpus. Zero is
rejected as outside the field-discriminant domain. This is correctness
qualification of a preparation leaf, not a performance result.

Reproduce from the port worktree, under the experiment's resource wrapper:

```sh
node bench/pari-class-group-port/check_discriminant_log.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4 \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4.tar.gz
```

Artifact: `/tmp/sagejs-discriminant-log-sr8531/result.json`.
The checker verifies the checkout source against the pinned archive and
records the actual linked library's identity.

| Item | SHA-256 |
| --- | --- |
| Translated Python | `11e590fbc6ad12a23d2bb1270b8497ac187e162b94c800fffbd1606fea878b9f` |
| Upstream rootpol.c | `e684b99acef20e395105bfadfe7a3140971a557ccea7cba377ec47a4161d6ec4` |
| Control source | `d60ac313b72a2767dc80fc54d9a4bfb54c10f7d715fc54460cd783a0f67363f6` |
| Linked libpari 2.17.4 | `c1a41ed3a65f65762bd9ee718397b439592185c3f1d3f52fb9d19f8bb980064a` |

The connected analytic attempt uses this source function and deliberately
poisons incoming LOGD scratch. It still needs raw analytic prime patterns and
other prepared-field data; this leaf does not remove those dependencies.
