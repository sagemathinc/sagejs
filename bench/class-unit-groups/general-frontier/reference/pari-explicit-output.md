# PARI explicit compact screening output

`pari-screen.gp` emits `FRONTIER_RESULT|id|...` followed by
`FRONTIER_COMPACT_JSON|id|{...}` with schema
`sagejs-pari-frontier-screen-v2`. This replaces opaque native GP text for new
runs. Historical `FRONTIER_COMPACT` receipts remain legacy structural discovery,
even if their text resembles JSON; their normalized `exact_compact_output` is
false. The new tag never falls back to the old interpretation.

The JSON has fixed keys, canonical exact integer strings, and rational
coefficients spelled `p` or reduced `p/q` with positive denominator. Elements
are arrays in ascending powers of the input generator. Each outer entry of an
ideal basis is a basis element, not a matrix row: PARI HNF columns are converted
from `bnf.zk` coordinates through `nfbasistoalg`. A `POLMOD` whose modulus differs
from the input field is rejected before conversion, including constant residues.
Factored elements retain their factor order and signed exponents, omit zero
exponents, reject zero factors, and use `[]` for 1. The missing witness `[]~` is
not an identity. Neither unit nor principal generators are expanded by the worker.

For exported class generators `G[j]`, a decomposition has exactly
`coordinates` and `generator_product_witness`, with the equation

```text
I = (generator_product_witness) * product(G[j]^coordinates[j]).
```

This is the literal product, not a reduced class-map representative. PARI
`bnfisprincipal(...,4)` already supplies this witness; no extra principality
algorithm is introduced. Unlike Hecke v2, the PARI payload has no separate
`representative` diagnostic. Class-power witnesses retain **both** the multiplier
removed during extended ideal reduction and the reduced ideal's principal
witness. Dropping or inverting that multiplier changes the certified equation.

Class invariants, generators, coordinate columns, generator rows and power
witnesses retain PARI's native order (`pari-bnf.gen`, decreasing divisibility).
The normalized sorted invariant list remains only an abstract-group comparison;
`presentation_class_invariants` preserves the actual generator association.
Units are reordered from PARI's free-units-then-torsion list to torsion first.
Both unit rows and coordinate entries use the same permutation. This does not
identify the PARI and Hecke generator presentations.

The regulator is only a `working-precision-approximation`, under the unchanged
`conditional-grh` fundamental-unit policy. Requested precision, initial working
precision and stored value precision are distinct fields; exact scalar precision
is `null`. None is an accuracy bound or enclosure. There are no `lower`/`upper`
endpoints. The summary and JSON retain identical regulator text.

Each fresh iteration serializes its compact output before the existing timer
stops. Only the last result is retained: `retained_iteration=iterations` and
`batch_outputs_complete=(iterations == 1)`. New serialization cost belongs to
new runs; historical discovery times are not v2 measurements. This patch does
not supply whole-batch replay, matched sampling, independent completeness
certificates, regulator-request equivalence or M0/performance qualification.
Later per-engine batch counts must be separately predeclared; equal counts are
not necessary or implied.

The receiver uses only strict `json.loads`, rejecting duplicate keys, nonfinite
constants, unknown fields/versions, malformed exact leaves, wrong dimensions,
request/summary mismatches and inconsistent presentation ordering. Existing
response caps and process cleanup remain unchanged. These are structural checks,
not proofs of ideal closure/maximality or fundamental-unit completeness.
`bnfisunit` assumes membership for factored inputs; its coordinates alone do not
provide a membership certificate. No GP-text evaluation/parser is used.

## Focused validation

The default suite is offline and does not start a CAS:

```sh
python3 -B bench/class-unit-groups/general-frontier/reference/runner/test_pari_explicit_output.py
python3 -B -m unittest discover -s bench/class-unit-groups/general-frontier/reference/runner -p 'test_*.py'
python3 -B bench/class-unit-groups/general-frontier/reference/persistent/test_supervisor.py
```

An explicitly authorized local diagnostic uses the existing persistent `Worker`,
one GP process, an overall 180-second deadline (including five seconds reserved
for cleanup), a 256 MiB PARI stack cap, one PARI thread and the existing 32 MiB
response cap. It retains pinned inputs, startup, raw mathematical output,
strictly decoded output, generated exact-array replay requests and failures in
an immutable new directory. It requires an already provisioned GP executable;
it does not install software, build Sage.js, contact opt or mutate a ledger.

```sh
python3 -B bench/class-unit-groups/general-frontier/reference/runner/test_pari_explicit_output.py \
  --gp-diagnostic /absolute/path/to/gp --output /new/ignored/receipt-directory
```

The fixed toy fields are `x^2+4`, `x^2+21`, `x^2+39`, `x^3+14*x-1`, and `x^4+1`.
They exercise equation-order index two, fractional asymmetric ideal bases,
noncyclic and unequal class orders, nontrivial reduction-multiplier mutations,
torsion eight with a signed mixed unit coordinate, and empty rank-zero data.
Both 100/200-bit single iterations and a two-iteration scope marker are checked.
The same process replays decoded JSON exact ideal equations and generator
ordering. Expanded arithmetic is confined to these small test oracles, not the
timed producer. A diagnostic failure is retained, not silently replaced.

Primary PARI contracts: installed `usersch3.tex` sections `bnfisprincipal`,
`bnfunits`, `bnfisunit`, `idealpow`, `idealhnf`, `nfbasistoalg`, and `bitprecision`;
`usersch1.tex` documents the modulus as the first POLMOD component. These
establish the encoding conventions, not an independent completeness certificate.
