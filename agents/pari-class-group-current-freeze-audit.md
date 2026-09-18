# Current-candidate reproducibility/resource freeze audit

This audit is scoped to commit `e476f1f8fafb` or a descendant of it. It does
not claim a final candidate, qualified timing, or a clean current worktree. It
defines the smallest deterministic identity capture needed before a final
clean build and identifies the evidence that still cannot be reconstructed
from current committed artifacts.

## What is already frozen

- The Phase-0 qualification manifest is a strong, internally hash-bound freeze
  of commit `44807189a4eb8f8c58d9f46519ab9e60dde21a99`. It binds the Git tree,
  orchestration scripts, build receipt, compiler outputs, native objects,
  toolchain, stage outputs, source/owner identities, stage wall times, and
  sampled RSS.
- The aggregate resource ledger faithfully preserves the Phase-0 measurements
  and selected later owner receipts. It explicitly labels unknown CPU-hours,
  active-agent hours, archive usage, owner-live high-water, and matched PARI
  RSS instead of inferring them.
- The private PARI 2.17.4 archive, `buch2.c`, executable, and library identities
  are checked by several oracle adapters. Development-field identities and
  pristine-PARI terminal traces are separately frozen in the panel and
  default-driver manifests.
- Focused audit files retain many individual generated-C sizes/hashes, build
  CPU/RSS observations, immutable owner hashes, and PARI-to-Python source cuts.

These are historical or focused receipts. They are not a current-candidate
freeze.

## Exact stale or missing artifacts

1. **Current Git/toolchain freeze:** the complete manifest is still pinned to
   Phase 0. No committed manifest binds the current candidate's commit/tree to
   its Node, Python, C compiler, pnpm, PARI archive, `buch2.c`, `gp`, and
   `libpari` binaries.
2. **Consolidated source identity/map:** source correspondence is distributed
   among many audits. There is no one current manifest hashing the full
   experiment source set and compiler lowering set, nor one complete current
   `buch2.c` block/dependency map.
3. **Generated-code and binary inventory:** current generated C, object, text,
   and native-module sizes/hashes are not frozen. Ignored native-kernel caches
   cannot be reconstructed from Git and must be named explicitly after a clean
   build.
4. **Clean-build resource receipt:** current build wall time, CPU, descendant
   peak RSS, and output hashes are missing. They cannot be recovered honestly
   without a new metered clean build.
5. **Runtime resource high-water:** compiler-owner logical/live high-water,
   whole-process/descendant RSS, arena capacities, copies, and allocations are
   not consolidated for the current roots. The old ledger's Phase-0 samples do
   not close this gate.
6. **Current output identities:** fresh-prepared receipts and neutral terminal
   results have individual hashes, but there is no final single-commit output
   manifest covering the complete selected panel and negative controls.
7. **Budget/archive accounting:** aggregate active-agent hours, local CPU-hours,
   controlled-host CPU-hours, historical scratch high-water, and the complete
   committed/archived-evidence denominator remain unknown. A filesystem
   snapshot cannot retroactively prove these totals.
8. **Timing-host identity:** no quiet, pinned-core, fixed-governor final timing
   authority and matched PARI peak-RSS receipt exists. The development host is
   suitable for correctness and identity capture only.
9. **Final source map and unsupported frontier:** the completion audits still
   report that the consolidated PARI routine/block correspondence and precise
   unsupported-branch frontier are partial.

## Deterministic freezer

`bench/pari-class-group-port/freeze_reproducibility_state.cjs` is a read-only
identity collector. It:

- resolves and hashes an explicit committed Git tree rather than mutable files;
- records aggregate hashes, byte counts, file counts, and extension summaries
  for the experiment, compiler, and governing plan/audit source groups;
- hashes the current executable toolchain and pristine PARI 2.17.4 archive,
  source, executable, and shared library; and
- optionally hashes explicitly named clean-build artifact roots, without
  recursively scanning unrelated caches.

It includes no timestamp, hostname, duration, or mutable working-tree state, so
the same commit and installed toolchain produce byte-identical JSON. Example:

```sh
node bench/pari-class-group-port/freeze_reproducibility_state.cjs \
  --commit e476f1f8fafb \
  --pari-root /home/user/upstream/pari-2.17.4 \
  --pari-archive /home/user/upstream/pari-2.17.4.tar.gz \
  > /tmp/pari-class-group-current-freeze.json
sha256sum /tmp/pari-class-group-current-freeze.json
```

After the candidate is clean-built, repeat with one `--artifact-root` for each
deliberately retained output root. Do not point it at all of `/scratch` or a
shared cache. The resulting identity JSON should be committed alongside a
separate metered build/resource receipt and a final output manifest. Identity
capture alone must never be promoted to a performance or resource claim.

## Final-freeze sequence

1. Select one clean candidate commit and reject tracked or untracked source
   changes in the qualification checkout.
2. Run the freezer against that explicit commit and the pristine PARI 2.17.4
   installation.
3. Perform one clean metered build, recording wall/CPU time, descendant peak
   RSS, and generated C/object/text/module hashes and sizes.
4. Run the frozen correctness panel and mutation controls; publish one compact
   output-identity manifest.
5. Measure owner-live and process-RSS high-water separately and update the
   resource ledger without manufacturing unknown historical budget totals.
6. On a separately certified quiet host, bind core/governor/thread/library
   identities before any qualified paired timing.

This sequence closes reproducibility at the final commit while preserving the
important distinction between deterministic identity, correctness evidence,
resource accounting, and performance qualification.
