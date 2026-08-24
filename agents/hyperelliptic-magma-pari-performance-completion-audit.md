# Hyperelliptic performance completion audit

This audit applies the literal exit criteria in
`agents/hyperelliptic-magma-pari-performance-plan.md` to the integrated
`higher-genus` source through `28edd8cb`. An implementation or local diagnostic
does not count as an accepted phase when the plan requires a durable
equal-contract receipt.

## Phase status

| Phase | Status | Accepted evidence and remaining work |
|---|---|---|
| 0 — exact baselines | PASS | The versioned corpus, resident Sage.js/Magma/PARI drivers, Linux receipt/report, explicit unsupported cells, and three-platform native/Wasm receipts are checked in. |
| 1 — packed divisor ABI | OPEN | Authenticated packed divisors, retained results, canonical digests, and prepared contexts are integrated. The new fail-atomic `unpack_batch` validates and seals 1,000 canonical rows in 69.6/68.8 ms for genus 2/3, 22.6--24.8x faster than scalar reference ingress, without taxing ordinary constructors. Cached preparation is 22--26 microseconds. Fresh authenticated ingress still performs genuine relation validation and therefore cannot satisfy the literal less-than-10%-of-no-op criterion; that criterion must not be relabelled as retained reuse. |
| 2 — public Cantor arithmetic | RECEIPT PENDING | Source-transparent genus-2/3 Cantor kernels and exact differentials pass; the packed boundary is 1.049x/1.048x the same standalone core. Authenticated public batch add/double now measures 2.83--3.27 microseconds per item locally, projecting to 0.77--1.92x the pinned Magma medians. A same-host final-source receipt is still required; singleton public operators remain a separate 0.35--0.44 ms publication path. |
| 3 — scalar and Kummer arithmetic | PASS | Native/dynamic/reference scalar and Kummer differentials pass. The accepted 256-bit finite-field receipt is 1.36x Magma in genus 2 and faster than Magma in genus 3; retained batch operation avoids forced polynomial construction. |
| 4 — high-fan-out consumers | RECEIPT PENDING | Genus-3 certification through `10^5` passes the exact digest, 5x time, 300-second, and 512-MiB gates under the documented 256-MiB V8 old-space envelope. A dedicated fresh-process rank-three harness now measures 0.48--0.58 s locally against the 0.8103-second target with exact structure, inverse map, and verification. The pinned Node 22 same-host receipt remains outstanding. |
| 5 — local-factor materialization | PASS | At `10^5`, coefficient streaming is 1.56x and public polynomial materialization is 1.77x the packed traversal; exact digests agree and bounded memory passes. |
| 6 — rational arithmetic | MIXED | The recurring 1,024-by-32 many-prime workload is 1.42x faster than Magma and exact certificates replay. Growing-coefficient public addition is 1.97x Magma, but the small row is 7.81x. The scalar contract now correctly separates bounded-output non-torsion rows from an explicitly torsion 256-bit row: exact non-torsion `2^256` multiplication over `QQ` has an astronomically large output and is not a meaningful finite benchmark. The source-current equal-contract Magma scalar receipt remains pending. |
| 7 — genus-2 heights | MIXED | The accuracy-matched 64-bit single-height cold/warm gate passes, and authenticated reused rank-2/rank-4 pairing work beats Magma. Compact authenticated proof payloads and direct polarization improve local object-cold rank-2 from about 632 to 322--335 ms and the four-vector case from about 1,690 to 738--777 ms, with independent correctness review passing. These still miss the 180/500 ms prototype floors and the final 80/380 ms targets. Sage.js has rigorous 128/256-bit rows, but no matching demonstrated competitor contract. |
| 8 — periods and genus-3 heights | PASS | Genus-2/3 periods are within 2x PARI, the 12-point Abel--Jacobi batch beats separate Magma calls, and the radius-6 genus-3 height is 7.29x faster than the exact historical path while preserving finite replay and refinement stability. Its `rigorous=false` label remains explicit. |
| 9 — analytic `L`-functions | RECEIPT PENDING | A source-current acceptance harness now covers true fresh initialization bracketed by PARI, warm reuse, genus-2/3 derivatives, universal/direct Arb differentials, exact coefficient/sign digests, worker equality, and refinement stability. A full local diagnostic passes (fresh 1.613x PARI, warm/fresh 233x, derivative minima 31.7x/937.9x); the required five-sample pinned-host durable receipt remains outstanding. |
| 10 — auto selection and platforms | FOUNDATION ONLY | Windows x64, Linux ARM64, and macOS ARM64 frozen-source native/Wasm receipts pass exact digests, capability, bounds, cancellation, and recovery checks, but their mathematical source is `168f8504`. A disabled v1 receipt-policy manifest, framed source-bundle digest, fail-closed verifier/query library, and adversarial tests are integrated. No selector is wired and no policy entry is enabled until the final-source platform receipts exist. |

## Execution order

1. Collapse the gap between ordinary public finite arithmetic and the already
   competitive retained prepared core; this also addresses the Phase-1 fresh
   packing boundary and has the widest consumer fan-out.
2. Record the final-source pinned-host process-cold rank-three map receipt.
3. Produce the Phase-9 durable acceptance receipt and the corrected Phase-6
   bounded-output rational-scalar receipt, even if they record an honest
   failure.
4. Reassess the rational small-row and genus-2 object-cold height floors only
   through representation or shared-proof improvements; do not duplicate the
   mathematics in opaque handwritten native code merely to meet a ratio.
5. Freeze the resulting source and rerun the minimal affected Phase-10
   cross-platform matrix.

The phase status may be promoted only by updating the corresponding durable
receipt and the integrated workload matrix. Open or unavailable competitor
contracts remain visible.
