# Row 21 final immutable result and replay

This lane completes the source-required `buchall_end`-equivalent assembly for
panel row 21. It consumes only authenticated live owners produced earlier in
the row-21 chain:

- prepared number field authority
  `63378e8424e81d0d5653d965ef18a518b78ec7f78b66f57afcc55052849ac95f`;
- 24-ideal factor-base owner
  `7784eef663b7ca2fad9259f2efe642a14aac511331d0ca9de93fae050aebc533`;
- 32-relation first-HNF owner
  `a0eec806853ea37226ded40be707f95abb414b9af6e3bb0a811493147382c136`;
- analytic/HNF/log/regulator acceptance owner
  `530fbd38198464fcac1285402cdb1394bdb8ce82f876198770aaef475b2749bb`;
- exact rank-three unit owner
  `8d474d9ddbcaa1d8cfca584b089e666100f143834105ce393f82f34b0140fcd9`.

The frozen W0 trace is not opened by construction or replay. The checker opens
it only after two independent publications, detached replay, concurrent
idempotence, input-authority attacks, and all material-field mutations have
completed.

## Exact class presentation

Class number one is derived rather than copied. The publisher reruns Cohen's
column-Hermite algorithm on the retained 24-by-32 relation matrix while
tracking its complete 32-by-32 unimodular column transform `V`. Exact replay
establishes

```text
A * V = [0_(24x8) | I_24],   det(V) = 1.
```

The final 24 columns of `V` are consequently an integral right inverse of the
relation map. This proves that the retained relations span `Z^24`; the class
presentation has class number 1, no nontrivial invariant factors, no generator
ideals, and no generator-order relations. The Smith presentation is the exact
24-by-24 identity. The empty generator-order-witness condition is therefore
mathematically vacuous, not omitted work.

All 32 relation rows, their five integral-basis generator coordinates, their
metadata, HNF state, exact packed logarithms, acceptance coordinates, real
logs, and 8-by-3 accepted relation lattice remain in the immutable result. The
entire authenticated factor-base, first-HNF, acceptance, and unit owners are
also retained under fixed source-specific content hashes.

## Exact units, torsion, and regulator

The three live fundamental units and their inverses are retained in integral-
basis coordinates. Detached replay multiplies every unit/inverse pair using
the authenticated 125-entry multiplication tensor and obtains one exactly. It
independently computes each multiplication determinant and obtains norms
`[-1,-1,-1]`. The nine real signs, 8-by-3 relation-to-unit transform,
unimodular 3-by-3 `getfu` factor, lattice states, `cleanarch` state, `getfu`
state, and packed output logarithms are retained and authenticated.

The field has exactly two roots of unity. The torsion generator is `-1`, with
integral-basis coordinates `[-1,0,0,0,0]`, inverse itself, norm `-1`, and exact
square `[1,0,0,0,0]`.

The accepted regulator is

```text
[5992046333468088822741755840508858568018241354821770564346, 192, 16].
```

The analytic inverse-`hR`, catalog state, acceptance state, multiple state,
and reconstruction state are retained beside it. This is faithful PARI 2.17.4
correspondence evidence; it is not relabeled as a rigorous regulator enclosure.

## Final assembly and publication

The result publishes the trivial `clg1`, the six source-ordered empty `clg2`
components `Ur, ga, GD, Ge, M1, M2`, the three exact units, torsion, regulator,
factor base, relations, transformations, and terminal zero state. The status is
`published-upstream-assumed-buchall-end-v1` with:

```text
correspondenceComplete = true
buchallEndComplete = true
phase5CompleteForRow21 = true
publicComplete = false
```

Publication validates the complete draft before taking the lock. Equal repeat
publication returns the same immutable object, conflicting publication fails,
and filesystem publication uses a fully written and `fsync`ed temporary file
followed by atomic rename. The checker exercised 32 concurrent identical
publications.

The deterministic publication is:

```text
result SHA-256      92d7ecc79647fed4c330e2d1a97f50420623843bcd4320a7322a7422f168eb03
canonical bytes     148129
gzip SHA-256        4cb9d6f132656275cbfc1c2341ffac4b2a4171ef23007d05b409e9e16930f796
artifact            /scratch/sagejs-row21-final-result/row21-final-92d7ecc79647fed4c330e2d1a97f50420623843bcd4320a7322a7422f168eb03.json.gz
```

## Negative and postcompute checks

The checker rejects mutations to 53 material paths, including every source
authority, field and multiplication-table data, factor-base ideal, relation,
owner length/shape, HNF transform, Smith entry, packed log family, regulator
evidence, exact unit/inverse/norm/sign, torsion entry, assumption, `clg1`,
`clg2`, and terminal status. It also rejects four source-owner attacks after
their local content hash is recomputed and rejects independent mutations of
all five input authorities before publication.

Only then is W0 opened. As a postcompute oracle it independently confirms the
class number, regulator, exact compact unit transform, all three exact units
(after exact conversion from W0's polynomial coordinates to the live integral
basis), trivial `clg1`, six empty `clg2` components, and terminal zero state.

Reproduce:

```sh
node bench/pari-class-group-port/check_row21_final_result.cjs \
  /scratch/sagejs-row21-first-hnf-inputs/prepared.json \
  /scratch/sagejs-row21-relation-lane/row21-prepared-factor-base-7784eef663b7ca2fad9259f2efe642a14aac511331d0ca9de93fae050aebc533.json.gz \
  /scratch/sagejs-row21-first-hnf-owner/row21-first-hnf-a0eec806853ea37226ded40be707f95abb414b9af6e3bb0a811493147382c136.json.gz \
  /scratch/sagejs-row21-acceptance-owner/row21-live-hnf-log-regulator-530fbd38198464fcac1285402cdb1394bdb8ce82f876198770aaef475b2749bb.json.gz \
  /scratch/sagejs-row21-live-unit-owner/row21-live-units-8d474d9ddbcaa1d8cfca584b089e666100f143834105ce393f82f34b0140fcd9.json.gz \
  /scratch/sagejs-pari-development-panel-a998/panel-21-6966124ec38a3af1.json \
  /scratch/sagejs-row21-final-result
```

## Remaining boundary

This closes the final row-21 PARI-correspondence assembly. It does **not** close
the campaign's general or public-certification boundary. Remaining work is:

- a rigorous regulator enclosure rather than PARI's accepted floating value;
- an independent class/unit saturation certificate;
- an unconditional or independently proved factor-base bound in place of the
  explicitly inherited PARI/GRH assumptions;
- promotion of this field-specific transaction into the general prepared-field
  spine and eventually the existing public `ClassUnitComputation` contracts;
- PARI's optional lazy `makeunits`, `makematal`, and `makecycgen`
  materializations, which the plan explicitly excludes from this first matched
  flag-zero workload.

Accordingly `publicComplete` remains false even though the row-21 internal
PARI-correspondence result and `buchall_end` state are complete.
