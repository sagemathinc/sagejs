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
version 2 yet; it must independently replay the complete catalog before this
version can close even the first public-result evidence gap.

Run the focused structural qualification with:

```sh
node bench/pari-class-group-rust/qualification/public-adapter/prepared-cubic-class-unit-candidate.test.cjs
```
