# Phase 6 resource, code-size, and build-time ledger refresh

This is a development ledger, not the final Phase 6 qualification ledger. It
refreshes what can be proved from current committed evidence, the hash-pinned
Phase-0 manifest, and the complete 16-row fresh-prepared correctness aggregate.
It deliberately leaves historical effort and resource totals `unknown` when no
authoritative cumulative record exists.

The machine-readable collector is
`bench/pari-class-group-port/phase6_resource_ledger_collect.cjs`; its independent
checker is `bench/pari-class-group-port/phase6_resource_ledger_check.cjs`.

## Reproducible receipt

```sh
node bench/pari-class-group-port/phase6_resource_ledger_collect.cjs \
  --phase0-manifest \
  /scratch/sagejs-runtime/pari-class-group-phase0-44807189a/qualification-manifest.json \
  --aggregate \
  /scratch/fresh-prepared-development-aggregate-v1-20260918.json \
  > /scratch/phase6-resource-ledger-20260918.json

node bench/pari-class-group-port/phase6_resource_ledger_check.cjs \
  /scratch/phase6-resource-ledger-20260918.json \
  /scratch/sagejs-runtime/pari-class-group-phase0-44807189a/qualification-manifest.json \
  /scratch/fresh-prepared-development-aggregate-v1-20260918.json
```

At commit `89a1b940c303bc68332532f1c2f2a96fbacd4267`, the generated ledger had
SHA-256
`60b500f7f01935c520c707d1c9e35be5a71fdf3b2e76253870e581c19fcbed28`.
The collector records the current commit and tree, so rerunning it after the
ledger files themselves are committed intentionally produces a new receipt.
The checker recomputes the complete JSON, checks the ledger's canonical hash,
and proves that one-byte-equivalent semantic mutations of either external
authority are rejected by their pinned file hashes.

## Evidence admitted

The external authorities are byte-pinned:

- Phase-0 manifest SHA-256:
  `8e0c44d0c480fe8580025f7e337b72fa7023d03a7dbb60f0ddf3aa7cf5a91a27`;
- fresh aggregate file SHA-256:
  `7c8b9ca9cf8db44a7a1860c0a702c3d6bceb73af2578a85b665d848f2604471e`;
- fresh aggregate canonical SHA-256:
  `8eb14e33dff10ea7c9e99e7c619d8b4cc43dc2cbf18c7bda1f10fe1523be041c`.

The collector also reads every named repository source from the selected Git
commit, not from mutable worktree bytes, and records its byte size and SHA-256.
This includes the plan, previous ledger/freeze audits, aggregate and Phase-6
readiness audits, arena evidence, high-precision build evidence, and checked
region source/object evidence.

The 16-row aggregate authenticates rows
`0,1,3,4,6,8,10,11,13,14,16,18,19,20,21,23`, with complete internal PARI
correspondence. It is explicitly not qualified timing and, by construction,
contains no wall/CPU time, RSS, owner-live, generated-code, compile-time, or
allocation/copy telemetry. The collector checks that those fields have not
appeared in its row records. Therefore this correctness aggregate cannot be
used to manufacture a current resource claim.

## Historical metered build and artifact facts

The clean Phase-0 build remains the only complete build receipt admitted here:

| Item | Authoritative value | Qualification caveat |
| --- | ---: | --- |
| Normal-tier build attempt | 600.169 s | Timed out during stage 7/8. |
| Authorized stress-tier build | 624.570 s runner wall; 622.172 s receipt duration | Passed at the frozen Phase-0 commit; CPU time and build peak RSS were not recorded. |
| Bound output files | 573 files; 219,637,628 bytes | Complete build-receipt output bindings, not solely class-group code. |
| Bound native-kernel outputs | 45 files; 38,486,459 bytes | 41 `.cjs`, 3 `.json`, and 1 `.node`; these names must not be mislabeled as generated C or relocatable objects. |
| Phase-0 runtime stages | 25 serial stages; 1,814,264.003 ms runner wall | Elapsed wall, not CPU accounting. |
| Largest Phase-0 RSS sample | 2,259,124 KiB | One-second primary-process-group sample; detached compiler groups may be absent, so this is not whole-descendant peak RSS. |

Eight Phase-0 stage summaries record generated core-C observations from
7,601,972 through 66,609,866 bytes. Their arithmetic sum is 368,504,982 bytes,
but the ledger labels that sum `not unique`: equal cores across stages may be
the same artifact and must not be counted twice.

Focused committed evidence supplies artifact facts that the Phase-0 output
manifest does not:

- the high-precision packed probes record compiler builds of 23,963.557 ms and
  22,964.575 ms, generated cores of 5,563,198 and 5,569,766 bytes, and linked
  addons of 1,272,480 bytes;
- the checked-region G1/G2 evidence records generated cores around 6.3 MB,
  relocatable objects of 345,848--347,176 bytes, object text of
  211,250--212,853 bytes, and linked addons of 354,880 bytes;
- the guarded Stage-H evidence records the final 495 generated-core-byte,
  502 object-text-byte, and 4,096 linked-addon-byte deltas separately from the
  base artifact;
- the arena-reuse probe records a 58,295,392-byte generated core, but its
  849.295 ms `setupMilliseconds` is only setup time. It is not asserted to be
  compiler-only build time.

These are source- and receipt-bound historical cuts. They do not substitute for
a current final-candidate inventory.

## Logical owners are not process RSS

The refreshed schema keeps these as different namespaces:

| Metric | Value | Meaning |
| --- | ---: | --- |
| Diagnostic owner accounting | 271,240,904 bytes | Logical/capacity evidence from one arena-reuse prepared-attempt probe; not measured owner-live high water. |
| Reset snapshot accounting | 271,240,904 bytes | Snapshot capacity in the same probe; not additional proven simultaneous live use without a liveness receipt. |
| Arena capacity | 134,217,728 bytes | Explicit arena capacity in that probe. |
| Historical process-group RSS sample | 2,259,124 KiB | Maximum sampled Phase-0 primary process group; not owner bytes and not a whole-process-tree maximum. |
| Current compiler-owner live high water | `unknown` | Requires current instrumentation. |
| Current whole-process/descendant peak RSS | `unknown` | Requires a metered current run. |
| Matched PARI peak RSS | `unknown` | Required before evaluating `max(512 MiB, 5 * PARI RSS)`. |

The 4-GiB hard address-space cap remains binding. No historical number above
establishes the separate practical RSS sentinel or a current owner-live target.

## Budget accounting

The plan ceilings remain 224 aggregate active-agent hours, 240 local
build/validation CPU-hours, 48 controlled timing-host CPU-hours, optional 24
high-memory CPU-hours, 100 GiB of project scratch, and 512 MiB of committed or
archived evidence. Current authoritative evidence does **not** provide a
cumulative denominator for any of these. All six consumption/high-water fields
therefore remain `unknown`.

In particular, stage wall time is not converted to CPU-hours; subscription
availability is not converted to agent-hours; a present-day disk scan is not a
historical scratch high-water; and absence of a high-memory receipt is not
recorded as zero use.

## What final qualification must add

This refresh closes the ledger format and historical evidence inventory, but it
does not close deliverable 7 of the plan. The final quiet-host campaign must
add, at one clean candidate commit:

1. a toolchain-bound build receipt with wall time, CPU time, and descendant
   peak RSS;
2. a unique inventory of generated source, relocatable objects, text, and
   linked modules, including hashes and byte sizes;
3. resource telemetry for all 24 frozen fields under the normal
   600-second/4-GiB/no-swap envelope;
4. compiler-owner logical/live high water separately from whole-process and
   descendant-tree RSS;
5. owner/allocation/copy counts, logical/physical capacities, arena high water,
   precision/retry counts, and exact work counters;
6. matched PARI peak RSS and the resulting practical sentinel evaluation;
7. qualified pinned-core raw pairs plus timing-host CPU accounting; and
8. complete archived-evidence and project-scratch inventories against their
   caps.

Until those measurements exist, the honest result is a machine-checkable
historical/development ledger with an explicit current-candidate unknown list,
not a passing Phase-6 resource qualification.
