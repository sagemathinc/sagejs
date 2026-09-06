# Non-draft merge review: #130, #134, #181

Integration baseline: `e6350685120649c7e932080d3d07cb2843a29ace`.
This is merge management, not release qualification or publication.

## #181: warning assertions and callable instance metadata

Reviewed head: `3840eada51c49907959366c9909bf1c5d79a2a4d`.
Its base, #178, is already integrated. No bot review comments or outstanding
formal reviews were present when inspected.

The ordinary Python implementation supports callable and context-manager
warning assertions, category tuples, compiled regexes, custom failures and
cleanup without swallowing body exceptions. The fixture runs against CPython,
the ordinary unittest source with CPython warnings, and both ordinary source
modules together. Warning locations retain the documented `<sagejs>:0`
limitation; this does not claim complete warnings/unittest compatibility.

The runtime fixes report a missing callable as TypeError without translating
AttributeError raised inside a valid call, and remove configurable host
function metadata before installing callable-instance state. Tests cover
non-string names, docs, annotations, positional/keyword calls and isolation.
Integration additionally tests callable metadata in the public browser worker.
The full warning fixture exposed a pre-existing packaging gap: unittest is
absent from the browser module manifest. Adding that lazy module and running
the full warning fixture is queued for the combined cubic integration build;
do not describe Node warning coverage as browser warning coverage.

Preserve main's lazy analytic module and deleted-browser-builtin resolution
fixes. Keep the existing 890000-byte core ceiling, not the incoming branch's
older budget. Regenerate source-derived documentation, optimizer evidence and
the modular q-expansion source inventory from the actual integrated source.

Qualification of #181: complete eight-stage build; 21 focused tests;
architecture; routine validation (1m50s); strict Python 381 modules;
CPython 3.14 conformance 505 passes and three unchanged declared
incompatibilities; refreshed Wasm build and eight real Chromium Python
fixtures. Core size is 889693/890000 bytes. Optimizer census compiles 16529
functions with no failures. This is local integration evidence, not release
qualification on four platforms.

## Combined cubic integration findings

The owner explicitly permits ready cubic work even if a component PR remains
draft. Other draft families are not in scope. The reviewed aggregate heads
remain pinned above; no inline review comments were present on either
aggregate or its cubic component PRs at the final inspection.

The review reproduced a compiler correctness defect: a Python parameter named
like a workspace helper could shadow that helper, but bundle erasure still
called the original function. Native workspace lowering now rejects parameter,
local, module, import, class, duplicate-definition and loop-target shadowing.
It also requires an actual imported `NativeWorkspace` base binding instead of
accepting an otherwise undefined name. The focused suite passes 13 tests across
CPython, JavaScript and the native exact backends.

Integration preserves main's stronger nested-arena rule for borrowed external
resources and removes an accidentally duplicated older guard. It preserves
main's browser/core budgets and admits precisely the new logical-prefix Arb
boundary. The core remains 889693/890000 bytes; the combined cubic source is
480222/485000 bytes. This size result alone does not qualify the allowance.

Two tests needed fixture corrections, not weakened mathematical assertions:
the extracted proof helper must stop before the following workspace class;
the recovery fault fixture must execute the actual delegated decline classifier.
Real repeated proof attempts, discovery-state isolation and bounded exhaustion
pass, including sanitizer high-water measurements of 200576 fmpz and 217632 GMP
checkpoint bytes.

The complete eight-stage build passes in 15m52s, rebuilding all 41 production
families into one 27.13 MiB native pack. Strict Python passes 381 modules.
The 41 compiler guard tests, 53 deeper cubic/resource tests and 17 additional
proof/holdout tests pass with no skips. These include public authenticated
receipts, independent exact replay, resumed certification, real unit recovery,
poisoned grow/shrink prefixes and sanitizer exhaustion. Architecture and routine
validation pass; the latter completes in 1m37s. The retained f7 evidence verifier
and its corruption probes pass against downloaded assets (historical evidence,
not a new current-source performance claim).

The unchanged rational-matrix performance gate passes, including negation at
4.14/15 ms and transpose at 3.49/15 ms. Fresh Wasm/browser qualification remains
pending. These local checkpoints are not four-platform release qualification.

Using the same integrated compiler, unchanged imported field-analysis source,
and identical absolute source-path configuration, the pre-merge cubic root at
`09dfbc88c` lowers to 84 functions and 15282568 generated C bytes; the candidate
lowers to 101 functions and 16740262 bytes (9.54% growth). Both generated headers
are 6900 bytes. This controlled code-generation comparison does not measure
execution speed or independently justify the source allowance. The additional
17 helpers implement isolated, bounded proof resumption rather than broadening
acceptance without proof; the public replay and exhaustion tests qualify that
behavior separately.

## #130 and #134: aggregate review authorized

Reviewed scope at #130 `3a694809b95e7e08f1b12adee78121b96f4eed69`
and #134 `14a51978d89a2a8069bc99380762d6d96238f2b3`.
These aggregate PRs are non-draft, and Discussion 104 explicitly announces
them as ready for review. However, they incorporate implementations also
presented in still-draft component PRs, not just references to those PRs:

- #130 includes root-owned scratch (#126), cursor preservation (#128), integer
  token separators (#129), inferred resource indexing (#131), while control
  transfer (#135), and the prefix-Arb binding (#138).
- #134 includes recovery-prefix work (#142), compact dependency prefixes
  (#150), unit materialization (#151), and the analytic suffix (#152).

Several integrations use copied commits rather than the component head as a
Git ancestor. An ancestry-only draft check would therefore miss this overlap.
The owner explicitly authorized review and merging of cubic-class-group work
even when its component PRs remain draft. This resolves the original scope
hold; it is not a completed code review or a waiver of qualification gates.

Review the 420000-to-485000-byte cubic source allowance
on its actual evidence, not merely a refreshed manifest. Reconcile the older
browser payload policy with main without weakening limits. The branch reports
pre-feature QQ timing failures and incomplete native platform qualification;
neither is silently waived by readiness for review. Preserve explicit wasm32
fallbacks for kernels requiring 64-bit FLINT limbs. The PR bodies still say
"Keep draft" and should be reconciled with the newer Discussion handoff.
