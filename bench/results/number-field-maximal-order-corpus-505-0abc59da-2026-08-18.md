# Current-head maximal-order corpus report

This is a consolidated correctness/resource report over all 505 checked
maximal-order cases. It preserves one uniform public Sage.js row for every
standard case, one explicitly scoped structural/oracle row for every opt-in
stress case, every fresh-worker prime/recovery, and every longer diagnostic.
The JSON companion retains the returned bases, raw samples and stage maps,
verification checks, RSS observations, and all terminal states.

## Identity and policy

- Measured Sage.js commit: `0abc59da72b735bbb4d90a03f980e3ffafde7b09`
- Git tree: `d8afd700931b9a8cb4ddd89c8d2364e0407404fd`
- Run: 2026-08-18 05:40:29--06:21:25 UTC (40 minutes 56 seconds)
- Host/OS: `project-52d00914-04c1-4c7a-83d6-69240c2570f1`; Linux
  6.17.0-1022-gcp, x64, AMD EPYC 7B13, 16 logical CPUs
- Node: v26.7.0
- Corpus: 505 cases (489 standard, 16 stress), manifest digest
  `e6bf006b01c7cd47d6b0f7fc70db142d85b725ad8d45aeee38aa7775a55b3c07`,
  byte SHA-256
  `695152efb47b614b15f08a140f7f65d11c32d997588c8ccd6f7962f2f025f52f`
- FLINT addon SHA-256:
  `f6017e952166adfe0cb87b26e467902dbb607989908d434bdfb70562240cfb1d`
- Production-native registry SHA-256:
  `63020b64e01983bfa62dcc18b5859503044465ba0f8d4c5ceb560e9cb59ea380`
- Compiled kernel runtime SHA-256:
  `e05b672aa291dc086cce82d9f9bd5d5382febee11c7f51f185f6ca40b63525ee`
- Report JSON SHA-256:
  `c3cf0ccd85771ae2a364f2f1776827e751580fa309b7956ce236c05071dbad04`
- Canonical report-payload SHA-256:
  `4dd3a1b6702bbf4d55107b729bd00d63c06fba68a9f50952243d811ebee21d03`

Every standard row uses a fresh field in the public
`NumberField.maximal_order()` boundary, zero per-case warmups, one retained
sample, and a 5,000 ms request bound. A timeout kills and fully reaps the
worker process group. Each newly spawned worker is primed with the motivating
degree-7 case under a separate 30,000 ms recovery bound before the next
uniform row. All 23 prime/recovery rows completed and independently verified;
their public timing was 195.125--339.902 ms with a 233.999 ms median. They are
excluded from uniform results.

The host briefly ran a competing native/build chain during the named-case
tail, approximately 05:51--06:04 UTC. Exact verification is unaffected, but
tail timings should be treated as correctness/resource observations rather
than uncontended benchmark measurements.

## Uniform standard outcome

- Independently verified exact lattices: **477/489**
- Preserved 5-second timeouts: **11**
- Frozen-certificate mismatches: **1**
- Independently wrong lattices after adjudication: **0**
- Disagreement/crash/unavailable/unsupported: **0**
- Successful median / p90 / maximum: **202.241 / 1,351.272 / 4,437.309 ms**
- Timing buckets below 100, 100--500, 500--1,000, 1,000--3,000, and
  3,000--5,000 ms: **54 / 284 / 51 / 80 / 8**

Uniform timeout IDs, preserved exactly:

`pari-round4-vector-010`, `pari-round4-vector-139`,
`pari-round4-vector-420`, `pari-round4-vector-422`,
`pari-round4-vector-429`, `regression-x64-plus-2pow16`,
`regression-degree-24`, `pari-2011`,
`pari-large-prime-quadratic-compositum`, `hecke-degree-90`, and
`hecke-precision-degree-12`.

The largest accumulated exposed stages among the 477 accepted rows were
global certification (83,014.828 ms), discriminant decomposition
(69,711.734 ms), native local orders (50,381.083 ms), component-factorization
fallback (13,901.384 ms), arbitrary-prime local orders (12,603.468 ms), and
composite local order (10,362.639 ms). These totals come from raw trace events;
overlapping/nested stages must not be added to obtain a public wall time.

## Addprimes frozen-certificate defect

The immutable uniform row for `addprimes-degree-7` is `invalid` because the
returned result disagrees with the frozen corpus certificate. This is a corpus
defect, not a wrong Sage.js lattice.

The ascending coefficient vector is
`[63119721602, 606920400, 223654496, 2150524, 264160, 2540, 104, 1]` and its
polynomial digest is
`292e0c89d6d156d761340cd94583842bcfc58fcd1720ab56f7075f9884e1a985`.
The frozen certificate claims field discriminant
`-57367204142537948534034695689203397328832`, equation-order index `3`, and
basis digest
`a5bfe06e8803c404bc582ea2562f17b715d78aac83749d880f561dffbca767d3`.
Sage.js returned field discriminant `-1654803061237150235374988302272`, index
`558573`, and basis digest
`8fb192c7a7e9aade6fef4192eff1ae429b33be25f1a5462924e34e725bc9877b`.

The independent checker proved that returned lattice nonsingular, contains
`1`, contains the equation order, is closed under multiplication, and obeys
the exact discriminant/index identity. A separate GP/PARI 2.17.3 `nfbasis`
call under a 5,000 ms bound completed in 4 ms (7.732 ms request wall) and
returned exactly the Sage.js discriminant, index, and canonical basis digest.
The Sage.js public sample was 240.337 ms (421.406 ms request wall), including
150.590 ms discriminant decomposition, 37.978 ms component-factorization
fallback, 13.075 ms native local orders, 4.104 ms composite local order,
23.145 ms global certification, and 1.709 ms public materialization.

## Separate 30-second diagnostics

Every uniform timeout received one separate, fresh-worker, 30,000 ms
diagnostic. These rows never replace or relabel the uniform result.

| Case | Diagnostic state | Public time (ms) |
| --- | --- | ---: |
| `pari-round4-vector-010` | timeout | -- |
| `pari-round4-vector-139` | verified `ok` | 1,639.123 |
| `pari-round4-vector-420` | verified `ok` | 5,446.118 |
| `pari-round4-vector-422` | verified `ok` | 4,825.562 |
| `pari-round4-vector-429` | timeout | -- |
| `regression-x64-plus-2pow16` | timeout | -- |
| `regression-degree-24` | verified `ok` | 16,716.459 |
| `pari-2011` | verified `ok` | 13,319.533 |
| `pari-large-prime-quadratic-compositum` | timeout | -- |
| `hecke-degree-90` | timeout | -- |
| `hecke-precision-degree-12` | verified `ok` | 11,349.481 |

Thus six uniform timeouts recovered and verified under the longer diagnostic
bound; five remained timeouts. The 5-second accounting remains 11 timeouts.

## Opt-in stress scope

All 16 stress cases are recorded as `bounded-structural-oracle` rows:

`regression-degree-72`, `pure-bad-generator-n32-c2pow32`,
`pure-bad-generator-n48-c1009`, `pure-bad-generator-n96-c1009`,
`pure-bad-generator-n32-c2pow128`, `pure-bad-generator-n112-c1009`,
`pure-bad-generator-n128-c1009`, `pure-bad-generator-n144-c1009`,
`pure-bad-generator-n160-c1009`, `pure-bad-generator-n32-c2pow512`,
`pure-bad-generator-n32-c2pow2048`, `scaled-generator-wild-p2-n16`,
`scaled-generator-wild-p2-n32`, `scaled-generator-wild-p2-n64`,
`scaled-generator-many-prime-n16`, and
`scaled-generator-many-prime-n32`.

For each row the report verifies the normalized polynomial and domain-separated
digest, coefficient height, exact discriminant/index identity, exact local
component product, digest-only basis certificate, and recorded bounded oracle
evidence. Public Sage.js execution is intentionally not run: all 16 large HNF
numerators are stored digest-only, so this report does not claim a current
Sage.js lattice, independently recomputed containment, or multiplication
closure for the stress tier.

The corpus source classes remain 477 PARI Round-4 cases, six Hecke cases, four
existing Sage.js/Sage cases, and 18 generated hard-family cases. They are
implementation provenance classes, not independent mathematical votes.

## Later fixture-only delta

Commit `3ecf3eb81cc012f4cf3618230c2b1f14bbb3003e` landed after the run began. It
promotes Round4 vector 010 to an exact primary fixture and changes only its task
contract, fixture, and test. It does not change the engine or arithmetic
measured at `0abc59da`, so this sweep was correctly not restarted.
