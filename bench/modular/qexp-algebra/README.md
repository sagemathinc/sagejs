# Exact $q$-expansion algebra benchmark

This benchmark compares the same resident exact operations in Sage.js and
SageMath:

1. multiply $\Delta$ by $E_4$;
2. apply $V_2$ to $\Delta$; and
3. twist $\Delta$ by the primitive quadratic character modulo $5$.

Each timed iteration constructs the result and reads an eight-coefficient tail
checksum. The harness rejects a checksum mismatch before publishing ratios.
Process startup and construction of the resident input forms are outside the
timed region.

Run it with:

```sh
pnpm bench:modular:qexp-algebra
```

The workload is controlled by `QEXP_PRECISION`, `QEXP_REPEATS`, and
`QEXP_SAMPLES`. `SAGE` may select the comparison executable.

## Linux receipt, 2026-08-30

Command:

```sh
QEXP_PRECISION=256 QEXP_REPEATS=10 QEXP_SAMPLES=7 \
  pnpm bench:modular:qexp-algebra -- --json
```

Environment:

- Sage.js source: the commit containing this receipt, based on
  `38da720f8b75cfbe1580212b40560af1a093b8b8`;
- SageMath `10.9.post1`;
- Node.js `26.7.0` and pnpm `11.9.0`;
- Linux x86-64, AMD EPYC 7B13, one process on a 16-vCPU KVM host.

Resident medians:

| operation | Sage.js | SageMath | Sage.js / SageMath |
|---|---:|---:|---:|
| product | 0.815 ms | 0.342 ms | 2.38 |
| $V_2$ | 0.440 ms | 0.0640 ms | 6.87 |
| quadratic twist | 17.1 ms | 166.7 ms | 0.103 |

The exact tail checksums were respectively `9554405`, `896386259`, and
`387876509`. These are implementation-operation comparisons, not end-to-end
session timings. The $V_2$ path has the largest observed gap, but remains below
one millisecond at precision $256$; the bounded twist is about $9.7$ times
faster than SageMath on this receipt.

A scaling run at precision $1024$ used three repeats and five samples. Its
resident medians were:

| operation | Sage.js | SageMath | Sage.js / SageMath |
|---|---:|---:|---:|
| product | 1.26 ms | 0.399 ms | 3.15 |
| $V_2$ | 0.569 ms | 0.0790 ms | 7.21 |
| quadratic twist | 61.5 ms | 203.4 ms | 0.302 |

The precision-$1024$ exact tail checksums were `903958579`, `25564100`, and
`766298009`. Thus the largest ratio remains the sub-millisecond $V_2$ metadata
path, while neither exact coefficient multiplication nor twisting shows an
order-of-magnitude regression against SageMath on this host.
