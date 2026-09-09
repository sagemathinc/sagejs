# Staged shell and exact torsion-probe integration

Integration checkpoint, 2026-09-09. PR #190 remains draft. This is not a new
PARI win, a public timing result, or four-platform release qualification.

## Source under qualification

The production module incorporates the reviewed resumable outer-shell
collector, exact torsion-only recovery probe, shared recovery discovery,
borrowed search workspace, and ordinary integer `abs` transformations.
The selected source-copy candidate was
`de7127cab89c2272c13f2a4d295916cf279510136347a027df0aea4175c22c40`.
Integration removes only its two diagnostic-only module banners. The resulting
production source SHA-256 is
`93a41e20e4c7916bb00957ae0322b5378bf16491c317f5eeea2ef3f011a29e2c`.

The formatted module is 438,050 bytes. With its unchanged 46,619-byte runtime
companion, the aggregate is **484,669 / 485,000 bytes**. The 1 MiB resident and
3 MiB temporary arena limits, coordinate and candidate caps, analytic bounds,
public receipt format, and host retry policy are unchanged. There is little
source headroom; this is not permission to raise the allowance on a later edit.

## What changes mathematically

Search scheduling is not the acceptance criterion. The outer shell uses the
same authenticated principal-relation admission loop, excludes the original
inner ellipsoid, and preserves its own factor/coordinate cursor. It collects
one, then three, then four additional rows, attempting exact closure at the
cumulative 1/4/8 checkpoints. Only explicit proof insufficiency with the
no-unit diagnosis permits this expansion; fatal statuses stop immediately.
Each accepted extension refreshes the exact presentation and Smith invariants
before another proof attempt. An unchanged relation count stops the schedule.

The [torsion-probe argument](cubic-torsion-probe-experiment.md) supplies an
exact negative certificate for the **current relation kernel**, not for the
entire unit group. A successful predicate makes recovery return its existing
insufficient-unit status before LLL. Inconclusive low-precision intervals
fall through to the complete conditioned recovery and certification path.
No numerical midpoint heuristic substitutes for the interval inequalities.
The predicate's elementary log-gap lemma is unconditional; the full class-group
acceptance still carries its existing explicit analytic assumptions. The
argument is written down, not Lean-formalized.

Sharing the recovery discovery helper, bundling borrowed owners, and replacing
integer sign branches by `abs` do not change the mathematics. Their separate
AST/IR and differential evidence is recorded in the
[recovery sharing](cubic-recovery-sharing-experiment.md),
[search workspace](cubic-search-workspace-experiment.md), and
[absolute value](cubic-absolute-value-experiment.md) reports.

## Tests follow the actual boundary

Historical source-transform tests reconstruct the reviewed pre-integration
module (Git commit `4dfecba5579c5a234db0b60ad4a766cc29ad9738`) using a readable
delta fixture and verify its full SHA-256. Reconstruction checks every hunk
position, context line, and length, then verifies the complete original source
digest. No fuzzy matching, Git history, network, or patch executable is needed;
routine CI uses shallow checkouts. This avoids checking in a second 438 KB
mathematical module or reapplying transforms to their integrated result.

The combined-source test reconstructs every selected transformation, removes
exactly the diagnostic banners, and requires equality with production. It
also retains the stricter formatted-prototype budget check. Changes to this
binding require a deliberate new comparison, not a refreshed hash alone.

Current-production tests execute:

- actual inner and adjacent collectors under every existing pause-boundary,
  rejection, duplicate, candidate-cap, corruption, and terminal-status case;
- the actual bundled expanded collector against the pre-bundle source with
  split/one-shot budgets, both factor orders, and low candidate caps;
- the actual root scheduler through all expansion checkpoints, confirming
  stable scratch-owner identities and exact-presentation refresh, success and
  fatal-status precedence, and no continuation for a different diagnosis;
- the actual recovery helper with its shared discovery and torsion predicate,
  including failed enclosure, reconstruction, and publication paths;
- the authenticated production pack on the four development fields whose
  acceptance moves to effort 5, without changing any mathematical input rule.

Control-flow doubles establish scheduling properties, not class-group
correctness. Compiled same-source witnesses and independently replayed public
certificates are separate requirements.

## Qualification status

The full local production build passed, rebuilding one kernel family and
reusing 41. Strict Python passed CPython syntax, Ruff, and Pyright on all 382
included modules with zero errors. The package graph gate passed. The current
production cache key is
`f0e09f53ed38550e6293db4bf6f33a07bc5e4a31ce0c8ee113e0668c68a7819a`,
and its shared pack key is
`34d8bd90cb70d21a188f47922c30755d4f1f91cfb0d4a91a7b5b0b313ed89af9`.

| Local Linux x64 artifact | Previous production bytes | Integrated bytes |
| --- | ---: | ---: |
| Generated core C | 17,553,014 | 17,762,154 |
| Core header | 9,513 | 9,513 |
| Node adapter C | 200,768 | 200,768 |
| Standalone family addon | 20,390,672 | 20,411,152 |

The complete integration grows generated C by 209,140 bytes and the family
addon by 20,480 bytes; source compression alone did not erase the new
scheduler's generated-code cost. The adapter C is byte-identical. Production
source paths are the same in this before/after comparison. The resource
inventory adds one 1-by-11 plan and one 1-by-6 cursor, allocated before the
staged loop, within the unchanged arena limits. Bundles introduce no owners.
These file-size and ownership observations do **not** measure peak memory.
The hash-bound local inventory is
`build/cubic-next-evidence/integration-generated-resources.json`.

The source-copy candidate already matched every output slot on all 1,012
development observations (961 first-effort acceptances, 51 declines). That is
historical diagnostic evidence, not public qualification of the integrated
source. The reserved unseen neighbors remain untouched.

All 42 current-source diagnostic/native tests pass without skips, including
the full 109-function isolated fmpz closure, actual cursor witnesses across
JavaScript/GMP/fmpz, the four new effort-5 acceptances, and the existing
temporary-arena exhaustion/reuse witness. Architecture and documentation
checks also pass. Logs are `integration-current-tests.log`,
`integration-architecture.log`, and `integration-docs.log` under
`build/cubic-next-evidence`.

The refreshed optimizer snapshot is
`sha256:1978bb11a38067487fee27eacc40471a50c33673d82aa4aa81a26e85826ac8d1`.
Its three payloads and manifest are published as a non-latest prerelease under
the content-addressed tag named in `architecture/optimizer-opportunities.manifest.json`;
all four GitHub asset digests match the local bytes. The compiler identity is
unchanged. The dashboard is source-analysis evidence, not a correctness or
timing certificate. Its tag anchors the preceding research commit; the
manifest binds the integrated input source bundle explicitly.

The 1,000-field authenticated public receipt and independent exact replay
completed successfully after full cache preparation. All 1,000 distinct tune
fields agree with the frozen corpus in class number, invariants, and field
discriminant; every receipt authenticates and passes the ordinary-object exact
replay that bypasses closed-native proof authority. A separate saved-report
audit also checks every receipt digest, polynomial binding, invariant product,
and equality of the four batch payloads with the final report.

The report is
`build/cubic-next-evidence/staged-shell-public-replay/report.json`, 3,922,076
bytes, SHA-256
`327d530141ea8c5a7a21abd9b886583a300f6035b8ae49d895359a108c0114cf`.
The runtime fingerprint remained unchanged before and after every batch:
`75c34dfe5452a55df08eac568b20b1abd2616f61009c5d6789c00d261016aae8`.
The production index SHA-256 is
`4c24f6034eb9e028c762a45c0e39faee6a96e441377d563d46cb0ab1da6649ab`.
The run started before the integration commit: its identity truthfully records
parent `4dfecba5579c5a234db0b60ad4a766cc29ad9738` plus tracked-diff SHA-256
`60888995a7f83d3417fc7018184e6503fa80d36d3971d70d2046bb3be021cf4d`.
The mathematical source hash is the integrated hash above; this is not
relabeled as a clean-commit or hermetic-launch receipt.

The [public evidence archive](https://github.com/sagemathinc/sagejs/releases/tag/cubic-staged-shell-public-replay-20260909)
preserves 44 hash-inventoried files, including all raw batches, report, corpus,
source, generated core, resource inventory, drivers, and validation logs.
Archive `cubic-staged-shell-public-replay-20260909.tar.gz` is 6,135,411 bytes,
SHA-256 `2c839344e15edb43705e8034f4217c5a8471efaced93f89e82b9d962fe6d2753`.
The archive inventory was checked against every archived file. This is a
non-latest research prerelease, not a Sage.js product release.

There are 949 effort-5 successes, 32 effort-1 successes, and 19 effort-7
successes. Effort labels describe the existing retry order **5, 1, 7, 8**,
not increasing amounts of work. Exactly four fields move from a host retry to
the initial effort-5 computation relative to the preceding public replay:

| LMFDB label | Previous successful effort | Integrated successful effort |
| --- | ---: | ---: |
| 3.1.384587.1 | 1 | 5 |
| 3.1.761319.2 | 7 | 5 |
| 3.1.1063351.3 | 1 | 5 |
| 3.1.3276404.1 | 1 | 5 |

Of these 1,000 receipts, 200 use the trivial-presentation proof and its explicit
class-group-character GRH assumption; 800 use the nontrivial exact-relations
proof with the additional stated zeta-function GRH assumptions. None is an
unconditional or Lean-checked class-group claim. These are the development
tune fields, not the reserved unseen neighbors. Local inherited-environment
correctness replay is not controlled timing on `opt` or a promotion receipt.

The broader compiler suite also completes with zero failures: 21 tests pass
and 28 are skipped by existing stage-zero/in-file fixture markers. This does
not convert those skipped fixtures into qualification.

The first full unit-tier run stopped at a stale reconstructed-regulator fault
fixture after 52 files passed. It still mocked the old one-shot reconstruction
helper, whereas the actual proof suffix already calls the two-stage
`_cubic_reconstruct_archimedean_unit_at_scale` helper. The production helper
already had this form before the combined integration. The fixture now
executes the unchanged current suffix and helper bodies, checking both proposal
scales, unchanged authentication precision, five first-proposal successes,
seven double-rejection cases, seven successful refinements, and one subsequent
analytic failure. Rejected cheap proposals use distinct coordinates so stale
coordinate publication cannot accidentally pass. The focused regression passes.
The full unit rerun passes 158 files, including the repaired fixture, then
stops at the inherited modular q-expansion source-freeze mismatch. Its only
mismatching file is `architecture/package-graph.json`, whose current bytes are
identical to HEAD; the unrelated modular freeze still records its older hash.
That manifest was not refreshed. Checking the 21 remaining/cancelled unit files
separately yields 55 passing tests, three skips, and one failure in the Wasm
production inventory. That failure reproduces when its file runs alone; the
[parser-lifetime diagnostic](cubic-parser-lifetime-diagnostic.md) separates
repeated grammar loading from unreleased syntax trees. No full-unit success
is claimed.
This is a test repair, not a mathematical
source or runtime change. The initial failure log is `integration-unit.log`;
the rerun log is `integration-unit-after-guard.log`.

The wider cubic native/public run passes eleven tests but also finds a stale
materializer extraction test. Its helper boundary assumed the next declaration
was the root entry point and its comparison assumed one-shot reconstruction.
The repair extracts only the intended helper, retains the historical exact
product-tail AST comparison modulo explicit fatal guards and the exact `abs`
identity, and checks the actual two-stage proposal separately. The actual
materializer passes 15 cases with three reused steps each across dynamic,
GMP, and fmpz; the original full-body equivalence claim is not applicable to
the deliberately changed two-stage proposal. The fresh combined native/public
run passes all 14 tests without skips, including independent receipt replay,
the pinned nontrivial LMFDB corpus, large-regulator units, actual analytic
saturation, native materialization, retry classifications, and proof-support
checkpoint exhaustion under sanitizers. Its log is
`integration-public-native-current.log`; source and runtime remain unchanged.

The inherited parallel
metadata gate still fails; it is not evidence of running agents.
The full changed-test plan also includes broad compiler, Wasm, integration,
unit, and CLI gates not covered by the focused 42-test run.

Broad, controlled public timing, unseen-neighbor, and cross-platform gates
remain outstanding. No
strict performance non-regression or universal acceptance claim is made.

The first test launch overlapped the runtime rebuild and encountered a missing
frontend artifact; that failed run is retained as
`build/cubic-next-evidence/integration-diagnostic-tests.log`. It cannot qualify
the candidate. Subsequent compiler/runtime tests must run after the build has
finished, and the public replay must consume a fingerprint-stable runtime.
