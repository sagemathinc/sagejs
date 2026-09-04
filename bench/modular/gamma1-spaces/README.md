# Full $\Gamma_1(N)$ benchmark

This benchmark constructs the complete rational $q$-expansion basis through
the Sturm bound and then computes the first cuspidal $T_2$ matrix.  Sage.js,
SageLite, and Magma must agree on ambient and cusp dimensions and on the Hecke
trace before timings are reported.

```bash
node bench/modular/gamma1-spaces/benchmark.cjs
GAMMA1_CASES=53:2,73:2 node bench/modular/gamma1-spaces/benchmark.cjs --json
```

See `receipt-2026-09-04.md` for the pinned host, exact invariants, timings,
and the component profile that explains larger-level scaling.

Magma's modular-form parent currently rejects a full multi-character Hecke
operator, so its Hecke phase uses the sign-$+1$ cuspidal modular-symbol space.
Magma does not expose the corresponding full-space diamond operation in this
interface; that receipt field is `null`.
