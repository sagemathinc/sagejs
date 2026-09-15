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

Full prepared cubic replay is pending. No speedup is claimed from these
focused correctness tests.
