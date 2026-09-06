# Full $\Gamma_1(N)$ benchmark

This benchmark constructs the complete rational $q$-expansion basis through
the Sturm bound and then computes the first cuspidal $T_2$ matrix.  Sage.js,
SageLite, and Magma must agree on ambient and cusp dimensions and on the Hecke
trace before timings are reported.

```bash
node bench/modular/gamma1-spaces/benchmark.cjs
GAMMA1_CASES=53:2,73:2 node bench/modular/gamma1-spaces/benchmark.cjs --json
```

See `receipt-2026-09-04.md` for the cross-system timings and
`receipt-2026-09-05-row-basis.md` for the bounded $N=101$ memory-cliff
qualification.

Magma's modular-form parent currently rejects a full multi-character Hecke
operator, so its Hecke phase uses the sign-$+1$ cuspidal modular-symbol space.
Magma does not expose the corresponding full-space diamond operation in this
interface; that receipt field is `null`.
