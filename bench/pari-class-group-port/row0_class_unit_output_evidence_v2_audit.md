# Row 0 output-evidence-v2 projection

Row 0 now produces a valid
`sagejs.pari-class-group/class-unit-output-evidence-v2` sidecar.  The sidecar
is intentionally incomplete at the final output boundary: the factor, reduce,
and combine maps, an independent unit-saturation certificate, a proved
factor-base bound, and public API integration remain absent.

## Phase 3: complete

The immutable fresh correspondence retains the actual computation surface:

- 66 factor-base ideals, each represented by a 3-by-3 HNF;
- 73 relation vectors and principal generators;
- 73 rows of packed archimedean relation data;
- the 73-by-73 sparse-cleanup transform; and
- the active 8-by-15 relation matrix, 15-by-15 HNF transform, and 8-by-15
  full HNF.

`row0_raw_relation_smith_proof.cjs` expands this ancestry into full matrices

```text
U [73,73] * R [73,66] * V [66,66] = D [73,66].
```

The proof has 66 unit Smith factors and seven raw relation dependencies.  Its
focused checker independently multiplies the identity and verifies both
transform determinants are one.  The v2 adapter publishes the full `U`, raw
`R`, `V`, `D`, dependencies, and construction provenance.  It does not
relabel the smaller terminal 8-by-8 presentation as a raw proof.  Phase 3 is
therefore complete under the shared contract.

## Phase 4: material retained, completion withheld

The sidecar binds two compact relation transforms, their packed logs and
provenance, two exact cubic units and exact norms, the exact order-two torsion
generator, and the independently constructed rigorous regulator enclosure.
The checker verifies both unit norms and cold-replays the complete retained
owner bundle.

This is strong phase-4 material, but the plan separately requires an
independent unit-saturation certificate.  That certificate is not retained,
so `phase4Complete` remains false.  The upstream factor-base bound also remains
an explicit PARI assumption rather than a proof.

## Remaining boundary

All general maps are marked unready and publish no fabricated evidence.
`phase5Complete` and `outputBoundaryComplete` are false.  The exact missing
list is:

- `combine-lazy-materialization`;
- `factor-lazy-materialization`;
- `independent-unit-saturation-certificate`;
- `proved-factor-base-bound`;
- `public-api-integration`; and
- `reduce-lazy-materialization`.

The projection makes no timing, qualification, or public-result claim.

Run the focused replay against the durable fresh result:

```sh
node bench/pari-class-group-port/check_row0_class_unit_output_evidence_v2.cjs \
  /path/to/row0-class-unit-result-dbf645dd5bdf4eb2f27dbaa769d1c08d454c551318a32611b47a1a232754da58.json
```
