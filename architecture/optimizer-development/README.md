# Optimizer-development evidence contracts

The compiler-development engine exchanges immutable, content-addressed JSON
documents. The executable contract is
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

## Identity domains

`tools/optimizer-development/identity.cjs` defines repository-portable source
bundle, compiler, source-unit, function, region, and decision identities.
Functions and regions include exact ranges, semantic fingerprints, and lexical
ordinals. Module-scope regions use a synthetic `<module>` function owner; a
source location that identifies multiple regions is ambiguous and must not be
selected by location alone.

Hashes provide integrity and deterministic joins, not authorship. See
`TRUST-BOUNDARY.md` for the evidence authority model.

