# Fixed quadratic/quintic stress-candidate supplement

This separately versioned, developer-only source emits **36 polynomial
candidates**, not 36 independently admitted fields or a frozen stress selection.
It changes neither the existing 112-candidate rank-two export nor the frozen
1,800-field coverage, 360-field performance, or 90-field smoke membership. No
database, reference CAS, Sage.js result, timing, or installed optional dependency
is used. Ordinary CPython and its standard library suffice.

```sh
python3 bench/class-unit-groups/general-frontier/corpus/stress_supplement.py plan
python3 bench/class-unit-groups/general-frontier/corpus/stress_supplement.py generate \
  --output /tmp/stress-supplement-v1.json
python3 bench/class-unit-groups/general-frontier/corpus/stress_supplement.py check \
  --fixture /tmp/stress-supplement-v1.json
python3 bench/class-unit-groups/general-frontier/corpus/test_stress_supplement.py
```

Generation exclusively creates a new file and refuses overwrite, including an
existing rank-two export. Failed writes remove only their newly created partial
file. Checking reads at most 1 MiB, rejects duplicate JSON keys and regenerates
the entire fixed export. Unknown versions, changed tuple order, modified roles,
and invented metadata fail even after outer hashes are recomputed. CLI options
do not enlarge the scales, parameter indices, or count ceiling.

## Exact fixed families

| Family | Scales `k` | Indices `j` | Primary / reserve candidates |
| --- | --- | --- | --- |
| `x^2 - 2*(10^k+4*j+1)` | 12,16,20,24,28 | 0,1 | 5 / 5 |
| `x^2 + 2*(10^k+4*j+1)` | 12,16,20,24,28 | 0,1 | 5 / 5 |
| `x^5 - a*x + b` | 4,6,8,10 | 0,1,2,3 | 8 / 8 |

For the quintic, `a=2*(10^k+2*j+1)` and `b=2*(10^k+4*j+1)`.
Quadratic `j=0` and quintic `j=0,1` are primary candidates; the remaining tuples
are reserves within **this source queue only**. These 18/18 declarations do not
assign development, holdout, stress eligibility, or an optimization reserve to
any field, and do not replace existing reserved neighbors.
Do not extend this version's grid in response to observed costs or duplicate
fields. Structured coefficients are a declared family, not uniform random field
sampling; any later policy needs a separately reviewed version.

Each polynomial is monic; every nonleading coefficient is even and its constant
coefficient is two modulo four. Eisenstein at two proves irreducibility and the
stated degree. The quadratic radicand sign proves signatures `(2,0)` and `(0,1)`.
Its equation discriminant is minus four times the constant coefficient.

For the quintic, the derivative `5*x^4-a` has two real zeros `-c,c`, with
`c=(a/5)^(1/4)`. The local maximum is `b+4*a*c/5 > 0`. The checker proves the
exact integer inequality `4^4*a^5 > 5^5*b^4`, which implies the local minimum
`b-4*a*c/5 < 0`. Monotonicity on the three resulting intervals gives exactly
three real roots, hence signature `(3,1)` and unit rank three. The exact equation
discriminant is `5^5*b^4-4^4*a^5 < 0`.

The test independently recomputes real-root counts by rational Sturm sequences
and equation discriminants by the Sylvester determinant for all 36 polynomials,
following the existing generated-admission audit's elementary helper contracts.
These finite tests corroborate the formulas; they are not a formal proof checker
for arbitrary number-field claims or a new maximal-order algorithm.

## Data and admission boundary

Coefficients and equation discriminants are canonical decimal strings, including
values beyond JavaScript's exact-number range. The generator reuses
`rank_two_supplement.py`'s canonical JSON, integer grammar, and SHA-256 convention:
`generated-sha256-...` identifies the exact monic polynomial presentation under
`sagejs.monic-polynomial-coefficients.v1`, not a field isomorphism class. The new
export and policy schemas are `sagejs.stress-supplement.v1` and
`sagejs.stress-supplement-policy.v1`. The old rank-two schemas and output are
unchanged; neither checker silently imports or upgrades the other format.
The fixed export hash is
`56c7fbe15c5c3ce5fc373aaaa714061653e6080d356b6b0b31150d4cc7988d44`.

Field discriminant, equation-order index, field identity, class number/group,
regulator, GRH metadata, holdout/stress/unconditional eligibility and final corpus
role remain null. `qualification_evidence` and `stress_selection_frozen` are
false. An elementary polynomial certificate proves no complete class/unit group,
unconditional reference eligibility, regulator enclosure, or reference runtime.
Large coefficient height alone does not imply expensive arithmetic.

Before counting additional fields, separately budget exact maximal-order and
field-discriminant preparation. Check basis/discriminant and square-index
consistency, while distinguishing those identities from a proof of maximality.
Unequal verified field discriminants separate fields; equal degree/signature/D
buckets require exact isomorphism reconciliation against coverage, existing
reserves and other candidates, retaining maps for duplicates. Do not substitute
equation discriminants or coefficient hashes for that admission. Pin any reduced
presentation and exact transport; alternative presentations are robustness cases,
not extra votes.

Reference preparation, matched complete discovery, 100/200-bit requests, repeats,
minute-scale stress qualification and independent arithmetic replay remain
separate, unperformed steps. Preserve censored cases and existing proof/resource
caps. No acquisition, reference-worker/proof-policy change, corpus freeze,
selection/exposure update, or benchmark job is authorized by running this tool.
