# Prepared-cubic public-adapter qualification

These files validate untrusted Rust candidate evidence. Passing either schema
does not authorize a complete Sage.js class group, unit group, or proof status.

`prepared-cubic-class-unit-candidate.schema.json` describes retained version-1
artifacts. Those artifacts predate a complete factor-base/relation catalog, so
their shape cannot support independent `RelationPresentation` construction.

New diagnostic output uses producer schema
`sagejs.rust-class-group/prepared-cubic-class-unit-v2` and qualification schema
`prepared-cubic-class-unit-candidate-v2.schema.json`. Version 2 requires one
atomic `relationLatticeEvidence` object containing the complete factor-base
catalog and every collected integral principal relation. Its records are
construction evidence only. The public adapter deliberately does not accept
version 2 by itself. The experimental compact-presentation adapter first
reconstructs every catalog entry as a live maximal-order prime, checks its
ramification identity against an independent rational-prime factorization, and
proves every exported relation by exact equality between the generated
principal ideal and the reconstructed factor-base product. It then replays the
complete quotient lattice. This closes relation principality and live
factor-base ownership, but still returns an incomplete `ClassUnitComputation`:
the Rust arbitrary-ideal query producer is not yet connected, and live units
and saturation, completion-proof replay, request/resource binding, and
executable identity remain absent.
The retained context does expose live invariant-factor generator ideals,
representative ideals from certified coordinates, and exact coordinates for
ideals already smooth over the authenticated factor base. Arbitrary ideals
now have a closed, bounded certificate-replay method. It independently checks
`(alpha) = I * product(P_i^e_i)`, derives the signed quotient vector and class
coordinates, and rejects field/presentation substitution. The sealed Rust
result likewise now owns a single query method which performs reduction,
mapping, and independent replay against its retained authenticated state. The
remaining integration gap is serialization and transport between those two
implemented ends; automatic public queries remain explicitly unsupported.

Run the focused structural qualification with:

```sh
node bench/pari-class-group-rust/qualification/public-adapter/prepared-cubic-class-unit-candidate.test.cjs
```
