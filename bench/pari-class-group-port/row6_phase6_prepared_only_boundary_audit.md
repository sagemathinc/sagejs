# Row 6 prepared-only boundary audit

This lane narrows the public input of the connected row-6 correctness root to
one authenticated prepared-number-field envelope.  In particular,
`factorOwner` and `initialOwner` are no longer arguments to either the Gate-C
host or the whole class-and-unit host.  Serialized factor-base and relation
owners remain useful as external differential oracles, but they cannot seed a
correctness run.

The storage contract is
[`row6_phase6_whole_prepared_layout.cjs`](row6_phase6_whole_prepared_layout.cjs).
It declares theorem/policy maxima, append, ancestry, and integer-word ceilings.
The factor-base ceiling is the pre-existing 2,048-ideal corridor limit.  The
relation target and cache ceilings follow `init_rel`'s cubic formulas
`KC + 5 + unit_rank` and `10 * target + 50`; they are not the row-6 answers.
The append allocations intentionally use one eight-column policy ceiling for
both checkpoints, rather than encoding the observed `3`-column then `1`-column
answer.  Integer-buffer widths are selected from the manifest and are never
computed by inspecting an owner or a preceding stage's output.

The envelope and its nested `data` object are exact-key allowlisted, then the
prepared mathematical content is independently authenticated.  Unknown nested
owner/control fields and a forged envelope authority are rejected.

At the native boundary, the host initializes all factor, initial-relation,
collector-state, and HNF storage to zero.  Only the authenticated prepared
number-field data needed to start the computation is copied into buffers.  The
connected native root then:

1. computes the factor base and initial relations;
2. initializes relation-search state from the live `initial_count` and live
   factor state;
3. supplies `initial_relation_state[0]` and `factor_root_state[7]` as the
   logical HNF column count and `k0`; and
4. derives packet tables, prime offsets, generators, permutations, subsequent
   relation counts, append dimensions, reverse-HNF ancestry dimensions, and
   terminal class/unit scalar manifests in the same native invocation.

The former host-provided `expect_large` unit flag has been removed entirely.
The unit path now publishes only the status and dimensions it actually
computed; any `not_given(PRECI)`/`LARGE` interpretation belongs to the
post-run oracle, not to computational admission.

The compiler ABI now expresses the exact workspaces inside one lexical
`NativeWorkspaceArena`.  The root derives HNF and append lengths from its live,
authenticated factor/relation states, checks the 16-row and eight-new-column
policy ceilings, and charges every packed allocation against a fixed
3,000,000,000-byte arena budget.  Scratch with disjoint phase lifetimes is
reused between append checkpoints; only compact terminal-facing H, B, C and
ancestry outputs cross the arena boundary.  Arena children cannot escape the
native root.

Each live `new_columns = columns - current_total` batch is rejected unless it
lies in `[1, 8]` immediately after derivation and before either checkpoint can
copy relations, form an integer-buffer view, or enter `hnfadd`.  Thus the
eight-column allocation ceiling is also an enforced indexing/call boundary,
not merely an accounting assumption.

Every remaining owner family has a separate fail-closed budget:

| owner family | enforced ceiling (bytes) |
| --- | ---: |
| authenticated prepared prefix | 625,000,000 |
| external Gate coordination/results | 300,000,000 |
| native workspace arena | 3,000,000,000 |
| terminal outputs/workspace | 50,000,000 |
| **explicit-owner ceiling** | **3,975,000,000** |

This is 319,967,296 bytes below 4 GiB.  That margin belongs to the addon and
runtime; the table is an explicit-owner bound, not an RSS promise.  The host
remains explicitly fail-closed with
`SAGEJS_ROW6_MAX_STORAGE_PLAN_REQUIRED` while the new generated graph awaits a
fresh compile review, so this source-cleanup step cannot execute the
mathematical root.

As a non-authoritative differential accounting check, substituting the
already observed live row-6 dimensions (1,130 factor rows, 1,133 initial
columns, initial B-width 1,124, target 1,137) gives:

| live family | bytes |
| --- | ---: |
| prepared prefix | 600,236,372 |
| external Gate owners | 161,395,072 |
| initial-HNF arena owners | 1,846,386,376 |
| ancestry arena owners | 7,047,568 |
| both append worksets after reuse | 20,701,296 |
| terminal external owners | 2,656,700 |
| **projected explicit peak** | **2,638,423,384 (2.4572 GiB)** |

The arena reaches 1,853,433,944 bytes after initial-HNF plus ancestry storage
and 1,874,135,240 bytes after append storage.  Reusing same-name append scratch
between the two sequential checkpoints saves 10,568,184 bytes.  These observed
dimensions are an oracle for accounting only: they do not select any storage
length or capacity in the host.

The frozen source-only arena graph has generated Gate SHA-256
`7724317bf2585ea8a4a81d55b8c633c3cb718ab931fd816e8705a56d8939904f`
and generated whole-root SHA-256
`3c426a7e0cc92fce11ac6c0d512768bb74926cf3201f124f5627d5dd6b948e4c`.
Both files match their generators byte-for-byte.  These are source identities,
not compiled-cache or execution receipts.
Immediately before arena integration, a compile-only check of the corrected
live-stride Gate root completed successfully.  This is retained as historical
compiler evidence, not as a build of the current arena graph.  Evidence was
inspected at `2026-09-18T19:56:09.495Z`:

| artifact | SHA-256 | bytes | mtime (UTC) |
| --- | --- | ---: | --- |
| root source | `df105eebe76157c9c4f5be0c57a37c2e28c0ec275e3b76f27b9f97919c799636` | 44,833 | `2026-09-18T19:26:45.874Z` |
| manifest | `3c7bc11a2ca22a8b7dfe8dc5dc98d3919a4a007bdc55f2c3851f23372b4e3355` | 106,097,739 | `2026-09-18T19:51:05.256Z` |
| addon | `2d51d88c23c4153bcb43bfe962f37a7023c90bdb93281f0dbb961c6abf1c1658` | 13,732,608 | `2026-09-18T19:55:59.010Z` |
| generated core | `9c5d0ac333d4d31f96aad177818e2ac68430f80e748b92dcc9dc115cf7cf24d1` | 89,555,906 | `2026-09-18T19:51:04.013Z` |
| generated adapter | `f5a88916fc1fb86caad810540c0d4793df972d57fc003de6f4abfaed3cbc45e4` | 3,199,217 | `2026-09-18T19:51:03.959Z` |
| generated JS module | `386906da83cc5bb6032cf378d9238e0c2f2939f50a2e167d618b6d16ff90ce04` | 11,445,639 | `2026-09-18T19:51:04.384Z` |

The cache key is
`bab1f0c77108284f7da92b340ab3e3530e81c053cd29fa88dab7b08b6b2dd6ee`,
the module identity is `bab1f0c77108284f`, and the manifest records native ABI
24 with no foreign inputs.  Its 128-entry native-source dependency list has
canonical `(module, path, sha256)` digest
`e50745d16e0c22d757b9cde138d34942fb03f13f0ccdf3aa2865194821068e74`.
All 128 current files rehashed to their manifest values (zero mismatches); the
dependency mtimes span `2026-09-16T21:58:37.682Z` through
`2026-09-18T19:39:50.645Z`.  In particular, the corrected row-6 ancestry
dependency has SHA-256
`22b6ac090d23b8dd73e0caff48d2f118c0277ea4686902b90f2befc405b250f8`
and mtime `2026-09-18T19:39:50.645Z`.

This proved that the pre-arena compiler accepted the corrected
dimension-driven buffer views and reverse-ancestry graph.  It is not an
execution receipt and does not authenticate the current arena source: the
compile-only command did not call `prepare`, invoke the addon, construct
owners, or execute the mathematical root.

For comparison, the superseded all-host conservative byte ledger (using each
owner's old maximum declared capacity) was:

| family | bytes | GiB |
| --- | ---: | ---: |
| initial relations | 558,376,800 | 0.5200 |
| initial HNF | 5,764,021,736 | 5.3682 |
| each HNF-add | 3,389,107,636 | 3.1564 |
| both retained HNF-adds | 6,778,215,272 | 6.3127 |
| ancestry | 1,119,202,188 | 1.0423 |
| large-owner subtotal | 14,219,815,996 | 13.2432 |

The largest over-conservative objects are initial-HNF `transform`,
`hnf_transform`, and `lam` (557,439,300 bytes each); initial `full_h`,
`full_dep`, and `work_b` (555,540,480 each); each append's `result_b`
(1,107,296,256), `permuted_b`, `work_b`, `result_h`, and `result_dep`
(553,648,128 each); and ancestry `trailing_work` (1,090,519,040).
This is deliberately a **large-owner subtotal**, not a total process-size
claim: roughly 360 additional small factor, collector, terminal, state, and
adapter buffers plus addon/runtime overhead are excluded.  Initial
pre-rank/sparse/CUP scratch dies after the initial HNF.  Append
assembly/rank/HNF scratch can be reused between checkpoints.  Ancestry scratch
begins only after collection and both appends.  Cleanup transforms, trailing
matrices, final transforms, full H/dep, diagonals, result matrices, states and
permutations for retained checkpoints remain live until reverse ancestry.

The specialized correctness checks still compare every existing live output
digest, class invariant, unit state, and class witness against the established
oracles.  They also reject a second positional input, forged authority, and
top-level or nested owner/control fields.  The fast static regression test
verifies the one-argument API, manifest immutability, source freshness,
non-answer append ceilings, absence of obsolete ABI inputs, and a full scan of
the computation sources for the retired row-6 trajectory dimensions.

This remains correctness-only evidence.  `timingEligible` stays false, and no
performance ratio is authorized by this boundary change.
