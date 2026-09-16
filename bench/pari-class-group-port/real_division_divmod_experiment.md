# Paired quotient/remainder source experiment

Only two sites in `pari_real_division` change: the one-word divisor branch and
the branch with divisor precision at least 256 bits. Each now uses Python
`divmod` instead of separate `//` and `%`. The intermediate two/three-word
division routine is unchanged. Rounding, operand truncation, precision, signs
and exponent normalization remain unchanged.

Independent review confirms operands are not mutated between the original
operations. The focused checker compares 6,272 cases with PARI 2.17.4,
CPython, generated JavaScript, GMP and tagged native code. All pass, including
the existing exceptional zero-divisor check. Tested mantissa widths are 64,
128, 192, 256, 512, 1024 and 1920 bits, with signed and near-rounding controls.

The checker additionally verifies exactly two `mpz_fdiv_qr` operations in the
generated GMP body and two `sagejs_tagged_divmod` calls in the tagged body,
with no quotient-only calls in either body. Remaining remainder operations
check precision modulo 64. The focused core SHA-256 is
`c9b09dad7d9594ef49ddb8fe8c2a4df43e845811af17ac1f2955ff2fea58783f`.
This uses existing compiler support; it adds no function-specific lowering.

Reproduce with `node bench/pari-class-group-port/check_compiled_real_division.cjs
/scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4` under the existing metering
and 4 GiB address-space policy. Focused runs consumed 6.86 CPU seconds.

## Full prepared cubic replay

The rebuilt tagged kernel passes one fresh-state warmup and three fresh-state
calls on `x^3-20010*x+20018`: class number 3, invariants `[3]`, the exact
regulator triple, 58 relations and work counts 491/54/12 remain unchanged.
The ordinary 64-word policy and all inputs are unchanged from the baseline.
Core size is 58,209,499 bytes, SHA-256
`8d39547358da34d7b510c8610b1e29bab4638050588c4912e6928008fa546d88`.

Single-call times are 108.443, 108.972 and 108.919 ms, with reset separately
28.102, 29.259 and 28.818 ms. This is an unpaired diagnostic, not a measured
speedup: it remains in the previous approximately 109 ms range. The paired
division change does not visibly resolve the prepared cubic performance gap.
It also does not affect every real-division branch. No quartic replay or broader
performance qualification is claimed for this increment.

The full rebuild/replay consumed 236.03 CPU seconds and peaked at 1,748,612 KiB
RSS. Raw output is `/tmp/sagejs-prepared-divmod-20260915.json`; input SHA-256 is
`37abbff3ea5a0fbbd81d4261a737f19808a2b85220c725417d0f315d15c0e10c`.
Reproduce with `probe_resident_class_attempt.cjs` using the same prepared input
and reference paths recorded in `resident_word_capacity_audit.md`, tagged
backend, three samples and default capacity. Compilation and owner reset are
excluded from the reported call times, not excluded from resource accounting.
