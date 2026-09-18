# Row 23 honest immutable final assembly

This lane joins panel row 23's authenticated prepared field, 31-ideal factor
base, live 40-relation HNF, analytic acceptance, cyclic class witness, and four
live exact units into one immutable `buchall_end`-equivalent internal result.
The frozen W0 trace is not opened during construction or replay. The checker
opens it only after publication, detached replay, concurrency, and all negative
tests have completed.

## Authorities

The bound inputs are:

```text
prepared authority   0bb8aa6665e3cfdb5184f53cb4ded97655007da9d08e9969c052f81a3640a299
factor owner         b4fa7209eb9fcd86438dc8d1f0fac9d194a32535f612de97ed605da6ca2bf439
relation/HNF owner   c670fa0469c5a0e0dcdbb9cd5c5ba3581ff31328a8829d6f41120fa9a72db9dc
acceptance owner     c7dcd34c9e328ee225b4c51c6dbaa70b376550b1fa30b48fce2f189bb4185680
class witness        beafd37a044a22ae3fdb8996993901b69aee39dec2095d444d88596344a69b50
exact-unit owner     54dd682a216054b5278806ba1f943f6ca94407ffe0d3b4c1e05e6111e78a2712
```

`row23_final_inputs_coordinator.cjs` publishes the two previously ephemeral
live projections. The relation owner retains all 31 by 40 relation cells, 40
principal generators, 40 metadata records, the full active 40 by 40 cleanup
transform, active 4 by 13 HNF, 13 by 13 HNF transform, 13 by 13 lambda and
14 denominator cells, terminal `W=[6]`, empty dependency block, `B`,
permutation, and all 315 active exact log cells. The acceptance owner retains
the analytic catalog, inverse `hR`, accepted 4 by 9 unit lattice, 135 packed
analytic log cells, 108 reconstruction coordinates, regulator, and every
terminal acceptance state.

## Exact class and unit state

Detached replay recomposes the live cleanup and HNF maps and proves

```text
R * c = 6 e_0.
```

The same 40 coefficients and 22 supported principal generators occur in the
authenticated compact order witness. The one-dimensional Smith calculation
gives class group `[6]`, and proper divisors 1, 2, and 3 are rejected by the
presentation. The selected ideal is the live prime above 7.

The four exact integral-basis units are retained together with exact inverses,
norms `[-1,1,1,1]`, their 4 by 5 real-sign matrix, 4 by 9 relation-to-unit
transform, unimodular 4 by 4 `getfu` factor, 140 packed output-log cells, and
all lattice, `cleanarch`, reconstruction, and exact-verification states. Cold
replay multiplies each unit by its inverse and obtains one, then independently
computes the multiplication determinant and obtains the published norm.

The accepted regulator is

```text
[58120758344776579206426528395464800380047988883988014887510864319728839258178,
 256,
 12].
```

Its mantissa is 981 below the independent PARI trace at the same precision and
exponent, within the already audited acceptance tolerance. It remains PARI
floating-correspondence evidence, not a rigorous interval enclosure.

Torsion is exactly `[-1,0,0,0,0]` of order two and norm -1. Its inverse and
square are replayed with the authenticated multiplication tensor.

## Honest completion boundary

The result deliberately records

```text
buchallEndEquivalentAssemblyComplete = true
correspondenceComplete = false
publicComplete = false
```

This is the honest pre-gap final assembly. Generic degree-five `idealred` and
expanded degree-five ideal-product replay have not yet been translated. The
result therefore retains the selected live ideal and compact exact order-six
relation, but does not relabel them as a source-derived reduced `ga`, fabricate
the missing class logarithm `GD`, or claim exact PARI `clg2` shape. These gaps
are explicit in both `limitations` and `buchall.clg2.missing`.

The result also inherits PARI 2.17.4's GRH-dependent factor-base policy,
heuristic bounds, and floating acceptance. It does not provide an independent
unit/class saturation certificate or a production `ClassUnitComputation`.

## Publication and negative replay

Publication validates the full draft before taking its lock. Thirty-two
concurrent identical publications return the same object. An unequal terminal
result conflicts. File publication uses a fully written and `fsync`ed temporary
file followed by atomic rename.

The checker rejects:

- 80 semantic mutations spanning every source authority, field data, owner,
  factor-base family, relation family, HNF transform, log family, class witness,
  unit/inverse/norm/sign/transform, regulator state, torsion, assumptions,
  limitations, and terminal status;
- five embedded-owner attacks after recomputing the owner's local content hash;
- independent mutations of all six immutable source files.

Only then does W0 confirm `[6]`, the selected ideal, four reference units, and
the nearby accepted regulator.

The deterministic publication is:

```text
result SHA-256      61acb4863c72ddd2aba9fe9bd2b902bc9a872e3cde1638c537c5d1a4cbcc3a62
canonical bytes     123927
gzip SHA-256        18001eee64c4f06beea801dfed02b989b488466b419238ca5b04628097799bf6
artifact            /scratch/sagejs-row23-final-result-v2/row23-final-61acb4863c72ddd2aba9fe9bd2b902bc9a872e3cde1638c537c5d1a4cbcc3a62.json.gz
```

Reproduce the final replay without recompilation:

```bash
node bench/pari-class-group-port/check_row23_final_result.cjs \
  /scratch/sagejs-row23-prepared-authority/prepared-0bb8aa6665e3cfdb5184f53cb4ded97655007da9d08e9969c052f81a3640a299.json \
  /scratch/sagejs-row23-class-witness-factor/row23-prepared-factor-base-b4fa7209eb9fcd86438dc8d1f0fac9d194a32535f612de97ed605da6ca2bf439.json.gz \
  /scratch/sagejs-row23-final-inputs/row23-live-relation-hnf-c670fa0469c5a0e0dcdbb9cd5c5ba3581ff31328a8829d6f41120fa9a72db9dc.json.gz \
  /scratch/sagejs-row23-final-inputs/row23-live-acceptance-c7dcd34c9e328ee225b4c51c6dbaa70b376550b1fa30b48fce2f189bb4185680.json.gz \
  /scratch/sagejs-row23-class-witness-owner/row23-cyclic-class-witness-beafd37a044a22ae3fdb8996993901b69aee39dec2095d444d88596344a69b50.json.gz \
  /scratch/sagejs-row23-live-unit-owner-EgAF9O/row23-live-exact-unit-owner-54dd682a216054b5278806ba1f943f6ca94407ffe0d3b4c1e05e6111e78a2712.json.gz \
  /scratch/sagejs-pari-development-panel-a998/panel-23-c3077e07c31ac758.json \
  /scratch/sagejs-row23-final-result-v2
```

Regenerate the deterministic live relation and acceptance owners with a
lane-private native cache by calling `row23_final_inputs_coordinator.cjs` with
the authenticated prepared projection, factor owner, and output directory.
