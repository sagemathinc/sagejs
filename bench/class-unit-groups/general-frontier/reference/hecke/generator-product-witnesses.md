# Hecke literal class-generator witnesses

The worker emits `sagejs-hecke-frontier-screen-v2`. Each entry in
`decompositions` and `class_decompositions` has exactly `coordinates`,
`representative`, and `generator_product_witness`. If the input ideal is `I`,
the exported generator ideals are `G[j]`, and the coordinates are `c[j]`, the
new compact witness represents an element `w` satisfying

```text
I = (w) * product(G[j] ** c[j]).
```

The result carries the exact `witness_semantics` label
`ideal-equals-principal-witness-times-literal-class-generator-product`.
`representative` remains the diagnostic image of the class coordinate under
Hecke's map. It is not the ideal against which the new witness is certified.
Hecke can reduce that image, so it need not equal the literal generator product.

The worker constructs `I * product(G[j] ** (-c[j]))` as one factored ideal and
passes it to the existing factored principality service. It never expands those
ideal powers or the returned element. The identity product is handled directly;
otherwise there is one principality computation, not separate checks against
both the map representative and the literal product. The helper accepts signed
exact integer coordinates, including zero, and rejects wrong vector lengths,
booleans, floats and strings. It does not silently reduce the supplied exponents
modulo the class-group invariants.

## Historical receipts and scope

V1's `witness` certifies the residual against its returned `representative`.
That meaning is preserved for retained v1 evidence. The terminal and shape
validators explicitly accept the two versions, reject unknown versions, require
the v2 semantic label, and reject cross-version witness-field splices. The
class-power witness format is unchanged because it already names a literal
generator power.

Normalized Hecke rows retain `worker_schema` and `witness_semantics`. V1 is
explicitly labeled
`ideal-equals-principal-witness-times-returned-class-map-representative`, even
if an extra v2 label is present in an old-format receipt. V2 retains its validated
literal-product label. Neither normalization upgrades qualification or replay.

Both versions remain structural screening formats. Their validators do not
prove ideal identities or completeness, and neither result becomes detached
replay or qualified timing evidence. V2 still declares `proof_policy` as
`conditional-grh` and `independent_replay=false`. Runtime limits, sampling,
regulator accuracy and timing boundaries are unchanged. Existing discovery
times must not be attributed to the strengthened v2 computation.

The mathematical owner is reviewed against Hecke 0.40.0 source revision
`66af28e52682620edb302931fce3f9ac87fc4eb7`, especially
[`Clgp/Map.jl`](https://github.com/thofma/Hecke.jl/blob/66af28e52682620edb302931fce3f9ac87fc4eb7/src/NumFieldOrd/NfOrd/Clgp/Map.jl).
Its class-map exponentiation may return reduced representatives. Its factored
principality method retains the reduction multiplier when returning a witness
for the original factored ideal. No owner algorithm is copied or modified here.

## Focused regression

With an explicitly provisioned Julia/Hecke environment:

```sh
julia --startup-file=no --project=/path/to/environment \
  bench/class-unit-groups/general-frontier/reference/hecke/generator-witness-smoke.jl
python3 -B bench/class-unit-groups/general-frontier/reference/runner/test_hecke_witness_schema.py
```

The Julia regression uses the class group `C2 x C2` of `Q(sqrt(-21))`, composite,
negative and zero coordinates, an actual ideal reduction, and the serialized v2
worker output. It decodes exact compact factors and checks principal-ideal
equations with independently formed small ideal powers. A second fixture uses
`Q(sqrt(-39))`: the canonical class coordinate `3` has a map image strictly
smaller than the literal cube of the exported generator. The old identity
witness fails this equation while the v2 residual witness passes. Changing a
coordinate or witness must break the equation. Expanded arithmetic occurs only in these
bounded test oracles, never in the worker. The Python regression checks schema,
semantic-label, witness-field, coordinate and factor-shape mutations without
claiming mathematical verification.

The test prints its actual Julia, Hecke and Nemo versions. Local 0.39.22 smoke
is useful compatibility evidence but is not a substitute for pinned 0.40.0
validation. Running the retained 0.40.0 source locally likewise does not
authenticate the deployed host's caches or establish a timing result. Broader
cross-system map/unit probes and benchmark qualification remain separate work.
