# Resident state-layout manifest audit

`resident-state-layout-v1.json` is the campaign's first named, versioned,
inspectable **shared semantic** state-layout resource. It names the factor,
relation, HNF, unit, class, and final owners; separates physical capacities
from logical lengths; records scalar domains and overflow policy; and makes
ownership, borrowing, lifetimes, retries, and final publication explicit.

The resource deliberately is not advertised as a binary ABI. Current row
pipelines use different degree- and path-specific storage, and the older
`resident_candidate_owner_manifest.cjs` is a positional allocation contract
for one fixed cubic. Likewise, `h1_private_integer_buffer_layout.json` selects
private exact buffers in one root but does not describe a complete class/unit
state. Neither older artifact qualifies as the plan's shared state layout.

The manifest therefore says `no-generated-signature-yet` and inventories those
existing specializations with `derivedFromThisManifest: false`. This prevents
the documentation from implying that bespoke row layouts already share an ABI.
The remaining compiler/integration work is explicit in `signatureGeneration`:
bind dimensions and budgets, split semantic owners into typed storage, prove
fixed-width ranges, generate signatures and specialization manifests, reject
signature drift, and migrate each row only under differential and mutation
tests.

The focused checker validates all dimension/domain references, owner-role and
lifetime consistency, backward retry edges, sole-final publication, existence
of the inventoried evidence, and deterministic JSON bytes. It also reports the
manifest SHA-256 and truthfully reports zero signatures generated from it:

```bash
node bench/pari-class-group-port/check_resident_state_layout.cjs
```

This closes the missing inspectable-resource/documentation cut. It does **not**
close generated-signature integration or establish a memory/performance result;
those remain measured implementation work rather than facts asserted by the
manifest.
