# Phase-0 workload matrix

This matrix is part of the benchmark contract.  A missing implementation is
recorded as unavailable rather than being silently omitted or counted as a
performance win.

| Workload | Corpus/runner status | Principal comparison |
|---|---|---|
| Odd-degree genus-2/3 divisor validation, addition, doubling | Exact resident rows, including generalized `h`, shared support, conjugate cancellation, and divisor degrees 0 and `g` | Magma and SageMath |
| 64-bit explicit native/reference scalar, 256-bit and 1024-bit fallback scalar | Exact resident rows; the Sage.js algorithm is named in the case id/contract | Magma and SageMath |
| 31-bit genus-2 and 52-bit genus-3 arithmetic | Exact slow-tier rows | Magma and SageMath |
| Even-degree public group law | Explicit unsupported row; the current odd-degree ABI cannot encode the infinity branch | Magma representation survey only |
| Group structure | Cyclic 2160/6490, rank two, order-32 rank three, and order-512 rank three exact rows | Magma and SageMath |
| Local factors | Odd/even genus-2/3 exact rows | PARI, Magma, and SageMath |
| Packed local stream through `10^4`/`10^5` | Checked exact-digest CPU/wall/RSS receipt and report from `local-streams.cjs`; `10^5` median 1.809 s, peak RSS 97.5 MB | Standalone smalljac receipt |
| General standalone Cantor/analytic core | Explicit unavailable backend; no such production artifact exists at Phase 0 | Not applicable |
| General production Wasm artifact | Explicit unavailable backend | Not applicable |
| Rational Cantor arithmetic | Exact generalized-model addition plus growing rational doubling/scalar slow rows | Magma and SageMath |
| Canonical height | Certified slow row with precision/status contract | Magma |
| Periods | Genus-2/3 numerical rows with stable normalization and tolerances | PARI |
| L-functions | Genus-2 cold `LFunctionInit`, warm central value, and genus-3 conductor-24055 central value | PARI where its genus-2 API applies |
| Global reduction | Certified conductor/root-number row and explicit wild-prime unsupported row | No same-contract competitor in this runner |
| Torsion, saturation, height pairing/regulator | Existing Sage.js correctness/oracle suites are referenced by the main plan, but no stable cross-system resident timing row is claimed here | Magma follow-up |
| `10^6` local stream, public lazy/materialized/certificate/JSONL/resume stages | Deliberately omitted from the default acceptance tier; existing subsystem receipts remain the current evidence | PARI/standalone follow-up |
| Standalone/Wasm receipts on ARM64, macOS, Windows | Explicitly unavailable until a production artifact exists; Sage.js-only architecture receipts may still be captured | Per-host historical baseline |

The repeated warm loop is a serial loop over the public call.  It is not a
packed batch, because the public competitive arithmetic API does not yet
provide independent prepared batch operands.  This naming prevents Phase 0
from presenting cache hits or repeated identical work as Phase-1/2 batch
throughput.
