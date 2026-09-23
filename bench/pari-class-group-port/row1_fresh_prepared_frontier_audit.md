# Row 1 fresh-prepared transaction

## Outcome

The authenticated row-1 prepared maximal order now reaches a replayed internal
class-and-unit result without retaining W0 as a runtime input. The live path is
one invocation with fresh private owners:

```text
prepared maximal order
  -> field-neutral cubic degree/descriptor catalog
  -> factor base and 58 principal relations
  -> relation HNF and analytic acceptance
  -> class number 3, invariant [3], exact regulator
  -> replayed 51-by-51 presentation and C3 generator/order witness
  -> two exact relation-product fundamental units, both norm +1
  -> exact real-cubic torsion
  -> branded upstream-assumed neutral result
```

The result deliberately records `complete=false` and
`pari-2.17.4-correspondence-complete-not-certified`. It is not the repository's
certified public class/unit contract. It makes no timing or reserve claim.

## Index-prime connector

The former obstruction was the equation-index divisor 3. The new
`resident_cubic_catalog.py` factors the already exercised row-6 maximal-order
splice into a field-neutral cubic dependency:

```text
ordinary primes -> pari_get_fs_small / pari_kummer_prime_decomposition
index primes    -> pari_prepared_index_prime_descriptors
                 -> residue degree from maximal-order image rank
                 -> descriptor insertion in the ordinary catalog order
```

For row 1 it computes, from prepared owners alone,

```text
p = 3, e = 3, f = 1
u = [0, 0, 1]
rank(P mod 3) = 2
```

including the exact antiuniformizer multiplication matrix. The resident
factor-base policy is `[259, 259, 51, 36, 36]`; the accepted computation has 58
relations and regulator

```text
[3895441961913051012156655978319959870688113589397982850906, 192, 17].
```

## Fresh postprocessing

`row1_fresh_class_unit_adapter.py` consumes the successful numeric owners
directly, while they remain private to the invocation. It independently:

- reconstructs every selected prime ideal and replays all 58 principal
  relations;
- reruns the translated relation-HNF/Smith presentation;
- derives the C3 generator and exact principal witness for its cube;
- reconstructs both fundamental units as exact products of the live principal
  relation generators and proves their norms;
- derives torsion and publishes a branded neutral envelope.

The large second unit is not copied from W0. Its exact arithmetic receipt is
`e386f24cecf914ca74716d6a6b6b462f6dfc6a80cda03e62890d562dc8acc314`,
matching the earlier detached panel-1 unit authority only as a cold regression.

`row1_fresh_prepared_transaction.cjs` is the standard module-local transaction
boundary. It validates the exact prepared authority, starts every mutable owner
below the entry, seals the presentation, class witness, units, regulator, and
torsion in `class_unit_correspondence_result.cjs`, independently replays that
payload, publishes a read-only content-addressed envelope, and returns a frozen
receipt branded by a private `WeakSet`. The verified
`ImmutableClassUnitCorrespondenceResult` is non-enumerable and cannot be
injected through the prepared input or request object.

## Reproduction

```sh
node bench/pari-class-group-port/check_row1_fresh_prepared_frontier.cjs \
  /scratch/sagejs-pari-development-panel-a998/panel-01-394cce5d99f0e9f8.json

node bench/pari-class-group-port/check_row1_resident_generated_class_attempt.cjs \
  /scratch/sagejs-pari-development-panel-a998/panel-01-394cce5d99f0e9f8.json

node bench/pari-class-group-port/check_row1_resident_native_candidate.cjs \
  /scratch/sagejs-pari-development-panel-a998/panel-01-394cce5d99f0e9f8.json

node bench/pari-class-group-port/check_row1_fresh_prepared_transaction.cjs \
  /scratch/sagejs-pari-development-panel-a998/panel-01-394cce5d99f0e9f8.json
```

The first check retains the historical `pari_get_fs_small == -3` control and
verifies the maximal-order descriptor. The second performs the genuine fresh
transaction, then opens retained W0 solely for cold differential assertions.
The third executes the same fresh class-candidate stage as one compiled GMP
native call, including the equation-index-prime branch. The final check proves
the standard immutable publication and anti-forgery boundary.
