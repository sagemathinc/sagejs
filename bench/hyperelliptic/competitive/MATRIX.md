# Integrated hyperelliptic workload matrix

This matrix records the final contract for the 2026-08-23 performance program.
A missing implementation remains unavailable, and a missed gate remains open;
neither is removed from a receipt or counted as a performance win.

| Workload | Final status | Principal comparison |
|---|---|---|
| Odd-degree genus-2/3 validation, addition, doubling, cancellation, and shared support | Exact resident corpus passes. Prepared finite arithmetic uses authenticated packed input and retained results; the same native core is within 1.049x/1.048x of standalone for genus 2/3. Prepared add/double is 1.51x--1.54x Magma in genus 2 and faster in genus 3; ordinary public add/double remains 2.15x--4.60x, dominated by gathering/publication. Truly unregistered first preparation also remains expensive. | Magma, dynamic Python, standalone native core |
| 64-, 256-, and 1024-bit scalar multiplication | Exact native/dynamic/reference differentials pass. On the resolved 256-bit row, ordinary public Sage.js is 1.36x Magma in genus 2 and 1.35x faster in genus 3. Retained results avoid forced polynomial publication; forced materialization remains separately timed. | Magma and dynamic Python |
| Rational Cantor arithmetic | Exact retained `FmpqMumfordResult` values survive context closure, workspace reuse, serialization, and adversarial mutation. The growing public addition row is 1.97x Magma; the small row is 7.81x and remains open. | Magma |
| Many-prime rational reduction and uniform torsion witness | The recurring 1024-by-32 contract is 98.54 ms versus Magma 140 ms, with checksum 28,672 and separate certificate replay. | Magma |
| Group structure and explicit maps | Cyclic/rank-two/rank-three exact certificates pass. The order-32 resident object-cold and warm gates pass; the truly process-cold map remains open because first native publication is charged separately. | Magma and exhaustive oracle |
| Genus-2 local factors | Final packed stream through `10^5` is 1.741 s at 96.8 MB, with the frozen digest unchanged. Coefficient streaming is 1.56x and public polynomial materialization 1.77x packed traversal; all four public modes agree exactly and the three-repeat process stays below 512 MiB. | PARI, Magma, standalone smalljac |
| Genus-3 local-factor certification | Dense finite-parent caches are removed; packed progression/factor-strip proofs include bounded prime/composite-tail handling. The exact `10^5` family completes in 142.18 s at 338,968 KiB, 5.50x faster than the materialized control, with the frozen digest unchanged under the recorded 256 MiB V8 old-space envelope. | rforest plus exact public fallback |
| Certified genus-2 heights | Accuracy-matched 64-bit single height is within 1.92x cold and 1.45x warm Magma. Reused rank-two/rank-four pairing work is faster than Magma; object-cold batches remain open. | Magma |
| Genus-3 heights | Radius-6 process-cold height is 55.80 s versus 406.50 s for the exact historical direct-theta checkout, a same-host 7.29x speedup. Exact finite replay and refinement stability pass; `rigorous=false` remains explicit. Magma's scalar agrees to the requested accuracy but its timings are descriptive because it exposes no matching finite/refinement witness. | Historical Sage.js path; descriptive Magma oracle |
| Period matrices | Resident genus-2/genus-3 calls are 1.73x/1.47x PARI with Arb refinement evidence. | PARI |
| Abel--Jacobi batch | A 12-point prepared batch is 9.35x faster than twelve prepared Magma calls with exact model and conjugation checks. | Magma |
| Analytic `L`-functions | A curve-independent universal Arb table gives fresh 64-bit initialization at 1.64x PARI; cold table construction (~2.20 s) is separate. Central values and derivatives preserve direct-Arb differentials. | PARI |
| Global reduction, conductors, and root numbers | Exact certificate rows pass; unsupported wild-prime cases remain explicit. | PARI where contracts overlap |
| Standalone and authenticated Wasm | Production native and Wasm packs are authenticated. Windows x64, Linux ARM64, and macOS ARM64 exact digests agree for local factors, Kummer, Cantor, scalar, and progression workloads; portable overhead, bounds, cancellation, recovery, and unavailable standalone contracts are explicit. | Same-source native/standalone/Wasm per host |
| Native macOS ARM64 | Frozen-source native/dynamic acceptance passes. Native add/scalar/Kummer acceleration is reported descriptively on the shared host; authenticated Wasm passes, while the GNU/ELF-only standalone linker harness is explicitly unavailable on Mach-O. | Same-source native/Wasm on `m1` |
| Even-degree public Jacobian group law | Explicitly unsupported: the current public odd-degree divisor ABI cannot encode the infinity branch. Even-degree local factors and periods remain supported. | Not applicable |

The common resident acceptance table is `REPORT-linux-x64.md`. Detailed
workload-specific receipts live beside the responsible benchmark or under
`bench/results/`; cross-platform receipts live under
`bench/hyperelliptic/cross-platform/results/`.
