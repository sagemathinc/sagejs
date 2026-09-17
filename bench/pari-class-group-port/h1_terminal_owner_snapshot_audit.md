# H1 terminal numeric-owner snapshot

This lane defines the terminal, data-only publication boundary for the unified
totally-real cubic worker. It does not make the current class/unit computation
publicly complete. Its purpose is narrower: once the native root has succeeded,
the host can detach all durable mathematical state exactly once, validate the
cross-component identities, and seal a canonical snapshot that is replayable in
a cold process.

## Call boundary

The final native root should retain its preallocated numeric owners until this
single host call returns:

```python
snapshot = capture_h1_terminal_owner_snapshot(
    H1TerminalNumericOwners(
        terminal_state=terminal_state,
        polynomial=polynomial,
        integral_basis=integral_basis,
        multiplication_tensor=multiplication_tensor,
        factor_base_ideals=factor_base_ideals,
        factor_base_norms=factor_base_norms,
        relation_records=relation_records,
        principal_generators=principal_generators,
        cleanup_transform=cleanup_transform,
        initial_permutation=initial_permutation,
        original_relation_logs=original_relation_logs,
        active_relation=active_relation,
        full_hnf=full_hnf,
        active_hnf_transform=active_hnf_transform,
        transformed_relation_logs=transformed_relation_logs,
        relation_to_presentation=relation_to_presentation,
        presentation_to_relation=presentation_to_relation,
        presentation=presentation,
        smith=smith,
        left=left,
        left_inverse=left_inverse,
        right=right,
        right_inverse=right_inverse,
        ur=ur,
        y=y,
        uir=uir,
        x=x,
        m2=m2,
        generator_arch=generator_arch,
        compact_unit_provenance=compact_unit_provenance,
        retained_relation_provenance=retained_relation_provenance,
        exact_units_integral_basis=exact_units_integral_basis,
        exact_units_power_basis=exact_units_power_basis,
        rebuilt_unit_logs=rebuilt_unit_logs,
        unit_phases=unit_phases,
        packed_regulator=packed_regulator,
        regulator_interval=regulator_interval,
        regulator_state=regulator_state,
        torsion_state=torsion_state,
        torsion_generator=torsion_generator,
        assumption_flags=assumption_flags,
    )
)
authority = authority_for_h1_terminal_snapshot(snapshot)
```

This is deliberately a host-side call after native success, not a callback from
generated native code. Each fixed logical prefix is copied once before replay.
Backing buffers may be overallocated, but the logical dimensions are fixed by
`_PREFIX_LENGTHS`. The native computation must not mutate those buffers until
capture returns.

The durable bytes are `snapshot.canonical_json`. A cold reader receives those
bytes plus the separately retained `H1TerminalSnapshotAuthority`, then calls
`cold_replay_h1_terminal_snapshot`. The authority seals the entire envelope;
the envelope also seals the canonical payload. Duplicate JSON keys, booleans in
integer storage, noncanonical integer strings, unknown envelope fields, excess
bytes, or either digest mismatch fail closed.

## Durable content and replay

The snapshot contains the complete terminal numeric state needed by this H1
cut, rather than only the class invariants:

- prepared polynomial, integral basis, multiplication tensor, factor-base
  ideals, and norms;
- all 73 relations and principal generators, cleanup transform and source
  permutation, original and transformed packed relation logs;
- active relation matrix, full HNF, HNF transform, bidirectional presentation
  witnesses, and the presentation itself;
- Smith form and both left/right transforms and inverses, `Ur`, `Y`, `Uir`,
  `X`, `M2`, and the packed generator architecture;
- compact and retained unit provenance, exact units in integral and power
  bases, rebuilt logarithms and phases;
- packed regulator, exact dyadic enclosure and state;
- torsion order/state and its exact integral-basis generator;
- explicit assumption flags, including the two deliberately false public
  completion flags; and
- terminal publication counters proving one atomic snapshot and zero
  intermediate serializations or fixture inputs.

Replay independently checks every principal relation against the factor-base
ideal product, recomputes the relation HNF, verifies both presentation witness
directions, checks the Smith identities and inverses, recomputes `Ur`, `Uir`,
`M2`, and the transformed logarithms, reconstructs the exact units from live
relation provenance, checks the basis conversion, product formula, regulator
determinant/enclosure, and the real-cubic torsion state. Thus a coordinated
attacker that recomputes both hashes after changing a component is still
rejected by the mathematical replay.

## Focused evidence and limits

`check_h1_terminal_owner_snapshot.cjs` adapts the existing successful resident
worker output into the same owner interface as a temporary producer stand-in.
That file access is confined to the checker; the snapshot implementation has
no path, environment, expected digest, resident transcript, or answer fixture
input. The checker builds a self-consistent p2176 logarithm/regulator corridor
to exercise publication and replay. It is not an oracle claim about production
embeddings: the unified root must supply its own live rebuilt logs and rigorous
regulator enclosure.

The focused checker cold-replays the detached bytes and then re-seals ten
coordinated mutations covering relations, HNF input, Smith data, unit
provenance, exact units, logarithms, regulator, torsion, assumptions, and
terminal state. All are rejected by semantic replay rather than by relying only
on stale hashes.

The current schema intentionally freezes the authentic H1 dimensions (degree
3, 66 factor-base ideals, 73 relations, 8 presentation rows, unit rank 2). A
future general-degree public result should introduce a new schema after its
dynamic shape limits and replay rules are proved; it should not silently relax
this bounded schema.
