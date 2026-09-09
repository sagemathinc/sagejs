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

The 1,000-field authenticated public receipt and independent exact replay is
running in `build/cubic-next-evidence/staged-shell-public-replay` after full
cache preparation. No completed-corpus claim is made yet. The inherited
parallel metadata gate still fails; it is not evidence of running agents.
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
