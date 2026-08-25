# Hyperelliptic release-candidate scorecard

This scorecard applies the literal exit criteria in
`agents/hyperelliptic-magma-pari-performance-plan.md` to the final integrated
mathematical source commit
`a680c04d06fbffd7831a96b3d6e0791ebfc39f26`. Its framed source-bundle digest
is `36495206826f889109076b8f19702c1225ba2d7ff3ebfbd3a5c3e0aae89573e1`.
Later commits change only tests, benchmark orchestration, receipts, reports,
and policy packaging; the authenticated mathematical source bundle is
unchanged.

## Release decision

**Final-freeze candidate, pending the last four-platform refresh.** The
checked-in release policy currently enables zero entries. All six formerly
accepted Cantor envelopes were rebound to the new source digest but left
disabled, so every release `auto` request fails closed to the existing exact
dynamic/reference path. Explicit `algorithm="native"` and the documented
development-policy override remain available for receipt collection, subject
to the ordinary capability, exactness, and resource checks.

This is not a declaration that the entire Magma/PARI performance program is
complete. Open competitor and cold-path gates remain visible below, and no
cross-architecture timing is treated as a direct speed comparison.

## Phase status

| Phase | Status | Accepted evidence and remaining work |
|---|---|---|
| 0 — exact baselines | PASS | The versioned corpora, resident Sage.js/Magma/PARI drivers, explicit unavailable cells, and exact result digests are checked in. |
| 1 — packed divisor ABI | PASS | Pinned fail-atomic `unpack_batch` validates and seals 1,000 canonical rows in 66.8/66.1 ms for genus 2/3, 25.1--25.3x faster than scalar reference ingress. Cached preparation is 24 microseconds. First authenticated ingress is real relation validation and is not relabelled as a no-op packing win. |
| 2 — public Cantor arithmetic | LINUX COMPETITOR PASS; PLATFORM REFRESH OPEN | On the pinned finite-field batch corpus, ordinary public add/double/scalar is 1.36--1.78x Magma in genus 2 and 0.73--1.03x in genus 3. Exact Sage.js/reference/Magma rows agree. The final-source four-platform digest refresh is still required before `auto` can be enabled. |
| 3 — scalar and Kummer arithmetic | PASS | Four-platform exact scalar/Kummer differentials pass. On Linux x64 the fixed Kummer batch is 19.1x faster end-to-end and 26.5x faster in arithmetic-only timing than the dynamic source; the accepted 256-bit finite-field Magma receipt is within 1.36x in genus 2 and faster in genus 3. |
| 4 — high-fan-out consumers | PASS WITH ARTIFACT-COLD CAVEAT | Genus-3 certification through `10^5` passes exactness, time, and memory under the documented 256 MiB V8 old-space envelope. Five separate process-cold rank-three maps after native-artifact publication take 0.532--0.563 s and pass the 0.8103 s gate. The first artifact-cold post-build sample took 1.224 s and remains an explicit miss. |
| 5 — local-factor materialization | PASS | Frozen-source packed and coefficient streams agree through `10^5` on all four hosts; bounded coefficient streaming avoids public polynomial materialization. Public polynomial construction remains separately visible rather than hidden in packed timings. |
| 6 — rational arithmetic | MIXED | The 1,024-by-32 many-prime workload is 1.42x faster than Magma. Growing-coefficient public addition is 1.97x Magma, but the small row is 7.81x and is an honest miss. Bounded-output non-torsion scalar rows pass at 1.664x for scalar 17/347-bit output and 0.407x for scalar 65/5,094-bit output. The separately labelled 256-bit 2-torsion row is 0.334x; it is not evidence about non-torsion `QQ` growth. The generalized `h != 0` row is a non-gating 2.181x. |
| 7 — genus-2 heights | MIXED | Accuracy-matched single-height and warm reuse gates pass, exact proof/cancellation/cache review passes, and the optimized object-cold paths improve by about 2x. Rank-2 remains 322--335 ms and the four-vector case 738--777 ms, above the 80/380 ms final targets. |
| 8 — periods and genus-3 heights | PASS | Genus-2/3 periods are within 2x PARI, the 12-point Abel--Jacobi batch beats separate Magma calls, and the genus-3 height is 7.29x faster than the exact historical path while preserving finite replay and refinement stability. Its `rigorous=false` label remains explicit. |
| 9 — analytic `L`-functions | OPEN — SOURCE-CURRENT REGRESSION | The pinned five-sample run timed out first at 300 seconds/8.9 GiB RSS and again at 600 seconds/17.0 GiB RSS. A one-sample diagnostic also timed out at 600 seconds/17.4 GiB RSS. No receipt was fabricated; the previous local pass is historical and no longer source-current. |
| 10 — auto selection and platforms | OPEN; FAIL-CLOSED | Historical four-platform evidence remains useful, but the final mathematical source digest changed. The current policy has six disabled candidates and zero enabled entries. A new exact native/dynamic/Wasm matrix plus failure/sanitizer verification is required before any entry is enabled. |

## Disabled candidate automatic-selection envelope

No automatic-selection entry is currently enabled. The six candidates below
retain their narrow intended envelopes but require the final four-platform
refresh before authorization. Both exact model fingerprints are restricted to
`GF(1009)`:

- genus 2:
  `9f6fd634246b344cc75da9f21f673dd3862236ae908cf4c2780d7a2e2a6da234`;
- genus 3:
  `4979edd07927163f5a5e528117cb1fc49f6e9eeca2971d0e60eec50e7cf63279`.

| Operation | Exact batch | Scalar bound | Resource bound |
|---|---:|---:|---:|
| add | 1,000 | 0 bits | 200,096 bytes |
| scalar | 64 | 256 bits | 11,360 bytes |
| progression | 1,000 | 0 bits | 72,224 bytes |

The policy does not authorize a neighboring prime, a different curve, a
smaller or larger batch, a broader model class, Kummer, Frobenius, group
structure, rational arithmetic, or height arithmetic. Those cells remain
exact fallbacks until a future source freeze supplies their own receipts.

## Durable release evidence

- four-platform human report:
  `bench/hyperelliptic/cross-platform/results/report-b1a05935.md`;
- raw primary and portable JSON receipts:
  `bench/hyperelliptic/cross-platform/results/*-b1a05935*.json`;
- normalized evidence and 24 receipt documents:
  `bench/hyperelliptic/cross-platform/results/policy-b1a05935/`;
- generated release allowlist:
  `architecture/hyperelliptic-auto-receipt-policy.json`.

The macOS timing remains descriptive shared-host evidence and records its
preflight load. Windows and macOS explicitly report the unsupported standalone
linker contracts rather than inventing ratios. Linux x64 is the only row used
for Magma/PARI comparisons, which remain in their separate equal-contract
receipts.

## Main-branch integration refresh

The candidate was merged with current `main` and re-frozen at
`6aaa460afe6615ce599193cc4fb93e603c473b3e`. The authenticated source-bundle
digest is now
`fcd9122e2b010345fd148f9bec7e7d562cd664ead132b4106351d819f8992e09`.
The mathematical implementation is unchanged from `b1a05935`; the bundle
change consists of current-main browser packaging integration plus the reviewed
eager-core compression ceilings required by the combined artifact.

Fresh dynamic/native and authenticated Wasm receipts were collected from the
exact integrated revision on Linux x64, Linux ARM64, macOS ARM64, and Windows
x64. Exact local-factor, Cantor, Kummer, and materialization digests agree
across all four hosts. The refreshed durable evidence is:

- four-platform report:
  `bench/hyperelliptic/cross-platform/results/report-6aaa460a.md`;
- raw primary and portable receipts:
  `bench/hyperelliptic/cross-platform/results/*-6aaa460a*.json`;
- normalized evidence and 24 receipt documents:
  `bench/hyperelliptic/cross-platform/results/policy-6aaa460a/`.

The earlier `b1a05935` evidence remains historical candidate evidence. The
generated release allowlist now authenticates only the integrated `6aaa460a`
bundle and retains the same six exact automatic-selection envelopes.

## Sage.js-owned WASI integration refresh

The candidate was refreshed once more after `main` replaced the former external
WASI build dependency with the Sage.js-owned toolchain and source mirror. The
final frozen source is
`b25ffdd128cb19d95c979133349fb205a40f26e4`, with framed source-bundle digest
`e927c2ffe5ea3ebaef37f9a8c4eaf7dd5f89239379e7effd0c4d057aca698c1e`.
The mathematical implementation remains unchanged from `b1a05935`.

The combined-tree WebAssembly ABI was reviewed independently. After
normalizing content-addressed module identifiers, it has no semantic export
removals; the additions are the intended Cantor, Kummer, genus-3 candidate,
rational-reduction, and height kernels. The normal fail-closed ABI check is
restored after that review. Two incoming test-only probes were also migrated
from sibling-toolchain paths to the authenticated Sage.js toolchain API, and
the repository-wide external-toolchain dependency audit passes.

Fresh exact native/dynamic receipts pass on Linux x64, Linux ARM64, macOS
ARM64, and Windows x64. The authenticated browser artifact has identity
`sha256:eeb42af4162e79ec92ad14264235d7e7f8cf6e7be5f06ca26503dbef63da0e35`
on every platform. Portable Cantor and Kummer digests agree on all four hosts;
Linux additionally passes the standalone comparison. ASAN, UBSAN, LSAN,
cache-corruption, bounded-output, cancellation, worker-recovery, package-load,
and source-bound evidence pass. The refreshed durable evidence is:

- four-platform report:
  `bench/hyperelliptic/cross-platform/results/report-b25ffdd1.md`;
- raw primary and portable receipts:
  `bench/hyperelliptic/cross-platform/results/*-b25ffdd1*.json`;
- normalized evidence and 24 receipt documents:
  `bench/hyperelliptic/cross-platform/results/policy-b25ffdd1/`.

The generated release allowlist authenticates only the `b25ffdd1` source
bundle and retains the same six exact automatic-selection envelopes. The
earlier `b1a05935` and `6aaa460a` receipts remain immutable historical evidence.

## Post-candidate priorities

1. Diagnose the source-current Phase-9 evaluation/RSS regression before
   attempting another acceptance run; do not raise timeouts or memory ceilings
   again without a named dominant stage.
2. Treat rational small-row public addition and genus-2 object-cold proof
   assembly as the two declared mathematical performance misses. Revisit their
   representation floors only after the live exact-workspace compiler slice is
   evaluated.
3. Refresh the final native/dynamic/Wasm matrix and enable only entries whose
   exact four-platform receipts authenticate the current framed source bundle.
