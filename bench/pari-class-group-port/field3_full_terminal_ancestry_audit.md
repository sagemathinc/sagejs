# Field-3 full terminal ancestry

## Boundary

This additive owner extends the existing field-3 high-precision A-v1 boundary
without changing it.  The terminal resident state is

```text
[H rows, retained columns, B columns, dependent rows, zero columns,
 removed unit diagonals, status, raw columns, append status]
= [2, 15, 286, 0, 13, 3, 0, 301, 0].
```

Thus the first fifteen terminal logarithm columns are exactly
`[A13 | Ce2]`; the remaining 286 columns are `B`.  Reversing the same local
PARI 2.17.4 `hnffinal`/`hnfadd_i` owners from terminal columns 0 through 14
produces a bounded column-major `301 x 15` transform.  No `301 x 301`
transform is constructed.

## Exact certificate

The first thirteen transform columns are byte-for-byte the established A-v1
unit ancestry and satisfy `R*Tunit = 0`.  The two class columns deliberately
do not lie in that kernel.  Their exact invariant is

```text
R * Tclass = permutation^-1(H),
```

where the two columns of `H` occupy the first two logical permuted rows and
all other 286 physical rows are zero.  For this run `H = diag(2,2)` and the
terminal permutation starts `[11,2,...]`; hence the first class image is 2 in
zero-based physical row 10 and the second is 2 in physical row 1.

This is the missing exact class-generator bridge.  Each `Tclass` column gives
the product of the 301 retained principal generators whose divisor is the
corresponding `W=H` column.  The already retained `class_group_gen` `M1` and
`Uir` identities can therefore turn the class-generator order relations into
principal-element witnesses, rather than relying only on logarithmic `Ce`.

## Authority and publication

The input remains the immutable field-3 raw-log owner and the published local
HNF protocol v1.  Terminal `H` and the terminal permutation come from the
separately hashed resident authority and must match the independent terminal
checkpoint hashes already recorded in the protocol.  The output records the
complete transform, the terminal state, `H`, permutation, exact image state,
315 packed terminal words, and explicit 273-word A / 42-word Ce splits.

The coordinator authenticates every immutable mode-0444 input by an explicit
SHA-256, reruns validation after loading, and publishes by temporary-file
rename under the output content hash.  Repeating publication is idempotent.
The current A-v1 schema and its 301-by-13 meaning are unchanged.

## Focused controls

The checker uses the authentic low-cost integer protocol but does not run the
expensive authentic high-precision logarithm campaign.  Exact zero packed
logs exercise the source-order replay and A/Ce split.  It verifies CPython and
generated JavaScript agreement, exact prefix equality with the old 13-column
transform, and transactional rejection of mutations to a class ancestry
coefficient, terminal H, terminal permutation, and an out-of-band input hash.
Failed publication leaves no additional output.

```bash
node bench/pari-class-group-port/check_field3_full_terminal_ancestry.cjs
```
