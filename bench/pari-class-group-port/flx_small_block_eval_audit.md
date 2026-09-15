# Shared small Flx quotient-ring block evaluation

`flx_small_block_eval.py` translates PARI 2.17.4 `Flx.c` functions
`Flx_FlxqV_eval_pre` and `Flx_Flxq_eval_pre`. Copyright The PARI group,
GPL-2.0-or-later, without warranty. It is shared by the small randomized
minimal-polynomial and odd equal-degree factorization dependencies.

## Supported source branch

Monic quotient modulus degree1..4, canonical coefficients over an odd prime
3..3037000493, Q degree-1..4, nine-entry zero-padded polynomial slots. The
table evaluator accepts 1..4 table entries (powers 1,x,x²,x³); one table entry
is only valid for Q degree<=0. The wrapper builds the exact source
floor(sqrt(deg Q)) powers (at most x²) and then calls the same evaluator.

The small moduli do not select Barrett reduction. Matrix products are
classical small-word products, including first multiplication followed by
ascending HIGHBIT-reduced accumulation. If Q fits the table, all table
columns form one block. Otherwise the block width is table length minus one;
coefficients are grouped low-to-high and padded with zero. The final result
uses the source high-to-low modular Horner order with the last table power.
No scalar-Horner or direct coefficient summation replacement is used.

`pari_flx_small_block_eval(w,q,dq,powers,power_count,modulus,n,p,out,scratch)`
requires output9 and scratch128 entries. `pari_flx_small_compose` replaces
`powers,power_count` with `x,dx`, and requires scratch192. All spans are
disjoint, inputs canonical/zero-padded, and x reduced. Table correctness and
primality are caller preconditions. Shape/offset/frontier/nonmonicity guards
reject before writes. Input and inactive storage remain untouched.

The 128-entry block scratch accommodates five coefficient blocks (Q degree4
with table length2); four-entry tables do not increase that maximum. The
composition scratch includes the generated table and separate evaluator
scratch. Fixed-slot zero stores, exact owners and padded addition across n
coordinates have different primitive costs from PARI, explicitly not an
equal-instruction or performance claim. General moduli/degrees and unbounded
tables remain unsupported rather than falling back to a different algorithm.

## Evidence

The checker pins PARI source/archive, compiles a temporary UBSan oracle,
and calls actual `Flxq_powers`, `Flx_FlxqV_eval`, and `Flx_Flxq_eval`.
640 controls cover degrees1..4, all Q degrees-1..4, table counts1..4,
primes3/5/37/3037000493, and both entries. Every result equals PARI in
CPython/JavaScript/GMP/tagged native. All post-call buffers agree with CPython,
and untouched inputs/tails and atomic invalid-argument guards pass.

Final receipt: `/tmp/sagejs-flx-block-eval-kbdE2z/fixtures.json`.

- Python SHA-256:
  `256971d1167ff338e1d8b5c23d06b120cc7fbb67f738b4518dbfab7212adbcf0`.
- Core SHA-256:
  `f5613f327e538c0ca045120dc8a8e00ccaffb51de3676035b25ea82c79fffeac`.
- Compilation/qualification: 9.668958 CPU seconds, 270968 KiB peak child RSS,
  one thread, 4 GiB address-space limit. Earlier table-count-three run is
  superseded; all runs are recorded in the shared CPU ledger.

The refactored minimal-polynomial caller separately reran its full 576-case
PARI/result/projection-count/RNG-state qualification. No duplicate private
evaluator remains. Whole-branch strict/architecture gates remain integration
responsibility; these helper results are not end-to-end class-group evidence.
