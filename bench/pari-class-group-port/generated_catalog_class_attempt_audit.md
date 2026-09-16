# Generated catalogs to initial class candidate

This diagnostic composes the translated degree catalog, initial factor base,
selected Kummer decompositions, HNF/norm packet construction, valuation metadata,
bad-subfactor predicate, subfactor selection, analytic normalization and initial
class attempt. It is not a single closed native entry, a timing benchmark, an
honesty certificate, or a unit-map implementation.

## Input boundary

The old class fixture contributes buffer lengths, assertion-only final answers,
and precisely these value allowlists:

- Prepared nf: `admission_matrix_m/p/e`, `preparation_embedding`, and
  `preparation_rounded_embedding`. The latter is an nf embedding normalization,
  not an ideal reduction result; it remains explicitly prepared.
- Runtime: `admission_primes` and `admission_products`, the trial-division prime
  table and products. The checker independently reconstructs the complete prime
  list through 65537 before allowing it. Product values remain prepared runtime
  constants, not field-specific answers.

The Kummer fixture contributes only polynomial, integral-basis conversion
matrices, basis degrees/denominator, equation index and multiplication table.
Its factor, prime ideal, generator, tau, selected output and RNG answers are not
consumed. The analytic fixture supplies only discriminant, roots of unity and
scratch capacities. The field-0 degree/signature, 192-bit precision and source
runtime constants are explicit. This is prepared-nf input, not polynomial-only
input.

Every other mathematical buffer starts at zero, except the deliberately poisoned
inverse-hR and LOGD outputs. Initial relation/HNF/acceptance/publication states are
fresh. `additional=5+RU-1`, `target=KC+additional`, `nrelid=4`, and HNF `k0` comes
from the actual subfactor selector. Catalog primes through 10007 are generated
from the verified runtime list. Degree-pattern cache filling is eager diagnostic
setup rather than PARI's demand order. Actual selected descriptor prefixes are
generated with a resident seeded PARI RNG.

## Backend execution

CPython orchestration is shared by all backends. For JS/GMP a persistent Node
process executes each actual translated phase, returns mutated owners losslessly,
and these actual outputs feed subsequent phases. No CPython reference answers
are substituted. Host allocation, dynamic prefix slicing, serialization and
multiple native calls are explicit; they cannot support a single-kernel timing
claim. Source AST annotations distinguish exact and floating buffers despite
their CPython aliases. RPC child close/wait also runs after Python exceptions.

Qualification is deliberately limited to the fixed field-0 nongalois totally
real cubic, with two roots of unity. This does not implement an automorphism or
cyclotomic-unit prelude for arbitrary fields, retry dispatch, or the full honesty
verification branch. Equality of the initial KCZ/KCZ2 counters is asserted for
this fixture; it is not a general substitute for those omitted branches.

## Initial evidence and failures

CPython passed in `/tmp/sagejs-generated-catalog-class-4VLTWi/result.json`:
1230 primes, 1833 compact groups, 2270 distinct factors; C1=C2=333, KC=66,
48 requested decomposition calls, 66 descriptors, subfactor count 4, 73 relations.
The initial candidate has class number 1 and regulator triple
`[4510874135066530692003455889568986616389323011914280231659,192,20]`,
exactly matching the independent prior fixture. LOGD and inverse hR are rebuilt.

The first CP run failed because the diagnostic path shadowed stdlib decimal;
preloading decimal fixed this harness issue. The first JS run failed because
runtime aliases erased Float64Buffer's name; source-AST annotations fixed it.
That failed JS run did not wait for its RPC child, so its ledger child CPU is
incomplete. Retain a conservative 10 CPU-second unmetered allowance for that
6.712-second elapsed JS-only run; this is an allowance, not a measured ledger row.
Subsequent runs explicitly wait for the child. The outer metered `timeout`
must enclose the whole process group with the unchanged 4 GiB address-space cap.

Generated-JS phase replay passed in
`/tmp/sagejs-generated-catalog-class-WwjSG5/result.json`, with exactly the same
base, relation count, candidate and regulator. The whole diagnostic, including
source lowering and marshaling, used 60.678170 measured CPU seconds and peaked
at 1,023,704 KiB RSS. This is resource accounting, not kernel timing.

Final frozen GMP replay passed in
`/tmp/sagejs-generated-catalog-class-0i6gKg/result.json`, including every analytic
degree-pattern and selected source p/e/f/inert/tau comparison after calculation.
It used 63.819926 CPU seconds, peak 1,047,980 KiB. The earlier compilation run
`PRHn4A` also passed, using 318.118289 CPU seconds, peak 1,778,168 KiB.
The final checker SHA256 is
`5fdd3d06f063a8f8f77015cd6fdcf361d25237b3f638f465121454377d2ea1d6`.
Each native phase's core and loaded addon hashes are in the artifact's
`kernels.jsonl`. For the final analytic/class attempt:

- Core: `b1f45e5c19fa2d1f5b081cddccdfc90f8f30a6c5199b555b1950c3f52c4f48bf`.
- Loaded addon: `cd3d4c7427215e04d517767f6318a195ca6c6d99349616b3b915c33d07cae321`.

No limit increases or kernel mathematical changes were needed in this connector.

The same frozen checker also passed generated JS in
`/tmp/sagejs-generated-catalog-class-Tp0e4x/result.json`: 60.605021 CPU seconds,
peak 1,026,540 KiB. No live compilation/checker processes remain after handoff.

The initial CP/JS receipts were superseded by additional assertion-only checks
against all analytic patterns and selected source p/e/f/inert/tau arrays. Those
checks were replayed on the saved raw outputs successfully (0.171985 CPU seconds).
The final frozen checker must be used for the clean native receipt; an earlier
in-flight run's end-of-run file hash must not be mistaken for its loaded revision.

Active-agent time is reconstructed, not precisely metered: approximately 75
minutes for the preceding EDF task, 10 minutes for its outer-factor guard task,
30 minutes for degree catalog, and 45 minutes for this integration through the
initial JS qualification/backend review. Compilation waits are excluded. CPU
costs are separately recorded by the continuation ledger.
The eight direct checker runs total 506.015811 measured CPU seconds, plus the
0.171985-second saved-artifact verification and the explicit 10-second allowance
for the first failed RPC child. Final backend completion adds approximately
five active minutes to the 45-minute integration estimate (about 50 total).
