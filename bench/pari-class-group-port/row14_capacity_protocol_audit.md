# Row-14 relation-owner capacity audit

## Frozen boundary

This lane uses the prepared row-14 oracle only as an authenticated output
comparison:

- field: `x^4 - 200000002*x - 200000002`
- id: `generated-sha256-e1d4643ab62bde9546d63340545e5302c2cef517222d569e634fb5e2093f6413`
- oracle: `/scratch/sagejs-pari-development-panel-a998/panel-14-aa0aa6152d8cf26c.json`
- payload SHA-256: `13f7e37fe4ba3c610e2c4340c243fa9da398b8d32a272b3c450525c287afe18a`
- prepared SHA-256: `66acb1a0be37d798bbf4d72459505b52a2d59ced3914246617d775359fc419cb`
- complete-events SHA-256: `ed6426cbb8e8525864ff4910f3a6e1c7abecd406f9a53464bc7e1e1042305ad3`
- terminal-event SHA-256: `77192dc76e34f30ad3c61eeb89b3f243fb0bfa17f96c3037d8bde374f1579920`
- event count: 5,397

No capacity is copied from a terminal answer. The checker derives the
factor-base row count, degree, number of archimedean places, source
`add_need`, pass count, live target, and initial reserve from authenticated
boundary records before comparing the report. It invokes no PARI operation.

## Protocol

`relation_owner_capacity.py` adds a field-neutral 32-word protocol. It reports
scalar extents for every owner coupled to relation count or factor-base width.
The report is versioned and distinguishes three source events:

1. `init_rel`: `record_reserve = 10 * (KC + add_need) + 50`;
2. `pre_allocate`: when `last + n >= capacity`, the replacement capacity is
   `2 * (last + n)`;
3. accepted-pass suffix publication: exact relation and logarithm column
   extents.

The report includes the relation basis/cache/hash/metadata owners, generator
columns, logarithms, search and outer-loop owners, append suffixes, invariant
output, and driver state/trace. The root checks all owners at entry before its
first write. On an entry miss, only `capacity_state` is intentionally
published; every caller-owned mathematical or driver buffer remains unchanged.

A later miss can only be discovered after private collection arithmetic has
run. Its contract is deliberately narrower: public result owners are not
published, `capacity_state` reports the derived requirement, and the caller
must discard **all** private scratch owners and restart from the authenticated
prepared `nfinit` boundary. It is not a promise that those discarded scratch
buffers remain byte-for-byte unchanged.

## Qualified result

`check_row14_capacity_protocol.cjs` authenticates all four hashes and tests the
same source under CPython, the JavaScript fallback, native GMP, and native
tagged backends. For bounded shapes it exhaustively shortens each nonempty
owner by one slot. For the row-14 initial boundary it performs the same
exhaustive test on native owners and hashes the retained exact-size owners
before and after the preflight.

The derived initial report is:

- rows: 799
- degree: 4
- places: 3
- live target: 806
- record reserve: 8,110
- total reported scalar cells: 7,207,387
- dominant owner: 6,479,890 relation-record cells

Those numbers are checker output, not constants in the implementation. With
one-limb native integer cells the qualified gate occupies roughly 100 MB and
passes inside a 4 GiB address-space limit. The checker also exercises a bounded
sequence of source `pre_allocate` reports and confirms that every extent is
computed from the live prefix.

This is a capacity-gate result, not the final class-group result. The lane does
not claim the 806-relation/HNF `[24, 8]`/class-number-192 acceptance until the
integration root can construct all remaining prepared owners under the same
memory ceiling. If authentic word-capacity measurements push that root near
4 GiB, the next step is packed or reused relation-record storage rather than a
larger acceptance machine.

