# Row 23 honest immutable final assembly

This lane joins panel row 23's authenticated prepared field, 31-ideal factor
base, live 40-relation HNF, analytic acceptance, cyclic class witness,
degree-five ideal correspondence, and four live exact units into one immutable
`buchall_end`-equivalent internal result. W0 is opened only after publication,
detached replay, concurrency, and all negative tests.

## Authorities

```text
prepared authority   0bb8aa6665e3cfdb5184f53cb4ded97655007da9d08e9969c052f81a3640a299
factor owner         b4fa7209eb9fcd86438dc8d1f0fac9d194a32535f612de97ed605da6ca2bf439
relation/HNF owner   2d6fea4e7b2b5bdc4bf7adc6ca198f4a09072446ff405c774583e7d97e54761f
acceptance owner     eeaa34177b556abd306c1f2e84fe1a09aeac2cb6b418dcca0dd199dbfb1bfb33
class witness        beafd37a044a22ae3fdb8996993901b69aee39dec2095d444d88596344a69b50
degree-5 owner       0dae599f70d46e1de77804b8a47c277d20114f31555f1c7db68587c7b78dd68b
exact-unit owner     54dd682a216054b5278806ba1f943f6ca94407ffe0d3b4c1e05e6111e78a2712
```

The relation owner retains all 31 by 40 relation cells, 40 principal
generators and metadata records, active cleanup/HNF transforms, terminal
`W=[6]`, `B`, permutation, 315 unit-log cells, and the one initialized 35-cell
class column placed by `hnffinal` at `zc + nonunit = 9`. It does not retain the
uninitialized capacity tail. The acceptance owner retains the analytic
catalog, accepted 4 by 9 unit lattice, regulator, and terminal states.

## Exact class correspondence

Detached replay recomposes the cleanup and HNF maps and proves

```text
R * c = 6 e_0.
```

The Smith presentation is cyclic of order six, with proper divisors 1, 2, and
3 rejected. Expanded degree-five ideal arithmetic proves

```text
J^6 = (55527 + 2886*w - 7934*w^2 - 1304*w^3 + 695*w^4).
```

The source-derived `idealred0 -> idealpseudomin` path has pseudominimum
`[7,0,0,0,0]`. PARI's scalar short circuit returns the same prime-above-7
ideal and a trivial factor matrix. Thus `Ge` is the multiplicative identity,
`Ga=nf_cxlog(Ge)=0`, and `ga=0`.

Cold replay applies PARI's totally-real quintic `cleanarch` to the authenticated
class column: subtract the mean of five real components and reduce arguments
modulo `2*pi`. With `M1=Ur=[1]`, `M2=[0]`, and `cyc=[6]`, PARI's formula gives

```text
GD = cleanarch(Ce) - 6*Ga = cleanarch(Ce)
ga = 0*Ce - 1*Ga = 0.
```

Direct `nf_cxlog(alpha)` independently agrees with the live raw class column.
W0 used a different valid relation/HNF basis and hence a unit-shifted principal
certificate; raw `GD` bytes are not canonical across these runs. Postcompute
W0 checks the exact one-column/five-place shape, zero `ga`, trivial `Ge`,
`M1=[1]`, `M2=[0]`, invariant `[6]`, and identical reduced ideal.

## Exact units and honest boundary

The four integral-basis units retain exact inverses, norms `[-1,1,1,1]`, real
signs, relation-to-unit transform, unimodular `getfu` factor, packed logs, and
all reconstruction states. Cold replay multiplies every inverse and computes
every multiplication determinant. Torsion is exactly `-1` of order two.

The accepted regulator packet is

```text
[58120758344776579206426528395464800380047988883988014887510864319728839258178,
 256,
 12].
```

Its mantissa is 981 below W0 at the same precision and exponent. This is
floating correspondence evidence, not a rigorous interval enclosure.

```text
buchallEndEquivalentAssemblyComplete = true
correspondenceComplete = true
publicComplete = false
```

The row-specific correspondence gap is closed, but the result still inherits
PARI 2.17.4's GRH-dependent factor-base policy, heuristic bounds, and floating
acceptance. It is not an independent saturation proof or a general production
`ClassUnitComputation`.

## Publication and negative replay

Thirty-two concurrent identical publications return one object. Validation
rejects 89 semantic mutations, six rehashed embedded-owner attacks, and
independent mutations of all seven source owners. File publication is an
`fsync`ed temporary followed by atomic rename.

```text
result SHA-256      fbd08bfcdac231240ab6085aa7eff96d4f261cedfd37b647024494fa2384a318
canonical bytes     127657
gzip SHA-256        002a8d7b2b3f2280e179ec0465800c84ad8ea8ed4ec184bb957c7356bf045d6c
artifact            /scratch/sagejs-row23-final-result-correspondence-v3/row23-final-fbd08bfcdac231240ab6085aa7eff96d4f261cedfd37b647024494fa2384a318.json.gz
```

Reproduce the cold replay:

```bash
node bench/pari-class-group-port/check_row23_final_result.cjs \
  /scratch/sagejs-row23-prepared-authority/prepared-0bb8aa6665e3cfdb5184f53cb4ded97655007da9d08e9969c052f81a3640a299.json \
  /scratch/sagejs-row23-class-witness-factor/row23-prepared-factor-base-b4fa7209eb9fcd86438dc8d1f0fac9d194a32535f612de97ed605da6ca2bf439.json.gz \
  /scratch/sagejs-row23-final-inputs-correspondence-v2/row23-live-relation-hnf-2d6fea4e7b2b5bdc4bf7adc6ca198f4a09072446ff405c774583e7d97e54761f.json.gz \
  /scratch/sagejs-row23-final-inputs-correspondence-v2/row23-live-acceptance-eeaa34177b556abd306c1f2e84fe1a09aeac2cb6b418dcca0dd199dbfb1bfb33.json.gz \
  /scratch/sagejs-row23-class-witness-owner/row23-cyclic-class-witness-beafd37a044a22ae3fdb8996993901b69aee39dec2095d444d88596344a69b50.json.gz \
  /scratch/sagejs-row23-degree5-correspondence-owner/row23-degree5-correspondence-0dae599f70d46e1de77804b8a47c277d20114f31555f1c7db68587c7b78dd68b.json.gz \
  /scratch/sagejs-row23-live-unit-owner-EgAF9O/row23-live-exact-unit-owner-54dd682a216054b5278806ba1f943f6ca94407ffe0d3b4c1e05e6111e78a2712.json.gz \
  /scratch/sagejs-pari-development-panel-a998/panel-23-c3077e07c31ac758.json \
  /scratch/sagejs-row23-final-result-correspondence-v3
```
