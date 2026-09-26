# Class/unit output-evidence v2

## Scope

`class_unit_output_evidence_v2.cjs` is an additive sidecar contract. It does
not replace or weaken `class_unit_correspondence_result.cjs`, and it does not
promote an internal PARI-correspondence result to a public theorem-backed
result.

The sidecar answers a different question:

> Which exact materials needed to construct and replay the class-and-unit
> output boundary were produced by this fresh execution?

In particular, these are separate claims:

- `freshCorrespondence`: the source computation ran from the admitted fresh
  boundary rather than accepting terminal results as runtime inputs;
- `correspondenceComplete`: the retained result agrees with the pinned PARI
  correspondence policy;
- `outputBoundaryComplete`: phases 3, 4, and 5, all three map families, and the
  complete output material are present.

The checker deliberately permits the first two claims while the third is
false. An incomplete boundary must publish a nonempty, machine-readable
`completion.missing` list. A complete boundary must have no omissions and all
three maps must be ready.

## Evidence model

Large mathematical objects remain outside the sidecar. `evidence` is a sorted,
typed registry of their canonical SHA-256 identities and logical shapes. The
rest of the payload refers to registry ids. Validation checks both the required
kind and, where meaningful, the exact matrix or vector shape.

The contract covers:

- factor-base ideals, relation matrix, principal generators, and relation
  logs;
- presentation dependencies and provenance, with one of:
  - Smith `U/W/V/D` evidence,
  - a matrix/right-inverse/identity proof, or
  - a trivial identity proof;
- every nontrivial class generator's ideal, invariant-factor order, exact
  principal-order witness, and any archimedean principal-map references;
- every compact fundamental unit's relation transform, provenance, and log;
- either exact unit coordinates and norms or an explicit PARI-compatible
  `PRECI`/`LARGE` materialization omission;
- either a rigorous regulator enclosure or a PARI-packed accepted regulator.
  Both retain precision and acceptance evidence; the packed form additionally
  retains retry evidence;
- torsion-generator material;
- factor, reduce, and combine map readiness or explicit omissions; and
- phase 3/4/5 and terminal output-boundary completion booleans.

The schema is intentionally about evidence topology, identity, and shape. It
does not claim that a digest proves the referenced mathematics. The row's
independent replay capability remains responsible for checking the referenced
bytes.

## Row migration interface

An existing row can add v2 without changing its v1 publication or registry
entry:

1. Keep producing the admitted fresh v1 correspondence receipt.
2. Canonically serialize each already-retained output object. Assign it a
   stable row-local id and one v2 evidence kind, and record its SHA-256 and
   logical shape.
3. Set `source.correspondenceResultSha256` to the detached digest of the v1
   correspondence publication and retain the pinned PARI source identity.
4. Fill `relations` using the factor-base count and relation count actually
   replayed by the row. Do not use target/PARI terminal counts as runtime
   authority.
5. Select exactly one presentation variant. Use `smith_uwvd` only when all
   four transformations are retained. Use `right_inverse` when the exact
   inverse identity is the proof. Use `trivial_identity` only when that exact
   identity is the row's presentation proof.
6. Publish one class-generator record per invariant factor. For class number
   one, both lists are empty and the invariant product remains one.
7. Publish compact-unit records even when exact expanded units are omitted.
   The latter must use the explicit `not_given` form.
8. Select the regulator kind truthfully. A PARI-packed acceptance record is
   not a rigorous enclosure and cannot be labeled as one.
9. Mark each map ready only if its typed evidence is retained. Otherwise give
   that map a nonempty omission list and include the corresponding stable id in
   `completion.missing`.
10. Set `outputBoundaryComplete` only after phases 3, 4, and 5 are complete,
    correspondence is fresh and complete, all maps are ready, and the global
    missing list is empty.
11. Validate the sidecar with `validate`, publish its `canonical` bytes, and
    retain its `sha256Canonical` digest out of band alongside the row's
    existing replay authority.

No row is required to migrate atomically. A partially migrated row can
truthfully publish complete relation/presentation/class evidence while naming
missing unit or map material and keeping `outputBoundaryComplete: false`.

## Focused validation

Run:

```bash
node bench/pari-class-group-port/check_class_unit_output_evidence_v2.cjs
```

The checker validates complete Smith/rigorous-enclosure material, an incomplete
but correspondence-complete right-inverse/PARI-packed result, and the trivial
presentation alternative. It also checks canonical byte replay and rejects 22
adversarial mutations spanning types, shapes, references, witnesses,
regulators, maps, phases, omissions, and freshness.
