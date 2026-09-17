# Field-3 compact unit-transform retention audit

## Scope

This lane closes the missing ancestry boundary between the 301 raw relation
columns in the live field-3 run and the 13 accepted terminal logarithm columns.
It does not reconstruct principal generators into final units.  It publishes
the exact column-major `301 x 13` integer transform needed by that later step.

The implementation follows the local column operations of PARI 2.17.4
`hnfspec_i`, `hnfadd_i`, and `hnffinal`.  It reverses the initial HNF stage and
three successful append stages from the terminal 13-column suffix.  The
producer retains the local `U`, `H`, dependent-row, trailing-`B`, diagonal,
input-permutation, and appended-relation owners before their scratch storage is
reused.  It never constructs a `301 x 301` transform.  The durable transform is
3913 integers; scratch is bounded by `301 x 13` plus the already-live local HNF
owners.

## Same-run authority

One invocation of `check_post_rnd_lie_iteration.cjs` now emits one post-gate
evidence object binding:

- all 301 exact raw relation columns and 301 principal generators;
- the source-introduction packed log column for every raw relation;
- the initial `hnfspec` ancestry and each successful `hnfadd` ancestry;
- the 301-by-13 retained transform;
- the terminal HNF state and its 13 accepted packed log columns.

Failed or unpublished append attempts are not added to the ancestry chain.  The
evidence object is emitted only after every exact identity and mutation gate
passes.  Cold immutable result-envelope publication remains composer work.

## Exact gates

The checker proves

```text
relationRecords (288 x 301) * T (301 x 13) == 0
```

entry by entry over the integers: all 3744 entries are zero.

Packed PARI reals round after each local product and sum.  Consequently, a
flat reassociation of `rawLogs * T` is not expected to be word-identical.  The
checker instead replays the exact source-order operation tree using the same-run
raw log columns and captured local owners.  It compares, bit for bit:

1. the initial `hnfspec` result `C`;
2. each append's joined-log input;
3. each append's post-transform/reduction `work_c`;
4. each append's published result `C`;
5. the terminal 13-column accepted `A` owner (273 packed words).

All comparisons pass.  This is stronger evidence for the packed computation
than a numerically close flat reassociation, while the integer transform remains
the exact algebraic ancestry used by relation and generator reconstruction.

## Transactionality and differential coverage

Independent in-process mutations of a raw relation, raw packed log, terminal
`A`, local transform, input permutation, and retained transform are rejected.
Output and state sentinels remain unchanged on validation failure.

The exact relation-kernel validator passes under CPython and the generated
JavaScript, GMP, and tagged backends.  The generated native core contains no
Python/V8 host call and is about 8.9 MiB in the recorded Linux-x64 runs.

## Reproduction

```bash
node bench/pari-class-group-port/check_field3_unit_transform_retention.cjs
```

The default command consumes the durable PARI 2.17.4, initial collector, and
analytic fixtures under `/scratch/sagejs-runtime/pari-class-group-e2e-20260917`.
Explicit paths may be supplied as the first four positional arguments.

The native differential build used about 1.2 GiB for the lane-local FLINT
toolchain and remained below the 4 GiB lane limit.
