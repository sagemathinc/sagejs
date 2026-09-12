# Direct-value residue token review

2026-09-12 UTC, bounded source-only follow-up (under five active minutes).
No builds, runtime tests, benchmarks, CAS, SSH, or tracked edits were performed.
The previous safety and resource reviews are preserved unchanged.

## Reviewed snapshot

Worktree:
`/home/user/sagejs-worktrees/class-unit-rank-two-frontier-worktrees/finite-field-canonical-domain`.
Observed HEAD: `38ccf7ac892b86cb721c4b68d2881d4dea8b25ac`.
The following file hashes, rather than HEAD alone, bind this review:

| File | SHA-256 |
| --- | --- |
| `src/baselib/containers.py` | `8fbfc7ada31c057c6f265440f8f5afbb78b72e34ab65fddc423f982968b2c2f7` |
| `src/baselib/finite_fields.py` | `4674b2d15ebb7e857c1f8f702cc6a1334270086883143578c532ec4eb8693dd1` |
| `test/dict-canonical-domain.cjs` | `bfff5170fd07aae89fce44e4d49c13d262344748136432251fa9f256c30f1fb7` |
| `test/finite-field-canonical-domain.cjs` | `661038c8c24314e15ad25b41c1c618b9535f1d7bffbbe9ec69ce6330603ed720` |

## Verdict

No blocking semantic flaw found in the direct-BigInt-token delta under the
previously reviewed private first-party provider contract. This is source
approval of the narrow representation change, not execution qualification or
a formal proof.

The exact-residue provider retains all existing admission, physical freezing,
descriptor, dispatch, and sticky-invalidation guards. It converts the validated
safe Number or BigInt residue to native BigInt and places that value directly
in `descriptor.token`. The parent-identity domain remains private and frozen.
The per-domain token Map and per-residue opaque token allocation are removed.

Native Map BigInt keys compare by exact value. Within a verified same-parent
domain this is the required equality relation, including zero and equivalent
safe Number/BigInt representations. Globally disjoint token objects are not
required by `_dict_resolve_key`:

- The primitive fast-hit condition inspects original keys, not the token's
  primitive type. It therefore does not mistake a residue/primitive collision
  for two primitive originals.
- Same-domain token hits and misses use verified homogeneous metadata. Foreign
  domains do not inherit that authority merely by sharing a BigInt value.
- Mixed or foreign occupied-token hits compare retained originals, with a
  separately guarded same-domain check where applicable; otherwise they use
  generic equality and the remaining-key scan.
- Unequal occupied-token collisions obtain another storage identity. Later
  lookups scan retained originals and find that entry; equal replacement keeps
  the original key and its insertion position.
- Provider invalidation declines probing and invalidates canonical metadata,
  so previously stored BigInt tokens do not bypass the generic equality path.

The storage implementation itself is unchanged in this delta; its provider
docstring now accurately allows stable native values as well as identities.

## Added test coverage inspected, not executed

The production test exercises a native integer and residues from `GF(101)`,
`Zmod(101)`, and `GF(103)` across rotations and reversals, using a linear
original-key equality oracle. It checks retained key identities, values, and
misses, then checks invalidation on a mixed dictionary. The generic provider
test uses a BigInt above 2^53, ensuring a real collision with primitive
normalization, and covers both unequal and equal cross-domain cases, multiple
insertion orders, retained order/identity, and replacement.

The no-retention test checks 2,048 distinct misses, an unchanged empty public
`_dict_keys` cache, a one-entry dictionary, and a private domain whose only own
property is `parent`. Together with the source inspection showing no other
new per-value store, this targets the specific retained-token problem. It is
not a managed-heap or allocation benchmark: temporary probe records, BigInt
conversions, descriptor reflection, and per-dictionary metadata still cost
resources. The legacy public token hook remains available and can still
populate its pre-existing cache when called directly.

## Qualification boundary

The coordinator reported that the earlier opaque-token implementation passed
22 tests and the unchanged algebra gate in 3.787 seconds. Those results belong
to that earlier source and are not transferred to these hashes. The current
value-token build and runtime tests were still pending when this review was
requested. Exact-source runtime, generated-resource, startup, and integration
qualification remain the coordinator's gates. No allowance change is approved
by this addendum.
