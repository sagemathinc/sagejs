# Hard mixed-quartic `getfu` precision corridor

This lane extends the source-transparent PARI 2.17.4 `getfu` suffix for the
frozen mixed quartic

```text
x^4 - 20018*x - 20034
```

without changing the accepted mathematical result or pretending that a
precision failure is a unit computation.  The oracle is pristine PARI 2.17.4
`buch2.c` (archive SHA-256
`02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53`,
source SHA-256
`904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac`).
The checker appends only a diagnostic entry point so it can call the static
`fixarch` and `getfu` routines.

## Result

The same ordinary Python source now replays the complete mixed-complex
exponential, 4-by-4 real/imaginary solve, and rounded-integer decision exactly
at 192, 384, 512, and 768 input bits on CPython, generated JavaScript, native
GMP, and tagged native storage.  Every case agrees with PARI's `fupb_PRECI`
result and exact scratch values.  Public unit, log, and factor outputs remain
zero.  A rejected 1,024-bit call fails in the initial capacity preflight and
therefore cannot publish partial output.

The additional source paths are reusable rather than fixture-specific:

- `pi_constant.py` admits a 2,432-bit input while retaining its 64-bit guard
  inside the existing 2,496-bit arithmetic ceiling;
- `pari_short_square` follows PARI's full-integer `sqrispec_mirror` branch
  above the 512-bit short-square crossover and rounds through the same real
  value contract;
- mixed trigonometric reduction may use the existing 2,496-bit internal
  arithmetic corridor;
- the real/imaginary solve validates the 896-bit embedding values generated
  by the 768-bit number-field state.

## Exact obstruction

The existing 2,496-bit graph cannot honestly complete this field.  At an
input precision of 1,024 bits, four cosine branches cancel against `-1` and
need a 3,136-bit `addir_sign` window.  This is the first tested whole-word
input beyond the translated 768-bit corridor, so the driver rejects it before
mutation rather than truncating or clamping.

More importantly, this is not a small missing guard word.  The pristine PARI
schedule is:

| input bits | rounded solve error | `getfu` result |
|---:|---:|---|
| 192 | 69,863 | `fupb_PRECI` |
| 768 | 69,287 | `fupb_PRECI` |
| 2,496 | 67,559 | `fupb_PRECI` |
| 70,080 | -2 | `fupb_PRECI` (the reconstructed candidates still fail unit authentication) |
| 70,144 | -35,898 | two exact units |

Thus 70,144 bits is the first successful whole-word precision in the pinned
oracle sweep.  Completing eager expanded units for this field would require a
coordinated roughly 140,000-bit cancellation corridor, not a local extension
of the current 2,496-bit graph.  PARI flag-zero correspondence legitimately
returns `not_given(fupb_PRECI)` here; compact flag-one units are the appropriate
separate representation campaign.

Run the durable differential check with:

```bash
node bench/pari-class-group-port/check_getfu_mixed_quartic_precision_corridor.cjs \
  /scratch/sagejs-runtime/pari-class-group-e2e-20260916/toolchains/src/pari-2.17.4-phase0 \
  /home/user/upstream/pari-2.17.4.tar.gz
```

The high-precision oracle sweep takes about one minute on the development
host.  Its eight complete JSON traces are SHA-256 pinned in the checker.
