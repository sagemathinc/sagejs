# Panel-1 presentation authority

`panel1_presentation_authority.py` turns frozen development-panel row 1 into
an exact, detached presentation owner. The only producer input is W0: prepared
field data, all 51 prime descriptors, and all 58 retained principal-relation
witnesses. Class/unit output events are not producer fixtures.

The replay reconstructs each prime-ideal HNF, recomputes each principal
generator's packed logarithms, and checks all 58 exact principal ideal
equalities. The translated `hnfspec` reaches the observed state
`[1,8,50,0,7,5,0,58,0]`; its 3-by-58 packed output agrees cell-for-cell with
the retained HNF event. Reversing the cleanup and active `hnffinal`
transformations yields a column-major 58-by-7 kernel map `T` and a 58-by-51
presentation map `V`. The authority proves `R*T = 0` and publishes the full
51-by-51 matrix `P = R*V`.

The Bareiss determinant of `P` and the source-transparent Smith replay of its
non-unit HNF block independently give class number 3 and invariant `[3]`.
Only after those computations does the replay compare the frozen result event.
The acceptance lattice and regulator are retained for the exact-unit lane, but
they do not influence the class presentation.

The coordinator authenticates the W0, prepared, events, terminal-result, and
prepared-number-field digests. It publishes atomically, idempotently, and
content-addressed at mode 0444. The focused checker performs two cold replays,
rechecks both matrix equations in JavaScript, and rejects mutations of raw
relations, generators, ideals, kernel/presentation maps, retained transforms,
root isolation, W0 bytes, and the W0 digest.
