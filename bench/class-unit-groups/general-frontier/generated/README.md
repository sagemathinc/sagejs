# Generated-source admission companion

This developer-only offline tool binds the existing 112 rank-two polynomial
presentations to the predeclared initial 28 PARI/Hecke requests. It does not run
Sage.js, a CAS, a benchmark, or a network acquisition. It does not modify or
pretend to be the LMFDB-only `source-union.v1` format.

```sh
node bench/class-unit-groups/general-frontier/generated/admit.cjs \
  --manifest build/generated-admission-inputs.json \
  --output build/generated-admission-new.json
node --test bench/class-unit-groups/general-frontier/generated/admit.test.cjs
python -B -m unittest discover \
  -s bench/class-unit-groups/general-frontier/generated -p 'test_*.py'
```

The CLI requires Node 22.22.2+ and CPython (`python` on PATH). The Python helper
imports the existing generator, selection builder, persistent receipt validator
and pairer, **without invoking their worker-launching paths**. Its subprocess
has a 120-second bound and 64 MiB output cap. Each explicit raw reference
directory is capped at 1,024 JSON files and 128 MiB total, each at most 64 MiB. The tool creates
the output exclusively and refuses to overwrite an existing export. Input
directories must already exist; it never discovers directories by broad scans.

## Input schema

The manifest has exactly these keys:

```json
{
  "schema": "sagejs.general-frontier/generated-admission-inputs-v1",
  "generator": {"path": "rank-two-supplement-v1.json", "sha256": "<raw SHA256>"},
  "pilot": {"path": "supplement-pilot.json", "sha256": "<raw SHA256>"},
  "pilot_selection": {"path": "supplement-pilot.json.selection.json", "sha256": "<raw SHA256>"},
  "paired": {"path": "paired-supplement-discovery-v1.json", "sha256": "<raw SHA256>"},
  "union": {"path": "source-union-v1.json", "sha256": "<raw SHA256>"},
  "exposure": {"path": "union-source-coverage-v1/reconciliation.json", "sha256": "<raw SHA256>"},
  "coverage": {"path": "union-source-coverage-v1/coverage.json", "sha256": "<raw SHA256>"},
  "coverage_policy": {"path": "source-coverage-policy-v2.json", "sha256": "<raw SHA256>"},
  "source_root": "<repository with the pinned audited sources>",
  "reference_directories": {
    "pari": "persistent-pari-supplement-attempt-1",
    "hecke": "persistent-hecke-supplement-attempt-1"
  }
}
```

Paths resolve relative to the manifest. The exposure envelope retains its own
manifest-relative input paths; do not move relative-path envelopes without
their dependencies. Replaying the existing exposure envelope reconstructs the
LMFDB acquisitions, inventory, metadata joins and explicit Sage diagnostics.
Its candidate union must equal the separately pinned union. The finite source
report is independently rebuilt from its policy and pinned BENCH/TEST sources
against that union. These existing tools are used unchanged.

The raw generator must equal a complete regeneration of the fixed family,
scale and index policy. The pilot and selection must equal the original
`j=0,1` plan, not a caller-chosen successful subset. Every raw run must bind the
exact pilot bytes and membership. Both embedded engine reviews and the paired
report must equal reconstruction from the explicit raw directories, including
raw receipt and run hashes. Recorded worker-source hashes must also match the
reviewed local PARI/Hecke workers that report maximal-order discriminants.
Producer/version mismatches fail closed rather
than silently re-signing an older report. Raw references and local validator
hashes are retained in the output. These hashes establish content binding,
not the trustworthiness of the recorded foreign binary or mathematical proof.

## Output and exact checks

The output schema is `sagejs.general-frontier/generated-admission-v1`.
`records` retains all 112 presentations, each with a generated coefficient-hash
`id`, exact ascending coefficient strings, family, scale and parameter index.
No fake LMFDB label or equation-discriminant-derived field identity is created.

Only matched completed engine rows can have a non-null `observation`. Exact
coefficients and degree/signature must match the regenerated family. The
signed maximal-order discriminants reported by PARI `b.disc` and Hecke
`discriminant(O)` must agree, as must the other paired class/torsion summaries.
The tool independently checks
`equation_discriminant = field_discriminant * equation_order_index^2`
using exact integers, requiring a positive integer index. The retained cubic
scale4/index0 and scale10/index1 examples have indices 11 and 17; confusing
their equation discriminants with field discriminants would fail this design.
This square-index consistency check does not itself prove maximality.

Noncompleted pairs retain explicit censored status and no admitted metadata.
Missing metadata is not replaced by equation D. Worker times and their minimum
are discovery metadata only. The separate regulator representations are not
asserted equivalent, and none of this validates a detached class/unit result.

Parameter declarations are fixed independently of results:

| Parameter indices | Declaration |
|---|---|
| 0–1 | Initial reference discovery; final role unassigned |
| 2–5 | Development-only, currently unscreened |
| 6–7 | Reserve-unassigned, currently unscreened |

These declarations do not allocate holdout fields or alter the eventual
120/80 coverage, 24/16 performance, expensive-field or bridge targets.

## Exposure and distinctness boundary

Historical exact coefficient matches and historical signed-D/signature bucket
matches quarantine generated presentations. The two historical assertion
spellings (`field_discriminant` and additional-exposure `discriminant`) are
handled explicitly. Reference-only and selection-only evidence do not become
Sage development exposure. Existing five actual Sage diagnostic records retain
their independently declared category through the exposure envelope.

Equal-D/signature matches to LMFDB records are retained as lists of **possible
same-field** labels, not merged fields. Generated/generated bucket collisions
are likewise listed. A future selector must allocate an entire possible-field
bucket to one split or obtain exact isomorphism evidence before splitting it.
Historical quarantine propagates across generated members of such a bucket.
`union_quarantine_proposals` identifies any corresponding LMFDB labels that
must be conservatively quarantined before splitting; the original union is
not edited and equal-D presentations are never declared isomorphic.
Different reported field discriminants exclude isomorphism only conditional on
the correctness of that field metadata. `distinct_field_count` stays null.

The finite source dispositions are rechecked for each matched generated
presentation. Exact Sylvester bounds remain bounds, not discriminants; a
possible overlap is conservatively quarantined. Source-asserted discriminants
retain that attribution. The finite checklist is not universal history, and
unrecorded overrides are not assumed unseen. All outputs remain
`source_coverage_approved:false`, `qualification_evidence:false`,
`independent_replay:false`; unmatched exposure stays unknown. No record ever
gets `holdout_eligible:true`. Historical quarantines and development-only
indices get false; other unresolved records get null. Consumers must require
an explicitly reviewed later eligibility decision, not truthiness or absence
from this finite inventory.

The public `fromManifest` entry point performs raw reconstruction. Exported
pure helper functions support focused schema/arithmetic tests; calling them
with fabricated objects does not reproduce the CLI provenance checks.
