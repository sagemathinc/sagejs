# Independent canonical-dictionary resource review

Reviewed 2026-09-12 UTC; bounded read-only source/resource review. No builds,
benchmarks, CAS execution, SSH/opt traffic, tracked edits, or allowance edits
were performed by this reviewer. Reading/hashing existing files and computing
source byte totals are not runtime qualification. Prior evidence is preserved.

## Scope and exact snapshot

Candidate worktree:
`/home/user/sagejs-worktrees/class-unit-rank-two-frontier-worktrees/finite-field-canonical-domain`.

Common base: `0c2945e1de400b0ee66150ae523491f7c712ce0a`.
Candidate HEAD: `4f121742d8f46f919f1bd71fcf9f6e2787da16dc`, with the
uncommitted positional-import bootstrap correction in the provider. The
coordinator is building this worktree concurrently. These hashes, not HEAD
alone, identify the reviewed source:

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `src/baselib/containers.py` | 75,474 | `9e0892bd9115231b87ce46329dee1cebcf2f00bb60cb818747fb9070062bf243` |
| `src/baselib/finite_fields.py` | 93,139 | `8a8b8af1cffd0ce383def8fcd114c033e43e6c71f3095770ee6940c5fc7c47d8` |
| `architecture/package-graph.json` | unchanged policy | `e7498ef824ccb6544860c1f10bb56f63cf40351036c0d12c95e65cf4e7e64def` |

Read both candidate design documents, the prior independent provider-safety
review, the coordinator's in-progress resource review, the source diffs, the
package byte-counting policy, and the available build resource receipt. This
is a resource delta review, not another mathematical or complete protocol audit.

## Verified source accounting

Recomputed ownership totals from the manifest's exact Python/TypeScript file
lists using the checker’s UTF-8/LF normalization. Both reviewed packages have
empty prefix lists, so there is no prefix-owned source omitted here.

| Package | Base bytes | Candidate bytes | Growth | Existing allowance | Result |
| --- | ---: | ---: | ---: | ---: | --- |
| `core-runtime` | 900,094 | 907,726 | 7,632 | 903,000 | exceeds by 4,726 |
| `arithmetic` | 805,513 | 813,072 | 7,559 | 820,000 | fits by 6,928 |

The provider's earlier recorded 813,069 arithmetic bytes precede the equivalent
positional-import correction; the current total is 813,072. The original
pre-format storage total 907,365 is likewise historical, not the current total.
Combined source growth is 15,191 bytes. The core growth is about 0.85% of its
base source. These are actual source costs, not generated-code measurements.

## Duplication and structure

There is no substantial repeated storage algorithm that can simply be removed
to recover the 4,726-byte core overage while preserving the current design.
The core addition already centralizes provider probing, private metadata,
domain comparison, resolved insertion, and post-deletion updates. Constructors,
literals, update, setdefault, and ordinary assignment use those shared paths.
The direct primitive-only insertion path is a deliberate hot path, not a
second independent canonical implementation; removing it merely for source
size would require new performance evidence.

The descriptor-witness setup in the provider repeats a small tuple-append
pattern that could have a readable helper. This is in the arithmetic package,
which already fits its limit; it does not resolve the core overage. Repeated
`probe is not None and probe is not False` checks are also small and sometimes
participate in type narrowing. Neither is a reason to minify the source,
remove safety checks, or move implementation into an unrelated package.

The private storage machinery belongs in core containers, and the residue
admission proof belongs with the exact-residue implementation. The change
does not introduce hidden native mathematical code, an extra native kernel
family, or a new public hashing framework. Those are favorable ownership
properties, but do not establish startup or memory neutrality.

## Resource risks that need actual evidence

1. Every dictionary now owns an additional private metadata record through a
   WeakMap, including primitive-only dictionaries used by the compiler and
   namespaces. Copy duplicates this record; clear resets it. The WeakMap avoids
   retaining dead dictionary objects, but does not make the per-live-dictionary
   cost zero. Measure a representative many-small-dictionaries workload and
   startup/build peak memory, not only one large modular-key dictionary.

2. Provider probing allocates a result record and the storage layer allocates a
   provider/descriptor pair. Raw descriptor reflection also returns temporary
   descriptors. The normal read path validates both metadata and the fresh
   query; an insertion into an already canonical table can traverse the
   provider-validity witnesses five times through probe, resolver, and store.
   These are fixed-size guard walks, not table-size scans. Do not remove them
   without proving that no intervening equality/user dispatch can invalidate
   the captured premise. Operation-count tests showing zero retained-key scans
   do not measure this allocation/dispatch overhead.

3. The reviewed provider interns one opaque object per distinct queried
   residue in a parent-local append-only `Map`, including unsuccessful lookups.
   `GF` and `Zmod` retain parents in `_prime_fields` / `_residue_rings`
   (`finite_fields.py:2016`, `:2018`, and the factories). Consequently,
   clearing or dropping a dictionary does not free those tokens. Growth is
   proportional to distinct queried values, not current dictionary entries.
   For ordinary reduced values it is at most the modulus per retained parent,
   but that is not a useful resource bound for arbitrary-precision moduli.

   This asymptotic retention already existed in the public
   `FiniteFieldElement.__sagejs_dict_key__` / `parent._dict_keys` path
   (`finite_fields.py:369`). The new recognized canonical path bypasses that
   old normalizer, so it does **not** automatically create both tokens for every
   lookup. Nevertheless, public hook calls or other fallback users can populate
   the old cache as well, and the new private cache cannot be cleared through
   the old public attribute. Report this distinction instead of calling the
   new WeakMap an unconditional memory improvement.

### Small resource simplification identified with the coordinator

The residue provider can potentially use the already normalized native BigInt
value as its token, retaining only the private parent-identity domain and guard.
That removes per-value interning, rather than merely formatting it differently.
The current storage resolver does not require globally disjoint or object-valued
tokens:

- A direct occupied-token hit is accepted without generic equality only for
  identical originals, two primitive originals, or a verified matching domain.
- A foreign-domain or primitive/canonical collision compares retained originals
  and, if necessary, scans the remaining entries. Unequal collisions receive a
  separate key identity; they do not overwrite the existing value.
- The no-scan negative shortcut is confined to homogeneous, matching-domain
  storage. Within one exact-residue domain, normalized BigInt equality is the
  required equality invariant. Zero is accepted by the descriptor checks.

Thus I find no source-level need for opaque **per-value objects** in this
particular provider. Private domain authority remains necessary; this is not
permission to trust the mutable public parent cache or arbitrary user hooks.
Before adopting it, test collisions among a native integer, `GF(p)(n)`,
`Zmod(p)(n)`, and another modulus, in both insertion orders, with equal
replacement preserving the original key, unequal same-token keys coexisting,
mixed hits/misses, and invalidation. Retain the safe-Number/BigInt equivalence
tests. This review does not assert that an unimplemented alternative passes.

Do not evict existing opaque tokens while dictionaries may still retain them:
recreating a different token could invalidate a homogeneous negative shortcut.
Direct value tokens avoid that lifecycle problem without adding an eviction
framework. This simplification would reduce the arithmetic provider’s source
and retained allocations, but does not itself solve the core source overage.

## Existing receipts: precise limits

`build/general-frontier/dict-canonical-build-v2.resource.json`, SHA-256
`c9ebb7e232ad701afeefc6466dc5cb1157876d17746a53af8e38af135c9081ab`,
records a **failed** `pnpm build`: exit 1, elapsed 39.1506 s, child CPU
41.530915 user / 2.480962 system seconds, maximum child RSS 811,868,160 bytes.
This is the old declaration-phase keyword-import bootstrap failure. It is
neither successful-build cost nor peak concurrent process-tree memory. The
wrapper explicitly records allocation count as unavailable and timing as
uncontrolled. Its receipt does not itself embed source hashes, so associate it
with the retained log/source artifact rather than assigning it to a later tree.

The v3 build log observed during this review has completed two compiler
fixed-point passes (29.344 + 51.421 s) and reached precompilation, but the full
build is still in progress. No complete current-source resource/qualification
receipt was available at the observation boundary. Existing intermediate files
were read only, not executed:

| Intermediate file | Bytes | SHA-256 |
| --- | ---: | --- |
| `dist/compiler/baselib-plain-pretty.js` | 13,569,213 | `719b6123355103e6942cf2712ccc79277ee74f0e64f7ff782821d42b15722993` |
| `dist/compiler/compiler.js` | 4,003,319 | `487c64eaf9bafb7d177e4c469c95760f8cca8d1c6881b2c20f69bdb970de1ee4` |

Both intermediate mtimes were 2026-09-12 10:22:36 UTC. These are candidate
snapshots, not a baseline/candidate generated-byte delta, not a source-bound
complete build receipt, and not runtime qualification. Later source changes or
completed artifacts require a new recorded boundary.

## Allowance recommendation and minimum evidence

A separately reviewed, source-only core allowance of **910,000 bytes** would
be proportionate **if** the exact final implementation passes the following
gates. Against this reviewed snapshot, it adds 7,000 bytes to the allowance
(about 0.78%) and leaves 2,274 bytes of headroom. It does not pretend that
15,191 combined source bytes disappeared. There is no justification here for
raising the arithmetic allowance, runtime memory limits, startup limits,
algebra timeout, mathematical bounds, verifier limits, or frozen-run budgets.

Required before a merge-readiness or resource-acceptance claim:

1. Freeze final source, manifest, compiler and build-receipt identities. Record
   the source delta against the named base and retain all failed attempts. If
   the token representation changes, rerun the relevant exact-source tests.
2. Produce a complete current-source build and compare generated code at the
   same boundary against the base: attributable containers/provider output,
   bootstrap baselib, compiler/runtime artifacts and relevant packaged size.
   Explain significant multiplicative growth; do not compare a partial or
   stale build with a complete one. Identify unavailable native-object metrics
   as not applicable rather than inventing new kernels to measure.
3. Record baseline/candidate build CPU/elapsed time and memory with identical
   settings. Distinguish maximum child RSS from aggregate concurrent RSS/cgroup
   high water. Include managed-heap or allocation counts if available; mark
   unavailable measurements honestly.
4. Run the existing unchanged startup and 60-second algebra gates, primitive
   dictionary controls, exact provider/protocol/mutation regressions, and
   operation-count evidence at increasing sizes. Timing evidence must cover
   successful and unsuccessful modular lookups as well as ordinary primitive
   dictionaries. A source-regex test or a synthetic provider is insufficient.
5. Examine retained memory for repeated distinct misses and dictionary churn.
   If direct BigInt tokens are adopted, demonstrate removal of private
   per-value retention and collision safety. If opaque interning remains,
   explicitly accept or correct its measured lifetime cost; a source allowance
   increase does not resolve a memory issue.
6. Carry out the normal relevant platform/integration gates, including Windows
   support and browser/runtime regressions where the shared containers are
   used. This review did not run or certify any of those gates.

Conclusion: the core source overage is a real, reasonably sized cost of shared
semantics, not obvious bulk duplication. A modest separately reviewed source
allowance is defensible after generated/resource/runtime evidence; it is not
approved merely because a refreshed manifest would pass. The direct-value
token alternative is a concrete small resource improvement worth considering
before final qualification. No successful runtime qualification or class/unit
performance result is claimed by this note.
