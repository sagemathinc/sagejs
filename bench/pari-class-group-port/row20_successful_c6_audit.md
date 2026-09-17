# Panel row 20: successful exact-unit C6

This owner authenticates pristine W0 SHA-256 `6ea7098d80c586a7fbf050f9f650f4a3bff258cd84dd7a2a3c7dab210d1bf468`
for `x^5 - 5*x - 12`, signature `(1, 2)`, and unit rank two. Its arithmetic
boundary uses only the prepared maximal order, HNF exact logarithms, accepted
rank-two relation lattice, and accepted regulator. It does not import the
reference `fu`.

The connected C3--C5 suffix independently obtains integer-LLL state
`[5,5,2,0,0]`, compact transform
`[1,0,0,0,0,0,0; -1,1,0,0,0,0,0]`, cleanarch state
`[0,2,2,-188,-185,-1]`, and the private column-major getfu factor
`[0,1;1,0]`. The degree-five C6 extension evaluates six complex exponentials,
realifies the one real and two complex embeddings into a `5 x 5` solve,
rounds two integral-basis columns, and authenticates both with the prepared
`5^3` multiplication tensor. Its exact terminal state is
`[0,3,-186,0,-185,1,2,-1]`; inverse mask one selects the smaller first unit.

The exact units, in the prepared integral basis, are
`[7,-7,15,-9,9]` and `[-27,15,8,6,-9]`. Only after C6 publishes these values
does the composer read `fundamental_units.U`, `.A`, and `.fu` for comparison.
The cold exact replay records the exponent of each unit through all seven raw
logarithmic generators, recomputes its norm as the determinant of exact
multiplication (`-1` in both cases), constructs its exact inverse, and proves
the product basis is `[1,0,0,0,0]`, hence the principal ideal is one. It also
converts from integral-basis coefficients through `prepared.zk / 4` to the
power basis: `[-8,-61/4,51/4,-33/4,15/4]` and `[-35,16,-7,1,2]`.
The immutable output records separate digests for the source C3--C5 owner and
prepared maximal-order owner, plus the pristine W0 ancestry.

`check_row20_successful_c6.cjs` covers repeatable CPython publication,
content addressing and mode `0444`, source-lattice mutation rejection, and a
poisoned-`fu` timing probe proving the poison remains present when C6 runs and
is consulted only afterward. It also compiles the new exact quintic
unit/inverse primitive and checks JavaScript-exact and native GMP execution
against the independently computed inverse pair. A rejected coordinator call
leaves no output directory, covering failed-publication atomicity.
