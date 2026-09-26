# Panel row 21: authentic initial collection and first HNF

This cut advances the authenticated row-21 prepared number field, factor-base
owner, and five-relation frontier through the ordinary translated
`small_norm -> hnfspec` path.  It collects the requested 32 relations and
executes the first HNF; no relation, candidate, log, or HNF value from W0 is a
runtime input.

The shared collector now admits degree five only through a narrow corridor:
prebuilt 24-ideal packets, the first `small_norm` pass, 192-bit precision,
signature `(3,1)`, and the authenticated 5-to-32 relation state.  Prime-power
packet construction and outer retry modes remain rejected.  This is a bounded
admission of the already owned row-21 ideal catalog, not a general deletion of
the former degree-four guard.

The factor owner stores each descriptor `tau` column-major, while the
valuation catalog consumes it row-major.  The host performs that documented
representation conversion.  Prime-ideal HNF packets stay in their existing
row-major representation.

The resulting native state is:

```text
relation state  [32, 370, 0, 0, 0, 32]
chain state     [3, 0, 5, 32]
HNF state       [0, 8, 24, 0, 8, 5, 0, 32, 0]
H shape         [0, 0]
dep shape       [0, 0]
B shape         [0, 24]
C shape         [4, 32]
```

The collector's ranked preparation completed natively with `useflatter = 0`.
It needed five candidate attempts and admitted all 27 missing relations; the
final relation owner contains 32 exact dense exponent rows, 32 exact
generators, their source metadata, and 128 exact log scalars.

W0 is opened by the checker only after two independent publications agree
byte-for-byte.  The postcompute oracle check identifies equal-degree ideals by
their mathematical degree-one quotient root.  This matters at `p = 29`: the
committed general-decomposition factor owner and PARI's Kummer decomposition
contain the same three ideals in different orders.  After that independently
derived ideal-identity conversion, all 32 relation rows agree exactly.  The
generators and metadata agree directly.  HNF shapes agree; the packed exact log
columns agree as a set, with the final two independent columns exchanged by
the equivalent local ideal order.  This owner retains the committed factor
order throughout instead of importing a W0 column map.

The checker also rejects mutated prepared, factor, and relation authorities
before publication.  Reproduce using a lane-local native cache:

```sh
SAGEJS_NATIVE_CACHE_DIR=/scratch/sagejs-row21-hnf-native-cache \
node bench/pari-class-group-port/check_row21_first_hnf.cjs \
  /scratch/sagejs-row21-first-hnf-inputs/prepared.json \
  /scratch/sagejs-row21-relation-lane/row21-prepared-factor-base-7784eef663b7ca2fad9259f2efe642a14aac511331d0ca9de93fae050aebc533.json.gz \
  /scratch/sagejs-row21-first-hnf-relations/row21-initial-relations-55f1f55a6b02a5d703834af49a716280f7841f3b399af92cdaf258c4b9855233.json.gz \
  /scratch/sagejs-pari-development-panel-a998/panel-21-6966124ec38a3af1.json
```

Deterministic identities from the validated workspace:

```text
owner SHA256      a0eec806853ea37226ded40be707f95abb414b9af6e3bb0a811493147382c136
compressed SHA256 f1ba62a7f616673284bc8b69c3a317d6d8cd4052cdd018258cf306a21f42d430
connected source  5a08a7eac74ea16c532969783f034a7e70f6ab792dc0168133aee8e90743e709
collector source  d5d18688ecd45546ebd3ef4e76e9efb87c142c7d3a1f74cdfd3ef4e539ca1224
native core       ed56ac07ff2a93ca5bb75d1f3d63a232313300ae410c2ee6d37820abf8b34ef8
```

This closes the authentic 5-to-32 initial collection and first-HNF slice.  It
does not claim later HNF iterations, class-group saturation, regulator, or unit
recovery.
