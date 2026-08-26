# Hyperelliptic release-candidate scorecard

This scorecard applies the literal exit criteria in
`agents/hyperelliptic-magma-pari-performance-plan.md` to the final exact
cross-platform mathematical receipt source
`c562298260be498bfb2b0c61872b0d3ac9c06062`. Its framed source-bundle digest
is `99925c8c76de72991f7cad590ebb78ade21314c3982490c7a53bb6f3782d370d`.
The combined-tree assembly through `a7202ee0` adds release evidence,
documentation, and analytic failure-receipt persistence outside that framed
hyperelliptic source bundle.

## Release decision

**Defensible combined-source release candidate, with narrow automatic
selection.** The final source-current four-platform matrix passes at
`c5622982`, and the checked-in release policy verifies 12 normalized receipts.
It enables three branch-covered Cantor domains—add, 256-bit scalar batch, and
progression—across odd-prime, odd-degree one-infinity genus-2/3 models with
`h = 0` or `h != 0`, primes 5 through 65521, and only the recorded resource
bounds. Every unmatched model, prime, operation, platform, or workload
continues to fail closed to the existing exact dynamic/reference path.
Explicit `algorithm="native"` remains available for future receipt collection,
subject to ordinary capability, exactness, and resource checks.

This is not a declaration that the entire Magma/PARI performance program is
complete. Open competitor and cold-path gates remain visible below, and no
cross-architecture timing is treated as a direct speed comparison.

## Phase status

| Phase | Status | Accepted evidence and remaining work |
|---|---|---|
| 0 — exact baselines | PASS | The versioned corpora, resident Sage.js/Magma/PARI drivers, explicit unavailable cells, and exact result digests are checked in. |
| 1 — packed divisor ABI | PASS | Pinned fail-atomic `unpack_batch` validates and seals 1,000 canonical rows in 66.8/66.1 ms for genus 2/3, 25.1--25.3x faster than scalar reference ingress. Cached preparation is 24 microseconds. First authenticated ingress is real relation validation and is not relabelled as a no-op packing win. |
| 2 — public Cantor arithmetic | PASS | On the pinned finite-field batch corpus, ordinary public add/double/scalar is 1.36--1.78x Magma in genus 2 and 0.73--1.03x in genus 3. Exact Sage.js/reference/Magma rows agree, and the final four-platform dynamic/native/Wasm digest refresh passes. |
| 3 — scalar and Kummer arithmetic | PASS | Four-platform exact scalar/Kummer differentials pass. On Linux x64 the fixed Kummer batch is 19.1x faster end-to-end and 26.5x faster in arithmetic-only timing than the dynamic source; the accepted 256-bit finite-field Magma receipt is within 1.36x in genus 2 and faster in genus 3. |
| 4 — high-fan-out consumers | PASS WITH ARTIFACT-COLD CAVEAT | Genus-3 certification through `10^5` passes exactness, time, and memory under the documented 256 MiB V8 old-space envelope. Five separate process-cold rank-three maps after native-artifact publication take 0.532--0.563 s and pass the 0.8103 s gate. The first artifact-cold post-build sample took 1.224 s and remains an explicit miss. |
| 5 — local-factor materialization | PASS | Frozen-source packed and coefficient streams agree through `10^5` on all four hosts; bounded coefficient streaming avoids public polynomial materialization. Public polynomial construction remains separately visible rather than hidden in packed timings. |
| 6 — rational arithmetic | MIXED | The 1,024-by-32 many-prime workload is 1.42x faster than Magma. Growing-coefficient public addition is 1.97x Magma, but the small row is 7.81x and is an honest miss. Bounded-output non-torsion scalar rows pass at 1.664x for scalar 17/347-bit output and 0.407x for scalar 65/5,094-bit output. The separately labelled 256-bit 2-torsion row is 0.334x; it is not evidence about non-torsion `QQ` growth. The generalized `h != 0` row is a non-gating 2.181x. |
| 7 — genus-2 heights | MIXED | Accuracy-matched single-height and warm reuse gates pass, exact proof/cancellation/cache review passes, and the optimized object-cold paths improve by about 2x. The first `NativeIntegerVector` evaluation preserves identical enclosures and improves the isolated dyadic recurrence by 6.3--7.8%, but only 0.2--2.0% end to end; no further representation machinery is justified there. Rank-2 remains 322--335 ms and the four-vector case 738--777 ms, above the 80/380 ms final targets. |
| 8 — periods and genus-3 heights | PASS | Genus-2/3 periods are within 2x PARI, the 12-point Abel--Jacobi batch beats separate Magma calls, and the genus-3 height is 7.29x faster than the exact historical path while preserving finite replay and refinement stability. Its `rigorous=false` label remains explicit. |
| 9 — analytic `L`-functions | OPEN — FORMAL ACCEPTANCE TIMEOUT | The source-current integration matrix passes exact coefficient-prefix extension, prepared-cache reuse and poisoning resistance, inverse-Mellin differentials, central derivatives, functional equations, twist parity, and sequential/two-worker equality. The quiet-host five-sample PARI-bracketed run reaches the analytic competitive stage but exhausts its 600-second Sage.js evaluator bound before producing the comparison matrix. The transactional `phase9-receipt-linux-x64.json` failure artifact is authoritative; the phase is not declared complete, and no ratio is inferred from the timeout. |
| 10 — auto selection and platforms | PASS, BRANCH-COVERED DOMAIN | Fresh native/dynamic receipts agree across Linux x64, Linux ARM64, macOS ARM64, and Windows x64 on 2,020 add rows, 148 scalar rows, and 2,160 progression rows. The policy verifies 12 receipts and enables three named-domain operations. Split even-degree models, extension fields, primes outside 5--65521, wider scalars, and larger workloads remain exact fallback. Prior ASAN/UBSAN/LSAN, cache-corruption, bounded-output, cancellation/recovery, and package-smoke evidence is reused only because the authenticated framed runtime source bundle is byte-identical, with that carry-forward recorded explicitly. |

## Enabled branch-covered automatic-selection envelope

Three automatic-selection entries are enabled from the final four-platform
domain receipts. Each covers genus 2 and 3 over odd prime fields, odd-degree
one-infinity models, and both `h = 0` and `h != 0`.

| Operation | Prime interval | Batch interval | Scalar bound | Resource bound |
|---|---:|---:|---:|---:|
| add | 5--65,521 | 1--1,000 | 0 bits | 200,096 bytes |
| scalar | 5--65,521 | 1--64 | 256 bits | 11,360 bytes |
| progression | 5--65,521 | 1--1,000 | 0 bits | 72,224 bytes |

The policy does not authorize split even-degree models, extension fields,
primes outside the recorded interval, larger batches, wider scalars, Kummer,
Frobenius, group structure, rational arithmetic, or height arithmetic. Those
cells remain exact fallbacks until a future source freeze supplies their own
receipts.

## Durable release evidence

- raw four-platform domain JSON receipts:
  `bench/hyperelliptic/cross-platform/results/*-c5622982-domain.json`;
- normalized evidence and 12 receipt documents:
  `bench/hyperelliptic/cross-platform/results/policy-c5622982/`;
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

## Final higher-genus source freeze

The final release-candidate evidence was recollected at
`a9d83f82261c3dc28fb8a79c2f161c57a9efc7cc`. The framed mathematical source
bundle is unchanged from `a680c04d` at
`36495206826f889109076b8f19702c1225ba2d7ff3ebfbd3a5c3e0aae89573e1`.
The intervening changes are benchmark orchestration, receipts, reports, and
reviewed ABI/policy metadata.

All four primary receipts have identical local-factor, Kummer, tiny-Jacobian,
Cantor add, 256-bit scalar, progression, and materialization digests. The
authenticated Wasm manifest is
`8cc40c709513c7e0a79f3497f8702cb3f665ce57559659303deed9396842488d`
on every host. Linux standalone boundaries remain within 1.058x of the raw
native core; Windows and macOS retain explicit unsupported linker-contract
cells. Bounded output, cancellation/recovery, package authentication, cache
corruption, ASAN, UBSAN, and LSAN evidence pass. The all-family package smoke
uses the test-only audited-count overlay `b36aab03` without moving the frozen
mathematical source.

The generated policy verifies 24 receipts and enables exactly six entries:
genus-2/genus-3 add, scalar, and progression on the stated `GF(1009)` model
fingerprints and exact workload envelopes. It does not authorize neighboring
primes, models, batch sizes, operations, rational arithmetic, heights,
Frobenius, or group structure.

After generating the allowlist, the release tree was republished once more so
the distributable contains both the enabled policy and the current generated
kernel inventory. That local assembly compiles 273 production Wasm functions
with zero unsupported functions, passes the direct, public Node-Wasm, and real
browser package tests, and has production artifact SHA-256
`54dde110748af0fd01a5f4564332b2853fcce858934f35fe7ea3743232b9cfce`.
This packaging hash does not replace the immutable four-platform receipt
artifact: the difference is the subsequently generated allowlist and coverage
metadata, not a change to the authenticated mathematical source bundle.

## Final combined-source freeze

The last exact cross-platform refresh is
`70513bba22f7895dfab72e5879f5a5f2ca7d6478`, with framed source-bundle digest
`99925c8c76de72991f7cad590ebb78ade21314c3982490c7a53bb6f3782d370d`.
All four hosts pass matching dynamic/native exact digests, authenticated Wasm
execution, bounded-output behavior, cancellation and worker recovery, and the
all-family package smoke. Linux x64 additionally passes cache-corruption and
ASAN/UBSAN/LSAN evidence. The split even-degree suite passes 8/8 on Linux x64,
Linux ARM64, macOS ARM64, and Windows x64, covering Sage vectors, cancellation,
generalized equations, exhaustive small group laws, genus-3 enumeration,
cross-parent rejection, and both public documentation examples.

The combined tree was then replayed through the complete 313-file integration
manifest. The canonical run passed batches 1--17 and exposed two stale
maximal-order instrumentation aliases in batch 18. The probes were moved to
their actual lazy owner modules; corrected batch 18 passed 65 tests with one
optional GP skip, and all remaining 97 files passed in the same bounded
stop-on-failure batches. The replay also exposed and fixed two real
class/unit integration regressions before the final run: exact cubic proof
projection now resumes its authenticated terminal, and one-prime relation
steering declines unit search instead of trapping degree-six completion. The
degree-six unconditional proof that previously ran for 51.5 minutes and ended
incomplete passes after the repair; the focused current-tree replay completes
in 17.3 seconds.

The current combined assembly also passes the seven-stage production build,
the architecture ratchets (440 FFI functions, 1,131 reviewed native
boundaries, and 1,007 Wasm capabilities), strict checking of 242 mathematical
modules with zero errors, all 73 unit files, all 62 portable files, and the
focused class/unit regressions. The generated reference documentation has 176
verified examples, two expected failures, four skips, and no failures or
unverified examples. After the final precompile, the FLINT-Wasm distribution
was republished: 273 production functions compile with zero unsupported
functions, all 13 reviewed ABI modules verify, and the current assembly artifact
has SHA-256
`fe707c2a0128d192fa3582a1cc208c68a68463d353972e1fd1921ff84e2e9e8e`.
This assembly hash is not substituted for the immutable four-platform artifact
identity in the release policy.

The release policy remains deliberately exact: six entries only, all bound to
the two `GF(1009)` model fingerprints and their fixed add, scalar, or
progression workloads. Later test, documentation, number-field, or packaging
commits do not authorize adjacent models or workloads by ancestry.

## Post-candidate priorities

1. Collect the formal source-current five-sample Phase-9 PARI-bracketed receipt
   on a quiet host. The integration mathematics is green, but it is not a
   substitute for the equal-contract competitor measurement.
2. Treat rational small-row public addition and genus-2 object-cold proof
   assembly as the two declared mathematical performance misses. Revisit their
   representation floors only after the live exact-workspace compiler slice is
   evaluated.
3. Add future automatic-selection cells only after their own exact
   four-platform receipts authenticate the then-current framed source bundle;
   do not widen the six frozen envelopes by inference.
