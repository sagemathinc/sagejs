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
        collector_state=collector_state,
        collector_increment=collector_increment,
        collector_cursor=collector_cursor,
        relation_hashes=relation_hashes,
        relation_metadata=relation_metadata,
        relation_progress=relation_progress,
        relation_schedule=relation_schedule,
        kummer_random_state=kummer_random_state,
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
        compact_unit_factor=compact_unit_factor,
        retained_relation_provenance=retained_relation_provenance,
        exact_units_integral_basis=exact_units_integral_basis,
        published_exact_units_integral_basis=published_exact_units_integral_basis,
        exact_unit_norms=exact_unit_norms,
        rebuilt_unit_logs=rebuilt_unit_logs,
        unit_phases=unit_phases,
        packed_regulator=packed_regulator,
        regulator_interval=regulator_interval,
        regulator_state=regulator_state,
        acceptance_state=acceptance_state,
        reconstruction_state=reconstruction_state,
        attempt_state=attempt_state,
        unified_state=unified_state,
        bridge_state=bridge_state,
        precision_authority_state=precision_authority_state,
        precision_retry_state=precision_retry_state,
        torsion_state=torsion_state,
        torsion_order=torsion_order,
        torsion_generator=torsion_generator,
        invariant_factor_capacity=invariant_factor_capacity,
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
  permutation, relation hashes/metadata, collector cursor/increment, Kummer RNG
  state, scheduler/progress state, and original/transformed packed relation logs;
- active relation matrix, full HNF, HNF transform, bidirectional presentation
  witnesses, and the presentation itself;
- Smith form and both left/right transforms and inverses, `Ur`, `Y`, `Uir`,
  `X`, `M2`, and the packed generator architecture;
- compact/factor and retained unit provenance, pre-getfu and published exact
  integral-basis units, exact norms, rebuilt logarithms and phases;
- packed regulator, exact dyadic enclosure, analytic acceptance/reconstruction
  state, complete retry transcript, and final precision authority;
- torsion order/state and its exact integral-basis generator;
- explicit PARI 2.17.4 and `buch2.c` source identity plus assumption flags,
  including the two deliberately false public completion flags; and
- terminal publication counters proving one atomic snapshot and zero
  intermediate serializations or fixture inputs.

Replay independently checks every principal relation against the factor-base
ideal product, recomputes the relation HNF, verifies both presentation witness
directions, checks the Smith identities and inverses, recomputes `Ur`, `Uir`,
`M2`, and the transformed logarithms, reconstructs the exact units from live
relation provenance, checks exact unit norms, product formula, regulator
determinant/enclosure, and the real-cubic torsion state. Thus a coordinated
attacker that recomputes both hashes after changing a component is still
rejected by the mathematical replay.

## Focused evidence and limits

`check_unified_h1_terminal_snapshot.cjs` calls the actual
`pari_unified_complete_h1_root`, copies all logical live prefixes once after
the native boundary, and cold-replays the detached data in a separate CPython
process. It also rebuilds a rigorous regulator enclosure from the published
exact units in an independent Sage.js session; the live regulator and all six
packed logarithms must lie in those exact-unit enclosures. The older
`check_h1_terminal_owner_snapshot.cjs` remains only a small component-contract
test and is not evidence for the actual unified publication.

The unified checker exports synchronous `authenticateFinalPublication`. The
standard adapter supplies its already authenticated result digest plus borrowed
`replayOwners`; the hook performs the one bulk copy, launches the detached
exact/regulator replay, and returns only
`cold-replay-authenticated/resultSha256/authoritySha256`. The native root itself
leaves correspondence false, and repeated calls are rejected; only this cold
receipt may promote the experimental adapter's internal correspondence status.

The focused checker cold-replays the detached bytes and then re-seals eleven
coordinated mutations covering relations, HNF input, Smith data, unit
provenance, exact units, logarithms, regulator, torsion, assumptions, and
terminal state. All are rejected by semantic replay rather than by relying only
on stale hashes.

The current schema intentionally freezes the authentic H1 dimensions (degree
3, 66 factor-base ideals, 73 relations, 8 presentation rows, unit rank 2). A
future general-degree public result should introduce a new schema after its
dynamic shape limits and replay rules are proved; it should not silently relax
this bounded schema.
