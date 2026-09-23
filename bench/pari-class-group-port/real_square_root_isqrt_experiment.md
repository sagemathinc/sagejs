# Exact integer square-root primitive experiment

Compiler dependency `60e68d4afc59cd44293fef69ca6d27647a71673b` adds imported
`math.isqrt` as a general exact operation, without class-group function-name
dispatch. GMP execution uses `mpz_sqrt`; tagged large values use that primitive,
and small/word paths use exact restoring arithmetic. The generated JavaScript
fallback uses BigInt Newton iteration. Negative inputs preserve Python
`ValueError`, including through compiled callers.

The port replaces only `pari_sqrtrem_integer`'s Newton loop with `isqrt(value)`.
It retains its explicit negative guard and computes `value - root * root` in
ordinary Python. PARI's real rounding wrapper is unchanged. This is not a fused
`mpn_sqrtrem`: an extra square and subtraction remain. A performance difference
would measure this primitive substitution, not Python versus C alone.

The stronger pre-change checker was frozen in `9582e52c3`. After integration,
all 1,120 PARI real-square-root cases, 302 shared CPython exact floor-root and
remainder controls, and four negative controls pass under generated JavaScript,
GMP and tagged execution. Focused replay consumed 1.995 CPU seconds under the
unchanged 4 GiB limit. Compiler qualification separately reports 21 passes and
one unavailable-WASI skip; architecture validation retains the known stale
optimizer-manifest failure. No release/platform qualification is claimed.

## Full prepared cubic replay

One warmup and three fresh-state tagged calls pass on the unchanged prepared
`x^3-20010*x+20018` input and 64-word owner policy. Class number 3, invariants
`[3]`, exact regulator triple, 58 relations and work counts 491/54/12 match
the reference. Times are 105.085, 105.693 and 105.517 ms, with owner resets
separately 29.205, 27.931 and 27.208 ms. Previous unpaired divmod-only samples
were approximately 109 ms. This is a small diagnostic difference, not paired
speedup qualification; the large prepared-path gap remains.

Generated core size is 58,156,711 bytes, SHA-256
`d6130b50b254ed3a971da7f7e888e33f200027502eee3fbfdcbd47f7e1bf5774`.
Raw report: `/tmp/sagejs-prepared-isqrt-20260915.json`. Input SHA-256:
`37abbff3ea5a0fbbd81d4261a737f19808a2b85220c725417d0f315d15c0e10c`.
The metered rebuild/replay consumed 236.213 CPU seconds and peaked at
1,746,728 KiB RSS. Compilation, packing, reset and assertions remain outside
the call timer, not outside resource accounting.

No new quartic or seconds-scale coverage is established by this replay. The
remaining scalar-relation provenance difference is audited separately in
`scalar_relation_provenance_audit.md`; no such correction is included here.
