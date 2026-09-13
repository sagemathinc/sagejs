# Keyword argument packet sizing

Base: `c4c126d09ba4f5c2fb30001fd8b561b24105d80f`.

The Python keyword binder used general Python `max` to compare two internal
JavaScript array lengths. This invoked Python argument and iterator machinery
inside every applicable keyword call. Use the existing `runtime.math.max`
primitive for those lengths; public Python `max` and legacy binding are unchanged.

## Evidence

A coordinated idle Linux x64 VM ran the unchanged checked call-shape probe in
baseline/candidate/CPython order and then reverse order. Each launch uses three
warmups and seven samples; every result is checked. Compilation and startup are
outside the timed regions. Both JavaScript artifacts ran on Node 26.7.0 against
CPython 3.14.4. The candidate was compiled locally with Node 26.8.1; this is not
a same-build-toolchain or four-platform qualification claim.

Warm medians for 100,000 calls, milliseconds:

| Workload | Baseline rounds | Candidate rounds | CPython rounds |
| --- | --- | --- | --- |
| Keyword function | 406.50 / 411.61 | 291.00 / 290.86 | 6.54 / 6.73 |
| Keyword method | 735.50 / 714.97 | 587.01 / 581.98 | 6.59 / 6.61 |

The function probe takes about 28–29% less time, the method probe 19–20% less.
The remaining approximately 43–45x and 88–89x CPython gaps are **open cliffs**.
Small differences in positional/construction controls are not claimed benefits.
These are call probes, not package-wide speedups.

Local raw campaign evidence: `/tmp/python-call-profile.vDw3Fr/paired-length-max.json`.
Candidate standalone SHA-256:
`4d04a3f843a1d0ac7048eca606d0c20f9aceae3f597dbef4929ec28b75a5d2a8`.

The frozen source passed a full build (10m 33s), 13 focused tests including
CPython/Python/Sage binding oracles, strict checks (387 modules, zero errors),
merge-owned architecture inventories, and documentation checking with receipt
reuse. Core-runtime source is 902,995 / 903,000 bytes; no budget was raised.
Browser and platform CI remain separate qualification. No release is implied.
