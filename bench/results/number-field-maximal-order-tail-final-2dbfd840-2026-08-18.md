# Maximal-order final tail receipt

This receipt preserves the three final primary rows and the terminal degree-90
stage diagnosis from the maximal-order optimization campaign. The machine-readable
evidence is in
`number-field-maximal-order-tail-final-2dbfd840-2026-08-18.json`.

## Measurement identity

- Source commit: `2dbfd8401dbe7eac3298d81ee8d91510fbec5548`
- Source tree: `05da5cc38a4f146ef2c434dcc882d592b7d1c091`
- Source status: clean
- Production-native index SHA-256:
  `629cb3fc33eedc675add0af8b58c12fea5d6a79dad77f07c2b0e23375dd4be77`
- Production-native modules: 22, all current
- Receipt payload SHA-256:
  `6f5e1401c5f44d344dde2aaca877727181f9d8a67ad9b02530c252bfe7ad0b7a`

The later integration commit used to store this receipt differs from the measured
commit. The embedded rows retain their original source, tree, native artifact,
report, and payload identities.

## Primary rows

| Case | State | Public call | Peak RSS | Exact verification |
| --- | --- | ---: | ---: | --- |
| `pari-large-prime-quadratic-compositum` | `ok` | 3,801.546 ms | 775,468 KiB | passed |
| `regression-x64-plus-2pow16` | `ok` | 2,991.569 ms | 486,356 KiB | passed |
| `hecke-degree-90` | `crash` | -- | 712,928 KiB | unavailable after worker crash |

The successful rows are independently checked for lattice equality, index,
discriminant, multiplication closure, and the frozen certificate. The degree-90
row is retained as a crash, not mislabeled as a timeout: the worker received
`SIGTRAP` after V8 failed `change_in_bytes < kMaxReasonableBytes`.

Original report SHA-256 values:

- large-prime compositum: `c7b291b8066dec2ace71008385fcdcccd23094249fef651cd3bd59645de9cf8a`
- x64 + `2^16`: `8bcb11ef2962d8f25b879d3b20cd15739740696f20c3496e3c2cafa89ba0b740`
- degree 90: `cba2201b931ee774a824bbf84704ee60527b5c18290ff7b0e6d6627dfc91cd58`

## Degree-90 terminal boundary

The bounded diagnostic established this sequence:

1. Discriminant decomposition took 6.694 seconds and returned 17 proven primes
   plus one 1,341-bit composite of exponent 10.
2. The first composite Dedekind step split it into a 22-bit proven prime of
   exponent 30 and a 1,277-bit composite of exponent 10.
3. The second composite Dedekind step took 1.052 seconds and returned `enlarge`.
4. Execution then entered the q-radical/multiplier cycle and its
   `_order_multiplication_table` boundary. The diagnostic was deliberately stopped
   after this boundary was confirmed; it is not a substitute timing row.

For degree 90, the eager packed table has `90^3 = 729,000` entries. The current
capacity formula requests 7,197 64-bit words per entry at 1,277 bits, or
41,972,904,000 bytes. At 1,341 bits it requests 7,557 words per entry, or
44,072,424,000 bytes. Thus the allocation asks V8 for roughly 39--41 GiB before
the intended `OverflowError` capability fallback can run. A tight-capacity or
streaming multiplication-table implementation is the exact remaining boundary.

The raw diagnostic marker stream has SHA-256
`0f8cfb2d3e7c78ede5bacb85125cfd7af596f411fb31d17f792e27ebcc6f063f`.
