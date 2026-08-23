# Finite Jacobian Magma receipt on `bench-1`

This is the bounded equal-contract receipt for public odd-degree genus-2 and
genus-3 Jacobian arithmetic over `GF(1009)`.  It was run from revision
`d970b023f3d16e3d0c83a20c36b69090289f3989` on 2026-08-23 with the exact
harness in `finite-jacobian-magma-contract.cjs`.

An earlier receipt, preserved in git history, returned `batch[0]` before
stopping the Sage.js timer and therefore copied the full sealed batch inside
the timed interval. This final receipt uses the corrected equal contract:
both Sage.js and Magma observe their final canonical result only after timing.

The machine was reserved exclusively for this run.  Immediately before the
timed contract its load averages were `0.07, 0.50, 0.74`, and no competing
user process was active.  The host was an 8-core, single-thread-per-core AMD
EPYC 7B13 Linux x86-64 VM.  Sage.js used Node 22.22.2 and the production
native-kernel pack; the oracle was Magma 2.18-5.  The raw preflight and
postflight records are committed beside this report.

## Contract

- Addition and doubling use 100,000 resident operands per sample.
- Scalar multiplication uses 1,000 resident operands and the fixed 256-bit
  scalar recorded in the JSON receipt.
- Every row has two warmups and seven measured samples.
- Sage.js is reported separately as ordinary registered-public input,
  prepared retained packed output, and forced public Mumford materialization.
- Magma uses resident public Jacobian operations and observes the final
  canonical Mumford result outside the timed interval.
- The Magma timer resolution is 10 ms.  Every measured Magma sample was at
  least 160 ms, so no timer-zero row was relabeled or extrapolated.
- Each Sage.js mode, the dynamic reference implementation, and Magma produced
  the same canonical Mumford row and SHA-256 result digest for all six cases.

Median time per operation is shown below.  A ratio above 1 means Sage.js is
slower than Magma; a ratio below 1 means Sage.js is faster.

| genus | operation | Sage public | prepared retained | forced materialized | Magma | public / Magma | retained / Magma |
| ---: | :--- | ---: | ---: | ---: | ---: | ---: | ---: |
| 2 | add | 7.655 us | 2.619 us | 211.010 us | 1.700 us | 4.503x | 1.541x |
| 2 | double | 7.827 us | 2.559 us | 210.007 us | 1.700 us | 4.604x | 1.506x |
| 2 | scalar-256 | 668.450 us | 665.009 us | 877.494 us | 490.000 us | 1.364x | 1.357x |
| 3 | add | 7.803 us | 2.550 us | 220.449 us | 2.800 us | 2.787x | 0.911x |
| 3 | double | 7.955 us | 2.644 us | 220.539 us | 3.700 us | 2.150x | 0.715x |
| 3 | scalar-256 | 949.102 us | 946.633 us | 1,166.163 us | 1,280.000 us | 0.741x | 0.740x |

The retained genus-3 engine is faster than Magma for all three operations on
this model and host: about 1.10x for addition, 1.40x for doubling, and 1.35x
for 256-bit scalar multiplication. Retained genus-2 arithmetic is within
1.36x--1.54x of Magma. Ordinary registered-public scalar multiplication is
also competitive, but public addition and doubling remain 2.15x--4.60x
slower because their contract includes authenticated gathering. Forced
polynomial materialization remains the largest open public-representation
cost.

## Scaling diagnosis

A local read-only profile isolated retained addition without indexing its
result. It used three samples per size and one warmup on the same `GF(1009)`
models. Median time per item improved, rather than regressed, as the batch
grew:

| genus | 1,000 | 10,000 | 100,000 | 100,000 kernel | 100,000 publication |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 2 | 3.563 us | 2.784 us | 2.651 us | 1.826 us | 0.722 us |
| 3 | 3.087 us | 2.779 us | 2.629 us | 1.932 us | 0.693 us |

The discrepancy with the superseded first 100,000-item receipt was therefore
the timed first-element observation, not allocation or chunking in the
retained native kernel. There is also a separate public API opportunity:
demanded indexing
of one packed result should eventually use an authenticated constant-size row
copy rather than copying the whole batch. That optimization is not needed to
make the benchmark contract equal, because result observation belongs outside
both implementations' timed intervals.

## Exactness and provenance

The six result digests are:

- genus-2 add: `c2e47cae54b134525acec256e7955552d092d63a21cb6b23ba596d63d722b6c6`
- genus-2 double: `ab0a1052f29ac443e0060dafe2e4c353aa3cb24ccab78794e69b748c9ee2f4bf`
- genus-2 scalar: `12b8e34a1136ad846da35402cdb92c24d7a5d14a5ae8dde595940f0676a32007`
- genus-3 add: `fdcf70b9a62f7ea0dbbbec4af30e6d176113f9b4c6f3b81d429ec4d622ceb1bc`
- genus-3 double: `2caba1884c8bfd6c4d929c577f08e8a5decef877ce2c892549b217e481a33a18`
- genus-3 scalar: `e8fcbece8c8820e2f6a44ca2417f488b9ed9fdcde8351b50d00cdfa0c6acd205`

The harness, generated Sage.js program, and generated Magma program hashes
are respectively
`03502ece58b2f7fb2f73882b7833be30c6e806d2efc16b9113615bae63880da6`,
`56c46a7c60157580b59ffd589aec42a9420ab47a25ba3b6742232a1c1580c4b7`,
and `312047781c0014441f0c356d55c2a2e5715594bcc96c9dba9731d39e112ad36e`.
The complete sample vectors, canonical rows, backend statuses, timer
resolution, MADs, and ratios are in
`finite-jacobian-magma-receipt-linux-x64.json`.
