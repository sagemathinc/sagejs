# Sage.js optimization-engine evidence contracts

The optimization engine exchanges immutable, content-addressed JSON documents.
It discovers expensive behavior first and chooses an intervention only after
the evidence boundary, semantics, alternatives, and fallback have been
reviewed. A hotspot classification is diagnostic; it does not silently select
compiler work.

The executable contract is
`tools/optimizer-development/schemas.cjs`; the JSON Schema files in this
directory describe the wire shape for editors and non-JavaScript consumers.
The executable validators additionally enforce invariants JSON Schema cannot
express conveniently:

- canonical JSON SHA-256 identities;
- deterministic ordering and uniqueness;
- exact source/compiler/artifact joins;
- conservation of independent profiler channels;
- authenticated source mappings and explicit unmatched evidence;
- optimizer decision and full-IR consistency;
- paired ABBA measurement and bootstrap recomputation; and
- current-checkout, build, artifact, browser, platform, route, resource, and
  baseline-exception gates.

## Intervention choice

Every eligible opportunity, approved dossier, campaign, and promotion receipt
contains the same reviewed `intervention` object. The category determines the
campaign action and architecture strategy; it does not weaken the correctness,
paired-measurement, negative-evidence, resource, platform, or rollback gates.

| Category | Campaign action | Typical change |
| --- | --- | --- |
| `algorithm` | `algorithm-campaign` | Replace a mathematical algorithm after ruling out a mature equivalent. |
| `library-route` | `library-route-campaign` | Route through an already mature implementation with guarded fallback. |
| `representation` | `representation-campaign` | Change ownership, layout, boxing, or materialization boundaries. |
| `runtime` | `runtime-campaign` | Improve evaluator, dispatch, serialization, or runtime primitives. |
| `boundary` | `boundary-campaign` | Reduce or restructure host, native, or Wasm crossings and copies. |
| `cache` | `cache-campaign` | Change authenticated preparation, reuse, or invalidation behavior. |
| `source` | `source-campaign` | Rewrite ordinary Sage.js source while preserving public semantics. |
| `compiler` | `compiler-campaign` | Add a reusable source-transparent proof and lowering. |

`tools/optimizer-development/interventions.cjs` is the shared vocabulary and
validator. Classification and intervention deliberately remain separate. For
example, allocation-heavy evidence may justify a representation, runtime,
source, boundary, or compiler intervention depending on the complete-public
measurements and mature alternatives. Without a reviewed intervention, the
overlay recommendation remains `investigate`.

Compiler interventions retain additional constraints: an exact current
compiler decision and complete IR are mandatory, the source relationship must
be `source-transparent`, and promotion must authenticate the O0/O2 route and
fallback. Non-compiler interventions must not manufacture compiler decisions
or route evidence.

The version-one instance schemas are:

| Instance `schema` | JSON Schema document | Executable validator |
| --- | --- | --- |
| `sagejs.optimizer-workload/v1` | `workload-v1.schema.json` | `validateWorkload` |
| `sagejs.optimizer-workload-catalog/v1` | `workload-catalog-v1.schema.json` | `validateWorkloadCatalog` |
| `sagejs.optimizer-profile-receipt/v1` | `profile-receipt-v1.schema.json` | `validateProfileReceipt` |
| `sagejs.optimizer-hotness-overlay/v1` | `hotness-overlay-v1.schema.json` | `validateHotnessOverlay` |
| `sagejs.optimizer-dossier/v1` | `dossier-v1.schema.json` | `validateDossier` |
| `sagejs.optimizer-campaign/v1` | `campaign-v1.schema.json` | `validateCampaign` |
| `sagejs.optimizer-promotion-receipt/v1` | `promotion-receipt-v1.schema.json` | `validatePromotionReceipt` |

`validateBySchema` is the fail-closed dispatcher. Unknown schema versions and
unknown fields are errors. A producer must construct a complete payload and
then use `attachIdentity`; editing a document after it is addressed makes its
identity stale.

The first accepted pilot campaign is documented in `CAMPAIGN-1.md`. It used
the general evidence process and selected a compiler intervention; the broader
schema is a consequence of the campaign, not a relaxation of its gates.

## Optimization-engine v2

New campaigns use the neutral contracts in
`tools/optimization-engine/contracts.cjs` and the ten
`architecture/optimization-engine/*-v2.schema.json` wire schemas. Version one
remains the immutable historical contract for Campaign 1; it is not an alias
for version two and new optimization-engine producers must not emit it.

Version two makes workloads epoch-independent, then addresses one clean build
epoch, scoped subjects, observations, interventions, adjudication, dossiers,
campaigns, promotions, and durable outcomes in that order. Subjects cover
public calls, reviewed phases, source regions, runtime components,
representation lifetimes, foreign boundaries, cache lifecycles, and
algorithmic operations. Observation channels conserve timing, samples, calls,
routes, bytes, allocations, resources, cache events, and correctness
independently; sample counts or call counts cannot be presented as wall time.

The category contract in `tools/optimization-engine/category-contracts.cjs`
defines the evidence and campaign roles for algorithm, library-route,
representation, runtime, boundary, cache, source, and compiler interventions.
Only the compiler branch can contain optimizer IR, decisions, passes,
lowerings, or compiler routes. The adjudicator can select, investigate,
reject, or record an already-optimized boundary, and its result does not read
the diagnostic hotspot classification.

`pnpm optimization:epoch -- create ...` performs the one-build epoch capture.
The logical epoch excludes absolute paths, timestamps, and Release locations;
those are sidecar data. It binds the clean Git tree, whole-repository source
closure, build receipt and complete output manifest, workload set, schemas,
runtime, components, profiler protocol, and reason registry. Parallel lanes
receive distinct Git-common scratch shards and consume the same immutable
build read-only. Canonical NDJSON is semantic authority; SQLite and compressed
assets are reproducible indexed/transport views with separate physical hashes.

## Large evidence artifacts

Git stores schemas, generators, workload definitions, accepted outcomes, the
human-readable opportunity summary, and the small
`architecture/optimizer-opportunities.manifest.json`. It does not store the
complete million-line opportunity census.

The manifest binds three assets in an immutable GitHub Release:

- a canonical normalized NDJSON stream used for the storage-independent
  logical identity;
- an indexed SQLite database derived from exactly those logical records; and
- the historical pretty-printed dashboard JSON for compatibility and audit.

The logical identity hashes the uncompressed UTF-8 canonical record stream.
Compression and SQLite layout are not semantic authority: each physical asset
has its own byte count and SHA-256 digest. SQLite contains the logical and
dashboard identities in its metadata table, and validation reconstructs the
canonical records to prove a round trip. Derived summaries and query indexes
remain reproducible views rather than a second source of truth.

`pnpm optimizer:opportunities:query -- PATH[:LINE]` downloads and validates the
SQLite asset on first use and then reuses the ignored local cache. Use
`pnpm optimizer:opportunities:materialize -- FILE` when a consumer still needs
the legacy dashboard JSON document.

## Identity domains

`tools/optimizer-development/identity.cjs` defines repository-portable source
bundle, compiler, source-unit, function, region, and decision identities.
Functions and regions include exact ranges, semantic fingerprints, and lexical
ordinals. Module-scope regions use a synthetic `<module>` function owner; a
source location that identifies multiple regions is ambiguous and must not be
selected by location alone.

Hashes provide integrity and deterministic joins, not authorship. See
`TRUST-BOUNDARY.md` for the evidence authority model.
