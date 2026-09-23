# Small randomized Flxq minimal polynomial

This checkpoint translates PARI 2.17.4 `Flxq_minpoly_pre` and its actual
transposed-multiplication/projection/half-GCD algorithm. It does **not**
replace the randomized algorithm with a linear-algebra minimal polynomial.
The source is `src/basemath/Flx.c:3603–3675`, with evaluation at 3091 and
`gen_powers` in `bb_group.c`. Copyright The PARI group; GPL-2.0-or-later,
without warranty. PARI cites Shoup's *Efficient Computation of Minimal
Polynomials in Algebraic Extensions of Finite Fields*.

## Bounded source dispatch

- Monic modulus degree 2–4, reduced input degree -1 through n-1, canonical
  coefficients, odd prime 3 through 3037000493.
- The installed PARI small-word Barrett thresholds exceed the maximum modulus
  length five. `Flx_get_red_pre` therefore leaves the modulus unwrapped.
  `Flxq_transmul_init` uses the **source quotient branch**, not reciprocal
  Newton inversion: reverse modulus and tau, divide `tau*x^(n-1)` by T,
  reverse that quotient to form bht.
- `usqrt(2*n)` is two throughout this domain. Source baby powers are exactly
  `[1,x,x² mod T]`, including the source square call even for constant x.
- A projection uses actual resident `random_Fl` draws for each coefficient
  in ascending order, followed by transposed multiplication by tau.
- The reverse moment polynomial has m=2(n-deg(g)) coefficients. Block size
  `floor(sqrt(m))` is one or two. The giant-step transposed multiplication
  is performed after **every** block, including the last one.
- `Flx_halfgcd_pre(x^m,c)` uses the separately qualified source basecase.
  Its M22 entry is used unnormalized as g-prime, then the source multiplies
  g and updates tau. Degree-n restart and degree-zero retry branches remain.
- Evaluating g-prime uses the source `Flx_FlxqV_eval_pre` matrix/block order:
  three columns for at most three coefficients, otherwise two-column blocks
  and high-to-low modular Horner steps with x². Degree four needs three
  two-column blocks. Source small-word dot-product HIGHBIT reductions remain.
- Only the final g is normalized. There is no retry cap, replacement factor
  search, or externally supplied projection stream.

Fixed nine-entry polynomial slots, tail clearing, exact-integer storage and
explicit workspace bookkeeping differ from PARI allocation and word storage.
Evaluation addition currently traverses all n padded coefficients, including
zeros; this is a representation difference, not identical primitive cost.
The known multiplication/remainder helper representation differences remain.
This checkpoint claims source algorithm, result, and RNG fidelity, not equal
instruction counts or speed.

## Ownership and failure contract

`pari_flxq_minpoly(w,a,da,modulus,n,p,out,scratch,random_state,diagnostic)`
returns the result degree. Output has nine entries. Scratch reserves 1536
entries, RNG has at least 66, diagnostic has at least one; all owners/spans
are disjoint. Diagnostic[0] counts projection attempts. Extra storage remains
untouched. Shape, offset, frontier, and monicity rejection happens before any
write. Canonical residues, primality, reduced input and valid initialized RNG
are caller preconditions, not independently proved here.

Scratch and RNG are intentionally mutable on arithmetic failure; no durable
publication or full class-group guarantee is implied. General degrees,
nonmonic/Barrett moduli, large primes, and the general composition API remain
outside this checkpoint.

## Evidence

The checker validates the archive SHA and exact Flx source bytes, compiles
a temporary UBSan-linked actual PARI oracle, and calls `Flxq_minpoly`.
An interposed `random_Flx` forwards directly to PARI via `RTLD_NEXT` while
counting projections; every fixture requires a nonzero observed count.
Final complete `getrand()` state is also checked, including its index-zero
encoding. No substitute oracle algorithm is used.

576 controls span modulus degrees 2/3/4, primes 3/5/37/3037000493,
seeds 1/2/2^64-1, zero/constant/generator inputs, nilpotent moduli and
deterministically generated moduli/elements. Every polynomial, projection
count, and final RNG state matches PARI. All mutated buffers match CPython
in JavaScript, GMP native and tagged native; untouched spans/tails and atomic
shape/offset/nonmonicity guards pass. There are 80 multi-projection cases,
up to seven attempts.

Final formatted-source receipt, after extracting the shared block evaluator:
`/tmp/sagejs-flx-minpoly-Yp2SBd/fixtures.json`.

- Source SHA-256:
  `99ec03a2910a024aef5d3e81a1b99d9b9aaf905d8f2bafaf2385f6ac9efb5b5d`.
- Isolated core SHA-256:
  `09e336a8a28061fed9d58eecbe6f17b12b30da2b233d747202b2a18c268c35e2`.
- PARI Flx source SHA-256:
  `7d22f056fe56aa3c5fbd6b0e8f02fdb2e13e285d8a519382ddb2dbe7efefda44`.
- Final compilation/qualification: 19.518518 CPU seconds, 335256 KiB peak
  child RSS under 4 GiB, one thread. Initial unformatted qualification is
  also accounted in the shared ledger, not the canonical receipt. The prior
  private-helper checkpoint was superseded by the shared source helper, with
  the full 576-case qualification rerun.

Reproduce with `node bench/pari-class-group-port/check_flx_small_minpoly.cjs`
followed by the pinned PARI directory, archive path and `--native`.
These are validation resources, not a performance benchmark. Integration
owns whole-branch architecture, strict Python and changed-file qualification.
