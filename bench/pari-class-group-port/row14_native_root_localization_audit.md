# Row-14 initial native-root localization

This is a read-only follow-up to `row14_relation_hnf_profile_audit.md`. It
localizes the initial collector and first-HNF native roots after Gate-C handle
and continuation-storage reuse. It does not change mathematical source, native
compiler code, the matched timing boundary, or any formal receipt. No authentic
computation was run for this audit.

## Evidence identity and method

The primary input is the latest authentic storage-reuse profile:

- path: `/tmp/row14-gate-c-storage-reuse-profile.json`
- SHA-256: `9a72f9d2b1fd841a1315b20d92337a14eed8480df2f9f0d1258b0d1447725876`
- schema: `sagejs.pari-class-group/row14-gate-c-storage-reuse-profile-v1`
- exact result digest:
  `1c669dd03269ef25e1c79e08c104f416062465380964515c6079902a96aacfef`

The comparison input is the corrected resident profile:

- path: `/tmp/row14-relation-hnf-profile-resident.json`
- SHA-256: `f9e7553cf68578433563558bc9cc8fcc0cc3a37e2da80a4796065fd9c20b841a`
- schema: `sagejs.pari-class-group/row14-relation-hnf-profile-v1`

Both profiles have the same exact result digest, final relation state
`[806,8110,0,0,806,806]`, and four authenticated checkpoint states. The newer
profile reports compilation outside the run and four resident handles.

The dynamic timing below is copied from the conserved native stage clocks in
the storage-reuse profile. Static localization then reads the two recorded
content-addressed manifests and generated isolated cores:

| root | cache key | manifest SHA-256 | `kernel_core.c` SHA-256 |
| --- | --- | --- | --- |
| collector | `4a7ac867a10b92012021636286f3457e11f68503e75f45baeff63b909faade1c` | `045f81a7686bd855ad20357b3671217c0d4e0845e8b40b0e0fab57d39a56befe` | `dbf84576b890bce7ff7b8bdeb254004f3877545efe3d05105eea7ec91ac2fc69` |
| `hnfspec` | `0431f38a5f631efa83a49aed3bbcde2186ca5ae4ad187987b4e8f5a95fd0aa89` | `88ce50a8c8795dd40aa62121f2a95cf78f464d977ecf203885e7f306d9bcd267` | `8c9dcd9659a3a490926a57adcf23b8172ac436cca1d126735ad3e5c12a5ce2bb` |

A standalone, read-only script split native function definitions in generated
C, followed manifest call-graph edges with per-root deduplication, and counted
lexical operation sites. Its artifacts are:

- `/scratch/row14-native-root-static-probe.mjs`, SHA-256
  `a65ea17666952c22209178592619820bbb07ca463eb93bdbfdae470f41bed505`
- `/scratch/row14-hnfspec-static-subroots.json`, SHA-256
  `e1f7327d75f77055c20674dc3cd3ca6358f57bf26779e38154e89eb8453d88d8`
- `/scratch/row14-collector-static-subroots.json`, SHA-256
  `765b4abadfe1acdb2e67e614724f7053d2dd225f6f16a12eb4e1dd1ac0355d46`

These are generated-code site counts, not dynamic execution counts or an
inclusive profiler. Shared callees are counted once inside each reported
subtree, and separate subtrees can overlap. The method is useful for locating
representation overhead but cannot assign time among callees by itself.

## Conserved native time

The initial collector and initial `hnfspec` roots total **19.061014514 s**,
67.73% of the profiled Gate-C clock and 66.75% of total elapsed time. This is
the native remainder after the two higher-confidence host campaigns; it does
not include the 5.442-second initial collector-owner construction or the
0.206-second initial HNF allocation.

| native stage | seconds | share of the two roots |
| --- | ---: | ---: |
| initial relation collector | 5.651747133 | 29.65% |
| initial sparse cleanup | 6.887526589 | 36.13% |
| initial `hnffinal` | 4.339976339 | 22.77% |
| initial assembly and log transform | 1.796518219 | 9.43% |
| initial relation log embeddings | 0.312857285 | 1.64% |
| initial CUP rank | 0.063637112 | 0.33% |
| entry, preflight, publication and return | 0.008751837 | 0.05% |

The root totals are 5.964629147 seconds for the collector and 13.096385367
seconds for `hnfspec`. They are stable against the corrected resident profile:
5.952392873 and 13.005802951 seconds respectively. Continuation arithmetic is
not the next target: the same storage-reuse profile charges all seven retry
collectors about 0.140 seconds and all three `hnfadd` roots about 0.119 seconds.

## Generated representation evidence

The manifest exposes no private specialization boundary. All 174 functions in
the collector graph and all 39 functions in the `hnfspec` graph are
`hostCallable`; both manifests have zero `privateFunctions` and zero automatic
selections. Consequently every independently decorated dependency retains its
general host-callable representation even when reached only behind a root that
has already validated the prepared transaction.

The strongest isolated first target is sparse cleanup:

| generated native subtree | functions | C lines | `mpz_*` calls | `mpz_set*` calls | mpz-index sites |
| --- | ---: | ---: | ---: | ---: | ---: |
| `pari_hnfspec_cleanup` | 7 | 7,824 | 1,216 | 610 | 121 |
| `pari_hnfspec_sparse_prefix` | 6 | 5,928 | 877 | 433 | 95 |
| sparse-prefix body only | 1 | 4,669 | 699 | 338 | 85 |
| `pari_hnffinal_nonempty` | 24 | 17,980 | 3,318 | 1,939 | 234 |
| `pari_hnflll` | 7 | 4,589 | 811 | 417 | 75 |

The sparse source deliberately stores its matrix, permutation, maxima, and
state in `Int64Buffer`, and it explicitly rejects dimensions outside the safe
binary64 boundary. Nevertheless ordinary Python `int` remains exact in the
source contract. The emitted sparse-prefix signature therefore receives
`rows`, `columns`, `k0`, and `c_rows` as `const mpz_t`; loop bounds and index
expressions stay exact-lowered throughout the hot body. This is visible without
assuming that every lexical site executes equally often.

The collector's relation-collection subtree is much larger: 164 functions,
102,557 native C lines, 17,147 `mpz_*` calls, 10,163 `mpz_set*` calls, and 909
mpz-index sites. Its direct body alone is not the cost center, and many of its
descendants perform genuine arbitrary-precision ideal, HNF, and real
arithmetic. A graph-wide machine-integer rewrite would therefore be both
poorly localized and semantically unjustified by this evidence.

Likewise, `hnffinal` legitimately operates on exact matrices. Its generated
site counts identify a later compiler-lifetime campaign, not permission to
replace its exact values with words. Sparse cleanup is different: it offers a
large measured clock, a word-backed input/control core, explicit range guards,
and a small seven-function boundary before the algorithm enters its exact
transform buffers.

## Proposed next compiler experiment

Add a **root-selected private dependency variant** for the sparse-cleanup call
graph, then propagate proven machine-sized control values after its checked
entry boundary.

The public host-callable functions and their exact Python `int` semantics must
remain available. Compilation of `pari_hnfspec_complete` should instead clone
private variants of `pari_hnfspec_cleanup`, `pari_hnfspec_sparse_prefix`,
`pari_hnfspec_count`, `pari_hnfspec_count2`, `pari_hnfspec_swap_words`,
`pari_hnfspec_swap_exact`, and `pari_hnfspec_word`. After the existing dimension,
capacity, permutation, and signed-word guards, the private variants may carry
dimensions, loop induction variables, indices, status values, and proven word
temporaries as `int64_t`/`size_t`. Exact `IntegerBuffer` contents and arithmetic
on `dense`, `transform`, `bottom`, `updated_dense`, and `extra` remain GMP.

This cut is intentionally narrower than specializing the collector or HNFLLL.
It directly covers the largest conserved leaf (6.8875 seconds), provides a
clear checked boundary, and tests the missing mechanism indicated by the
manifests: private variants beneath still-public decorated functions. Direct
unchecked buffer access is a separate capability and must only be enabled when
the compiler's complete affine range proof covers the access; scalar narrowing
alone must not silently remove bounds checks.

## Experiment gates

The compiler experiment is acceptable only if it passes all of these gates:

1. **Source and fallback:** the ordinary CPython-parseable mathematical files
   remain the sole algorithm and keep their dynamic fallback. No handwritten
   replacement C and no function-name dispatch are introduced.
2. **Boundary proof:** generated IR records the exact guards authorizing each
   private variant, and compilation fails closed if an unproved caller or
   arithmetic/index range enters the specialized graph.
3. **Public ABI:** existing host-callable roots retain their current exact ABI;
   specialized variants are private and cannot be invoked through the host.
4. **Differential correctness:** existing sparse-cleanup/HNF fixture suites
   agree across CPython, generated JavaScript, current GMP, and specialized
   native execution, including overflow, negative-index, malformed-shape, and
   partial-mutation failures.
5. **Authentic exactness:** only after static and differential gates pass, one
   capped row-14 run must reproduce result digest
   `1c669dd03269ef25e1c79e08c104f416062465380964515c6079902a96aacfef`,
   all four checkpoint states, terminal RNG identity, and resident ownership
   assertions.
6. **Inspectable output:** the manifest must report nonzero private variants;
   the sparse private signatures must expose narrowed control parameters, and
   the generated-code audit must show the expected removal of mpz control/index
   sites without removing exact buffer arithmetic.
7. **Performance:** compare the same conserved `sparse-cleanup` leaf clock over
   repeated alternating runs. Report the root and all sibling leaves so a
   regression is not hidden by boundary movement. Treat a single run only as a
   diagnostic, never a qualified timing claim.
8. **Portability and safety:** run sanitizer coverage and native Linux and
   Windows x64 tests. Preserve signed overflow rejection and platform-width
   semantics; do not make Unix-only pointer or integer assumptions.
9. **Architecture:** run `pnpm architecture:check` and the focused native
   compiler suites, with source provenance and inspectable IR/core C unchanged
   as public developer contracts.

Until that experiment passes, the evidence supports a compiler campaign, not
a claimed speedup. The current static probe demonstrates where general exact
lowering survives inside a word-bounded hot region; it does not predict how
much of the 6.8875-second leaf narrowing will remove.
