# Frozen unequal-bound honesty scheduler

This lane connects the previously authenticated PARI 2.17.4 retry-ideal leaf
to the real Sage.js no-cache Fincke--Pohst collector. It completes the actual
failure path of `be_honest` for the predeclared field

```text
x^3 - 20018*x + 20034, C1=5, C2=31, setrand(1).
```

It does not modify the shared class-group driver or claim generic
`be_honest` support.

## Authorities

- PARI archive SHA-256:
  `02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53`.
- Pristine `src/basemath/buch2.c` SHA-256:
  `904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac`.
- The existing `honesty_branch_fixture.json` is rebuilt from instrumented
  pristine `be_honest` on every checker run before its data are consumed.
- A second pristine build exports the exact `FBgen(5,31)` backing factor-base
  schedule and the active factor descriptors. No collector decisions are
  exported from that boundary.

## Exact frozen control flow

PARI constructs the backing rational-prime sequence

```text
2, 3, 7, 11, 13, 17, 23, 29, 31
```

with `KC=3`, `KCZ=2`, and `KCZ2=9`. The scheduler first visits `iz=3`,
`p=7`. Its group has raw `J=2`; removing the final unramified ideal leaves
effective `J=1`, so this rational prime is skipped without changing `KCZ`.
At `iz=4`, `p=11`, raw and effective `J` are both 3 because the last ideal is
ramified. The frozen run selects `j=1`, whose HNF is

```text
[11,1,3; 0,1,0; 0,0,1]
```

and whose norm is 11.

That ideal and each subsequent randomized retry are sent to
`pari_collect_unreduced_ideal` with `nrelid=0`. Every probe receives freshly
reset preparation, enumeration, factoring, cursor, progress, and relation
owners. The result is computed by the translated no-cache collector, not read
from a Boolean fixture. CPython, JavaScript, native GMP, and native tagged
execution all independently return failure on all 51 probes with identical
collector counter transcripts.

After failures 1 through 50, the scheduler resets to `id0`, stages one exact
`random_bits(4)` draw, multiplies by the sole subfactor prime above 3, checks
the outer primitive-part and `idealred` predicates, then atomically publishes
RNG state, ideal, norm, and scheduler state. Failure 51 terminates immediately
without another draw. The result is failure, `KCZ=2`, 51 probes, and 50 draws.

## Transaction boundary

`pari_honesty_resume_frozen` copies the 66-word XORGEN4096 state into private
staging before drawing. Retry ideal arithmetic also targets private staging.
The public RNG, output ideal, and scheduler state are changed only after the
complete retry succeeds and both unimplemented generic predicates are proven
false. Descriptor errors, storage errors, divergent success, primitive-part
requirements, and `idealred` requirements fail without partial publication.

The scratch arrays are reusable workspace and are not transactional public
state. This agrees with PARI's reusable `FP_t` and factor scratch ownership.

## Why no mathematical branch is skipped in this case

- `lg(auts)-1=0`, so PARI sets `auts=NULL`; there is no orbit allocation,
  marking, or orbit skip. The scheduler validates this fact and freezes the
  actual `p=7` skip plus `p=11` selection schedule.
- Every retry has bottom-right HNF entry 1, so outer `Q_primpart` is never
  called.
- The largest retry determinant is 157,837,977, below `2^28`. A positive
  integral triangular HNF has top-left diagonal entry at most its determinant,
  hence `expi(id[1,1]) <= 27`, far below PARI's strict `>100` `idealred`
  threshold.
- Every actual probe fails. Consequently no earlier checked rational prime is
  completed, no transient `KCZ` increment occurs, and the immediate failure
  return leaves `KCZ=2`.

## Frozen fixture observables

`honesty_scheduler_fixture.json` retains or hashes:

- every outer factor-base group as `(iz,p,raw J,last e,effective J)`;
- the exact active factor product and backing factor base;
- 51 independently computed collector statuses;
- preparation, enumeration, factoring, and progress counters for all probes;
- every published scheduler state;
- final RNG, ideal, terminal state, probe count, and draw count.

The earlier fixture separately authenticates all 51 input ideals, norms,
four-bit exponents, and pristine PARI RNG checkpoints. Together the two
fixtures prevent replacing collector work with predeclared false values.

## Deliberate generic gaps

This is a complete scheduler only for the frozen all-failure case. The shared
driver must retain its existing honesty frontier until separate fixtures close:

1. nontrivial automorphism orbits and their equal-residue-degree search;
2. outer `Q_primpart` after products of multiple subfactor primes;
3. the full `idealred` path above the 100-bit threshold;
4. successful checked primes, transient `KCZ` increments, later failure after
   an increment, and all-success restoration to `KCZ0`;
5. arbitrary degrees, factor-base layouts, and subfactor counts.

In particular, the frozen scheduler rejects a successful probe rather than
silently extrapolating an unauthenticated continuation.
