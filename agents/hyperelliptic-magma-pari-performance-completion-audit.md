# Hyperelliptic performance completion audit

This audit applies the literal exit criteria in
`agents/hyperelliptic-magma-pari-performance-plan.md` to the integrated
`higher-genus` source after `b30ecbfa`. An implementation or local diagnostic
does not count as an accepted phase when the plan requires a durable
equal-contract receipt.

## Phase status

| Phase | Status | Accepted evidence and remaining work |
|---|---|---|
| 0 — exact baselines | PASS | The versioned corpus, resident Sage.js/Magma/PARI drivers, Linux receipt/report, explicit unsupported cells, and three-platform native/Wasm receipts are checked in. |
| 1 — packed divisor ABI | OPEN | Authenticated packed divisors, retained results, canonical digests, and prepared contexts are integrated. Registered preparation is about 1.5--1.6 ms per 1,000 rows, but truly unregistered first preparation is about 0.82--0.88 s because every divisor relation is revalidated. The required less-than-10% pack/unpack overhead over a no-op traversal is not demonstrated for fresh batches. |
| 2 — public Cantor arithmetic | MIXED | Source-transparent genus-2/3 Cantor kernels and exact differentials pass; the packed boundary is 1.049x/1.048x the same standalone core. Prepared retained add/double is within 2x Magma, but ordinary public add/double remains 2.15x--4.60x and therefore misses the public end-to-end gate. |
| 3 — scalar and Kummer arithmetic | PASS | Native/dynamic/reference scalar and Kummer differentials pass. The accepted 256-bit finite-field receipt is 1.36x Magma in genus 2 and faster than Magma in genus 3; retained batch operation avoids forced polynomial construction. |
| 4 — high-fan-out consumers | MIXED | Genus-3 certification through `10^5` passes the exact digest, 5x time, 300-second, and 512-MiB gates under the documented 256-MiB V8 old-space envelope. Rank-three structure and resident object-cold/warm maps pass, but the truly process-cold explicit map is 1.226 s against the 0.8103-second 10x target. |
| 5 — local-factor materialization | PASS | At `10^5`, coefficient streaming is 1.56x and public polynomial materialization is 1.77x the packed traversal; exact digests agree and bounded memory passes. |
| 6 — rational arithmetic | MIXED | The recurring 1,024-by-32 many-prime workload is 1.42x faster than Magma and exact certificates replay. Growing-coefficient public addition is 1.97x Magma, but the small row is 7.81x. The literal ordinary 256-bit rational scalar comparison has no durable equal-contract Magma receipt and remains open. |
| 7 — genus-2 heights | MIXED | The accuracy-matched 64-bit single-height cold/warm gate passes, and authenticated reused rank-2/rank-4 pairing work beats Magma. Object-cold rank-2/rank-4 construction remains 17.1x/12.4x Magma. Sage.js has rigorous 128/256-bit rows, but no matching demonstrated competitor contract, so the literal 128/256 cold gate is not closed. |
| 8 — periods and genus-3 heights | PASS | Genus-2/3 periods are within 2x PARI, the 12-point Abel--Jacobi batch beats separate Magma calls, and the radius-6 genus-3 height is 7.29x faster than the exact historical path while preserving finite replay and refinement stability. Its `rigorous=false` label remains explicit. |
| 9 — analytic `L`-functions | EVIDENCE AUDIT | The implementation and focused tests report all four numerical gates as passing: fresh initialization 1.64x PARI, warm/fresh above 20x, and derivative speedups above 8x/5x. A final durable source-pinned acceptance JSON containing those universal-table measurements has not yet been located; family-scan coefficient/sign refinement evidence must also be tied to it or a separate receipt. |
| 10 — auto selection and platforms | EVIDENCE AUDIT | Windows x64, Linux ARM64, and macOS ARM64 frozen-source native/Wasm receipts pass exact digests, capability, bounds, cancellation, and recovery checks. Their mathematical source is `168f8504`, not current `b30ecbfa`; the intervening path-affecting diff must be classified and the final source rerun where necessary before claiming every current `algorithm="auto"` selection is receipt-backed. |

## Execution order

1. Collapse the gap between ordinary public finite arithmetic and the already
   competitive retained prepared core; this also addresses the Phase-1 fresh
   packing boundary and has the widest consumer fan-out.
2. Remove or decisively characterize the one-time process-cold rank-three map
   publication cost.
3. Produce the missing Phase-9 durable acceptance receipt and the Phase-6
   rational-scalar contract, even if they record an honest failure.
4. Reassess the rational small-row and genus-2 object-cold height floors only
   through representation or shared-proof improvements; do not duplicate the
   mathematics in opaque handwritten native code merely to meet a ratio.
5. Freeze the resulting source and rerun the minimal affected Phase-10
   cross-platform matrix.

The phase status may be promoted only by updating the corresponding durable
receipt and the integrated workload matrix. Open or unavailable competitor
contracts remain visible.
