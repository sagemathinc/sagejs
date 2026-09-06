# $\Gamma_1(101)$ row-basis memory receipt: 2026-09-05

## Contract

This receipt qualifies the case that exposed the higher-degree cyclotomic
row-space memory cliff.  A fresh Sage.js process constructs the complete exact
$q$-expansion basis of $M_2(\Gamma_1(101))$ through the full Sturm bound under
a $10$ GiB virtual-memory ceiling.  Process-session RSS is sampled every 30
seconds.

The command was:

```bash
ulimit -v 10485760
node bench/modular/gamma1-spaces/sagejs.cjs 101 2
```

The host was Linux x86-64 on an AMD EPYC 7B13.  The runtime was Node 26.8.1.
The exact source revision is recorded by the pull request containing this
receipt.

## Result

Sage.js constructed all $475$ basis elements through Sturm precision $1702$
in $1160.343$ seconds.  Sampled process-session RSS peaked at $2,783,616$ KiB
during basis construction, or $2.66$ GiB.  This is a successful completion of
the case that previously exceeded $13.6$ GiB while publishing the answer and
could exceed $30$ GiB while reconstructing a row space as a double kernel.

The implementation now has three bounded stages:

1. Higher-degree cyclotomic coefficient matrices use direct certified
   multimodular RREF instead of $\ker(\ker(A))$.
2. Selected Hecke images are restricted to the cuspidal coordinates in blocks
   of $16$, so wide ambient matrices do not accumulate across all requested
   coefficients.
3. Each row of the final generated $\QQ$ matrix is serialized once and imported
   directly into its FLINT polynomial.  No intermediate Python list of
   $475\cdot1702$ rational coefficients is created.

The driver then attempted the fresh cuspidal $T_2$.  RSS briefly reached
$3,264,748$ KiB and settled at $2,909,624$ KiB, but OpenBLAS aborted after it
could not reserve memory under the artificial virtual-memory ceiling.  The
basis result above had already completed and printed.  This receipt therefore
qualifies the resolved basis memory cliff, while treating large first-Hecke
scaling as a distinct follow-up rather than claiming it passed this bounded
run.

Focused exact tests separately compare selected cyclotomic Hecke rows against
the full modular-symbol operators, compare direct row bases with exact
double-kernel oracles, verify the modular rank-profile minor, and round-trip
the packed rational row through the public power-series representation.
