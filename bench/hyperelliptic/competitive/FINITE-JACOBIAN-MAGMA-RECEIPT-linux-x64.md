# Finite Jacobian Magma receipt on `bench-1`

This is the bounded equal-contract receipt for public odd-degree genus-2 and
genus-3 Jacobian arithmetic over `GF(1009)`.  It was run from revision
`ce048d403a2efa1ed3482c06d62ad2bb5d734a9e` on 2026-08-23 with the exact
harness in `finite-jacobian-magma-contract.cjs`.

The machine was reserved exclusively for this run.  Immediately before the
timed contract its load averages were `0.07, 0.65, 0.98`, and no competing
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
| 2 | add | 23.089 us | 18.105 us | 207.319 us | 1.700 us | 13.582x | 10.650x |
| 2 | double | 22.953 us | 18.046 us | 205.934 us | 1.700 us | 13.502x | 10.615x |
| 2 | scalar-256 | 693.789 us | 692.413 us | 885.134 us | 490.000 us | 1.416x | 1.413x |
| 3 | add | 22.928 us | 17.914 us | 218.626 us | 2.700 us | 8.492x | 6.635x |
| 3 | double | 22.954 us | 17.942 us | 217.938 us | 3.700 us | 6.204x | 4.849x |
| 3 | scalar-256 | 963.089 us | 957.461 us | 1,165.044 us | 1,280.000 us | 0.752x | 0.748x |

Thus the prepared scalar engine is already competitive: it is about 1.41x
Magma for genus 2 and 1.34x faster than Magma for genus 3 on this model and
host.  Public addition and doubling are not yet competitive.  Their retained
rows are 4.85x--10.65x slower than Magma, while forced polynomial
materialization is much more expensive.  This receipt intentionally leaves
those gates open.

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
`c09f4b2e8ebc8bada4e393a3eefd88c1cb651fea90372fb420fee807a8b933d1`,
`962783c8e3f4b77f52c30bb6198ca39edea802f401fb8d6d49e381d11347b418`,
and `312047781c0014441f0c356d55c2a2e5715594bcc96c9dba9731d39e112ad36e`.
The complete sample vectors, canonical rows, backend statuses, timer
resolution, MADs, and ratios are in
`finite-jacobian-magma-receipt-linux-x64.json`.
